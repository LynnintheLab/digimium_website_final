import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { z } from 'zod';
import { CommerceError } from '../lib/commerce-http';
import type { CustomerNotification, CustomerNotificationPage } from '../lib/notification-types';
import { normalizeNotificationActionLabel, normalizeNotificationActionUrl } from '../lib/notification-action';
import { getSubscriptionTerm, todayInMyanmar } from '../lib/subscription-term';
import { getPool } from './mysql';

const uuid = z.string().uuid();
const message = z.string().max(1000).transform(value => value.replace(/\r\n?/g, '\n').trim())
  .refine(value => value.length > 0 && !/[\p{Cc}\u202a-\u202e\u2066-\u2069]/u.test(value.replace(/\n/g, '')));
const actionSchema = z.object({
  label: z.string().transform(normalizeNotificationActionLabel).refine(value => value !== null),
  url: z.string().transform(normalizeNotificationActionUrl).refine(value => value !== null),
}).strict();
const sendSchema = z.object({ requestId: uuid, message, action: actionSchema.nullish() }).strict();
const readSchema = z.union([
  z.object({ ids: z.array(uuid).min(1).max(20) }).strict(), z.object({ all: z.literal(true) }).strict(),
]);
let ready: Promise<void> | undefined;

/** DB-only bootstrap. Customer creation calls this after its own schema, never recursively. */
export function ensureNotifications(): Promise<void> {
  return ready ??= (async () => {
    const sql = await readFile(join(process.cwd(), 'hostinger', 'notification-schema.sql'), 'utf8');
    for (const statement of sql.split(';').filter(value => value.trim())) await getPool().query(statement);
    // Independently guarded nullable additions preserve old rows and partial migrations.
    for (const [column, definition] of [['action_label', 'VARCHAR(60) NULL'], ['action_url', 'VARCHAR(2048) NULL']]) {
      try { await getPool().query(`SELECT ${column} FROM digimium_notifications LIMIT 0`); }
      catch (error) {
        if (!(error instanceof Error && 'code' in error && error.code === 'ER_BAD_FIELD_ERROR')) throw error;
        try { await getPool().query(`ALTER TABLE digimium_notifications ADD ${column} ${definition}`); }
        catch (migrationError) {
          if (!(migrationError instanceof Error && 'code' in migrationError && migrationError.code === 'ER_DUP_FIELDNAME')) throw migrationError;
        }
        await getPool().query(`SELECT ${column} FROM digimium_notifications LIMIT 0`);
      }
    }
  })().catch(error => { ready = undefined; throw error; });
}

type NotificationRow = RowDataPacket & {
  id: string; kind: 'message' | 'expiry'; title: string; body: string; body_my: string | null;
  order_id: string | null; createdAt: string; readAt: string | null;
  action_label: string | null; action_url: string | null;
};
const columns = `id, kind, title, body, body_my, order_id, action_label, action_url,
  DATE_FORMAT(created_at, '%Y-%m-%dT%H:%i:%s.%fZ') AS createdAt,
  DATE_FORMAT(read_at, '%Y-%m-%dT%H:%i:%s.%fZ') AS readAt`;
