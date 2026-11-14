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
  assert.equal((await mutate(customerSession, 'POST', first, '', 'https://foreign.invalid')).status, 403);
  const alice = await register(first);
  const bob = await register(second);
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
  for (const invalid of [{ ...item, productId: hidden.id }, { ...item, productId: unavailable.id }, { ...item, planId: 'draft' }, { ...item, planId: null }]) {
    assert.equal((await submit({ ...submission, items: [custom, invalid] })).status, 409, 'The entire cart must be accepted or rejected together');
  }
  const submitted = await Promise.all([submit(), submit()]);
  assert.deepEqual(submitted.map(r => r.status).sort(), [200, 201]);
  const [checkout, duplicate] = await Promise.all(submitted.map(r => json(r, r.status)));
  const { id } = checkout;
  assert.deepEqual(checkout, duplicate);
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
  assert.deepEqual(accountResponse.customer, { id: alice.id, name: first.name, email: first.email, createdAt: alice.createdAt });
  assert.deepEqual((await json(await get(customerOrders + '?customerId=' + alice.id, bob.cookie))).orders, []);
  assert.deepEqual((await json(await get(adminCommerce, owner))).orders.find(row => row.id === id), before[0]);
  const lines = before[0].lines.map(line => ({ id: line.id, startDate: '2028-02-29', endDate: '2028-03-29' }));
  const update = (payload, session = owner, origin = base.origin) => mutate(adminCommerce + '/' + id, 'PATCH', payload, session, origin);
  const approval = { lines, revision: before[0].revision };
  assert.equal((await update(approval, bob.cookie)).status, 401);
  assert.equal((await update(approval, owner, 'https://foreign.invalid')).status, 403);
  for (const bad of [[lines[0]], [lines[0], lines[0]], [{ ...lines[0], startDate: '2027-02-29' }, lines[1]],
    [{ ...lines[0], endDate: '2028-02-28' }, lines[1]]]) {
    assert.equal((await update({ ...approval, lines: bad })).status, 400);
  }
  const privateDetails = 'Private historical delivery ' + randomUUID();
  assert.equal((await update({ ...approval, lines: [{ ...lines[0], accountInfo: privateDetails }, lines[1]] })).status, 400);
  const saved = await Promise.all([update(approval), update(approval)]);
  assert.deepEqual(saved.map(r => r.status).sort(), [200, 409]);
  const approved = (await json(saved.find(r => r.status === 200))).order;
  assert.equal(approved.status, 'approved');
  assert.equal(approved.lines[0].accountInfo, '');
  assert.equal(approved.lines[1].accountInfo, '');
  assert.deepEqual((await json(await get(customerOrders, alice.cookie))).orders.find(row => row.id === id), approved);
  assert.deepEqual((await json(await get(customerOrders, bob.cookie))).orders, []);
  // Simulate a record encrypted by the release that accepted website credential delivery.
  const historical = lines.map((line, index) => ({ ...line, accountInfo: index ? '' : privateDetails }));
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
  const { order: edited } = await json(await update({ revision: approved.revision, lines: changedLines }));
  const [[stored]] = await db.execute('SELECT snapshot, fulfillment FROM digimium_orders WHERE id = ?', [id]);
  assert.ok(!Object.values(stored).some(value => value.includes(privateDetails)), 'No plaintext fulfillment in storage');
  assert.equal(edited.approvedAt, approved.approvedAt);
  assert.equal(edited.lines[0].endDate, changedLines[0].endDate);
  assert.equal(edited.lines[0].accountInfo, privateDetails, 'Date changes preserve historical encrypted delivery');
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
  assert.deepEqual((await json(changes[successful])).customer, { id: alice.id, name: first.name, email: first.email, createdAt: alice.createdAt });
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
  const history = (await json(await get(customerOrders + '?view=history', activeCookie))).orders;
  assert.ok(history.every(order => order.status === 'approved'));
  assert.equal(history.flatMap(order => order.lines).length, 4);
  assert.equal(history.find(order => order.id === id).lines[0].accountInfo, privateDetails);
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
    lines: guestOrder.lines.map(line => ({ id: line.id, startDate: '2028-03-01', endDate: '2028-04-01' })) };
  assert.equal((await mutate(adminCommerce + '/' + guestCheckout.id, 'PATCH', guestApproval, guestCookie)).status, 401);
  const approvedGuest = (await json(await mutate(adminCommerce + '/' + guestCheckout.id, 'PATCH', guestApproval, owner))).order;
  assert.equal(approvedGuest.status, 'approved');
  assert.equal(approvedGuest.guestName, 'ဒေါ်မြ');
  assert.equal(approvedGuest.lines[0].endDate, '2028-04-01');
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

  console.log('Commerce integration passed: account sessions, Telegram checkout, guest schema migration, isolated guests, exact retries, guest limits, date approvals, password rotation and owner-only history.');
} finally {
  if (server && server.exitCode === null && !server.signalCode) {
    const exit = once(server, 'exit');
    server.kill('SIGTERM');
    const timeout = setTimeout(() => server.kill('SIGKILL'), 8000);
    try { await exit; } finally { clearTimeout(timeout); }
  }
  await db.end();
}
