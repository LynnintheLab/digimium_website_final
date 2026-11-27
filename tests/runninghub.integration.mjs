// Run after npm run build, using an EMPTY disposable loopback database only.
// The preloaded provider fixture intercepts synthetic OTP mail and the dedicated Admin bot.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';
import { crc32, deflateSync } from 'node:zlib';
import { checkRunningHubHistory } from './runninghub-history.integration-checks.mjs';

const fixtureDirectory = await mkdtemp(join(tmpdir(), 'digimium-runninghub-telegram-test-'));
const env = { ...process.env, ADMIN_EMAIL: 'owner@example.invalid', ADMIN_AUTH_SECRET: randomUUID(),
  ORDER_FULFILLMENT_SECRET: randomUUID(), NOTIFICATIONS_CRON_SECRET: randomUUID(), RESEND_FROM_EMAIL: 'digimium@example.invalid', RESEND_API_KEY: 're_integration_fixture',
  GOOGLE_CLIENT_ID: '', GOOGLE_CLIENT_SECRET: '', TELEGRAM_BOT_TOKEN: '', TELEGRAM_BOT_USERNAME: '', TELEGRAM_WEBHOOK_SECRET: '',
  DIGIMIUM_ADMIN_ORDERS_TELEGRAM_BOT_TOKEN: '99990001:fixture_admin_orders_12345678901234567890',
  DIGIMIUM_ADMIN_ORDERS_TELEGRAM_OWNER_ID: '987654321',
  DIGIMIUM_ADMIN_ORDERS_TELEGRAM_PAYMENT_TOPIC_ID: '42',
  DIGIMIUM_ADMIN_ORDERS_TELEGRAM_RUNNINGHUB_TOPIC_ID: '43',
  DIGIMIUM_ADMIN_ORDERS_TELEGRAM_ORDERS_TOPIC_ID: '44',
  DIGIMIUM_ADMIN_ORDERS_TELEGRAM_REGISTRATION_TOPIC_ID: '45',
  DIGIMIUM_ADMIN_ORDERS_TELEGRAM_WEBHOOK_SECRET: randomBytes(32).toString('base64url'),
  RUNNINGHUB_FIXTURE_LOG: join(fixtureDirectory, 'telegram.jsonl'), RUNNINGHUB_FIXTURE_CONTROL: join(fixtureDirectory, 'control.json') };
const base = new URL(env.APP_ORIGIN || 'http://invalid');
assert.ok(base.origin === env.APP_ORIGIN && base.protocol === 'http:' && base.hostname === '127.0.0.1' && base.port &&
  env.DB_HOST === '127.0.0.1' && /^digimium_test_[a-z0-9_]+$/.test(env.DB_NAME) && env.DB_USER && env.DB_PASSWORD,
  'Use an empty disposable loopback digimium_test_* database and unused loopback HTTP port.');
const root = new URL('../', import.meta.url);
const db = await mysql.createConnection({ host: env.DB_HOST, port: Number(env.DB_PORT || 3306), user: env.DB_USER,
  password: env.DB_PASSWORD, database: env.DB_NAME, multipleStatements: true });