function present(row: NotificationRow): CustomerNotification {
  // Validate persisted values too, so legacy/manual bad data never becomes an unsafe link.
  const label = row.action_label ? normalizeNotificationActionLabel(row.action_label) : null;
  const url = row.action_url ? normalizeNotificationActionUrl(row.action_url) : null;
  return { id: row.id, type: row.kind, title: row.title, body: row.body,
    ...(row.body_my ? { bodyMy: row.body_my } : {}), ...(row.order_id ? { orderId: row.order_id } : {}),
    ...(label && url && row.kind === 'message' ? { action: { label, url } } : {}),
    createdAt: new Date(row.createdAt).toISOString(), readAt: row.readAt ? new Date(row.readAt).toISOString() : null };
}
function customerId(id: string) {
  if (!uuid.safeParse(id).success) throw new CommerceError(404, 'Customer not found.');
  return id;
}
async function assertCustomer(id: string, connection?: PoolConnection, lock = false) {
  const [rows] = await (connection ?? getPool()).execute<RowDataPacket[]>(
    'SELECT id FROM digimium_customers WHERE id = ?' + (lock ? ' FOR UPDATE' : ''), [customerId(id)],
  );
  if (!rows.length) throw new CommerceError(404, 'Customer not found.');
}
async function unreadCount(id: string) {
  const [rows] = await getPool().execute<(RowDataPacket & { total: number })[]>(
    'SELECT COUNT(*) AS total FROM digimium_notifications WHERE customer_id = ? AND read_at IS NULL', [id],
  );
  return Number(rows[0].total);
}
function decodeCursor(raw: string | null) {
  if (raw === null) return null;
  try {
    if (!/^[A-Za-z0-9_-]{1,240}$/.test(raw)) throw new Error();
    const decoded = Buffer.from(raw, 'base64url').toString('utf8');
    if (Buffer.from(decoded).toString('base64url') !== raw) throw new Error();
    const cursor = JSON.parse(decoded);
    if (!Array.isArray(cursor) || cursor.length !== 2 || typeof cursor[0] !== 'string' || cursor[0].length !== 24
      || new Date(cursor[0]).toISOString() !== cursor[0] || !uuid.safeParse(cursor[1]).success) throw new Error();
    return { time: cursor[0].slice(0, 23).replace('T', ' '), id: cursor[1] as string };
  } catch { throw new CommerceError(400, 'Choose a valid notification page.'); }
}

export async function customerNotifications(id: string, cursorRaw: string | null = null): Promise<CustomerNotificationPage> {
  customerId(id); const cursor = decodeCursor(cursorRaw); await ensureNotifications();
  const values = cursor ? [id, cursor.time, cursor.time, cursor.id] : [id];
  const [rows] = await getPool().execute<NotificationRow[]>(
    `SELECT ${columns} FROM digimium_notifications WHERE customer_id = ?
     ${cursor ? 'AND (created_at < ? OR (created_at = ? AND id < ?))' : ''}
     ORDER BY created_at DESC, id DESC LIMIT 21`, values,
  );
  const notifications = rows.slice(0, 20).map(present), last = notifications.at(-1);
  return { notifications, unreadCount: await unreadCount(id), nextCursor: rows.length > 20 && last
    ? Buffer.from(JSON.stringify([last.createdAt, last.id])).toString('base64url') : null };
}

export async function readCustomerNotifications(id: string, body: unknown) {
  customerId(id); const input = readSchema.safeParse(body);
  if (!input.success) throw new CommerceError(400, 'Choose notifications to mark as read.');
  await ensureNotifications();
  const ids = 'ids' in input.data ? input.data.ids : null;
  await getPool().execute(`UPDATE digimium_notifications SET read_at = COALESCE(read_at, UTC_TIMESTAMP(3))
    WHERE customer_id = ?${ids ? ' AND id IN (' + ids.map(() => '?').join(',') + ')' : ''}`, [id, ...(ids ?? [])]);
  return { unreadCount: await unreadCount(id) };
}

export async function adminCustomerNotifications(id: string, cursor: string | null = null) {
  await assertCustomer(id); return customerNotifications(id, cursor);
}

