import type { RowDataPacket } from 'mysql2/promise';
import { z } from 'zod';
import { CommerceError } from '../lib/commerce-http';
import type { RunningHubHistoryOrder, RunningHubHistoryPage, RunningHubHistoryStatus } from '../lib/runninghub-history';
import { ensureRunningHub } from './runninghub';
import { getPool } from './mysql';

const uuid = z.string().uuid();
const groups = {
  pending: ['awaiting_payment', 'payment_review'],
  purchased: ['approved'],
  rejected: ['rejected', 'expired'],
} as const;
type Cursor = { createdAt: string; id: string };
type HistoryRow = RowDataPacket & {
  id: string; pack_id: RunningHubHistoryOrder['packId']; pack_label: string; price_mmk: number;
  effective_status: RunningHubHistoryOrder['status']; created_at: string; approved_at: string | null; expires_at: string | null;
};
type CountRow = RowDataPacket & { pending: number | string; purchased: number | string; rejected: number | string };

function invalidPage(): never {
  throw new CommerceError(400, 'Choose a valid Running HUB history page.');
}
function readCursor(raw: string | null, customerId: string, status: RunningHubHistoryStatus): Cursor | null {
  if (raw === null) return null;
  try {
    if (!/^[A-Za-z0-9_-]{1,384}$/.test(raw)) return invalidPage();
    const bytes = Buffer.from(raw, 'base64url');
    if (bytes.toString('base64url') !== raw) return invalidPage();
    const value: unknown = JSON.parse(bytes.toString('utf8'));
    if (!Array.isArray(value) || value.length !== 5 || value[0] !== 1 || value[1] !== customerId || value[2] !== status ||
      typeof value[3] !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value[3]) ||
      new Date(value[3]).toISOString() !== value[3] || !uuid.safeParse(value[4]).success) return invalidPage();
    return { createdAt: value[3], id: value[4] as string };
  } catch { return invalidPage(); }
}
function present(row: HistoryRow): RunningHubHistoryOrder {
  // An explicit allowlist keeps receiver details, proofs, keys and notes out of history previews.
  return { id: row.id, packId: row.pack_id, packLabel: row.pack_label, priceMmk: row.price_mmk,
    status: row.effective_status, createdAt: row.created_at, approvedAt: row.approved_at, expiresAt: row.expires_at };
}

/** Read-only, owner-scoped metadata. Every status tab uses a bounded seek page. */
export async function customerRunningHubHistory(customerId: string, parameters: URLSearchParams): Promise<RunningHubHistoryPage> {
  if (!uuid.safeParse(customerId).success) throw new CommerceError(401, 'Sign in to view your Running HUB history.');
  const rawStatus = parameters.get('status') ?? 'purchased';
  if (!Object.hasOwn(groups, rawStatus)) return invalidPage();
  const status = rawStatus as RunningHubHistoryStatus;
  const rawLimit = parameters.get('limit');
  if (rawLimit !== null && !/^(?:[1-9]|[1-4]\d|50)$/.test(rawLimit)) return invalidPage();
  const limit = rawLimit === null ? 25 : Number(rawLimit);
  const cursor = readCursor(parameters.get('cursor'), customerId, status);
  await ensureRunningHub();
  const connection = await getPool().getConnection();
  const now = new Date().toISOString();
  // Expired unpaid reservations should not appear pending merely because the purchase page has not been reopened.
  const ownerRows = `SELECT id, pack_id, pack_label, price_mmk, created_at, approved_at, expires_at,
    CASE WHEN status = 'awaiting_payment' AND expires_at <= ? THEN 'expired' ELSE status END AS effective_status
    FROM digimium_runninghub_orders WHERE customer_id = ?`;
  try {
    await connection.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
    await connection.beginTransaction();
    const [counts] = await connection.execute<CountRow[]>(`SELECT
      COALESCE(SUM(effective_status IN ('awaiting_payment', 'payment_review')), 0) AS pending,
      COALESCE(SUM(effective_status = 'approved'), 0) AS purchased,
      COALESCE(SUM(effective_status IN ('rejected', 'expired')), 0) AS rejected
      FROM (${ownerRows}) AS owner_history`, [now, customerId]);
    const states = groups[status];
    const [rows] = await connection.execute<HistoryRow[]>(`SELECT * FROM (${ownerRows}) AS owner_history
      WHERE effective_status IN (${states.map(() => '?').join(', ')})
      ${cursor ? 'AND (created_at < ? OR (created_at = ? AND id < ?))' : ''}
      ORDER BY created_at DESC, id DESC LIMIT ${limit + 1}`,
    [now, customerId, ...states, ...(cursor ? [cursor.createdAt, cursor.createdAt, cursor.id] : [])]);
    await connection.commit();
    const orders = rows.slice(0, limit).map(present);
    const last = orders.at(-1);
    return { customerId, orders,
      counts: { pending: Number(counts[0].pending), purchased: Number(counts[0].purchased), rejected: Number(counts[0].rejected) },
      nextCursor: rows.length > limit && last
        ? Buffer.from(JSON.stringify([1, customerId, status, last.createdAt, last.id])).toString('base64url') : null };
  } catch (error) { await connection.rollback(); throw error; }
  finally { connection.release(); }
}
