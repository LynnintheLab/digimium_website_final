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
  for (let attempt = 0; ; attempt++) {
    try { assert.equal((await request('/admin/login')).status, 200); break; }
    catch (error) {
      if (attempt > 120 || server.exitCode !== null || !['ECONNREFUSED', 'UND_ERR_SOCKET'].includes(error.cause?.code)) throw error;
      await delay(100);
    }
  }
  const admin = '/api/admin/runninghub';
  const customer = '/api/customer/runninghub';
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
  const walletRef = 'FIXTURE-881201';
  const redacted = value => {
    for (const secret of [...keys, walletRef]) assert.ok(!JSON.stringify(value).includes(secret), 'Sensitive keys and wallet references are scoped to explicit reads');
  };
  const create = (buyer, packId, method, requestId = randomUUID(), extra = {}) => mutate(customer, 'POST',
    { requestId, expectedCustomerId: buyer.id, packId, method, ...extra }, buyer.cookie);
  const proof = (buyer, order, bytes = proofPng, mime = 'image/png', requestId = randomUUID()) => request(
    customer + '/' + order.id + '/proof?revision=' + order.revision + '&requestId=' + requestId,
    { method: 'POST', headers: { Origin: base.origin, Cookie: buyer.cookie, 'Content-Type': mime }, body: bytes },
  );
  const decide = (order, fields, session = owner, origin = base.origin) => mutate(admin + '/orders/' + order.id, 'PATCH',
    { action: 'approve', revision: order.revision, requestId: randomUUID(), proofRequestId: order.proofRequestId,
      paymentReference: walletRef, ...fields }, session, origin);
  const restock = (body, session = owner) => mutate(admin + '/stock', 'POST', body, session);

  await json(await get(admin), 401);
  await json(await get(admin, alice.cookie), 401);
  await json(await get(customer), 401);
  const empty = await json(await get(admin, owner));
  assert.deepEqual(empty.packs.map(pack => [pack.id, pack.priceMmk]), [['usd10', 70000], ['usd20', 138000]]);
  assert.equal(empty.stock.length, 0);
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

  const batch = { requestId: randomUUID(), packId: 'usd10', keys: keys.slice(0, 2) };
  const last = { requestId: randomUUID(), packId: 'usd20', keys: [keys[2]] };
  await json(await restock(batch, alice.cookie), 401);
  const additions = await json(await restock(batch), 201);
  assert.equal(additions.added, 2);
  assert.deepEqual((await json(await restock(batch))).ids, additions.ids);
  await json(await restock({ ...batch, requestId: randomUUID() }), 409);
  assert.equal((await json(await restock(last), 201)).added, 1);
  const before = await json(await get(admin, owner));
  redacted(before);
  assert.equal(before.stock.length, 3);
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
  assert.equal(first.priceMmk, 70000);
  assert.equal(first.payment.id, 'kpay');
  assert.ok(Date.parse(first.expiresAt) > Date.now());
  assert.equal((await json(await create(alice, 'usd10', 'kpay', requestId))).order.id, first.id);
  await json(await create(alice, 'usd10', 'aya', requestId), 409);
  await json(await create(alice, 'usd20', 'aya'), 409);
  const firstPath = customer + '/' + first.id;
  const preApproval = await json(await get(firstPath, alice.cookie));
  redacted(preApproval);
  assert.equal(preApproval.apiKey, undefined);
  await json(await get(firstPath, bob.cookie), 404);
  await json(await decide(first, { proofRequestId: randomUUID() }), 409);
  await json(await proof(bob, first), 404);
  await json(await proof(alice, first, proofPng, 'image/svg+xml'), 415);

  const review = (await json(await proof(alice, first))).order;
  assert.equal(review.status, 'payment_review');
  assert.equal(review.expiresAt, null);
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
  const approved = await json(await decide(review, decision));
  redacted(approved);
  assert.equal(approved.order.status, 'approved');
  assert.ok(approved.order.keyId);
  const replay = await json(await decide(review, { ...decision, paymentReference: 'fixture 881201' }));
  assert.equal(replay.order.keyId, approved.order.keyId);
  const detail = await json(await get(firstPath, alice.cookie));
  assert.ok(keys.slice(0, 2).includes(detail.apiKey));
  assert.equal(detail.order.keyId, approved.order.keyId);
  assert.equal((await json(await get(firstPath, alice.cookie))).apiKey, detail.apiKey);
  redacted(await json(await get(customer, alice.cookie)));
  await json(await get(firstPath, bob.cookie), 404);
  const adminView = await json(await get(admin, owner));
  redacted(adminView);
  const recorded = adminView.orders.find(order => order.id === first.id);
  assert.equal(recorded.customerId, alice.id);
  assert.equal(recorded.customerName, alice.name);
  assert.equal(recorded.keyId, approved.order.keyId);
  const revealPath = admin + '/orders/' + first.id + '/reveal';
  await json(await mutate(revealPath, 'POST', { confirmation: first.id }, alice.cookie), 401);
  assert.equal((await json(await mutate(revealPath, 'POST', { confirmation: first.id }, owner))).apiKey, detail.apiKey);

  const duplicate = (await json(await create(bob, 'usd10', 'kpay'), 201)).order;
  const duplicateReview = (await json(await proof(bob, duplicate))).order;
  await json(await decide(duplicateReview, { paymentReference: 'fixture 881201' }), 409);
  assert.equal((await json(await get(customer + '/' + duplicate.id, bob.cookie))).order.status, 'payment_review');
  const rejected = (await json(await decide(duplicateReview, {
    action: 'reject', paymentReference: undefined, proofRequestId: undefined, note: 'Payment reference could not be reconciled.',
  }))).order;
  assert.equal(rejected.status, 'rejected');
  assert.equal((await json(await get(customer + '/' + duplicate.id, bob.cookie))).apiKey, undefined);

  const lastUnit = await Promise.all([create(bob, 'usd20', 'aya'), create(charlie, 'usd20', 'aya')]);
  assert.deepEqual(lastUnit.map(result => result.status).sort((a, b) => a - b), [201, 409]);
  const winnerIndex = lastUnit.findIndex(result => result.status === 201);
  const winner = [bob, charlie][winnerIndex];
  const loser = [bob, charlie][1 - winnerIndex];
  const second = (await json(lastUnit[winnerIndex], 201)).order;
  assert.equal(second.priceMmk, 138000);
  assert.equal(second.payment.id, 'aya');
  const secondReview = (await json(await proof(winner, second))).order;
  const secondFilled = (await json(await decide(secondReview, { paymentReference: 'AYA-88122102' }))).order;
  assert.equal((await json(await get(customer + '/' + secondFilled.id, winner.cookie))).apiKey, keys[2]);
  await json(await get(customer + '/' + secondFilled.id, loser.cookie), 404);

  const unpaid = (await json(await create(loser, 'usd10', 'aya'), 201)).order;
  await db.execute('UPDATE digimium_runninghub_orders SET expires_at = ? WHERE id = ?', ['2000-01-01T00:00:00.000Z', unpaid.id]);
  const recoveredStock = await json(await get(customer, loser.cookie));
  assert.equal(recoveredStock.orders.find(order => order.id === unpaid.id).status, 'expired');
  assert.equal(recoveredStock.packs.find(pack => pack.id === 'usd10').available, 1);
  await json(await proof(loser, unpaid), 409);

  const used = await json(await get(admin, owner));
  const available = used.stock.find(item => item.status === 'available');
  assert.ok(available);
  await json(await mutate(admin + '/stock/' + available.id, 'DELETE', { confirmation: available.id }, owner));
  await json(await restock({ ...batch, requestId: randomUUID() }), 409);
  await assertEncrypted();

  // The ordinary customer-removal path cascades private Running HUB orders outside its inventory mutex.
  // Race both request launch orders: issuance must win atomically, or the key must remain unused.
  for (let index = 0; index < 2; index++) {
    const racing = await addCustomer('RemovalRace' + index);
    const raceKey = 'fixture-removal-race-' + randomBytes(24).toString('hex');
    const imported = await json(await restock({ requestId: randomUUID(), packId: 'usd10', keys: [raceKey] }), 201);
    const pendingRace = (await json(await create(racing, 'usd10', 'kpay'), 201)).order;
    const reviewRace = (await json(await proof(racing, pendingRace))).order;
    const customerPath = '/api/admin/customers/' + racing.id;
    const currentCustomer = await json(await get(customerPath, owner));
    const remove = () => mutate(customerPath, 'DELETE', { version: currentCustomer.version, confirmation: racing.id }, owner);
    const approve = () => decide(reviewRace, { paymentReference: 'REMOVAL-RACE-' + index + '-991200' });
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
    assert.equal(Number(verification.total), didApprove ? 1 : 0);
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

  const [[legacy]] = await db.query('SELECT COUNT(*) AS total FROM digimium_orders');
  const [[notifications]] = await db.query('SELECT COUNT(*) AS total FROM digimium_notification_outbox');
  assert.equal(Number(legacy.total), 0);
  assert.equal(Number(notifications.total), 0);
  assert.deepEqual(await json(await get('/api/admin/catalog', owner)), catalogBefore);
  console.log('Running HUB integration passed: isolated catalog, exact MMK prices, KPay/AYA, protected proof, idempotent approval, duplicate payment prevention, unique key delivery, private stock tracking and concurrent customer removal.');
} finally {
  if (server && server.exitCode === null && server.signalCode === null) {
    const closed = once(server, 'exit');
    server.kill('SIGTERM');
    await Promise.race([closed, delay(3000)]);
  }
  await db.end();
}
