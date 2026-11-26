import { createCipheriv, createDecipheriv, createHmac, randomBytes, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { PoolConnection, RowDataPacket } from 'mysql2/promise';
import { z } from 'zod';
import { CommerceError } from '../lib/commerce-http';
import { LOGO_PATH_PATTERN } from '../lib/logo-path';
import { identifyLogo, LogoInputError, validateLogoReferences } from '../lib/logo-storage';
import { RUNNINGHUB_PACKS, RUNNINGHUB_PROOF_MAX_BYTES, RUNNINGHUB_RESERVATION_MINUTES, normalizeRunningHubReference,
  type RunningHubOrder, type RunningHubPackId, type RunningHubPaymentMethod, type RunningHubStock } from '../lib/runninghub';
import { ensureCustomerSchema } from './customer-auth';
import { getPool } from './mysql';

const uuid = z.string().uuid();
const revision = z.number().int().positive().max(0xfffffffe);
const packId = z.enum(['usd10', 'usd20']);
const methodId = z.enum(['kpay', 'aya']);
const safeText = (max: number) => z.string().trim().max(max).refine(value => !/[\p{Cc}\u202a-\u202e\u2066-\u2069]/u.test(value));
const methodSchema = z.object({ id: methodId, enabled: z.boolean(), accountLabel: safeText(150), accountNumber: safeText(150),
  qrPath: z.string().regex(LOGO_PATH_PATTERN).optional() }).strict()
  .refine(value => !value.enabled || Boolean(value.accountLabel && value.accountNumber));
const settingsSchema = z.object({ revision, methods: z.array(methodSchema).max(2)
  .refine(methods => new Set(methods.map(method => method.id)).size === methods.length) }).strict();
const createSchema = z.object({ requestId: uuid, expectedCustomerId: uuid, packId, method: methodId }).strict();
const importSchema = z.object({ requestId: uuid, packId,
  keys: z.array(z.string().trim().min(8).max(2048).refine(value => !/[\s\p{Cc}\u202a-\u202e\u2066-\u2069]/u.test(value))).min(1).max(100) }).strict();
const actionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('approve'), revision, requestId: uuid, proofRequestId: uuid,
    paymentReference: safeText(100).refine(value => normalizeRunningHubReference(value) !== null), note: safeText(1000).optional() }).strict(),
  z.object({ action: z.literal('reject'), revision, requestId: uuid, note: safeText(1000).optional() }).strict(),
]);
const proofSchema = z.object({ revision, requestId: uuid }).strict();
const confirmSchema = z.object({ confirmation: uuid }).strict();
const columns = 'id, customer_id, pack_id, pack_label, price_mmk, status, revision, created_at, expires_at, approved_at, payment, stock_id, proof_request_id, note';
type OrderRow = RowDataPacket & { id: string; customer_id: string; pack_id: RunningHubPackId; pack_label: string; price_mmk: number;
  status: RunningHubOrder['status']; revision: number; created_at: string; expires_at: string | null; approved_at: string | null;
  payment: string; stock_id: string; proof_request_id: string | null; note: string; request_hash: Buffer;
  proof_hash: Buffer | null; proof_mime: string | null; proof_cipher: Buffer | null; delivery_cipher: string | null };
type StockRow = RowDataPacket & { id: string; pack_id: RunningHubPackId; key_cipher: string; reserved_order_id: string | null;
  issued_order_id: string | null; retired: number; created_at: string };
type SettingsRow = RowDataPacket & { revision: number; methods: string };

