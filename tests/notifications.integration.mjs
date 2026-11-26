// Run after the production build with Node 24 --experimental-transform-types.
// All mutations and provider responses belong to a fresh, disposable loopback fixture.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createCipheriv, createHmac, randomBytes, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { readFileSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { registerHooks } from 'node:module';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';

const scratch = await mkdtemp(join(tmpdir(), 'digimium-notifications-protocol-'));
const fakeToken = '99990000:fixture_notifications_only_abcdefghijklmnopqrstuvwxyz';
const fallbackToken = '99990000:fixture_fallback_only_abcdefghijklmnopqrstuvwxyz';
const sharedBotEnvironment = {
  DIGIMIUM_ADMIN_ORDERS_TELEGRAM_BOT_TOKEN: '99990000:fixture_shared_admin_only_abcdefghijklmnopqrstuvwxyz',
  DIGIMIUM_ADMIN_ORDERS_TELEGRAM_OWNER_ID: '999900005',
  DIGIMIUM_ADMIN_ORDERS_TELEGRAM_WEBHOOK_SECRET: randomBytes(32).toString('base64url'),
  DIGIMIUM_ADMIN_ORDERS_TELEGRAM_ORDERS_TOPIC_ID: '21',
  DIGIMIUM_ADMIN_ORDERS_TELEGRAM_REGISTRATION_TOPIC_ID: '22',
};

const env = { ...process.env, ADMIN_EMAIL: 'owner@example.invalid', ADMIN_AUTH_SECRET: randomUUID(), ORDER_FULFILLMENT_SECRET: randomUUID(),
  RESEND_FROM_EMAIL: 'digimium@example.invalid', RESEND_API_KEY: 're_integration_fixture', NOTIFICATIONS_CRON_SECRET: randomUUID(),
  GOOGLE_CLIENT_ID: '', GOOGLE_CLIENT_SECRET: '', TELEGRAM_BOT_TOKEN: '', TELEGRAM_BOT_USERNAME: '', TELEGRAM_WEBHOOK_SECRET: '',
  ADMIN_TELEGRAM_BOT_TOKEN: fakeToken, ADMIN_TELEGRAM_CHAT_ID: '', NOTIFICATION_FIXTURE_TOKEN: fakeToken,
  NOTIFICATION_FIXTURE_FALLBACK_TOKEN: fallbackToken, NOTIFICATION_FIXTURE_CHAT: '999900001',
  NOTIFICATION_FIXTURE_SHARED_TOKEN: sharedBotEnvironment.DIGIMIUM_ADMIN_ORDERS_TELEGRAM_BOT_TOKEN,
  NOTIFICATION_FIXTURE_SHARED_CHAT: sharedBotEnvironment.DIGIMIUM_ADMIN_ORDERS_TELEGRAM_OWNER_ID,
  DIGIMIUM_ADMIN_ORDERS_TELEGRAM_BOT_TOKEN: '', DIGIMIUM_ADMIN_ORDERS_TELEGRAM_OWNER_ID: '',
  DIGIMIUM_ADMIN_ORDERS_TELEGRAM_WEBHOOK_SECRET: '', DIGIMIUM_ADMIN_ORDERS_TELEGRAM_PAYMENT_TOPIC_ID: '',
  DIGIMIUM_ADMIN_ORDERS_TELEGRAM_ORDERS_TOPIC_ID: '', DIGIMIUM_ADMIN_ORDERS_TELEGRAM_REGISTRATION_TOPIC_ID: '',
  NOTIFICATION_FIXTURE_LOG: join(scratch, 'telegram.jsonl'), NOTIFICATION_FIXTURE_CONTROL: join(scratch, 'control.json') };
const base = new URL(env.APP_ORIGIN);
assert.ok(base.origin === env.APP_ORIGIN && base.protocol === 'http:' && base.hostname === '127.0.0.1' && base.port
  && env.DB_HOST === '127.0.0.1' && /^digimium_test_[a-z0-9_]+$/.test(env.DB_NAME) && env.DB_USER && env.DB_PASSWORD,
'Use an empty disposable loopback digimium_test_* database and an unused loopback HTTP port.');
for (const [key, value] of Object.entries(env)) if (value !== undefined) process.env[key] = value;
const fixtureJson = new Set(['catalog.json', 'import-catalog.json'].map(name => new URL('../data/' + name, import.meta.url).href));
registerHooks({ resolve(specifier, context, nextResolve) {
  if (context.parentURL?.endsWith('.ts') && !context.parentURL.includes('/node_modules/') && specifier.startsWith('.') && !/\.[a-z]+$/i.test(specifier)) return nextResolve(specifier + '.ts', context);
  return nextResolve(specifier, context);
}, load(url, context, nextLoad) {
  // Only these two committed catalog fixtures use the bundler's attribute-free JSON syntax.
  if (fixtureJson.has(url)) return { format: 'module', source: 'export default ' + JSON.stringify(JSON.parse(readFileSync(new URL(url), 'utf8'))) + ';', shortCircuit: true };
  return nextLoad(url, context);
} });
await writeFile(env.NOTIFICATION_FIXTURE_LOG, '', { mode: 0o600 });
await writeFile(env.NOTIFICATION_FIXTURE_CONTROL, '{}', { mode: 0o600 });
await import('./fixtures/notification-fetch.mjs');
const root = new URL('../', import.meta.url);
const db = await mysql.createConnection({ host: env.DB_HOST, port: Number(env.DB_PORT || 3306), user: env.DB_USER,
  password: env.DB_PASSWORD, database: env.DB_NAME, multipleStatements: true });