export async function sendCustomerNotification(id: string, body: unknown) {
  customerId(id); const input = sendSchema.safeParse(body);
  if (!input.success) throw new CommerceError(400, 'Enter a message of at most 1,000 characters. An optional button needs a label of at most 60 characters and a valid HTTPS or store link.');
  const actionLabel = input.data.action?.label ?? null, actionUrl = input.data.action?.url ?? null;
  await ensureNotifications(); const connection = await getPool().getConnection();
  try {
    await connection.beginTransaction(); await assertCustomer(id, connection, true);
    const dedupe = 'message:' + input.data.requestId;
    const [existing] = await connection.execute<NotificationRow[]>(
      `SELECT ${columns} FROM digimium_notifications WHERE customer_id = ? AND dedupe_key = ?`, [id, dedupe],
    );
    if (existing[0]) {
      if (existing[0].body !== input.data.message || existing[0].action_label !== actionLabel || existing[0].action_url !== actionUrl) {
        throw new CommerceError(409, 'This message request was already sent with different text or button.');
      }
      await connection.commit(); return { notification: present(existing[0]), created: false };
    }
    const [recent] = await connection.execute<(RowDataPacket & { total: number })[]>(
      "SELECT COUNT(*) AS total FROM digimium_notifications WHERE customer_id = ? AND kind = 'message' AND created_at >= DATE_SUB(UTC_TIMESTAMP(3), INTERVAL 1 HOUR)", [id],
    );
    if (Number(recent[0].total) >= 20) throw new CommerceError(429, 'Wait before sending more messages to this customer.');
    const notificationId = randomUUID();
    await connection.execute(`INSERT INTO digimium_notifications
      (id, customer_id, dedupe_key, kind, title, body, action_label, action_url, created_at)
      VALUES (?, ?, ?, 'message', 'Message from Digimium', ?, ?, ?, UTC_TIMESTAMP(3))`,
    [notificationId, id, dedupe, input.data.message, actionLabel, actionUrl]);
    const [rows] = await connection.execute<NotificationRow[]>(`SELECT ${columns} FROM digimium_notifications WHERE id = ?`, [notificationId]);
    await connection.commit(); return { notification: present(rows[0]), created: true };
  } catch (error) { await connection.rollback(); throw error; }
  finally { connection.release(); }
}

const creationAlert = z.object({
  kind: z.enum(['order-created', 'customer-created']), dedupeKey: z.string().min(1).max(200).regex(/^[a-zA-Z0-9:_-]+$/), entityId: uuid,
  customerName: z.string().max(200).optional(), authProvider: z.enum(['email', 'google', 'telegram']).optional(),
  orderReference: z.string().max(40).optional(), productSummary: z.string().max(350).optional(),
  totalMmk: z.number().int().nonnegative().safe().nullable().optional(),
}).strict();
const proofAlert = z.object({
  kind: z.literal('payment-proof-submitted'), dedupeKey: creationAlert.shape.dedupeKey, entityId: uuid,
  orderReference: z.string().max(40), proofRequestId: uuid, demo: z.boolean(),
  paymentMethod: z.enum(['kpay', 'aya', 'wave', 'binance']), paymentAmount: z.string().max(32).regex(/^\d+(?:\.\d{2})?$/),
  paymentCurrency: z.enum(['MMK', 'USDT']),
}).strict();
const alertSchema = z.discriminatedUnion('kind', [creationAlert, proofAlert]);
export type NotificationAlertInput = z.infer<typeof alertSchema>;

const topicKeys = {
  'payment-proof-submitted': 'ORDER_ALERTS_TELEGRAM_PAYMENT_TOPIC_ID',
  'order-created': 'ORDER_ALERTS_TELEGRAM_ORDERS_TOPIC_ID',
  'customer-created': 'ORDER_ALERTS_TELEGRAM_REGISTRATION_TOPIC_ID',
} as const;
const orderBotKeys = ['ORDER_ALERTS_TELEGRAM_BOT_TOKEN', 'ORDER_ALERTS_TELEGRAM_CHAT_ID', ...Object.values(topicKeys)];
function orderBotRoutingEnabled() {
  return /^https:\/\/test\.buywith-digimium\.store\/?$/.test(process.env.APP_ORIGIN ?? '') ||
    orderBotKeys.some(key => Boolean(process.env[key]?.trim()));
}

/** Transactional insert only: missing Telegram configuration never affects this operation. */
export async function enqueueNotificationAlert(connection: PoolConnection, candidate: NotificationAlertInput): Promise<void> {
  const payload = alertSchema.parse(candidate);
  await connection.execute(`INSERT IGNORE INTO digimium_notification_outbox
    (id, dedupe_key, kind, entity_id, payload, created_at, next_attempt_at)
    VALUES (?, ?, ?, ?, ?, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))`,
  [randomUUID(), payload.dedupeKey, payload.kind === 'payment-proof-submitted' || orderBotRoutingEnabled() ? 'bot:' + payload.kind : payload.kind,
    payload.entityId, JSON.stringify(payload)]);
}

