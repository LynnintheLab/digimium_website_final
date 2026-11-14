import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { RowDataPacket } from 'mysql2/promise';
import { z } from 'zod';
import { resolveOrder, totalMmk, type CartItem } from '../lib/cart-order';
import { decodeSnapshot, getCatalog } from '../lib/catalog-store';
import type { Catalog } from '../lib/catalog';
import { CommerceError } from '../lib/commerce-http';
import type { CommerceCustomer, CommerceOrder, CommerceOrderLine, OrderFulfillment, TelegramOrder } from '../lib/commerce-types';
import { initialCatalog } from '../lib/initial-catalog';
import { effectivePrice, parseMmk } from '../lib/pricing';
import { resolveTelegramContact } from '../lib/telegram-contact';
import { priceOnEnquiry } from '../lib/shop-language';
import type { CatalogSnapshot } from '../lib/storage-types';
import { ensureCustomerSchema } from './customer-auth';
import { limitGuestCheckout } from './guest-checkout';
import { getPool } from './mysql';

const catalogId = z.string().min(1).max(64).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const itemSchema = z.object({
  productId: catalogId, planId: catalogId.nullable(), quantity: z.number().int().positive().safe(),
}).strict();
const checkoutSchema = z.object({
  requestId: z.string().uuid(), items: z.array(itemSchema).min(1).max(3000),
}).strict();
const guestCheckoutSchema = checkoutSchema.extend({
  guestName: z.string().trim().min(1).max(100).refine(value => !/\p{Cc}/u.test(value)),
});
type CheckoutOwner = { customerId: string; guestKey?: never; guestName?: never } |
  { customerId: null; guestKey: Buffer; guestName: string };

function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000')) return false;
  const date = new Date(value + 'T00:00:00Z');
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
const date = z.string().refine(validDate);
const fulfillmentSchema = z.object({
  revision: z.number().int().positive().max(0xfffffffe),
  lines: z.array(z.object({ id: z.string().uuid(), startDate: date, endDate: date, accountInfo: z.string().max(4000).optional() })
    .strict().refine(line => line.endDate >= line.startDate)).min(1).max(3000),
}).strict();

type PurchasedLine = Omit<CommerceOrderLine, 'startDate' | 'endDate' | 'accountInfo'>;
type OrderSnapshot = { lines: PurchasedLine[]; totalMmk: number | null };
interface OrderRow extends RowDataPacket {
  id: string;
  customer_id: string | null;
  guest_key: Buffer | null;
  guest_name: string | null;
  created_at: string;
  approved_at: string | null;
  revision: number;
  snapshot: string;
  fulfillment: string | null;
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
}
function ensureOrders() {
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
function fulfillmentOwner(row: OrderRow) {
  return row.customer_id ?? 'guest:' + row.guest_key!.toString('hex');
}
function encryptFulfillment(id: string, owner: string, lines: OrderFulfillment[]) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', fulfillmentKey(), iv);
  cipher.setAAD(Buffer.from(id + '/' + owner));
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(lines), 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString('base64');
}
function decryptFulfillment(row: OrderRow): OrderFulfillment[] {
  if (!row.fulfillment) return [];
  const envelope = Buffer.from(row.fulfillment, 'base64');
  const decipher = createDecipheriv('aes-256-gcm', fulfillmentKey(), envelope.subarray(0, 12));
  decipher.setAuthTag(envelope.subarray(12, 28));
  decipher.setAAD(Buffer.from(row.id + '/' + fulfillmentOwner(row)));
  const plaintext = Buffer.concat([decipher.update(envelope.subarray(28)), decipher.final()]);
  return JSON.parse(plaintext.toString('utf8'));
}

function present(row: OrderRow): CommerceOrder {
  const snapshot: OrderSnapshot = JSON.parse(row.snapshot);
  const delivery = new Map(decryptFulfillment(row).map(line => [line.id, line]));
  return {
    id: row.id, customerId: row.customer_id, createdAt: row.created_at, approvedAt: row.approved_at,
    ...(row.guest_name ? { guestName: row.guest_name } : {}),
    status: row.approved_at ? 'approved' : 'pending', revision: row.revision, totalMmk: snapshot.totalMmk,
    lines: snapshot.lines.map(line => {
      const grant = delivery.get(line.id);
      return { ...line, startDate: grant?.startDate ?? null, endDate: grant?.endDate ?? null, accountInfo: grant?.accountInfo ?? '' };
    }),
  };
}

