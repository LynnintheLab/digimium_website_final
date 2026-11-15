// Run after npm run build. Uses the same disposable database/origin settings as test:hostinger.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createCipheriv, createHash, createHmac, randomBytes, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';

const env = { ...process.env, ADMIN_EMAIL: 'owner@example.invalid', ADMIN_AUTH_SECRET: randomUUID(),
  ORDER_FULFILLMENT_SECRET: randomUUID(), RESEND_FROM_EMAIL: 'digimium@example.invalid', RESEND_API_KEY: 're_integration_fixture' };
const base = new URL(env.APP_ORIGIN);
assert.ok(base.origin === env.APP_ORIGIN && base.protocol === 'http:' && base.hostname === '127.0.0.1' && base.port &&
  env.DB_HOST === '127.0.0.1' && /^digimium_test_[a-z0-9_]+$/.test(env.DB_NAME) && env.DB_USER && env.DB_PASSWORD,
  'Use a disposable loopback database called digimium_test_* and an unused loopback HTTP port.');
const root = new URL('../', import.meta.url);
const db = await mysql.createConnection({ host: env.DB_HOST, port: Number(env.DB_PORT || 3306), user: env.DB_USER,
  password: env.DB_PASSWORD, database: env.DB_NAME, multipleStatements: true });