let server, pool;
const messages = [];
const request = (path, options = {}) => fetch(new URL(path, base), { ...options, redirect: 'manual', signal: AbortSignal.timeout(20000) });
const get = (path, session = '', headers = {}) => request(path, { headers: { Cookie: session, ...headers } });
const mutate = (path, method, body, session = '', origin = base.origin) => request(path, {
  method, headers: { Cookie: session, Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});
async function json(response, status = 200) {
  assert.equal(response.status, status, 'Unexpected HTTP status at ' + new URL(response.url).pathname);
  assert.match(response.headers.get('cache-control') || '', /no-store/);
  return response.json();
}
function cookie(response, name) {
  const raw = response.headers.getSetCookie().find(value => value.startsWith(name + '='));
  assert.ok(raw); assert.match(raw, /HttpOnly/i); return raw.split(';')[0];
}
const api = id => '/api/admin/customers/' + id + '/notifications';
const calls = async () => (await readFile(env.NOTIFICATION_FIXTURE_LOG, 'utf8')).trim().split('\n').filter(Boolean).map(line => JSON.parse(line));
const control = value => writeFile(env.NOTIFICATION_FIXTURE_CONTROL, JSON.stringify(value));
async function start(overrides = {}) {
  const probe = createServer();
  await new Promise((resolve, reject) => probe.once('error', reject).listen(Number(base.port), base.hostname, resolve));
  await new Promise(resolve => probe.close(resolve));
  server = spawn(process.execPath, ['--import', new URL('tests/fixtures/resend-fetch.mjs', root).href,
    '--import', new URL('tests/fixtures/notification-fetch.mjs', root).href, fileURLToPath(new URL('.next/standalone/server.js', root))], {
    cwd: fileURLToPath(root), env: { ...env, NODE_ENV: 'production', HOSTNAME: base.hostname, PORT: base.port, ...overrides },
    stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
  });
  server.on('message', value => { if (value?.type === 'otp-mail') messages.push(value); });
  for (let n = 0; ; n++) {
    try { if ((await request('/admin/login')).status === 200) return; } catch {}
    assert.ok(n < 150 && server.exitCode === null, 'The disposable server must become ready.'); await delay(100);
  }
}
async function stop() {
  if (!server || server.exitCode !== null || server.signalCode) return;
  const ended = once(server, 'exit'); server.kill('SIGTERM');
  const timer = setTimeout(() => server.kill('SIGKILL'), 5000);
  try { await ended; } finally { clearTimeout(timer); }
}
async function register(name) {
  const input = { action: 'register', name, email: name.toLowerCase().replaceAll(' ', '-') + '@example.invalid', password: randomUUID() };
  const response = await mutate('/api/customer/session', 'POST', input);
  const result = await json(response, 201);
  return { ...result.customer, password: input.password, cookie: cookie(response, 'digimium_local_customer') };
}
async function enqueue(notifications, candidate, commit = true) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction(); await notifications.enqueueNotificationAlert(connection, candidate);
    if (commit) await connection.commit(); else await connection.rollback();
  } finally { connection.release(); }
}
async function seedOrder(owner, productName, { status = 'approved', terms = [], guest = false, orderId = randomUUID() } = {}) {
  const id = orderId, guestKey = guest ? randomBytes(32) : null;
  const lines = (terms.length ? terms : [{ startDate: null, endDate: null }]).map((term, index) => ({ id: randomUUID(), productId: 'chatgpt', planId: null,
    productName: productName + (terms.length > 1 ? '-' + index : ''), planName: 'Fixture plan', duration: '1 month', price: '16,000 MMK', quantity: 1, term }));
  let fulfillment = null;
  if (status === 'approved') {
    const key = createHmac('sha256', env.ORDER_FULFILLMENT_SECRET).update('digimium/order-fulfillment/v1').digest();
    const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key, iv);
    cipher.setAAD(Buffer.from(id + '/' + (guest ? 'guest:' + guestKey.toString('hex') : owner)));
    const data = Buffer.concat([cipher.update(JSON.stringify(lines.map(line => ({ id: line.id, ...line.term,
      accountInfo: 'PRIVATE-NOTIFICATION-DELIVERY-SENTINEL', accountDetails: { account: 'secret@example.invalid', password: 'PRIVATE-NOTIFICATION-PASSWORD-SENTINEL', manager: '', username: '' } }))), 'utf8'), cipher.final()]);
    fulfillment = Buffer.concat([iv, cipher.getAuthTag(), data]).toString('base64');
  }
  const created = new Date().toISOString();
  await db.execute(`INSERT INTO digimium_orders
    (id,customer_id,guest_key,guest_name,request_id,request_hash,created_at,approved_at,rejected_at,snapshot,fulfillment)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`, [id, guest ? null : owner, guestKey, guest ? 'Fixture guest' : null, randomUUID(), randomBytes(32), created,
    status === 'approved' ? created : null, status === 'rejected' ? created : null,
    JSON.stringify({ lines: lines.map(line => ({ id: line.id, productId: line.productId, planId: line.planId, productName: line.productName,
      planName: line.planName, duration: line.duration, price: line.price, quantity: line.quantity })), totalMmk: lines.length * 16000 }), fulfillment]);
  return { id, lines };
}
try {
  assert.equal((await db.query('SHOW TABLES'))[0].length, 0, 'Refusing to mutate a nonempty database.');
  for (const file of ['schema.sql','customer-auth-schema.sql','order-schema.sql','google-identity-schema.sql','telegram-identity-schema.sql','google-auth-schema.sql','telegram-auth-schema.sql','notification-schema.sql']) await db.query(await readFile(new URL('hostinger/' + file, root), 'utf8'));
  // Recreate an existing deployment before optional buttons existed. Bootstrap must preserve rows.
  await db.query('ALTER TABLE digimium_notifications DROP action_label, DROP action_url');
  const legacyCustomer = randomUUID(), legacyMessage = randomUUID();
  await db.execute('INSERT INTO digimium_customers (id,name,email,password_hash) VALUES (?,?,NULL,NULL)', [legacyCustomer, 'Legacy notification fixture']);
  await db.execute(`INSERT INTO digimium_notifications (id,customer_id,dedupe_key,kind,title,body)
    VALUES (?,?,?,'message','Message from Digimium','Legacy message without a button')`, [legacyMessage, legacyCustomer, 'message:' + randomUUID()]);
  await start();
  assert.equal((await get('/api/customer/notifications')).status, 401);
  const mail = once(server, 'message', { signal: AbortSignal.timeout(10000) });
  const login = (body, session = '') => request('/admin/session', { method: 'POST', headers: { Origin: base.origin, Cookie: session }, body: new URLSearchParams(body) });
  const challenge = await login({ action: 'request', email: env.ADMIN_EMAIL });
  const [delivered] = await mail; assert.equal(delivered.type, 'otp-mail');
  const owner = cookie(await login({ action: 'verify', code: delivered.code }, cookie(challenge, 'digimium_local_challenge')), 'digimium_local_admin');
  const legacy = await json(await get(api(legacyCustomer), owner));
  assert.equal(legacy.notifications[0].id, legacyMessage); assert.equal(legacy.notifications[0].body, 'Legacy message without a button');
  assert.equal(Object.hasOwn(legacy.notifications[0], 'action'), false);
  assert.deepEqual((await db.execute('SELECT action_label,action_url FROM digimium_notifications WHERE id=?', [legacyMessage]))[0]
    .map(row => [row.action_label, row.action_url]), [[null, null]]);
  await db.execute('DELETE FROM digimium_customers WHERE id=?', [legacyCustomer]);
  const alice = await register('Notification Alice'), bob = await register('Notification Bob');
  assert.equal((await calls()).length, 0, 'Missing admin chat never sends externally or blocks signup.');
  assert.equal(Number((await db.query('SELECT COUNT(*) AS n FROM digimium_notification_outbox WHERE sent_at IS NULL'))[0][0].n), 2);
  const [initialAlerts] = await db.query(`SELECT next_attempt_at <= UTC_TIMESTAMP(3) AS due,
    ABS(TIMESTAMPDIFF(SECOND, created_at, UTC_TIMESTAMP(3))) AS age FROM digimium_notification_outbox`);
  assert.ok(initialAlerts.every(row => row.due === 1 && Number(row.age) < 30), 'New alerts must be due immediately in UTC, including a database using a local time zone.');
  const send = (id, body, session = owner, origin = base.origin) => mutate(api(id), 'POST', body, session, origin);
  const payload = { requestId: randomUUID(), message: '  Website fixture\r\nမြန်မာ <b>plain text</b>  ' };
  for (const session of ['', alice.cookie, bob.cookie]) await json(await send(alice.id, payload, session), 401);
  await json(await send(alice.id, payload, owner, 'https://foreign.invalid'), 403);
  await json(await get(api(alice.id), owner, { Origin: 'https://foreign.invalid' }), 403);
  await json(await get(api(alice.id), alice.cookie), 401);
  await json(await send(randomUUID(), payload), 404);
  for (const body of [null, [], {}, { ...payload, extra: true }, { ...payload, message: null }, { ...payload, message: 1 },
    { ...payload, message: '' }, { ...payload, message: ' '.repeat(3) }, { ...payload, message: 'x'.repeat(1001) },
    { ...payload, message: 'bad\u0000text' }, { ...payload, message: 'bad\ttext' }, { ...payload, message: 'bad\u202etext' },
    { ...payload, message: 'bad\u2067text' }, { ...payload, requestId: 'not-a-uuid' }]) await json(await send(alice.id, body), 400);
  for (const action of [false, [], {}, { label: 'Contact' }, { url: 'https://example.invalid/' },
    { label: '', url: '/' }, { label: 'x'.repeat(61), url: '/' }, { label: 'Bad\u202elabel', url: '/' },
    { label: 'Contact', url: 'javascript:alert(1)' }, { label: 'Contact', url: '//foreign.invalid' },
    { label: 'Contact', url: 'https://owner:password@example.invalid/' }, { label: 'Contact', url: 'https://example.invalid/%0A' },
    { label: 'Contact', url: '/admin' }, { label: 'Contact', url: '/', extra: true }]) {
    await json(await send(alice.id, { ...payload, action }), 400);
  }
  await json(await request(api(alice.id), { method: 'POST', headers: { Origin: base.origin, Cookie: owner, 'Content-Type': 'application/json' }, body: 'x'.repeat(8193) }), 413);
  const first = await json(await send(alice.id, payload), 201);
  assert.equal(first.notification.body, 'Website fixture\nမြန်မာ <b>plain text</b>'); assert.equal(first.created, true);
  assert.ok(Math.abs(Date.now() - Date.parse(first.notification.createdAt)) < 30000, 'Message DTO timestamps must be actual UTC, not a local database clock labelled as UTC.');
  assert.equal(Object.hasOwn(first.notification, 'action'), false);
  const retried = await json(await send(alice.id, payload)); assert.equal(retried.created, false); assert.equal(retried.notification.id, first.notification.id);
  assert.equal((await json(await send(alice.id, { ...payload, action: null }))).created, false, 'Null and omitted buttons are the same retry.');
  await json(await send(alice.id, { ...payload, message: 'Changed content' }), 409);
  await json(await send(alice.id, { ...payload, action: { label: 'Contact', url: 'https://example.invalid/' } }), 409);
  const simultaneous = { requestId: randomUUID(), message: 'Concurrent exact retry', action: { label: '  Contact us 👋  ', url: ' HTTPS://EXAMPLE.INVALID ' } };
  const duplicate = await Promise.all([send(alice.id, simultaneous), send(alice.id, simultaneous)]);
  assert.deepEqual(duplicate.map(value => value.status).sort(), [200, 201]);
  const results = await Promise.all(duplicate.map(value => json(value, value.status))); assert.equal(results[0].notification.id, results[1].notification.id);
  assert.deepEqual(results[0].notification.action, { label: 'Contact us 👋', url: 'https://example.invalid/' });
  assert.equal((await json(await send(alice.id, { ...simultaneous, action: results[0].notification.action }))).created, false, 'Normalized button retries are equivalent.');
  for (const action of [null, { label: 'Different label', url: 'https://example.invalid/' }, { label: 'Contact us 👋', url: '/order-history' }]) {
    await json(await send(alice.id, { ...simultaneous, action }), 409);
  }
  let internalButton;
  for (let n = 0; n < 18; n++) {
    const result = await json(await send(alice.id, { requestId: randomUUID(), message: 'Manual website fixture ' + n,
      ...(n === 0 ? { action: { label: 'အော်ဒါကြည့်မည်', url: '/order-history' } } : {}) }), 201);
    if (n === 0) internalButton = result.notification;
  }
  await json(await send(alice.id, { requestId: randomUUID(), message: 'Rate-limited message' }), 429);
  assert.equal((await json(await send(alice.id, payload))).created, false, 'Exact retries still work at the new-message limit.');
  const foreign = (await json(await send(bob.id, { requestId: randomUUID(), message: 'BOB-PRIVATE-NOTIFICATION-SENTINEL',
    action: { label: 'Bob private action', url: 'https://example.invalid/BOB-PRIVATE-ACTION' } }), 201)).notification;

  const notifications = await import('../hostinger/notifications.ts');
  pool = (await import('../hostinger/mysql.ts')).getPool();
  const { todayInMyanmar } = await import('../lib/subscription-term.ts');
  const today = todayInMyanmar(), day = offset => new Date(Date.parse(today + 'T00:00:00Z') + offset * 86400000).toISOString().slice(0, 10);
  const expiryOrder = await seedOrder(alice.id, 'Actual expiry', { terms: [
    { startDate: day(-10), endDate: day(3) }, { startDate: day(-10), endDate: day(1) }, { startDate: day(-10), endDate: day(2) },
    { startDate: day(-10), endDate: day(-1) }, { startDate: null, endDate: null },
    { startDate: day(50), endDate: day(51) }, { startDate: day(50), endDate: day(53) },
  ] });
  await seedOrder(alice.id, 'Pending must not remind', { status: 'pending' });
  await seedOrder(alice.id, 'Rejected must not remind', { status: 'rejected' });
  await seedOrder(alice.id, 'Guest must not remind', { guest: true, terms: [{ startDate: day(-10), endDate: day(3) }] });
  await seedOrder(bob.id, 'Bob expiry', { terms: [{ startDate: day(-10), endDate: day(3) }] });
  const expiry = await notifications.createExpiryNotifications(); assert.equal(expiry.created, 3);
  assert.equal((await notifications.createExpiryNotifications()).created, 0, 'Repeated scans dedupe by order, line, end date and threshold.');
  const [expiryRows] = await db.query("SELECT * FROM digimium_notifications WHERE kind='expiry'");
  assert.equal(expiryRows.length, 3); assert.ok(expiryRows.every(row => row.body_my && !row.body.includes('PRIVATE-')));
  const [expiryClocks] = await db.query("SELECT ABS(TIMESTAMPDIFF(SECOND, created_at, UTC_TIMESTAMP(3))) AS age FROM digimium_notifications WHERE kind='expiry'");
  assert.ok(expiryClocks.every(row => Number(row.age) < 30), 'Expiry notifications use the same UTC storage clock as messages and read markers.');
  assert.deepEqual(expiryRows.filter(row => row.customer_id === alice.id).map(row => row.dedupe_key).sort(),
    [0, 1].map((index) => `expiry:${expiryOrder.id}:${expiryOrder.lines[index].id}:${day(index ? 1 : 3)}:${index ? 1 : 3}`).sort());

  const path = '/api/customer/notifications';
  const page = await json(await get(path, alice.cookie)); assert.equal(page.notifications.length, 20); assert.equal(page.unreadCount, 22); assert.ok(page.nextCursor);
  const next = await json(await get(path + '?cursor=' + encodeURIComponent(page.nextCursor), alice.cookie));
  const ownNotifications = [...page.notifications, ...next.notifications]; assert.equal(ownNotifications.length, 22);
  assert.equal(new Set(ownNotifications.map(value => value.id)).size, 22); assert.equal(next.nextCursor, null);
  assert.ok(ownNotifications.every(value => !value.body.includes('BOB-PRIVATE-')));
  assert.doesNotMatch(JSON.stringify(ownNotifications), /BOB-PRIVATE-ACTION/);
  assert.deepEqual(ownNotifications.find(value => value.id === internalButton.id).action, { label: 'အော်ဒါကြည့်မည်', url: '/order-history' });
  assert.deepEqual(ownNotifications.find(value => value.id === results[0].notification.id).action, results[0].notification.action);
  assert.ok(ownNotifications.filter(value => value.type === 'expiry').every(value => !Object.hasOwn(value, 'action')));
  // Legacy/manual corruption cannot expose an executable URL even to the correct owner.
  await db.execute('UPDATE digimium_notifications SET action_url=? WHERE id=?', ['javascript:alert(1)', internalButton.id]);
  const filtered = await json(await get(api(alice.id), owner));
  assert.equal(Object.hasOwn(filtered.notifications.find(value => value.id === internalButton.id), 'action'), false);
  await db.execute('UPDATE digimium_notifications SET action_url=? WHERE id=?', ['/order-history', internalButton.id]);
  await json(await get(path + '?cursor=invalid!', alice.cookie), 400);
  await json(await get(path, alice.cookie, { 'Sec-Fetch-Site': 'cross-site' }), 403);
  await json(await get(path, alice.cookie, { Origin: 'https://foreign.invalid' }), 403);
  await json(await mutate(path, 'PATCH', { all: true }, '', base.origin), 401);
  await json(await mutate(path, 'PATCH', { all: true }, alice.cookie, 'https://foreign.invalid'), 403);
  for (const body of [{}, null, [], { all: false }, { all: true, customerId: bob.id }, { ids: [] }, { ids: Array(21).fill(first.notification.id) }, { ids: ['bad'] }]) await json(await mutate(path, 'PATCH', body, alice.cookie), 400);
  assert.equal((await json(await mutate(path, 'PATCH', { ids: [foreign.id] }, alice.cookie))).unreadCount, 22, 'Foreign notification IDs cannot be marked by this owner.');
  assert.equal((await json(await mutate(path, 'PATCH', { ids: [first.notification.id] }, alice.cookie))).unreadCount, 21);
  assert.equal((await json(await mutate(path, 'PATCH', { all: true }, alice.cookie))).unreadCount, 0);
  assert.equal((await json(await get(path, bob.cookie))).unreadCount, 2);
  const safeText = JSON.stringify(ownNotifications);
  assert.doesNotMatch(safeText, /PRIVATE-NOTIFICATION-DELIVERY|PRIVATE-NOTIFICATION-PASSWORD|secret@example.invalid/);
  const cron = '/api/internal/notifications/run';
  for (const headers of [{}, { Authorization: 'Bearer wrong' }]) await json(await request(cron, { method: 'POST', headers }), 401);
  await json(await request(cron + '?secret=' + env.NOTIFICATIONS_CRON_SECRET, { method: 'POST' }), 401);
  for (const extra of [{ Origin: base.origin }, { Cookie: owner }]) await json(await request(cron, { method: 'POST', headers: { Authorization: 'Bearer ' + env.NOTIFICATIONS_CRON_SECRET, ...extra } }), 400);
  await json(await request(cron + '?x=1', { method: 'POST', headers: { Authorization: 'Bearer ' + env.NOTIFICATIONS_CRON_SECRET } }), 400);
  await json(await request(cron, { method: 'POST', headers: { Authorization: 'Bearer ' + env.NOTIFICATIONS_CRON_SECRET, 'Content-Type': 'application/json' }, body: '{}' }), 400);
  const scheduled = await json(await request(cron, { method: 'POST', headers: { Authorization: 'Bearer ' + env.NOTIFICATIONS_CRON_SECRET } }));
  assert.equal(scheduled.expiry.created, 0); assert.equal(scheduled.alerts.configured, false);
  await json(await request(cron, { method: 'POST', headers: { Authorization: 'Bearer ' + env.NOTIFICATIONS_CRON_SECRET } }), 429);

  // A bad legacy record cannot pin the resumable cursor ahead of a later valid reminder.
  const badShape = await seedOrder(alice.id, 'Malformed snapshot', { orderId: '00000000-0000-4000-8000-000000000001' });
  const badCipher = await seedOrder(alice.id, 'Corrupt envelope', { orderId: '00000000-0000-4000-8000-000000000002' });
  await db.execute('UPDATE digimium_orders SET snapshot=? WHERE id=?', [JSON.stringify({ lines: [null], totalMmk: 16000 }), badShape.id]);
  await db.execute('UPDATE digimium_orders SET fulfillment=? WHERE id=?', ['corrupt-fixture-envelope', badCipher.id]);
  const laterDue = await seedOrder(alice.id, 'Valid after poison rows', { orderId: 'ffffffff-ffff-4fff-8fff-ffffffffffff', terms: [{ startDate: day(-10), endDate: day(3) }] });
  const poisonScan = await notifications.createExpiryNotifications(); assert.equal(poisonScan.created, 1); assert.ok(poisonScan.invalidOrders >= 2);
  assert.equal((await db.execute("SELECT 1 FROM digimium_notifications WHERE order_id=? AND kind='expiry'", [laterDue.id]))[0].length, 1);
  await db.execute('DELETE FROM digimium_orders WHERE id IN (?,?)', [badShape.id, badCipher.id]);
  // Date changes invalidate reminders; note-only and credential-only edits preserve them.
  let termOrder = (await json(await get('/api/admin/commerce', owner))).orders.find(order => order.id === laterDue.id);
  termOrder = (await json(await mutate('/api/admin/commerce/' + laterDue.id, 'PATCH', { action: 'note', revision: termOrder.revision, customerNote: 'Website-only term notice' }, owner))).order;
  assert.equal((await db.execute('SELECT 1 FROM digimium_notifications WHERE order_id=?', [laterDue.id]))[0].length, 1);
  termOrder = (await json(await mutate('/api/admin/commerce/' + laterDue.id, 'PATCH', { revision: termOrder.revision,
    lines: termOrder.lines.map(line => ({ id: line.id, startDate: line.startDate, endDate: line.endDate,
      accountDetails: { ...line.accountDetails, password: 'PRIVATE-NOTIFICATION-PASSWORD-CHANGED' } })) }, owner))).order;
  assert.equal((await db.execute('SELECT 1 FROM digimium_notifications WHERE order_id=?', [laterDue.id]))[0].length, 1);
  await json(await mutate('/api/admin/commerce/' + laterDue.id, 'PATCH', { revision: termOrder.revision,
    lines: termOrder.lines.map(line => ({ id: line.id, startDate: line.startDate, endDate: day(10) })) }, owner));
  assert.equal((await db.execute('SELECT 1 FROM digimium_notifications WHERE order_id=?', [laterDue.id]))[0].length, 0);

  process.env.ADMIN_TELEGRAM_CHAT_ID = env.NOTIFICATION_FIXTURE_CHAT;
  const flushed = await notifications.drainAdminNotificationAlerts({ limit: 5, budgetMs: 5000 }); assert.equal(flushed.sent, 2);
  assert.equal((await calls()).length, 2, 'Only new signup events were queued; old pending fixtures produce no alerts.');
  for (const oldBotCall of await calls()) assert.doesNotMatch(oldBotCall.fields.text, /Email:|Telegram username:|Telegram name:|Registered at:/);
  const rolledBackId = randomUUID(), rolledBackKey = 'rollback:' + randomUUID();
  const transaction = await pool.getConnection();
  try {
    await transaction.beginTransaction();
    await transaction.execute('INSERT INTO digimium_customers (id,name,email,password_hash) VALUES (?,?,NULL,NULL)', [rolledBackId, 'Rollback fixture']);
    await notifications.enqueueNotificationAlert(transaction, { kind: 'customer-created', dedupeKey: rolledBackKey, entityId: rolledBackId, customerName: 'Rollback fixture' });
    await transaction.rollback();
  } finally { transaction.release(); }
  assert.equal((await db.execute('SELECT 1 FROM digimium_notification_outbox WHERE dedupe_key=?', [rolledBackKey]))[0].length, 0);
  assert.equal((await db.execute('SELECT 1 FROM digimium_customers WHERE id=?', [rolledBackId]))[0].length, 0);
  const { resolveTelegramIdentity } = await import('../hostinger/telegram-identity.ts');
  const astral = await resolveTelegramIdentity({ id: '999900002', firstName: '😀'.repeat(50), lastName: '😀'.repeat(50) });
  assert.ok(astral.name.length > 100); assert.equal(Array.from(astral.name).length, 100);
  const astralAgain = await resolveTelegramIdentity({ id: '999900002', firstName: 'Changed' }); assert.equal(astralAgain.id, astral.id);
  assert.equal(Number((await db.execute('SELECT COUNT(*) AS n FROM digimium_notification_outbox WHERE dedupe_key=?', ['customer-created:' + astral.id]))[0][0].n), 1);
  assert.equal((await notifications.drainAdminNotificationAlerts()).sent, 1);
  const { resolveGoogleIdentity } = await import('../hostinger/google-identity.ts');
  const googleIdentity = { sub: 'notification-fixture-google', email: 'notification-google@example.invalid', name: 'Notification Google' };
  const google = await resolveGoogleIdentity(googleIdentity); assert.equal(google.status, 'success');
  const sameGoogle = await resolveGoogleIdentity(googleIdentity); assert.equal(sameGoogle.customer.id, google.customer.id);
  assert.equal(Number((await db.execute('SELECT COUNT(*) AS n FROM digimium_notification_outbox WHERE dedupe_key=?', ['customer-created:' + google.customer.id]))[0][0].n), 1);

  const alert = label => ({ kind: 'customer-created', dedupeKey: 'fixture:' + randomUUID(), entityId: alice.id, customerName: label });
  const retry = alert('Retry fixture'); await enqueue(notifications, retry); await control({ mode: 'error' });
  assert.equal((await notifications.drainAdminNotificationAlerts()).failed, 1);
  let saved = (await db.execute('SELECT * FROM digimium_notification_outbox WHERE dedupe_key=?', [retry.dedupeKey]))[0][0];
  assert.equal(saved.attempts, 1); assert.equal(saved.last_error, 'delivery-failed'); assert.equal(saved.sent_at, null);
  const beforeBackoff = (await calls()).length; await notifications.drainAdminNotificationAlerts(); assert.equal((await calls()).length, beforeBackoff);
  await db.execute('UPDATE digimium_notification_outbox SET next_attempt_at=DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 1 SECOND) WHERE id=?', [saved.id]);
  await control({}); assert.equal((await notifications.drainAdminNotificationAlerts()).sent, 1);
  saved = (await db.execute('SELECT * FROM digimium_notification_outbox WHERE id=?', [saved.id]))[0][0]; assert.equal(saved.attempts, 2); assert.ok(saved.sent_at); assert.equal(saved.last_error, null);
  for (const mode of ['false', 'oversize', 'throw']) {
    const candidate = alert('Failure mode ' + mode); await enqueue(notifications, candidate); await control({ mode });
    assert.equal((await notifications.drainAdminNotificationAlerts()).failed, 1);
    const row = (await db.execute('SELECT * FROM digimium_notification_outbox WHERE dedupe_key=?', [candidate.dedupeKey]))[0][0];
    assert.equal(row.sent_at, null); assert.equal(row.last_error, 'delivery-failed');
  }
  const terminal = alert('Exhausted attempt fixture'); await enqueue(notifications, terminal);
  await db.execute('UPDATE digimium_notification_outbox SET attempts=5,next_attempt_at=DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 1 SECOND) WHERE dedupe_key=?', [terminal.dedupeKey]);
  const beforeTerminal = (await calls()).length; await notifications.drainAdminNotificationAlerts(); assert.equal((await calls()).length, beforeTerminal, 'An exhausted row cannot send again.');
  await control({ delayMs: 250 });
  const leased = alert('Concurrent lease fixture'); await enqueue(notifications, leased); await enqueue(notifications, leased);
  assert.equal(Number((await db.execute('SELECT COUNT(*) AS n FROM digimium_notification_outbox WHERE dedupe_key=?', [leased.dedupeKey]))[0][0].n), 1);
  const beforeLease = (await calls()).length;
  const drains = await Promise.all(Array.from({ length: 4 }, () => notifications.drainAdminNotificationAlerts()));
  assert.equal(drains.reduce((sum, result) => sum + result.sent, 0), 1); assert.equal((await calls()).length, beforeLease + 1);
  const abandoned = alert('Abandoned lease fixture'); await enqueue(notifications, abandoned);
  await db.execute('UPDATE digimium_notification_outbox SET lease_token=?,lease_until=DATE_ADD(UTC_TIMESTAMP(3),INTERVAL 60 SECOND) WHERE dedupe_key=?', [randomBytes(16), abandoned.dedupeKey]);
  const beforeAbandoned = (await calls()).length; await notifications.drainAdminNotificationAlerts(); assert.equal((await calls()).length, beforeAbandoned);
  await db.execute('UPDATE digimium_notification_outbox SET lease_until=DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 1 SECOND) WHERE dedupe_key=?', [abandoned.dedupeKey]);
  assert.equal((await notifications.drainAdminNotificationAlerts()).sent, 1);
  const deletedId = randomUUID(); await db.execute('INSERT INTO digimium_customers (id,name,email,password_hash) VALUES (?,?,NULL,NULL)', [deletedId, 'Deleted queue fixture']);
  const removedCustomer = { ...alert('Deleted queue fixture'), entityId: deletedId }; await enqueue(notifications, removedCustomer);
  await db.execute('DELETE FROM digimium_customers WHERE id=?', [deletedId]);
  const removedOrder = await seedOrder(alice.id, 'Deleted queued order', { status: 'pending' });
  const removedOrderAlert = { kind: 'order-created', dedupeKey: 'fixture:' + randomUUID(), entityId: removedOrder.id, productSummary: 'Deleted queued order' }; await enqueue(notifications, removedOrderAlert);
  await db.execute('DELETE FROM digimium_orders WHERE id=?', [removedOrder.id]);
  const beforeDeleted = (await calls()).length; await notifications.drainAdminNotificationAlerts({ limit: 5 }); assert.equal((await calls()).length, beforeDeleted);
  const [cancelled] = await db.execute('SELECT cancelled_at,payload,last_error FROM digimium_notification_outbox WHERE dedupe_key IN (?,?)', [removedCustomer.dedupeKey, removedOrderAlert.dedupeKey]);
  assert.ok(cancelled.every(row => row.cancelled_at && row.payload === '{}' && row.last_error === 'entity-removed'));
  await control({});
  const fallback = alert('Fallback bot fixture'); await enqueue(notifications, fallback);
  process.env.ADMIN_TELEGRAM_BOT_TOKEN = ''; process.env.TELEGRAM_BOT_TOKEN = fallbackToken;
  assert.equal((await notifications.drainAdminNotificationAlerts()).sent, 1);
  process.env.ADMIN_TELEGRAM_BOT_TOKEN = fakeToken; process.env.TELEGRAM_BOT_TOKEN = '';

  const pendingAtCutover = { ...alert('Queued before topic cutover'), authProvider: 'email' };
  await enqueue(notifications, pendingAtCutover);
  await db.execute('UPDATE digimium_customers SET created_at = ? WHERE id = ?', ['2026-11-26 18:00:00', alice.id]);
  const beforeTopics = (await calls()).length;
  process.env.DIGIMIUM_ADMIN_ORDERS_TELEGRAM_ORDERS_TOPIC_ID = sharedBotEnvironment.DIGIMIUM_ADMIN_ORDERS_TELEGRAM_ORDERS_TOPIC_ID;
  assert.equal((await notifications.drainAdminNotificationAlerts({ dedupeKey: pendingAtCutover.dedupeKey })).configured, false,
    'Partial topic configuration must queue owner alerts instead of silently using the old bot.');
  assert.equal((await calls()).length, beforeTopics);
  Object.assign(process.env, sharedBotEnvironment);
  assert.equal((await notifications.drainAdminNotificationAlerts({ dedupeKey: pendingAtCutover.dedupeKey })).sent, 1);
  const registration = (await calls()).at(-1);
  assert.equal(registration.shared, true);
  assert.equal(registration.fields.message_thread_id, 22);
  assert.equal(registration.fields.protect_content, true);
  assert.equal(registration.fields.text, [
    'Account #' + alice.id.slice(0, 8).toUpperCase(), 'Sign-up method: Email', 'Name: ' + alice.name,
    'Email: ' + alice.email, 'Registered at: 27 Nov 2026, 00:30 MMT',
  ].join('\n'));
  assert.equal(registration.fields.reply_markup.inline_keyboard[0][0].url, base.origin + '/admin?customer=' + alice.id);
  const oldDueAlert = alert('Independent old alert');
  await enqueue(notifications, oldDueAlert);

  await stop(); await start({ ...sharedBotEnvironment, ADMIN_TELEGRAM_CHAT_ID: env.NOTIFICATION_FIXTURE_CHAT });
  const topicCustomer = await register('Topic Registration Fixture');
  const newRegistration = (await calls()).at(-1);
  assert.equal(newRegistration.shared, true);
  assert.equal(newRegistration.fields.message_thread_id, 22);
  assert.deepEqual(newRegistration.fields.text.split('\n').slice(0, 4), [
    'Account #' + topicCustomer.id.slice(0, 8).toUpperCase(), 'Sign-up method: Email',
    'Name: ' + topicCustomer.name, 'Email: ' + topicCustomer.email,
  ]);
  assert.match(newRegistration.fields.text, /\nRegistered at: \d{1,2} [A-Z][a-z]{2,3} \d{4}, \d{2}:\d{2} MMT$/);
  assert.doesNotMatch(newRegistration.fields.text, /Telegram username:|Telegram name:/);
  assert.ok(!JSON.stringify(newRegistration.fields).includes(topicCustomer.password));
  assert.equal(newRegistration.fields.reply_markup.inline_keyboard[0][0].url, base.origin + '/admin?customer=' + topicCustomer.id);
  const telegramSignup = await resolveTelegramIdentity({ id: '999900039', firstName: 'Telegram', lastName: 'Fixture', username: 'topic_fixture' });
  await db.execute('UPDATE digimium_customers SET name = ? WHERE id = ?', ['Edited Website Name', telegramSignup.id]);
  assert.equal((await notifications.drainAdminNotificationAlerts({ dedupeKey: 'customer-created:' + telegramSignup.id })).sent, 1);
  const telegramRegistration = (await calls()).at(-1);
  assert.equal(telegramRegistration.fields.message_thread_id, 22);
  assert.equal(telegramRegistration.fields.protect_content, true);
  assert.deepEqual(telegramRegistration.fields.text.split('\n').slice(1, 5),
    ['Sign-up method: Telegram', 'Name: Edited Website Name', 'Telegram username: @topic_fixture', 'Telegram name: Telegram Fixture']);
  assert.doesNotMatch(telegramRegistration.fields.text, /Email:/);
  const googleSignup = await resolveGoogleIdentity({ sub: 'topic-registration-google', name: 'Topic Google Fixture', email: 'topic-google@example.invalid' });
  assert.equal(googleSignup.status, 'success');
  const googleRegistration = (await calls()).at(-1);
  assert.equal(googleRegistration.fields.message_thread_id, 22);
  assert.deepEqual(googleRegistration.fields.text.split('\n').slice(1, 4),
    ['Sign-up method: Google', 'Name: Topic Google Fixture', 'Email: topic-google@example.invalid']);
  assert.doesNotMatch(googleRegistration.fields.text, /Telegram username:|Telegram name:/);
  const original = await json(await get('/api/admin/catalog', owner));
  const products = Array.from({ length: 6 }, (_, index) => ({ ...original.products[0], id: 'notification-fixture-' + index,
    name: 'Long product ' + index + ' ' + 'X'.repeat(50), published: true, availability: 'available',
    plans: [{ id: 'month', name: 'Long plan ' + 'Y'.repeat(60), price: '16,000 MMK', duration: '1 month', published: true }] }));
  await json(await mutate('/api/admin/catalog', 'PUT', { products, expectedRevision: original.revision, settings: { ...original.settings, telegram: 'DigimiumCheckout' } }, owner));
  const contact = { method: 'viber-phone', value: '09777000123' };
  const cart = { requestId: randomUUID(), expectedCustomerId: alice.id,
    items: products.map(product => ({ productId: product.id, planId: 'month', quantity: 1 })), contact };
  const checkout = await json(await mutate('/api/customer/orders', 'POST', cart, alice.cookie), 201);
  assert.equal(checkout.order.lines.length, 6, 'Long valid cart labels cannot roll back checkout because of alert display bounds.');
  const newOrder = (await calls()).at(-1);
  assert.equal(newOrder.shared, true);
  assert.equal(newOrder.fields.message_thread_id, 21);
  assert.equal(newOrder.fields.protect_content, true);
  assert.equal(newOrder.fields.text.split('\n')[0], 'Order ID: #' + checkout.id.slice(0, 8).toUpperCase());
  assert.match(newOrder.fields.text, /\nOrder time: \d{1,2} [A-Z][a-z]{2,3} \d{4}, \d{2}:\d{2} MMT\n\nLong product 0 .+ — Long plan .+ × 1\n/);
  assert.match(newOrder.fields.text, /\n\nTotal 96,000 MMK$/);
  assert.doesNotMatch(newOrder.fields.text, /Notification Alice|Items:|New Digimium order/);
  assert.ok(!JSON.stringify(newOrder.fields).includes(contact.value), 'Telegram alerts omit the buyer’s manual contact');
  assert.equal(newOrder.fields.reply_markup.inline_keyboard[0][0].url, base.origin + '/admin?order=' + checkout.id);
  const legacyOrder = await seedOrder(alice.id, 'Queued order fixture', { status: 'pending' });
  await db.execute('UPDATE digimium_orders SET created_at = ? WHERE id = ?', ['2026-11-26T18:45:35.000Z', legacyOrder.id]);
  const legacyAlert = { kind: 'order-created', dedupeKey: 'fixture:' + randomUUID(), entityId: legacyOrder.id, productSummary: 'Queued order fixture' };
  await enqueue(notifications, legacyAlert);
  assert.equal((await notifications.drainAdminNotificationAlerts({ dedupeKey: legacyAlert.dedupeKey })).sent, 1);
  const legacyText = (await calls()).at(-1).fields.text;
  assert.equal(legacyText.split('\n')[0], 'Order ID: #' + legacyOrder.id.slice(0, 8).toUpperCase());
  assert.match(legacyText, /\nOrder time: 27 Nov 2026, 01:15 MMT\n/, 'Queued alerts use the actual order time across Myanmar midnight.');
  assert.match(await (await get('/admin?order=' + checkout.id, owner)).text(), /<h1>Orders<\/h1>/);
  assert.match(await (await get('/admin?customer=' + topicCustomer.id, owner)).text(), /<h1>Customers<\/h1>/);
  assert.ok([302, 303, 307, 308].includes((await get('/admin?order=' + checkout.id)).status));
  const [[oldDueRow]] = await db.execute('SELECT attempts, sent_at FROM digimium_notification_outbox WHERE dedupe_key = ?', [oldDueAlert.dedupeKey]);
  assert.equal(oldDueRow.attempts, 0, 'A new order or registration delivers immediately even with older queued alerts.');
  assert.equal(oldDueRow.sent_at, null);
  await json(await mutate('/api/customer/orders', 'POST', cart, alice.cookie));
  assert.equal(Number((await db.execute('SELECT COUNT(*) AS n FROM digimium_notification_outbox WHERE dedupe_key=?', ['order-created:' + checkout.id]))[0][0].n), 1);
  await control({ delayMs: 200 });
  const concurrentCustomers = await Promise.all(Array.from({ length: 4 }, (_, index) => register('Concurrent Notification ' + index)));
  assert.equal(concurrentCustomers.length, 4, 'Creation hooks release their DB connection before draining a saturated four-connection pool.');
  const concurrentOrders = await Promise.all(Array.from({ length: 4 }, () => mutate('/api/customer/orders', 'POST', { ...cart, requestId: randomUUID(), items: [cart.items[0]] }, alice.cookie)));
  for (const response of concurrentOrders) await json(response, 201);
  await control({});
  const outboxBeforeLogin = Number((await db.query('SELECT COUNT(*) AS n FROM digimium_notification_outbox'))[0][0].n);
  await json(await mutate('/api/customer/session', 'POST', { action: 'login', email: alice.email, password: alice.password }));
  assert.equal(Number((await db.query('SELECT COUNT(*) AS n FROM digimium_notification_outbox'))[0][0].n), outboxBeforeLogin, 'Existing sign-in is not a new-customer alert.');
  const currentOrder = (await json(await get('/api/admin/commerce', owner))).orders.find(order => order.id === expiryOrder.id);
  await json(await mutate('/api/admin/commerce/' + currentOrder.id, 'DELETE', { revision: currentOrder.revision, confirmation: currentOrder.id }, owner));
  assert.equal((await db.execute('SELECT 1 FROM digimium_notifications WHERE order_id=?', [expiryOrder.id]))[0].length, 0, 'Explicit order removal clears derived expiry bell reminders.');
  const bobRecord = await json(await get('/api/admin/customers/' + bob.id, owner));
  await json(await mutate('/api/admin/customers/' + bob.id, 'DELETE', { version: bobRecord.version, confirmation: bob.id }, owner));
  assert.equal((await db.execute('SELECT 1 FROM digimium_notifications WHERE customer_id=?', [bob.id]))[0].length, 0);
  await json(await get('/api/customer/notifications', bob.cookie), 401);
  const sentText = JSON.stringify(await calls());
  assert.doesNotMatch(sentText, /PRIVATE-NOTIFICATION-(?:DELIVERY|PASSWORD)|BOB-PRIVATE-NOTIFICATION|Website fixture|secret@example.invalid/);
  console.log('Notification integration passed: optional safe buttons/legacy migration/normalized retry, owner-only messages/read state, strict bounded inputs, exact retry/rate limits, separate shared Admin bot topics and record links, validated 3/1-day expiry, transactional leased alerts/retries/deletion, long-cart/astral-name/pool regressions and private-data isolation.');
} finally {
  await stop(); if (pool) await pool.end(); await db.end(); await rm(scratch, { recursive: true, force: true });
}