function privateId(value: string | undefined) {
  const id = value?.trim();
  return id && /^[1-9]\d{0,15}$/.test(id) && Number(id) <= 2 ** 52 - 1 ? id : null;
}

type AlertConfig = { token: string; chat: string; topics?: Record<NotificationAlertInput['kind'], number> };

function telegramConfiguration(): AlertConfig | null {
  if (orderBotRoutingEnabled()) {
    const token = process.env.ORDER_ALERTS_TELEGRAM_BOT_TOKEN?.trim();
    const chat = privateId(process.env.ORDER_ALERTS_TELEGRAM_CHAT_ID);
    const topics = Object.fromEntries(Object.entries(topicKeys).map(([kind, key]) => [kind, Number(privateId(process.env[key]))])) as NonNullable<AlertConfig['topics']>;
    const topicIds = Object.values(topics);
    if (!token || !/^\d{1,16}:[A-Za-z0-9_-]{20,200}$/.test(token) || !chat ||
      token === process.env.TELEGRAM_BOT_TOKEN?.trim() || token === process.env.ADMIN_TELEGRAM_BOT_TOKEN?.trim() ||
      topicIds.some(id => id < 2 || id > 0x7fffffff) || new Set(topicIds).size !== topicIds.length) return null;
    return { token, chat, topics };
  }
  const token = process.env.ADMIN_TELEGRAM_BOT_TOKEN?.trim() || process.env.TELEGRAM_BOT_TOKEN?.trim();
  const chat = privateId(process.env.ADMIN_TELEGRAM_CHAT_ID);
  return token && token.length <= 256 && chat ? { token, chat } : null;
}
function cleanAlert(value: string | undefined, maximum: number) {
  const clean = (value ?? '').replace(/[\p{Cc}\u202a-\u202e\u2066-\u2069]/gu, ' ')
    .replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/gu, '');
  let result = '';
  for (const point of clean) { if (result.length + point.length > maximum) break; result += point; }
  return result.trim();
}
function alertText(payload: NotificationAlertInput, dedicated: boolean) {
  if (payload.kind === 'payment-proof-submitted') {
    const methods = { kpay: 'KPay', aya: 'AYA Pay', wave: 'Wave Pay', binance: 'Binance Pay' };
    return [payload.demo ? 'Demo payment proof — review required' : 'Payment proof — review required',
      'Order #' + cleanAlert(payload.orderReference, 40),
      `${methods[payload.paymentMethod]} · ${payload.paymentAmount} ${payload.paymentCurrency}`].join('\n');
  }
  const rows = [payload.kind === 'order-created' ? 'New Digimium order' : 'New Digimium customer',
    payload.kind === 'order-created' ? 'Order #' + cleanAlert(payload.orderReference || payload.entityId.slice(0, 8).toUpperCase(), 40) : 'Account #' + payload.entityId.slice(0, 8).toUpperCase()];
  if (!dedicated && payload.customerName) rows.push('Name: ' + cleanAlert(payload.customerName, 100));
  if (payload.authProvider) rows.push('Sign-in: ' + payload.authProvider);
  if (payload.productSummary) rows.push('Items: ' + cleanAlert(payload.productSummary, 350));
  if (payload.kind === 'order-created') rows.push('Total: ' + (payload.totalMmk === null || payload.totalMmk === undefined ? 'Price on request' : payload.totalMmk.toLocaleString('en-US') + ' MMK'));
  return rows.join('\n');
}

function adminAlertLink(payload: NotificationAlertInput) {
  let url: URL;
  try { url = new URL(process.env.APP_ORIGIN ?? ''); } catch { return; }
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) return;
  url.pathname = '/admin';
  if (payload.kind === 'customer-created') url.searchParams.set('section', 'customers');
  else url.searchParams.set('order', payload.entityId);
  return { inline_keyboard: [[{ text: payload.kind === 'payment-proof-submitted' ? 'Review in Admin' : 'Open Admin', url: url.href }]] };
}

