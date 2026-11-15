// Creates fixtures only in an EMPTY loopback database; no external provider calls.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import mysql from 'mysql2/promise';

const env = { ...process.env, ADMIN_EMAIL: 'owner@example.invalid', ADMIN_AUTH_SECRET: randomUUID(),
  RESEND_FROM_EMAIL: 'digimium@example.invalid', RESEND_API_KEY: 're_integration_fixture', TELEGRAM_BOT_TOKEN: '', TELEGRAM_BOT_USERNAME: '', TELEGRAM_WEBHOOK_SECRET: '' };
const base = new URL(env.APP_ORIGIN);
assert.ok(base.origin === env.APP_ORIGIN && base.protocol === 'http:' && base.hostname === '127.0.0.1' && base.port &&
  env.DB_HOST === '127.0.0.1' && /^digimium_test_[a-z0-9_]+$/.test(env.DB_NAME) && env.DB_USER && env.DB_PASSWORD,
  'Use a disposable loopback database called digimium_test_* and unused loopback HTTP port.');
const root = new URL('../', import.meta.url);
const db = await mysql.createConnection({ host: env.DB_HOST, port: Number(env.DB_PORT || 3306), user: env.DB_USER,
  password: env.DB_PASSWORD, database: env.DB_NAME, multipleStatements: true });
