import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { z } from 'zod';
import { resolveOrder, totalMmk, type CartItem } from '../lib/cart-order';
import { decodeSnapshot, getCatalog } from '../lib/catalog-store';
import type { Catalog } from '../lib/catalog';
import { CommerceError } from '../lib/commerce-http';
import type { CommerceOrder, CommerceOrderLine, OrderDeliveryDraft, OrderFulfillment, TelegramOrder } from '../lib/commerce-types';
import { initialCatalog } from '../lib/initial-catalog';
import { effectivePrice, parseMmk } from '../lib/pricing';
import { resolveTelegramContact } from '../lib/telegram-contact';
import { priceOnEnquiry } from '../lib/shop-language';
import { checkoutFieldsFor, MAX_CUSTOMER_INPUT_UNITS, type CustomerOrderInput, type WebsiteCheckout } from '../lib/payment';
import { checkoutPaymentMethods } from '../lib/demo-payments';
import { paymentDecisionSchema, proofRequestSchema, quoteOrderSchema, selectPaymentSchema, websiteCheckoutSchema } from '../lib/payment-validation';
import { identifyLogo, LogoInputError } from '../lib/logo-storage';
import type { CatalogSnapshot } from '../lib/storage-types';
import { ensureCustomerSchema, presentCustomer, type CustomerIdentityRow } from './customer-auth';
import { limitGuestCheckout } from './guest-checkout';
import { getPool } from './mysql';
import { drainAdminNotificationAlerts, enqueueNotificationAlert } from './notifications';

const MAX_ORDER_LINES = 3000;
// Reject oversized collections before schema parsing as defense in depth.
function enforceCollectionLimit(body: unknown, field: 'items' | 'lines') {
  const collection = body && typeof body === 'object' && !Array.isArray(body)
    ? (body as Record<string, unknown>)[field] : undefined;
  if (Array.isArray(collection) && collection.length > MAX_ORDER_LINES) {
    throw new CommerceError(400, `An order can contain at most ${MAX_ORDER_LINES} items.`);
  }
}

const catalogId = z.string().min(1).max(64).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const itemSchema = z.object({
  productId: catalogId, planId: catalogId.nullable(), quantity: z.number().int().positive().safe(),
}).strict();
const checkoutSchema = z.object({
  requestId: z.string().uuid(), items: z.array(itemSchema).min(1).max(MAX_ORDER_LINES),
}).strict();
const guestCheckoutSchema = z.union([
  checkoutSchema.extend({ checkoutMode: z.literal('guest') }),
  checkoutSchema.extend({ guestName: z.string().trim().min(1).max(100).refine(value => !/\p{Cc}/u.test(value)) }),
]);
type CheckoutOwner = { customerId: string; guestKey?: never; guestName?: never } |
  { customerId: null; guestKey: Buffer; guestName: string | null };

function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000')) return false;
  const date = new Date(value + 'T00:00:00Z');
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
const date = z.string().refine(validDate);
const deliveryField = (max: number) => z.string().max(max).refine(value => !/\p{Cc}/u.test(value));
const accountDetailsSchema = z.object({
  account: deliveryField(500).default(''),
  password: deliveryField(1000).default(''),
  manager: deliveryField(500).default(''),
  username: deliveryField(500).default(''),
}).strict();
// This text is intentionally visible to the order's customer, never a private delivery field.
const customerNoteSchema = z.string().max(1000)
  .transform(value => value.replace(/\r\n?/g, '\n').trim())
  .refine(value => !/[\p{Cc}\u202a-\u202e\u2066-\u2069]/u.test(value.replace(/\n/g, '')));
const adminOrderSchema = z.object({
  customerId: z.string().uuid(),
  requestId: z.string().uuid(),
  expectedCatalogRevision: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER - 1),
  items: z.array(itemSchema.extend({ unitPriceMmk: z.number().int().nonnegative().safe().optional() }))
    .min(1).max(MAX_ORDER_LINES),
  customerNote: customerNoteSchema.optional(),
}).strict();
const fulfillmentSchema = z.object({
  revision: z.number().int().positive().max(0xfffffffe),
  customerNote: customerNoteSchema.optional(),
  lines: z.array(z.object({ id: z.string().uuid(), startDate: date, endDate: date,
    accountInfo: z.string().max(4000).optional(), accountDetails: accountDetailsSchema.optional() })
    .strict().refine(line => line.endDate >= line.startDate)).min(1).max(MAX_ORDER_LINES),
}).strict();
const deliveryDraftSchema = fulfillmentSchema.extend({ action: z.literal('stage-delivery') });
const adminActionSchema = z.object({
  action: z.enum(['order-approve', 'payment-approve', 'order-send']),
  revision: z.number().int().positive().max(0xfffffffe),
  requestId: z.string().uuid(),
  proofRequestId: z.string().uuid().optional(),
  deliveryDraftId: z.string().uuid().optional(),
}).strict().superRefine((input, context) => {
  if ((input.action === 'payment-approve') !== Boolean(input.proofRequestId)) {
    context.addIssue({ code: 'custom', path: ['proofRequestId'], message: 'Bind payment approval to the reviewed screenshot.' });
  }
  if ((input.action === 'order-send') !== Boolean(input.deliveryDraftId)) {
    context.addIssue({ code: 'custom', path: ['deliveryDraftId'], message: 'Bind delivery to the prepared account details.' });
  }
});
const orderDecisionSchema = z.union([
  z.object({ action: z.literal('reject'), revision: z.number().int().positive().max(0xfffffffe),
    customerNote: customerNoteSchema.optional() }).strict(),
  z.object({ action: z.literal('note'), revision: z.number().int().positive().max(0xfffffffe),
    customerNote: customerNoteSchema }).strict(),
]);
const orderRemovalSchema = z.object({
  revision: z.number().int().positive().max(0xffffffff),
  confirmation: z.string().uuid(),
}).strict();

type PurchasedLine = Omit<CommerceOrderLine, 'startDate' | 'endDate' | 'accountInfo' | 'accountDetails'>;
type OrderSnapshot = { lines: PurchasedLine[]; totalMmk: number | null };
interface OrderRow extends RowDataPacket {
  id: string;
  customer_id: string | null;
  guest_key: Buffer | null;
  guest_name: string | null;
  created_at: string;
  approved_at: string | null;
  rejected_at: string | null;
  customer_note: string | null;
  revision: number;
  snapshot: string;
  fulfillment: string | null;
  checkout_state: string | null;
  customer_inputs: string | null;
  delivery_draft: string | null;
}