async function alertCancellation(payload: NotificationAlertInput) {
  if (payload.kind !== 'payment-proof-submitted') {
    const [rows] = await getPool().execute<RowDataPacket[]>(payload.kind === 'customer-created'
      ? 'SELECT id FROM digimium_customers WHERE id = ?' : 'SELECT id FROM digimium_orders WHERE id = ?', [payload.entityId]);
    return rows.length ? null : 'entity-removed';
  }
  const [rows] = await getPool().execute<(RowDataPacket & { checkout_state: string | null; rejected_at: string | null; approved_at: string | null })[]>(
    'SELECT checkout_state, rejected_at, approved_at FROM digimium_orders WHERE id = ?', [payload.entityId]);
  if (!rows.length) return 'entity-removed';
  const row = rows[0];
  const checkout = row.checkout_state ? JSON.parse(row.checkout_state) : null;
  return row.rejected_at || row.approved_at || checkout?.stage !== 'payment_review' ||
    checkout.payment?.proofUrl !== `/api/customer/orders/${payload.entityId}/proof?version=${payload.proofRequestId}`
    ? 'proof-superseded' : null;
}

/** Bounded, leased outbox delivery; invoke only after the creation transaction has committed. */
export async function drainAdminNotificationAlerts(options: { limit?: number; budgetMs?: number; dedupeKey?: string } = {}) {
  const config = telegramConfiguration();
  if (!config) return { sent: 0, failed: 0, configured: false };
  await ensureNotifications();
  const limit = Math.min(5, Math.max(1, Math.floor(options.limit ?? 1)));
  const deadline = Date.now() + Math.min(5000, Math.max(250, options.budgetMs ?? 2000));
  let sent = 0, failed = 0;
  for (let index = 0; index < limit && Date.now() < deadline; index++) {
    const connection = await getPool().getConnection();
    let row: (RowDataPacket & { id: string; payload: string; attempts: number }) | undefined;
    const lease = randomBytes(16);
    try {
      await connection.beginTransaction();
      const [rows] = await connection.execute<(RowDataPacket & { id: string; payload: string; attempts: number })[]>(
        `SELECT id, payload, attempts FROM digimium_notification_outbox WHERE sent_at IS NULL AND cancelled_at IS NULL AND attempts < 5
         AND ${config.topics ? "kind LIKE 'bot:%'" : "kind IN ('order-created', 'customer-created')"}
         ${options.dedupeKey ? 'AND dedupe_key = ?' : ''}
         AND next_attempt_at <= UTC_TIMESTAMP(3) AND (lease_until IS NULL OR lease_until < UTC_TIMESTAMP(3))
         ORDER BY created_at, id LIMIT 1 FOR UPDATE SKIP LOCKED`,
        options.dedupeKey ? [options.dedupeKey] : [],
      );
      row = rows[0];
      if (row) await connection.execute(`UPDATE digimium_notification_outbox SET lease_token = ?,
        lease_until = DATE_ADD(UTC_TIMESTAMP(3), INTERVAL 60 SECOND), attempts = attempts + 1 WHERE id = ?`, [lease, row.id]);
      await connection.commit();
    } catch (error) { await connection.rollback(); throw error; }
    finally { connection.release(); }
    if (!row) break;
    let ok = false;
    try {
      const payload = alertSchema.parse(JSON.parse(row.payload));
      const cancellation = await alertCancellation(payload);
      if (cancellation) {
        // Erased entities must not cause a delayed alert or retain their copied display data.
        await getPool().execute(`UPDATE digimium_notification_outbox SET cancelled_at = UTC_TIMESTAMP(3), payload = '{}',
          lease_token = NULL, lease_until = NULL, last_error = ? WHERE id = ? AND lease_token = ?`, [cancellation, row.id, lease]);
        continue;
      }
      const response = await fetch('https://api.telegram.org/bot' + config.token + '/sendMessage', {
        method: 'POST', redirect: 'error', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: config.chat, text: alertText(payload, Boolean(config.topics)), link_preview_options: { is_disabled: true },
          ...(config.topics ? { message_thread_id: config.topics[payload.kind], protect_content: true, reply_markup: adminAlertLink(payload) } : {}) }),
        signal: AbortSignal.timeout(Math.max(1, Math.min(2000, deadline - Date.now()))),
      });
      // Telegram can return HTTP 200 with ok:false. Bound the response before parsing.
      const reader = response.body?.getReader(); let text = '', bytes = 0;
      if (reader) {
        const decoder = new TextDecoder();
        try {
          for (;;) {
            const part = await reader.read(); if (part.done) break;
            bytes += part.value.byteLength;
            if (bytes > 16384) { await reader.cancel(); throw new Error('Oversized delivery response.'); }
            text += decoder.decode(part.value, { stream: true });
          }
          text += decoder.decode();
        } finally { reader.releaseLock(); }
      }
      ok = response.ok && text.length <= 16384 && JSON.parse(text)?.ok === true;
    } catch { /* Store only a fixed error class; never a token, URL, body or provider response. */ }
    if (ok) {
      await getPool().execute(`UPDATE digimium_notification_outbox SET sent_at = UTC_TIMESTAMP(3),
        lease_token = NULL, lease_until = NULL, last_error = NULL WHERE id = ? AND lease_token = ?`, [row.id, lease]); sent++;
    } else {
      const seconds = Math.min(3600, 60 * 2 ** Math.min(5, row.attempts));
      await getPool().execute(`UPDATE digimium_notification_outbox SET lease_token = NULL, lease_until = NULL,
        next_attempt_at = DATE_ADD(UTC_TIMESTAMP(3), INTERVAL ? SECOND), last_error = 'delivery-failed' WHERE id = ? AND lease_token = ?`, [seconds, row.id, lease]); failed++;
    }
  }
  return { sent, failed, configured: true };
}

