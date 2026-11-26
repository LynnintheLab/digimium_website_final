import { createCipheriv, createDecipheriv, createHmac, randomBytes, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { PoolConnection, RowDataPacket } from 'mysql2/promise';
import { z } from 'zod';
import { CommerceError } from '../lib/commerce-http';
import { LOGO_PATH_PATTERN } from '../lib/logo-path';
import { identifyLogo, LogoInputError, validateLogoReferences } from '../lib/logo-storage';
import { RUNNINGHUB_PACKS, RUNNINGHUB_PRODUCT_NAME, RUNNINGHUB_PROOF_MAX_BYTES, RUNNINGHUB_RESERVATION_MINUTES, normalizeRunningHubReference,
  type RunningHubOrder, type RunningHubPackId, type RunningHubPaymentMethod, type RunningHubStock } from '../lib/runninghub';
import { ensureCustomerSchema } from './customer-auth';
import { AdminOrdersActionError } from './admin-orders-telegram';
import { getPool } from './mysql';
import { drainAdminNotificationAlerts, enqueueNotificationAlert } from './notifications';
import { drainRunningHubAdminReceipts, enqueueRunningHubAdminReceipt } from './runninghub-admin-bot-outbox';
import { drainRunningHubAdminApprovals, enqueueRunningHubAdminApproval } from './runninghub-admin-approval-outbox';

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
const stockKeySchema = z.string().trim().min(8).max(2048).refine(value => !/[\s\p{Cc}\u202a-\u202e\u2066-\u2069]/u.test(value));
const namedStockKeySchema = z.object({ key: stockKeySchema, name: safeText(100).refine(Boolean) }).strict();
const importSchema = z.object({ requestId: uuid, packId,
  keys: z.array(z.union([stockKeySchema, namedStockKeySchema])).min(1).max(100) }).strict();
const actionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('approve'), revision, requestId: uuid, proofRequestId: uuid,
    // Accepted only for older Admin clients; current approval needs no reference entry.
    paymentReference: safeText(100).refine(value => normalizeRunningHubReference(value) !== null).optional(), note: safeText(1000).optional() }).strict(),
  z.object({ action: z.literal('reject'), revision, requestId: uuid, note: safeText(1000).optional() }).strict(),
]);
const proofSchema = z.object({ revision, requestId: uuid }).strict();
const confirmSchema = z.object({ confirmation: uuid }).strict();
const columns = 'id, customer_id, pack_id, pack_label, price_mmk, status, revision, created_at, expires_at, approved_at, payment, stock_id, proof_request_id, key_name, note';
type OrderRow = RowDataPacket & { id: string; customer_id: string; pack_id: RunningHubPackId; pack_label: string; price_mmk: number;
  status: RunningHubOrder['status']; revision: number; created_at: string; expires_at: string | null; approved_at: string | null;
  payment: string; stock_id: string; proof_request_id: string | null; key_name: string | null; note: string; request_hash: Buffer;
  proof_hash: Buffer | null; proof_mime: string | null; proof_cipher: Buffer | null; delivery_cipher: string | null };
type StockRow = RowDataPacket & { id: string; pack_id: RunningHubPackId; key_cipher: string; key_name: string | null; reserved_order_id: string | null;
  issued_order_id: string | null; retired: number; created_at: string };
type SettingsRow = RowDataPacket & { revision: number; methods: string };
type PackCountRow = RowDataPacket & { pack_id: RunningHubPackId; available: number };

