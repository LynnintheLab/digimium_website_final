// Run with Node 24 --experimental-transform-types against an empty disposable loopback database.
import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { registerHooks } from 'node:module';
import mysql from 'mysql2/promise';

const base = new URL(process.env.APP_ORIGIN);
assert.ok(base.origin === process.env.APP_ORIGIN && base.protocol === 'http:' && base.hostname === '127.0.0.1' &&
  process.env.DB_HOST === '127.0.0.1' && /^digimium_test_[a-z0-9_]+$/.test(process.env.DB_NAME) && process.env.DB_USER && process.env.DB_PASSWORD,
'Use a fresh loopback digimium_test_* database and a loopback origin.');
// Auth source uses bundler-compatible extensionless imports; resolve only relative TypeScript module paths.
registerHooks({ resolve(specifier, context, nextResolve) {
  if (context.parentURL?.endsWith('.ts') && !context.parentURL.includes('/node_modules/') && specifier.startsWith('.') && !/\.[a-z]+$/i.test(specifier)) {
    return nextResolve(specifier + '.ts', context);
  }
  return nextResolve(specifier, context);
} });

const db = await mysql.createConnection({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME, multipleStatements: true });
let pool;
const hash = value => createHash('sha256').update(value).digest();
const request = cookie => new Request(base.origin + '/api/customer/telegram/poll', { headers: { Cookie: cookie || '' } });
const identity = (id, firstName = 'တူညီနာမည်', username = 'fixture_user') => ({ id, firstName, username });
const cookie = response => {
  const value = response.headers.getSetCookie().find(value => value.startsWith('digimium_local_customer='));
  assert.ok(value); assert.match(value, /HttpOnly/); assert.match(value, /SameSite=Lax/);
  return value.split(';')[0];
};
try {
  assert.equal((await db.query('SHOW TABLES'))[0].length, 0, 'Refusing to test in a nonempty database.');
  await db.query(await readFile(new URL('../hostinger/customer-auth-schema.sql', import.meta.url), 'utf8'));
  await db.query('ALTER TABLE digimium_customers MODIFY email VARCHAR(254) COLLATE utf8mb4_bin NOT NULL, MODIFY password_hash VARCHAR(180) CHARACTER SET ascii COLLATE ascii_bin NOT NULL');
  const legacyId = randomUUID(); const legacyEmail = 'legacy-identity@example.invalid'; const legacyHash = 'preserved-local-hash';
  await db.execute('INSERT INTO digimium_customers (id, name, email, password_hash, created_at) VALUES (?, ?, ?, ?, UTC_TIMESTAMP())',
    [legacyId, 'တူညီနာမည်', legacyEmail, legacyHash]);
  const legacyToken = randomBytes(32).toString('base64url');
  await db.execute('INSERT INTO digimium_customer_sessions (token_hash, customer_id, expires_at) VALUES (?, ?, DATE_ADD(UTC_TIMESTAMP(), INTERVAL 1 HOUR))',
    [hash(legacyToken), legacyId]);
  const { ensureTelegramIdentitySchema, resolveTelegramIdentity } = await import('../hostinger/telegram-identity.ts');
  const { currentCustomer, issueCustomerSession, issueTelegramCustomerSession } = await import('../hostinger/customer-auth.ts');
  pool = (await import('../hostinger/mysql.ts')).getPool();
  await ensureTelegramIdentitySchema();
  const [columns] = await db.query("SHOW COLUMNS FROM digimium_customers WHERE Field IN ('email', 'password_hash')");
  assert.ok(columns.every(column => column.Null === 'YES'));
  const [[legacy]] = await db.execute('SELECT email, password_hash FROM digimium_customers WHERE id = ?', [legacyId]);
  assert.deepEqual(legacy, { email: legacyEmail, password_hash: legacyHash });
  const legacyCustomer = await currentCustomer(request('digimium_local_customer=' + legacyToken));
  assert.deepEqual(Object.keys(legacyCustomer).sort(), ['createdAt', 'email', 'id', 'name']);
  for (const bad of [identity('0'), identity('-1'), identity('99999999999999999999'), identity('1.5'),
    { id: '9999100000099', firstName: '' }, { id: '9999100000099', firstName: 'First\nSecond' }]) {
    await assert.rejects(resolveTelegramIdentity(bad), error => error.status === 400 && error.message === 'invalid');
  }

  const first = await resolveTelegramIdentity(identity('9999100000001'));
  assert.equal(first.email, null); assert.equal(first.passwordAvailable, false);
  assert.deepEqual(first.telegram, { id: '9999100000001', username: 'fixture_user' });
  assert.notEqual(first.id, legacyId, 'A matching display name must never attach Telegram to a local account.');
  const repeated = await resolveTelegramIdentity(identity('9999100000001', 'Changed name', 'changed_user'));
  assert.equal(repeated.id, first.id); assert.equal(repeated.name, first.name); assert.equal(repeated.telegram.username, 'changed_user');
  assert.equal((await resolveTelegramIdentity({ id: '9999100000001', firstName: 'Changed again' })).telegram.username, null);
  const sameDisplay = await resolveTelegramIdentity(identity('9999100000002'));
  assert.notEqual(sameDisplay.id, first.id, 'Usernames/display names do not prove a shared owner.');
  const simultaneous = await Promise.all(Array.from({ length: 6 }, () => resolveTelegramIdentity(identity('9999100000003'))));
  assert.equal(new Set(simultaneous.map(person => person.id)).size, 1);
  const [[count]] = await db.execute('SELECT COUNT(*) AS count FROM digimium_customers WHERE id = ?', [simultaneous[0].id]);
  assert.equal(Number(count.count), 1);

  const transaction = await pool.getConnection();
  await transaction.beginTransaction();
  const rolledBack = await resolveTelegramIdentity(identity('9999100000004'), transaction);
  await transaction.rollback(); transaction.release();
  assert.equal((await db.execute('SELECT 1 FROM digimium_customers WHERE id = ?', [rolledBack.id]))[0].length, 0);

  const { resolveGoogleIdentity } = await import('../hostinger/google-identity.ts');
  assert.deepEqual(await resolveGoogleIdentity({ sub: 'legacy-google-subject', email: legacyEmail, name: 'Different' }), { status: 'link', email: legacyEmail });
  const google = await resolveGoogleIdentity({ sub: 'new-google-subject', email: 'google-identity@example.invalid', name: 'Google fixture' });
  assert.equal(google.status, 'success'); assert.equal(google.customer.email, 'google-identity@example.invalid'); assert.ok(!google.customer.telegram);
  const oldStyleSession = await issueCustomerSession(request(''), legacyCustomer);
  assert.deepEqual(Object.keys((await oldStyleSession.json()).customer).sort(), ['createdAt', 'email', 'id', 'name']);

  await db.query(await readFile(new URL('../hostinger/telegram-auth-schema.sql', import.meta.url), 'utf8'));
  async function approvedFlow(stage = 'approved', expired = false) {
    const flow = { idHash: randomBytes(32), browserHash: randomBytes(32), stage: 'approved' };
    await db.execute('INSERT INTO digimium_telegram_auth_challenges (id_hash, browser_hash, stage, payload, expires_at) VALUES (?, ?, ?, ?, DATE_ADD(UTC_TIMESTAMP(), INTERVAL ? SECOND))',
      [flow.idHash, flow.browserHash, stage, '{}', expired ? -60 : 300]);
    return flow;
  }
  for (const flow of [await approvedFlow('pending'), await approvedFlow('approved', true),
    { idHash: randomBytes(32), browserHash: randomBytes(32), stage: 'approved' }]) {
    await assert.rejects(issueTelegramCustomerSession(request(''), identity('9999100000005'), flow), error => error.status === 400 && error.message === 'expired');
  }
  assert.equal((await db.execute('SELECT 1 FROM digimium_telegram_identities WHERE telegram_id = ?', ['9999100000005']))[0].length, 0);
  const cancelling = await approvedFlow();
  const lock = await pool.getConnection(); await lock.beginTransaction();
  await lock.execute('SELECT 1 FROM digimium_telegram_auth_challenges WHERE id_hash = ? FOR UPDATE', [cancelling.idHash]);
  const cancelledIssue = issueTelegramCustomerSession(request(''), identity('9999100000006'), cancelling);
  await lock.execute('DELETE FROM digimium_telegram_auth_challenges WHERE id_hash = ?', [cancelling.idHash]);
  await lock.commit(); lock.release();
  await assert.rejects(cancelledIssue, error => error.message === 'expired');
  assert.equal((await db.execute('SELECT 1 FROM digimium_telegram_identities WHERE telegram_id = ?', ['9999100000006']))[0].length, 0);

  const winning = await approvedFlow();
  const races = await Promise.allSettled(Array.from({ length: 2 }, () => issueTelegramCustomerSession(request(''), identity('9999100000007'), winning)));
  assert.equal(races.filter(result => result.status === 'fulfilled').length, 1);
  const response = races.find(result => result.status === 'fulfilled').value;
  const sessionCustomer = await currentCustomer(request(cookie(response)));
  assert.equal(sessionCustomer.email, null); assert.equal(sessionCustomer.telegram.id, '9999100000007');
  assert.equal((await db.execute('SELECT 1 FROM digimium_telegram_auth_challenges WHERE id_hash = ?', [winning.idHash]))[0].length, 0);
  await assert.rejects(issueTelegramCustomerSession(request(''), identity('9999100000007'), winning), error => error.message === 'expired');
  const flows = await Promise.all([approvedFlow(), approvedFlow()]);
  const sessions = await Promise.all(flows.map(flow => issueTelegramCustomerSession(request(''), identity('9999100000008'), flow)));
  const customers = await Promise.all(sessions.map(async response => currentCustomer(request(cookie(response)))));
  assert.equal(customers[0].id, customers[1].id);
  assert.equal((await db.execute('SELECT 1 FROM digimium_customer_sessions WHERE customer_id = ?', [customers[0].id]))[0].length, 2);
  console.log('Telegram identity integration passed: schema preservation, no invented email/password, stable ownership, concurrent identities, Google compatibility, rollback, cancellation and atomic session consumption.');
} finally { await db.end(); if (pool) await pool.end(); }
