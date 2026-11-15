// Mutation fixtures are permitted only in an EMPTY disposable loopback database.
// Run after npm run build; fake Resend refuses every other external provider call.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createCipheriv, createHash, createHmac, randomBytes, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import mysql from 'mysql2/promise';

const env = { ...process.env, ADMIN_EMAIL: 'owner@example.invalid', ADMIN_AUTH_SECRET: randomUUID(),
  ORDER_FULFILLMENT_SECRET: randomUUID(), RESEND_FROM_EMAIL: 'digimium@example.invalid', RESEND_API_KEY: 're_integration_fixture',
  GOOGLE_CLIENT_ID: 'fixture-customer-admin.apps.googleusercontent.com', GOOGLE_CLIENT_SECRET: 'fixture-only-google-secret',
  TELEGRAM_BOT_TOKEN: '', TELEGRAM_BOT_USERNAME: '', TELEGRAM_WEBHOOK_SECRET: '' };
const base = new URL(env.APP_ORIGIN);
assert.ok(base.origin === env.APP_ORIGIN && base.protocol === 'http:' && base.hostname === '127.0.0.1' && base.port &&
  env.DB_HOST === '127.0.0.1' && /^digimium_test_[a-z0-9_]+$/.test(env.DB_NAME) && env.DB_USER && env.DB_PASSWORD,
  'Use an empty disposable loopback digimium_test_* database and unused loopback HTTP port.');
const root = new URL('../', import.meta.url);
const db = await mysql.createConnection({ host: env.DB_HOST, port: Number(env.DB_PORT || 3306), user: env.DB_USER,
  password: env.DB_PASSWORD, database: env.DB_NAME, multipleStatements: true });
let server;
const hash = value => createHash('sha256').update(value).digest();
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
const path = id => '/api/admin/customers/' + id;
const envelope = (value, key, aad) => {
  const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(aad));
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]);
};

async function addCustomer(name, password = true) {
  const id = randomUUID(), token = randomBytes(32).toString('base64url');
  const email = password ? name.toLowerCase() + '@example.invalid' : null;
  await db.execute('INSERT INTO digimium_customers (id, name, email, password_hash, created_at) VALUES (?, ?, ?, ?, UTC_TIMESTAMP(3))',
    [id, name, email, password ? 'fixture-preserved-hash-' + randomUUID() : null]);
  await db.execute('INSERT INTO digimium_customer_sessions (token_hash, customer_id, expires_at) VALUES (?, ?, DATE_ADD(UTC_TIMESTAMP(), INTERVAL 1 HOUR))', [hash(token), id]);
  return { id, name, email, cookie: 'digimium_local_customer=' + token };
}

async function addOrder(customerId, approved = false, guestKey = null) {
  const id = randomUUID(), lineId = randomUUID();
  const lines = [{ id: lineId, productId: 'chatgpt', productName: 'Fixture plan', planId: 'monthly', planName: 'Monthly',
    price: '16,000 MMK', duration: '1 month', quantity: 1 }];
  const fulfillment = approved ? envelope([{ id: lineId, startDate: '2028-01-01', endDate: '2028-02-01',
    accountInfo: '', accountDetails: { account: 'private-fixture-account', password: 'private-fixture-password', manager: '', username: '' } }],
  createHmac('sha256', env.ORDER_FULFILLMENT_SECRET).update('digimium/order-fulfillment/v1').digest(), id + '/' + (customerId || 'guest:' + guestKey.toString('hex'))).toString('base64') : null;
  await db.execute(`INSERT INTO digimium_orders
    (id, customer_id, guest_key, guest_name, request_id, request_hash, created_at, approved_at, snapshot, fulfillment)
    VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?, ?)`,
  [id, customerId, guestKey, randomUUID(), randomBytes(32), '2028-01-01T00:00:00.000Z', approved ? '2028-01-01T01:00:00.000Z' : null,
    JSON.stringify({ lines, totalMmk: 16000 }), fulfillment]);
  return id;
}

async function addTelegramChallenge(flow) {
  const idHash = randomBytes(32), key = createHmac('sha256', env.ADMIN_AUTH_SECRET).update('digimium/telegram-auth/v1\n' + base.origin).digest();
  const payload = envelope(flow, key, 'challenge:' + idHash.toString('base64url')).toString('base64url');
  await db.execute("INSERT INTO digimium_telegram_auth_challenges (id_hash, browser_hash, stage, payload, expires_at) VALUES (?, ?, 'waiting', ?, DATE_ADD(UTC_TIMESTAMP(), INTERVAL 300 SECOND))",
    [idHash, randomBytes(32), payload]);
  return idHash;
}