type ExpiryRow = RowDataPacket & { id: string; customer_id: string; guest_key: null; snapshot: string; fulfillment: string | null };
type ScanRow = RowDataPacket & { cursor_id: string | null; cursor_line: number; scan_day: string | null };

/** Small resumable batches. Every reminder key binds order, line, end date and 3/1-day threshold. */
export async function createExpiryNotifications(now = new Date()) {
  const { decryptOrderTermDates, ensureOrders } = await import('./orders');
  await ensureNotifications(); await ensureOrders();
  const today = todayInMyanmar(now), connection = await getPool().getConnection();
  let created = 0, ordersScanned = 0, linesScanned = 0, invalidOrders = 0;
  try {
    await connection.beginTransaction();
    await connection.execute("INSERT IGNORE INTO digimium_notification_jobs (name) VALUES ('expiry')");
    const [states] = await connection.execute<ScanRow[]>("SELECT cursor_id, cursor_line, scan_day FROM digimium_notification_jobs WHERE name = 'expiry' FOR UPDATE");
    let cursor = states[0].scan_day === today ? states[0].cursor_id : null;
    let offset = states[0].scan_day === today ? Number(states[0].cursor_line) : 0;
    while (ordersScanned < 20 && linesScanned < 300) {
      const [rows] = await connection.execute<ExpiryRow[]>(`SELECT id, customer_id, guest_key, snapshot, fulfillment
        FROM digimium_orders WHERE customer_id IS NOT NULL AND approved_at IS NOT NULL AND rejected_at IS NULL
        ${cursor ? 'AND id ' + (offset ? '>=' : '>') + ' ?' : ''} ORDER BY id LIMIT 1 FOR UPDATE`, cursor ? [cursor] : []);
      const row = rows[0];
      if (!row) { cursor = null; offset = 0; break; }
      if (cursor !== row.id) offset = 0;
      ordersScanned++; cursor = row.id;
      let lines: { id: string; productName: string; planName: string | null }[];
      let terms: Map<string, { id: string; startDate: string | null; endDate: string | null }>;
      try {
        const parsed = JSON.parse(row.snapshot) as { lines?: unknown } | null;
        if (!parsed || !Array.isArray(parsed.lines) || !parsed.lines.length || parsed.lines.length > 3000
          || !parsed.lines.every(line => line && typeof line === 'object' && !Array.isArray(line) && uuid.safeParse(line.id).success)) {
          throw new Error('Invalid order snapshot.');
        }
        lines = parsed.lines as typeof lines;
        terms = new Map(decryptOrderTermDates(row).map(term => [term.id, term]));
      } catch {
        // A damaged legacy record must not permanently block valid reminders behind its cursor.
        invalidOrders++; offset = 0; continue;
      }
      for (; offset < lines.length && linesScanned < 300; offset++) {
        linesScanned++; const line = lines[offset], term = terms.get(line.id);
        const status = getSubscriptionTerm(term?.startDate ?? null, term?.endDate ?? null, today);
        const days = status.endDate && status.status !== 'unknown'
          ? Math.round((Date.parse(status.endDate + 'T00:00:00Z') - Date.parse(today + 'T00:00:00Z')) / 86400000) : null;
        if ((days !== 3 && days !== 1) || !status.endDate) continue;
        const product = cleanAlert(typeof line.productName === 'string' ? line.productName : 'Subscription', 120);
        const plan = cleanAlert(typeof line.planName === 'string' ? line.planName : '', 140);
        const label = [product, plan].filter(Boolean).join(' · ');
        const [inserted] = await connection.execute<ResultSetHeader>(`INSERT IGNORE INTO digimium_notifications
          (id, customer_id, dedupe_key, kind, title, body, body_my, order_id, created_at)
          VALUES (?, ?, ?, 'expiry', 'Subscription ending soon', ?, ?, ?, UTC_TIMESTAMP(3))`,
        [randomUUID(), row.customer_id, `expiry:${row.id}:${line.id}:${status.endDate}:${days}`,
          `${label} ends on ${status.endDate} (${days} ${days === 1 ? 'day' : 'days'} remaining).`,
          `${label} သက်တမ်း ${status.endDate} တွင် ကုန်ဆုံးပါမည်။ ${days} ရက် ကျန်ပါသည်။`, row.id]);
        created += inserted.affectedRows;
      }
      if (offset >= lines.length) offset = 0;
    }
    await connection.execute("UPDATE digimium_notification_jobs SET cursor_id = ?, cursor_line = ?, scan_day = ? WHERE name = 'expiry'", [cursor, offset, today]);
    await connection.commit();
    return { created, ordersScanned, linesScanned, invalidOrders, hasMore: cursor !== null };
  } catch (error) { await connection.rollback(); throw error; }
  finally { connection.release(); }
}

/** The scheduler secret is accepted only in Authorization, never in URLs or logged bodies. */
export function notificationCronAllowed(request: Request) {
  const expected = process.env.NOTIFICATIONS_CRON_SECRET?.trim();
  const supplied = request.headers.get('authorization');
  if (!expected || expected.length < 32 || expected.length > 256 || !supplied?.startsWith('Bearer ')) return false;
  const a = Buffer.from(supplied.slice(7)), b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function runScheduledNotifications() {
  await ensureNotifications();
  await getPool().execute("INSERT IGNORE INTO digimium_notification_jobs (name) VALUES ('runner')");
  const [claimed] = await getPool().execute<ResultSetHeader>(`UPDATE digimium_notification_jobs SET last_run_at = UTC_TIMESTAMP(3)
    WHERE name = 'runner' AND (last_run_at IS NULL OR last_run_at <= DATE_SUB(UTC_TIMESTAMP(3), INTERVAL 30 SECOND))`);
  if (claimed.affectedRows !== 1) throw new CommerceError(429, 'The notification job was run recently. Retry in 30 seconds.');
  return { expiry: await createExpiryNotifications(), alerts: await drainAdminNotificationAlerts({ limit: 5, budgetMs: 5000 }) };
}
