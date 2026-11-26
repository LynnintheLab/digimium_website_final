// Uses an EMPTY disposable loopback database and blocks outbound providers.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createCipheriv, createHash, createHmac, randomBytes, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';
import { checkoutPaymentMethods } from '../lib/demo-payments.ts';

const demoMode = process.env.TEST_CHECKOUT_DEMO === '1';
const orderBotMode = process.env.TEST_CHECKOUT_ORDER_BOT === '1';
const orderBotActionMode = demoMode && orderBotMode;
const env = { ...process.env, ADMIN_EMAIL: 'owner@example.invalid', ADMIN_AUTH_SECRET: randomUUID(),
  ORDER_FULFILLMENT_SECRET: randomUUID(), RESEND_FROM_EMAIL: 'digimium@example.invalid', RESEND_API_KEY: 're_integration_fixture',
  GOOGLE_CLIENT_ID: '', GOOGLE_CLIENT_SECRET: '', TELEGRAM_BOT_TOKEN: '', TELEGRAM_BOT_USERNAME: '', TELEGRAM_WEBHOOK_SECRET: '',
  ADMIN_TELEGRAM_BOT_TOKEN: orderBotMode ? 'legacy_fixture_must_not_receive_order_alerts' : '',
  ADMIN_TELEGRAM_CHAT_ID: orderBotMode ? '123456789' : '',
  ORDER_ALERTS_TELEGRAM_BOT_TOKEN: orderBotMode ? '99990001:order_alerts_fixture_1234567890' : '',
  ORDER_ALERTS_TELEGRAM_CHAT_ID: orderBotMode ? '987654321' : '',
  ORDER_ALERTS_TELEGRAM_PAYMENT_TOPIC_ID: orderBotMode ? '11' : '',
  ORDER_ALERTS_TELEGRAM_ORDERS_TOPIC_ID: orderBotMode ? '12' : '',
  ORDER_ALERTS_TELEGRAM_REGISTRATION_TOPIC_ID: orderBotMode ? '13' : '',
  ORDER_ALERTS_TELEGRAM_FULFILLMENT_TOPIC_ID: orderBotActionMode ? '14' : '',
  ORDER_ALERTS_TELEGRAM_WEBHOOK_SECRET: orderBotActionMode ? randomBytes(32).toString('base64url') : '',
  NOTIFICATIONS_CRON_SECRET: randomUUID(), FIXTURE_ORDER_ALERT_FAILURE: '0' };
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
const contact = { method: 'telegram', value: '@checkout_contact_fixture' };
const orderPath = id => '/api/customer/orders/' + id;
const adminPath = id => '/api/admin/commerce/' + id;
const proof = (id, revision, requestId, session, body = png, mime = 'image/png', origin = applicationOrigin) => request(
  orderPath(id) + '/proof?revision=' + revision + '&requestId=' + requestId,
  { method: 'POST', headers: { Cookie: session, Origin: origin, 'Content-Type': mime }, body });
const orderAlerts = () => messages.filter(message => message.type === 'order-alert');
const alertsFor = (thread, id) => orderAlerts().filter(message => message.fields.message_thread_id === thread &&
  message.fields.text.includes(id.replaceAll('-', '').slice(0, 8).toUpperCase()));
const customerUpdatesFor = id => messages.filter(message => message.type === 'customer-order-update' &&
  message.fields.text.includes(id.slice(0, 8).toUpperCase()));
