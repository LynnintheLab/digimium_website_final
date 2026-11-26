import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { z } from 'zod';
import { resolveOrder, totalMmk, type CartItem } from '../lib/cart-order';
import { decodeSnapshot, getCatalog } from '../lib/catalog-store';
import type { Catalog } from '../lib/catalog';
import { CommerceError } from '../lib/commerce-http';
import type { AdminCommerceOrder, CommerceCustomer, CommerceOrder, CommerceOrderLine, OrderFulfillment, TelegramOrder } from '../lib/commerce-types';
import { initialCatalog } from '../lib/initial-catalog';
import { normalizeCheckoutContact, type CheckoutContact } from '../lib/order-checkout-contact';
import { effectivePrice, parseMmk } from '../lib/pricing';
import { resolveTelegramContact } from '../lib/telegram-contact';
import { priceOnEnquiry } from '../lib/shop-language';
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
const signedInCheckoutSchema = checkoutSchema.extend({ contact: z.unknown().optional(), expectedCustomerId: z.uuid().optional() });
const guestCheckoutSchema = z.union([
  checkoutSchema.extend({ checkoutMode: z.literal('guest') }),
  checkoutSchema.extend({ guestName: z.string().trim().min(1).max(100).refine(value => !/\p{Cc}/u.test(value)) }),
]);
type CheckoutOwner = { customerId: string; telegramLinked: boolean; guestKey?: never; guestName?: never } |
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
}
interface AdminOrderRow extends OrderRow {
  checkout_contact: string | null;
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
    ['rejected_at', 'CHAR(24) CHARACTER SET ascii NULL'], ['customer_note', 'TEXT NULL'], ['checkout_contact', 'TEXT NULL'],
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

function present(row: OrderRow): CommerceOrder {
  const snapshot: OrderSnapshot = JSON.parse(row.snapshot);
  const approved = !!row.approved_at && !row.rejected_at;
  const delivery = new Map((approved ? decryptFulfillment(row) : []).map(line => [line.id, line]));
  return {
    id: row.id, customerId: row.customer_id, createdAt: row.created_at, approvedAt: approved ? row.approved_at : null,
    rejectedAt: row.rejected_at ?? null, customerNote: row.customer_note ?? '',
    ...(row.guest_name ? { guestName: row.guest_name } : {}),
    status: row.rejected_at ? 'rejected' : approved ? 'approved' : 'pending', revision: row.revision, totalMmk: snapshot.totalMmk,
    lines: snapshot.lines.map(line => {
      const grant = delivery.get(line.id);
      return { ...line, startDate: grant?.startDate ?? null, endDate: grant?.endDate ?? null, accountInfo: grant?.accountInfo ?? '',
        ...(grant?.accountDetails ? { accountDetails: grant.accountDetails } : {}) };
    }),
  };
}

function presentAdminOrder(row: AdminOrderRow): AdminCommerceOrder {
  const order = present(row);
  const checkoutContact = row.checkout_contact ? JSON.parse(row.checkout_contact) as CheckoutContact : null;
  return checkoutContact ? { ...order, checkoutContact } : order;
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

export async function submitOrder(customer: Pick<CommerceCustomer, 'id' | 'telegram'>, body: unknown) {
  enforceCollectionLimit(body, 'items');
  const input = signedInCheckoutSchema.safeParse(body);
  if (!input.success) throw new CommerceError(400, 'Select valid items and quantities before submitting your order.');
  const { contact: rawContact, expectedCustomerId, ...checkout } = input.data;
  const contact = normalizeCheckoutContact(rawContact);
  if (rawContact !== undefined && !contact) throw new CommerceError(422, 'invalid_checkout_contact');
  if ((contact || expectedCustomerId) && expectedCustomerId !== customer.id) {
    throw new CommerceError(409, 'checkout_account_changed');
  }
  return storeOrder({ customerId: customer.id, telegramLinked: Boolean(customer.telegram) }, { ...checkout, contact });
}

export async function submitGuestOrder(guestKey: Buffer, body: unknown, request: Request) {
  enforceCollectionLimit(body, 'items');
  const input = guestCheckoutSchema.safeParse(body);
  if (!input.success) throw new CommerceError(400, 'Check the checkout details and selected items.');
  const guestName = 'guestName' in input.data ? input.data.guestName : null;
  const result = await storeOrder({ customerId: null, guestKey, guestName }, input.data, request);
  return { ...result, guestName };
}

async function storeOrder(owner: CheckoutOwner, input: z.infer<typeof checkoutSchema> & { contact?: CheckoutContact | null }, request?: Request) {
  const { items, requestId, contact } = input;
  const canonical = JSON.stringify(items.map(item => [item.productId, item.planId, item.quantity]));
  // Legacy named guests retain their original retry hashes. Anonymous guests have an empty name prefix.
  const hash = createHash('sha256').update(owner.customerId ? canonical : (owner.guestName ?? '') + '\n' + canonical).digest();
  await ensureOrders();
  const existing = await existingCheckout(owner, requestId, hash);
  if (existing) return existing;
  // Receipt recovery still works for orders made before checkout contact was collected.
  if (owner.customerId && !owner.telegramLinked && !contact) throw new CommerceError(422, 'checkout_contact_required');
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
      'INSERT INTO digimium_orders (id, customer_id, guest_key, guest_name, request_id, request_hash, created_at, snapshot, checkout_contact) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [id, owner.customerId, owner.guestKey ?? null, owner.guestName ?? null, requestId, hash, new Date().toISOString(), JSON.stringify(snapshot), contact ? JSON.stringify(contact) : null],
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
    await drainAdminNotificationAlerts({ limit: 1, budgetMs: 2000, dedupeKey: 'order-created:' + createdOrder.order.id }).catch(() => {});
    return createdOrder;
  }
  // A simultaneous retry can win the unique key while this transaction is in flight.
  const winner = await existingCheckout(owner, requestId, hash);
  if (!winner) throw new Error('Checkout collision.');
  return winner;
}

const orderColumns = 'id, customer_id, guest_key, guest_name, created_at, approved_at, rejected_at, customer_note, revision, snapshot, fulfillment';
const adminOrderColumns = orderColumns + ', checkout_contact';

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

export async function customerOrders(customerId: string) {
  await ensureOrders();
  const [rows] = await getPool().execute<OrderRow[]>(
    'SELECT ' + orderColumns + ' FROM digimium_orders WHERE customer_id = ? ORDER BY created_at DESC, id', [customerId],
  );
  return rows.map(present);
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
    pool.query<AdminOrderRow[]>('SELECT ' + adminOrderColumns + ' FROM digimium_orders ORDER BY created_at DESC, id'),
  ]);
  return { customers: customers.map(presentCustomer), orders: orders.map(presentAdminOrder) };
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
    const [rows] = await connection.execute<AdminOrderRow[]>('SELECT ' + adminOrderColumns + ' FROM digimium_orders WHERE id = ? FOR UPDATE', [id]);
    const row = rows[0];
    if (!row) throw new CommerceError(404, 'Order not found.');
    if (row.revision !== input.data.revision) throw new CommerceError(409, 'This order changed. Refresh before saving.');
    if (row.rejected_at) throw new CommerceError(409, 'A rejected order cannot be approved. Edit its customer note instead.');
    const snapshot: OrderSnapshot = JSON.parse(row.snapshot);
    const grants = new Set(input.data.lines.map(line => line.id));
    if (snapshot.lines.length !== input.data.lines.length || !snapshot.lines.every(line => grants.has(line.id))) {
      throw new CommerceError(400, 'Include the dates for every purchased item exactly once.');
    }
    const previous = new Map(decryptFulfillment(row).map(line => [line.id, line]));
    const lines = input.data.lines.map(({ id, startDate, endDate, accountInfo, accountDetails }) => {
      const saved = previous.get(id)?.accountInfo || '';
      if (accountInfo && accountInfo !== saved) {
        throw new CommerceError(400, 'Use the optional Account, Password, Manager and Username fields.');
      }
      // Omission means a date-only edit; an explicit empty object clears these fields.
      const details = accountDetails ?? previous.get(id)?.accountDetails;
      const hasDetails = details && Object.values(details).some(value => value.length > 0);
      return { id, startDate, endDate, accountInfo: saved, ...(hasDetails ? { accountDetails: details } : {}) };
    });
    if (lines.some(line => previous.get(line.id)?.startDate !== line.startDate || previous.get(line.id)?.endDate !== line.endDate)) {
      await connection.execute("DELETE FROM digimium_notifications WHERE order_id = ? AND kind = 'expiry'", [id]);
    }
    row.approved_at ??= new Date().toISOString();
    row.fulfillment = encryptFulfillment(id, fulfillmentOwner(row), lines);
    if (input.data.customerNote !== undefined) row.customer_note = input.data.customerNote;
    row.revision++;
    const order = presentAdminOrder(row);
    await connection.execute('UPDATE digimium_orders SET approved_at = ?, fulfillment = ?, customer_note = ?, revision = ? WHERE id = ?',
      [row.approved_at, row.fulfillment, row.customer_note, row.revision, id]);
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
    const [rows] = await connection.execute<AdminOrderRow[]>('SELECT ' + adminOrderColumns + ' FROM digimium_orders WHERE id = ? FOR UPDATE', [id]);
    const row = rows[0];
    if (!row) throw new CommerceError(404, 'Order not found.');
    if (row.revision !== input.data.revision) throw new CommerceError(409, 'This order changed. Refresh before saving.');
    if (input.data.action === 'reject') {
      if (row.approved_at || row.rejected_at) throw new CommerceError(409, 'Only a pending order can be rejected.');
      row.rejected_at = new Date().toISOString();
    }
    if (input.data.customerNote !== undefined) row.customer_note = input.data.customerNote;
    row.revision++;
    const order = presentAdminOrder(row);
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