let server;
let serverOutput = '';
const hash = value => createHash('sha256').update(value).digest();
const request = (path, options = {}) => fetch(new URL(path, base), { ...options, redirect: 'manual', signal: AbortSignal.timeout(15000) });
const get = (path, cookie = '') => request(path, { headers: { Cookie: cookie } });
const orderIdLine = order => 'Order ID: #' + order.id.slice(0, 8).toUpperCase();
const orderTimeLine = 'Order time: 1 Jan 2026, 01:30 MMT';
const boldTitle = title => [{ type: 'bold', offset: 0, length: title.length }];
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
async function addCustomer(name, email = name.toLowerCase() + '@example.invalid') {
  const id = randomUUID(), token = randomBytes(32).toString('base64url');
  await db.execute('INSERT INTO digimium_customers (id, name, email, password_hash, created_at) VALUES (?, ?, ?, ?, UTC_TIMESTAMP(3))',
    [id, name, email, 'fixture-preserved-hash-' + randomUUID()]);
  await db.execute('INSERT INTO digimium_customer_sessions (token_hash, customer_id, expires_at) VALUES (?, ?, DATE_ADD(UTC_TIMESTAMP(), INTERVAL 1 HOUR))',
    [hash(token), id]);
  return { id, name, email, cookie: 'digimium_local_customer=' + token };
}
// Distinct valid synthetic receipt images model distinct payments; no real receipts are used.
function uniqueProofPng() {
  const chunk = (kind, data) => {
    const body = Buffer.concat([Buffer.from(kind), data]);
    const length = Buffer.alloc(4), checksum = Buffer.alloc(4);
    length.writeUInt32BE(data.length); checksum.writeUInt32BE(crc32(body));
    return Buffer.concat([length, body, checksum]);
  };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(32); ihdr.writeUInt32BE(32, 4); ihdr[8] = 8; ihdr[9] = 2;
  const rows = Array.from({ length: 32 }, () => Buffer.concat([Buffer.from([0]), randomBytes(32 * 3)]));
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(Buffer.concat(rows))), chunk('IEND', Buffer.alloc(0))]);
}
async function start(overrides = {}) {
  server = spawn(process.execPath, ['--import', new URL('tests/fixtures/runninghub-telegram-fetch.mjs', root).href,
    fileURLToPath(new URL('.next/standalone/server.js', root))], {
    cwd: fileURLToPath(root), env: { ...env, ...overrides, FIXTURE_MAIL_FAILURE: '0', NODE_ENV: 'production', HOSTNAME: base.hostname, PORT: base.port },
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  });
  for (const stream of [server.stdout, server.stderr]) stream.on('data', chunk => { serverOutput = (serverOutput + chunk).slice(-1000000); });
  for (let attempt = 0; ; attempt++) {
    try { assert.equal((await request('/admin/login')).status, 200); break; }
    catch (error) {
      if (attempt > 120 || server.exitCode !== null || !['ECONNREFUSED', 'UND_ERR_SOCKET'].includes(error.cause?.code)) throw error;
      await delay(100);
    }
  }
}
async function stop() {
  if (server && server.exitCode === null && server.signalCode === null) {
    const closed = once(server, 'exit');
    server.kill('SIGTERM');
    await Promise.race([closed, delay(3000)]);
  }
}
try {
  assert.equal((await db.query('SHOW TABLES'))[0].length, 0, 'Refusing to mutate a nonempty database.');
  const probe = createServer();
  await new Promise((resolve, reject) => probe.once('error', reject).listen(Number(base.port), base.hostname, resolve));
  await new Promise(resolve => probe.close(resolve));
  for (const file of ['schema.sql', 'customer-auth-schema.sql', 'order-schema.sql', 'google-identity-schema.sql',
    'telegram-identity-schema.sql', 'google-auth-schema.sql', 'telegram-auth-schema.sql', 'giveaway-schema.sql', 'notification-schema.sql']) {
    await db.query(await readFile(new URL('hostinger/' + file, root), 'utf8'));
  }
  const runningHubSchema = await readFile(new URL('hostinger/runninghub-schema.sql', root), 'utf8');
  // Model an already deployed database so CREATE TABLE IF NOT EXISTS alone cannot pass this test.
  const oldRunningHubSchema = runningHubSchema.replace(/^[ \t]*key_name[ \t]+[^,\r\n]+,\r?\n/gmi, '')
    .replace(/CREATE TABLE IF NOT EXISTS digimium_runninghub_used_receipts\b[^;]+;/, '');
  assert.doesNotMatch(oldRunningHubSchema, /\bkey_name\b/i);
  await db.query(oldRunningHubSchema);
  for (const table of ['digimium_runninghub_stock', 'digimium_runninghub_orders']) {
    assert.equal((await db.query(`SHOW COLUMNS FROM ${table} LIKE 'key_name'`))[0].length, 0);
  }
  await writeFile(env.RUNNINGHUB_FIXTURE_LOG, '', { mode: 0o600 });
  await writeFile(env.RUNNINGHUB_FIXTURE_CONTROL, '{}', { mode: 0o600 });
  await start();
  const admin = '/api/admin/runninghub';
  const customer = '/api/customer/runninghub';
  async function assertPublicStock(usd10, usd20) {
    assert.deepEqual(await json(await get('/api/runninghub/availability')), { stock: { usd10, usd20 } });
  }
  const alice = await addCustomer('RunningHubFixture');
  const bob = await addCustomer('OtherFixture');
  const charlie = await addCustomer('ThirdFixture');
  const requestOtp = once(server, 'message', { signal: AbortSignal.timeout(10000) });
  const login = (fields, session = '') => request('/admin/session', {
    method: 'POST', headers: { Origin: base.origin, Cookie: session }, body: new URLSearchParams(fields),
  });
  const challenge = await login({ action: 'request', email: env.ADMIN_EMAIL });
  const [message] = await requestOtp;
  assert.equal(message.type, 'otp-mail');
  const owner = cookie(await login({ action: 'verify', code: message.code }, cookie(challenge, 'digimium_local_challenge')), 'digimium_local_admin');

  const catalogBefore = await json(await get('/api/admin/catalog', owner));
  const proofPng = await readFile(new URL('public/assets/symbol-blue.png', root));
  const keys = Array.from({ length: 3 }, () => 'fixture-' + randomBytes(24).toString('hex'));
  const keyNames = ['Key - 1', 'စမ်းသပ်သော့ - 2'];
  function namesHidden(value) {
    const serialized = JSON.stringify(value);
    for (const name of keyNames) assert.ok(!serialized.includes(name), 'API key names are limited to inventory and approved order details');
  }
  const walletRef = 'FIXTURE-881201';
  const sensitiveReferences = [walletRef];
  const redacted = value => {
    for (const secret of [...keys, ...sensitiveReferences]) assert.ok(!JSON.stringify(value).includes(secret), 'Sensitive keys and wallet references are scoped to explicit reads');
  };
  function buyerIdentity(text, expected) {
    const rows = text.split('\n').filter(line => /^(Customer|Email|Gmail|Telegram|Telegram ID): /.test(line));
    assert.deepEqual(rows, expected);
  }
  function assertOrderProjection(order, buyer, ...telegramDetails) {
    const serialized = JSON.stringify(order);
    for (const detail of [buyer.name, buyer.email, ...telegramDetails].filter(Boolean)) {
      assert.ok(!serialized.includes(detail), 'Order responses do not add Admin bot identity fields.');
    }
  }
  const create = (buyer, packId, method, requestId = randomUUID(), extra = {}) => mutate(customer, 'POST',
    { requestId, expectedCustomerId: buyer.id, packId, method, ...extra }, buyer.cookie);
  const proof = (buyer, order, bytes = proofPng, mime = 'image/png', requestId = randomUUID()) => request(
    customer + '/' + order.id + '/proof?revision=' + order.revision + '&requestId=' + requestId,
    { method: 'POST', headers: { Origin: base.origin, Cookie: buyer.cookie, 'Content-Type': mime }, body: bytes },
  );
  const decide = (order, fields, session = owner, origin = base.origin) => mutate(admin + '/orders/' + order.id, 'PATCH',
    { action: 'approve', revision: order.revision, requestId: randomUUID(), proofRequestId: order.proofRequestId,
      ...fields }, session, origin);
  const restock = (body, session = owner) => mutate(admin + '/stock', 'POST', body, session);
  const calls = async () => (await readFile(env.RUNNINGHUB_FIXTURE_LOG, 'utf8')).trim().split('\n').filter(Boolean).map(line => JSON.parse(line));
  async function providerCall(predicate, after = 0) {
    for (let attempt = 0; attempt < 100; attempt++) {
      const match = (await calls()).slice(after).find(predicate);
      if (match) return match;
      await delay(100);
    }
    assert.fail('Expected intercepted Telegram output did not arrive.');
  }
  const markup = fields => typeof fields.reply_markup === 'string' ? JSON.parse(fields.reply_markup) : fields.reply_markup;
  const botOwnerId = Number(env.DIGIMIUM_ADMIN_ORDERS_TELEGRAM_OWNER_ID);
  const botId = Number(env.DIGIMIUM_ADMIN_ORDERS_TELEGRAM_BOT_TOKEN.split(':')[0]);
  const botTopic = Number(env.DIGIMIUM_ADMIN_ORDERS_TELEGRAM_RUNNINGHUB_TOPIC_ID);
  const legacyPaymentTopic = Number(env.DIGIMIUM_ADMIN_ORDERS_TELEGRAM_PAYMENT_TOPIC_ID);
  const botUser = { id: botId, is_bot: true, first_name: 'Synthetic Digimium Admin Orders' };
  const adminUser = { id: botOwnerId, is_bot: false, first_name: 'Synthetic Owner' };
  const ownerChat = { id: botOwnerId, type: 'private' };
  let nextUpdateId = 70000;
  const webhookPath = '/api/internal/admin-orders-bot/webhook';
  async function webhook(update, secret = env.DIGIMIUM_ADMIN_ORDERS_TELEGRAM_WEBHOOK_SECRET) {
    const response = await request(webhookPath, { method: 'POST', headers: {
      'Content-Type': 'application/json', ...(secret ? { 'X-Telegram-Bot-Api-Secret-Token': secret } : {}),
    }, body: JSON.stringify(update) });
    const text = await response.text();
    const body = text ? JSON.parse(text) : null;
    redacted(body);
    namesHidden(body);
    return { response, body };
  }
  function callback(receipt, token) {
    return { update_id: ++nextUpdateId, callback_query: { id: 'fixture-callback-' + nextUpdateId, from: adminUser, data: token,
      message: { message_id: receipt.messageId, date: Math.floor(Date.now() / 1000), from: botUser,
        chat: ownerChat, message_thread_id: botTopic, caption: receipt.fields.caption } } };
  }
  function referenceReply(prompt, value) {
    return { update_id: ++nextUpdateId, message: { message_id: nextUpdateId, date: Math.floor(Date.now() / 1000), from: adminUser,
      chat: ownerChat, message_thread_id: botTopic, text: value,
      reply_to_message: { message_id: prompt.messageId, date: Math.floor(Date.now() / 1000), from: botUser,
        chat: ownerChat, message_thread_id: botTopic, text: prompt.fields.text } } };
  }

  await json(await get(admin), 401);
  await json(await get(admin, alice.cookie), 401);
  await json(await get(customer), 401);
  await assertPublicStock(0, 0);
  await json(await mutate(customer, 'POST', { requestId: randomUUID(), expectedCustomerId: alice.id, packId: 'usd10', method: 'kpay' }), 401);
  const empty = await json(await get(admin, owner));
  assert.deepEqual(empty.packs.map(pack => [pack.id, pack.priceMmk]), [['usd10', 70000], ['usd20', 138000]]);
  assert.equal(empty.stock.length, 0);
  for (const table of ['digimium_runninghub_stock', 'digimium_runninghub_orders']) {
    const [[column]] = await db.query(`SHOW COLUMNS FROM ${table} LIKE 'key_name'`);
    assert.equal(column?.Null, 'YES', 'The upgrade adds a nullable key name to existing tables');
  }
  const initialView = await json(await get(customer, alice.cookie));
  assert.deepEqual(initialView.methods, []);
  assert.ok(initialView.packs.every(pack => pack.available === 0));
  await json(await create(alice, 'usd10', 'kpay'), 409);
  await json(await create(alice, 'usd10', 'wave'), 400);
  await json(await create(alice, 'usd10', 'kpay', randomUUID(), { priceMmk: 1 }), 400);
  await json(await create(alice, 'usd10', 'kpay', randomUUID(), { expectedCustomerId: bob.id }), 409);

  const settings = { revision: empty.settingsRevision, methods: [
    { id: 'kpay', enabled: true, accountLabel: 'Synthetic KBZ wallet', accountNumber: '09000000001' },
    { id: 'aya', enabled: true, accountLabel: 'Synthetic AYA wallet', accountNumber: '09000000002' },
  ] };
  await json(await mutate(admin, 'PUT', settings, alice.cookie), 401);
  await json(await mutate(admin, 'PUT', settings, owner, 'https://foreign.invalid'), 403);
  await json(await mutate(admin, 'PUT', settings, owner));
  await json(await mutate(admin, 'PUT', settings, owner), 409);
  await json(await create(alice, 'usd10', 'kpay'), 409);

  const batch = { requestId: randomUUID(), packId: 'usd10', keys: [
    { key: keys[0], name: '  ' + keyNames[0] + '  ' }, { key: keys[1], name: keyNames[1] },
  ] };
  const last = { requestId: randomUUID(), packId: 'usd20', keys: [keys[2]] };
  await json(await restock(batch, alice.cookie), 401);
  for (const name of ['', '   ', 'x'.repeat(101), 'Two\nlines', 'Visible\u202e label']) {
    await json(await restock({ ...batch, keys: [{ key: keys[0], name }] }), 400);
  }
  await json(await restock({ ...batch, keys: [batch.keys[0], keys[0]] }), 409);
  const additions = await json(await restock(batch), 201);
  assert.equal(additions.added, 2);
  const reorderedBatch = { ...batch, keys: [...batch.keys].reverse().map(({ key, name }) => ({ key, name: name.trim() })) };
  assert.deepEqual((await json(await restock(reorderedBatch))).ids, additions.ids);
  const changedName = [{ key: keys[0], name: 'Different name' }, batch.keys[1]];
  await json(await restock({ ...batch, keys: changedName }), 409);
  await json(await restock({ ...batch, requestId: randomUUID(), keys: changedName }), 409);
  await json(await restock({ ...batch, requestId: randomUUID() }), 409);
  const unnamedImport = await json(await restock(last), 201);
  assert.equal(unnamedImport.added, 1);
  assert.deepEqual((await json(await restock(last))).ids, unnamedImport.ids, 'Existing string-key imports still replay.');
  const before = await json(await get(admin, owner));
  redacted(before);
  assert.equal(before.stock.length, 3);
  assert.deepEqual(additions.ids.map(id => before.stock.find(item => item.id === id)?.keyName), keyNames);
  assert.equal(before.stock.find(item => item.id === unnamedImport.ids[0])?.keyName, null);
  await assertPublicStock(2, 1);
  const assertEncrypted = async () => {
    const [data] = await db.query('SELECT key_hash, key_cipher FROM digimium_runninghub_stock');
    assert.equal(data.length, 3);
    assert.ok(data.every(row => row.key_cipher.length > 30));
    redacted(data);
  };
  await assertEncrypted();

  const requestId = randomUUID();
  const first = (await json(await create(alice, 'usd10', 'kpay', requestId), 201)).order;
  assert.equal(first.status, 'awaiting_payment');
  assert.equal(first.keyName, null);
  assert.equal(first.priceMmk, 70000);
  assert.equal(first.payment.id, 'kpay');
  assert.ok(Date.parse(first.expiresAt) > Date.now());
  await assertPublicStock(1, 1);
  const firstReference = orderIdLine(first);
  const firstAlert = call => call.method === 'sendMessage' && call.fields.text?.includes(firstReference);
  const orderCreated = await providerCall(firstAlert);
  assert.match(orderCreated.fields.text, /^🛒 New order\nOrder ID: #[A-F0-9]{8}\nOrder time: \d{1,2} [A-Za-z]+ \d{4}, \d{2}:\d{2} MMT\n\n/);
  assert.deepEqual(orderCreated.fields.entities, boldTitle('🛒 New order'));
  assert.match(orderCreated.fields.text, /Running HUB API Key — 10 USD bundle × 1/);
  assert.match(orderCreated.fields.text, /70,000 MMK/);
  buyerIdentity(orderCreated.fields.text, ['Customer: ' + alice.name, 'Email: ' + alice.email]);
  assert.equal(String(orderCreated.fields.chat_id), String(botOwnerId));
  assert.equal(Number(orderCreated.fields.message_thread_id), botTopic);
  assert.equal(orderCreated.fields.protect_content, true);
  assert.ok(markup(orderCreated.fields).inline_keyboard.flat().some(button =>
    button.url === base.origin + '/admin/runninghub?order=' + first.id));
  for (const privateDetail of [alice.id, ...settings.methods.map(method => method.accountNumber)]) {
    assert.ok(!JSON.stringify(orderCreated.fields).includes(privateDetail));
  }
  redacted(orderCreated);
  namesHidden(orderCreated);
  assert.equal((await json(await create(alice, 'usd10', 'kpay', requestId))).order.id, first.id);
  assert.equal((await calls()).filter(firstAlert).length, 1, 'Replaying order creation sends no duplicate notice.');
  await json(await create(alice, 'usd10', 'aya', requestId), 409);
  await json(await create(alice, 'usd20', 'aya'), 409);
  const firstPath = customer + '/' + first.id;
  const preApproval = await json(await get(firstPath, alice.cookie));
  assertOrderProjection(first, alice);
  assertOrderProjection(preApproval, alice);
  redacted(preApproval);
  assert.equal(preApproval.apiKey, undefined);
  assert.equal(preApproval.order.keyName, null);
  namesHidden(preApproval);
  namesHidden(await json(await get(firstPath, bob.cookie), 404));
  await json(await decide(first, { proofRequestId: randomUUID() }), 409);
  await json(await proof(bob, first), 404);
  await json(await proof(alice, first, proofPng, 'image/svg+xml'), 415);

  const review = (await json(await proof(alice, first))).order;
  assert.equal(review.status, 'payment_review');
  assert.equal(review.keyName, null);
  assert.equal(review.expiresAt, null);
  await assertPublicStock(1, 1);
  redacted(review);
  await json(await get(review.proofUrl), 401);
  await json(await get(review.proofUrl, bob.cookie), 404);
  for (const session of [alice.cookie, owner]) {
    const response = await get(review.proofUrl, session);
    assert.equal(response.status, 200);
    assert.match(response.headers.get('cache-control'), /no-store/);
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), proofPng);
  }
  const [storedProof] = await db.execute('SELECT proof_cipher FROM digimium_runninghub_orders WHERE id = ?', [first.id]);
  assert.ok(storedProof[0].proof_cipher.length > proofPng.length);
  assert.ok(!Buffer.from(storedProof[0].proof_cipher).includes(proofPng));
  await json(await decide(review, {}, alice.cookie), 401);
  await json(await decide(review, {}, owner, 'https://foreign.invalid'), 403);
  await json(await decide(review, { proofRequestId: randomUUID() }), 409);
  const decision = { requestId: randomUUID() };
  const simultaneous = await Promise.all([decide(review, decision), decide(review, decision)]);
  const approvals = await Promise.all(simultaneous.map(response => json(response)));
  assert.deepEqual(approvals.map(result => result.applied).sort(), [false, true], 'Concurrent identical approval clicks issue once.');
  const approved = approvals.find(result => result.applied);
  redacted(approved);
  assert.equal(approved.order.status, 'approved');
  assert.ok(approved.order.keyId);
  const replay = await json(await decide(review, decision));
  assert.equal(replay.applied, false);
  for (const changed of [{ revision: review.revision + 1 }, { proofRequestId: randomUUID() }, { note: 'Changed decision' }]) {
    await json(await decide(review, { ...decision, ...changed }), 409);
  }
  const [[newReferenceRows]] = await db.execute('SELECT COUNT(*) AS total FROM digimium_runninghub_payments WHERE order_id = ?', [review.id]);
  assert.equal(Number(newReferenceRows.total), 0, 'Single-click approval does not invent or store a wallet reference.');
  assert.equal(replay.order.keyId, approved.order.keyId);
  const detail = await json(await get(firstPath, alice.cookie));
  assert.ok(keys.slice(0, 2).includes(detail.apiKey));
  const assignedName = keyNames[keys.indexOf(detail.apiKey)];
  assert.equal(detail.order.keyName, assignedName, 'The delivered key and its name stay paired.');
  assert.equal(approved.order.keyName, assignedName);
  assert.equal(replay.order.keyName, assignedName);
  assert.equal(detail.order.keyId, approved.order.keyId);
  assert.equal((await json(await get(firstPath, alice.cookie))).apiKey, detail.apiKey);
  redacted(await json(await get(customer, alice.cookie)));
  namesHidden(await json(await get(customer + '/history?status=purchased', alice.cookie)));
  namesHidden(await json(await get(firstPath, bob.cookie), 404));
  namesHidden(await json(await get(customer, bob.cookie)));
  const adminView = await json(await get(admin, owner));
  redacted(adminView);
  const recorded = adminView.orders.find(order => order.id === first.id);
  assert.equal(recorded.customerId, alice.id);
  assert.equal(recorded.customerName, alice.name);
  assert.equal(recorded.keyId, approved.order.keyId);
  assert.equal(recorded.keyName, assignedName);
  const revealPath = admin + '/orders/' + first.id + '/reveal';
  await json(await mutate(revealPath, 'POST', { confirmation: first.id }, alice.cookie), 401);
  assert.equal((await json(await mutate(revealPath, 'POST', { confirmation: first.id }, owner))).apiKey, detail.apiKey);

  const duplicate = (await json(await create(bob, 'usd10', 'kpay'), 201)).order;
  const duplicateReview = (await json(await proof(bob, duplicate))).order;
  const duplicateResult = await json(await decide(duplicateReview, {}), 409);
  assert.match(JSON.stringify(duplicateResult), /screenshot.*already used/i);
  const duplicateReceipt = await providerCall(call => ['sendPhoto', 'sendDocument'].includes(call.method) &&
    String(call.fields.caption).toLowerCase().includes(duplicateReview.id.slice(0, 8).toLowerCase()));
  const duplicateToken = markup(duplicateReceipt.fields).inline_keyboard.flat().find(button => button.callback_data).callback_data;
  const duplicateCallback = callback(duplicateReceipt, duplicateToken);
  const wrongDuplicateOwner = structuredClone(duplicateCallback); wrongDuplicateOwner.callback_query.from.id++;
  assert.doesNotMatch((await webhook(wrongDuplicateOwner)).body.text, /screenshot.*already used/i,
    'Order failure details are disclosed only after the owner/chat/topic/bot checks.');
  const duplicateAlert = await webhook(duplicateCallback);
  assert.equal(duplicateAlert.response.status, 200);
  assert.equal(duplicateAlert.body.method, 'answerCallbackQuery');
  assert.equal(duplicateAlert.body.show_alert, true);
  assert.match(duplicateAlert.body.text, /screenshot.*already used/i);
  assert.match(duplicateAlert.body.text, /different transfer.*payment receipt/i);
  assert.ok(duplicateAlert.body.text.length <= 200);
  for (const privateDetail of [first.id, duplicate.id, alice.id, bob.id, alice.name, bob.email]) {
    assert.ok(!duplicateAlert.body.text.includes(privateDetail), 'Failure text does not identify another order or customer.');
  }
  assert.equal((await json(await get(customer + '/' + duplicate.id, bob.cookie))).apiKey, undefined);
  assert.equal((await json(await get(customer + '/' + duplicate.id, bob.cookie))).order.status, 'payment_review');
  await db.beginTransaction();
  await db.execute(`INSERT INTO digimium_runninghub_used_receipts (proof_hash)
    SELECT proof_hash FROM digimium_runninghub_orders WHERE id = ? AND status = 'approved' AND proof_hash IS NOT NULL`, [first.id]);
  await db.execute('DELETE FROM digimium_runninghub_orders WHERE id = ?', [first.id]);
  await db.commit();
  await json(await get(firstPath, alice.cookie), 404);
  await assertPublicStock(0, 1);
  const archivedDuplicateResult = await json(await decide(duplicateReview, {}), 409);
  assert.match(JSON.stringify(archivedDuplicateResult), /screenshot.*already used/i,
    'The receipt fingerprint still blocks reuse after the approved order is permanently removed.');
  const rejected = (await json(await decide(duplicateReview, {
    action: 'reject', paymentReference: undefined, proofRequestId: undefined, note: 'Synthetic screenshot already used.',
  }))).order;
  assert.equal(rejected.status, 'rejected');
  assert.equal(rejected.keyName, null);
  assert.equal((await json(await get(customer + '/' + duplicate.id, bob.cookie))).apiKey, undefined);

  const lastUnit = await Promise.all([create(bob, 'usd20', 'aya'), create(charlie, 'usd20', 'aya')]);
  assert.deepEqual(lastUnit.map(result => result.status).sort((a, b) => a - b), [201, 409]);
  const winnerIndex = lastUnit.findIndex(result => result.status === 201);
  const winner = [bob, charlie][winnerIndex];
  const loser = [bob, charlie][1 - winnerIndex];
  const second = (await json(lastUnit[winnerIndex], 201)).order;
  assert.equal(second.priceMmk, 138000);
  assert.equal(second.payment.id, 'aya');
  const secondReview = (await json(await proof(winner, second, uniqueProofPng()))).order;
  const legacyDecision = { requestId: randomUUID(), paymentReference: walletRef };
  const secondFilled = (await json(await decide(secondReview, legacyDecision))).order;
  assert.equal((await json(await decide(secondReview, { ...legacyDecision, paymentReference: 'fixture 881201' }))).applied, false, 'Legacy reference-based request receipts still replay.');
  const [[oldReferenceRows]] = await db.execute('SELECT COUNT(*) AS total FROM digimium_runninghub_payments WHERE order_id = ?', [secondReview.id]);
  assert.equal(Number(oldReferenceRows.total), 1, 'Legacy reference verification is retained.');
  const unnamedDelivery = await json(await get(customer + '/' + secondFilled.id, winner.cookie));
  assert.equal(unnamedDelivery.apiKey, keys[2]);
  assert.equal(unnamedDelivery.order.keyName, null, 'Unnamed keys still issue successfully.');
  await json(await get(customer + '/' + secondFilled.id, loser.cookie), 404);

  const unpaid = (await json(await create(loser, 'usd10', 'aya'), 201)).order;
  await assertPublicStock(0, 0);
  await db.execute('UPDATE digimium_runninghub_orders SET expires_at = ? WHERE id = ?', ['2000-01-01T00:00:00.000Z', unpaid.id]);
  await assertPublicStock(1, 0);
  const [[unpaidStatus]] = await db.execute('SELECT status FROM digimium_runninghub_orders WHERE id = ?', [unpaid.id]);
  assert.equal(unpaidStatus.status, 'awaiting_payment', 'Public stock reads never expire orders themselves.');
  const recoveredStock = await json(await get(customer, loser.cookie));
  assert.equal(recoveredStock.orders.find(order => order.id === unpaid.id).status, 'expired');
  assert.equal(recoveredStock.packs.find(pack => pack.id === 'usd10').available, 1);
  await json(await proof(loser, unpaid), 409);

  const used = await json(await get(admin, owner));
  const available = used.stock.find(item => item.status === 'available');
  assert.ok(available);
  await json(await mutate(admin + '/stock/' + available.id, 'DELETE', { confirmation: available.id }, owner));
  await assertPublicStock(0, 0);
  await json(await restock({ ...batch, requestId: randomUUID() }), 409);
  await assertEncrypted();

  // The ordinary customer-removal path cascades private Running HUB orders outside its inventory mutex.
  // Race both request launch orders: issuance must win atomically, or the key must remain unused.
  for (let index = 0; index < 2; index++) {
    const racing = await addCustomer('RemovalRace' + index);
    const raceKey = 'fixture-removal-race-' + randomBytes(24).toString('hex');
    keys.push(raceKey);
    const imported = await json(await restock({ requestId: randomUUID(), packId: 'usd10', keys: [raceKey] }), 201);
    const pendingRace = (await json(await create(racing, 'usd10', 'kpay'), 201)).order;
    const reviewRace = (await json(await proof(racing, pendingRace, uniqueProofPng()))).order;
    const customerPath = '/api/admin/customers/' + racing.id;
    const currentCustomer = await json(await get(customerPath, owner));
    const remove = () => mutate(customerPath, 'DELETE', { version: currentCustomer.version, confirmation: racing.id }, owner);
    const approve = () => decide(reviewRace, {});
    const requests = index ? [approve(), remove()] : [remove(), approve()];
    const results = await Promise.all(requests);
    const removal = results[index ? 1 : 0], approval = results[index ? 0 : 1];
    await json(removal);
    assert.ok([200, 404].includes(approval.status), 'Approval either commits first or observes the deleted order');
    const approvalBody = await json(approval, approval.status);
    assert.ok(!JSON.stringify(approvalBody).includes(raceKey));
    const didApprove = approval.status === 200;
    const [[remainingOrder]] = await db.execute('SELECT COUNT(*) AS total FROM digimium_runninghub_orders WHERE id = ?', [reviewRace.id]);
    assert.equal(Number(remainingOrder.total), 0, 'Customer deletion erases the private order and its receipt/delivery');
    const [[verification]] = await db.execute('SELECT COUNT(*) AS total FROM digimium_runninghub_payments WHERE order_id = ?', [reviewRace.id]);
    const [[approvalAudit]] = await db.execute("SELECT COUNT(*) AS total FROM digimium_runninghub_audit WHERE order_id = ? AND event = 'payment-approved'", [reviewRace.id]);
    assert.equal(Number(verification.total), 0, 'No wallet reference is stored by the single-click path.');
    assert.equal(Number(approvalAudit.total), didApprove ? 1 : 0);
    const afterRemoval = await json(await get(admin, owner));
    const raceStock = afterRemoval.stock.find(item => item.id === imported.ids[0]);
    assert.ok(raceStock);
    assert.equal(raceStock.reservedOrderId, null);
    assert.equal(raceStock.status, didApprove ? 'issued' : 'available');
    assert.equal(raceStock.issuedOrderId, didApprove ? reviewRace.id : null);
    assert.ok(!JSON.stringify(afterRemoval).includes(raceKey));
    await json(await mutate(admin + '/orders/' + reviewRace.id + '/reveal', 'POST', { confirmation: reviewRace.id }, owner), 404);
    if (didApprove) {
      await json(await mutate(admin + '/stock/' + raceStock.id, 'DELETE', { confirmation: raceStock.id }, owner), 409);
    } else {
      await json(await mutate(admin + '/stock/' + raceStock.id, 'DELETE', { confirmation: raceStock.id }, owner));
    }
    await json(await restock({ requestId: randomUUID(), packId: 'usd10', keys: [raceKey] }), 409);
  }

  // Dedicated Admin bot: receipt-bound single-click approval, legacy button compatibility and owner-only delivery.
  const telegramBuyer = await addCustomer('TelegramBuyerFixture', 'digimium-receipt-fixture@gmail.com');
  const telegramSecond = await addCustomer('TelegramSecondFixture', null);
  const telegramStale = await addCustomer('TelegramStaleFixture', null);
  const telegramUsername = 'digimium_fixture_buyer';
  const telegramIdentity = '98765432111223';
  const identityWithoutUsername = '98765432111224';
  await db.execute('INSERT INTO digimium_telegram_identities (telegram_id, customer_id, username, created_at) VALUES (?, ?, ?, UTC_TIMESTAMP(3))',
    [telegramIdentity, telegramSecond.id, telegramUsername]);
  await db.execute('INSERT INTO digimium_telegram_identities (telegram_id, customer_id, username, created_at) VALUES (?, ?, NULL, UTC_TIMESTAMP(3))',
    [identityWithoutUsername, telegramStale.id]);
  const gmailIdentity = ['Customer: ' + telegramBuyer.name, 'Gmail: ' + telegramBuyer.email];
  const linkedIdentity = ['Customer: ' + telegramSecond.name, 'Telegram: @' + telegramUsername, 'Telegram ID: ' + telegramIdentity];
  const telegramKeys = Array.from({ length: 3 }, () => 'fixture-telegram-key-' + randomBytes(24).toString('hex'));
  keys.push(...telegramKeys);
  await json(await restock({ requestId: randomUUID(), packId: 'usd10', keys: telegramKeys }), 201);
  async function reviewViaBot(buyer, identity, photoFallback = false) {
    const createAfter = (await calls()).length;
    const method = 'kpay';
    const pendingOrder = (await json(await create(buyer, 'usd10', method), 201)).order;
    const createdNotice = await providerCall(call => call.method === 'sendMessage' &&
      call.fields.text?.startsWith('🛒 New order\n' + orderIdLine(pendingOrder) + '\n'), createAfter);
    buyerIdentity(createdNotice.fields.text, identity);
    assert.equal(createdNotice.fields.protect_content, true);
    const [[{ payload }]] = await db.execute('SELECT payload FROM digimium_notification_outbox WHERE dedupe_key = ?',
      ['runninghub-order-created:' + pendingOrder.id]);
    assertOrderProjection(JSON.parse(payload), buyer, telegramIdentity, identityWithoutUsername, telegramUsername);
    assertOrderProjection(pendingOrder, buyer, telegramIdentity, identityWithoutUsername, telegramUsername);
    // Receipt and approval alerts must show the original order time, even across a date boundary.
    await db.execute('UPDATE digimium_runninghub_orders SET created_at = ? WHERE id = ?', ['2025-12-31T19:00:00.000Z', pendingOrder.id]);
    const after = (await calls()).length;
    if (photoFallback) await writeFile(env.RUNNINGHUB_FIXTURE_CONTROL, JSON.stringify({ rejectPhoto: true }));
    const proofRequestId = randomUUID(), receiptBytes = uniqueProofPng();
    const reviewed = (await json(await proof(buyer, pendingOrder, receiptBytes, 'image/png', proofRequestId))).order;
    const receipt = await providerCall(call => call.method === (photoFallback ? 'sendDocument' : 'sendPhoto') &&
      String(call.fields.caption).toLowerCase().includes(reviewed.id.slice(0, 8).toLowerCase()), after);
    await writeFile(env.RUNNINGHUB_FIXTURE_CONTROL, '{}');
    const callCount = (await calls()).length;
    assert.equal((await json(await proof(buyer, pendingOrder, receiptBytes, 'image/png', proofRequestId))).order.id, reviewed.id);
    assert.equal((await calls()).length, callCount, 'Retrying acknowledged proof must not resend its delivered alert.');
    const [[queued]] = await db.execute('SELECT COUNT(*) AS total, MAX(sent_at) AS sent FROM digimium_runninghub_admin_outbox WHERE order_id = ? AND proof_request_id = ?', [reviewed.id, proofRequestId]);
    assert.equal(Number(queued.total), 1); assert.ok(queued.sent);
    assert.equal(receipt.upload.sha256, createHash('sha256').update(receiptBytes).digest('hex'));
    assert.equal(receipt.upload.size, receiptBytes.length);
    assert.equal(receipt.upload.type, 'image/png');
    assert.equal(receipt.upload.name, 'runninghub-payment-receipt.png');
    assert.equal(String(receipt.fields.chat_id), String(botOwnerId));
    assert.equal(String(receipt.fields.message_thread_id), String(botTopic));
    assert.equal(String(receipt.fields.protect_content), 'true');
    assert.ok(receipt.fields.caption.startsWith('🧾 Payment review\n' + orderIdLine(reviewed) + '\n' + orderTimeLine + '\n\n'));
    assert.match(receipt.fields.caption, /\n\nRunning HUB API Key — 10 USD bundle\n/);
    buyerIdentity(receipt.fields.caption, identity);
    assert.deepEqual(JSON.parse(receipt.fields.caption_entities), boldTitle('🧾 Payment review'));
    assert.ok(receipt.fields.caption.length <= 1024, 'The receipt caption remains below Telegram’s limit.');
    assert.match(receipt.fields.caption, /70[,. ]?000/);
    assert.match(receipt.fields.caption, /KPay/i);
    const buttons = markup(receipt.fields).inline_keyboard.flat();
    const approvalButton = buttons.find(button => button.callback_data);
    assert.ok(approvalButton, 'The private receipt includes a signed payment approval button.');
    assert.match(approvalButton.callback_data, /^[A-Za-z0-9_-]{64}$/);
    assert.ok(buttons.some(button => button.url === base.origin + '/admin/runninghub?order=' + reviewed.id));
    if (photoFallback) assert.ok((await calls()).slice(after).some(call => call.method === 'sendPhoto'), 'A rejected photo falls back to uploading the original document.');
    for (const forbidden of [buyer.id, ...settings.methods.map(method => method.accountNumber)]) {
      assert.ok(!JSON.stringify(receipt.fields).includes(forbidden), 'Receipt captions omit the internal customer ID and receiving-account details.');
    }
    assertOrderProjection(reviewed, buyer, telegramIdentity, identityWithoutUsername, telegramUsername);
    redacted(receipt);
    return { order: reviewed, receipt, token: approvalButton.callback_data };
  }
  const telegram = await reviewViaBot(telegramBuyer, gmailIdentity);
  const acceptedCallback = callback(telegram.receipt, telegram.token);
  assert.equal((await request('/api/internal/runninghub-bot/webhook', { method: 'POST', headers: {
    'Content-Type': 'application/json', 'X-Telegram-Bot-Api-Secret-Token': env.DIGIMIUM_ADMIN_ORDERS_TELEGRAM_WEBHOOK_SECRET,
  }, body: JSON.stringify(acceptedCallback) })).status, 404, 'The retired product-specific webhook is not an alternate approval entry point.');
  for (const secret of ['', 'incorrect-fixture-secret']) {
    const denied = await webhook(acceptedCallback, secret);
    assert.ok([401, 403].includes(denied.response.status), 'A missing or wrong webhook secret must reject the update.');
  }
  const validPrompts = async () => (await calls()).filter(call => call.method === 'sendMessage' && markup(call.fields)?.force_reply);
  const promptsBefore = (await validPrompts()).length;
  for (const change of [
    update => { update.callback_query.from.id++; },
    update => { update.callback_query.from.is_bot = true; },
    update => { update.callback_query.message.chat.id++; },
    update => { update.callback_query.message.chat.type = 'group'; },
    update => { update.callback_query.message.message_thread_id = Number(env.DIGIMIUM_ADMIN_ORDERS_TELEGRAM_ORDERS_TOPIC_ID); },
    update => { update.callback_query.message.message_thread_id = Number(env.DIGIMIUM_ADMIN_ORDERS_TELEGRAM_REGISTRATION_TOPIC_ID); },
    update => { update.callback_query.message.message_thread_id = 1; },
    update => { delete update.callback_query.message.message_thread_id; },
    update => { update.callback_query.message.from.id++; },
    update => { update.callback_query.message.from.is_bot = false; },
    update => { const bytes = Buffer.from(update.callback_query.data, 'base64url'); bytes[16] ^= 1; update.callback_query.data = bytes.toString('base64url'); },
  ]) {
    const invalid = structuredClone(callback(telegram.receipt, telegram.token)); change(invalid);
    const result = await webhook(invalid); assert.equal(result.response.status, 200);
  }
  assert.equal((await validPrompts()).length, promptsBefore, 'Mismatched callback bindings and proof signatures cannot open approval prompts.');
  assert.equal((await json(await get(customer + '/' + telegram.order.id, telegramBuyer.cookie))).order.status, 'payment_review');
  // A previously delivered ForceReply is recognized safely, but text replies cannot approve now.
  const prompt = { messageId: 45001, fields: { text: 'Running HUB payment check\nOrder #' + telegram.order.id.slice(0, 8).toUpperCase() +
    '\nCheck the amount and recipient in your wallet, then reply to this message with that transaction reference.' +
    '\nNever send an API key or password.\nRH approval: ' + telegram.token } };
  const telegramReference = 'RH-FIXTURE-WALLET-12345001'; sensitiveReferences.push(telegramReference);
  const reply = referenceReply(prompt, telegramReference);
  for (const change of [
    update => { update.message.from.id++; },
    update => { update.message.from.is_bot = true; },
    update => { update.message.chat.id++; },
    update => { update.message.chat.type = 'supergroup'; },
    update => { update.message.message_thread_id++; },
    update => { delete update.message.message_thread_id; },
    update => { update.message.reply_to_message.from.id++; },
    update => { update.message.reply_to_message.from.is_bot = false; },
    update => { update.message.reply_to_message.chat.id++; },
    update => { update.message.reply_to_message.chat.type = 'group'; },
    update => { update.message.reply_to_message.text = 'Changed prompt\n' + update.message.reply_to_message.text; },
    update => { delete update.message.reply_to_message; },
  ]) {
    const invalid = structuredClone(referenceReply(prompt, telegramReference)); change(invalid);
    assert.equal((await webhook(invalid)).response.status, 200);
  }
  const stillReviewing = await json(await get(customer + '/' + telegram.order.id, telegramBuyer.cookie));
  assert.equal(stillReviewing.order.status, 'payment_review'); assert.equal(stillReviewing.apiKey, undefined);
  const oldReply = await webhook(reply);
  assert.equal(oldReply.response.status, 200);
  assert.equal(oldReply.body.method, 'sendMessage');
  assert.match(oldReply.body.text, /reference is no longer needed/i);
  assert.equal((await json(await get(customer + '/' + telegram.order.id, telegramBuyer.cookie))).order.status, 'payment_review');
  async function approvalMessages(order) {
    const alerts = (await calls()).filter(call => call.method === 'sendMessage' &&
      call.fields.text?.startsWith('✅ Payment approved\n' + orderIdLine(order) + '\n' + orderTimeLine + '\n\n'));
    for (const alert of alerts) {
      assert.deepEqual(alert.fields.entities, boldTitle('✅ Payment approved'));
      assert.equal(alert.fields.protect_content, true);
      assert.match(alert.fields.text, /\n\nRunning HUB API Key — 10 USD bundle\n/);
      for (const method of settings.methods) assert.ok(!alert.fields.text.includes(method.accountNumber));
    }
    return alerts;
  }
  // A provider outage cannot undo the approval or key delivery.
  const beforeApproval = (await calls()).length;
  await writeFile(env.RUNNINGHUB_FIXTURE_CONTROL, JSON.stringify({ fail: true }));
  const buttonResponses = await Promise.all([webhook(acceptedCallback), webhook(acceptedCallback)]);
  await writeFile(env.RUNNINGHUB_FIXTURE_CONTROL, '{}');
  for (const result of buttonResponses) {
    assert.equal(result.response.status, 200);
    assert.equal(result.body.method, 'answerCallbackQuery');
    assert.match(result.body.text, /approved|already recorded/i);
  }
  const attempts = (await calls()).slice(beforeApproval);
  assert.equal(attempts.length, 1, 'Concurrent callbacks make just one attempt at the regular confirmation.');
  const [failedNotice] = await approvalMessages(telegram.order);
  assert.ok(failedNotice);
  assert.equal(failedNotice.fields.reply_markup, undefined, 'Approval asks for no follow-up reply.');
  buyerIdentity(failedNotice.fields.text, gmailIdentity);
  redacted(failedNotice);
  const [[queuedNotice]] = await db.execute(
    'SELECT attempts, sent_at FROM digimium_runninghub_approval_outbox WHERE order_id = ?', [telegram.order.id]);
  assert.equal(queuedNotice.attempts, 1);
  assert.equal(queuedNotice.sent_at, null);
  const delivered = await json(await get(customer + '/' + telegram.order.id, telegramBuyer.cookie));
  assert.equal(delivered.order.status, 'approved'); assert.ok(telegramKeys.includes(delivered.apiKey));
  assertOrderProjection(delivered.order, telegramBuyer);
  await db.execute('UPDATE digimium_runninghub_approval_outbox SET next_attempt_at = UTC_TIMESTAMP(3) WHERE order_id = ?', [telegram.order.id]);
  const run = await request('/api/internal/notifications/run', { method: 'POST', headers: { Authorization: 'Bearer ' + env.NOTIFICATIONS_CRON_SECRET } });
  assert.equal(run.status, 200);
  assert.equal((await run.json()).runningHubApprovals.sent, 1);
  const [[sentNotice]] = await db.execute(
    'SELECT attempts, sent_at FROM digimium_runninghub_approval_outbox WHERE order_id = ?', [telegram.order.id]);
  assert.equal(sentNotice.attempts, 2);
  assert.ok(sentNotice.sent_at);
  assert.equal((await webhook(reply)).response.status, 200, 'Redelivery of the same update is harmless.');
  assert.equal((await webhook(referenceReply(prompt, telegramReference))).response.status, 200, 'Legacy replies never issue another key.');
  assert.equal((await webhook(callback(telegram.receipt, telegram.token))).response.status, 200);
  const oldCallback = callback(telegram.receipt, telegram.token);
  oldCallback.callback_query.message.message_thread_id = legacyPaymentTopic;
  const oldCallbackResponse = await webhook(oldCallback);
  assert.match(oldCallbackResponse.body.text, /already approved/i, 'A valid existing payment-topic button survives cutover.');
  assert.equal((await json(await get(customer + '/' + telegram.order.id, telegramBuyer.cookie))).apiKey, delivered.apiKey);
  await json(await get(customer + '/' + telegram.order.id, telegramSecond.cookie), 404);
  const [[telegramAudit]] = await db.execute("SELECT COUNT(*) AS total FROM digimium_runninghub_audit WHERE order_id = ? AND event = 'payment-approved'", [telegram.order.id]);
  assert.equal(Number(telegramAudit.total), 1);
  assert.equal((await approvalMessages(telegram.order)).length, 2, 'A replay does not resend an acknowledged confirmation.');

  const fallback = await reviewViaBot(telegramSecond, linkedIdentity, true);
  // Existing signed buttons remain usable after a legacy reference-based Admin approval.
  const legacyBotReference = 'LEGACY-BOT-881201'; sensitiveReferences.push(legacyBotReference);
  const legacyBotDecision = { requestId: randomUUID(), paymentReference: legacyBotReference };
  await json(await decide(fallback.order, legacyBotDecision));
  assert.equal((await json(await decide(fallback.order, legacyBotDecision))).applied, false);
  const [websiteNotice] = await approvalMessages(fallback.order);
  assert.ok(websiteNotice, 'Website approval also posts a persistent confirmation.');
  buyerIdentity(websiteNotice.fields.text, linkedIdentity);
  assert.ok(!websiteNotice.fields.text.includes(telegramSecond.id));
  // Simulate an approved order from before confirmations were introduced.
  await db.execute('DELETE FROM digimium_runninghub_approval_outbox WHERE order_id = ?', [fallback.order.id]);
  const legacyButton = await webhook(callback(fallback.receipt, fallback.token));
  assert.equal(legacyButton.response.status, 200);
  assert.match(legacyButton.body.text, /already approved/i);
  assert.equal((await approvalMessages(fallback.order)).length, 2, 'The historical button recovers one missing confirmation.');
  assert.equal((await webhook(callback(fallback.receipt, fallback.token))).response.status, 200);
  assert.equal((await approvalMessages(fallback.order)).length, 2);
  const fallbackDelivery = await json(await get(customer + '/' + fallback.order.id, telegramSecond.cookie));
  assert.equal(fallbackDelivery.order.status, 'approved'); assert.notEqual(fallbackDelivery.apiKey, delivered.apiKey);
  assert.ok(telegramKeys.includes(fallbackDelivery.apiKey));
  assertOrderProjection(fallbackDelivery, telegramSecond, telegramIdentity, telegramUsername);

  // A receipt's signed button becomes stale after a website decision; neither route bypasses the other.
  const stale = await reviewViaBot(telegramStale, ['Customer: ' + telegramStale.name, 'Telegram ID: ' + identityWithoutUsername]);
  await db.execute('UPDATE digimium_runninghub_orders SET revision = revision + 1 WHERE id = ?', [stale.order.id]);
  const changedAlert = await webhook(callback(stale.receipt, stale.token));
  assert.equal(changedAlert.body.show_alert, true);
  assert.match(changedAlert.body.text, /changed after this button/i);
  const changedDetail = await json(await get(customer + '/' + stale.order.id, telegramStale.cookie));
  assert.equal(changedDetail.order.status, 'payment_review'); assert.equal(changedDetail.apiKey, undefined);
  await db.execute('UPDATE digimium_runninghub_orders SET revision = ? WHERE id = ?', [stale.order.revision, stale.order.id]);
  await json(await decide(stale.order, { action: 'reject', paymentReference: undefined, proofRequestId: undefined, note: 'Synthetic receipt mismatch.' }));
  const beforeStale = (await validPrompts()).length;
  const rejectedAlert = await webhook(callback(stale.receipt, stale.token));
  assert.equal(rejectedAlert.response.status, 200);
  assert.equal(rejectedAlert.body.show_alert, true);
  assert.match(rejectedAlert.body.text, /order was rejected/i);
  assert.equal((await validPrompts()).length, beforeStale);
  const staleDetail = await json(await get(customer + '/' + stale.order.id, telegramStale.cookie));
  assert.equal(staleDetail.order.status, 'rejected'); assert.equal(staleDetail.apiKey, undefined);
  redacted(await calls()); redacted(serverOutput);
  namesHidden(await calls()); namesHidden(serverOutput);
  redacted(await json(await get(admin, owner)));
  redacted(await json(await get(customer, telegramBuyer.cookie)));

  await checkRunningHubHistory({ db, get, json, addCustomer, adminCookie: owner });

  const [[legacy]] = await db.query('SELECT COUNT(*) AS total FROM digimium_orders');
  const [notificationKinds] = await db.query('SELECT DISTINCT kind FROM digimium_notification_outbox');
  assert.equal(Number(legacy.total), 0);
  assert.deepEqual(notificationKinds.map(row => row.kind), ['runninghub-order-created']);
  assert.deepEqual(await json(await get('/api/admin/catalog', owner)), catalogBefore);

  // Some live alerts predate any topic. Their original signed buttons remain usable after cutover.
  await stop();
  await start({ DIGIMIUM_ADMIN_ORDERS_TELEGRAM_PAYMENT_TOPIC_ID: '' });
  for (const topic of [undefined, 1]) {
    const oldGeneral = callback(telegram.receipt, telegram.token);
    oldGeneral.callback_query.message.message_thread_id = topic;
    const result = await webhook(oldGeneral);
    assert.match(result.body.text, /already approved/i, 'A valid existing General button survives cutover.');
    assert.equal((await json(await get(customer + '/' + telegram.order.id, telegramBuyer.cookie))).apiKey, delivered.apiKey);
  }

  // Before a Running HUB Orders topic is configured, the legacy payment topic keeps its previous disclosures.
  await stop();
  await start({ DIGIMIUM_ADMIN_ORDERS_TELEGRAM_RUNNINGHUB_TOPIC_ID: '' });
  const legacyTopicKey = 'fixture-legacy-topic-key-' + randomBytes(24).toString('hex');
  keys.push(legacyTopicKey);
  await json(await restock({ requestId: randomUUID(), packId: 'usd10', keys: [legacyTopicKey] }), 201);
  const beforeLegacyTopic = (await calls()).length;
  const legacyTopicOrder = (await json(await create(telegramSecond, 'usd10', 'kpay'), 201)).order;
  assert.equal((await calls()).length, beforeLegacyTopic, 'New Running HUB orders wait for the dedicated topic.');
  await db.execute('UPDATE digimium_runninghub_orders SET created_at = ? WHERE id = ?', ['2025-12-31T19:00:00.000Z', legacyTopicOrder.id]);
  const legacyTopicReview = (await json(await proof(telegramSecond, legacyTopicOrder, uniqueProofPng()))).order;
  const legacyTopicReceipt = await providerCall(call => call.method === 'sendPhoto' &&
    call.fields.caption?.includes(orderIdLine(legacyTopicReview)), beforeLegacyTopic);
  assert.equal(Number(legacyTopicReceipt.fields.message_thread_id), legacyPaymentTopic);
  buyerIdentity(legacyTopicReceipt.fields.caption, []);
  await json(await decide(legacyTopicReview, {}));
  const [legacyTopicApproval] = await approvalMessages(legacyTopicReview);
  assert.equal(Number(legacyTopicApproval.fields.message_thread_id), legacyPaymentTopic);
  buyerIdentity(legacyTopicApproval.fields.text, ['Telegram: @' + telegramUsername]);
  redacted((await calls()).slice(beforeLegacyTopic));
  console.log('Running HUB integration passed: isolated catalog, exact MMK prices, private buyer identity and legacy topic boundaries, protected receipts, website and Admin Orders Telegram approval, signed owner/topic/bot checks, single-click proof/revision replay and duplicate-image prevention, protected approval confirmations and retries, document fallback, owner-only key delivery, customer history and concurrent customer removal.');
} finally {
  await stop();
  await db.end();
  await rm(fixtureDirectory, { recursive: true, force: true });
}