async function expectCustomerUpdates(id, count) {
  for (let attempt = 0; attempt < 100 && customerUpdatesFor(id).length < count; attempt++) await delay(10);
  const updates = customerUpdatesFor(id);
  assert.equal(updates.length, count);
  for (const { fields } of updates) {
    assert.equal(fields.chat_id, 987654330, 'Status goes to the verified owner of the website order');
    assert.equal(fields.reply_markup.inline_keyboard[0][0].url, applicationOrigin + '/checkout?order=' + id);
  }
  return updates.map(update => update.fields.text);
}
const actionButton = (thread, orderId, label, index = 0) => {
  const button = alertsFor(thread, orderId)[index].fields.reply_markup.inline_keyboard.flat().find(item => item.text === label);
  assert.ok(button?.callback_data && Buffer.byteLength(button.callback_data) <= 64);
  return button.callback_data;
};
function clickOrderButton(data, thread, { sender = 987654321, secret = env.ORDER_ALERTS_TELEGRAM_WEBHOOK_SECRET } = {}) {
  return request('/api/internal/order-bot/webhook', { method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Telegram-Bot-Api-Secret-Token': secret },
    body: JSON.stringify({ callback_query: { id: '921804481976302994', data, from: { id: sender, is_bot: false },
      message: { date: 1795450000, message_id: 25, message_thread_id: thread,
        chat: { id: 987654321, type: 'private' }, from: { id: 99990001, is_bot: true } } } }),
  });
}
async function callbackReply(response, text, alert = false) {
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.method, 'answerCallbackQuery');
  assert.match(payload.text, text);
  assert.equal(payload.show_alert, alert);
}
function askTelegramStatus(text, { sender = 987654330, chatId = sender, chatType = 'private', secret = env.ORDER_ALERTS_TELEGRAM_WEBHOOK_SECRET } = {}) {
  return request('/api/internal/order-bot/webhook', { method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Telegram-Bot-Api-Secret-Token': secret },
    body: JSON.stringify({ message: { text, from: { id: sender, is_bot: false }, chat: { id: chatId, type: chatType }, message_thread_id: 50 } }),
  });
}
async function statusReply(response, recipient) {
  assert.equal(response.status, 200);
  const reply = await response.json();
  assert.equal(reply.method, 'sendMessage');
  assert.equal(reply.chat_id, recipient);
  assert.equal(reply.message_thread_id, 50);
  assert.equal(reply.protect_content, true);
  return reply;
}
async function alertMode(mode, audience = 'admin') {
  const id = randomUUID();
  await new Promise((resolve, reject) => {
    const received = message => {
      if (message.type !== 'order-alert-control' || message.id !== id) return;
      clearTimeout(deadline);
      server.off('message', received);
      resolve();
    };
    const deadline = setTimeout(() => {
      server.off('message', received);
      reject(new Error('The notification fixture did not acknowledge its mode.'));
    }, 5000);
    server.on('message', received);
    server.send({ type: 'order-alert-control', id, mode, audience });
  });
}
async function expectAlerts(thread, id, count) {
  for (let attempt = 0; attempt < 100 && alertsFor(thread, id).length < count; attempt++) await delay(10);
  assert.equal(alertsFor(thread, id).length, count);
}
const runNotificationJob = () => request('/api/internal/notifications/run', { method: 'POST',
  headers: { Authorization: 'Bearer ' + env.NOTIFICATIONS_CRON_SECRET } }).then(response => json(response));

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
  await db.query('ALTER TABLE digimium_orders DROP COLUMN checkout_state, DROP COLUMN customer_inputs, DROP COLUMN delivery_draft');
  const alice = await addCustomer('CheckoutFixture'), bob = await addCustomer('OtherFixture');
  if (orderBotActionMode) await db.execute(`INSERT INTO digimium_telegram_identities (telegram_id, customer_id, created_at)
    VALUES ('987654330', ?, UTC_TIMESTAMP(3)), ('987654331', ?, UTC_TIMESTAMP(3))`, [alice.id, bob.id]);
  const guestId = randomUUID();
  const oldSnapshot = JSON.stringify({ lines: [{ id: randomUUID(), productId: 'legacy', planId: null,
    productName: 'Earlier guest order', planName: null, duration: '1 month', price: '1000 MMK', quantity: 1 }], totalMmk: 1000 });
  await db.execute(`INSERT INTO digimium_orders (id, customer_id, guest_key, request_id, request_hash, created_at, snapshot)
    VALUES (?, NULL, ?, ?, ?, ?, ?)`, [guestId, randomBytes(32), randomUUID(), randomBytes(32), new Date().toISOString(), oldSnapshot]);
  server = spawn(process.execPath, ['--import', new URL(orderBotMode ? 'tests/fixtures/order-alerts-fetch.mjs' : 'tests/fixtures/resend-fetch.mjs', root).href,
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
  const legacyAlertId = randomUUID();
  if (orderBotMode) {
    const legacyPayload = { kind: 'customer-created', dedupeKey: 'legacy-fixture:' + legacyAlertId,
      entityId: alice.id, customerName: 'Private legacy fixture' };
    await db.execute(`INSERT INTO digimium_notification_outbox (id, dedupe_key, kind, entity_id, payload, created_at, next_attempt_at)
      VALUES (?, ?, 'customer-created', ?, ?, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))`,
    [legacyAlertId, legacyPayload.dedupeKey, alice.id, JSON.stringify(legacyPayload)]);
    const registration = { action: 'register', name: 'Private Registration Fixture',
      email: 'private-registration@example.invalid', password: 'private-registration-fixture-password' };
    const registered = await json(await mutate('/api/customer/session', 'POST', registration), 201);
    await expectAlerts(13, registered.customer.id, 1);
    assert.match(alertsFor(13, registered.customer.id)[0].fields.text, /^New Digimium customer\nAccount #[\dA-F]{8}\nSign-in: email$/i);
    assert.equal(alertsFor(12, registered.customer.id).length, 0, 'Registrations stay out of the Orders topic');
    await json(await mutate('/api/customer/session', 'POST', { ...registration, action: 'login' }));
    assert.equal(alertsFor(13, registered.customer.id).length, 1, 'Signing in does not create another registration alert');
    const [[registrationOutbox]] = await db.execute('SELECT kind, sent_at FROM digimium_notification_outbox WHERE dedupe_key = ?',
      ['customer-created:' + registered.customer.id]);
    assert.equal(registrationOutbox.kind, 'bot:customer-created');
    assert.ok(registrationOutbox.sent_at);
  }
  const original = await json(await get('/api/admin/catalog', owner));
  const fields = [{ id: 'email', label: 'Service email', type: 'email', required: true },
    { id: 'password', label: 'Service password', type: 'password', required: true }];
  const product = { ...original.products[0], id: 'checkout-service', name: 'Fixture Service API Key', published: true, availability: 'available',
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
      requestId: randomUUID(), expectedCustomerId: alice.id, expectedCatalogRevision: demoCatalog.revision, contact,
      items: [{ productId: product.id, planId: 'provided', quantity: 1 }],
    }, alice.cookie), 201)).order;
    if (orderBotMode) {
      await expectAlerts(12, demoOrder.id, 1);
      const orderAlert = alertsFor(12, demoOrder.id)[0].fields.text;
      assert.match(orderAlert, /^New Digimium order\nOrder #/);
      assert.ok(orderAlert.split('\n').includes('Items: Fixture Service API Key · Provided account × 1'));
      assert.equal(alertsFor(13, demoOrder.id).length, 0, 'New orders stay out of the Registration topic');
    }
    if (orderBotActionMode) {
      const [pending] = await expectCustomerUpdates(demoOrder.id, 1);
      assert.match(pending, /Fixture Service API Key · Provided account\n\nPending · ငွေပေးချေရန်/);
    }
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
    if (orderBotMode) {
      await expectAlerts(11, demoOrder.id, 1);
      assert.match(alertsFor(11, demoOrder.id)[0].fields.text, /^Demo payment proof/);
    }
    const deliveryForm = { revision: demoOrder.revision,
      lines: demoOrder.lines.map(line => ({ id: line.id, startDate: '2028-01-01', endDate: '2028-02-01',
        accountDetails: { account: 'demo-delivery@example.invalid', password: 'demo-delivery-fixture', manager: '', username: '' } })),
    };
    if (orderBotActionMode) {
      assert.ok(alertsFor(12, demoOrder.id)[0].fields.reply_markup.inline_keyboard.flat().every(button => !button.callback_data));
      const originalReceipt = { hash: createHash('sha256').update(exampleProof).digest('hex'), mime: 'image/png' };
      assert.deepEqual(alertsFor(11, demoOrder.id)[0].receipt, originalReceipt);
      const paymentButton = actionButton(11, demoOrder.id, 'Approve payment');
      assert.equal((await clickOrderButton(paymentButton, 11, { secret: 'incorrect-secret' })).status, 403);
      await callbackReply(await clickOrderButton(paymentButton, 11, { sender: 987654322 }), /store owner/, true);
      await callbackReply(await clickOrderButton(paymentButton, 12), /unavailable/, true);
      await callbackReply(await clickOrderButton(paymentButton + 'x', 11), /unavailable/, true);
      await json(await mutate(adminPath(demoOrder.id), 'PATCH', {
        action: 'order-approve', revision: demoOrder.revision, requestId: randomUUID(),
      }, owner), 400);
      const preview = { action: 'payment-proof-preview', revision: demoOrder.revision };
      await json(await mutate(adminPath(demoOrder.id), 'PATCH', preview, alice.cookie), 401);
      await json(await mutate(adminPath(demoOrder.id), 'PATCH', { ...preview, revision: demoOrder.revision - 1 }, owner), 409);
      assert.equal((await json(await mutate(adminPath(demoOrder.id), 'PATCH', preview, owner))).order.revision, demoOrder.revision);
      await expectAlerts(11, demoOrder.id, 2);
      assert.deepEqual(alertsFor(11, demoOrder.id)[1].receipt, originalReceipt);
      await json(await mutate(adminPath(demoOrder.id), 'PATCH', preview, owner));
      await expectAlerts(11, demoOrder.id, 2);
      assert.equal(alertsFor(14, demoOrder.id).length, 0);
      const pending = await json(await get(orderPath(demoOrder.id), alice.cookie));
      assert.equal(pending.order.checkout.stage, 'payment_review');
      const command = '/start order_' + demoOrder.id;
      const reviewStatus = await statusReply(await askTelegramStatus(command), 987654330);
      assert.match(reviewStatus.text, /ငွေပေးချေမှု စစ်ဆေးနေသည်/);
      assert.match((await expectCustomerUpdates(demoOrder.id, 2)).at(-1), /Pending · ငွေပေးချေမှု စစ်ဆေးနေသည်/);
      assert.ok(reviewStatus.reply_markup.inline_keyboard.flat().some(item => item.url.endsWith(demoOrder.id)));
      assert.ok(!(await statusReply(await askTelegramStatus(command, { sender: 987654331 }), 987654331)).text.includes(demoOrder.id.slice(0, 8).toUpperCase()));
      assert.equal(await (await askTelegramStatus(command, { chatId: 987654331 })).text(), '');
      assert.equal(await (await askTelegramStatus(command, { chatType: 'group' })).text(), '');
      assert.equal((await askTelegramStatus(command, { secret: 'incorrect-secret' })).status, 403);
      await callbackReply(await clickOrderButton(paymentButton, 11), /Payment approved/);
      await expectAlerts(14, demoOrder.id, 1);
      assert.match((await expectCustomerUpdates(demoOrder.id, 3)).at(-1), /Pending · ဝန်ဆောင်မှု ပြင်ဆင်နေသည်/);
      const previousSendButton = actionButton(14, demoOrder.id, 'Send order');
      assert.match((await statusReply(await askTelegramStatus('/status'), 987654330)).text, /ဝန်ဆောင်မှု ပြင်ဆင်နေသည်/);
      demoOrder = (await json(await get(adminPath(demoOrder.id) + '?view=status', owner))).order;
      await json(await mutate(adminPath(demoOrder.id), 'PATCH', {
        ...deliveryForm, revision: demoOrder.revision, action: 'stage-delivery', customerNote: 'Prepared again for the updated draft.',
        lines: deliveryForm.lines.map(line => ({ ...line, accountInfo: 'Optional product note for the customer.' })),
      }, owner));
      assert.ok(!JSON.stringify(await json(await get(orderPath(demoOrder.id), alice.cookie))).includes('demo-delivery-fixture'));
      await expectAlerts(14, demoOrder.id, 2);
      await callbackReply(await clickOrderButton(previousSendButton, 14), /changed|out of date/, true);
      const sendButton = actionButton(14, demoOrder.id, 'Send order', 1);
      await callbackReply(await clickOrderButton(sendButton, 14), /Delivery sent/);
      await callbackReply(await clickOrderButton(sendButton, 14), /already recorded/);
      demoOrder = (await json(await get(orderPath(demoOrder.id) + '?view=status', alice.cookie))).order;
      assert.equal(demoOrder.customerNote, 'Prepared again for the updated draft.');
      const deliveredOrder = (await json(await get(orderPath(demoOrder.id), alice.cookie))).order;
      assert.equal(deliveredOrder.lines[0].accountInfo, 'Optional product note for the customer.');
      const finalStatus = await statusReply(await askTelegramStatus(command), 987654330);
      assert.match(finalStatus.text, /ဝန်ဆောင်မှု ပေးပြီး/);
      const updates = await expectCustomerUpdates(demoOrder.id, 4);
      assert.match(updates.at(-1), /Fixture Service API Key · Provided account\n\nPurchased · ဝန်ဆောင်မှု ပေးပြီး/);
      for (const privateValue of ['demo-delivery-fixture', 'demo-delivery@example.invalid', 'Optional product note', demoOrder.customerNote]) {
        assert.ok(!JSON.stringify({ alerts: alertsFor(14, demoOrder.id), finalStatus, updates }).includes(privateValue));
      }
    } else {
      demoOrder = (await json(await mutate(adminPath(demoOrder.id), 'PATCH',
        { action: 'payment-approve', revision: demoOrder.revision }, owner))).order;
      demoOrder = (await json(await mutate(adminPath(demoOrder.id), 'PATCH', { ...deliveryForm, revision: demoOrder.revision }, owner))).order;
    }
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
      requestId: randomUUID(), expectedCustomerId: alice.id, expectedCatalogRevision: disabled.revision, contact,
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
    { expectedCustomerId: alice.id, contact, ...body }, session, origin);
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
  for (const missingOrInvalid of [undefined, null, { method: 'telegram', value: ' ' },
    { method: 'telegram', value: 'https://other.example.invalid/profile' },
    { method: 'email', value: 'fixture@example.invalid' }]) {
    await json(await create({ ...input, contact: missingOrInvalid }), 400);
  }
  assert.equal((await db.execute('SELECT id FROM digimium_orders WHERE request_id = ?', [input.requestId]))[0].length, 0);
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
  if (orderBotMode) await expectAlerts(12, order.id, 1);
  if (orderBotActionMode) await expectCustomerUpdates(order.id, 1);
  assert.equal(saved[1].order.id, order.id);
  assert.equal(order.totalMmk, 2468);
  assert.equal(order.checkout.stage, 'awaiting_payment');
  const secrets = [...input.items[0].inputs.flatMap(unit => Object.values(unit.values)), contact.value];
  const safe = value => secrets.forEach(secret => assert.ok(!JSON.stringify(value).includes(secret), 'Private customer inputs never appear in metadata'));
  safe(saved);
  const snapshotAtCreation = JSON.stringify(order.lines);
  const full = await json(await get(orderPath(order.id), alice.cookie));
  assert.equal(full.customerInputs.length, 2);
  assert.equal(full.customerInputs[0].fields[1].value, 'private-fixture-one');
  assert.deepEqual(full.orderContact, contact);
  const adminFull = await json(await get(adminPath(order.id), owner));
  assert.deepEqual(adminFull.customerInputs, full.customerInputs);
  assert.deepEqual(adminFull.orderContact, contact);
  assert.equal((await json(await create({ ...input, contact: { method: 'telegram', value: 'https://t.me/Checkout_Contact_Fixture' } }))).order.id, order.id);
  await json(await create({ ...input, contact: { ...contact, value: '@changed_contact_fixture' } }), 409);
  await json(await create({ ...input, contact: undefined }), 409);
  safe(messages.filter(message => message.type === 'order-alert' || message.type === 'customer-order-update'));
  await json(await get(orderPath(order.id), bob.cookie), 404);
  await json(await get(adminPath(order.id), alice.cookie), 401);
  safe(await json(await get(orderPath(order.id) + '?view=status', alice.cookie)));
  safe(await json(await get('/api/customer/orders?view=overview', alice.cookie)));
  safe(await json(await get('/api/customer/orders?view=history', alice.cookie)));
  safe(await json(await get('/api/admin/commerce', owner)));
  const [[stored]] = await db.execute('SELECT snapshot, customer_inputs, checkout_state FROM digimium_orders WHERE id = ?', [order.id]);
  safe(stored);
  assert.ok(stored.customer_inputs.length > 30);
  safe((await db.query('SELECT * FROM digimium_notification_outbox'))[0]);
  await json(await create({ ...input, items: [{ ...input.items[0], quantity: 1, inputs: [input.items[0].inputs[0]] }] }), 409);
  // Seed the old encrypted array and request digest. Missing contact may recover only this exact legacy request.
  const legacyId = randomUUID();
  const legacyInput = { ...input, requestId: randomUUID(), contact: undefined };
  const legacyUnits = input.items[0].inputs.map(({ unit, values }) => [unit, Object.entries(values).sort()]);
  const legacyKey = purpose => createHmac('sha256', env.ORDER_FULFILLMENT_SECRET).update('digimium/website-checkout/v1/' + purpose).digest();
  const legacyHash = createHmac('sha256', legacyKey('request'))
    .update(JSON.stringify([alice.id, catalog.revision, [[product.id, 'monthly', 2, legacyUnits]]])).digest();
  const legacyIv = randomBytes(12);
  const legacyCipher = createCipheriv('aes-256-gcm', legacyKey('inputs'), legacyIv);
  legacyCipher.setAAD(Buffer.from(legacyId + '/' + alice.id));
  const legacyCiphertext = Buffer.concat([legacyCipher.update(JSON.stringify(full.customerInputs)), legacyCipher.final()]);
  const legacyEnvelope = Buffer.concat([legacyIv, legacyCipher.getAuthTag(), legacyCiphertext]).toString('base64');
  await db.execute('INSERT INTO digimium_orders (id, customer_id, request_id, request_hash, created_at, snapshot, checkout_state, customer_inputs) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [legacyId, alice.id, legacyInput.requestId, legacyHash, new Date().toISOString(), stored.snapshot, stored.checkout_state, legacyEnvelope]);

  catalog = await json(await save([{ ...product, name: 'Changed catalog name' }, inquiry, free], settings, catalog.revision));
  const legacyRetry = await json(await create(legacyInput));
  assert.equal(legacyRetry.order.id, legacyId);
  const legacyFull = await json(await get(orderPath(legacyId), alice.cookie));
  assert.equal(legacyFull.orderContact, undefined);
  assert.deepEqual(legacyFull.customerInputs, full.customerInputs);
  assert.equal(JSON.stringify((await json(await create())).order.lines), snapshotAtCreation, 'Exact retry recovers the old snapshot after catalog edits');
  if (orderBotMode) await expectAlerts(12, order.id, 1);
  const recovered = await json(await get('/api/customer/checkout?requestId=' + input.requestId, alice.cookie));
  assert.equal(recovered.order.id, order.id);
  safe(recovered);
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
  if (orderBotMode) {
    await expectAlerts(11, order.id, 1);
    const [outboxProof] = await db.execute('SELECT kind, payload, sent_at FROM digimium_notification_outbox WHERE dedupe_key = ?',
      ['payment-proof-submitted:' + order.id + ':' + firstProofId]);
    assert.equal(outboxProof.length, 1, 'Concurrent retries queue one payment review event');
    assert.equal(outboxProof[0].kind, 'bot:payment-proof-submitted');
    assert.ok(outboxProof[0].sent_at);
    assert.deepEqual(Object.keys(JSON.parse(outboxProof[0].payload)).sort(), [
      'dedupeKey', 'demo', 'entityId', 'kind', 'orderReference', 'paymentAmount', 'paymentCurrency', 'paymentMethod', 'proofRequestId',
    ].sort());
  }
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
  if (orderBotActionMode) assert.match((await expectCustomerUpdates(order.id, 3)).at(-1), /Pending · ငွေလွှဲ screenshot ပြန်စစ်ရန်/);
  const replacementId = randomUUID();
  order = (await json(await proof(order.id, order.revision, replacementId, alice.cookie, anotherPng))).order;
  assert.equal(order.checkout.stage, 'payment_review');
  if (orderBotMode) await expectAlerts(11, order.id, 2);
  if (orderBotActionMode) await callbackReply(await clickOrderButton(actionButton(11, order.id, 'Approve payment'), 11), /changed/, true);
  assert.equal((await json(await proof(order.id, uploadRevision, firstProofId, alice.cookie))).order.revision, order.revision,
    'An old upload retry never replaces the newer proof');
  if (orderBotMode) await expectAlerts(11, order.id, 2);
  order = (await json(await mutate(adminPath(order.id), 'PATCH', { action: 'payment-approve', revision: order.revision, note: 'Payment checked.' }, owner))).order;
  assert.equal(order.checkout.stage, 'processing');
  assert.equal(order.status, 'pending');
  await json(await mutate(adminPath(order.id), 'PATCH', { action: 'quote', revision: order.revision, lines: order.lines.map(line => ({ id: line.id, unitPriceMmk: 1 })) }, owner), 409);
  order = (await json(await mutate(adminPath(order.id), 'PATCH', fulfill(order.revision), owner))).order;
  assert.equal(order.checkout.stage, 'completed');
  assert.equal(order.status, 'approved');
  assert.equal((await json(await get(orderPath(order.id), alice.cookie))).order.lines[0].accountDetails.password, 'delivered-fixture-secret');
  if (orderBotActionMode) {
    const updates = await expectCustomerUpdates(order.id, 6);
    assert.match(updates.at(-1), /Purchased/);
    assert.doesNotMatch(JSON.stringify(updates), /delivered-fixture-secret|Please upload a clear receipt|Payment checked|fixture-kpay/);
  }
  const retried = await json(await create());
  assert.equal(retried.order.id, order.id);
  assert.ok(!JSON.stringify(retried).includes('delivered-fixture-secret'), 'Checkout replay never exposes delivery credentials');
  const override = await json(await create({ requestId: randomUUID(), expectedCatalogRevision: catalog.revision,
    items: [{ productId: product.id, planId: 'provided', quantity: 1 }] }), 201);
  assert.deepEqual((await json(await get(orderPath(override.order.id), alice.cookie))).customerInputs, []);
  for (const [method, value, normalizedValue] of [
    ['viber', '၀၉ ၇၇၇ ၁၂၃ ၄၅၆', '09777123456'],
    ['facebook', 'facebook.com/profile.php?id=1234567&ref=fixture', 'https://www.facebook.com/profile.php?id=1234567'],
    ['phone', '+1 (202) 555-0123', '+12025550123'],
  ]) {
    const created = await json(await create({ requestId: randomUUID(), expectedCatalogRevision: catalog.revision,
      items: [{ productId: product.id, planId: 'provided', quantity: 1 }], contact: { method, value } }), 201);
    assert.equal(created.orderContact, undefined);
    assert.deepEqual((await json(await get(orderPath(created.order.id), alice.cookie))).orderContact, { method, value: normalizedValue });
  }
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
  if (orderBotActionMode) {
    const updates = await expectCustomerUpdates(quoted.id, 2);
    assert.match(updates[0], /Pending · ဈေးနှုန်း အတည်ပြုရန် စောင့်နေသည်/);
    assert.match(updates[1], /Pending · ငွေပေးချေရန်/);
  }
  const complimentary = (await json(await create({ requestId: randomUUID(), expectedCatalogRevision: catalog.revision,
    items: [{ productId: free.id, planId: null, quantity: 1 }] }), 201)).order;
  assert.equal(complimentary.checkout.stage, 'processing');
  if (orderBotActionMode) {
    await expectAlerts(14, complimentary.id, 1);
    await callbackReply(await clickOrderButton(actionButton(14, complimentary.id, 'Send order'), 14), /Delivery sent/);
    const sent = (await json(await get(orderPath(complimentary.id), alice.cookie))).order;
    assert.equal(sent.status, 'approved');
    assert.equal(sent.lines[0].accountDetails, undefined);
    assert.match(sent.lines[0].startDate, /^\d{4}-\d{2}-\d{2}$/);
  } else assert.equal((await json(await mutate(adminPath(complimentary.id), 'PATCH', { revision: complimentary.revision,
    lines: complimentary.lines.map(line => ({ id: line.id, startDate: '2028-01-01', endDate: '2028-02-01' })) }, owner))).order.status, 'approved');
  await json(await mutate(adminPath(order.id), 'DELETE', { revision: order.revision, confirmation: order.id }, owner));
  assert.equal((await db.execute('SELECT * FROM digimium_order_proofs WHERE order_id = ?', [order.id]))[0].length, 0);
  await json(await get(orderPath(order.id) + '/proof?version=' + firstProofId, alice.cookie), 404);
  const removable = await addCustomer('PaymentCascadeFixture');
  let removalOrder = (await json(await create({ requestId: randomUUID(), expectedCustomerId: removable.id, expectedCatalogRevision: catalog.revision,
    items: [{ productId: product.id, planId: 'provided', quantity: 1 }] }, removable.cookie), 201)).order;
  assert.equal(customerUpdatesFor(removalOrder.id).length, 0, 'An entered Telegram contact does not establish a verified identity');
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
  if (orderBotMode) {
    let retryOrder = (await json(await create({ requestId: randomUUID(), expectedCatalogRevision: catalog.revision,
      items: [{ productId: product.id, planId: 'provided', quantity: 1 }] }), 201)).order;
    retryOrder = (await json(await mutate(orderPath(retryOrder.id) + '/payment', 'PATCH',
      { revision: retryOrder.revision, methodId: 'kpay' }, alice.cookie))).order;
    const retryProofId = randomUUID();
    const retryRevision = retryOrder.revision;
    const retryKey = 'payment-proof-submitted:' + retryOrder.id + ':' + retryProofId;
    await alertMode('http-error');
    if (orderBotActionMode) await alertMode('http-error', 'customer');
    retryOrder = (await json(await proof(retryOrder.id, retryRevision, retryProofId, alice.cookie))).order;
    assert.equal(retryOrder.checkout.stage, 'payment_review', 'A provider failure cannot discard saved payment proof');
    await expectAlerts(11, retryOrder.id, 1);
    assert.equal(alertsFor(11, retryOrder.id)[0].delivery, 'http-error');
    let [[retryRow]] = await db.execute('SELECT attempts, sent_at, last_error FROM digimium_notification_outbox WHERE dedupe_key = ?', [retryKey]);
    assert.equal(retryRow.attempts, 1);
    assert.equal(retryRow.sent_at, null);
    assert.equal(retryRow.last_error, 'delivery-failed');
    await json(await proof(retryOrder.id, retryRevision, retryProofId, alice.cookie));
    await expectAlerts(11, retryOrder.id, 1);
    await alertMode('success');
    if (orderBotActionMode) await alertMode('success', 'customer');
    await db.execute('UPDATE digimium_notification_outbox SET next_attempt_at = DATE_SUB(UTC_TIMESTAMP(3), INTERVAL 1 SECOND) WHERE dedupe_key = ?', [retryKey]);
    if (orderBotActionMode) await db.execute(`UPDATE digimium_notification_outbox SET next_attempt_at = DATE_SUB(UTC_TIMESTAMP(3), INTERVAL 1 SECOND)
      WHERE kind = 'customer-order-status' AND entity_id = ? AND sent_at IS NULL`, [retryOrder.id]);
    const retryResult = await runNotificationJob();
    assert.equal(retryResult.alerts.sent, 1);
    if (orderBotActionMode) {
      assert.equal(retryResult.customerOrderUpdates.sent, 1);
      await expectCustomerUpdates(retryOrder.id, 3);
      assert.deepEqual(customerUpdatesFor(retryOrder.id).map(message => message.delivery), ['success', 'http-error', 'success']);
    }
    await expectAlerts(11, retryOrder.id, 2);
    [[retryRow]] = await db.execute('SELECT attempts, sent_at, last_error FROM digimium_notification_outbox WHERE dedupe_key = ?', [retryKey]);
    assert.equal(retryRow.attempts, 2);
    assert.ok(retryRow.sent_at);
    assert.equal(retryRow.last_error, null);

    retryOrder = (await json(await mutate(adminPath(retryOrder.id), 'PATCH',
      { action: 'payment-reject', revision: retryOrder.revision, note: 'Private retry review note.' }, owner))).order;
    const staleProofId = randomUUID();
    const staleKey = 'payment-proof-submitted:' + retryOrder.id + ':' + staleProofId;
    await alertMode('ok-false');
    if (orderBotActionMode) await alertMode('ok-false', 'customer');
    retryOrder = (await json(await proof(retryOrder.id, retryOrder.revision, staleProofId, alice.cookie))).order;
    await expectAlerts(11, retryOrder.id, 3);
    const [[falseResponse]] = await db.execute('SELECT sent_at, last_error FROM digimium_notification_outbox WHERE dedupe_key = ?', [staleKey]);
    assert.equal(falseResponse.sent_at, null, 'HTTP 200 with Telegram ok:false remains a failed delivery');
    assert.equal(falseResponse.last_error, 'delivery-failed');
    if (orderBotActionMode) await alertMode('success', 'customer');
    retryOrder = (await json(await mutate(adminPath(retryOrder.id), 'PATCH',
      { action: 'payment-approve', revision: retryOrder.revision }, owner))).order;
    assert.equal(retryOrder.checkout.stage, 'processing');
    await alertMode('success');
    await db.execute('UPDATE digimium_notification_outbox SET next_attempt_at = DATE_SUB(UTC_TIMESTAMP(3), INTERVAL 1 SECOND) WHERE dedupe_key = ?', [staleKey]);
    if (orderBotActionMode) await db.execute(`UPDATE digimium_notification_outbox SET next_attempt_at = DATE_SUB(UTC_TIMESTAMP(3), INTERVAL 1 SECOND)
      WHERE kind = 'customer-order-status' AND entity_id = ? AND sent_at IS NULL`, [retryOrder.id]);
    await db.query("UPDATE digimium_notification_jobs SET last_run_at = DATE_SUB(UTC_TIMESTAMP(3), INTERVAL 31 SECOND) WHERE name = 'runner'");
    const callsBeforeCancellation = orderAlerts().length;
    const beforeStaleUpdate = customerUpdatesFor(retryOrder.id).length;
    const cancelledResult = await runNotificationJob();
    assert.equal(cancelledResult.alerts.sent, 0);
    assert.equal(cancelledResult.customerOrderUpdates.sent, 0);
    assert.equal(customerUpdatesFor(retryOrder.id).length, beforeStaleUpdate, 'A stale customer status never reaches Telegram twice');
    assert.equal(orderAlerts().length, callsBeforeCancellation, 'Already-reviewed proof does not produce a delayed review alert');
    const [[cancelled]] = await db.execute('SELECT cancelled_at, payload, last_error FROM digimium_notification_outbox WHERE dedupe_key = ?', [staleKey]);
    assert.ok(cancelled.cancelled_at);
    assert.equal(cancelled.payload, '{}');
    assert.equal(cancelled.last_error, 'proof-superseded');
    if (orderBotActionMode) {
      const [[staleUpdate]] = await db.execute(`SELECT cancelled_at, payload, last_error FROM digimium_notification_outbox
        WHERE kind = 'customer-order-status' AND entity_id = ? AND cancelled_at IS NOT NULL`, [retryOrder.id]);
      assert.ok(staleUpdate.cancelled_at);
      assert.equal(staleUpdate.payload, '{}');
      assert.equal(staleUpdate.last_error, 'status-superseded');
    }

    const [[legacyAlert]] = await db.execute('SELECT attempts, sent_at FROM digimium_notification_outbox WHERE id = ?', [legacyAlertId]);
    assert.equal(legacyAlert.attempts, 0, 'Dedicated routing never drains the legacy bot queue');
    assert.equal(legacyAlert.sent_at, null);
    const privateValues = [...secrets, '@example.invalid', 'CheckoutFixture', 'CheckoutRace', 'PaymentCascadeFixture',
      'bounded-fixture-secret', 'constructor-fixture', 'Private Registration Fixture', 'private-registration@example.invalid',
      'private-registration-fixture-password', 'delivered@example.invalid', 'delivered-fixture-secret',
      'demo-delivery@example.invalid', 'demo-delivery-fixture', 'Please upload a clear receipt.', 'Payment checked.',
      'Private retry review note.', firstProofId, replacementId, ...methods.map(method => method.accountNumber)];
    for (const alert of orderAlerts()) {
      const payload = JSON.stringify(alert.fields);
      for (const value of privateValues) assert.ok(!payload.includes(value), 'Provider alerts contain no customer details, credentials, receipt reference or review notes');
      assert.ok(!payload.includes('/proof') && !payload.includes('proofUrl'));
      if (demoMode) {
        const button = alert.fields.reply_markup?.inline_keyboard?.[0]?.[0];
        assert.ok(button);
        const target = new URL(button.url);
        assert.equal(target.origin, applicationOrigin);
        assert.equal(target.pathname, '/admin');
        if (alert.fields.message_thread_id === 13) assert.equal(target.search, '?section=customers');
        else {
          assert.match(target.searchParams.get('order'), /^[a-f0-9-]{36}$/);
          assert.deepEqual([...target.searchParams.keys()], ['order']);
        }
      } else assert.equal(alert.fields.reply_markup, undefined, 'An HTTP fixture never emits an Admin link');
    }
    assert.ok(orderAlerts().some(alert => alert.fields.message_thread_id === 11));
    assert.ok(orderAlerts().some(alert => alert.fields.message_thread_id === 12));
    assert.equal(orderAlerts().filter(alert => alert.fields.message_thread_id === 13).length, 1);
  }
  if (orderBotActionMode) {
    const manualId = randomUUID();
    await db.execute(`INSERT INTO digimium_orders (id, customer_id, request_id, request_hash, created_at, snapshot)
      VALUES (?, ?, ?, ?, ?, ?)`, [manualId, alice.id, randomUUID(), randomBytes(32), new Date().toISOString(), oldSnapshot]);
    const manualStatus = await statusReply(await askTelegramStatus('/start order_' + manualId), 987654330);
    assert.match(manualStatus.text, /အော်ဒါ အတည်ပြုရန် စောင့်နေသည်/);
    assert.equal(manualStatus.reply_markup.inline_keyboard.flat().length, 1);
    assert.equal(new URL(manualStatus.reply_markup.inline_keyboard[0][0].url).pathname, '/order-history');
    const missing = await statusReply(await askTelegramStatus('/start order_' + manualId, { sender: 987654331 }), 987654331);
    assert.doesNotMatch(missing.text, new RegExp(manualId.slice(0, 8), 'i'));

    await alertMode('forbidden', 'customer');
    const unopenedBotOrder = (await json(await create({ requestId: randomUUID(), expectedCatalogRevision: catalog.revision,
      items: [{ productId: product.id, planId: 'provided', quantity: 1 }] }), 201)).order;
    await expectCustomerUpdates(unopenedBotOrder.id, 1);
    const [[unavailable]] = await db.execute(`SELECT cancelled_at, attempts, last_error FROM digimium_notification_outbox
      WHERE kind = 'customer-order-status' AND entity_id = ?`, [unopenedBotOrder.id]);
    assert.equal(unavailable.attempts, 1);
    assert.ok(unavailable.cancelled_at);
    assert.equal(unavailable.last_error, 'chat-unavailable');
    const latest = await statusReply(await askTelegramStatus('/start order_' + unopenedBotOrder.id), 987654330);
    assert.match(latest.text, /ငွေပေးချေရန်/);
    await alertMode('success', 'customer');
    await json(await mutate(adminPath(unopenedBotOrder.id), 'PATCH',
      { action: 'reject', revision: unopenedBotOrder.revision }, owner));
    assert.match((await expectCustomerUpdates(unopenedBotOrder.id, 2)).at(-1), /Rejected · အော်ဒါ ငြင်းပယ်ထားသည်/);
  }
  const [[guest]] = await db.execute('SELECT snapshot, fulfillment, checkout_state, customer_inputs FROM digimium_orders WHERE id = ?', [guestId]);
  assert.equal(guest.snapshot, oldSnapshot);
  assert.equal(guest.fulfillment, null);
  assert.equal(guest.checkout_state, null);
  assert.equal(guest.customer_inputs, null);
  assert.deepEqual(messages.filter(message => !['order-alert', 'order-alert-control', 'customer-order-update'].includes(message.type))
    .map(message => message.type), ['otp-mail']);
  if (!orderBotMode) assert.equal(orderAlerts().length, 0);
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
