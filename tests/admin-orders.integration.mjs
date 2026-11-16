// Run after npm run build, using an EMPTY disposable loopback database only.
// The preloaded provider fixture blocks all outbound calls except the fake admin OTP mail.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';

const env = { ...process.env, ADMIN_EMAIL: 'owner@example.invalid', ADMIN_AUTH_SECRET: randomUUID(),
  ORDER_FULFILLMENT_SECRET: randomUUID(), RESEND_FROM_EMAIL: 'digimium@example.invalid', RESEND_API_KEY: 're_integration_fixture',
  GOOGLE_CLIENT_ID: '', GOOGLE_CLIENT_SECRET: '', TELEGRAM_BOT_TOKEN: '', TELEGRAM_BOT_USERNAME: '', TELEGRAM_WEBHOOK_SECRET: '' };
const base = new URL(env.APP_ORIGIN || 'http://invalid');
assert.ok(base.origin === env.APP_ORIGIN && base.protocol === 'http:' && base.hostname === '127.0.0.1' && base.port &&
  env.DB_HOST === '127.0.0.1' && /^digimium_test_[a-z0-9_]+$/.test(env.DB_NAME) && env.DB_USER && env.DB_PASSWORD,
  'Use an empty disposable loopback digimium_test_* database and unused loopback HTTP port.');
const root = new URL('../', import.meta.url);
const db = await mysql.createConnection({ host: env.DB_HOST, port: Number(env.DB_PORT || 3306), user: env.DB_USER,
  password: env.DB_PASSWORD, database: env.DB_NAME, multipleStatements: true });
let server;
const messages = [];
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
async function addCustomer(name) {
  const id = randomUUID(), token = randomBytes(32).toString('base64url');
  const email = name.toLowerCase() + '@example.invalid';
  await db.execute('INSERT INTO digimium_customers (id, name, email, password_hash, created_at) VALUES (?, ?, ?, ?, UTC_TIMESTAMP(3))',
    [id, name, email, 'fixture-preserved-hash-' + randomUUID()]);
  await db.execute('INSERT INTO digimium_customer_sessions (token_hash, customer_id, expires_at) VALUES (?, ?, DATE_ADD(UTC_TIMESTAMP(), INTERVAL 1 HOUR))',
    [hash(token), id]);
  return { id, name, email, cookie: 'digimium_local_customer=' + token };
}
const adminOrders = '/api/admin/commerce';
const customerOrders = '/api/customer/orders';
const customerPath = id => '/api/admin/customers/' + id;
const orderRows = async () => JSON.stringify((await db.query('SELECT * FROM digimium_orders ORDER BY id'))[0]);
const outboxRows = async () => JSON.stringify((await db.query('SELECT * FROM digimium_notification_outbox ORDER BY id'))[0]);

