// Invoked only by the disposable Running HUB HTTP integration runner.
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';

const endpoint = '/api/customer/runninghub/history';
const pageFields = ['customerId', 'orders', 'counts', 'nextCursor'].sort();
const orderFields = ['id', 'packId', 'packLabel', 'priceMmk', 'status', 'createdAt', 'approvedAt', 'expiresAt'].sort();

export async function checkRunningHubHistory({ db, get, json, addCustomer, adminCookie }) {
  const config = db.connection?.config;
  assert.ok(config && ['127.0.0.1', '::1'].includes(config.host) && !config.socketPath,
    'History fixtures require an explicit loopback database connection.');
  assert.match(config.database ?? '', /^digimium_test_[a-z0-9_]+$/,
    'History fixtures require a disposable digimium_test_* database.');
  const [[database]] = await db.query('SELECT DATABASE() AS name');
  assert.equal(database.name, config.database, 'The active database must match the guarded fixture connection.');

  const customerIds = [];
  const marker = 'HISTORY-PRIVATE-' + randomUUID();
  const privateValues = [marker, marker + '-receiver', marker + '-number', marker + '-proof', marker + '-delivery', marker + '-note'];
  const createdAt = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
  const approvedAt = new Date(Date.parse(createdAt) + 60000).toISOString();
  const future = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const past = '2000-01-01T00:00:00.000Z';
  const expectedCounts = { pending: 2, purchased: 101, rejected: 3 };

  function path(status, options = {}) {
    return endpoint + '?' + new URLSearchParams({ status, ...options });
  }

  function checkPage(page, buyer, counts) {
    assert.deepEqual(Object.keys(page).sort(), pageFields, 'History exposes only its pagination contract.');
    assert.equal(page.customerId, buyer.id, 'History identifies the signed-in owner.');
    assert.deepEqual(page.counts, counts, 'Counts include the complete owner history, independent of paging and status.');
    assert.ok(Array.isArray(page.orders));
    assert.ok(page.nextCursor === null || typeof page.nextCursor === 'string' && page.nextCursor.length > 0);
    for (const order of page.orders) {
      assert.deepEqual(Object.keys(order).sort(), orderFields, 'History must not expose keys, proofs, payment details, contacts or notes.');
      assert.equal(order.packId, 'usd10');
      assert.equal(order.packLabel, '10 USD bundle');
      assert.equal(order.priceMmk, 70000);
      assert.equal(order.createdAt, createdAt);
      assert.ok(['awaiting_payment', 'payment_review', 'approved', 'rejected', 'expired'].includes(order.status));
    }
    const serialized = JSON.stringify(page);
    for (const value of [...privateValues, buyer.name, buyer.email]) {
      assert.ok(!serialized.includes(value), 'History must omit private stored data and customer contact details.');
    }
  }

  try {
    const owner = await addCustomer('HistoryOwner' + randomUUID().replaceAll('-', ''));
    customerIds.push(owner.id);
    const other = await addCustomer('HistoryOther' + randomUUID().replaceAll('-', ''));
    customerIds.push(other.id);

    const purchasedIds = Array.from({ length: 101 }, () => randomUUID()).sort().reverse();
    const awaitingId = randomUUID(), reviewingId = randomUUID(), rejectedId = randomUUID();
    const expiredId = randomUUID(), projectedExpiryId = randomUUID(), foreignId = randomUUID();
    const fixtures = [
      ...purchasedIds.map(id => ({ id, customerId: owner.id, status: 'approved', expiresAt: null })),
      { id: awaitingId, customerId: owner.id, status: 'awaiting_payment', expiresAt: future },
      { id: reviewingId, customerId: owner.id, status: 'payment_review', expiresAt: null },
      { id: rejectedId, customerId: owner.id, status: 'rejected', expiresAt: null },
      { id: expiredId, customerId: owner.id, status: 'expired', expiresAt: past },
      { id: projectedExpiryId, customerId: owner.id, status: 'awaiting_payment', expiresAt: past },
      { id: foreignId, customerId: other.id, status: 'approved', expiresAt: null },
    ];
    // Intentionally invalid encrypted payloads prove that history never reads or decrypts them.
    // Stock IDs have no foreign key; no stock or provider events are created by these summary fixtures.
    const payment = JSON.stringify({ id: 'kpay', enabled: true, accountLabel: marker + '-receiver', accountNumber: marker + '-number' });
    const rows = fixtures.map(item => [
      item.id, item.customerId, randomUUID(), randomBytes(32), 'usd10', '10 USD bundle', 70000,
      item.status, createdAt, item.expiresAt, item.status === 'approved' ? approvedAt : null,
      payment, randomUUID(), randomUUID(), randomBytes(32), 'image/png', Buffer.from(marker + '-proof'),
      marker + '-delivery', marker + '-note',
    ]);
    await db.query(`INSERT INTO digimium_runninghub_orders
      (id, customer_id, request_id, request_hash, pack_id, pack_label, price_mmk, status, created_at,
       expires_at, approved_at, payment, stock_id, proof_request_id, proof_hash, proof_mime, proof_cipher,
       delivery_cipher, note) VALUES ?`, [rows]);

    await json(await get(path('pending')), 401);
    await json(await get(path('pending'), adminCookie), 401);

    // This must be the first customer read after seeding: no purchase endpoint may expire the row first.
    const pending = await json(await get(path('pending', { limit: '25' }), owner.cookie));
    checkPage(pending, owner, expectedCounts);
    assert.deepEqual(pending.orders.map(order => order.id), [awaitingId, reviewingId].sort().reverse());
    assert.equal(pending.orders.find(order => order.id === awaitingId).status, 'awaiting_payment');
    assert.equal(pending.orders.find(order => order.id === reviewingId).status, 'payment_review');
    assert.equal(pending.nextCursor, null);

    const rejected = await json(await get(path('rejected', { limit: '25' }), owner.cookie));
    checkPage(rejected, owner, expectedCounts);
    assert.deepEqual(rejected.orders.map(order => order.id), [rejectedId, expiredId, projectedExpiryId].sort().reverse());
    assert.equal(rejected.orders.find(order => order.id === rejectedId).status, 'rejected');
    assert.equal(rejected.orders.find(order => order.id === expiredId).status, 'expired');
    assert.equal(rejected.orders.find(order => order.id === projectedExpiryId).status, 'expired');
    assert.equal(rejected.nextCursor, null);
    const [[unchanged]] = await db.execute('SELECT status, revision, expires_at FROM digimium_runninghub_orders WHERE id = ?', [projectedExpiryId]);
    assert.deepEqual({ status: unchanged.status, revision: unchanged.revision, expiresAt: unchanged.expires_at },
      { status: 'awaiting_payment', revision: 1, expiresAt: past }, 'History projects expiry without mutating the stored order.');

    const allIds = [];
    const seenCursors = new Set();
    let cursor = null, firstCursor;
    for (let pageNumber = 0; pageNumber < 5; pageNumber++) {
      const page = await json(await get(path('purchased', { limit: '25', ...(cursor ? { cursor } : {}) }), owner.cookie));
      checkPage(page, owner, expectedCounts);
      assert.deepEqual(page.orders.map(order => order.id), purchasedIds.slice(pageNumber * 25, (pageNumber + 1) * 25),
        'Equal timestamps use descending UUIDs, with no skipped or repeated purchases.');
      assert.ok(page.orders.every(order => order.status === 'approved' && order.approvedAt === approvedAt));
      allIds.push(...page.orders.map(order => order.id));
      if (pageNumber < 4) {
        assert.ok(page.nextCursor, 'More than 100 purchases remain accessible through seek pagination.');
        assert.ok(!seenCursors.has(page.nextCursor), 'Each page advances its cursor.');
        seenCursors.add(page.nextCursor);
        firstCursor ??= page.nextCursor;
      } else assert.equal(page.nextCursor, null);
      cursor = page.nextCursor;
    }
    assert.equal(new Set(allIds).size, 101);
    assert.deepEqual(allIds, purchasedIds);

    const defaultPage = await json(await get(path('purchased'), owner.cookie));
    checkPage(defaultPage, owner, expectedCounts);
    assert.deepEqual(defaultPage.orders.map(order => order.id), purchasedIds.slice(0, 25));
    for (const limit of [1, 50]) {
      const page = await json(await get(path('purchased', { limit: String(limit) }), owner.cookie));
      checkPage(page, owner, expectedCounts);
      assert.deepEqual(page.orders.map(order => order.id), purchasedIds.slice(0, limit));
    }

    const foreign = await json(await get(path('purchased', { limit: '25' }), other.cookie));
    checkPage(foreign, other, { pending: 0, purchased: 1, rejected: 0 });
    assert.deepEqual(foreign.orders.map(order => order.id), [foreignId]);
    assert.equal(foreign.nextCursor, null);
    await json(await get(path('purchased', { cursor: firstCursor }), other.cookie), 400);
    await json(await get(path('rejected', { cursor: firstCursor }), owner.cookie), 400);

    for (const invalidCursor of ['', '%%%', 'x'.repeat(385), Buffer.from('[]').toString('base64url')]) {
      await json(await get(path('purchased', { cursor: invalidCursor }), owner.cookie), 400);
    }
    for (const limit of ['0', '51', '1.5', '-1', 'invalid']) {
      await json(await get(path('purchased', { limit }), owner.cookie), 400);
    }
    await json(await get(path('unknown'), owner.cookie), 400);
  } finally {
    if (customerIds.length) {
      await db.execute(`DELETE FROM digimium_customers WHERE id IN (${customerIds.map(() => '?').join(', ')})`, customerIds);
      const [[remaining]] = await db.execute(`SELECT COUNT(*) AS total FROM digimium_runninghub_orders WHERE customer_id IN (${customerIds.map(() => '?').join(', ')})`, customerIds);
      assert.equal(Number(remaining.total), 0, 'Dedicated history fixtures are removed through the customer cascade.');
    }
  }
}
