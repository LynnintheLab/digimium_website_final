import type { RowDataPacket } from 'mysql2/promise';
import { CommerceError } from '../lib/commerce-http';
import {
  decodeTelegramHistoryCursor, encodeTelegramHistoryCursor, formatTelegramHistory,
  TELEGRAM_HISTORY_PAGE_LINES, type TelegramHistoryView, type TelegramTrackingLine,
} from '../lib/telegram-history';
import { todayInMyanmar } from '../lib/subscription-term';
import { decryptOrderTermDates, ensureOrders } from './orders';
import { ensureTelegramIdentitySchema } from './telegram-identity';
import { getPool } from './mysql';

type MetadataRow = RowDataPacket & { id: string; customer_id: string; created_at: string; approved_at: string | null; rejected_at: string | null };
type TrackingRow = MetadataRow & { order_reference: string | null; snapshot: string; fulfillment: string | null };
type PurchasedLine = { id: string; productName: string; planName: string | null; duration: string; price: string; quantity: number };
const metadataLimit = 4;

function snapshotOf(raw: string): { lines: PurchasedLine[]; totalMmk: number | null } {
  if (typeof raw !== 'string' || Buffer.byteLength(raw) > 16777215) throw new Error('Invalid order snapshot.');
  const value = JSON.parse(raw) as { lines?: unknown; totalMmk?: unknown } | null;
  if (!value || !Array.isArray(value.lines) || !value.lines.length || value.lines.length > 3000 ||
      !(value.totalMmk === null || (typeof value.totalMmk === 'number' && Number.isSafeInteger(value.totalMmk) && value.totalMmk >= 0))) throw new Error('Invalid order snapshot.');
  const lines = value.lines.map((candidate: unknown) => {
    if (!candidate || typeof candidate !== 'object') throw new Error('Invalid order snapshot.');
    const line = candidate as Record<string, unknown>;
    if (typeof line.id !== 'string' || !/^[a-f0-9-]{36}$/i.test(line.id) || typeof line.productName !== 'string' ||
        !(line.planName === null || typeof line.planName === 'string') || typeof line.duration !== 'string' || typeof line.price !== 'string' ||
        typeof line.quantity !== 'number' || !Number.isSafeInteger(line.quantity) || line.quantity < 1) throw new Error('Invalid order snapshot.');
    // Explicit projection: arbitrary JSON keys can never become bot-visible fields.
    return { id: line.id, productName: line.productName, planName: line.planName, duration: line.duration, price: line.price, quantity: line.quantity } as PurchasedLine;
  });
  return { lines, totalMmk: value.totalMmk as number | null };
}