function snapshotCart(items: CartItem[], catalog: Catalog): OrderSnapshot {
  const rows = resolveOrder(items, catalog.products);
  if (rows.length !== items.length) throw new CommerceError(409, 'A selected offer is no longer available or appears twice. Review your cart.');
  const lines = rows.map(({ product, plan, productId, planId, quantity }) => {
    const offer = plan ?? product;
    const currentPrice = effectivePrice(offer);
    return { id: randomUUID(), productId, productName: product.name, planId, planName: plan?.name ?? null,
      price: priceOnEnquiry(currentPrice) ? '' : currentPrice, duration: offer.duration, quantity };
  });
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
    'SELECT id, request_hash, snapshot FROM digimium_orders WHERE ' + (owner.customerId ? 'customer_id' : 'guest_key') + ' = ? AND request_id = ?',
    [owner.customerId ?? owner.guestKey, requestId],
  );
  if (!rows.length) return null;
  if (!hash.equals(rows[0].request_hash)) throw new CommerceError(409, 'This checkout was already submitted with different items.');
  return { order: telegramOrder(rows[0].id, JSON.parse(rows[0].snapshot)), telegram: await currentOrderContact(), created: false };
}

export async function submitOrder(customerId: string, body: unknown) {
  const input = checkoutSchema.safeParse(body);
  if (!input.success) throw new CommerceError(400, 'Select valid items and quantities before submitting your order.');
  return storeOrder({ customerId }, input.data);
}

export async function submitGuestOrder(guestKey: Buffer, body: unknown, request: Request) {
  const input = guestCheckoutSchema.safeParse(body);
  if (!input.success) throw new CommerceError(400, 'Enter a name of up to 100 characters and select valid items.');
  return storeOrder({ customerId: null, guestKey, guestName: input.data.guestName }, input.data, request);
}

async function storeOrder(owner: CheckoutOwner, input: z.infer<typeof checkoutSchema>, request?: Request) {
  const { items, requestId } = input;
  const canonical = JSON.stringify(items.map(item => [item.productId, item.planId, item.quantity]));
  const hash = createHash('sha256').update(owner.customerId ? canonical : owner.guestName + '\n' + canonical).digest();
  await ensureOrders();
  const existing = await existingCheckout(owner, requestId, hash);
  if (existing) return existing;
  if (owner.guestKey && request) await limitGuestCheckout(request, owner.guestKey);

  const connection = await getPool().getConnection();
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
    await connection.commit();
    return { order: telegramOrder(id, snapshot), telegram, created: true };
  } catch (error) {
    await connection.rollback();
    if (!(error instanceof Error && 'code' in error && error.code === 'ER_DUP_ENTRY')) throw error;
  } finally {
    connection.release();
  }
  // A simultaneous retry can win the unique key while this transaction is in flight.
  const winner = await existingCheckout(owner, requestId, hash);
  if (!winner) throw new Error('Checkout collision.');
  return winner;
}

const orderColumns = 'id, customer_id, guest_key, guest_name, created_at, approved_at, revision, snapshot, fulfillment';

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
    pool.query<(CommerceCustomer & RowDataPacket)[]>(
      "SELECT id, name, email, DATE_FORMAT(created_at, '%Y-%m-%dT%H:%i:%s.%fZ') AS createdAt FROM digimium_customers ORDER BY created_at DESC, id",
    ),
    pool.query<OrderRow[]>('SELECT ' + orderColumns + ' FROM digimium_orders ORDER BY created_at DESC, id'),
  ]);
  return { customers, orders: orders.map(present) };
}

export async function saveFulfillment(id: string, body: unknown) {
  if (!z.string().uuid().safeParse(id).success) throw new CommerceError(404, 'Order not found.');
  const input = fulfillmentSchema.safeParse(body);
  if (!input.success) throw new CommerceError(400, 'Enter valid start and end dates for every item.');
  await ensureOrders();
  const connection = await getPool().getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.execute<OrderRow[]>('SELECT ' + orderColumns + ' FROM digimium_orders WHERE id = ? FOR UPDATE', [id]);
    const row = rows[0];
    if (!row) throw new CommerceError(404, 'Order not found.');
    if (row.revision !== input.data.revision) throw new CommerceError(409, 'This order changed. Refresh before saving.');
    const snapshot: OrderSnapshot = JSON.parse(row.snapshot);
    const grants = new Set(input.data.lines.map(line => line.id));
    if (snapshot.lines.length !== input.data.lines.length || !snapshot.lines.every(line => grants.has(line.id))) {
      throw new CommerceError(400, 'Include the dates for every purchased item exactly once.');
    }
    const previous = new Map(decryptFulfillment(row).map(line => [line.id, line.accountInfo]));
    const lines = input.data.lines.map(({ id, startDate, endDate, accountInfo }) => {
      const saved = previous.get(id) || '';
      if (accountInfo && accountInfo !== saved) {
        throw new CommerceError(400, 'Send purchased account details to the customer on Telegram.');
      }
      return { id, startDate, endDate, accountInfo: saved };
    });
    row.approved_at ??= new Date().toISOString();
    row.fulfillment = encryptFulfillment(id, fulfillmentOwner(row), lines);
    row.revision++;
    const order = present(row);
    await connection.execute('UPDATE digimium_orders SET approved_at = ?, fulfillment = ?, revision = ? WHERE id = ?',
      [row.approved_at, row.fulfillment, row.revision, id]);
    await connection.commit();
    return order;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}