let schemaReady: Promise<void> | undefined;
export function ensureRunningHub() {
  return schemaReady ??= (async () => {
    await ensureCustomerSchema();
    const sql = await readFile(join(process.cwd(), 'hostinger', 'runninghub-schema.sql'), 'utf8');
    for (const statement of sql.split(';').filter(value => value.trim())) await getPool().query(statement);
    await getPool().execute("INSERT IGNORE INTO digimium_runninghub_settings (id, methods) VALUES (1, '[]')");
  })().catch(error => { schemaReady = undefined; throw error; });
}
function secret(purpose: string) {
  const key = process.env.ORDER_FULFILLMENT_SECRET?.trim() || process.env.ADMIN_AUTH_SECRET?.trim();
  if (!key || key.length < 32) throw new Error('Missing Running HUB encryption configuration.');
  return createHmac('sha256', key).update('digimium/runninghub/v1/' + purpose).digest();
}
function digest(purpose: string, value: string) {
  return createHmac('sha256', secret(purpose)).update(value).digest();
}
function encrypt(context: string, bytes: Buffer) {
  const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', secret('encryption'), iv);
  cipher.setAAD(Buffer.from(context));
  const data = Buffer.concat([cipher.update(bytes), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), data]);
}
function decrypt(context: string, bytes: Buffer) {
  const cipher = createDecipheriv('aes-256-gcm', secret('encryption'), bytes.subarray(0, 12));
  cipher.setAAD(Buffer.from(context)); cipher.setAuthTag(bytes.subarray(12, 28));
  return Buffer.concat([cipher.update(bytes.subarray(28)), cipher.final()]);
}
function parse<T>(schema: z.ZodType<T>, body: unknown, message: string): T {
  const result = schema.safeParse(body);
  if (!result.success) throw new CommerceError(400, message);
  return result.data;
}
function validId(id: string) {
  if (!uuid.safeParse(id).success) throw new CommerceError(404, 'Running HUB order not found.');
}
function present(row: OrderRow): RunningHubOrder {
  return { id: row.id, customerId: row.customer_id, packId: row.pack_id, packLabel: row.pack_label, priceMmk: row.price_mmk,
    status: row.status, revision: row.revision, createdAt: row.created_at, expiresAt: row.expires_at, approvedAt: row.approved_at,
    payment: JSON.parse(row.payment), proofRequestId: row.proof_request_id,
    proofUrl: row.proof_request_id ? '/api/customer/runninghub/' + row.id + '/proof' : null,
    keyId: row.status === 'approved' ? row.stock_id : null, note: row.note };
}
function presentStock(row: StockRow): RunningHubStock {
  return { id: row.id, packId: row.pack_id, status: row.retired ? 'retired' : row.issued_order_id ? 'issued' : row.reserved_order_id ? 'reserved' : 'available',
    reservedOrderId: row.reserved_order_id, issuedOrderId: row.issued_order_id, createdAt: row.created_at };
}
async function audit(connection: PoolConnection, event: string, orderId: string | null, keyId: string | null, actor?: string) {
  await connection.execute('INSERT INTO digimium_runninghub_audit (id, event, order_id, key_id, actor_hash, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    [randomUUID(), event, orderId, keyId, actor ? digest('actor', actor) : null, new Date().toISOString()]);
}
async function expireUnpaid(connection: PoolConnection) {
  const now = new Date().toISOString();
  await connection.execute(`INSERT INTO digimium_runninghub_audit (id, event, order_id, key_id, created_at)
    SELECT UUID(), 'reservation-expired', id, stock_id, ? FROM digimium_runninghub_orders
    WHERE status = 'awaiting_payment' AND expires_at <= ?`, [now, now]);
  await connection.execute(`UPDATE digimium_runninghub_orders SET status = 'expired', revision = revision + 1,
    note = 'The unpaid reservation expired. Start a new purchase if you still want this bundle.'
    WHERE status = 'awaiting_payment' AND expires_at <= ?`, [now]);
  await connection.execute(`UPDATE digimium_runninghub_stock s LEFT JOIN digimium_runninghub_orders o ON o.id = s.reserved_order_id
    SET s.reserved_order_id = NULL WHERE s.reserved_order_id IS NOT NULL AND s.issued_order_id IS NULL
    AND (o.id IS NULL OR o.status NOT IN ('awaiting_payment', 'payment_review'))`);
}
/** Isolated mutex: inventory, order and expiration operations share a consistent lock order. */
async function transaction<T>(work: (connection: PoolConnection, settings: SettingsRow) => Promise<T>): Promise<T> {
  await ensureRunningHub();
  for (let attempt = 0; ; attempt++) {
    const connection = await getPool().getConnection();
    try {
      await connection.beginTransaction();
      const [settings] = await connection.execute<SettingsRow[]>('SELECT revision, methods FROM digimium_runninghub_settings WHERE id = 1 FOR UPDATE');
      await expireUnpaid(connection);
      const result = await work(connection, settings[0]);
      await connection.commit();
      return result;
    } catch (error) {
      await connection.rollback();
      const code = error instanceof Error && 'code' in error ? String(error.code) : '';
      if (attempt >= 2 || !['ER_LOCK_DEADLOCK', 'ER_LOCK_WAIT_TIMEOUT'].includes(code)) throw error;
    } finally { connection.release(); }
  }
}
async function packs(connection: PoolConnection) {
  const [rows] = await connection.execute<(RowDataPacket & { pack_id: string; available: number })[]>(`SELECT pack_id, COUNT(*) AS available
    FROM digimium_runninghub_stock WHERE retired = 0 AND reserved_order_id IS NULL AND issued_order_id IS NULL GROUP BY pack_id`);
  return RUNNINGHUB_PACKS.map(pack => ({ ...pack, available: Number(rows.find(row => row.pack_id === pack.id)?.available ?? 0) }));
}
async function rowFor(connection: PoolConnection, id: string, customerId?: string, extra = '') {
  const [rows] = await connection.execute<OrderRow[]>('SELECT ' + columns + extra + ' FROM digimium_runninghub_orders WHERE id = ?' +
    (customerId ? ' AND customer_id = ?' : '') + ' FOR UPDATE', customerId ? [id, customerId] : [id]);
  if (!rows[0]) throw new CommerceError(404, 'Running HUB order not found.');
  return rows[0];
}
async function replay(connection: PoolConnection, requestId: string, hash: Buffer) {
  const [rows] = await connection.execute<(RowDataPacket & { request_hash: Buffer; result: string })[]>(
    'SELECT request_hash, result FROM digimium_runninghub_requests WHERE request_id = ?', [requestId]);
  if (!rows[0]) return;
  if (!hash.equals(rows[0].request_hash)) throw new CommerceError(409, 'This request was already used for different Running HUB details.');
  return JSON.parse(rows[0].result);
}
async function receipt(connection: PoolConnection, requestId: string, hash: Buffer, result: unknown) {
  await connection.execute('INSERT INTO digimium_runninghub_requests (request_id, request_hash, result, created_at) VALUES (?, ?, ?, ?)',
    [requestId, hash, JSON.stringify(result), new Date().toISOString()]);
}
export async function customerRunningHub(customerId: string) {
  return transaction(async (connection, settings) => {
    const [orders] = await connection.execute<OrderRow[]>('SELECT ' + columns +
      ' FROM digimium_runninghub_orders WHERE customer_id = ? ORDER BY created_at DESC, id DESC LIMIT 100', [customerId]);
    const methods: RunningHubPaymentMethod[] = JSON.parse(settings.methods);
    return { packs: await packs(connection), methods: methods.filter(method => method.enabled), orders: orders.map(present) };
  });
}
export async function createRunningHubOrder(customerId: string, body: unknown) {
  const input = parse(createSchema, body, 'Select a Running HUB bundle and payment method.');
  if (input.expectedCustomerId !== customerId) throw new CommerceError(409, 'Your signed-in account changed. Review the purchase again.');
  const hash = digest('order-request', JSON.stringify([customerId, input.packId, input.method]));
  return transaction(async (connection, settings) => {
    const [customers] = await connection.execute<RowDataPacket[]>('SELECT id FROM digimium_customers WHERE id = ? FOR UPDATE', [customerId]);
    if (!customers.length) throw new CommerceError(401, 'Sign in again before purchasing.');
    const [previous] = await connection.execute<OrderRow[]>('SELECT ' + columns +
      ', request_hash FROM digimium_runninghub_orders WHERE customer_id = ? AND request_id = ?', [customerId, input.requestId]);
    if (previous[0]) {
      if (!hash.equals(previous[0].request_hash)) throw new CommerceError(409, 'This purchase request was already used with different details.');
      return { order: present(previous[0]), created: false };
    }
    const [pending] = await connection.execute<RowDataPacket[]>(
      "SELECT id FROM digimium_runninghub_orders WHERE customer_id = ? AND status IN ('awaiting_payment', 'payment_review') LIMIT 1", [customerId]);
    if (pending.length) throw new CommerceError(409, 'You already have a pending Running HUB order. Open it before starting another.');
    const methods: RunningHubPaymentMethod[] = JSON.parse(settings.methods);
    const method = methods.find(method => method.id === input.method && method.enabled);
    if (!method) throw new CommerceError(409, 'This payment method is not available. Refresh the payment options.');
    const [stock] = await connection.execute<StockRow[]>(`SELECT id, pack_id FROM digimium_runninghub_stock
      WHERE pack_id = ? AND retired = 0 AND reserved_order_id IS NULL AND issued_order_id IS NULL ORDER BY created_at, id LIMIT 1 FOR UPDATE`, [input.packId]);
    if (!stock[0]) throw new CommerceError(409, 'This Running HUB bundle is out of stock.');
    const pack = RUNNINGHUB_PACKS.find(pack => pack.id === input.packId)!;
    const id = randomUUID(), now = new Date(), expires = new Date(now.getTime() + RUNNINGHUB_RESERVATION_MINUTES * 60000).toISOString();
    await connection.execute(`INSERT INTO digimium_runninghub_orders
      (id, customer_id, request_id, request_hash, pack_id, pack_label, price_mmk, status, created_at, expires_at, payment, stock_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'awaiting_payment', ?, ?, ?, ?)`,
    [id, customerId, input.requestId, hash, pack.id, pack.label, pack.priceMmk, now.toISOString(), expires, JSON.stringify(method), stock[0].id]);
    await connection.execute('UPDATE digimium_runninghub_stock SET reserved_order_id = ? WHERE id = ?', [id, stock[0].id]);
    await audit(connection, 'order-created', id, stock[0].id, customerId);
    return { order: present(await rowFor(connection, id)), created: true };
  });
}
export async function runningHubOrder(id: string, customerId?: string) {
  validId(id);
  return transaction(async connection => {
    const row = await rowFor(connection, id, customerId, customerId ? ', delivery_cipher' : '');
    return { order: present(row), ...(customerId && row.status === 'approved' && row.delivery_cipher
      ? { apiKey: decrypt('delivery/' + id + '/' + customerId, Buffer.from(row.delivery_cipher, 'base64')).toString('utf8') } : {}) };
  });
}
export async function submitRunningHubProof(customerId: string, id: string, body: unknown, bytes: Buffer, mime: string) {
  validId(id);
  const input = parse(proofSchema, body, 'Refresh this Running HUB order before uploading.');
  if (!bytes.length || bytes.length > RUNNINGHUB_PROOF_MAX_BYTES) throw new CommerceError(413, 'Choose a payment image no larger than 5 MB.');
  try {
    if (identifyLogo(new Uint8Array(bytes)).mime !== mime) throw new CommerceError(415, 'The image contents do not match its type.');
  } catch (error) { if (error instanceof LogoInputError) throw new CommerceError(error.status, error.message); throw error; }
  const hash = digest('proof', mime + ':' + bytes.toString('base64'));
  return transaction(async connection => {
    const row = await rowFor(connection, id, customerId, ', proof_hash');
    if (row.proof_request_id === input.requestId) {
      if (!row.proof_hash?.equals(hash)) throw new CommerceError(409, 'This upload request was already used for another image.');
      return { order: present(row) };
    }
    if (row.status !== 'awaiting_payment' || row.revision !== input.revision) throw new CommerceError(409, 'This order changed or its payment reservation expired. Refresh before continuing.');
    const cipher = encrypt('proof/' + id + '/' + customerId, bytes);
    await connection.execute(`UPDATE digimium_runninghub_orders SET status = 'payment_review', expires_at = NULL,
      revision = revision + 1, proof_request_id = ?, proof_hash = ?, proof_mime = ?, proof_cipher = ? WHERE id = ?`,
    [input.requestId, hash, mime, cipher, id]);
    await audit(connection, 'proof-submitted', id, row.stock_id, customerId);
    return { order: present(await rowFor(connection, id)) };
  });
}
export async function runningHubProof(id: string, customerId?: string) {
  validId(id);
  return transaction(async connection => {
    const row = await rowFor(connection, id, customerId, ', proof_mime, proof_cipher');
    if (!row.proof_request_id || !row.proof_mime || !row.proof_cipher) throw new CommerceError(404, 'Payment screenshot not found.');
    return { contentType: row.proof_mime, bytes: decrypt('proof/' + id + '/' + row.customer_id, row.proof_cipher) };
  });
}

export async function adminRunningHub() {
  return transaction(async (connection, settings) => {
    const [stock] = await connection.execute<StockRow[]>(`SELECT id, pack_id, reserved_order_id, issued_order_id, retired, created_at
      FROM digimium_runninghub_stock ORDER BY created_at DESC, id DESC LIMIT 1000`);
    const [rows] = await connection.execute<(OrderRow & { customer_name: string; customer_email: string | null })[]>(
      'SELECT ' + columns.split(', ').map(column => 'o.' + column).join(', ') + `, c.name AS customer_name, c.email AS customer_email
       FROM digimium_runninghub_orders o JOIN digimium_customers c ON c.id = o.customer_id
       ORDER BY (o.status = 'payment_review') DESC, CASE WHEN o.status = 'payment_review' THEN o.created_at END ASC,
       o.created_at DESC, o.id DESC LIMIT 200`);
    return { packs: await packs(connection), methods: JSON.parse(settings.methods) as RunningHubPaymentMethod[],
      settingsRevision: settings.revision, stock: stock.map(presentStock),
      orders: rows.map(row => ({ ...present(row), customerName: row.customer_name, customerEmail: row.customer_email })) };
  });
}
export async function saveRunningHubSettings(body: unknown, actor: string) {
  const input = parse(settingsSchema, body, 'Check the payment labels, numbers, QR images and current settings revision.');
  try { await validateLogoReferences(input.methods.map(method => ({ logoPath: method.qrPath }))); }
  catch (error) { if (error instanceof LogoInputError) throw new CommerceError(error.status, error.message); throw error; }
  return transaction(async (connection, settings) => {
    if (settings.revision !== input.revision) throw new CommerceError(409, 'Payment settings changed. Reload them before saving.');
    await connection.execute('UPDATE digimium_runninghub_settings SET methods = ?, revision = revision + 1 WHERE id = 1', [JSON.stringify(input.methods)]);
    await audit(connection, 'payment-settings', null, null, actor);
    return { methods: input.methods, settingsRevision: settings.revision + 1 };
  });
}
export async function importRunningHubStock(body: unknown, actor: string) {
  const input = parse(importSchema, body, 'Provide a bundle and 1–100 keys, each 8–2,048 characters without spaces.');
  if (new Set(input.keys).size !== input.keys.length) throw new CommerceError(409, 'The import contains duplicate keys.');
  const hash = digest('import-request', JSON.stringify([input.packId, [...input.keys].sort()]));
  return transaction(async connection => {
    const previous = await replay(connection, input.requestId, hash);
    if (previous) return { ...previous, created: false };
    const ids: string[] = [];
    for (const key of input.keys) {
      const keyHash = digest('stock-key', key);
      const [duplicates] = await connection.execute<RowDataPacket[]>('SELECT id FROM digimium_runninghub_stock WHERE key_hash = ?', [keyHash]);
      if (duplicates.length) throw new CommerceError(409, 'One or more keys already exist in stock, including issued or retired keys.');
      const id = randomUUID();
      const cipher = encrypt('stock/' + id + '/' + input.packId, Buffer.from(key)).toString('base64');
      await connection.execute('INSERT INTO digimium_runninghub_stock (id, pack_id, key_hash, key_cipher, created_at) VALUES (?, ?, ?, ?, ?)',
        [id, input.packId, keyHash, cipher, new Date().toISOString()]);
      await audit(connection, 'stock-imported', null, id, actor);
      ids.push(id);
    }
    const result = { added: ids.length, ids };
    await receipt(connection, input.requestId, hash, result);
    return { ...result, created: true };
  });
}
export async function retireRunningHubStock(id: string, body: unknown, actor: string) {
  validId(id);
  const input = parse(confirmSchema, body, 'Confirm this stock key ID before removing it.');
  if (input.confirmation !== id) throw new CommerceError(400, 'Confirm this stock key ID before removing it.');
  return transaction(async connection => {
    const [rows] = await connection.execute<StockRow[]>('SELECT id, reserved_order_id, issued_order_id, retired FROM digimium_runninghub_stock WHERE id = ?', [id]);
    if (!rows[0]) throw new CommerceError(404, 'Stock key not found.');
    if (rows[0].reserved_order_id || rows[0].issued_order_id) throw new CommerceError(409, 'Reserved or issued keys cannot be removed.');
    if (!rows[0].retired) {
      await connection.execute('UPDATE digimium_runninghub_stock SET retired = 1 WHERE id = ?', [id]);
      await audit(connection, 'stock-retired', null, id, actor);
    }
    return { removed: true as const, id };
  });
}
export async function decideRunningHubOrder(id: string, body: unknown, actor: string) {
  validId(id);
  const input = parse(actionSchema, body, 'Review the screenshot and enter the checked wallet transaction reference before approving.');
  const reference = input.action === 'approve' ? normalizeRunningHubReference(input.paymentReference)! : null;
  const hash = digest('decision-request', JSON.stringify([id, input.action, input.action === 'approve' ? input.proofRequestId : null, reference, input.note ?? '']));
  return transaction(async connection => {
    const previous = await replay(connection, input.requestId, hash);
    const row = await rowFor(connection, id, undefined, ', proof_cipher');
    if (previous) return { order: present(row), applied: false };
    if (row.revision !== input.revision || !['awaiting_payment', 'payment_review'].includes(row.status)) {
      throw new CommerceError(409, 'This order changed. Reload before making a payment decision.');
    }
    const [stock] = await connection.execute<StockRow[]>('SELECT id, pack_id, key_cipher, reserved_order_id, issued_order_id, retired FROM digimium_runninghub_stock WHERE id = ?', [row.stock_id]);
    if (!stock[0] || stock[0].retired || stock[0].issued_order_id || stock[0].reserved_order_id !== id) {
      throw new CommerceError(409, 'The reserved key is unavailable. Review stock before making this decision.');
    }
    if (input.action === 'approve') {
      if (row.status !== 'payment_review' || !row.proof_cipher || row.proof_request_id !== input.proofRequestId) {
        throw new CommerceError(409, 'Review the currently submitted payment screenshot first.');
      }
      const payment = JSON.parse(row.payment) as RunningHubPaymentMethod;
      const referenceHash = digest('payment-reference', reference!);
      const [used] = await connection.execute<RowDataPacket[]>('SELECT order_id FROM digimium_runninghub_payments WHERE method = ? AND reference_hash = ?', [payment.id, referenceHash]);
      if (used.length) throw new CommerceError(409, 'This wallet transaction reference was already used for an approved Running HUB order.');
      const key = decrypt('stock/' + stock[0].id + '/' + stock[0].pack_id, Buffer.from(stock[0].key_cipher, 'base64'));
      const delivery = encrypt('delivery/' + id + '/' + row.customer_id, key).toString('base64');
      const now = new Date().toISOString();
      await connection.execute(`UPDATE digimium_runninghub_orders SET status = 'approved', approved_at = ?, expires_at = NULL,
        delivery_cipher = ?, note = ?, revision = revision + 1 WHERE id = ?`, [now, delivery, input.note ?? '', id]);
      await connection.execute('UPDATE digimium_runninghub_stock SET reserved_order_id = NULL, issued_order_id = ? WHERE id = ?', [id, row.stock_id]);
      await connection.execute('INSERT INTO digimium_runninghub_payments (method, reference_hash, order_id, created_at) VALUES (?, ?, ?, ?)',
        [payment.id, referenceHash, id, now]);
      await audit(connection, 'payment-approved', id, row.stock_id, actor);
    } else {
      await connection.execute("UPDATE digimium_runninghub_orders SET status = 'rejected', expires_at = NULL, note = ?, revision = revision + 1 WHERE id = ?", [input.note ?? '', id]);
      await connection.execute('UPDATE digimium_runninghub_stock SET reserved_order_id = NULL WHERE id = ?', [row.stock_id]);
      await audit(connection, 'payment-rejected', id, row.stock_id, actor);
    }
    await receipt(connection, input.requestId, hash, { orderId: id });
    return { order: present(await rowFor(connection, id)), applied: true };
  });
}
export async function revealRunningHubKey(id: string, body: unknown, actor: string) {
  validId(id);
  const input = parse(confirmSchema, body, 'Confirm this approved order ID to reveal its assigned key.');
  if (input.confirmation !== id) throw new CommerceError(400, 'Confirm this approved order ID to reveal its assigned key.');
  return transaction(async connection => {
    const row = await rowFor(connection, id, undefined, ', delivery_cipher');
    if (row.status !== 'approved' || !row.delivery_cipher) throw new CommerceError(409, 'This order has no issued key.');
    const apiKey = decrypt('delivery/' + id + '/' + row.customer_id, Buffer.from(row.delivery_cipher, 'base64')).toString('utf8');
    await audit(connection, 'admin-key-revealed', id, row.stock_id, actor);
    return { apiKey, keyId: row.stock_id };
  });
}