let schemaReady: Promise<void> | undefined;
export function ensureRunningHub() {
  return schemaReady ??= (async () => {
    await ensureCustomerSchema();
    const sql = await readFile(join(process.cwd(), 'hostinger', 'runninghub-schema.sql'), 'utf8');
    const pool = getPool();
    for (const statement of sql.split(';').filter(value => value.trim())) await pool.query(statement);
    for (const table of ['digimium_runninghub_stock', 'digimium_runninghub_orders']) {
      try { await pool.query(`SELECT key_name FROM ${table} LIMIT 0`); }
      catch (error) {
        if (!(error instanceof Error && 'code' in error && error.code === 'ER_BAD_FIELD_ERROR')) throw error;
        try { await pool.query(`ALTER TABLE ${table} ADD COLUMN key_name VARCHAR(100) NULL`); }
        catch (migrationError) {
          if (!(migrationError instanceof Error && 'code' in migrationError && migrationError.code === 'ER_DUP_FIELDNAME')) throw migrationError;
          await pool.query(`SELECT key_name FROM ${table} LIMIT 0`);
        }
      }
    }
    await pool.execute("INSERT IGNORE INTO digimium_runninghub_settings (id, methods) VALUES (1, '[]')");
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
    keyId: row.status === 'approved' ? row.stock_id : null, keyName: row.status === 'approved' ? row.key_name : null, note: row.note };
}
function presentStock(row: StockRow): RunningHubStock {
  return { id: row.id, packId: row.pack_id, keyName: row.key_name, status: row.retired ? 'retired' : row.issued_order_id ? 'issued' : row.reserved_order_id ? 'reserved' : 'available',
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
  const [rows] = await connection.execute<PackCountRow[]>(`SELECT pack_id, COUNT(*) AS available
    FROM digimium_runninghub_stock WHERE retired = 0 AND reserved_order_id IS NULL AND issued_order_id IS NULL GROUP BY pack_id`);
  return RUNNINGHUB_PACKS.map(pack => ({ ...pack, available: Number(rows.find(row => row.pack_id === pack.id)?.available ?? 0) }));
}
export async function publicRunningHubStock(): Promise<Record<RunningHubPackId, number>> {
  await ensureRunningHub();
  // Checkout releases expired unpaid reservations before allocating stock. Count them here without taking its write lock.
  const [rows] = await getPool().execute<PackCountRow[]>(`SELECT s.pack_id, COUNT(*) AS available
    FROM digimium_runninghub_stock s
    LEFT JOIN digimium_runninghub_orders o ON o.id = s.reserved_order_id
      AND (o.status = 'payment_review' OR (o.status = 'awaiting_payment' AND (o.expires_at IS NULL OR o.expires_at > ?)))
    WHERE s.retired = 0 AND s.issued_order_id IS NULL AND o.id IS NULL
    GROUP BY s.pack_id`, [new Date().toISOString()]);
  return {
    usd10: Number(rows.find(row => row.pack_id === 'usd10')?.available ?? 0),
    usd20: Number(rows.find(row => row.pack_id === 'usd20')?.available ?? 0),
  };
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
  const result = await transaction(async (connection, settings) => {
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
    await enqueueNotificationAlert(connection, {
      kind: 'runninghub-order-created',
      dedupeKey: 'runninghub-order-created:' + id,
      entityId: id,
      orderReference: id.slice(0, 8).toUpperCase(),
      productSummary: RUNNINGHUB_PRODUCT_NAME + ' · ' + pack.label + ' × 1',
      totalMmk: pack.priceMmk,
    });
    return { order: present(await rowFor(connection, id)), created: true };
  });
  await drainAdminNotificationAlerts({ dedupeKey: 'runninghub-order-created:' + result.order.id }).catch(() => {});
  return result;
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
  const result = await transaction(async connection => {
    const row = await rowFor(connection, id, customerId, ', proof_hash');
    if (row.proof_request_id === input.requestId) {
      if (!row.proof_hash?.equals(hash)) throw new CommerceError(409, 'This upload request was already used for another image.');
      if (row.status === 'payment_review') await enqueueRunningHubAdminReceipt(connection, id, input.requestId);
      return { order: present(row) };
    }
    if (row.status !== 'awaiting_payment' || row.revision !== input.revision) throw new CommerceError(409, 'This order changed or its payment reservation expired. Refresh before continuing.');
    const cipher = encrypt('proof/' + id + '/' + customerId, bytes);
    await connection.execute(`UPDATE digimium_runninghub_orders SET status = 'payment_review', expires_at = NULL,
      revision = revision + 1, proof_request_id = ?, proof_hash = ?, proof_mime = ?, proof_cipher = ? WHERE id = ?`,
    [input.requestId, hash, mime, cipher, id]);
    await audit(connection, 'proof-submitted', id, row.stock_id, customerId);
    await enqueueRunningHubAdminReceipt(connection, id, input.requestId);
    return { order: present(await rowFor(connection, id)) };
  });
  await drainRunningHubAdminReceipts({ orderId: id, limit: 1, budgetMs: 5000 }).catch(() => {});
  return result;
}
export async function runningHubProof(id: string, customerId?: string) {
  validId(id);
  return transaction(async connection => {
    const row = await rowFor(connection, id, customerId, ', proof_mime, proof_cipher');
    if (!row.proof_request_id || !row.proof_mime || !row.proof_cipher) throw new CommerceError(404, 'Payment screenshot not found.');
    return { contentType: row.proof_mime, bytes: decrypt('proof/' + id + '/' + row.customer_id, row.proof_cipher) };
  });
}

/** Original pending receipt plus the minimal metadata permitted in the private Admin bot. */
export async function runningHubAdminBotReceipt(id: string, proofRequestId: string) {
  validId(id); validId(proofRequestId);
  return transaction(async connection => {
    const row = await rowFor(connection, id, undefined, ', proof_mime, proof_cipher');
    if (row.status !== 'payment_review' || row.proof_request_id !== proofRequestId || !row.proof_mime || !row.proof_cipher) {
      throw new CommerceError(409, 'This payment receipt is no longer awaiting review.');
    }
    const contentType = z.enum(['image/png', 'image/jpeg', 'image/webp']).parse(row.proof_mime);
    const paymentMethod = methodId.parse((JSON.parse(row.payment) as RunningHubPaymentMethod).id);
    return { id: row.id, proofRequestId, revision: row.revision, packLabel: row.pack_label, priceMmk: row.price_mmk, paymentMethod, contentType,
      bytes: decrypt('proof/' + id + '/' + row.customer_id, row.proof_cipher) };
  });
}

/** Minimal approved-order details for the private owner bot. */
export async function runningHubAdminBotApproval(id: string) {
  validId(id);
  await ensureRunningHub();
  const [rows] = await getPool().execute<(RowDataPacket & { id: string; pack_label: string; price_mmk: number; payment_method: string;
    customer_name: string; customer_email: string | null; telegram_username: string | null })[]>(
    `SELECT o.id, o.pack_label, o.price_mmk, JSON_UNQUOTE(JSON_EXTRACT(o.payment, '$.id')) AS payment_method,
       c.name AS customer_name, c.email AS customer_email, t.username AS telegram_username
     FROM digimium_runninghub_orders o JOIN digimium_customers c ON c.id = o.customer_id
     LEFT JOIN digimium_telegram_identities t ON t.customer_id = c.id
     WHERE o.id = ? AND o.status = 'approved' AND o.delivery_cipher IS NOT NULL`, [id]);
  const row = rows[0];
  if (!row) throw new CommerceError(404, 'Approved Running HUB order not found.');
  return { id: row.id, packLabel: row.pack_label, priceMmk: row.price_mmk, paymentMethod: methodId.parse(row.payment_method),
    customerName: row.customer_name, customerEmail: row.customer_email, telegramUsername: row.telegram_username };
}

/** A matching historical button may recover one notice, never issue or reveal another key. */
export async function recoverRunningHubAdminApproval(id: string, proofRequestId: string, approvedFromRevision: number) {
  validId(id); validId(proofRequestId);
  revision.parse(approvedFromRevision);
  await transaction(async connection => {
    const row = await rowFor(connection, id, undefined, ', delivery_cipher IS NOT NULL AS has_delivery');
    if (row.status !== 'approved' || row.proof_request_id !== proofRequestId || row.revision !== approvedFromRevision + 1 || !row.has_delivery) {
      throw new AdminOrdersActionError('order_changed');
    }
    await enqueueRunningHubAdminApproval(connection, id);
  });
  await drainRunningHubAdminApprovals({ orderId: id, limit: 1, budgetMs: 2000 }).catch(() => {});
}

export async function adminRunningHub() {
  return transaction(async (connection, settings) => {
    const [stock] = await connection.execute<StockRow[]>(`SELECT id, pack_id, key_name, reserved_order_id, issued_order_id, retired, created_at
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
  const input = parse(importSchema, body, 'Provide a bundle and 1–100 keys, each 8–2,048 characters without spaces. Key names can be up to 100 characters.');
  const names = new Map<string, string | null>(input.keys.map(item => typeof item === 'string' ? [item, null] : [item.key, item.name]));
  if (names.size !== input.keys.length) throw new CommerceError(409, 'The import contains duplicate keys.');
  // Keep the original sorted string format for retries of unnamed batches.
  const batch = [...names.keys()].sort().map(key => {
    const name = names.get(key);
    return name ? { key, name } : key;
  });
  const hash = digest('import-request', JSON.stringify([input.packId, batch]));
  return transaction(async connection => {
    const previous = await replay(connection, input.requestId, hash);
    if (previous) return { ...previous, created: false };
    const ids: string[] = [];
    for (const [key, keyName] of names) {
      const keyHash = digest('stock-key', key);
      const [duplicates] = await connection.execute<RowDataPacket[]>('SELECT id FROM digimium_runninghub_stock WHERE key_hash = ?', [keyHash]);
      if (duplicates.length) throw new CommerceError(409, 'One or more keys already exist in stock, including issued or retired keys.');
      const id = randomUUID();
      const cipher = encrypt('stock/' + id + '/' + input.packId, Buffer.from(key)).toString('base64');
      await connection.execute('INSERT INTO digimium_runninghub_stock (id, pack_id, key_hash, key_cipher, key_name, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        [id, input.packId, keyHash, cipher, keyName, new Date().toISOString()]);
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
  const input = parse(actionSchema, body, 'Review the current payment screenshot before approving.');
  const reference = input.action === 'approve' ? normalizeRunningHubReference(input.paymentReference) : null;
  // Preserve existing rejection/legacy reference receipts; new approvals bind the full displayed tuple.
  const hash = input.action === 'approve' && !reference
    ? digest('decision-request-v2', JSON.stringify([id, input.action, input.revision, input.proofRequestId, input.note ?? '']))
    : digest('decision-request', JSON.stringify([id, input.action, input.action === 'approve' ? input.proofRequestId : null, reference, input.note ?? '']));
  const result = await transaction(async connection => {
    const previous = await replay(connection, input.requestId, hash).catch(error => {
      if (error instanceof CommerceError && error.status === 409) throw new AdminOrdersActionError('request_conflict');
      throw error;
    });
    const row = await rowFor(connection, id, undefined, ', proof_cipher, proof_hash').catch(error => {
      if (error instanceof CommerceError && error.status === 404) throw new AdminOrdersActionError('order_missing');
      throw error;
    });
    if (previous) {
      if (input.action === 'approve' && row.status === 'approved') await enqueueRunningHubAdminApproval(connection, id);
      return { order: present(row), applied: false };
    }
    if (row.status === 'rejected') throw new AdminOrdersActionError('order_rejected');
    if (row.status === 'expired') throw new AdminOrdersActionError('order_expired');
    if (row.status === 'approved') throw new AdminOrdersActionError('order_approved');
    if (row.revision !== input.revision || !['awaiting_payment', 'payment_review'].includes(row.status)) {
      throw new AdminOrdersActionError('order_changed');
    }
    const [stock] = await connection.execute<StockRow[]>('SELECT id, pack_id, key_cipher, key_name, reserved_order_id, issued_order_id, retired FROM digimium_runninghub_stock WHERE id = ?', [row.stock_id]);
    if (!stock[0] || stock[0].retired || stock[0].issued_order_id || stock[0].reserved_order_id !== id) {
      throw new AdminOrdersActionError('stock_unavailable');
    }
    if (input.action === 'approve') {
      if (row.status !== 'payment_review' || !row.proof_cipher || !row.proof_hash) throw new AdminOrdersActionError('receipt_missing');
      if (row.proof_request_id !== input.proofRequestId) throw new AdminOrdersActionError('receipt_changed');
      // The settings-row mutex serializes this check and issuance across all Running HUB orders.
      const [sameProof] = await connection.execute<RowDataPacket[]>(
        "SELECT id FROM digimium_runninghub_orders WHERE status = 'approved' AND proof_hash = ? LIMIT 1", [row.proof_hash]);
      if (sameProof.length) throw new AdminOrdersActionError('receipt_used');
      const payment = JSON.parse(row.payment) as RunningHubPaymentMethod;
      const referenceHash = reference ? digest('payment-reference', reference) : null;
      if (referenceHash) {
        const [used] = await connection.execute<RowDataPacket[]>('SELECT order_id FROM digimium_runninghub_payments WHERE method = ? AND reference_hash = ?', [payment.id, referenceHash]);
        if (used.length) throw new AdminOrdersActionError('reference_used');
      }
      const key = decrypt('stock/' + stock[0].id + '/' + stock[0].pack_id, Buffer.from(stock[0].key_cipher, 'base64'));
      const delivery = encrypt('delivery/' + id + '/' + row.customer_id, key).toString('base64');
      const now = new Date().toISOString();
      await connection.execute(`UPDATE digimium_runninghub_orders SET status = 'approved', approved_at = ?, expires_at = NULL,
        delivery_cipher = ?, key_name = ?, note = ?, revision = revision + 1 WHERE id = ?`, [now, delivery, stock[0].key_name, input.note ?? '', id]);
      await connection.execute('UPDATE digimium_runninghub_stock SET reserved_order_id = NULL, issued_order_id = ? WHERE id = ?', [id, row.stock_id]);
      if (referenceHash) await connection.execute('INSERT INTO digimium_runninghub_payments (method, reference_hash, order_id, created_at) VALUES (?, ?, ?, ?)',
        [payment.id, referenceHash, id, now]);
      await audit(connection, 'payment-approved', id, row.stock_id, actor);
      await enqueueRunningHubAdminApproval(connection, id);
    } else {
      await connection.execute("UPDATE digimium_runninghub_orders SET status = 'rejected', expires_at = NULL, note = ?, revision = revision + 1 WHERE id = ?", [input.note ?? '', id]);
      await connection.execute('UPDATE digimium_runninghub_stock SET reserved_order_id = NULL WHERE id = ?', [row.stock_id]);
      await audit(connection, 'payment-rejected', id, row.stock_id, actor);
    }
    await receipt(connection, input.requestId, hash, { orderId: id });
    return { order: present(await rowFor(connection, id)), applied: true };
  });
  if (result.order.status === 'approved') await drainRunningHubAdminApprovals({ orderId: id, limit: 1, budgetMs: 2000 }).catch(() => {});
  return result;
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
