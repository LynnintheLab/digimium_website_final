// Run after npm run build. Uses the same disposable database/origin settings as test:hostinger.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
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
  assert.deepEqual(Object.keys(customer).sort(), ['email', 'id', 'name']);
  return { ...customer, cookie: session };
}

try {
  const [tables] = await db.query('SHOW TABLES');
  assert.equal(tables.length, 0, 'Refusing to create fixtures in a nonempty database.');
  const probe = createServer();
  await new Promise((resolve, reject) => probe.once('error', reject).listen(Number(base.port), base.hostname, resolve));
  await new Promise(resolve => probe.close(resolve));
  await db.query(await readFile(new URL('hostinger/schema.sql', root), 'utf8'));
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
  const saveCatalog = (products, expectedRevision) => mutate('/api/admin/catalog', 'PUT', { products, expectedRevision, settings: original.settings }, owner);
  await json(await saveCatalog([product, inquiry, hidden, unavailable], original.revision));
  const item = { productId: product.id, planId: plan.id, quantity: 2 };
  const custom = { productId: inquiry.id, planId: null, quantity: 1 };
  const submission = { items: [item, custom], requestId: randomUUID() };
  const submit = (body = submission, session = alice.cookie, origin = base.origin) => mutate(customerOrders, 'POST', body, session, origin);
  assert.equal((await submit(submission, '')).status, 401);
  assert.equal((await submit(submission, alice.cookie, 'https://foreign.invalid')).status, 403);
  assert.equal((await submit({ ...submission, customerId: bob.id })).status, 400);
  assert.equal((await submit({ ...submission, items: [{ ...item, price: '1 MMK' }] })).status, 400);
  for (const invalid of [{ ...item, productId: hidden.id }, { ...item, productId: unavailable.id }, { ...item, planId: 'draft' }, { ...item, planId: null }]) {
    assert.equal((await submit({ ...submission, items: [custom, invalid] })).status, 409, 'The entire cart must be accepted or rejected together');
  }
  const submitted = await Promise.all([submit(), submit()]);
  assert.deepEqual(submitted.map(r => r.status).sort(), [200, 201]);
  const [{ id }, duplicate] = await Promise.all(submitted.map(r => json(r, r.status)));
  assert.equal(id, duplicate.id);
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
  await json(await saveCatalog([inquiry], original.revision + 1));
  assert.equal((await json(await submit())).id, id, 'Checkout retries still work after a catalog change');
  assert.deepEqual((await json(await get(customerOrders + '?customerId=' + alice.id, bob.cookie))).orders, []);
  assert.deepEqual((await json(await get(adminCommerce, owner))).orders.find(row => row.id === id), before[0]);
  const lines = before[0].lines.map((line, index) => ({ id: line.id, startDate: '2028-02-29', endDate: '2028-03-29',
    accountInfo: index === 0 ? 'Private test credentials ' + randomUUID() : '' }));
  const update = (payload, session = owner, origin = base.origin) => mutate(adminCommerce + '/' + id, 'PATCH', payload, session, origin);
  const approval = { lines, revision: before[0].revision };
  assert.equal((await update(approval, bob.cookie)).status, 401);
  assert.equal((await update(approval, owner, 'https://foreign.invalid')).status, 403);
  for (const bad of [[lines[0]], [lines[0], lines[0]], [{ ...lines[0], startDate: '2027-02-29' }, lines[1]],
    [{ ...lines[0], endDate: '2028-02-28' }, lines[1]]]) {
    assert.equal((await update({ ...approval, lines: bad })).status, 400);
  }
  const saved = await Promise.all([update(approval), update(approval)]);
  assert.deepEqual(saved.map(r => r.status).sort(), [200, 409]);
  const approved = (await json(saved.find(r => r.status === 200))).order;
  assert.equal(approved.status, 'approved');
  assert.equal(approved.lines[0].accountInfo, lines[0].accountInfo);
  assert.equal(approved.lines[1].accountInfo, '');
  assert.deepEqual((await json(await get(customerOrders, alice.cookie))).orders.find(row => row.id === id), approved);
  assert.deepEqual((await json(await get(customerOrders, bob.cookie))).orders, []);
  const [[stored]] = await db.execute('SELECT snapshot, fulfillment FROM digimium_orders WHERE id = ?', [id]);
  assert.ok(!Object.values(stored).some(value => value.includes(lines[0].accountInfo)), 'No plaintext fulfillment in storage');
  const changedLines = [{ ...lines[0], accountInfo: 'Replacement credentials', endDate: '2028-04-29' }, lines[1]];
  const { order: edited } = await json(await update({ revision: approved.revision, lines: changedLines }));
  assert.equal(edited.approvedAt, approved.approvedAt);
  assert.equal(edited.lines[0].endDate, changedLines[0].endDate);
  assert.equal(edited.lines[0].accountInfo, changedLines[0].accountInfo);
  assert.equal(edited.lines[0].price, '1,500 MMK');
  await json(await mutate(customerSession, 'DELETE', {}, alice.cookie));
  assert.equal((await get(customerOrders, alice.cookie)).status, 401);
  const again = await mutate(customerSession, 'POST', { action: 'login', email: first.email, password: first.password });
  const newCookie = cookie(again, 'digimium_local_customer');
  assert.deepEqual((await json(await get(customerOrders, newCookie))).orders.find(row => row.id === id), edited);
  console.log('Commerce integration passed: account sessions, pending checkout, exact retries, per-line fulfillment and owner-only history.');
} finally {
  if (server && server.exitCode === null && !server.signalCode) {
    const exit = once(server, 'exit');
    server.kill('SIGTERM');
    const timeout = setTimeout(() => server.kill('SIGKILL'), 8000);
    try { await exit; } finally { clearTimeout(timeout); }
  }
  await db.end();
}
