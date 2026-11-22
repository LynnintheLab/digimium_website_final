// Uses an EMPTY disposable loopback database and blocks outbound providers.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';
import { checkoutPaymentMethods } from '../lib/demo-payments.ts';

const demoMode = process.env.TEST_CHECKOUT_DEMO === '1';
const env = { ...process.env, ADMIN_EMAIL: 'owner@example.invalid', ADMIN_AUTH_SECRET: randomUUID(),
  ORDER_FULFILLMENT_SECRET: randomUUID(), RESEND_FROM_EMAIL: 'digimium@example.invalid', RESEND_API_KEY: 're_integration_fixture',
  GOOGLE_CLIENT_ID: '', GOOGLE_CLIENT_SECRET: '', TELEGRAM_BOT_TOKEN: '', TELEGRAM_BOT_USERNAME: '', TELEGRAM_WEBHOOK_SECRET: '',
  ADMIN_TELEGRAM_BOT_TOKEN: '', ADMIN_TELEGRAM_CHAT_ID: '' };
const base = new URL(env.APP_ORIGIN || 'http://invalid');
assert.ok(base.origin === env.APP_ORIGIN && base.protocol === 'http:' && base.hostname === '127.0.0.1' && base.port &&
  env.DB_HOST === '127.0.0.1' && /^digimium_test_[a-z0-9_]+$/.test(env.DB_NAME) && env.DB_USER && env.DB_PASSWORD,
  'Use an empty disposable loopback digimium_test_* database and unused HTTP port.');
// The opt-in changes server configuration and request headers only. Transport stays loopback.
const applicationOrigin = demoMode ? 'https://test.buywith-digimium.store' : base.origin;
assert.equal(checkoutPaymentMethods(undefined, 'https://buywith-digimium.store'), undefined);
assert.equal(checkoutPaymentMethods(undefined, 'https://test.buywith-digimium.store.example.invalid'), undefined);
const cookiePrefix = demoMode ? '__Host-digimium_' : 'digimium_local_';
env.APP_ORIGIN = applicationOrigin;
const root = new URL('../', import.meta.url);
const db = await mysql.createConnection({ host: env.DB_HOST, port: Number(env.DB_PORT || 3306), user: env.DB_USER,
  password: env.DB_PASSWORD, database: env.DB_NAME, multipleStatements: true });