async function ownRows(id) {
  const result = {};
  for (const [table, order] of [['digimium_customers', 'id'], ['digimium_customer_sessions', 'token_hash'],
    ['digimium_google_identities', 'google_sub'], ['digimium_telegram_identities', 'telegram_id'],
    ['digimium_orders', 'id'], ['digimium_giveaway_entries', 'id']]) {
    result[table] = (await db.execute(`SELECT * FROM ${table} WHERE ${table === 'digimium_customers' ? 'id' : 'customer_id'} = ? ORDER BY ${order}`, [id]))[0];
  }
  return JSON.stringify(result);
}
async function challengeRows() {
  return JSON.stringify((await db.query('SELECT * FROM digimium_telegram_auth_challenges ORDER BY id_hash'))[0]);
}

try {
  assert.equal((await db.query('SHOW TABLES'))[0].length, 0, 'Refusing to mutate a nonempty database.');
  const probe = createServer();
  await new Promise((resolve, reject) => probe.once('error', reject).listen(Number(base.port), base.hostname, resolve));
  await new Promise(resolve => probe.close(resolve));
  for (const file of ['schema.sql', 'customer-auth-schema.sql', 'order-schema.sql', 'google-identity-schema.sql',
    'telegram-identity-schema.sql', 'google-auth-schema.sql', 'telegram-auth-schema.sql', 'giveaway-schema.sql']) {
    await db.query(await readFile(new URL('hostinger/' + file, root), 'utf8'));
  }
  server = spawn(process.execPath, ['--import', new URL('tests/fixtures/resend-fetch.mjs', root).href,
    fileURLToPath(new URL('.next/standalone/server.js', root))], {
    cwd: fileURLToPath(root), env: { ...env, FIXTURE_MAIL_FAILURE: '0', NODE_ENV: 'production', HOSTNAME: base.hostname, PORT: base.port },
    stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
  });
  for (let attempt = 0; ; attempt++) {
    try { assert.equal((await request('/admin/login')).status, 200); break; }
    catch (error) {
      if (attempt > 120 || server.exitCode !== null || !['ECONNREFUSED', 'UND_ERR_SOCKET'].includes(error.cause?.code)) throw error;
      await delay(100);
    }
  }
  const alice = await addCustomer('RemoveFixture'), bob = await addCustomer('PreserveFixture');
  const aliceTelegram = '998800000001', bobTelegram = '998800000002';
  for (const [person, telegramId] of [[alice, aliceTelegram], [bob, bobTelegram]]) {
    await db.execute('INSERT INTO digimium_google_identities (google_sub, customer_id, created_at) VALUES (?, ?, UTC_TIMESTAMP(3))', ['fixture-google-' + person.id, person.id]);
    await db.execute('INSERT INTO digimium_telegram_identities (telegram_id, customer_id, username, created_at) VALUES (?, ?, ?, UTC_TIMESTAMP(3))',
      [telegramId, person.id, person.name.toLowerCase()]);
  }
  const campaignId = randomUUID();
  await db.execute('INSERT INTO digimium_giveaway_campaigns (id, slot, created_at, updated_at) VALUES (?, 1, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))', [campaignId]);
  for (const [person, telegramId] of [[alice, aliceTelegram], [bob, bobTelegram]]) {
    await db.execute(`INSERT INTO digimium_giveaway_entries
      (id, campaign_id, customer_id, telegram_id, customer_name, customer_email, joined_at) VALUES (?, ?, ?, ?, ?, ?, UTC_TIMESTAMP(3))`,
    [randomUUID(), campaignId, person.id, telegramId, person.name, person.email]);
  }
  const alicePending = await addOrder(alice.id), aliceApproved = await addOrder(alice.id, true);
  await addOrder(bob.id, true);
  const guestId = await addOrder(null, false, randomBytes(32));
  const ownedLink = await addTelegramChallenge({ purpose: 'link', link: { customerId: alice.id, sessionHash: randomBytes(32).toString('hex') } });
  const ownedLogin = await addTelegramChallenge({ purpose: 'login', identity: { id: aliceTelegram, firstName: alice.name } });
  const otherLink = await addTelegramChallenge({ purpose: 'link', link: { customerId: bob.id, sessionHash: randomBytes(32).toString('hex') }, identity: { id: aliceTelegram } });
  const otherLogin = await addTelegramChallenge({ identity: { id: bobTelegram, firstName: bob.name } });
  const unbound = randomBytes(32);
  await db.execute("INSERT INTO digimium_telegram_auth_challenges (id_hash, browser_hash, stage, payload, expires_at) VALUES (?, ?, 'waiting', 'unrecognized-envelope', DATE_ADD(UTC_TIMESTAMP(), INTERVAL 300 SECOND))", [unbound, randomBytes(32)]);

  const googleKey = createHmac('sha256', env.ADMIN_AUTH_SECRET).update('digimium/google-auth/v1\n' + base.origin).digest();
  const googleFlow = randomBytes(32).toString('base64url'), googleBrowser = randomBytes(32).toString('base64url');
  const googlePayload = envelope({ returnTo: 'account', identity: { sub: 'fixture-google-' + alice.id, email: 'updated-customer@example.invalid' } },
    googleKey, 'challenge:' + googleFlow).toString('base64url');
  await db.execute("INSERT INTO digimium_google_auth_challenges (id_hash, browser_hash, stage, payload, expires_at) VALUES (?, ?, 'link', ?, DATE_ADD(UTC_TIMESTAMP(), INTERVAL 300 SECOND))",
    [hash(googleFlow), hash(googleBrowser), googlePayload]);
  const otherGoogle = randomBytes(32);
  await db.execute("INSERT INTO digimium_google_auth_challenges (id_hash, browser_hash, stage, payload, expires_at) VALUES (?, ?, 'oauth', 'unowned-other-google-flow', DATE_ADD(UTC_TIMESTAMP(), INTERVAL 300 SECOND))", [otherGoogle, randomBytes(32)]);
  const googleBefore = JSON.stringify((await db.query('SELECT * FROM digimium_google_auth_challenges ORDER BY id_hash'))[0]);
  const preservedBefore = await ownRows(bob.id);
  const guestBefore = JSON.stringify((await db.execute('SELECT * FROM digimium_orders WHERE id = ?', [guestId]))[0]);

  await json(await get(path(alice.id)), 401);
  await json(await get(path(alice.id), alice.cookie), 401);
  await json(await mutate(path(alice.id), 'PATCH', {}, alice.cookie), 401);
  await json(await mutate(path(alice.id), 'DELETE', {}, bob.cookie), 401);
  const mail = once(server, 'message', { signal: AbortSignal.timeout(10000) });
  const login = (fields, session = '') => request('/admin/session', { method: 'POST',
    headers: { Origin: base.origin, Cookie: session }, body: new URLSearchParams(fields) });
  const challenge = await login({ action: 'request', email: env.ADMIN_EMAIL });
  const [message] = await mail;
  assert.equal(message.type, 'otp-mail');
  const owner = cookie(await login({ action: 'verify', code: message.code }, cookie(challenge, 'digimium_local_challenge')), 'digimium_local_admin');
  const read = id => get(path(id), owner).then(response => json(response));
  let record = await read(alice.id);
  assert.deepEqual(Object.keys(record).sort(), ['customer', 'summary', 'version']);
  assert.match(record.version, /^[a-f0-9]{64}$/);
  assert.deepEqual(record.summary, { orders: 2, pending: 1, approved: 1, giveawayEntries: 1 });
  assert.deepEqual(record.customer.signInMethods, { emailPassword: true, google: true, telegram: true });
  assert.equal(record.customer.telegram.id, aliceTelegram);
  assert.ok(!JSON.stringify(record).includes('private-fixture-password'));
  assert.ok(!JSON.stringify(record).includes('fixture-preserved-hash'));
  assert.equal((await read(alice.id)).version, record.version, 'A read does not change the concurrency version');
  const edit = (body, origin = base.origin) => mutate(path(alice.id), 'PATCH', body, owner, origin);
  const remove = (body, origin = base.origin) => mutate(path(alice.id), 'DELETE', body, owner, origin);
  const fields = () => ({ version: record.version, name: record.customer.name, email: record.customer.email });
  await json(await edit(fields(), 'https://foreign.invalid'), 403);
  await json(await remove({ version: record.version, confirmation: alice.id }, 'https://foreign.invalid'), 403);
  await json(await request(path(alice.id), { headers: { Cookie: owner, Origin: 'https://foreign.invalid' } }), 403);
  await json(await request(path(alice.id), { headers: { Cookie: owner, 'Sec-Fetch-Site': 'cross-site' } }), 403);
  await json(await request(path(alice.id), { method: 'PATCH', headers: { Cookie: owner, 'Content-Type': 'application/json' }, body: '{}' }), 403);
  await json(await get(path('not-a-uuid'), owner), 404);
  await json(await get(path(randomUUID()), owner), 404);
  for (const body of [{}, { ...fields(), version: 'invalid' }, { ...fields(), name: '' }, { ...fields(), name: 'x'.repeat(101) },
    { ...fields(), name: 'First\nSecond' }, { ...fields(), email: '' }, { ...fields(), email: 'not an email' },
    { ...fields(), email: 12 }, { ...fields(), password: 'do-not-touch' }, { ...fields(), telegram: { id: bobTelegram } },
    { ...fields(), google_sub: 'other-provider' }, { ...fields(), customerId: bob.id }]) await json(await edit(body), 400);
  await json(await request(path(alice.id), { method: 'PATCH', headers: { Cookie: owner, Origin: base.origin, 'Content-Type': 'text/plain' }, body: '{}' }), 415);
  await json(await request(path(alice.id), { method: 'PATCH', headers: { Cookie: owner, Origin: base.origin, 'Content-Type': 'application/json' }, body: '{' }), 400);
  await json(await request(path(alice.id), { method: 'PATCH', headers: { Cookie: owner, Origin: base.origin, 'Content-Type': 'application/json' }, body: 'x'.repeat(4097) }), 413);
  await json(await edit({ ...fields(), email: null }), 400, 'Password-based sign-in keeps its email');
  await json(await edit({ ...fields(), email: bob.email.toUpperCase() }), 409);
  assert.equal(await ownRows(bob.id), preservedBefore);
  const beforeEditOrders = JSON.stringify((await db.execute('SELECT * FROM digimium_orders WHERE customer_id = ? ORDER BY id', [alice.id]))[0]);
  const beforeEditProviders = JSON.stringify((await db.execute('SELECT * FROM digimium_google_identities WHERE customer_id = ?', [alice.id]))[0]);
  const oldVersion = record.version;
  record = await json(await edit({ ...fields(), name: '  Updated customer  ', email: '  UPDATED-CUSTOMER@EXAMPLE.INVALID  ' }));
  assert.equal(record.customer.name, 'Updated customer'); assert.equal(record.customer.email, 'updated-customer@example.invalid');
  assert.notEqual(record.version, oldVersion);
  assert.deepEqual(record.customer.telegram, { id: aliceTelegram, username: alice.name.toLowerCase() });
  assert.equal(JSON.stringify((await db.execute('SELECT * FROM digimium_orders WHERE customer_id = ? ORDER BY id', [alice.id]))[0]), beforeEditOrders);
  assert.equal(JSON.stringify((await db.execute('SELECT * FROM digimium_google_identities WHERE customer_id = ?', [alice.id]))[0]), beforeEditProviders);
  assert.equal((await json(await get('/api/customer/session', alice.cookie))).customer.id, alice.id);
  await json(await edit({ ...fields(), version: oldVersion }), 409);
  await json(await remove({ version: oldVersion, confirmation: alice.id }), 409);
  await json(await remove({ version: record.version, confirmation: bob.id }), 400);
  await json(await remove({ version: record.version, confirmation: alice.id, force: true }), 400);
  await json(await remove({ version: record.version }), 400);

  // A new purchase, approval revision or giveaway entry makes a previously reviewed removal stale.
  const stale = record.version;
  const addedOrder = await addOrder(alice.id);
  await json(await remove({ version: stale, confirmation: alice.id }), 409);
  record = await read(alice.id);
  assert.equal(record.summary.orders, 3);
  const parallel = await Promise.all([edit({ ...fields(), name: 'Concurrent first' }), edit({ ...fields(), name: 'Concurrent second' })]);
  assert.deepEqual(parallel.map(response => response.status).sort(), [200, 409]);
  for (const response of parallel) await json(response, response.status);
  record = await read(alice.id);

  // Make the final parent DELETE fail after child deletes. All earlier deletes must roll back.
  await db.query(`CREATE TABLE digimium_test_customer_blockers (
    customer_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
    FOREIGN KEY (customer_id) REFERENCES digimium_customers(id)
  ) ENGINE=InnoDB`);
  await db.execute('INSERT INTO digimium_test_customer_blockers (customer_id) VALUES (?)', [alice.id]);
  const rollbackBefore = await ownRows(alice.id), challengesBefore = await challengeRows();
  const failure = await json(await remove({ version: record.version, confirmation: alice.id }), 503);
  assert.deepEqual(Object.keys(failure), ['error']);
  assert.ok(!failure.error.includes('SQL') && !failure.error.includes(alice.id));
  assert.equal(await ownRows(alice.id), rollbackBefore, 'No parent/child/session/provider removal survives a failed transaction');
  assert.equal(await challengeRows(), challengesBefore, 'Bound challenge removal also rolls back');
  await db.query('DROP TABLE digimium_test_customer_blockers');

  const removed = await json(await remove({ version: record.version, confirmation: alice.id }));
  assert.deepEqual(removed, { removed: true, id: alice.id });
  await json(await get(path(alice.id), owner), 404);
  const absent = JSON.parse(await ownRows(alice.id));
  assert.ok(Object.values(absent).every(rows => rows.length === 0));
  for (const id of [ownedLink, ownedLogin]) assert.equal((await db.execute('SELECT 1 FROM digimium_telegram_auth_challenges WHERE id_hash = ?', [id]))[0].length, 0);
  for (const id of [otherLink, otherLogin, unbound]) assert.equal((await db.execute('SELECT 1 FROM digimium_telegram_auth_challenges WHERE id_hash = ?', [id]))[0].length, 1);
  for (const id of [alicePending, aliceApproved, addedOrder]) assert.equal((await db.execute('SELECT 1 FROM digimium_orders WHERE id = ?', [id]))[0].length, 0);
  assert.equal((await json(await get('/api/customer/session', alice.cookie))).customer, null, 'Old customer sessions are invalidated');
  assert.equal((await json(await get('/api/customer/session', bob.cookie))).customer.id, bob.id);
  assert.equal(await ownRows(bob.id), preservedBefore, 'The other customer and every owned record remain byte-for-byte unchanged');
  assert.equal(JSON.stringify((await db.execute('SELECT * FROM digimium_orders WHERE id = ?', [guestId]))[0]), guestBefore, 'Unrelated guest orders remain untouched');
  assert.equal(JSON.stringify((await db.query('SELECT * FROM digimium_google_auth_challenges ORDER BY id_hash'))[0]), googleBefore,
    'Unowned Google flows are never indiscriminately deleted');
  const receipt = envelope({ customerId: alice.id, flowId: googleFlow, exp: Math.floor(Date.now() / 1000) + 120 }, googleKey, 'result').toString('base64url');
  const oldReceipt = await json(await get('/api/customer/google/pending', alice.cookie + '; digimium_local_google_result=' + receipt));
  assert.deepEqual(oldReceipt, { status: 'none' }, 'A prior Google result cannot recover the deleted customer session');
  const browser = envelope({ id: googleFlow, browser: googleBrowser, exp: Math.floor(Date.now() / 1000) + 300 }, googleKey, 'browser').toString('base64url');
  await json(await mutate('/api/customer/google/complete', 'POST', { password: 'deleted-account-proof' }, 'digimium_local_google=' + browser), 400);
  assert.equal((await db.execute('SELECT 1 FROM digimium_customers WHERE id = ?', [alice.id]))[0].length, 0);
  assert.equal(await ownRows(bob.id), preservedBefore);
  assert.equal((await db.execute('SELECT payload FROM digimium_google_auth_challenges WHERE id_hash = ?', [otherGoogle]))[0][0].payload, 'unowned-other-google-flow');

  // Either edit wins and removal becomes stale, or removal wins and edit sees no owner.
  const racing = await addCustomer('RaceFixture', false);
  await addOrder(racing.id);
  const raceRecord = await read(racing.id);
  const race = await Promise.all([
    mutate(path(racing.id), 'PATCH', { version: raceRecord.version, name: 'Race revised', email: null }, owner),
    mutate(path(racing.id), 'DELETE', { version: raceRecord.version, confirmation: racing.id }, owner),
  ]);
  assert.ok((race[0].status === 200 && race[1].status === 409) ||
    (race[1].status === 200 && [404, 409].includes(race[0].status)), 'Edit/delete serializes without partial failure');
  for (const response of race) await json(response, response.status);
  if (race[0].status === 200) {
    const current = await read(racing.id);
    assert.equal(current.customer.name, 'Race revised'); assert.equal(current.summary.orders, 1);
    await json(await mutate(path(racing.id), 'DELETE', { version: current.version, confirmation: racing.id }, owner));
  }
  assert.ok(Object.values(JSON.parse(await ownRows(racing.id))).every(rows => rows.length === 0));
  assert.equal(await ownRows(bob.id), preservedBefore);
  console.log('Admin customer integration passed: private authorization/origin/strict input, versioned edits, provider and order preservation, atomic confirmed removal/rollback, identity/session/challenge isolation and edit/delete races.');
} finally {
  if (server && server.exitCode === null && !server.signalCode) {
    const exited = once(server, 'exit'); server.kill('SIGTERM');
    const deadline = setTimeout(() => server.kill('SIGKILL'), 8000);
    try { await exited; } finally { clearTimeout(deadline); }
  }
  await db.end();
}