try {
  assert.equal((await db.query('SHOW TABLES'))[0].length, 0, 'Refusing to mutate a nonempty database.');
  const probe = createServer();
  await new Promise((resolve, reject) => probe.once('error', reject).listen(Number(base.port), base.hostname, resolve));
  await new Promise(resolve => probe.close(resolve));
  for (const file of ['schema.sql', 'customer-auth-schema.sql', 'order-schema.sql', 'google-identity-schema.sql',
    'telegram-identity-schema.sql', 'google-auth-schema.sql', 'telegram-auth-schema.sql', 'giveaway-schema.sql', 'notification-schema.sql']) {
    await db.query(await readFile(new URL('hostinger/' + file, root), 'utf8'));
  }
  server = spawn(process.execPath, ['--import', new URL('tests/fixtures/resend-fetch.mjs', root).href,
    fileURLToPath(new URL('.next/standalone/server.js', root))], {
    cwd: fileURLToPath(root), env: { ...env, FIXTURE_MAIL_FAILURE: '0', NODE_ENV: 'production', HOSTNAME: base.hostname, PORT: base.port },
    stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
  });
  server.on('message', message => messages.push(message));
  for (let attempt = 0; ; attempt++) {
    try { assert.equal((await request('/admin/login')).status, 200); break; }
    catch (error) {
      if (attempt > 120 || server.exitCode !== null || !['ECONNREFUSED', 'UND_ERR_SOCKET'].includes(error.cause?.code)) throw error;
      await delay(100);
    }
  }
  assert.equal((await request('/admin/login')).headers.get('referrer-policy'), 'same-origin',
    'Admin native POST forms retain a same-origin Origin while external referrers are suppressed');
  assert.equal((await request('/api/admin/commerce')).headers.get('referrer-policy'), 'no-referrer',
    'Private API responses retain the stricter no-referrer policy');
  const alice = await addCustomer('ManualOrderFixture'), bob = await addCustomer('PreservedFixture');
  const guestId = randomUUID(), guestLineId = randomUUID(), sharedRequestId = randomUUID();
  await db.execute(`INSERT INTO digimium_orders
    (id, customer_id, guest_key, guest_name, request_id, request_hash, created_at, snapshot)
    VALUES (?, NULL, ?, NULL, ?, ?, ?, ?)`,
  [guestId, randomBytes(32), sharedRequestId, randomBytes(32), '2028-01-01T00:00:00.000Z',
    JSON.stringify({ lines: [{ id: guestLineId, productId: 'legacy-guest', productName: 'Preserved guest snapshot', planId: null,
      planName: null, price: '8,000 MMK', duration: '1 month', quantity: 1 }], totalMmk: 8000 })]);
  const guestRows = async () => JSON.stringify((await db.execute('SELECT * FROM digimium_orders WHERE id = ?', [guestId]))[0]);
  const guestBefore = await guestRows();
  const customersBefore = JSON.stringify((await db.query('SELECT * FROM digimium_customers ORDER BY id'))[0]);
  const outboxBefore = await outboxRows();
  const initialOrders = await orderRows();

  await json(await mutate(adminOrders, 'POST', {}), 401);
  await json(await mutate(adminOrders, 'POST', {}, alice.cookie), 401);
  await json(await mutate(adminOrders, 'POST', {}, bob.cookie), 401);
  const mail = once(server, 'message', { signal: AbortSignal.timeout(10000) });
  const login = (fields, session = '') => request('/admin/session', { method: 'POST',
    headers: { Origin: base.origin, Cookie: session }, body: new URLSearchParams(fields) });
  const challenge = await login({ action: 'request', email: env.ADMIN_EMAIL });
  const [message] = await mail;
  assert.equal(message.type, 'otp-mail');
  const owner = cookie(await login({ action: 'verify', code: message.code }, cookie(challenge, 'digimium_local_challenge')), 'digimium_local_admin');
  const original = await json(await get('/api/admin/catalog', owner));
  const plan = { id: 'monthly', name: 'Monthly fixture', price: '2,000 MMK', discountPrice: '1500', duration: '1 month', published: true };
  const service = { ...original.products[0], id: 'manual-service', name: 'Server-owned service', availability: 'available',
    published: true, plans: [plan, { ...plan, id: 'draft', published: false }] };
  const inquiry = { ...service, id: 'manual-inquiry', name: 'Inquiry service', price: '', discountPrice: '', plans: [], availability: 'on-request' };
  const nonMmk = { ...inquiry, id: 'non-mmk', name: 'Non-MMK fixture', price: 'USD 5' };
  const hidden = { ...service, id: 'manual-hidden', published: false };
  const unavailable = { ...service, id: 'manual-unavailable', availability: 'unavailable' };
  const products = [service, inquiry, nonMmk, hidden, unavailable];
  const saveCatalog = (offers, expectedRevision) => mutate('/api/admin/catalog', 'PUT',
    { products: offers, expectedRevision, settings: { ...original.settings, telegram: 'ManualOrderFixture' } }, owner).then(response => json(response));
  let catalog = await saveCatalog(products, original.revision);
  const item = { productId: service.id, planId: plan.id, quantity: 2 };
  const custom = { productId: inquiry.id, planId: null, quantity: 1, unitPriceMmk: 4200 };
  const input = { customerId: alice.id, requestId: sharedRequestId, expectedCatalogRevision: catalog.revision,
    items: [item, custom], customerNote: '  Purchased through Telegram.\r\nPayment checked manually.  ' };
  const create = (body = input, session = owner, origin = base.origin) => mutate(adminOrders, 'POST', body, session, origin);
  const aliceBefore = await json(await get(customerPath(alice.id), owner));
  await json(await create(input, owner, 'https://foreign.invalid'), 403);
  await json(await request(adminOrders, { method: 'POST', headers: { Cookie: owner, 'Content-Type': 'application/json' }, body: '{}' }), 403);
  await json(await request(adminOrders, { method: 'POST', headers: { Cookie: owner, Origin: base.origin,
    'Sec-Fetch-Site': 'cross-site', 'Content-Type': 'application/json' }, body: '{}' }), 403);
  await json(await request(adminOrders, { method: 'POST', headers: { Cookie: owner, Origin: base.origin, 'Content-Type': 'text/plain' }, body: '{}' }), 415);
  await json(await request(adminOrders, { method: 'POST', headers: { Cookie: owner, Origin: base.origin, 'Content-Type': 'application/json' }, body: '{' }), 400);
  await json(await request(adminOrders, { method: 'POST', headers: { Cookie: owner, Origin: base.origin, 'Content-Type': 'application/json' }, body: 'x'.repeat(2 * 1024 * 1024 + 1) }), 413);
  for (const body of [{}, { ...input, customerId: null }, { ...input, customerId: 'not-a-uuid' },
    { ...input, requestId: 'not-a-uuid' }, { ...input, expectedCatalogRevision: -1 }, { ...input, expectedCatalogRevision: 1.5 },
    { ...input, expectedCatalogRevision: String(catalog.revision) }, { ...input, expectedCatalogRevision: Number.MAX_SAFE_INTEGER },
    { ...input, items: [] }, { ...input, items: null }, { ...input, customer: { name: 'Spoofed buyer' } },
    { ...input, guestId }, { ...input, totalMmk: 1 }, { ...input, approvedAt: '2028-01-01T00:00:00.000Z' },
    { ...input, customerNote: 12 }, { ...input, customerNote: 'x'.repeat(1001) }, { ...input, customerNote: 'private\u0000field' },
    { ...input, items: [{ ...item, price: '1 MMK' }] }, { ...input, items: [{ ...item, productName: 'Spoofed name' }] },
    { ...input, items: [{ ...item, startDate: '2028-01-01' }] }]) await json(await create(body), 400);
  for (const quantity of [0, -1, 1.5, '2', null, Number.MAX_SAFE_INTEGER + 1]) {
    await json(await create({ ...input, items: [{ ...item, quantity }] }), 400);
  }
  for (const unitPriceMmk of [-1, 1.5, '4200', null, true, Number.MAX_SAFE_INTEGER + 1]) {
    await json(await create({ ...input, items: [{ ...custom, unitPriceMmk }] }), 400);
  }
  const oversized = await json(await create({ ...input, items: Array(3001).fill(null) }), 400);
  assert.match(oversized.error, /3000/, 'Oversized arrays fail before invalid element validation');
  await json(await create({ ...input, items: [{ ...item, quantity: 2, unitPriceMmk: Number.MAX_SAFE_INTEGER }] }), 400,
    'Safe individual integers cannot overflow the aggregate order total');
  await json(await create({ ...input, customerId: randomUUID() }), 404);
  await json(await create({ ...input, expectedCatalogRevision: catalog.revision - 1 }), 409);
  for (const invalid of [{ ...item, productId: hidden.id }, { ...item, productId: unavailable.id },
    { ...item, productId: 'not-in-catalog' }, { ...item, planId: 'draft' }, { ...item, planId: null }]) {
    await json(await create({ ...input, items: [custom, invalid] }), 409);
  }
  await json(await create({ ...input, items: [item, item] }), 409);
  await json(await create({ ...input, items: [{ productId: inquiry.id, planId: null, quantity: 1 }] }), 400);
  await json(await create({ ...input, items: [{ productId: nonMmk.id, planId: null, quantity: 1 }] }), 400);
  assert.equal(await orderRows(), initialOrders, 'Invalid manual creation is atomic and never changes existing orders');
  assert.equal(await outboxRows(), outboxBefore);

  const concurrent = await Promise.all([create(), create()]);
  assert.deepEqual(concurrent.map(response => response.status).sort(), [200, 201]);
  const results = await Promise.all(concurrent.map(response => json(response, response.status)));
  assert.deepEqual(results[0].order, results[1].order, 'Concurrent retries resolve to the same order and immutable snapshot');
  assert.deepEqual(results.map(result => result.created).sort(), [false, true]);
  assert.ok(results.every(result => Object.keys(result).sort().join(',') === 'created,order'), 'A manual receipt makes no automated email or Telegram delivery claim');
  const order = results[0].order;
  assert.match(order.id, /^[a-f0-9-]{36}$/i);
  assert.equal(order.customerId, alice.id);
  assert.equal(order.status, 'pending');
  assert.equal(order.revision, 1);
  assert.equal(order.approvedAt, null);
  assert.equal(order.rejectedAt, null);
  assert.equal(order.totalMmk, 7200);
  assert.equal(order.customerNote, 'Purchased through Telegram.\nPayment checked manually.');
  assert.deepEqual(order.lines.map(line => [line.productName, line.planName, line.duration, line.price, line.quantity]), [
    [service.name, plan.name, plan.duration, '1,500 MMK', 2], [inquiry.name, null, inquiry.duration, '4,200 MMK', 1],
  ], 'Names, duration, effective catalog price and explicit negotiated unit price are snapshotted on the server');
  assert.ok(order.lines.every(line => line.startDate === null && line.endDate === null && line.accountInfo === '' && !Object.hasOwn(line, 'accountDetails')));
  assert.equal((await db.execute('SELECT id FROM digimium_orders WHERE customer_id = ? AND request_id = ?', [alice.id, sharedRequestId]))[0].length, 1);
  assert.equal(await guestRows(), guestBefore, 'Reusing a guest request UUID never transfers or edits that guest order');
  assert.equal(JSON.stringify((await db.query('SELECT * FROM digimium_customers ORDER BY id'))[0]), customersBefore,
    'Manual orders never fabricate, rename or edit customer accounts');
  assert.equal(await outboxRows(), outboxBefore, 'Manual back-office entry does not queue a new-checkout Telegram alert');
  await json(await mutate(customerPath(alice.id), 'DELETE', { version: aliceBefore.version, confirmation: alice.id }, owner), 409,
    'A new manual purchase invalidates a previously reviewed customer removal');
  for (const changed of [{ ...input, items: [item] }, { ...input, customerNote: 'Different note' },
    { ...input, items: [item, { ...custom, unitPriceMmk: 4201 }] }, { ...input, expectedCatalogRevision: catalog.revision + 1 }]) {
    await json(await create(changed), 409);
  }
  assert.deepEqual((await json(await get(customerOrders + '?view=history', alice.cookie))).orders, [order]);
  assert.deepEqual((await json(await get(customerOrders + '?view=history&customerId=' + alice.id, bob.cookie))).orders, []);
  await json(await get(customerOrders), 401);
  await json(await mutate(customerOrders, 'POST', { requestId: randomUUID(), items: [{ ...item, unitPriceMmk: 1 }] }, alice.cookie), 400,
    'Public checkout never accepts an administrator price override');
  await json(await mutate(customerOrders, 'POST', { requestId: sharedRequestId, items: [item] }, alice.cookie), 409,
    'A manual-entry request cannot be replayed through the public checkout namespace');

  const revisedService = { ...service, name: 'Later catalog name', plans: [{ ...plan, price: '9,000 MMK', discountPrice: '' }] };
  catalog = await saveCatalog([revisedService, inquiry, nonMmk, hidden, unavailable], catalog.revision);
  assert.deepEqual((await json(await create())).order, order, 'Exact retries preserve the saved snapshot even after a catalog change');
  await json(await create({ ...input, requestId: randomUUID() }), 409, 'A new order must use the currently reviewed catalog revision');
  const zero = await json(await create({ customerId: alice.id, requestId: randomUUID(), expectedCatalogRevision: catalog.revision,
    items: [{ ...item, quantity: 1, unitPriceMmk: 0 }] }), 201);
  assert.equal(zero.order.totalMmk, 0);
  assert.equal(zero.order.lines[0].price, '0 MMK', 'An explicit historical complimentary amount is valid');
  assert.equal(zero.order.lines[0].productName, revisedService.name);
  const foreignCurrency = await json(await create({ customerId: alice.id, requestId: randomUUID(), expectedCatalogRevision: catalog.revision,
    items: [{ productId: nonMmk.id, planId: null, quantity: 3, unitPriceMmk: 2500 }] }), 201);
  assert.equal(foreignCurrency.order.totalMmk, 7500);
  assert.equal(foreignCurrency.order.lines[0].price, '2,500 MMK');

  const delivery = { account: 'fixture-delivered-account-' + randomUUID(), password: 'fixture-private-password-' + randomUUID(),
    manager: 'fixture-private-manager', username: 'fixture-private-username' };
  const approval = { revision: order.revision, lines: order.lines.map((line, index) => ({ id: line.id,
    startDate: '2028-01-01', endDate: '2028-02-01', ...(index ? {} : { accountDetails: delivery }) })) };
  const approved = (await json(await mutate(adminOrders + '/' + order.id, 'PATCH', approval, owner))).order;
  assert.equal(approved.status, 'approved');
  assert.equal(approved.customerNote, order.customerNote);
  const ownerHistory = (await json(await get(customerOrders + '?view=history', alice.cookie))).orders.find(row => row.id === order.id);
  assert.deepEqual(ownerHistory, approved);
  assert.deepEqual(ownerHistory.lines[0].accountDetails, delivery);
  const overview = (await json(await get(customerOrders + '?view=overview', alice.cookie))).orders;
  assert.ok(overview.every(row => row.lines.every(line => !line.accountInfo && !Object.hasOwn(line, 'accountDetails'))),
    'Account previews never return delivered credentials');
  assert.deepEqual((await json(await get(customerOrders + '?view=history&customerId=' + alice.id, bob.cookie))).orders, [],
    'Another customer cannot read the manually entered purchase or credentials');
  const [[stored]] = await db.execute('SELECT snapshot, fulfillment FROM digimium_orders WHERE id = ?', [order.id]);
  assert.ok(stored.fulfillment, 'Approval uses the established encrypted fulfillment envelope');
  for (const value of Object.values(delivery)) {
    assert.ok(!stored.snapshot.includes(value) && !stored.fulfillment.includes(value), 'Delivery credentials are never stored as plaintext');
  }
  assert.deepEqual((await json(await create())).order, approved, 'An authenticated admin retry returns the existing current record, never a second order');

  // Parent locking gives create/remove one serial order. A reviewed version cannot silently erase a newly added purchase.
  for (let index = 0; index < 3; index++) {
    const person = await addCustomer('RaceFixture' + index);
    const record = await json(await get(customerPath(person.id), owner));
    const body = { customerId: person.id, requestId: randomUUID(), expectedCatalogRevision: catalog.revision,
      items: [{ ...item, quantity: 1 }] };
    const [added, removed] = await Promise.all([create(body), mutate(customerPath(person.id), 'DELETE',
      { version: record.version, confirmation: person.id }, owner)]);
    if (added.status === 201) {
      await json(added, 201); await json(removed, 409);
      assert.equal((await db.execute('SELECT id FROM digimium_customers WHERE id = ?', [person.id]))[0].length, 1);
      assert.equal((await db.execute('SELECT id FROM digimium_orders WHERE customer_id = ?', [person.id]))[0].length, 1);
    } else {
      await json(added, 404); await json(removed, 200);
      assert.equal((await db.execute('SELECT id FROM digimium_customers WHERE id = ?', [person.id]))[0].length, 0);
      assert.equal((await db.execute('SELECT id FROM digimium_orders WHERE customer_id = ?', [person.id]))[0].length, 0);
    }
  }
  assert.equal(await guestRows(), guestBefore, 'Unrelated guest data remains byte-for-byte unchanged after manual entry, fulfillment and removal races');
  assert.equal(await outboxRows(), outboxBefore, 'No manual-order path or retry creates checkout owner alerts');
  assert.deepEqual(messages.map(value => value.type), ['otp-mail'], 'The only provider message is the fake admin sign-in code');
  console.log('Admin manual-order integration passed: auth/origin/strict bounds, server catalog snapshots and negotiated prices, idempotent retries, customer-only history, encrypted delivery and redacted previews, guest preservation and serialized create/delete races.');
} finally {
  if (server && server.exitCode === null && !server.signalCode) {
    const exited = once(server, 'exit'); server.kill('SIGTERM');
    const deadline = setTimeout(() => server.kill('SIGKILL'), 8000);
    try { await exited; } finally { clearTimeout(deadline); }
  }
  await db.end();
}