let server;
const request = (path, options = {}) => fetch(new URL(path, base), { ...options, redirect: 'manual', signal: AbortSignal.timeout(15000) });
const get = (path, cookie = '') => request(path, { headers: { Cookie: cookie } });
const mutate = (path, method, body, cookie = '', origin = base.origin) => request(path, {
  method, headers: { Origin: origin, Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});
async function json(response, status = 200) {
  assert.equal(response.status, status, 'Unexpected HTTP status at ' + new URL(response.url).pathname);
  assert.match(response.headers.get('cache-control') || '', /no-store/);
  assert.match(response.headers.get('vary') || '', /cookie/i);
  return response.json();
}
function cookie(response, name) {
  const raw = response.headers.getSetCookie().find(value => value.startsWith(name + '='));
  assert.match(raw ?? '', /httponly/i);
  return raw.split(';')[0];
}
async function register(name) {
  const response = await mutate('/api/customer/session', 'POST', { action: 'register', name, email: name.toLowerCase() + '@example.invalid', password: randomUUID() });
  const session = cookie(response, 'digimium_local_customer');
  const { customer } = await json(response, 201);
  return { ...customer, cookie: session };
}
const publicPath = '/api/giveaway', adminPath = '/api/admin/giveaway';

try {
  const [tables] = await db.query('SHOW TABLES');
  assert.equal(tables.length, 0, 'Refusing mutations in a nonempty database.');
  const probe = createServer();
  await new Promise((resolve, reject) => probe.once('error', reject).listen(Number(base.port), base.hostname, resolve));
  await new Promise(resolve => probe.close(resolve));
  await db.query(await readFile(new URL('hostinger/schema.sql', root), 'utf8'));
  server = spawn(process.execPath, ['--import', new URL('tests/fixtures/resend-fetch.mjs', root).href, fileURLToPath(new URL('.next/standalone/server.js', root))], {
    cwd: fileURLToPath(root), env: { ...env, FIXTURE_MAIL_FAILURE: '0', NODE_ENV: 'production', HOSTNAME: base.hostname, PORT: base.port }, stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
  });
  for (let attempt = 0; ; attempt++) {
    try { assert.equal((await request('/admin/login')).status, 200); break; }
    catch (error) { if (attempt > 120 || server.exitCode !== null || !['ECONNREFUSED', 'UND_ERR_SOCKET'].includes(error.cause?.code)) throw error; await delay(100); }
  }
  const draft = await json(await get(publicPath));
  assert.equal(draft.campaign.status, 'draft');
  assert.equal(draft.campaign.launchedAt, null);
  assert.equal(draft.viewer.reason, 'sign_in');
  assert.equal((await json(await get(publicPath))).campaign.id, draft.campaign.id, 'Draft campaign ID persists');
  assert.deepEqual(draft.campaign.prizes.map(prize => prize.winners), [2, 3, 1]);
  assert.equal(draft.entries, undefined); assert.equal(draft.entryCount, undefined);
  assert.equal((await get(adminPath)).status, 401);
  const join = (customer, campaignId = draft.campaign.id, origin = base.origin) => mutate(publicPath, 'POST', { campaignId }, customer?.cookie || '', origin);
  assert.equal((await join(null)).status, 401);
  assert.equal((await join(null, draft.campaign.id, 'https://foreign.invalid')).status, 403);
  const alice = await register('GiveawayAlice'), bob = await register('GiveawayBob'), charlie = await register('GiveawayCharlie'), dave = await register('GiveawayDave');
  assert.equal((await join(alice)).status, 403, 'Unlinked customers cannot join');
  assert.equal((await get(adminPath, alice.cookie)).status, 401);
  assert.equal((await json(await get(publicPath, alice.cookie))).viewer.reason, 'link_telegram');
  const people = [alice, bob, charlie, dave];
  for (const [index, person] of people.entries()) await db.execute('INSERT INTO digimium_telegram_identities (telegram_id, customer_id, username, created_at) VALUES (?, ?, ?, UTC_TIMESTAMP(3))', ['91000000000000' + (index + 1), person.id, 'giveaway_fixture_' + index]);
  assert.equal((await join(alice)).status, 409, 'Draft entries remain closed even with verified Telegram');
  assert.equal((await join(alice, randomUUID())).status, 409);
  assert.equal((await mutate(publicPath, 'POST', { campaignId: draft.campaign.id, customerId: bob.id }, alice.cookie)).status, 400);

  const mail = once(server, 'message', { signal: AbortSignal.timeout(10000) });
  const login = (fields, session = '') => request('/admin/session', { method: 'POST', headers: { Origin: base.origin, Cookie: session }, body: new URLSearchParams(fields) });
  const challenge = await login({ action: 'request', email: env.ADMIN_EMAIL });
  const [message] = await mail;
  assert.equal(message.type, 'otp-mail');
  const owner = cookie(await login({ action: 'verify', code: message.code }, cookie(challenge, 'digimium_local_challenge')), 'digimium_local_admin');
  let admin = await json(await get(adminPath, owner));
  const at = delta => new Date(Date.now() + delta).toISOString();
  let start = at(3600000), end = at(7200000);
  const update = (action, startsAt = start, endsAt = end, revision = admin.campaign.revision, origin = base.origin) => mutate(adminPath, 'PATCH', { action, startsAt, endsAt, revision }, owner, origin);
  assert.equal((await update('save', start, end, admin.campaign.revision, 'https://foreign.invalid')).status, 403);
  assert.equal((await mutate(adminPath, 'PATCH', { action: 'save', startsAt: start, endsAt: end, revision: admin.campaign.revision })).status, 401);
  assert.equal((await update('launch', null, null)).status, 400);
  assert.equal((await update('launch', end, start)).status, 400);
  admin = await json(await update('save'));
  assert.equal(admin.campaign.status, 'draft');
  assert.equal((await join(alice)).status, 409);
  assert.equal((await update('launch', start, end, admin.campaign.revision - 1)).status, 409);
  admin = await json(await update('launch'));
  assert.equal(admin.campaign.status, 'scheduled');
  assert.equal((await join(alice)).status, 409);
  start = at(-3600000); end = at(3600000);
  admin = await json(await update('save'));
  assert.equal(admin.campaign.status, 'open');
  assert.ok(admin.campaign.launchedAt);
  const attempts = await Promise.all(Array.from({ length: 4 }, () => join(alice)));
  assert.deepEqual(attempts.map(response => response.status).sort(), [200, 200, 200, 201]);
  for (const response of attempts) assert.equal((await response.json()).viewer.joined, true);
  admin = await json(await get(adminPath, owner));
  assert.equal(admin.entryCount, 1);
  assert.equal(admin.entries[0].customerId, alice.id);
  assert.equal(admin.entries[0].email, alice.email);
  assert.equal(admin.entries[0].telegramId, '910000000000001');
  const firstEntry = admin.entries[0].id;
  const publicAlice = await json(await get(publicPath, alice.cookie));
  assert.equal(publicAlice.viewer.joined, true); assert.equal(publicAlice.viewer.canJoin, false);
  const publicText = JSON.stringify(publicAlice);
  for (const privateValue of [alice.name, alice.email, alice.id, '910000000000001', 'giveaway_fixture_0']) assert.ok(!publicText.includes(privateValue), 'Public response excludes participant data');
  await json(await join(bob), 201);
  admin = await json(await update('save'));
  assert.equal(admin.entryCount, 2);
  assert.ok(admin.entries.some(entry => entry.id === firstEntry));
  assert.equal((await update('save', null, null)).status, 400, 'Launched campaign cannot reset to draft');
  assert.equal((await update('launch')).status, 409, 'Launch does not create another campaign');

  // A later verified identity move cannot create another entry or transfer the original entry ownership.
  await db.execute('DELETE FROM digimium_telegram_identities WHERE customer_id = ?', [charlie.id]);
  await db.execute('UPDATE digimium_telegram_identities SET customer_id = ? WHERE customer_id = ?', [charlie.id, alice.id]);
  assert.equal((await json(await get(publicPath, charlie.cookie))).viewer.joined, true);
  await json(await join(charlie));
  admin = await json(await get(adminPath, owner));
  assert.equal(admin.entryCount, 2);
  assert.equal(admin.entries.find(entry => entry.id === firstEntry).customerId, alice.id);
  assert.equal((await join(alice)).status, 403, 'Eligibility is rechecked after unlink');
  start = at(-7200000); end = at(-3600000);
  admin = await json(await update('save'));
  assert.equal(admin.campaign.status, 'ended');
  assert.equal((await join(dave)).status, 409, 'New entries close exactly after the window');
  assert.equal((await json(await join(bob))).viewer.joined, true, 'A delivered retry is idempotent after the window');
  assert.equal((await get(adminPath + '?page=0', owner)).status, 400);

  // Private review remains complete through pagination; the public DTO still has no participant list/count.
  for (let index = 0; index < 100; index++) {
    const customerId = randomUUID();
    await db.execute('INSERT INTO digimium_customers (id, name, email, password_hash, created_at) VALUES (?, ?, NULL, NULL, UTC_TIMESTAMP(3))', [customerId, 'Pagination ' + index]);
    await db.execute(`INSERT INTO digimium_giveaway_entries (id, campaign_id, customer_id, telegram_id, customer_name, joined_at) VALUES (?, ?, ?, ?, ?, UTC_TIMESTAMP(3))`, [randomUUID(), draft.campaign.id, customerId, '92000000000' + index, 'Pagination ' + index]);
  }
  const pageOne = await json(await get(adminPath, owner)), pageTwo = await json(await get(adminPath + '?page=2', owner));
  assert.equal(pageOne.entryCount, 102); assert.equal(pageOne.entries.length, 100); assert.equal(pageTwo.entries.length, 2);
  assert.equal(new Set([...pageOne.entries, ...pageTwo.entries].map(entry => entry.id)).size, 102);
  const finalPublic = await json(await get(publicPath));
  assert.equal(finalPublic.entries, undefined); assert.equal(finalPublic.entryCount, undefined);
  console.log('Giveaway integration passed: draft/launch/window, auth/origin/link eligibility, concurrent deduplication, immutable ownership, privacy and private pagination.');
} finally {
  if (server && server.exitCode === null && !server.signalCode) {
    const exited = once(server, 'exit'); server.kill('SIGTERM');
    const deadline = setTimeout(() => server.kill('SIGKILL'), 8000);
    try { await exited; } finally { clearTimeout(deadline); }
  }
  await db.end();
}