/** The caller supplies only the verified numeric Telegram sender, never an account or order owner. */
export async function getTelegramHistory(telegramId: string, options: {
  view: TelegramHistoryView; cursor?: string; now?: Date;
}): Promise<{ linked: boolean; text: string; nextCursor?: string }> {
  const numericId = Number(telegramId);
  if (!/^[1-9]\d{0,15}$/.test(telegramId) || !Number.isSafeInteger(numericId) || numericId > 2 ** 52 - 1 || !['history', 'plans'].includes(options.view)) throw new CommerceError(400, 'invalid');
  let cursor: ReturnType<typeof decodeTelegramHistoryCursor> | undefined;
  try { if (options.cursor !== undefined) cursor = decodeTelegramHistoryCursor(options.cursor); }
  catch { throw new CommerceError(400, 'invalid'); }
  const today = todayInMyanmar(options.now ?? new Date());
  await ensureTelegramIdentitySchema();
  const pool = getPool();
  const [owners] = await pool.execute<RowDataPacket[]>(
    'SELECT 1 FROM digimium_telegram_identities t JOIN digimium_customers c ON c.id = t.customer_id WHERE t.telegram_id = ? LIMIT 1', [telegramId],
  );
  if (!owners.length) return { linked: false, text: formatTelegramHistory({ linked: false, view: options.view, lines: [], today }) };
  await ensureOrders();
  const filters = ['t.telegram_id = ?'];
  const parameters: (string | number)[] = [telegramId];
  if (options.view === 'plans') filters.push('o.approved_at IS NOT NULL AND o.rejected_at IS NULL');
  if (cursor) {
    filters.push(`(o.created_at < ? OR (o.created_at = ? AND o.id ${cursor.line === 3000 ? '<' : '<='} ?))`);
    parameters.push(cursor.createdAt, cursor.createdAt, cursor.orderId);
  }
  // Fetch only small position records first; large encrypted payloads are then read one order at a time.
  const [metadata] = await pool.execute<MetadataRow[]>(
    `SELECT o.id, o.customer_id, o.created_at, o.approved_at, o.rejected_at FROM digimium_orders o
     JOIN digimium_telegram_identities t ON t.customer_id = o.customer_id
     WHERE ${filters.join(' AND ')} ORDER BY o.created_at DESC, o.id DESC LIMIT ${metadataLimit}`, parameters,
  );
  const page: TelegramTrackingLine[] = [];
  let nextCursor: string | undefined;
  for (let index = 0; index < metadata.length; index++) {
    const position = metadata[index];
    const [details] = await pool.execute<TrackingRow[]>(
      `SELECT o.id, o.customer_id, o.created_at, o.approved_at, o.rejected_at, o.order_reference, o.snapshot, o.fulfillment
       FROM digimium_orders o
       JOIN digimium_telegram_identities t ON t.customer_id = o.customer_id
       WHERE t.telegram_id = ? AND o.id = ?${options.view === 'plans' ? ' AND o.approved_at IS NOT NULL AND o.rejected_at IS NULL' : ''} LIMIT 1`, [telegramId, position.id],
    );
    if (!details[0]) continue;
    const row = details[0], snapshot = snapshotOf(row.snapshot);
    const approved = !!row.approved_at && !row.rejected_at;
    const terms = new Map((approved ? decryptOrderTermDates({ ...row, guest_key: null }) : []).map(term => [term.id, term]));
    const start = cursor?.orderId === row.id && cursor.createdAt === row.created_at ? cursor.line : 0;
    const take = Math.min(TELEGRAM_HISTORY_PAGE_LINES - page.length, Math.max(0, snapshot.lines.length - start));
    for (const line of snapshot.lines.slice(start, start + take)) {
      const term = terms.get(line.id);
      page.push({ orderId: row.id, orderReference: row.order_reference,
        createdAt: row.created_at, status: row.rejected_at ? 'rejected' : approved ? 'approved' : 'pending', totalMmk: snapshot.totalMmk,
        productName: line.productName, planName: line.planName, duration: line.duration, price: line.price, quantity: line.quantity,
        startDate: term?.startDate ?? null, endDate: term?.endDate ?? null });
    }
    if (start + take < snapshot.lines.length) {
      nextCursor = encodeTelegramHistoryCursor({ orderId: row.id, createdAt: row.created_at, line: start + take });
      break;
    }
    if (page.length === TELEGRAM_HISTORY_PAGE_LINES) {
      const next = metadata[index + 1];
      if (next) nextCursor = encodeTelegramHistoryCursor({ orderId: next.id, createdAt: next.created_at, line: 0 });
      else if (metadata.length === metadataLimit) nextCursor = encodeTelegramHistoryCursor({ orderId: row.id, createdAt: row.created_at, line: 3000 });
      break;
    }
  }
  // If records disappeared between the bounded reads, keep advancing rather than hiding older orders.
  if (!nextCursor && page.length < TELEGRAM_HISTORY_PAGE_LINES && metadata.length === metadataLimit) {
    const last = metadata.at(-1)!;
    nextCursor = encodeTelegramHistoryCursor({ orderId: last.id, createdAt: last.created_at, line: 3000 });
  }
  return { linked: true, text: formatTelegramHistory({ linked: true, view: options.view, lines: page, today, hasMore: !!nextCursor }), ...(nextCursor ? { nextCursor } : {}) };
}