let schemaReady: Promise<void> | undefined;
async function bootstrap() {
  await ensureCustomerSchema();
  const pool = getPool();
  try {
    await pool.query('SELECT 1 FROM digimium_orders LIMIT 0');
  } catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'ER_NO_SUCH_TABLE')) throw error;
    await pool.query(await readFile(join(process.cwd(), 'hostinger', 'order-schema.sql'), 'utf8'));
  }
  // Existing deployments gain nullable account ownership without altering any saved snapshots.
  try {
    await pool.query('SELECT guest_key, guest_name FROM digimium_orders LIMIT 0');
  } catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'ER_BAD_FIELD_ERROR')) throw error;
    try {
      await pool.query(`ALTER TABLE digimium_orders
        MODIFY customer_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
        ADD guest_key BINARY(32) NULL,
        ADD guest_name VARCHAR(100) NULL,
        ADD UNIQUE KEY orders_guest_request (guest_key, request_id)`);
    } catch (migrationError) {
      if (!(migrationError instanceof Error && 'code' in migrationError && migrationError.code === 'ER_DUP_FIELDNAME')) throw migrationError;
      // Another server may have completed the same atomic migration first.
      await pool.query('SELECT guest_key, guest_name FROM digimium_orders LIMIT 0');
    }
  }
  // Additive, independently guarded columns also repair a partially applied manual migration.
  for (const [column, definition] of [
    ['rejected_at', 'CHAR(24) CHARACTER SET ascii NULL'], ['customer_note', 'TEXT NULL'],
    ['checkout_state', 'MEDIUMTEXT NULL'], ['customer_inputs', 'MEDIUMTEXT NULL'],
    ['delivery_draft', 'MEDIUMTEXT NULL'],
  ]) {
    try {
      await pool.query(`SELECT ${column} FROM digimium_orders LIMIT 0`);
    } catch (error) {
      if (!(error instanceof Error && 'code' in error && error.code === 'ER_BAD_FIELD_ERROR')) throw error;
      try { await pool.query(`ALTER TABLE digimium_orders ADD ${column} ${definition}`); }
      catch (migrationError) {
        if (!(migrationError instanceof Error && 'code' in migrationError && migrationError.code === 'ER_DUP_FIELDNAME')) throw migrationError;
      }
      await pool.query(`SELECT ${column} FROM digimium_orders LIMIT 0`);
    }
  }
  await pool.query(`CREATE TABLE IF NOT EXISTS digimium_order_proofs (
    order_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    request_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    request_hash BINARY(32) NOT NULL,
    content_type VARCHAR(32) CHARACTER SET ascii NOT NULL,
    image_bytes MEDIUMBLOB NOT NULL,
    created_at CHAR(24) CHARACTER SET ascii NOT NULL,
    PRIMARY KEY (order_id, request_id),
    CONSTRAINT order_proofs_order FOREIGN KEY (order_id) REFERENCES digimium_orders (id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  await pool.query(`CREATE TABLE IF NOT EXISTS digimium_order_actions (
    order_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    request_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    request_hash BINARY(32) NOT NULL,
    action VARCHAR(32) CHARACTER SET ascii NOT NULL,
    created_at CHAR(24) CHARACTER SET ascii NOT NULL,
    PRIMARY KEY (order_id, request_id),
    CONSTRAINT order_actions_order FOREIGN KEY (order_id) REFERENCES digimium_orders (id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
}
export function ensureOrders() {
  return schemaReady ??= bootstrap().catch(error => {
    schemaReady = undefined;
    throw error;
  });
}

// The stable host secret never goes into MySQL. Bind each encrypted delivery to its owner and order.
function fulfillmentKey() {
  const secret = process.env.ORDER_FULFILLMENT_SECRET?.trim() || process.env.ADMIN_AUTH_SECRET?.trim();
  if (!secret || secret.length < 32) throw new Error('Missing order fulfillment key.');
  return createHmac('sha256', secret).update('digimium/order-fulfillment/v1').digest();
}
function fulfillmentOwner(row: Pick<OrderRow, 'customer_id' | 'guest_key'>) {
  return row.customer_id ?? 'guest:' + row.guest_key!.toString('hex');
}
function encryptFulfillment(id: string, owner: string, lines: OrderFulfillment[]) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', fulfillmentKey(), iv);
  cipher.setAAD(Buffer.from(id + '/' + owner));
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(lines), 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString('base64');
}
function decryptFulfillment(row: Pick<OrderRow, 'id' | 'customer_id' | 'guest_key' | 'fulfillment'>): OrderFulfillment[] {
  if (!row.fulfillment) return [];
  const envelope = Buffer.from(row.fulfillment, 'base64');
  const decipher = createDecipheriv('aes-256-gcm', fulfillmentKey(), envelope.subarray(0, 12));
  decipher.setAuthTag(envelope.subarray(12, 28));
  decipher.setAAD(Buffer.from(row.id + '/' + fulfillmentOwner(row)));
  const plaintext = Buffer.concat([decipher.update(envelope.subarray(28)), decipher.final()]);
  return JSON.parse(plaintext.toString('utf8'));
}

/** Server-only projection for tracking views. Delivery credentials never leave this helper. */
export function decryptOrderTermDates(row: Pick<OrderRow, 'id' | 'customer_id' | 'guest_key' | 'fulfillment'>): {
  id: string; startDate: string | null; endDate: string | null;
}[] {
  const lines = decryptFulfillment(row);
  if (!Array.isArray(lines) || lines.length > 3000) throw new Error('Invalid order terms.');
  return lines.flatMap(line => {
    if (!line || typeof line.id !== 'string' || !/^[a-f0-9-]{36}$/i.test(line.id)) return [];
    return [{ id: line.id,
      startDate: typeof line.startDate === 'string' && line.startDate.length === 10 ? line.startDate : null,
      endDate: typeof line.endDate === 'string' && line.endDate.length === 10 ? line.endDate : null }];
  });
}

function present(row: OrderRow, includeDelivery = true): CommerceOrder {
  const snapshot: OrderSnapshot = JSON.parse(row.snapshot);
  const approved = !!row.approved_at && !row.rejected_at;
  const delivery = new Map((approved && includeDelivery ? decryptFulfillment(row) : []).map(line => [line.id, line]));
  return {
    id: row.id, customerId: row.customer_id, createdAt: row.created_at, approvedAt: approved ? row.approved_at : null,
    rejectedAt: row.rejected_at ?? null, customerNote: row.customer_note ?? '',
    ...(row.guest_name ? { guestName: row.guest_name } : {}),
    status: row.rejected_at ? 'rejected' : approved ? 'approved' : 'pending', revision: row.revision, totalMmk: snapshot.totalMmk,
    ...(row.checkout_state ? { checkout: JSON.parse(row.checkout_state) as WebsiteCheckout } : {}),
    lines: snapshot.lines.map(line => {
      const grant = delivery.get(line.id);
      return { ...line, startDate: grant?.startDate ?? null, endDate: grant?.endDate ?? null, accountInfo: grant?.accountInfo ?? '',
        ...(grant?.accountDetails ? { accountDetails: grant.accountDetails } : {}) };
    }),
  };
}

function presentCheckout(row: OrderRow): CommerceOrder {
  return present(row, false);
}

function snapshotCart(items: CartItem[], catalog: Catalog, adminUnitPrices?: (number | undefined)[]): OrderSnapshot {
  const rows = resolveOrder(items, catalog.products);
  if (rows.length !== items.length) throw new CommerceError(409, 'A selected offer is no longer available or appears twice. Review your cart.');
  const lines = rows.map(({ product, plan, productId, planId, quantity }, index) => {
    const offer = plan ?? product;
    const override = adminUnitPrices?.[index];
    const currentPrice = override === undefined ? effectivePrice(offer) : override.toLocaleString('en-US') + ' MMK';
    return { id: randomUUID(), productId, productName: product.name, planId, planName: plan?.name ?? null,
      price: priceOnEnquiry(currentPrice) ? '' : currentPrice, duration: offer.duration, quantity };
  });
  if (adminUnitPrices) {
    let total = 0;
    for (const line of lines) {
      const amount = parseMmk(line.price);
      if (amount === undefined) throw new CommerceError(400, 'Enter an actual whole MMK unit price for every unpriced offer.');
      const lineTotal = amount * line.quantity;
      if (!Number.isSafeInteger(lineTotal) || !Number.isSafeInteger(total + lineTotal)) {
        throw new CommerceError(400, 'The order total exceeds the supported amount.');
      }
      total += lineTotal;
    }
    return { lines, totalMmk: total };
  }
  const total = totalMmk(rows);
  if (total === undefined && lines.every(line => parseMmk(line.price) !== undefined)) {
    throw new CommerceError(400, 'The order total exceeds the supported amount.');
  }
  return { lines, totalMmk: total ?? null };
}

function telegramOrder(id: string, snapshot: OrderSnapshot): TelegramOrder {
  return { id, totalMmk: snapshot.totalMmk, lines: snapshot.lines.map(({ productName, planName, duration, price, quantity }) =>
    ({ productName, planName, duration, price, quantity })) };
}

function orderContact(catalog: Catalog) {
  const username = resolveTelegramContact(catalog.settings);
  if (!username) throw new CommerceError(503, 'Telegram checkout is temporarily unavailable. Please try again.');
  return username;
}

export async function currentOrderContact() {
  return orderContact(await getCatalog());
}

async function existingCheckout(owner: CheckoutOwner, requestId: string, hash: Buffer) {
  const [rows] = await getPool().execute<RowDataPacket[]>(
    'SELECT id, customer_id, request_hash, snapshot FROM digimium_orders WHERE ' + (owner.customerId ? 'customer_id' : 'guest_key') + ' = ? AND request_id = ?',
    [owner.customerId ?? owner.guestKey, requestId],
  );
  if (!rows.length) return null;
  if (!hash.equals(rows[0].request_hash)) throw new CommerceError(409, 'This checkout was already submitted with different items.');
  return { order: telegramOrder(rows[0].id, JSON.parse(rows[0].snapshot)), customerId: rows[0].customer_id as string | null, telegram: await currentOrderContact(), created: false };
}

export async function submitOrder(customerId: string, body: unknown) {
  enforceCollectionLimit(body, 'items');
  const input = checkoutSchema.safeParse(body);
  if (!input.success) throw new CommerceError(400, 'Select valid items and quantities before submitting your order.');
  return storeOrder({ customerId }, input.data);
}

export async function submitGuestOrder(guestKey: Buffer, body: unknown, request: Request) {
  enforceCollectionLimit(body, 'items');
  const input = guestCheckoutSchema.safeParse(body);
  if (!input.success) throw new CommerceError(400, 'Check the checkout details and selected items.');
  const guestName = 'guestName' in input.data ? input.data.guestName : null;
  const result = await storeOrder({ customerId: null, guestKey, guestName }, input.data, request);
  return { ...result, guestName };
}

async function storeOrder(owner: CheckoutOwner, input: z.infer<typeof checkoutSchema>, request?: Request) {
  const { items, requestId } = input;
  const canonical = JSON.stringify(items.map(item => [item.productId, item.planId, item.quantity]));
  // Legacy named guests retain their original retry hashes. Anonymous guests have an empty name prefix.
  const hash = createHash('sha256').update(owner.customerId ? canonical : (owner.guestName ?? '') + '\n' + canonical).digest();
  await ensureOrders();
  const existing = await existingCheckout(owner, requestId, hash);
  if (existing) return existing;
  if (owner.guestKey && request) await limitGuestCheckout(request, owner.guestKey);

  const connection = await getPool().getConnection();
  let createdOrder: { order: TelegramOrder; customerId: string | null; telegram: string; created: true } | undefined;
  try {
    await connection.beginTransaction();
    // Keep the selected catalog revision stable until this entire order is stored.
    const [catalog] = await connection.execute<(CatalogSnapshot & RowDataPacket)[]>(
      "SELECT payload, revision, updated_at AS updatedAt FROM digimium_catalog WHERE id = 'main' LOCK IN SHARE MODE",
    );
    const current = catalog.length ? decodeSnapshot(catalog[0]) : initialCatalog();
    const telegram = orderContact(current);
    const snapshot = snapshotCart(items, current);
    const id = randomUUID();
    await connection.execute(
      'INSERT INTO digimium_orders (id, customer_id, guest_key, guest_name, request_id, request_hash, created_at, snapshot) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [id, owner.customerId, owner.guestKey ?? null, owner.guestName ?? null, requestId, hash, new Date().toISOString(), JSON.stringify(snapshot)],
    );
    // The alert is committed with the order; retries cannot create a second alert.
    const [customers] = owner.customerId ? await connection.execute<(RowDataPacket & { name: string })[]>(
      'SELECT name FROM digimium_customers WHERE id = ?', [owner.customerId],
    ) : [[]];
    await enqueueNotificationAlert(connection, { kind: 'order-created', dedupeKey: 'order-created:' + id, entityId: id,
      customerName: owner.customerId ? customers[0]?.name : owner.guestName ?? 'Telegram guest',
      orderReference: id.replaceAll('-', '').slice(0, 8).toUpperCase(),
      productSummary: snapshot.lines.slice(0, 6).map(line => line.productName + (line.planName ? ' · ' + line.planName : '') + ' × ' + line.quantity).join('\n').slice(0, 350),
      totalMmk: snapshot.totalMmk });
    await connection.commit();
    createdOrder = { order: telegramOrder(id, snapshot), customerId: owner.customerId, telegram, created: true };
  } catch (error) {
    await connection.rollback();
    if (!(error instanceof Error && 'code' in error && error.code === 'ER_DUP_ENTRY')) throw error;
  } finally {
    connection.release();
  }
  if (createdOrder) {
    await drainAdminNotificationAlerts({ limit: 1, budgetMs: 2000 }).catch(() => {});
    return createdOrder;
  }
  // A simultaneous retry can win the unique key while this transaction is in flight.
  const winner = await existingCheckout(owner, requestId, hash);
  if (!winner) throw new Error('Checkout collision.');
  return winner;
}

const orderColumns = 'id, customer_id, guest_key, guest_name, created_at, approved_at, rejected_at, customer_note, revision, snapshot, fulfillment, checkout_state';

/** Record an existing purchase for a selected account without moving any guest order. */
export async function createAdminOrder(body: unknown): Promise<{ order: CommerceOrder; created: boolean }> {
  enforceCollectionLimit(body, 'items');
  const input = adminOrderSchema.safeParse(body);
  if (!input.success) throw new CommerceError(400, 'Choose a registered customer, current catalog, valid items and whole MMK prices.');
  const { customerId, requestId, expectedCatalogRevision, items } = input.data;
  const customerNote = input.data.customerNote ?? '';
  // Separate this operation from customer checkout, including its idempotency payload.
  const hash = createHash('sha256').update(JSON.stringify([
    'digimium/admin-order/v1', customerId, expectedCatalogRevision,
    items.map(item => [item.productId, item.planId, item.quantity, item.unitPriceMmk ?? null]), customerNote,
  ])).digest();
  await ensureOrders();
  const connection = await getPool().getConnection();
  try {
    await connection.beginTransaction();
    // Customer administration locks the same parent first. A concurrent removal
    // therefore either notices this order in its version check or wins before us.
    const [customers] = await connection.execute<RowDataPacket[]>(
      'SELECT id FROM digimium_customers WHERE id = ? FOR UPDATE', [customerId],
    );
    if (!customers.length) throw new CommerceError(404, 'Customer not found. Reload the customer directory.');
    const [existing] = await connection.execute<(OrderRow & { request_hash: Buffer })[]>(
      'SELECT ' + orderColumns + ', request_hash FROM digimium_orders WHERE customer_id = ? AND request_id = ? FOR UPDATE',
      [customerId, requestId],
    );
    if (existing[0]) {
      if (!hash.equals(existing[0].request_hash)) throw new CommerceError(409, 'This order request was already used with different details.');
      const order = present(existing[0]);
      await connection.commit();
      return { order, created: false };
    }
    const [catalog] = await connection.execute<(CatalogSnapshot & RowDataPacket)[]>(
      "SELECT payload, revision, updated_at AS updatedAt FROM digimium_catalog WHERE id = 'main' LOCK IN SHARE MODE",
    );
    const current = catalog.length ? decodeSnapshot(catalog[0]) : initialCatalog();
    if (current.revision !== expectedCatalogRevision) {
      throw new CommerceError(409, 'The catalog changed. Reload the latest catalog before creating this order.');
    }
    const snapshot = snapshotCart(items, current, items.map(item => item.unitPriceMmk));
    const id = randomUUID();
    await connection.execute(
      'INSERT INTO digimium_orders (id, customer_id, request_id, request_hash, created_at, snapshot, customer_note) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [id, customerId, requestId, hash, new Date().toISOString(), JSON.stringify(snapshot), customerNote],
    );
    const [rows] = await connection.execute<OrderRow[]>('SELECT ' + orderColumns + ' FROM digimium_orders WHERE id = ?', [id]);
    const order = present(rows[0]);
    await connection.commit();
    // This is a historical record, not a new checkout or a Telegram message.
    return { order, created: true };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

function checkoutKey(purpose: 'inputs' | 'proof' | 'request' | 'delivery-draft') {
  const secret = process.env.ORDER_FULFILLMENT_SECRET?.trim() || process.env.ADMIN_AUTH_SECRET?.trim();
  if (!secret || secret.length < 32) throw new Error('Missing order encryption key.');
  return createHmac('sha256', secret).update('digimium/website-checkout/v1/' + purpose).digest();
}

function encryptCheckoutData(id: string, customerId: string, purpose: 'inputs' | 'proof' | 'delivery-draft', data: Buffer) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', checkoutKey(purpose), iv);
  cipher.setAAD(Buffer.from(id + '/' + customerId));
  const ciphertext = Buffer.concat([cipher.update(data), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]);
}

function decryptCheckoutData(id: string, customerId: string, purpose: 'inputs' | 'proof' | 'delivery-draft', data: Buffer) {
  const decipher = createDecipheriv('aes-256-gcm', checkoutKey(purpose), data.subarray(0, 12));
  decipher.setAuthTag(data.subarray(12, 28));
  decipher.setAAD(Buffer.from(id + '/' + customerId));
  return Buffer.concat([decipher.update(data.subarray(28)), decipher.final()]);
}

function collectCustomerInputs(input: z.infer<typeof websiteCheckoutSchema>, snapshot: OrderSnapshot, catalog: Catalog): CustomerOrderInput[] {
  let inputUnits = 0;
  return input.items.flatMap((item, index) => {
    const product = catalog.products.find(product => product.id === item.productId)!;
    const plan = product.plans?.find(plan => plan.id === item.planId);
    const fields = checkoutFieldsFor(product, plan);
    const units = item.inputs ?? [];
    if (!fields.length) {
      if (units.length) throw new CommerceError(400, 'This offer does not request customer details. Review the current form.');
      return [];
    }
    inputUnits += item.quantity;
    if (inputUnits > MAX_CUSTOMER_INPUT_UNITS) {
      throw new CommerceError(400, `Enter customer details for at most ${MAX_CUSTOMER_INPUT_UNITS} accounts in one order.`);
    }
    const needsEveryUnit = fields.some(field => field.required);
    if ((needsEveryUnit && units.length !== item.quantity) || new Set(units.map(unit => unit.unit)).size !== units.length) {
      throw new CommerceError(400, 'Fill in the requested details for each account in your order.');
    }
    return units.map(unit => {
      if (unit.unit >= item.quantity || Object.keys(unit.values).some(id => !fields.some(field => field.id === id))) {
        throw new CommerceError(400, 'The requested customer fields changed. Review the current form.');
      }
      return { lineId: snapshot.lines[index].id, unit: unit.unit, fields: fields.map(field => {
        const value = Object.hasOwn(unit.values, field.id) ? unit.values[field.id] : '';
        if (field.required && !value.trim()) throw new CommerceError(400, 'Fill in every required customer detail.');
        if (field.type === 'email' && value && !z.string().email().safeParse(value).success) {
          throw new CommerceError(400, 'Enter a valid email address for each email field.');
        }
        return { id: field.id, label: field.label, ...(field.labelMy ? { labelMy: field.labelMy } : {}), type: field.type, value };
      }) };
    });
  });
}

export async function createWebsiteOrder(customerId: string, body: unknown): Promise<{ order: CommerceOrder; created: boolean }> {
  enforceCollectionLimit(body, 'items');
  const parsed = websiteCheckoutSchema.safeParse(body);
  if (!parsed.success) throw new CommerceError(400, 'Review the cart and requested customer details.');
  const input = parsed.data;
  if (input.expectedCustomerId !== customerId) {
    throw new CommerceError(409, 'The signed-in account changed. Review your checkout again.');
  }
  // A keyed digest prevents guessed customer passwords from being checked against a database dump.
  const canonicalItems = input.items.map(item => {
    const units = (item.inputs ?? []).map(unit => [unit.unit, Object.entries(unit.values).sort(([a], [b]) => a.localeCompare(b))]);
    units.sort((a, b) => Number(a[0]) - Number(b[0]));
    return [item.productId, item.planId, item.quantity, units];
  });
  const canonical = [customerId, input.expectedCatalogRevision, canonicalItems];
  const hash = createHmac('sha256', checkoutKey('request')).update(JSON.stringify(canonical)).digest();
  await ensureOrders();
  const connection = await getPool().getConnection();
  try {
    await connection.beginTransaction();
    const [customers] = await connection.execute<RowDataPacket[]>('SELECT id, name FROM digimium_customers WHERE id = ? FOR UPDATE', [customerId]);
    if (!customers.length) throw new CommerceError(401, 'Sign in again before placing your order.');
    const [existing] = await connection.execute<(OrderRow & { request_hash: Buffer })[]>(
      'SELECT ' + orderColumns + ', request_hash FROM digimium_orders WHERE customer_id = ? AND request_id = ? FOR UPDATE',
      [customerId, input.requestId]);
    if (existing[0]) {
      if (!existing[0].checkout_state || !hash.equals(existing[0].request_hash)) throw new CommerceError(409, 'This request was already submitted with different details.');
      await connection.commit();
      return { order: presentCheckout(existing[0]), created: false };
    }
    const [catalogRows] = await connection.execute<(CatalogSnapshot & RowDataPacket)[]>(
      "SELECT payload, revision, updated_at AS updatedAt FROM digimium_catalog WHERE id = 'main' LOCK IN SHARE MODE");
    const catalog = catalogRows.length ? decodeSnapshot(catalogRows[0]) : initialCatalog();
    if (catalog.revision !== input.expectedCatalogRevision) throw new CommerceError(409, 'The catalog changed. Reload it and review your order.');
    const snapshot = snapshotCart(input.items, catalog);
    const customerInputs = collectCustomerInputs(input, snapshot, catalog);
    const id = randomUUID();
    const checkout: WebsiteCheckout = { stage: snapshot.totalMmk === null ? 'quote_required' : snapshot.totalMmk === 0 ? 'processing' : 'awaiting_payment' };
    const encrypted = encryptCheckoutData(id, customerId, 'inputs', Buffer.from(JSON.stringify(customerInputs))).toString('base64');
    await connection.execute(`INSERT INTO digimium_orders
      (id, customer_id, request_id, request_hash, created_at, snapshot, checkout_state, customer_inputs)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [id, customerId, input.requestId, hash, new Date().toISOString(), JSON.stringify(snapshot), JSON.stringify(checkout), encrypted]);
    await enqueueNotificationAlert(connection, { kind: 'order-created', dedupeKey: 'order-created:' + id, entityId: id,
      websiteOrder: true, customerName: customers[0].name, orderReference: id.replaceAll('-', '').slice(0, 8).toUpperCase(),
      productSummary: snapshot.lines.slice(0, 6).map(line => line.productName + (line.planName ? ' · ' + line.planName : '') + ' × ' + line.quantity).join('\n').slice(0, 350),
      totalMmk: snapshot.totalMmk });
    const [rows] = await connection.execute<OrderRow[]>('SELECT ' + orderColumns + ' FROM digimium_orders WHERE id = ?', [id]);
    await connection.commit();
    await drainAdminNotificationAlerts({ limit: 1, budgetMs: 2000 }).catch(() => {});
    return { order: presentCheckout(rows[0]), created: true };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function recoverWebsiteOrder(customerId: string, requestId: string) {
  if (!z.string().uuid().safeParse(requestId).success) throw new CommerceError(400, 'Choose a valid checkout request.');
  await ensureOrders();
  const [rows] = await getPool().execute<OrderRow[]>('SELECT ' + orderColumns +
    ' FROM digimium_orders WHERE customer_id = ? AND request_id = ? AND checkout_state IS NOT NULL', [customerId, requestId]);
  if (!rows[0]) throw new CommerceError(404, 'The checkout has not been saved.');
  return { order: presentCheckout(rows[0]) };
}

export async function orderDetails(id: string, customerId?: string, includeInputs = true) {
  if (!z.string().uuid().safeParse(id).success) throw new CommerceError(404, 'Order not found.');
  await ensureOrders();
  const [rows] = await getPool().execute<OrderRow[]>('SELECT ' + orderColumns + (includeInputs ? ', customer_inputs' : '') +
    (includeInputs && !customerId ? ', delivery_draft' : '') +
    ' FROM digimium_orders WHERE id = ?' + (customerId ? ' AND customer_id = ?' : ''), customerId ? [id, customerId] : [id]);
  const row = rows[0];
  if (!row) throw new CommerceError(404, 'Order not found.');
  if (!includeInputs) return { order: presentCheckout(row) };
  const customerInputs: CustomerOrderInput[] = row.customer_inputs && row.customer_id
    ? JSON.parse(decryptCheckoutData(id, row.customer_id, 'inputs', Buffer.from(row.customer_inputs, 'base64')).toString('utf8')) : [];
  return { order: present(row), customerInputs,
    ...(!customerId && row.delivery_draft ? { deliveryDraft: decryptDeliveryDraft(row) } : {}) };
}

function editableWebsiteOrder(row: OrderRow | undefined, revision: number): { row: OrderRow; checkout: WebsiteCheckout } {
  if (!row) throw new CommerceError(404, 'Order not found.');
  if (row.revision !== revision) throw new CommerceError(409, 'This order changed. Refresh before continuing.');
  if (!row.checkout_state || !row.customer_id) throw new CommerceError(409, 'This order uses the existing support workflow.');
  if (row.approved_at || row.rejected_at) throw new CommerceError(409, 'This order is already completed or rejected.');
  return { row, checkout: JSON.parse(row.checkout_state) };
}

function usdtAmount(totalMmk: number, rate: number | undefined) {
  if (!rate || !Number.isFinite(rate) || rate <= 0) throw new CommerceError(409, 'The Binance payment rate is unavailable. Choose another method.');
  // Interpret the saved decimal rate exactly, including scientific notation.
  // Round half up to two USDT decimal places without binary floating-point drift.
  const [coefficient, exponent = '0'] = rate.toString().toLowerCase().split('e');
  const [whole, fraction = ''] = coefficient.split('.');
  const scale = fraction.length - Number(exponent);
  const hundred = BigInt(100);
  const two = BigInt(2);
  const numerator = BigInt(whole + fraction) * BigInt(10) ** BigInt(Math.max(-scale, 0));
  const denominator = BigInt(10) ** BigInt(Math.max(scale, 0));
  const scaledTotal = BigInt(totalMmk) * hundred * denominator;
  const cents = (scaledTotal * two + numerator) / (numerator * two);
  if (cents < BigInt(1) || cents > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new CommerceError(409, 'This amount is outside the Binance payment range. Choose another method.');
  }
  return (cents / hundred).toString() + '.' + (cents % hundred).toString().padStart(2, '0');
}

export async function selectOrderPayment(customerId: string, id: string, body: unknown) {
  const parsed = selectPaymentSchema.safeParse(body);
  if (!parsed.success || !z.string().uuid().safeParse(id).success) throw new CommerceError(400, 'Choose a payment method and refresh the order.');
  await ensureOrders();
  const connection = await getPool().getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.execute<OrderRow[]>('SELECT ' + orderColumns + ' FROM digimium_orders WHERE id = ? AND customer_id = ? FOR UPDATE', [id, customerId]);
    const { row, checkout } = editableWebsiteOrder(rows[0], parsed.data.revision);
    if (!['awaiting_payment', 'payment_rejected'].includes(checkout.stage)) throw new CommerceError(409, 'Payment details can only change before review.');
    const snapshot: OrderSnapshot = JSON.parse(row.snapshot);
    if (snapshot.totalMmk === null || snapshot.totalMmk <= 0) throw new CommerceError(409, 'Wait for the order price before choosing payment.');
    const [catalogRows] = await connection.execute<(CatalogSnapshot & RowDataPacket)[]>(
      "SELECT payload, revision, updated_at AS updatedAt FROM digimium_catalog WHERE id = 'main' LOCK IN SHARE MODE");
    const catalog = catalogRows.length ? decodeSnapshot(catalogRows[0]) : initialCatalog();
    const method = checkoutPaymentMethods(catalog.settings.paymentMethods)?.find(method => method.id === parsed.data.methodId && method.enabled);
    if (!method || !method.accountName || !method.accountNumber) throw new CommerceError(409, 'This payment method is unavailable. Choose another method.');
    const amount = method.id === 'binance' ? usdtAmount(snapshot.totalMmk, method.mmkPerUsdt) : String(snapshot.totalMmk);
    checkout.stage = 'awaiting_payment';
    checkout.payment = { method, amount, currency: method.id === 'binance' ? 'USDT' : 'MMK',
      submittedAt: null, approvedAt: null, rejectedAt: null, note: '', proofUrl: null };
    row.checkout_state = JSON.stringify(checkout);
    row.revision++;
    await connection.execute('UPDATE digimium_orders SET checkout_state = ?, revision = ? WHERE id = ?', [row.checkout_state, row.revision, id]);
    await connection.commit();
    return { order: present(row) };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally { connection.release(); }
}

export async function submitOrderProof(customerId: string, id: string, body: unknown, bytes: Uint8Array<ArrayBuffer>, declaredMime: string) {
  const parsed = proofRequestSchema.safeParse(body);
  if (!parsed.success || !z.string().uuid().safeParse(id).success) throw new CommerceError(400, 'Refresh the order before uploading payment proof.');
  const alertKey = 'payment-proof-submitted:' + id + ':' + parsed.data.requestId;
  if (!bytes.length || bytes.length > 5 * 1024 * 1024) throw new CommerceError(413, 'Choose an image smaller than 5 MB.');
  try {
    if (identifyLogo(bytes).mime !== declaredMime) throw new CommerceError(415, 'The image type does not match its contents.');
  } catch (error) {
    if (error instanceof LogoInputError) throw new CommerceError(error.status, error.message);
    throw error;
  }
  const hash = createHash('sha256').update(declaredMime).update(bytes).digest();
  await ensureOrders();
  const connection = await getPool().getConnection();
  let submittedOrder: CommerceOrder;
  try {
    await connection.beginTransaction();
    const [rows] = await connection.execute<OrderRow[]>('SELECT ' + orderColumns + ' FROM digimium_orders WHERE id = ? AND customer_id = ? FOR UPDATE', [id, customerId]);
    const row = rows[0];
    if (!row) throw new CommerceError(404, 'Order not found.');
    const [previous] = await connection.execute<(RowDataPacket & { request_hash: Buffer })[]>(
      'SELECT request_hash FROM digimium_order_proofs WHERE order_id = ? AND request_id = ?', [id, parsed.data.requestId]);
    if (previous[0]) {
      if (!hash.equals(previous[0].request_hash)) throw new CommerceError(409, 'This upload request was already used for another image.');
      await connection.commit();
      return { order: presentCheckout(row) };
    }
    const { checkout } = editableWebsiteOrder(row, parsed.data.revision);
    if (!['awaiting_payment', 'payment_rejected'].includes(checkout.stage) || !checkout.payment) {
      throw new CommerceError(409, 'Choose the payment method before uploading its screenshot.');
    }
    const now = new Date().toISOString();
    const encrypted = encryptCheckoutData(id, customerId, 'proof', Buffer.from(bytes));
    await connection.execute(`INSERT INTO digimium_order_proofs (order_id, request_id, request_hash, content_type, image_bytes, created_at)
      VALUES (?, ?, ?, ?, ?, ?)`,
    [id, parsed.data.requestId, hash, declaredMime, encrypted, now]);
    checkout.stage = 'payment_review';
    checkout.payment.submittedAt = now;
    checkout.payment.approvedAt = null;
    checkout.payment.rejectedAt = null;
    checkout.payment.note = '';
    checkout.payment.proofUrl = '/api/customer/orders/' + id + '/proof?version=' + parsed.data.requestId;
    row.checkout_state = JSON.stringify(checkout);
    row.revision++;
    await connection.execute('UPDATE digimium_orders SET checkout_state = ?, revision = ? WHERE id = ?', [row.checkout_state, row.revision, id]);
    await enqueueNotificationAlert(connection, {
      kind: 'payment-proof-submitted',
      dedupeKey: alertKey,
      entityId: id,
      orderReference: id.replaceAll('-', '').slice(0, 8).toUpperCase(),
      paymentMethod: checkout.payment.method.id,
      paymentAmount: checkout.payment.amount,
      paymentCurrency: checkout.payment.currency,
      demo: checkout.payment.method.demo === true,
      proofRequestId: parsed.data.requestId,
    });
    submittedOrder = presentCheckout(row);
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally { connection.release(); }
  await drainAdminNotificationAlerts({ limit: 1, budgetMs: 2000, dedupeKey: alertKey }).catch(() => {});
  return { order: submittedOrder };
}

export async function orderProof(id: string, customerId?: string, version?: string | null) {
  if (!z.string().uuid().safeParse(id).success || (version && !z.string().uuid().safeParse(version).success)) throw new CommerceError(404, 'Payment proof not found.');
  await ensureOrders();
  const [rows] = await getPool().execute<(RowDataPacket & { customer_id: string; request_id: string; content_type: string; image_bytes: Buffer })[]>(
    `SELECT o.customer_id, p.request_id, p.content_type, p.image_bytes FROM digimium_orders o
      INNER JOIN digimium_order_proofs p ON p.order_id = o.id WHERE o.id = ?` + (customerId ? ' AND o.customer_id = ?' : '') +
      (version ? ' AND p.request_id = ?' : '') + ' ORDER BY p.created_at DESC, p.request_id LIMIT 1',
    [id, ...(customerId ? [customerId] : []), ...(version ? [version] : [])]);
  const row = rows[0];
  if (!row || (version && row.request_id !== version)) throw new CommerceError(404, 'Payment proof not found.');
  return { contentType: row.content_type, bytes: decryptCheckoutData(id, row.customer_id, 'proof', row.image_bytes) };
}

function currentProofId(id: string, checkout: WebsiteCheckout) {
  const prefix = '/api/customer/orders/' + id + '/proof?version=';
  const path = checkout.payment?.proofUrl;
  if (!path?.startsWith(prefix)) return;
  const requestId = path.slice(prefix.length);
  return z.string().uuid().safeParse(requestId).success ? requestId : undefined;
}

async function hasCurrentProof(connection: Pick<PoolConnection, 'execute'>, id: string, checkout: WebsiteCheckout, expected?: string) {
  const requestId = currentProofId(id, checkout);
  if (!requestId || (expected && expected !== requestId)) return false;
  const [rows] = await connection.execute<RowDataPacket[]>(
    'SELECT 1 FROM digimium_order_proofs WHERE order_id = ? AND request_id = ?', [id, requestId]);
  return rows.length === 1;
}

async function paymentConfirmed(connection: Pick<PoolConnection, 'execute'>, row: OrderRow, checkout: WebsiteCheckout) {
  const snapshot: OrderSnapshot = JSON.parse(row.snapshot);
  return snapshot.totalMmk === 0 || (snapshot.totalMmk !== null && Boolean(checkout.payment?.approvedAt) &&
    await hasCurrentProof(connection, row.id, checkout));
}

async function applyPaymentDecision(connection: PoolConnection, row: OrderRow, checkout: WebsiteCheckout,
  input: { action: 'payment-approve' | 'payment-reject'; note?: string; proofRequestId?: string }) {
  if (checkout.stage !== 'payment_review' || !checkout.payment ||
    !await hasCurrentProof(connection, row.id, checkout, input.proofRequestId)) {
    throw new CommerceError(409, 'The payment screenshot changed or is unavailable. Review the current payment first.');
  }
  if (input.action === 'payment-approve') {
    checkout.stage = 'processing';
    checkout.payment.approvedAt = new Date().toISOString();
    checkout.payment.rejectedAt = null;
  } else {
    checkout.stage = 'payment_rejected';
    checkout.payment.rejectedAt = new Date().toISOString();
    checkout.payment.approvedAt = null;
  }
  checkout.payment.note = input.note ?? '';
}

function decryptDeliveryDraft(row: OrderRow): OrderDeliveryDraft {
  if (!row.delivery_draft || !row.customer_id || !row.checkout_state) throw new CommerceError(409, 'Prepare delivery details in Admin first.');
  const checkout: WebsiteCheckout = JSON.parse(row.checkout_state);
  const stored = JSON.parse(decryptCheckoutData(row.id, row.customer_id, 'delivery-draft', Buffer.from(row.delivery_draft, 'base64')).toString('utf8'));
  if (stored.id !== checkout.deliveryDraftId) throw new CommerceError(409, 'The prepared delivery changed. Review it in Admin.');
  const parsed = fulfillmentSchema.safeParse({ revision: 1, lines: stored.lines, customerNote: stored.customerNote });
  if (!parsed.success) throw new Error('Invalid prepared delivery.');
  return { lines: parsed.data.lines.map(line => ({ ...line, accountInfo: line.accountInfo ?? '' })), customerNote: parsed.data.customerNote ?? '' };
}

function prepareFulfillment(row: OrderRow, input: z.infer<typeof fulfillmentSchema>, previousLines: OrderFulfillment[]) {
  const snapshot: OrderSnapshot = JSON.parse(row.snapshot);
  const grants = new Set(input.lines.map(line => line.id));
  if (snapshot.lines.length !== input.lines.length || !snapshot.lines.every(line => grants.has(line.id))) {
    throw new CommerceError(400, 'Include the dates for every purchased item exactly once.');
  }
  const previous = new Map(previousLines.map(line => [line.id, line]));
  return input.lines.map(({ id, startDate, endDate, accountInfo, accountDetails }) => {
    const saved = previous.get(id)?.accountInfo || '';
    if (accountInfo && accountInfo !== saved) throw new CommerceError(400, 'Use the optional Account, Password, Manager and Username fields.');
    const details = accountDetails ?? previous.get(id)?.accountDetails;
    const hasDetails = details && Object.values(details).some(value => value.length > 0);
    return { id, startDate, endDate, accountInfo: saved, ...(hasDetails ? { accountDetails: details } : {}) };
  });
}

async function enqueueDeliveryReady(connection: PoolConnection, row: OrderRow, checkout: WebsiteCheckout) {
  if (row.approved_at || row.rejected_at || !row.delivery_draft || !checkout.orderApprovedAt || !checkout.deliveryDraftId ||
    !await paymentConfirmed(connection, row, checkout)) return;
  const dedupeKey = 'order-delivery-ready:' + row.id + ':' + checkout.deliveryDraftId;
  await enqueueNotificationAlert(connection, { kind: 'order-delivery-ready', dedupeKey, entityId: row.id,
    orderReference: row.id.replaceAll('-', '').slice(0, 8).toUpperCase(), deliveryDraftId: checkout.deliveryDraftId });
  return dedupeKey;
}

export async function readAdminOrderActionRevision(id: string) {
  if (!z.string().uuid().safeParse(id).success) throw new CommerceError(404, 'Order not found.');
  await ensureOrders();
  const [rows] = await getPool().execute<(RowDataPacket & { revision: number })[]>(
    `SELECT revision FROM digimium_orders
      WHERE id = ? AND customer_id IS NOT NULL AND guest_key IS NULL AND checkout_state IS NOT NULL`, [id]);
  if (!rows[0]) throw new CommerceError(404, 'Website order not found.');
  return rows[0].revision;
}

async function stageOrderDelivery(id: string, body: unknown) {
  if (!z.string().uuid().safeParse(id).success) throw new CommerceError(404, 'Order not found.');
  enforceCollectionLimit(body, 'lines');
  const parsed = deliveryDraftSchema.safeParse(body);
  if (!parsed.success) throw new CommerceError(400, 'Check the prepared delivery dates, account details and note.');
  await ensureOrders();
  const connection = await getPool().getConnection();
  let order: CommerceOrder;
  let readyKey: string | undefined;
  try {
    await connection.beginTransaction();
    const [rows] = await connection.execute<OrderRow[]>('SELECT ' + orderColumns + ', delivery_draft FROM digimium_orders WHERE id = ? FOR UPDATE', [id]);
    const { row, checkout } = editableWebsiteOrder(rows[0], parsed.data.revision);
    const previous = row.delivery_draft ? decryptDeliveryDraft(row) : undefined;
    const lines = prepareFulfillment(row, parsed.data, previous?.lines ?? []);
    const draft: OrderDeliveryDraft = { lines, customerNote: parsed.data.customerNote ?? previous?.customerNote ?? row.customer_note ?? '' };
    checkout.deliveryDraftId = randomUUID();
    checkout.deliveryReady = true;
    row.delivery_draft = encryptCheckoutData(id, row.customer_id!, 'delivery-draft',
      Buffer.from(JSON.stringify({ id: checkout.deliveryDraftId, ...draft }))).toString('base64');
    row.checkout_state = JSON.stringify(checkout);
    row.revision++;
    await connection.execute('UPDATE digimium_orders SET delivery_draft = ?, checkout_state = ?, revision = ? WHERE id = ?',
      [row.delivery_draft, row.checkout_state, row.revision, id]);
    readyKey = await enqueueDeliveryReady(connection, row, checkout);
    order = presentCheckout(row);
    await connection.commit();
  } catch (error) { await connection.rollback(); throw error; }
  finally { connection.release(); }
  if (readyKey) await drainAdminNotificationAlerts({ limit: 1, budgetMs: 2000, dedupeKey: readyKey }).catch(() => {});
  return order;
}

/** The caller must authenticate Admin before applying these server-only actions. */
export async function applyAdminOrderAction(id: string, body: unknown): Promise<{ order: CommerceOrder; applied: boolean }> {
  const parsed = adminActionSchema.safeParse(body);
  if (!parsed.success || !z.string().uuid().safeParse(id).success) throw new CommerceError(400, 'Review the order and use its current action.');
  const input = parsed.data;
  const hash = createHash('sha256').update(JSON.stringify([id, input.action, input.proofRequestId ?? null, input.deliveryDraftId ?? null])).digest();
  await ensureOrders();
  const connection = await getPool().getConnection();
  let order: CommerceOrder;
  let readyKey: string | undefined;
  try {
    await connection.beginTransaction();
    const [rows] = await connection.execute<OrderRow[]>('SELECT ' + orderColumns + ', delivery_draft FROM digimium_orders WHERE id = ? FOR UPDATE', [id]);
    const row = rows[0];
    if (!row) throw new CommerceError(404, 'Order not found.');
    const [receipts] = await connection.execute<(RowDataPacket & { request_hash: Buffer })[]>(
      'SELECT request_hash FROM digimium_order_actions WHERE order_id = ? AND request_id = ?', [id, input.requestId]);
    if (receipts[0]) {
      if (!hash.equals(receipts[0].request_hash)) throw new CommerceError(409, 'This action request was already used for a different decision.');
      await connection.commit();
      return { order: presentCheckout(row), applied: false };
    }
    const { checkout } = editableWebsiteOrder(row, input.revision);
    if (input.action === 'order-approve') {
      if (checkout.orderApprovedAt) throw new CommerceError(409, 'This order is already approved for processing.');
      checkout.orderApprovedAt = new Date().toISOString();
    } else if (input.action === 'payment-approve') {
      await applyPaymentDecision(connection, row, checkout, { action: input.action, proofRequestId: input.proofRequestId });
    } else {
      if (!checkout.orderApprovedAt || !row.delivery_draft || checkout.deliveryDraftId !== input.deliveryDraftId) {
        throw new CommerceError(409, 'Approve the order and review its latest prepared delivery first.');
      }
      if (!await paymentConfirmed(connection, row, checkout)) throw new CommerceError(409, 'Approve the current payment proof before sending the order.');
      const draft = decryptDeliveryDraft(row);
      const lines = prepareFulfillment(row, { revision: row.revision, ...draft }, []);
      row.approved_at = new Date().toISOString();
      row.fulfillment = encryptFulfillment(id, fulfillmentOwner(row), lines);
      row.customer_note = draft.customerNote;
      row.delivery_draft = null;
      checkout.stage = 'completed';
      delete checkout.deliveryDraftId;
      delete checkout.deliveryReady;
      await connection.execute("DELETE FROM digimium_notifications WHERE order_id = ? AND kind = 'expiry'", [id]);
    }
    row.checkout_state = JSON.stringify(checkout);
    row.revision++;
    await connection.execute(`UPDATE digimium_orders SET checkout_state = ?, approved_at = ?, fulfillment = ?,
      delivery_draft = ?, customer_note = ?, revision = ? WHERE id = ?`,
    [row.checkout_state, row.approved_at, row.fulfillment, row.delivery_draft, row.customer_note, row.revision, id]);
    await connection.execute('INSERT INTO digimium_order_actions (order_id, request_id, request_hash, action, created_at) VALUES (?, ?, ?, ?, ?)',
      [id, input.requestId, hash, input.action, new Date().toISOString()]);
    readyKey = await enqueueDeliveryReady(connection, row, checkout);
    order = presentCheckout(row);
    await connection.commit();
  } catch (error) { await connection.rollback(); throw error; }
  finally { connection.release(); }
  if (readyKey) await drainAdminNotificationAlerts({ limit: 1, budgetMs: 2000, dedupeKey: readyKey }).catch(() => {});
  return { order, applied: true };
}

async function updateWebsiteOrder(id: string, body: unknown, action: unknown) {
  const parsed = action === 'quote' ? quoteOrderSchema.safeParse(body) : paymentDecisionSchema.safeParse(body);
  if (!parsed.success || !z.string().uuid().safeParse(id).success) throw new CommerceError(400, 'Enter a valid payment decision or quote and current revision.');
  await ensureOrders();
  const connection = await getPool().getConnection();
  let order: CommerceOrder;
  let readyKey: string | undefined;
  try {
    await connection.beginTransaction();
    const [rows] = await connection.execute<OrderRow[]>('SELECT ' + orderColumns + ', delivery_draft FROM digimium_orders WHERE id = ? FOR UPDATE', [id]);
    const { row, checkout } = editableWebsiteOrder(rows[0], parsed.data.revision);
    const snapshot: OrderSnapshot = JSON.parse(row.snapshot);
    if (parsed.data.action === 'quote') {
      if (!['quote_required', 'awaiting_payment', 'payment_rejected'].includes(checkout.stage)) throw new CommerceError(409, 'The order has already reached payment review.');
      const prices = new Map(parsed.data.lines.map(line => [line.id, line.unitPriceMmk]));
      if (prices.size !== snapshot.lines.length || prices.size !== parsed.data.lines.length || snapshot.lines.some(line => !prices.has(line.id))) {
        throw new CommerceError(400, 'Include one price for every order item.');
      }
      let total = 0;
      snapshot.lines = snapshot.lines.map(line => {
        const amount = prices.get(line.id)!;
        const subtotal = amount * line.quantity;
        if (!Number.isSafeInteger(subtotal) || !Number.isSafeInteger(total + subtotal)) throw new CommerceError(400, 'The quote exceeds the supported amount.');
        total += subtotal;
        return { ...line, price: amount.toLocaleString('en-US') + ' MMK' };
      });
      snapshot.totalMmk = total;
      checkout.stage = total === 0 ? 'processing' : 'awaiting_payment';
      checkout.quotedAt = new Date().toISOString();
      delete checkout.payment;
    } else {
      await applyPaymentDecision(connection, row, checkout, parsed.data);
    }
    row.snapshot = JSON.stringify(snapshot);
    row.checkout_state = JSON.stringify(checkout);
    row.revision++;
    await connection.execute('UPDATE digimium_orders SET snapshot = ?, checkout_state = ?, revision = ? WHERE id = ?',
      [row.snapshot, row.checkout_state, row.revision, id]);
    readyKey = await enqueueDeliveryReady(connection, row, checkout);
    order = present(row);
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally { connection.release(); }
  if (readyKey) await drainAdminNotificationAlerts({ limit: 1, budgetMs: 2000, dedupeKey: readyKey }).catch(() => {});
  return order;
}

export async function customerOrders(customerId: string) {
  await ensureOrders();
  const [rows] = await getPool().execute<OrderRow[]>(
    'SELECT ' + orderColumns + ' FROM digimium_orders WHERE customer_id = ? ORDER BY created_at DESC, id', [customerId],
  );
  return rows.map(row => present(row));
}

export async function adminCommerce() {
  await ensureOrders();
  const pool = getPool();
  const [[customers], [orders]] = await Promise.all([
    pool.query<(CustomerIdentityRow & RowDataPacket)[]>(
      `SELECT c.id, c.name, c.email, DATE_FORMAT(c.created_at, '%Y-%m-%dT%H:%i:%s.%fZ') AS createdAt,
       c.password_hash IS NOT NULL AS password_available, t.telegram_id, t.username AS telegram_username
       FROM digimium_customers c LEFT JOIN digimium_telegram_identities t ON t.customer_id = c.id ORDER BY c.created_at DESC, c.id`,
    ),
    pool.query<OrderRow[]>('SELECT ' + orderColumns + ' FROM digimium_orders ORDER BY created_at DESC, id'),
  ]);
  return { customers: customers.map(presentCustomer), orders: orders.map(row => present(row)) };
}

export async function saveFulfillment(id: string, body: unknown) {
  if (!z.string().uuid().safeParse(id).success) throw new CommerceError(404, 'Order not found.');
  enforceCollectionLimit(body, 'lines');
  const input = fulfillmentSchema.safeParse(body);
  if (!input.success) throw new CommerceError(400, 'Check every item’s dates, optional account details and customer note (at most 1,000 characters).');
  await ensureOrders();
  const connection = await getPool().getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.execute<OrderRow[]>('SELECT ' + orderColumns + ' FROM digimium_orders WHERE id = ? FOR UPDATE', [id]);
    const row = rows[0];
    if (!row) throw new CommerceError(404, 'Order not found.');
    if (row.revision !== input.data.revision) throw new CommerceError(409, 'This order changed. Refresh before saving.');
    if (row.rejected_at) throw new CommerceError(409, 'A rejected order cannot be approved. Edit its customer note instead.');
    const checkout: WebsiteCheckout | undefined = row.checkout_state ? JSON.parse(row.checkout_state) : undefined;
    if (checkout && !await paymentConfirmed(connection, row, checkout)) {
      throw new CommerceError(409, 'Approve the payment before completing this order.');
    }
    const previousLines = decryptFulfillment(row);
    const previous = new Map(previousLines.map(line => [line.id, line]));
    const lines = prepareFulfillment(row, input.data, previousLines);
    if (lines.some(line => previous.get(line.id)?.startDate !== line.startDate || previous.get(line.id)?.endDate !== line.endDate)) {
      await connection.execute("DELETE FROM digimium_notifications WHERE order_id = ? AND kind = 'expiry'", [id]);
    }
    row.approved_at ??= new Date().toISOString();
    if (checkout) {
      checkout.stage = 'completed';
      checkout.orderApprovedAt ??= row.approved_at;
      delete checkout.deliveryDraftId;
      delete checkout.deliveryReady;
      row.checkout_state = JSON.stringify(checkout);
    }
    row.fulfillment = encryptFulfillment(id, fulfillmentOwner(row), lines);
    if (input.data.customerNote !== undefined) row.customer_note = input.data.customerNote;
    row.revision++;
    const order = present(row);
    await connection.execute('UPDATE digimium_orders SET approved_at = ?, fulfillment = ?, customer_note = ?, revision = ?, checkout_state = ?, delivery_draft = NULL WHERE id = ?',
      [row.approved_at, row.fulfillment, row.customer_note, row.revision, row.checkout_state ?? null, id]);
    await connection.commit();
    return order;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

/** Explicit note edits never approve an order or modify encrypted delivery information. */
async function saveOrderDecision(id: string, body: unknown) {
  if (!z.string().uuid().safeParse(id).success) throw new CommerceError(404, 'Order not found.');
  const input = orderDecisionSchema.safeParse(body);
  if (!input.success) throw new CommerceError(400, 'Enter a valid decision, current revision and customer note of at most 1,000 characters.');
  await ensureOrders();
  const connection = await getPool().getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.execute<OrderRow[]>('SELECT ' + orderColumns + ' FROM digimium_orders WHERE id = ? FOR UPDATE', [id]);
    const row = rows[0];
    if (!row) throw new CommerceError(404, 'Order not found.');
    if (row.revision !== input.data.revision) throw new CommerceError(409, 'This order changed. Refresh before saving.');
    if (input.data.action === 'reject') {
      if (row.approved_at || row.rejected_at) throw new CommerceError(409, 'Only a pending order can be rejected.');
      row.rejected_at = new Date().toISOString();
    }
    if (input.data.customerNote !== undefined) row.customer_note = input.data.customerNote;
    row.revision++;
    const order = present(row);
    await connection.execute('UPDATE digimium_orders SET rejected_at = ?, customer_note = ?, revision = ? WHERE id = ?',
      [row.rejected_at, row.customer_note, row.revision, id]);
    await connection.commit();
    return order;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

/** Older callers still send fulfillment without an action; decisions are explicit new variants. */
export async function updateOrder(id: string, body: unknown) {
  const action = body && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>).action : undefined;
  if (action === 'stage-delivery') return stageOrderDelivery(id, body);
  if (action === 'order-approve' || action === 'order-send' ||
    (action === 'payment-approve' && body && typeof body === 'object' && Object.hasOwn(body, 'requestId'))) {
    return (await applyAdminOrderAction(id, body)).order;
  }
  if (action === 'quote' || action === 'payment-approve' || action === 'payment-reject') return updateWebsiteOrder(id, body, action);
  return action === 'reject' || action === 'note' ? saveOrderDecision(id, body) : saveFulfillment(id, body);
}

/** Admin-only operation: approval, fulfillment edits and removal lock the same order row. */
export async function removeOrder(id: string, body: unknown) {
  if (!z.string().uuid().safeParse(id).success) throw new CommerceError(404, 'Order not found.');
  const input = orderRemovalSchema.safeParse(body);
  if (!input.success || input.data.confirmation !== id) {
    throw new CommerceError(400, 'Confirm this order’s full ID before removing it.');
  }
  await ensureOrders();
  const connection = await getPool().getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.execute<(Pick<OrderRow, 'id' | 'revision'> & RowDataPacket)[]>(
      'SELECT id, revision FROM digimium_orders WHERE id = ? FOR UPDATE', [id],
    );
    const row = rows[0];
    if (!row) throw new CommerceError(404, 'Order not found.');
    if (row.revision !== input.data.revision) throw new CommerceError(409, 'This order changed. Refresh before removing it.');
    await connection.execute('DELETE FROM digimium_notifications WHERE order_id = ?', [id]);
    const [removed] = await connection.execute<ResultSetHeader>(
      'DELETE FROM digimium_orders WHERE id = ? AND revision = ?', [id, row.revision],
    );
    if (removed.affectedRows !== 1) throw new CommerceError(409, 'This order changed. Refresh before removing it.');
    await connection.commit();
    return { removed: true as const, id };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}