let server;
const request = (path, options = {}) => fetch(new URL(path, base), { ...options, redirect: 'manual', signal: AbortSignal.timeout(10000) });
const mutate = (path, method, body, cookie = '', origin = base.origin) => request(path, {
  method, headers: { Origin: origin, Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});
const get = (path, cookie) => request(path, { headers: { Cookie: cookie } });
async function json(response, status = 200) {
  assert.equal(response.status, status, 'Unexpected HTTP status at ' + new URL(response.url).pathname);
  assert.match(response.headers.get('cache-control') || '', /no-store/);
  return response.json();
}
function cookie(response, name) {
  const raw = response.headers.getSetCookie().find(value => value.startsWith(name + '='));
  assert.match(raw ?? '', /httponly/i);
  return raw.split(';')[0];
}

const customerSession = '/api/customer/session';
const customerEmailStep = '/api/customer/email-step';
const customerOrders = '/api/customer/orders';
const adminCommerce = '/api/admin/commerce';
const credentials = name => ({ action: 'register', name, email: name.toLowerCase() + '@example.invalid', password: randomUUID() });
async function register(input) {
  const response = await mutate(customerSession, 'POST', input);
  const session = cookie(response, 'digimium_local_customer');
  const { customer } = await json(response, 201);
  assert.deepEqual(Object.keys(customer).sort(), ['createdAt', 'email', 'id', 'name']);
  return { ...customer, cookie: session };
}

try {
  const [tables] = await db.query('SHOW TABLES');
  assert.equal(tables.length, 0, 'Refusing to create fixtures in a nonempty database.');
  const probe = createServer();
  await new Promise((resolve, reject) => probe.once('error', reject).listen(Number(base.port), base.hostname, resolve));
  await new Promise(resolve => probe.close(resolve));
  await db.query(await readFile(new URL('hostinger/schema.sql', root), 'utf8'));
  // Exercise the upgrade from the deployed account-only order schema, as well as fresh installs.
  await db.query(await readFile(new URL('hostinger/customer-auth-schema.sql', root), 'utf8'));
  // Exercise the Telegram upgrade from the previous required-email/password schema.
  await db.query('ALTER TABLE digimium_customers MODIFY email VARCHAR(254) COLLATE utf8mb4_bin NOT NULL, MODIFY password_hash VARCHAR(180) CHARACTER SET ascii COLLATE ascii_bin NOT NULL');
  await db.query(`CREATE TABLE digimium_orders (
    id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
    customer_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    request_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    request_hash BINARY(32) NOT NULL,
    created_at CHAR(24) CHARACTER SET ascii NOT NULL,
    approved_at CHAR(24) CHARACTER SET ascii NULL,
    revision INT UNSIGNED NOT NULL DEFAULT 1,
    snapshot MEDIUMTEXT NOT NULL,
    fulfillment MEDIUMTEXT NULL,
    UNIQUE KEY orders_customer_request (customer_id, request_id),
    INDEX orders_customer_created (customer_id, created_at),
    CONSTRAINT orders_customer FOREIGN KEY (customer_id) REFERENCES digimium_customers (id),
    CHECK (JSON_VALID(snapshot)),
    CHECK ((approved_at IS NULL AND fulfillment IS NULL) OR (approved_at IS NOT NULL AND fulfillment IS NOT NULL))
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  server = spawn(process.execPath, ['--import', new URL('tests/fixtures/resend-fetch.mjs', root).href,
    fileURLToPath(new URL('.next/standalone/server.js', root))], {
    cwd: fileURLToPath(root), env: { ...env, FIXTURE_MAIL_FAILURE: '0', NODE_ENV: 'production', HOSTNAME: base.hostname, PORT: base.port },
    stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
  });
  for (let attempt = 0; ; attempt++) {
    try { assert.equal((await request('/admin/login')).status, 200); break; } catch (error) {
      if (attempt > 120 || server.exitCode !== null || !['ECONNREFUSED', 'UND_ERR_SOCKET'].includes(error.cause?.code)) throw error;
      await delay(100);
    }
  }
  assert.equal((await request(customerOrders)).status, 401);
  assert.equal((await request(adminCommerce)).status, 401);
  const first = credentials('First');
  const second = credentials('Second');
  assert.equal((await mutate(customerEmailStep, 'POST', { email: first.email }, '', 'https://foreign.invalid')).status, 403);
  assert.deepEqual(await json(await mutate(customerEmailStep, 'POST', { email: first.email })), { next: 'register' });
  for (const body of [{}, { email: 12 }, { email: '' }, { email: 'not an email' }, { email: 'first@example.invalid\nsecond@example.invalid' },
    { email: first.email, action: 'login' }]) {
    assert.equal((await mutate(customerEmailStep, 'POST', body)).status, 400);
  }
  assert.equal((await mutate(customerSession, 'POST', first, '', 'https://foreign.invalid')).status, 403);
  const alice = await register(first);
  const bob = await register(second);
  const emailStep = await mutate(customerEmailStep, 'POST', { email: '  ' + first.email.toUpperCase() + '  ' });
  assert.deepEqual(await json(emailStep), { next: 'password' });
  assert.equal(emailStep.headers.getSetCookie().length, 0, 'Email discovery cannot create a signed-in session');
  assert.equal((await json(await request(customerSession))).customer, null);
  const lookupEmail = 'lookup-limit@example.invalid';
  for (let attempt = 0; attempt < 12; attempt++) {
    assert.deepEqual(await json(await mutate(customerEmailStep, 'POST', { email: lookupEmail })), { next: 'register' });
  }
  assert.equal((await mutate(customerEmailStep, 'POST', { email: lookupEmail })).status, 429);
  assert.equal((await mutate(customerSession, 'POST', first)).status, 409);
  assert.equal((await mutate(customerSession, 'POST', { action: 'login', email: first.email, password: randomUUID() })).status, 401);
  assert.equal((await get(adminCommerce, alice.cookie)).status, 401);

  const mail = once(server, 'message', { signal: AbortSignal.timeout(10000) });
  const login = (fields, session = '') => request('/admin/session', { method: 'POST',
    headers: { Origin: base.origin, Cookie: session }, body: new URLSearchParams(fields) });
  const challenge = await login({ action: 'request', email: env.ADMIN_EMAIL });
  const [message] = await mail;
  assert.equal(message.type, 'otp-mail');
  const owner = cookie(await login({ action: 'verify', code: message.code }, cookie(challenge, 'digimium_local_challenge')), 'digimium_local_admin');
  // Seed the old schema before its first authorized commerce read, including encrypted fulfillment.
  const legacyRows = [];
  for (const approved of [false, true]) {
    const legacyId = randomUUID(), lineId = randomUUID();
    const snapshot = JSON.stringify({ lines: [{ id: lineId, productId: 'legacy', productName: 'Legacy snapshot', planId: null,
      planName: null, duration: '1 month', price: '100 MMK', quantity: 1 }], totalMmk: 100 });
    let fulfillment = null;
    if (approved) {
      const iv = randomBytes(12), key = createHmac('sha256', env.ORDER_FULFILLMENT_SECRET).update('digimium/order-fulfillment/v1').digest();
      const cipher = createCipheriv('aes-256-gcm', key, iv); cipher.setAAD(Buffer.from(legacyId + '/' + alice.id));
      const encrypted = Buffer.concat([cipher.update(JSON.stringify([{ id: lineId, startDate: '2028-01-01', endDate: '2028-02-01', accountInfo: 'legacy-fixture-delivery' }])), cipher.final()]);
      fulfillment = Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64');
    }
    await db.execute('INSERT INTO digimium_orders (id, customer_id, request_id, request_hash, created_at, approved_at, snapshot, fulfillment) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [legacyId, alice.id, randomUUID(), randomBytes(32), '2028-01-01T00:00:00.000Z', approved ? '2028-01-01T01:00:00.000Z' : null, snapshot, fulfillment]);
    legacyRows.push({ id: legacyId, snapshot, fulfillment, approved });
  }
  const migrated = (await json(await get(adminCommerce, owner))).orders;
  for (const legacy of legacyRows) {
    const row = migrated.find(order => order.id === legacy.id);
    assert.equal(row.status, legacy.approved ? 'approved' : 'pending');
    assert.equal(row.customerNote, ''); assert.equal(row.rejectedAt, null);
    assert.equal(row.lines[0].accountInfo, legacy.approved ? 'legacy-fixture-delivery' : '');
    const [[savedLegacy]] = await db.execute('SELECT snapshot, fulfillment FROM digimium_orders WHERE id = ?', [legacy.id]);
    assert.equal(savedLegacy.snapshot, legacy.snapshot, 'Additive migration preserves legacy snapshots byte-for-byte');
    assert.equal(savedLegacy.fulfillment, legacy.fulfillment, 'Additive migration preserves encrypted credentials byte-for-byte');
    await db.execute('DELETE FROM digimium_orders WHERE id = ?', [legacy.id]);
  }
  const [decisionColumns] = await db.query("SHOW COLUMNS FROM digimium_orders WHERE Field IN ('rejected_at', 'customer_note')");
  assert.equal(decisionColumns.length, 2); assert.ok(decisionColumns.every(column => column.Null === 'YES'));
  const accountList = await json(await get(adminCommerce, owner));
  assert.equal(accountList.customers.length, 2);
  assert.deepEqual(accountList.orders, []);
  assert.deepEqual(Object.keys(accountList.customers[0]).sort(), ['createdAt', 'email', 'id', 'name']);

  const original = await json(await get('/api/admin/catalog', owner));
  const plan = { id: 'month', name: 'Monthly', price: '2,000 MMK', discountPrice: '1500', duration: '1 month', published: true };
  const product = { ...original.products[0], id: 'service', name: 'Fixture service', availability: 'available',
    published: true, plans: [plan, { ...plan, id: 'draft', published: false }] };
  const inquiry = { ...product, id: 'custom', name: 'Custom plan', price: '', discountPrice: '', plans: [], availability: 'on-request' };
  const hidden = { ...product, id: 'hidden', published: false };
  const unavailable = { ...product, id: 'unavailable', availability: 'unavailable' };
  const telegram = 'DigimiumCheckout';
  const saveCatalog = (products, expectedRevision, contact = telegram) => mutate('/api/admin/catalog', 'PUT',
    { products, expectedRevision, settings: { ...original.settings, telegram: contact } }, owner);
  await json(await saveCatalog([product, inquiry, hidden, unavailable], original.revision));
  const item = { productId: product.id, planId: plan.id, quantity: 2 };
  const custom = { productId: inquiry.id, planId: null, quantity: 1 };
  const submission = { items: [item, custom], requestId: randomUUID() };
  const submit = (body = submission, session = alice.cookie, origin = base.origin) => mutate(customerOrders, 'POST', body, session, origin);
  assert.equal((await submit(submission, '')).status, 401);
  assert.equal((await submit(submission, alice.cookie, 'https://foreign.invalid')).status, 403);
  assert.equal((await submit({ ...submission, customerId: bob.id })).status, 400);
  assert.equal((await submit({ ...submission, customer: { name: 'Spoofed', email: second.email } })).status, 400);
  assert.equal((await submit({ ...submission, items: [{ ...item, price: '1 MMK' }] })).status, 400);
  const oversizedItems = Array(3001).fill(null);
  const collectionLimitError = { error: 'An order can contain at most 3000 items.' };
  assert.deepEqual(await json(await submit({ ...submission, items: oversizedItems }), 400), collectionLimitError,
    'Oversized invalid checkout arrays are rejected before element validation');
  for (const invalid of [{ ...item, productId: hidden.id }, { ...item, productId: unavailable.id }, { ...item, planId: 'draft' }, { ...item, planId: null }]) {
    assert.equal((await submit({ ...submission, items: [custom, invalid] })).status, 409, 'The entire cart must be accepted or rejected together');
  }
  const submitted = await Promise.all([submit(), submit()]);
  assert.deepEqual(submitted.map(r => r.status).sort(), [200, 201]);
  const [checkout, duplicate] = await Promise.all(submitted.map(r => json(r, r.status)));
  const { id } = checkout;
  assert.deepEqual(checkout, duplicate);
  assert.equal(checkout.customerId, alice.id, 'Checkout receipts bind to the actual saved account owner');
  assert.equal(checkout.telegram, telegram);
  assert.deepEqual(checkout.customer, { name: first.name, email: first.email });
  assert.deepEqual(checkout.order, { id, totalMmk: null, lines: [
    { productName: product.name, planName: plan.name, duration: plan.duration, quantity: 2, price: '1,500 MMK' },
    { productName: inquiry.name, planName: null, duration: inquiry.duration, quantity: 1, price: '' },
  ] });
  assert.ok(!JSON.stringify(checkout).includes(first.password));
  assert.equal((await submit({ ...submission, items: [custom] })).status, 409);
  const before = (await json(await get(customerOrders, alice.cookie))).orders;
  assert.equal(before.length, 1);
  assert.equal(before[0].status, 'pending');
  assert.equal(before[0].totalMmk, null);
  assert.deepEqual(before[0].lines.map(line => [line.productName, line.price, line.quantity, line.accountInfo, line.startDate]),
    [[product.name, '1,500 MMK', 2, '', null], [inquiry.name, '', 1, '', null]]);
  const priced = await json(await submit({ requestId: randomUUID(), items: [item] }), 201);
  assert.ok(priced.id);
  const pricedRows = (await json(await get(customerOrders, alice.cookie))).orders;
  assert.equal(pricedRows.find(row => row.id === priced.id).totalMmk, 3000);
  const updatedContact = 'NewStoreContact';
  await json(await saveCatalog([inquiry], original.revision + 1, updatedContact));
  assert.deepEqual(await json(await submit()), { ...checkout, telegram: updatedContact },
    'Retry uses the original items and prices with the current store contact');
  const accountResponse = await json(await get(customerOrders, alice.cookie));
  assert.equal(accountResponse.telegram, updatedContact);
  assert.deepEqual(accountResponse.customer, { id: alice.id, name: first.name, email: first.email, createdAt: alice.createdAt, signInMethods: { emailPassword: true, google: false, telegram: false } });
  assert.deepEqual((await json(await get(customerOrders + '?customerId=' + alice.id, bob.cookie))).orders, []);
  assert.deepEqual((await json(await get(adminCommerce, owner))).orders.find(row => row.id === id), before[0]);
  const lines = before[0].lines.map(line => ({ id: line.id, startDate: '2028-02-29', endDate: '2028-03-29' }));
  const update = (payload, session = owner, origin = base.origin) => mutate(adminCommerce + '/' + id, 'PATCH', payload, session, origin);
  const approval = { lines, revision: before[0].revision };
  assert.equal((await update(approval, bob.cookie)).status, 401);
  assert.equal((await update(approval, owner, 'https://foreign.invalid')).status, 403);
  assert.deepEqual(await json(await update({ ...approval, lines: oversizedItems }), 400), collectionLimitError,
    'Oversized invalid fulfillment arrays are rejected before element validation');
  for (const bad of [[lines[0]], [lines[0], lines[0]], [{ ...lines[0], startDate: '2027-02-29' }, lines[1]],
    [{ ...lines[0], endDate: '2028-02-28' }, lines[1]]]) {
    assert.equal((await update({ ...approval, lines: bad })).status, 400);
  }
  const privateDetails = 'Private historical delivery ' + randomUUID();
  assert.equal((await update({ ...approval, lines: [{ ...lines[0], accountInfo: privateDetails }, lines[1]] })).status, 400);
  for (const accountDetails of [null, { account: 12 }, { unknown: 'unexpected' },
    { account: 'x'.repeat(501) }, { password: 'x'.repeat(1001) }, { manager: 'x'.repeat(501) }, { username: 'x'.repeat(501) },
    { account: 'first\nsecond' }, { password: 'bad\u0000value' }, { manager: 'bad\tvalue' }, { username: 'bad\rvalue' }]) {
    assert.equal((await update({ ...approval, lines: [{ ...lines[0], accountDetails }, lines[1]] })).status, 400,
      'Optional delivered account fields enforce types, limits and single-line values');
  }
  const saved = await Promise.all([update(approval), update(approval)]);
  assert.deepEqual(saved.map(r => r.status).sort(), [200, 409]);
  const approved = (await json(saved.find(r => r.status === 200))).order;
  assert.equal(approved.status, 'approved');
  assert.equal(approved.lines[0].accountInfo, '');
  assert.equal(approved.lines[1].accountInfo, '');
  assert.equal(approved.lines[0].accountDetails, undefined, 'Omitted optional fields never block approval');
  assert.deepEqual((await json(await get(customerOrders, alice.cookie))).orders.find(row => row.id === id), approved);
  assert.deepEqual((await json(await get(customerOrders, bob.cookie))).orders, []);
  const deliveredAccount = {
    account: 'service-account-' + randomUUID(), password: '  private-password-' + randomUUID() + '  ',
    manager: 'manager-' + randomUUID(), username: 'username-' + randomUUID(),
  };
  const withDetails = (await json(await update({ revision: approved.revision,
    lines: [{ ...lines[0], accountDetails: deliveredAccount }, lines[1]] }))).order;
  assert.deepEqual(withDetails.lines[0].accountDetails, deliveredAccount);
  assert.equal(withDetails.lines[1].accountDetails, undefined);
  assert.deepEqual((await json(await get(adminCommerce, owner))).orders.find(order => order.id === id), withDetails);
  assert.deepEqual((await json(await get(customerOrders + '?view=history', alice.cookie))).orders.find(order => order.id === id), withDetails,
    'Only the owning customer can read approved structured delivery');
  assert.deepEqual((await json(await get(customerOrders + '?view=history&customerId=' + alice.id, bob.cookie))).orders, []);
  const structuredPreview = (await json(await get(customerOrders + '?view=overview', alice.cookie))).orders;
  assert.ok(structuredPreview.every(order => order.lines.every(line => !Object.hasOwn(line, 'accountDetails'))),
    'Overview omits structured credentials entirely');
  assert.deepEqual(await json(await submit()), { ...checkout, telegram: updatedContact },
    'Checkout retry and its Telegram projection omit structured credentials');
  const dateOnly = (await json(await update({ revision: withDetails.revision, lines }))).order;
  assert.deepEqual(dateOnly.lines[0].accountDetails, deliveredAccount, 'Date-only edits preserve structured account details');
  const emptyAccount = { account: '', password: '', manager: '', username: '' };
  const cleared = (await json(await update({ revision: dateOnly.revision,
    lines: [{ ...lines[0], accountDetails: emptyAccount }, lines[1]] }))).order;
  assert.equal(cleared.lines[0].accountDetails, undefined, 'Explicit blank fields clear structured details');
  const restored = (await json(await update({ revision: cleared.revision,
    lines: [{ ...lines[0], accountDetails: deliveredAccount }, lines[1]] }))).order;
  // Simulate a record encrypted by the release that accepted website credential delivery.
  const historical = lines.map((line, index) => ({ ...line, accountInfo: index ? '' : privateDetails,
    ...(index ? {} : { accountDetails: deliveredAccount }) }));
  const iv = randomBytes(12);
  const key = createHmac('sha256', env.ORDER_FULFILLMENT_SECRET).update('digimium/order-fulfillment/v1').digest();
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(id + '/' + alice.id));
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(historical)), cipher.final()]);
  const envelope = Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString('base64');
  await db.execute('UPDATE digimium_orders SET fulfillment = ? WHERE id = ?', [envelope, id]);
  assert.deepEqual(await json(await submit()), { ...checkout, telegram: updatedContact },
    'Replaying checkout after delivery must never return fulfillment secrets');
  const changedLines = [{ ...lines[0], endDate: '2028-04-29' }, lines[1]];
  const { order: edited } = await json(await update({ revision: restored.revision, lines: changedLines }));
  const [[stored]] = await db.execute('SELECT snapshot, fulfillment FROM digimium_orders WHERE id = ?', [id]);
  assert.ok(!Object.values(stored).some(value => value.includes(privateDetails)), 'No plaintext fulfillment in storage');
  for (const value of Object.values(deliveredAccount)) {
    assert.ok(!Object.values(stored).some(raw => raw.includes(value)), 'Structured account details are encrypted, never part of the purchase snapshot');
  }
  assert.equal(edited.approvedAt, approved.approvedAt);
  assert.equal(edited.lines[0].endDate, changedLines[0].endDate);
  assert.equal(edited.lines[0].accountInfo, privateDetails, 'Date changes preserve historical encrypted delivery');
  assert.deepEqual(edited.lines[0].accountDetails, deliveredAccount, 'Date changes preserve both legacy and structured delivery');
  assert.equal(edited.lines[0].price, '1,500 MMK');
  await json(await mutate(customerSession, 'DELETE', {}, alice.cookie));
  assert.equal((await get(customerOrders, alice.cookie)).status, 401);
  const again = await mutate(customerSession, 'POST', { action: 'login', email: first.email, password: first.password });
  const newCookie = cookie(again, 'digimium_local_customer');
  assert.deepEqual((await json(await get(customerOrders, newCookie))).orders.find(row => row.id === id), edited);
  const otherLogin = await mutate(customerSession, 'POST', { action: 'login', email: first.email, password: first.password });
  const otherCookie = cookie(otherLogin, 'digimium_local_customer');
  const nextPassword = randomUUID();
  const changePassword = (body, session = newCookie, origin = base.origin) => mutate(customerSession, 'PATCH', body, session, origin);
  const passwords = { action: 'password', currentPassword: first.password, newPassword: nextPassword };
  assert.equal((await changePassword(passwords, '')).status, 401);
  assert.equal((await changePassword(passwords, newCookie, 'https://foreign.invalid')).status, 403);
  assert.equal((await changePassword({ ...passwords, newPassword: 'short' })).status, 400);
  const wrongPassword = await json(await changePassword({ ...passwords, currentPassword: randomUUID() }), 400);
  assert.equal(wrongPassword.error, 'current_password');
  const competing = { ...passwords, newPassword: randomUUID() };
  const changes = await Promise.all([changePassword(passwords), changePassword(competing, otherCookie)]);
  assert.deepEqual(changes.map(response => response.status).sort(), [200, 401]);
  const successful = changes.findIndex(response => response.status === 200);
  const activeCookie = cookie(changes[successful], 'digimium_local_customer');
  assert.notEqual(activeCookie, newCookie);
  assert.notEqual(activeCookie, otherCookie);
  const winnerPassword = successful ? competing.newPassword : nextPassword;
  assert.deepEqual((await json(changes[successful])).customer, { id: alice.id, name: first.name, email: first.email, createdAt: alice.createdAt, signInMethods: { emailPassword: true, google: false, telegram: false } });
  assert.equal((await get(customerOrders, newCookie)).status, 401);
  assert.equal((await get(customerOrders, otherCookie)).status, 401);
  assert.equal((await mutate(customerSession, 'POST', { action: 'login', email: first.email, password: first.password })).status, 401);
  assert.equal((await mutate(customerSession, 'POST', { action: 'login', email: first.email, password: winnerPassword })).status, 200);
  assert.equal((await get(customerOrders, bob.cookie)).status, 200, 'Changing one account does not revoke another customer');
  assert.deepEqual((await json(await get(customerOrders, activeCookie))).orders.find(row => row.id === id), edited);
  const [[{ password_hash: passwordHash }]] = await db.execute('SELECT password_hash FROM digimium_customers WHERE id = ?', [alice.id]);
  assert.ok(passwordHash.startsWith('scrypt-v1$') && !passwordHash.includes(winnerPassword));
  const attempts = [];
  for (let count = 0; count < 12; count++) {
    attempts.push((await changePassword({ currentPassword: 'incorrect', newPassword: randomUUID() }, activeCookie)).status);
  }
  assert.ok(attempts.includes(429), 'Password changes share a bounded account attempt window');

  for (let index = 0; index < 2; index++) {
    const added = await json(await submit({ requestId: randomUUID(), items: [custom] }, activeCookie), 201);
    const order = (await json(await get(adminCommerce, owner))).orders.find(row => row.id === added.id);
    await json(await mutate(adminCommerce + '/' + added.id, 'PATCH', { revision: order.revision,
      lines: order.lines.map(line => ({ id: line.id, startDate: '2028-01-01', endDate: '2028-03-01' })) }, owner));
  }
  const overview = (await json(await get(customerOrders + '?view=overview', activeCookie))).orders;
  assert.equal(overview.filter(order => order.status === 'approved').flatMap(order => order.lines).length, 3);
  assert.ok(overview.some(order => order.id === priced.id && order.status === 'pending'));
  assert.ok(overview.every(order => order.lines.every(line => !line.accountInfo)), 'Account preview never returns historical credentials');
  assert.ok(overview.every(order => order.lines.every(line => !Object.hasOwn(line, 'accountDetails'))), 'Account preview never returns structured credentials');
  const history = (await json(await get(customerOrders + '?view=history', activeCookie))).orders;
  assert.ok(history.some(order => order.id === priced.id && order.status === 'pending'), 'Full history includes pending orders for the status tabs');
  assert.ok(history.filter(order => order.status === 'pending').every(order => order.lines.every(line => !line.accountInfo)), 'Pending history never returns delivery credentials');
  assert.ok(history.filter(order => order.status === 'pending').every(order => order.lines.every(line => !Object.hasOwn(line, 'accountDetails'))), 'Pending history never returns structured credentials');
  assert.equal(history.filter(order => order.status === 'approved').flatMap(order => order.lines).length, 4);
  assert.equal(history.find(order => order.id === id).lines[0].accountInfo, privateDetails);
  assert.deepEqual(history.find(order => order.id === id).lines[0].accountDetails, deliveredAccount);
  assert.deepEqual((await json(await get(customerOrders + '?view=history&customerId=' + alice.id, bob.cookie))).orders, []);

  const guestSession = '/api/customer/guest-session';
  assert.equal((await mutate(guestSession, 'POST', {}, '', 'https://foreign.invalid')).status, 403);
  const guestStart = await mutate(guestSession, 'POST', {});
  const guestCookie = cookie(guestStart, 'digimium_local_guest');
  assert.deepEqual(await json(guestStart), { guest: true });
  const guestAgain = await mutate(guestSession, 'POST', {}, guestCookie);
  assert.equal(guestAgain.headers.get('set-cookie'), null, 'Established guest sessions survive preflight retries');
  assert.deepEqual(await json(guestAgain), { guest: true });
  assert.equal((await get(customerOrders, guestCookie)).status, 401);
  assert.equal((await json(await get(customerSession, guestCookie))).customer, null);
  const guestBody = { requestId: randomUUID(), items: [custom], guestName: '  ဒေါ်မြ  ' };
  assert.equal((await submit(guestBody, '')).status, 401);
  const changedToken = guestCookie.slice(0, -2) + (guestCookie.at(-2) === 'a' ? 'b' : 'a') + guestCookie.at(-1);
  assert.equal((await submit(guestBody, changedToken)).status, 401);
  assert.equal((await submit(guestBody, guestCookie, 'https://foreign.invalid')).status, 403);
  assert.deepEqual(await json(await submit({ ...guestBody, items: oversizedItems }, guestCookie), 400), collectionLimitError,
    'Guest checkout rejects oversized arrays before parsing or storing an order');
  assert.equal((await submit({ items: [custom], requestId: randomUUID() }, guestCookie)).status, 401,
    'A returning guest is offered the name form instead of an invalid-order error');
  const signedInDuringGuestForm = await json(await submit({ ...guestBody, requestId: randomUUID() }, bob.cookie), 201);
  assert.deepEqual(signedInDuringGuestForm.customer, { name: second.name, email: second.email },
    'The verified account wins when another tab signs in while the guest form is open');
  for (const guestName of ['', '  ', 'x'.repeat(101), 'First\nSecond', 12, null]) {
    assert.equal((await submit({ ...guestBody, guestName }, guestCookie)).status, 400);
  }
  assert.equal((await submit({ ...guestBody, customerId: alice.id }, guestCookie)).status, 400);
  const direct = { items: [custom], requestId: randomUUID(), checkoutMode: 'guest' };
  const bothCookies = bob.cookie + '; ' + guestCookie;
  assert.equal((await submit(direct, bob.cookie)).status, 401, 'Telegram-only checkout needs its own guest cookie');
  for (const malformed of [{ ...direct, checkoutMode: 'unknown' }, { ...direct, guestName: 'Unexpected' }, { ...direct, customerId: bob.id }]) {
    assert.equal((await submit(malformed, bothCookies)).status, 400);
  }
  const directCheckout = await json(await submit(direct, bothCookies), 201);
  assert.equal(directCheckout.customerId, null, 'Direct guest receipts never bind to a signed-in account');
  assert.deepEqual(directCheckout.customer, { name: null, email: null, guest: true });
  assert.deepEqual(await json(await submit(direct, guestCookie)), directCheckout, 'Signing out between guest attempts replays the same order');
  assert.equal((await submit({ ...guestBody, requestId: direct.requestId }, guestCookie)).status, 409,
    'A previously stored anonymous order cannot gain a nickname through a retry');
  const directRow = (await json(await get(adminCommerce, owner))).orders.find(row => row.id === directCheckout.id);
  assert.equal(directRow.customerId, null);
  assert.equal(directRow.guestName, undefined);
  assert.ok(!(await json(await get(customerOrders, bob.cookie))).orders.some(order => order.id === directCheckout.id));
  const signedOutDirect = await json(await submit({ ...direct, requestId: randomUUID() }, guestCookie), 201);
  assert.deepEqual(signedOutDirect.customer, directCheckout.customer);
  const guestResponses = await Promise.all([submit(guestBody, guestCookie), submit(guestBody, guestCookie)]);
  assert.deepEqual(guestResponses.map(response => response.status).sort(), [200, 201]);
  const guestResults = await Promise.all(guestResponses.map(response => json(response, response.status)));
  assert.deepEqual(guestResults[0], guestResults[1]);
  const guestCheckout = guestResults[0];
  assert.equal(guestCheckout.customerId, null, 'Legacy guest retries also retain guest ownership');
  assert.deepEqual(guestCheckout.customer, { name: 'ဒေါ်မြ', email: null, guest: true });
  assert.equal(guestCheckout.telegram, updatedContact);
  assert.equal((await submit({ ...guestBody, guestName: 'Different' }, guestCookie)).status, 409);
  assert.equal((await submit({ ...guestBody, items: [{ ...custom, quantity: 2 }] }, guestCookie)).status, 409);
  const guestAdmin = await json(await get(adminCommerce, owner));
  assert.equal(guestAdmin.customers.length, 2, 'Guest checkout never fabricates a registered customer');
  const guestOrder = guestAdmin.orders.find(order => order.id === guestCheckout.id);
  assert.equal(guestOrder.customerId, null);
  assert.equal(guestOrder.guestName, 'ဒေါ်မြ');
  assert.ok(!JSON.stringify(guestAdmin).includes('guest_key'));
  assert.ok(!(await json(await get(customerOrders, activeCookie))).orders.some(order => order.id === guestCheckout.id));
  const anotherGuestCookie = cookie(await mutate(guestSession, 'POST', {}), 'digimium_local_guest');
  const anotherGuest = await json(await submit(guestBody, anotherGuestCookie), 201);
  assert.notEqual(anotherGuest.id, guestCheckout.id, 'Same names and request IDs in independent browsers do not share orders');
  const guestApproval = { revision: guestOrder.revision,
    lines: guestOrder.lines.map(line => ({ id: line.id, startDate: '2028-03-01', endDate: '2028-04-01', accountDetails: emptyAccount })) };
  assert.equal((await mutate(adminCommerce + '/' + guestCheckout.id, 'PATCH', guestApproval, guestCookie)).status, 401);
  const approvedGuest = (await json(await mutate(adminCommerce + '/' + guestCheckout.id, 'PATCH', guestApproval, owner))).order;
  assert.equal(approvedGuest.status, 'approved');
  assert.equal(approvedGuest.guestName, 'ဒေါ်မြ');
  assert.equal(approvedGuest.lines[0].endDate, '2028-04-01');
  assert.equal(approvedGuest.lines[0].accountDetails, undefined, 'Explicitly blank optional fields allow initial approval');
  assert.deepEqual((await json(await get(adminCommerce, owner))).orders.find(order => order.id === guestCheckout.id), approvedGuest,
    'Guest fulfillment can be read back by admin with its own encryption ownership');
  assert.deepEqual(await json(await submit(guestBody, guestCookie)), guestCheckout,
    'Guest replay after approval returns only the original public purchase snapshot');
  // Fill this guest's limit window without writing twenty additional fixture orders.
  const guestKey = createHash('sha256').update(guestCookie.split('=')[1].split('.')[1]).digest('hex');
  const guestScope = createHash('sha256').update('guest-checkout:order:guest:' + guestKey).digest();
  await db.execute('UPDATE digimium_customer_auth_limits SET attempts = 20 WHERE bucket = ? AND scope_hash = ?',
    [Math.floor(Date.now() / 900000), guestScope]);
  assert.equal((await submit({ ...guestBody, requestId: randomUUID() }, guestCookie)).status, 429);
  assert.deepEqual(await json(await submit(guestBody, guestCookie)), guestCheckout, 'Safe retries remain available at the new-order limit');

  // A Google-only customer has no local password and must never see a fictitious password flow.
  const googleOnlyId = randomUUID();
  const googleOnlyEmail = 'google-only@example.invalid';
  const googleOnlyToken = randomBytes(32).toString('base64url');
  const googleOnlyCookie = 'digimium_local_customer=' + googleOnlyToken;
  await db.execute('INSERT INTO digimium_customers (id, name, email, password_hash, created_at) VALUES (?, ?, ?, NULL, UTC_TIMESTAMP())',
    [googleOnlyId, 'Google customer fixture', googleOnlyEmail]);
  await db.execute('INSERT INTO digimium_customer_sessions (token_hash, customer_id, expires_at) VALUES (?, ?, DATE_ADD(UTC_TIMESTAMP(), INTERVAL 1 HOUR))',
    [createHash('sha256').update(googleOnlyToken).digest(), googleOnlyId]);
  assert.deepEqual(await json(await mutate(customerEmailStep, 'POST', { email: googleOnlyEmail })), { next: 'google' });
  const googleOnlySession = await json(await get(customerSession, googleOnlyCookie));
  assert.equal(googleOnlySession.customer.id, googleOnlyId);
  assert.equal(googleOnlySession.customer.passwordAvailable, false);
  assert.ok(!Object.hasOwn(googleOnlySession.customer, 'password_hash'));
  assert.equal((await mutate(customerSession, 'POST', { action: 'login', email: googleOnlyEmail, password: randomUUID() })).status, 401);
  assert.deepEqual(await json(await mutate(customerSession, 'PATCH', { currentPassword: 'not-a-real-password', newPassword: randomUUID() }, googleOnlyCookie), 400),
    { error: 'provider_password' });
  await json(await mutate(customerSession, 'DELETE', {}, googleOnlyCookie));
  assert.equal((await json(await get(customerSession, googleOnlyCookie))).customer, null);
  await db.execute('DELETE FROM digimium_customers WHERE id = ?', [googleOnlyId]);

  // Telegram customers retain real account ownership/history with no fabricated email or password.
  const telegramId = randomUUID();
  const telegramUser = { id: '9999000012345', username: 'commerce_buyer' };
  const telegramToken = randomBytes(32).toString('base64url');
  const telegramCookie = 'digimium_local_customer=' + telegramToken;
  await db.execute('INSERT INTO digimium_customers (id, name, email, password_hash, created_at) VALUES (?, ?, NULL, NULL, UTC_TIMESTAMP())',
    [telegramId, 'Telegram customer fixture']);
  await db.execute('INSERT INTO digimium_telegram_identities (telegram_id, customer_id, username, created_at) VALUES (?, ?, ?, UTC_TIMESTAMP())',
    [telegramUser.id, telegramId, telegramUser.username]);
  await db.execute('INSERT INTO digimium_customer_sessions (token_hash, customer_id, expires_at) VALUES (?, ?, DATE_ADD(UTC_TIMESTAMP(), INTERVAL 1 HOUR))',
    [createHash('sha256').update(telegramToken).digest(), telegramId]);
  const telegramSession = (await json(await get(customerSession, telegramCookie))).customer;
  assert.equal(telegramSession.id, telegramId);
  assert.equal(telegramSession.email, null);
  assert.equal(telegramSession.passwordAvailable, false);
  assert.deepEqual(telegramSession.telegram, telegramUser);
  assert.deepEqual(await json(await mutate(customerSession, 'PATCH', { currentPassword: 'not-a-password', newPassword: randomUUID() }, telegramCookie), 400),
    { error: 'provider_password' });
  const telegramCheckout = await json(await submit({ requestId: randomUUID(), items: [custom] }, telegramCookie), 201);
  assert.deepEqual(telegramCheckout.customer, { name: telegramSession.name, email: null, telegram: telegramUser });
  const telegramAdmin = await json(await get(adminCommerce, owner));
  assert.deepEqual(telegramAdmin.customers.find(person => person.id === telegramId).telegram, telegramUser);
  assert.equal(telegramAdmin.customers.find(person => person.id === telegramId).email, null);
  const telegramOrder = telegramAdmin.orders.find(order => order.id === telegramCheckout.id);
  const telegramApproved = (await json(await mutate(adminCommerce + '/' + telegramOrder.id, 'PATCH', {
    revision: telegramOrder.revision, lines: telegramOrder.lines.map(line => ({ id: line.id, startDate: '2028-03-01', endDate: '2028-04-01' })),
  }, owner))).order;
  assert.deepEqual((await json(await get(customerOrders + '?view=history', telegramCookie))).orders, [telegramApproved]);
  assert.ok(!(await json(await get(customerOrders + '?view=history', activeCookie))).orders.some(order => order.id === telegramOrder.id));
  assert.ok(!(await json(await get(customerOrders + '?view=history', bob.cookie))).orders.some(order => order.id === telegramOrder.id));

  // Removal is an explicit admin operation against one exact order revision.
  // Every fixture below lives in the disposable loopback database guarded above.
  const removeOrder = (orderId, payload, session = owner, origin = base.origin) =>
    mutate(adminCommerce + '/' + orderId, 'DELETE', payload, session, origin);
  const allOrderRows = async () => (await db.query('SELECT * FROM digimium_orders ORDER BY id'))[0];
  const removableCheckout = await json(await submit({ requestId: randomUUID(), items: [custom] }, activeCookie), 201);
  const unrelatedCheckout = await json(await submit({ requestId: randomUUID(), items: [custom] }, bob.cookie), 201);
  const removalOrder = (await json(await get(adminCommerce, owner))).orders.find(order => order.id === removableCheckout.id);
  const removalBody = { revision: removalOrder.revision, confirmation: removalOrder.id };
  const removalPath = adminCommerce + '/' + removalOrder.id;
  const beforeInvalidRemoval = await allOrderRows();
  for (const session of ['', activeCookie, bob.cookie, guestCookie]) {
    await json(await removeOrder(removalOrder.id, removalBody, session), 401);
  }
  await json(await removeOrder(removalOrder.id, removalBody, owner, 'https://foreign.invalid'), 403);
  for (const invalid of [null, [], {}, { revision: removalOrder.revision }, { confirmation: removalOrder.id },
    { ...removalBody, confirmation: randomUUID() }, { ...removalBody, confirmation: removalOrder.id + ' ' },
    { ...removalBody, confirmation: 12 },
    { ...removalBody, revision: 0 }, { ...removalBody, revision: -1 }, { ...removalBody, revision: 1.5 },
    { ...removalBody, revision: '1' }, { ...removalBody, revision: null }, { ...removalBody, revision: 0x100000000 },
    { ...removalBody, customerId: bob.id }, { ...removalBody, approved: true }]) {
    await json(await removeOrder(removalOrder.id, invalid), 400);
  }
  if (removalOrder.id.toUpperCase() !== removalOrder.id) {
    await json(await removeOrder(removalOrder.id, { ...removalBody, confirmation: removalOrder.id.toUpperCase() }), 400);
  }
  await json(await request(removalPath, { method: 'DELETE', headers: {
    Origin: base.origin, Cookie: owner, 'Content-Type': 'application/json',
  }, body: '{' }), 400);
  await json(await request(removalPath, { method: 'DELETE', headers: {
    Origin: base.origin, Cookie: owner, 'Content-Type': 'text/plain',
  }, body: JSON.stringify(removalBody) }), 415);
  await json(await request(removalPath, { method: 'DELETE', headers: {
    Origin: base.origin, Cookie: owner, 'Content-Type': 'application/json',
  } }), 400);
  await json(await removeOrder(removalOrder.id, { ...removalBody, padding: 'x'.repeat(1024) }), 413);
  const notFoundRemoval = { error: 'Order not found.' };
  assert.deepEqual(await json(await removeOrder('not-a-uuid', removalBody), 404), notFoundRemoval);
  const absentOrderId = randomUUID();
  assert.deepEqual(await json(await removeOrder(absentOrderId, { revision: 1, confirmation: absentOrderId }), 404), notFoundRemoval);
  await json(await removeOrder(removalOrder.id, { ...removalBody, revision: removalOrder.revision + 1 }), 409);
  await json(await removeOrder(id, { revision: edited.revision - 1, confirmation: id }), 409);
  await json(await removeOrder(guestCheckout.id, { revision: guestOrder.revision, confirmation: guestCheckout.id }), 409);
  assert.deepEqual(await allOrderRows(), beforeInvalidRemoval,
    'Unauthorized, malformed and stale removals must not change any order row, including approved purchases');

  const beforeCustomerRemoval = await allOrderRows();
  assert.deepEqual(await json(await removeOrder(removalOrder.id, removalBody)), { removed: true, id: removalOrder.id });
  assert.deepEqual(await allOrderRows(), beforeCustomerRemoval.filter(row => row.id !== removalOrder.id),
    'Removing a pending customer order changes only the explicitly selected row');
  assert.deepEqual(await json(await removeOrder(removalOrder.id, removalBody), 404), notFoundRemoval);
  const customerHistoryAfterRemoval = (await json(await get(customerOrders + '?view=history', activeCookie))).orders;
  assert.ok(!customerHistoryAfterRemoval.some(order => order.id === removalOrder.id));
  assert.deepEqual(customerHistoryAfterRemoval.find(order => order.id === id), edited,
    'Approved purchases and encrypted delivery belonging to the same customer are preserved');
  assert.ok((await json(await get(customerOrders, bob.cookie))).orders.some(order => order.id === unrelatedCheckout.id),
    'Another customer’s pending order remains in that owner’s history');
  assert.equal((await json(await get(customerSession, activeCookie))).customer.id, alice.id,
    'Order removal never deletes the customer or revokes their session');

  // Both anonymous and legacy named pending guest orders use the same exact-revision removal.
  for (const guestId of [directCheckout.id, anotherGuest.id]) {
    const pendingGuest = (await json(await get(adminCommerce, owner))).orders.find(order => order.id === guestId);
    assert.equal(pendingGuest.status, 'pending');
    assert.equal(pendingGuest.customerId, null);
    const beforeGuestRemoval = await allOrderRows();
    assert.deepEqual(await json(await removeOrder(guestId, { revision: pendingGuest.revision, confirmation: guestId })),
      { removed: true, id: guestId });
    assert.deepEqual(await allOrderRows(), beforeGuestRemoval.filter(row => row.id !== guestId),
      'Guest removal cannot delete a different guest or customer order');
  }

  // Fresh confirmed revisions may also remove approved purchases and their
  // encrypted fulfillment, without deleting the customer or unrelated records.
  const approvedHistoryBeforeRemoval = (await json(await get(customerOrders + '?view=history', activeCookie))).orders;
  assert.ok(approvedHistoryBeforeRemoval.some(order => order.id === id && order.status === 'approved'));
  assert.ok((await json(await get(customerOrders + '?view=overview', activeCookie))).orders.some(order => order.id === id));
  const beforeApprovedCustomerRemoval = await allOrderRows();
  await json(await removeOrder(id, { revision: edited.revision, confirmation: id }, activeCookie), 401);
  await json(await removeOrder(id, { revision: edited.revision, confirmation: id }, owner, 'https://foreign.invalid'), 403);
  assert.deepEqual(await json(await removeOrder(id, { revision: edited.revision, confirmation: id })), { removed: true, id });
  assert.deepEqual(await allOrderRows(), beforeApprovedCustomerRemoval.filter(row => row.id !== id),
    'Approved-order removal deletes only the selected snapshot and encrypted fulfillment');
  const approvedHistoryAfterRemoval = (await json(await get(customerOrders + '?view=history', activeCookie))).orders;
  assert.deepEqual(approvedHistoryAfterRemoval, approvedHistoryBeforeRemoval.filter(order => order.id !== id),
    'The owning customer’s full history loses only the removed approved order');
  const overviewAfterApprovedRemoval = (await json(await get(customerOrders + '?view=overview', activeCookie))).orders;
  assert.ok(!overviewAfterApprovedRemoval.some(order => order.id === id));
  assert.ok(overviewAfterApprovedRemoval.flatMap(order => order.lines).every(line => !edited.lines.some(removed => removed.id === line.id)),
    'Removed purchased plans no longer appear in the account overview');
  assert.equal((await json(await get(customerSession, activeCookie))).customer.id, alice.id);

  const anonymousToApprove = (await json(await get(adminCommerce, owner))).orders.find(order => order.id === signedOutDirect.id);
  const approvedAnonymousGuest = (await json(await mutate(adminCommerce + '/' + anonymousToApprove.id, 'PATCH', {
    revision: anonymousToApprove.revision,
    lines: anonymousToApprove.lines.map(line => ({ id: line.id, startDate: '2028-03-01', endDate: '2028-04-01' })),
  }, owner))).order;
  for (const approvedGuestOrder of [approvedGuest, approvedAnonymousGuest]) {
    const beforeApprovedGuestRemoval = await allOrderRows();
    await json(await removeOrder(approvedGuestOrder.id,
      { revision: approvedGuestOrder.revision - 1, confirmation: approvedGuestOrder.id }), 409);
    await json(await removeOrder(approvedGuestOrder.id,
      { revision: approvedGuestOrder.revision, confirmation: approvedGuestOrder.id }, guestCookie), 401);
    assert.deepEqual(await json(await removeOrder(approvedGuestOrder.id,
      { revision: approvedGuestOrder.revision, confirmation: approvedGuestOrder.id })), { removed: true, id: approvedGuestOrder.id });
    assert.deepEqual(await allOrderRows(), beforeApprovedGuestRemoval.filter(row => row.id !== approvedGuestOrder.id),
      'Approved named/anonymous guest removal leaves every other customer and guest order unchanged');
  }

  // Approval increments revision under the same row lock. A previously confirmed
  // pending revision cannot remove the newly approved purchase without a fresh review.
  for (let attempt = 0; attempt < 3; attempt++) {
    const raceCheckout = await json(await submit({ requestId: randomUUID(), items: [custom] }, activeCookie), 201);
    const raceOrder = (await json(await get(adminCommerce, owner))).orders.find(order => order.id === raceCheckout.id);
    const beforeRace = await allOrderRows();
    const [approveResponse, removeResponse] = await Promise.all([
      mutate(adminCommerce + '/' + raceOrder.id, 'PATCH', { revision: raceOrder.revision,
        lines: raceOrder.lines.map(line => ({ id: line.id, startDate: '2028-03-01', endDate: '2028-04-01' })) }, owner),
      removeOrder(raceOrder.id, { revision: raceOrder.revision, confirmation: raceOrder.id }),
    ]);
    const raceRows = await allOrderRows();
    assert.deepEqual(raceRows.filter(row => row.id !== raceOrder.id), beforeRace.filter(row => row.id !== raceOrder.id),
      'The competing operations never affect unrelated orders');
    if (approveResponse.status === 200) {
      const raceApproved = (await json(approveResponse)).order;
      await json(removeResponse, 409);
      assert.equal(raceApproved.status, 'approved');
      assert.ok(raceRows.find(row => row.id === raceOrder.id)?.approved_at);
      await json(await removeOrder(raceOrder.id, { revision: raceOrder.revision, confirmation: raceOrder.id }), 409);
      assert.deepEqual(await allOrderRows(), raceRows, 'A stale pending confirmation cannot remove the approved race winner');
      assert.deepEqual(await json(await removeOrder(raceOrder.id,
        { revision: raceApproved.revision, confirmation: raceOrder.id })), { removed: true, id: raceOrder.id });
      assert.deepEqual(await allOrderRows(), raceRows.filter(row => row.id !== raceOrder.id),
        'The admin may remove that approved winner only after confirming its fresh revision');
    } else {
      await json(approveResponse, 404);
      assert.deepEqual(await json(removeResponse), { removed: true, id: raceOrder.id });
      assert.ok(!raceRows.some(row => row.id === raceOrder.id), 'Approval cannot recreate an order removed by the winning transaction');
    }
  }

  // Editing approved fulfillment also advances the revision. A deletion using
  // its older reviewed version must lose to that update, never erase it silently.
  for (let attempt = 0; attempt < 3; attempt++) {
    const checkoutToApprove = await json(await submit({ requestId: randomUUID(), items: [custom] }, activeCookie), 201);
    const pendingToApprove = (await json(await get(adminCommerce, owner))).orders.find(order => order.id === checkoutToApprove.id);
    const reviewedApproved = (await json(await mutate(adminCommerce + '/' + pendingToApprove.id, 'PATCH', {
      revision: pendingToApprove.revision,
      lines: pendingToApprove.lines.map(line => ({ id: line.id, startDate: '2028-03-01', endDate: '2028-04-01' })),
    }, owner))).order;
    const beforeApprovedRace = await allOrderRows();
    const [editResponse, removeResponse] = await Promise.all([
      mutate(adminCommerce + '/' + reviewedApproved.id, 'PATCH', { revision: reviewedApproved.revision,
        lines: reviewedApproved.lines.map(line => ({ id: line.id, startDate: '2028-03-01', endDate: '2028-05-01' })) }, owner),
      removeOrder(reviewedApproved.id, { revision: reviewedApproved.revision, confirmation: reviewedApproved.id }),
    ]);
    const afterApprovedRace = await allOrderRows();
    assert.deepEqual(afterApprovedRace.filter(row => row.id !== reviewedApproved.id),
      beforeApprovedRace.filter(row => row.id !== reviewedApproved.id), 'Approved update/removal never changes unrelated orders');
    if (editResponse.status === 200) {
      const revisedApproved = (await json(editResponse)).order;
      await json(removeResponse, 409);
      assert.equal(revisedApproved.revision, reviewedApproved.revision + 1);
      assert.equal(revisedApproved.lines[0].endDate, '2028-05-01');
      assert.deepEqual((await json(await get(customerOrders + '?view=history', activeCookie))).orders.find(order => order.id === revisedApproved.id), revisedApproved);
      await json(await removeOrder(reviewedApproved.id,
        { revision: reviewedApproved.revision, confirmation: reviewedApproved.id }), 409);
      assert.deepEqual(await allOrderRows(), afterApprovedRace, 'A stale approval revision cannot erase newer fulfillment edits');
      assert.deepEqual(await json(await removeOrder(revisedApproved.id,
        { revision: revisedApproved.revision, confirmation: revisedApproved.id })), { removed: true, id: revisedApproved.id });
    } else {
      await json(editResponse, 404);
      assert.deepEqual(await json(removeResponse), { removed: true, id: reviewedApproved.id });
      assert.ok(!afterApprovedRace.some(row => row.id === reviewedApproved.id));
    }
    assert.ok(!(await json(await get(customerOrders + '?view=history', activeCookie))).orders.some(order => order.id === reviewedApproved.id));
    assert.ok(!(await json(await get(customerOrders + '?view=overview', activeCookie))).orders.some(order => order.id === reviewedApproved.id));
  }

  const duplicateCheckout = await json(await submit({ requestId: randomUUID(), items: [custom] }, activeCookie), 201);
  const duplicatePending = (await json(await get(adminCommerce, owner))).orders.find(order => order.id === duplicateCheckout.id);
  const duplicateApproved = (await json(await mutate(adminCommerce + '/' + duplicatePending.id, 'PATCH', {
    revision: duplicatePending.revision,
    lines: duplicatePending.lines.map(line => ({ id: line.id, startDate: '2028-03-01', endDate: '2028-04-01' })),
  }, owner))).order;
  const beforeDuplicateRemoval = await allOrderRows();
  const duplicateRemovals = await Promise.all([1, 2].map(() => removeOrder(duplicateApproved.id,
    { revision: duplicateApproved.revision, confirmation: duplicateApproved.id })));
  assert.deepEqual(duplicateRemovals.map(response => response.status).sort(), [200, 404]);
  for (const response of duplicateRemovals) {
    const result = await json(response, response.status);
    assert.deepEqual(result, response.status === 200 ? { removed: true, id: duplicateApproved.id } : notFoundRemoval);
  }
  assert.deepEqual(await allOrderRows(), beforeDuplicateRemoval.filter(row => row.id !== duplicateApproved.id),
    'Concurrent duplicate approved removals delete exactly one selected record');

  // Customer-facing decisions/notes are separate from deletion and encrypted delivery.
  const readAdminOrder = async orderId => (await json(await get(adminCommerce, owner))).orders.find(order => order.id === orderId);
  const createDecisionOrder = async () => {
    const submission = { requestId: randomUUID(), items: [custom] };
    const placed = await json(await submit(submission, activeCookie), 201);
    return { placed, order: await readAdminOrder(placed.id), submission };
  };
  const patchOrder = (orderId, payload, session = owner, origin = base.origin) => mutate(adminCommerce + '/' + orderId, 'PATCH', payload, session, origin);
  const orderRow = async orderId => (await db.execute('SELECT * FROM digimium_orders WHERE id = ?', [orderId]))[0][0];
  const { placed: decisionCheckout, order: decisionPending, submission: decisionSubmission } = await createDecisionOrder();
  const rejection = { action: 'reject', revision: decisionPending.revision, customerNote: '  Customer notice\r\nရှင်းလင်းချက်  ' };
  for (const session of ['', activeCookie, bob.cookie, guestCookie]) await json(await patchOrder(decisionPending.id, rejection, session), 401);
  await json(await patchOrder(decisionPending.id, rejection, owner, 'https://foreign.invalid'), 403);
  for (const invalid of [{}, { ...rejection, revision: '1' }, { ...rejection, revision: 0 }, { ...rejection, revision: 0xffffffff },
    { ...rejection, customerNote: null }, { ...rejection, customerNote: 1 }, { ...rejection, customerNote: 'x'.repeat(1001) },
    { ...rejection, customerNote: 'bad\u0000note' }, { ...rejection, customerNote: 'bad\tnote' }, { ...rejection, customerNote: 'bad\u202enote' },
    { ...rejection, customerNote: 'bad\u2067note' }, { ...rejection, lines: [] }, { ...rejection, ownerId: bob.id },
    { action: 'note', revision: decisionPending.revision }, { action: 'approve', revision: decisionPending.revision }]) {
    await json(await patchOrder(decisionPending.id, invalid), 400);
  }
  await json(await patchOrder('not-an-order', rejection), 404);
  await json(await patchOrder(randomUUID(), rejection), 404);
  await json(await request(adminCommerce + '/' + decisionPending.id, { method: 'PATCH', headers: { Cookie: owner, Origin: base.origin, 'Content-Type': 'application/json' }, body: 'x'.repeat(2 * 1024 * 1024 + 1) }), 413);
  const beforeDecision = await orderRow(decisionPending.id);
  for (const customerNote of ['x'.repeat(1001), 'bad\u0001note']) {
    await json(await patchOrder(decisionPending.id, { revision: decisionPending.revision, customerNote,
      lines: decisionPending.lines.map(line => ({ id: line.id, startDate: '2028-01-01', endDate: '2028-02-01' })) }), 400);
  }
  assert.deepEqual(await orderRow(decisionPending.id), beforeDecision, 'Invalid decisions/notes cannot partially change an order');
  const rejected = (await json(await patchOrder(decisionPending.id, rejection))).order;
  assert.equal(rejected.status, 'rejected'); assert.equal(rejected.approvedAt, null); assert.ok(rejected.rejectedAt);
  assert.equal(rejected.customerNote, 'Customer notice\nရှင်းလင်းချက်'); assert.equal(rejected.revision, decisionPending.revision + 1);
  assert.ok(rejected.lines.every(line => line.startDate === null && line.endDate === null && !line.accountInfo && !Object.hasOwn(line, 'accountDetails')));
  const rejectedRow = await orderRow(rejected.id);
  assert.equal(rejectedRow.fulfillment, null); assert.equal(rejectedRow.snapshot, beforeDecision.snapshot);
  assert.equal(rejectedRow.customer_id, alice.id); assert.equal(rejectedRow.request_id, beforeDecision.request_id);
  // The original checkout retry remains a purchase snapshot, never a decision note or fulfillment record.
  assert.deepEqual(await json(await submit(decisionSubmission, activeCookie)), decisionCheckout);
  assert.ok(!Object.hasOwn(decisionCheckout.order, 'customerNote'));
  const rejectedHistory = (await json(await get(customerOrders + '?view=history', activeCookie))).orders;
  assert.deepEqual(rejectedHistory.find(order => order.id === rejected.id), rejected);
  assert.ok(!(await json(await get(customerOrders + '?view=overview', activeCookie))).orders.some(order => order.id === rejected.id));
  assert.ok(!(await json(await get(customerOrders + '?view=history', bob.cookie))).orders.some(order => order.id === rejected.id));
  await json(await patchOrder(rejected.id, { ...rejection, revision: rejected.revision }), 409);
  await json(await patchOrder(rejected.id, { revision: rejected.revision,
    lines: rejected.lines.map(line => ({ id: line.id, startDate: '2028-01-01', endDate: '2028-02-01' })) }), 409);
  await json(await patchOrder(rejected.id, { action: 'note', revision: decisionPending.revision, customerNote: 'stale' }), 409);
  const noteText = '<script>literal text only</script>\nမြန်မာ';
  const revisedRejection = (await json(await patchOrder(rejected.id, { action: 'note', revision: rejected.revision, customerNote: noteText }))).order;
  assert.equal(revisedRejection.status, 'rejected'); assert.equal(revisedRejection.rejectedAt, rejected.rejectedAt);
  assert.equal(revisedRejection.customerNote, noteText); assert.equal((await orderRow(rejected.id)).fulfillment, null);
  const clearedRejection = (await json(await patchOrder(rejected.id, { action: 'note', revision: revisedRejection.revision, customerNote: '  ' }))).order;
  assert.equal(clearedRejection.customerNote, ''); assert.equal(clearedRejection.status, 'rejected');
  const { order: noNotePending } = await createDecisionOrder();
  const noNoteRejected = (await json(await patchOrder(noNotePending.id, { action: 'reject', revision: noNotePending.revision }))).order;
  assert.equal(noNoteRejected.status, 'rejected'); assert.equal(noNoteRejected.customerNote, '', 'A rejection does not require a customer note');

  const { order: approveWithNote } = await createDecisionOrder();
  const noteLines = approveWithNote.lines.map(line => ({ id: line.id, startDate: '2028-01-01', endDate: '2028-02-01', accountDetails: deliveredAccount }));
  const notedApproval = (await json(await patchOrder(approveWithNote.id, { revision: approveWithNote.revision, lines: noteLines, customerNote: 'Approval message' }))).order;
  assert.equal(notedApproval.status, 'approved'); assert.equal(notedApproval.customerNote, 'Approval message');
  const originalNotedEnvelope = (await orderRow(notedApproval.id)).fulfillment;
  const noteOnlyApproval = (await json(await patchOrder(notedApproval.id, { action: 'note', revision: notedApproval.revision, customerNote: 'x'.repeat(1000) }))).order;
  assert.equal(noteOnlyApproval.approvedAt, notedApproval.approvedAt); assert.equal(noteOnlyApproval.customerNote.length, 1000);
  assert.equal((await orderRow(notedApproval.id)).fulfillment, originalNotedEnvelope, 'Note-only edits preserve encrypted fulfillment byte-for-byte');
  assert.deepEqual(noteOnlyApproval.lines, notedApproval.lines);
  await json(await patchOrder(notedApproval.id, { action: 'reject', revision: noteOnlyApproval.revision }), 409);
  const preservedNote = (await json(await patchOrder(notedApproval.id, { revision: noteOnlyApproval.revision, lines: noteLines }))).order;
  assert.equal(preservedNote.customerNote, noteOnlyApproval.customerNote, 'Legacy fulfillment PATCH without a note preserves it');
  const noteOverview = (await json(await get(customerOrders + '?view=overview', activeCookie))).orders;
  assert.ok(noteOverview.every(order => !Object.hasOwn(order, 'customerNote')), 'Brief account projections never return decision notes');

  const guestDecisionCheckout = await json(await submit({ checkoutMode: 'guest', requestId: randomUUID(), items: [custom] }, anotherGuestCookie), 201);
  const guestDecision = await readAdminOrder(guestDecisionCheckout.id);
  const guestRejection = (await json(await patchOrder(guestDecision.id, { action: 'reject', revision: guestDecision.revision, customerNote: 'Guest admin-only notice' }))).order;
  assert.equal(guestRejection.customerId, null); assert.equal(guestRejection.status, 'rejected');
  await json(await get(customerOrders + '?view=history', anotherGuestCookie), 401);
  assert.ok(!(await json(await get(customerOrders + '?view=history', activeCookie))).orders.some(order => order.id === guestRejection.id));

  // Every decision/edit/removal takes the same order lock and exact optimistic revision.
  for (let attempt = 0; attempt < 2; attempt++) {
    const { order: race } = await createDecisionOrder();
    const results = await Promise.all([
      patchOrder(race.id, { action: 'reject', revision: race.revision, customerNote: 'Reject winner' }),
      patchOrder(race.id, { revision: race.revision, customerNote: 'Approve winner', lines: race.lines.map(line => ({ id: line.id, startDate: '2028-01-01', endDate: '2028-02-01' })) }),
    ]);
    assert.deepEqual(results.map(response => response.status).sort(), [200, 409]);
    for (const response of results) await json(response, response.status);
    const winner = await readAdminOrder(race.id), row = await orderRow(race.id);
    assert.equal(winner.revision, race.revision + 1);
    assert.ok(winner.status === 'approved' ? row.approved_at && row.fulfillment && !row.rejected_at : row.rejected_at && !row.approved_at && !row.fulfillment);
    const competingNotes = await Promise.all(['first', 'second'].map(customerNote => patchOrder(race.id, { action: 'note', revision: winner.revision, customerNote })));
    assert.deepEqual(competingNotes.map(response => response.status).sort(), [200, 409]);
    for (const response of competingNotes) await json(response, response.status);
    const noteWinner = await readAdminOrder(race.id);
    const deleteRace = await Promise.all([
      patchOrder(race.id, { action: 'note', revision: noteWinner.revision, customerNote: 'newer' }),
      mutate(adminCommerce + '/' + race.id, 'DELETE', { revision: noteWinner.revision, confirmation: race.id }, owner),
    ]);
    assert.equal(deleteRace.filter(response => response.status === 200).length, 1);
    assert.ok(deleteRace.every(response => [200, 404, 409].includes(response.status)));
    for (const response of deleteRace) await json(response, response.status);
  }
  const rejectDelete = await mutate(adminCommerce + '/' + clearedRejection.id, 'DELETE', { revision: clearedRejection.revision, confirmation: clearedRejection.id }, owner);
  assert.deepEqual(await json(rejectDelete), { removed: true, id: clearedRejection.id });
  assert.equal(await orderRow(clearedRejection.id), undefined, 'Explicit DELETE also works for a rejected order');

  console.log('Commerce integration passed: legacy order migration, accounts, checkout, owner isolation, encrypted fulfillment, customer-facing notes, retained rejections, safe state projections and approval/reject/note/delete revision races.');
} finally {
  if (server && server.exitCode === null && !server.signalCode) {
    const exit = once(server, 'exit');
    server.kill('SIGTERM');
    const timeout = setTimeout(() => server.kill('SIGKILL'), 8000);
    try { await exit; } finally { clearTimeout(timeout); }
  }
  await db.end();
}