let server;
const messages = [];
const request = (path, options = {}) => {
  const target = new URL(path, base);
  assert.equal(target.origin, base.origin, 'Every fixture request must stay on the loopback server.');
  return fetch(target, { ...options,
    headers: { Host: new URL(applicationOrigin).host, ...options.headers },
    redirect: 'manual', signal: AbortSignal.timeout(15000) });
};
const get = (path, session = '') => request(path, { headers: { Cookie: session } });
const mutate = (path, method, body, session = '', origin = applicationOrigin) => request(path, {
  method, headers: { Origin: origin, Cookie: session, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});
async function json(response, status = 200) {
  assert.equal(response.status, status, 'Unexpected status at ' + new URL(response.url).pathname);
  assert.match(response.headers.get('cache-control') || '', /no-store/);
  assert.match(response.headers.get('vary') || '', /cookie/i);
  return response.json();
}
function cookie(response, name) {
  const raw = response.headers.getSetCookie().find(value => value.startsWith(name + '='));
  assert.match(raw ?? '', /httponly/i);
  if (demoMode) assert.match(raw, /; secure(?:;|$)/i);
  return raw.split(';')[0];
}
async function addCustomer(name) {
  const id = randomUUID(), token = randomBytes(32).toString('base64url');
  await db.execute('INSERT INTO digimium_customers (id, name, email, password_hash, created_at) VALUES (?, ?, ?, ?, UTC_TIMESTAMP(3))',
    [id, name, name.toLowerCase() + '@example.invalid', 'fixture-password-' + randomUUID()]);
  await db.execute('INSERT INTO digimium_customer_sessions (token_hash, customer_id, expires_at) VALUES (?, ?, DATE_ADD(UTC_TIMESTAMP(), INTERVAL 1 HOUR))',
    [createHash('sha256').update(token).digest(), id]);
  return { id, cookie: cookiePrefix + 'customer=' + token };
}
const png = await readFile(new URL('public/assets/symbol-blue.png', root));
const anotherPng = await readFile(new URL('public/assets/logo.png', root));
const orderPath = id => '/api/customer/orders/' + id;
const adminPath = id => '/api/admin/commerce/' + id;
const proof = (id, revision, requestId, session, body = png, mime = 'image/png', origin = applicationOrigin) => request(
  orderPath(id) + '/proof?revision=' + revision + '&requestId=' + requestId,
  { method: 'POST', headers: { Cookie: session, Origin: origin, 'Content-Type': mime }, body });

try {
  assert.equal((await db.query('SHOW TABLES'))[0].length, 0, 'Refusing to mutate an initialized database.');
  const probe = createServer();
  await new Promise((resolve, reject) => probe.once('error', reject).listen(Number(base.port), base.hostname, resolve));
  await new Promise(resolve => probe.close(resolve));
  for (const file of ['schema.sql', 'customer-auth-schema.sql', 'order-schema.sql', 'google-identity-schema.sql',
    'telegram-identity-schema.sql', 'google-auth-schema.sql', 'telegram-auth-schema.sql', 'giveaway-schema.sql', 'notification-schema.sql']) {
    await db.query(await readFile(new URL('hostinger/' + file, root), 'utf8'));
  }
  // Exercise the additive migration against the previous order schema.
  await db.query('ALTER TABLE digimium_orders DROP COLUMN checkout_state, DROP COLUMN customer_inputs');
  const alice = await addCustomer('CheckoutFixture'), bob = await addCustomer('OtherFixture');
  const guestId = randomUUID();
  const oldSnapshot = JSON.stringify({ lines: [{ id: randomUUID(), productId: 'legacy', planId: null,
    productName: 'Earlier guest order', planName: null, duration: '1 month', price: '1000 MMK', quantity: 1 }], totalMmk: 1000 });
  await db.execute(`INSERT INTO digimium_orders (id, customer_id, guest_key, request_id, request_hash, created_at, snapshot)
    VALUES (?, NULL, ?, ?, ?, ?, ?)`, [guestId, randomBytes(32), randomUUID(), randomBytes(32), new Date().toISOString(), oldSnapshot]);
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
  const mail = once(server, 'message', { signal: AbortSignal.timeout(10000) });
  const login = (fields, session = '') => request('/admin/session', { method: 'POST',
    headers: { Origin: applicationOrigin, Cookie: session }, body: new URLSearchParams(fields) });
  const challenge = await login({ action: 'request', email: env.ADMIN_EMAIL });
  const [message] = await mail;
  const owner = cookie(await login({ action: 'verify', code: message.code }, cookie(challenge, cookiePrefix + 'challenge')), cookiePrefix + 'admin');
  const legacy = await json(await get(adminPath(guestId), owner));
  assert.equal(legacy.order.checkout, undefined);
  assert.deepEqual(legacy.customerInputs, []);
  const original = await json(await get('/api/admin/catalog', owner));
  const fields = [{ id: 'email', label: 'Service email', type: 'email', required: true },
    { id: 'password', label: 'Service password', type: 'password', required: true }];
  const product = { ...original.products[0], id: 'checkout-service', published: true, availability: 'available',
    checkoutFields: fields, plans: [
      { id: 'monthly', name: 'Monthly', price: '1234 MMK', duration: '1 month', published: true },
      { id: 'provided', name: 'Provided account', price: '2000 MMK', duration: '1 month', published: true, checkoutFields: [] },
      { id: 'username', name: 'Username only', price: '1000 MMK', duration: '1 month', published: true,
        checkoutFields: [{ id: 'username', label: 'Username', type: 'text', required: true }] },
      { id: 'optional', name: 'Optional detail', price: '1000 MMK', duration: '1 month', published: true,
        checkoutFields: [{ id: 'nickname', label: 'Nickname', type: 'text', required: false }] },
      { id: 'constructor-field', name: 'Constructor field fixture', price: '1000 MMK', duration: '1 month', published: true,
        checkoutFields: [{ id: 'constructor', label: 'Service reference', type: 'text', required: true }] },
    ] };
  const inquiry = { ...product, id: 'checkout-inquiry', price: '', discountPrice: '', plans: [], checkoutFields: [], availability: 'on-request' };
  const free = { ...inquiry, id: 'checkout-free', price: '0 MMK' };
  const methods = ['kpay', 'aya', 'wave', 'binance'].map(id => ({ id, enabled: true,
    accountName: 'Disposable recipient', accountNumber: 'fixture-' + id, instructions: 'Fixture only.', ...(id === 'binance' ? { mmkPerUsdt: 4000 } : {}) }));
  const settings = { ...original.settings, paymentMethods: methods };
  const products = [product, inquiry, free];
  const save = (nextProducts, nextSettings, revision) => mutate('/api/admin/catalog', 'PUT',
    { products: nextProducts, settings: nextSettings, expectedRevision: revision }, owner);
  let baselineRevision = original.revision;
  if (demoMode) {
    const noPaymentSettings = { ...original.settings };
    delete noPaymentSettings.paymentMethods;
    const demoCatalog = await json(await save(products, noPaymentSettings, baselineRevision));
    const [[beforeDemoReads]] = await db.query("SELECT payload, revision FROM digimium_catalog WHERE id = 'main'");
    const demoPublic = await (await get('/api/catalog')).json();
    assert.deepEqual(demoPublic.paymentMethodIds, ['kpay', 'aya', 'wave', 'binance']);
    assert.equal(demoPublic.demoPayments, true);
    assert.equal(demoPublic.settings.paymentMethods, undefined);
    assert.equal((await json(await get('/api/admin/catalog', owner))).settings.paymentMethods, undefined);
    let demoOrder = (await json(await mutate('/api/customer/checkout', 'POST', {
      requestId: randomUUID(), expectedCustomerId: alice.id, expectedCatalogRevision: demoCatalog.revision,
      items: [{ productId: product.id, planId: 'provided', quantity: 1 }],
    }, alice.cookie), 201)).order;
    for (const methodId of ['kpay', 'aya', 'wave', 'binance']) {
      demoOrder = (await json(await mutate(orderPath(demoOrder.id) + '/payment', 'PATCH',
        { revision: demoOrder.revision, methodId }, alice.cookie))).order;
      const payment = demoOrder.checkout.payment;
      assert.equal(payment.method.demo, true);
      assert.equal(payment.method.id, methodId);
      assert.equal(payment.method.accountNumber, 'DEMO-' + methodId.toUpperCase() + '-NO-PAYMENT');
      assert.equal(payment.method.qrPath, '/assets/demo-payments/' + methodId + '.png');
      assert.equal(payment.amount, methodId === 'binance' ? '0.50' : '2000');
      assert.equal(payment.currency, methodId === 'binance' ? 'USDT' : 'MMK');
      const qr = await get(payment.method.qrPath);
      assert.equal(qr.status, 200);
      assert.match(qr.headers.get('content-type'), /image\/png/);
      const qrBytes = Buffer.from(await qr.arrayBuffer());
      assert.deepEqual(qrBytes.subarray(0, 8), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
      assert.ok(qrBytes.length > 100);
    }
    const exampleProof = Buffer.from(await (await get(demoOrder.checkout.payment.method.qrPath)).arrayBuffer());
    demoOrder = (await json(await proof(demoOrder.id, demoOrder.revision, randomUUID(), alice.cookie, exampleProof))).order;
    demoOrder = (await json(await mutate(adminPath(demoOrder.id), 'PATCH',
      { action: 'payment-approve', revision: demoOrder.revision }, owner))).order;
    demoOrder = (await json(await mutate(adminPath(demoOrder.id), 'PATCH', { revision: demoOrder.revision,
      lines: demoOrder.lines.map(line => ({ id: line.id, startDate: '2028-01-01', endDate: '2028-02-01',
        accountDetails: { account: 'demo-delivery@example.invalid', password: 'demo-delivery-fixture', manager: '', username: '' } })),
    }, owner))).order;
    assert.equal(demoOrder.checkout.stage, 'completed');
    assert.equal(demoOrder.checkout.payment.method.demo, true);
    assert.equal((await json(await get(orderPath(demoOrder.id), alice.cookie))).order.lines[0].accountDetails.password, 'demo-delivery-fixture');
    const [[afterDemoReads]] = await db.query("SELECT payload, revision FROM digimium_catalog WHERE id = 'main'");
    assert.deepEqual(afterDemoReads, beforeDemoReads, 'Demo reads and checkout never persist demo configuration to the catalog');
    const disabled = await json(await save(products, { ...noPaymentSettings, paymentMethods: [] }, demoCatalog.revision));
    const disabledPublic = await (await get('/api/catalog')).json();
    assert.deepEqual(disabledPublic.paymentMethodIds, []);
    assert.notEqual(disabledPublic.demoPayments, true);
    const disabledOrder = (await json(await mutate('/api/customer/checkout', 'POST', {
      requestId: randomUUID(), expectedCustomerId: alice.id, expectedCatalogRevision: disabled.revision,
      items: [{ productId: product.id, planId: 'provided', quantity: 1 }],
    }, alice.cookie), 201)).order;
    await json(await mutate(orderPath(disabledOrder.id) + '/payment', 'PATCH',
      { revision: disabledOrder.revision, methodId: 'kpay' }, alice.cookie), 409);
    baselineRevision = disabled.revision;
  }
  for (const [offers, config] of [
    [[{ ...product, checkoutFields: [fields[0], fields[0]] }], settings],
    [products, { ...settings, paymentMethods: [methods[0], methods[0]] }],
    [products, { ...settings, paymentMethods: [{ ...methods[0], accountNumber: '' }] }],
    [products, { ...settings, paymentMethods: [{ ...methods[3], mmkPerUsdt: undefined }] }],
    [products, { ...settings, paymentMethods: [{ ...methods[3], mmkPerUsdt: -1 }] }],
    [products, { ...settings, paymentMethods: [{ ...methods[0], qrPath: 'https://untrusted.invalid/qr.png' }] }],
    [products, { ...settings, paymentMethods: [{ ...methods[0], qrPath: '/media/logos/' + randomUUID() + '.png' }] }],
  ]) await json(await save(offers, config, baselineRevision), 400);
  let catalog = await json(await save(products, settings, baselineRevision));
  const publicResponse = await get('/api/catalog');
  assert.equal(publicResponse.status, 200);
  const publicCatalog = await publicResponse.json();
  assert.equal(publicCatalog.settings.paymentMethods, undefined);
  assert.deepEqual(publicCatalog.paymentMethodIds, ['kpay', 'aya', 'wave', 'binance']);
  assert.notEqual(publicCatalog.demoPayments, true, 'Explicit saved recipient settings take precedence over demo defaults');
  assert.ok(!JSON.stringify(publicCatalog).includes('fixture-kpay'), 'Public catalog contains payment availability without recipient details');
  const input = { requestId: randomUUID(), expectedCustomerId: alice.id, expectedCatalogRevision: catalog.revision,
    items: [{ productId: product.id, planId: 'monthly', quantity: 2, inputs: [
      { unit: 0, values: { email: 'account-one@example.invalid', password: 'private-fixture-one' } },
      { unit: 1, values: { email: 'account-two@example.invalid', password: 'private-fixture-two' } },
    ] }] };
  const create = (body = input, session = alice.cookie, origin = applicationOrigin) => mutate('/api/customer/checkout', 'POST',
    { expectedCustomerId: alice.id, ...body }, session, origin);
  await json(await create(input, ''), 401);
  await json(await create({ ...input, expectedCustomerId: undefined }), 400);
  await json(await create({ ...input, expectedCustomerId: 'invalid-customer' }), 400);
  await json(await create(input, bob.cookie), 409);
  assert.equal((await db.execute('SELECT id FROM digimium_orders WHERE request_id = ?', [input.requestId]))[0].length, 0,
    'Changing the signed-in browser account cannot transfer customer inputs into another account');
  await json(await create(input, alice.cookie, 'https://foreign.invalid'), 403);
  await json(await request('/api/customer/checkout', { method: 'POST', headers: { Cookie: alice.cookie, 'Content-Type': 'application/json' }, body: '{}' }), 403);
  await json(await create({ ...input, expectedCatalogRevision: catalog.revision - 1 }), 409);
  for (const bad of [
    { ...input, checkoutMode: 'guest' }, { ...input, customerId: bob.id },
    { ...input, items: [{ ...input.items[0], unitPriceMmk: 1 }] },
    { ...input, items: [{ ...input.items[0], inputs: undefined }] },
    { ...input, items: [{ ...input.items[0], inputs: [input.items[0].inputs[0], input.items[0].inputs[0]] }] },
    { ...input, items: [{ ...input.items[0], quantity: 1, inputs: [{ unit: 0, values: { email: 'bad', password: 'x' } }] }] },
    { ...input, items: [{ ...input.items[0], quantity: 1, inputs: [{ unit: 0, values: { email: 'x@example.invalid', password: 'x', extra: 'x' } }] }] },
    { ...input, items: [{ productId: product.id, planId: 'constructor-field', quantity: 1, inputs: [{ unit: 0, values: {} }] }] },
  ]) await json(await create(bad), 400);
  const unitInputs = quantity => Array.from({ length: quantity }, (_, unit) => ({ unit,
    values: { email: 'bounded-' + unit + '@example.invalid', password: 'bounded-fixture-secret' } }));
  await json(await create({ ...input, items: [{ ...input.items[0], quantity: 101, inputs: unitInputs(101) }] }), 400);
  await json(await create({ ...input, items: [
    { ...input.items[0], quantity: 60, inputs: unitInputs(60) },
    { productId: product.id, planId: 'username', quantity: 60, inputs: Array.from({ length: 60 }, (_, unit) => ({ unit, values: { username: 'bounded-user' } })) },
  ] }), 400);
  await json(await create({ ...input, requestId: randomUUID(), items: [{ ...input.items[0], quantity: 100, inputs: unitInputs(100) }] }), 201);
  const concurrent = await Promise.all([create(), create()]);
  assert.deepEqual(concurrent.map(response => response.status).sort(), [200, 201]);
  const saved = await Promise.all(concurrent.map(response => json(response, response.status)));
  let order = saved[0].order;
  assert.equal(saved[1].order.id, order.id);
  assert.equal(order.totalMmk, 2468);
  assert.equal(order.checkout.stage, 'awaiting_payment');
  const secrets = input.items[0].inputs.flatMap(unit => Object.values(unit.values));
  const safe = value => secrets.forEach(secret => assert.ok(!JSON.stringify(value).includes(secret), 'Private customer inputs never appear in metadata'));
  safe(saved);
  const snapshotAtCreation = JSON.stringify(order.lines);
  const full = await json(await get(orderPath(order.id), alice.cookie));
  assert.equal(full.customerInputs.length, 2);
  assert.equal(full.customerInputs[0].fields[1].value, 'private-fixture-one');
  assert.deepEqual((await json(await get(adminPath(order.id), owner))).customerInputs, full.customerInputs);
  await json(await get(orderPath(order.id), bob.cookie), 404);
  await json(await get(adminPath(order.id), alice.cookie), 401);
  safe(await json(await get(orderPath(order.id) + '?view=status', alice.cookie)));
  safe(await json(await get('/api/customer/orders?view=overview', alice.cookie)));
  safe(await json(await get('/api/customer/orders?view=history', alice.cookie)));
  safe(await json(await get('/api/admin/commerce', owner)));
  const [[stored]] = await db.execute('SELECT snapshot, customer_inputs FROM digimium_orders WHERE id = ?', [order.id]);
  safe(stored);
  assert.ok(stored.customer_inputs.length > 30);
  safe((await db.query('SELECT * FROM digimium_notification_outbox'))[0]);
  await json(await create({ ...input, items: [{ ...input.items[0], quantity: 1, inputs: [input.items[0].inputs[0]] }] }), 409);
  catalog = await json(await save([{ ...product, name: 'Changed catalog name' }, inquiry, free], settings, catalog.revision));
  assert.equal(JSON.stringify((await json(await create())).order.lines), snapshotAtCreation, 'Exact retry recovers the old snapshot after catalog edits');
  assert.equal((await json(await get('/api/customer/checkout?requestId=' + input.requestId, alice.cookie))).order.id, order.id);
  await json(await get('/api/customer/checkout?requestId=' + input.requestId, bob.cookie), 404);
  const fulfill = revision => ({ revision, lines: order.lines.map(line => ({ id: line.id, startDate: '2028-01-01', endDate: '2028-02-01',
    accountDetails: { account: 'delivered@example.invalid', password: 'delivered-fixture-secret', manager: '', username: '' } })) });
  await json(await mutate(adminPath(order.id), 'PATCH', fulfill(order.revision), owner), 409);
  await json(await mutate(orderPath(order.id) + '/payment', 'PATCH', { revision: order.revision, methodId: 'kpay' }, bob.cookie), 404);
  for (const methodId of ['kpay', 'aya', 'wave', 'binance']) {
    order = (await json(await mutate(orderPath(order.id) + '/payment', 'PATCH', { revision: order.revision, methodId }, alice.cookie))).order;
    assert.equal(order.checkout.payment.method.id, methodId);
  }
  assert.equal(order.checkout.payment.amount, '0.62');
  assert.equal(order.checkout.payment.currency, 'USDT');
  const fixedPayment = structuredClone(order.checkout.payment);
  catalog = await json(await save(products, { ...settings, paymentMethods: methods.map(method => method.id === 'binance'
    ? { ...method, mmkPerUsdt: 5000, accountNumber: 'new-fixture-recipient' } : method) }, catalog.revision));
  assert.deepEqual((await json(await get(orderPath(order.id) + '?view=status', alice.cookie))).order.checkout.payment, fixedPayment,
    'The selected payment destination and amount are frozen for this order');
  const firstProofId = randomUUID();
  await json(await proof(order.id, order.revision, firstProofId, ''), 401);
  await json(await proof(order.id, order.revision, firstProofId, bob.cookie), 404);
  await json(await proof(order.id, order.revision, firstProofId, alice.cookie, png, 'image/png', 'https://foreign.invalid'), 403);
  await json(await proof(order.id, order.revision, firstProofId, alice.cookie, png, 'image/jpeg'), 415);
  await json(await proof(order.id, order.revision, firstProofId, alice.cookie, Buffer.from('<svg/>'), 'image/svg+xml'), 415);
  await json(await proof(order.id, order.revision, firstProofId, alice.cookie, Buffer.alloc(5 * 1024 * 1024 + 1)), 413);
  await json(await proof(order.id, order.revision - 1, firstProofId, alice.cookie), 409);
  const uploadRevision = order.revision;
  const uploads = await Promise.all([proof(order.id, uploadRevision, firstProofId, alice.cookie), proof(order.id, uploadRevision, firstProofId, alice.cookie)]);
  const uploaded = await Promise.all(uploads.map(response => json(response)));
  assert.deepEqual(uploaded[0], uploaded[1]);
  order = uploaded[0].order;
  assert.equal(order.checkout.stage, 'payment_review');
  await json(await proof(order.id, uploadRevision, firstProofId, alice.cookie, anotherPng), 409);
  await json(await proof(order.id, order.revision, randomUUID(), alice.cookie), 409);
  await json(await get(order.checkout.payment.proofUrl), 401);
  await json(await get(order.checkout.payment.proofUrl, bob.cookie), 404);
  for (const session of [alice.cookie, owner]) {
    const image = await get(order.checkout.payment.proofUrl, session);
    assert.equal(image.status, 200);
    assert.match(image.headers.get('cache-control'), /no-store/);
    assert.equal(image.headers.get('content-type'), 'image/png');
    assert.deepEqual(Buffer.from(await image.arrayBuffer()), png);
  }
  const [[storedProof]] = await db.execute('SELECT image_bytes FROM digimium_order_proofs WHERE order_id = ?', [order.id]);
  assert.ok(!storedProof.image_bytes.equals(png), 'Private payment screenshot is encrypted at rest');
  await json(await mutate(adminPath(order.id), 'PATCH', { action: 'payment-approve', revision: order.revision - 1 }, owner), 409);
  await json(await mutate(adminPath(order.id), 'PATCH', { action: 'payment-approve', revision: order.revision }, alice.cookie), 401);
  order = (await json(await mutate(adminPath(order.id), 'PATCH', { action: 'payment-reject', revision: order.revision, note: 'Please upload a clear receipt.' }, owner))).order;
  assert.equal(order.checkout.stage, 'payment_rejected');
  assert.equal(order.checkout.payment.note, 'Please upload a clear receipt.');
  const replacementId = randomUUID();
  order = (await json(await proof(order.id, order.revision, replacementId, alice.cookie, anotherPng))).order;
  assert.equal(order.checkout.stage, 'payment_review');
  assert.equal((await json(await proof(order.id, uploadRevision, firstProofId, alice.cookie))).order.revision, order.revision,
    'An old upload retry never replaces the newer proof');
  order = (await json(await mutate(adminPath(order.id), 'PATCH', { action: 'payment-approve', revision: order.revision, note: 'Payment checked.' }, owner))).order;
  assert.equal(order.checkout.stage, 'processing');
  assert.equal(order.status, 'pending');
  await json(await mutate(adminPath(order.id), 'PATCH', { action: 'quote', revision: order.revision, lines: order.lines.map(line => ({ id: line.id, unitPriceMmk: 1 })) }, owner), 409);
  order = (await json(await mutate(adminPath(order.id), 'PATCH', fulfill(order.revision), owner))).order;
  assert.equal(order.checkout.stage, 'completed');
  assert.equal(order.status, 'approved');
  assert.equal((await json(await get(orderPath(order.id), alice.cookie))).order.lines[0].accountDetails.password, 'delivered-fixture-secret');
  const retried = await json(await create());
  assert.equal(retried.order.id, order.id);
  assert.ok(!JSON.stringify(retried).includes('delivered-fixture-secret'), 'Checkout replay never exposes delivery credentials');
  const override = await json(await create({ requestId: randomUUID(), expectedCatalogRevision: catalog.revision,
    items: [{ productId: product.id, planId: 'provided', quantity: 1 }] }), 201);
  assert.deepEqual((await json(await get(orderPath(override.order.id), alice.cookie))).customerInputs, []);
  let conversion = override.order;
  for (const [unitPriceMmk, amount] of [[350, '0.07'], [2468, '0.49'], [25, '0.01']]) {
    conversion = (await json(await mutate(adminPath(conversion.id), 'PATCH', { action: 'quote', revision: conversion.revision,
      lines: [{ id: conversion.lines[0].id, unitPriceMmk }] }, owner))).order;
    conversion = (await json(await mutate(orderPath(conversion.id) + '/payment', 'PATCH',
      { revision: conversion.revision, methodId: 'binance' }, alice.cookie))).order;
    assert.equal(conversion.checkout.payment.amount, amount, 'USDT uses exact decimal half-up rounding to two places');
  }
  conversion = (await json(await mutate(adminPath(conversion.id), 'PATCH', { action: 'quote', revision: conversion.revision,
    lines: [{ id: conversion.lines[0].id, unitPriceMmk: 24 }] }, owner))).order;
  await json(await mutate(orderPath(conversion.id) + '/payment', 'PATCH',
    { revision: conversion.revision, methodId: 'binance' }, alice.cookie), 409);
  await json(await create({ requestId: randomUUID(), expectedCatalogRevision: catalog.revision,
    items: [{ productId: product.id, planId: 'username', quantity: 1, inputs: [{ unit: 0, values: { username: 'fixture-user' } }] }] }), 201);
  await json(await create({ requestId: randomUUID(), expectedCatalogRevision: catalog.revision,
    items: [{ productId: product.id, planId: 'optional', quantity: 1 }] }), 201);
  await json(await create({ requestId: randomUUID(), expectedCatalogRevision: catalog.revision,
    items: [{ productId: product.id, planId: 'constructor-field', quantity: 1, inputs: [{ unit: 0, values: { constructor: 'constructor-fixture' } }] }] }), 201);
  let quoted = (await json(await create({ requestId: randomUUID(), expectedCatalogRevision: catalog.revision,
    items: [{ productId: inquiry.id, planId: null, quantity: 2 }] }), 201)).order;
  assert.equal(quoted.checkout.stage, 'quote_required');
  await json(await mutate(orderPath(quoted.id) + '/payment', 'PATCH', { revision: quoted.revision, methodId: 'kpay' }, alice.cookie), 409);
  await json(await mutate(adminPath(quoted.id), 'PATCH', { action: 'quote', revision: quoted.revision,
    lines: [{ id: quoted.lines[0].id, unitPriceMmk: Number.MAX_SAFE_INTEGER }] }, owner), 400);
  quoted = (await json(await mutate(adminPath(quoted.id), 'PATCH', { action: 'quote', revision: quoted.revision,
    lines: [{ id: quoted.lines[0].id, unitPriceMmk: 3333 }] }, owner))).order;
  assert.equal(quoted.totalMmk, 6666);
  assert.equal(quoted.checkout.stage, 'awaiting_payment');
  const complimentary = (await json(await create({ requestId: randomUUID(), expectedCatalogRevision: catalog.revision,
    items: [{ productId: free.id, planId: null, quantity: 1 }] }), 201)).order;
  assert.equal(complimentary.checkout.stage, 'processing');
  assert.equal((await json(await mutate(adminPath(complimentary.id), 'PATCH', { revision: complimentary.revision,
    lines: complimentary.lines.map(line => ({ id: line.id, startDate: '2028-01-01', endDate: '2028-02-01' })) }, owner))).order.status, 'approved');
  await json(await mutate(adminPath(order.id), 'DELETE', { revision: order.revision, confirmation: order.id }, owner));
  assert.equal((await db.execute('SELECT * FROM digimium_order_proofs WHERE order_id = ?', [order.id]))[0].length, 0);
  await json(await get(orderPath(order.id) + '/proof?version=' + firstProofId, alice.cookie), 404);
  const removable = await addCustomer('PaymentCascadeFixture');
  let removalOrder = (await json(await create({ requestId: randomUUID(), expectedCustomerId: removable.id, expectedCatalogRevision: catalog.revision,
    items: [{ productId: product.id, planId: 'provided', quantity: 1 }] }, removable.cookie), 201)).order;
  removalOrder = (await json(await mutate(orderPath(removalOrder.id) + '/payment', 'PATCH',
    { revision: removalOrder.revision, methodId: 'kpay' }, removable.cookie))).order;
  removalOrder = (await json(await proof(removalOrder.id, removalOrder.revision, randomUUID(), removable.cookie))).order;
  const customer = await json(await get('/api/admin/customers/' + removable.id, owner));
  await json(await mutate('/api/admin/customers/' + removable.id, 'DELETE', { version: customer.version, confirmation: removable.id }, owner));
  assert.equal((await db.execute('SELECT * FROM digimium_order_proofs WHERE order_id = ?', [removalOrder.id]))[0].length, 0,
    'Deleting an owned customer also removes private proof versions through the order cascade');
  for (let attempt = 0; attempt < 3; attempt++) {
    const racer = await addCustomer('CheckoutRace' + attempt);
    const record = await json(await get('/api/admin/customers/' + racer.id, owner));
    const [created, removed] = await Promise.all([
      create({ requestId: randomUUID(), expectedCustomerId: racer.id, expectedCatalogRevision: catalog.revision,
        items: [{ productId: product.id, planId: 'provided', quantity: 1 }] }, racer.cookie),
      mutate('/api/admin/customers/' + racer.id, 'DELETE', { version: record.version, confirmation: racer.id }, owner),
    ]);
    if (created.status === 201) {
      await json(created, 201);
      await json(removed, 409);
    } else {
      await json(created, 401);
      await json(removed);
    }
  }
  const [[guest]] = await db.execute('SELECT snapshot, fulfillment, checkout_state, customer_inputs FROM digimium_orders WHERE id = ?', [guestId]);
  assert.equal(guest.snapshot, oldSnapshot);
  assert.equal(guest.fulfillment, null);
  assert.equal(guest.checkout_state, null);
  assert.equal(guest.customer_inputs, null);
  assert.deepEqual(messages.map(message => message.type), ['otp-mail']);
  console.log('Website checkout integration passed: old schema/catalog, per-product/plan and unit fields, encryption/redaction, strict auth/origin, retries, quotes, four methods/USDT rate snapshots, private bounded proofs, reject/resubmit/review, fulfillment and deletion cascade.');
} finally {
  if (server && server.exitCode === null && !server.signalCode) {
    const exited = once(server, 'exit');
    server.kill('SIGTERM');
    const deadline = setTimeout(() => server.kill('SIGKILL'), 8000);
    try { await exited; } finally { clearTimeout(deadline); }
  }
  await db.end();
}
