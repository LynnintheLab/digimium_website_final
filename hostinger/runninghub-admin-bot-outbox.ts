import { randomBytes, randomUUID } from 'node:crypto';
import type { PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { z } from 'zod';
import { CommerceError } from '../lib/commerce-http';
import { RUNNINGHUB_PROOF_MAX_BYTES } from '../lib/runninghub';
import { getPool } from './mysql';
import { runningHubAdminBotConfig, signRunningHubApproval } from './runninghub-admin-bot';

const uuid = z.string().uuid();
type QueueRow = RowDataPacket & { id: string; order_id: string; proof_request_id: string; attempts: number };
type BotConfig = NonNullable<ReturnType<typeof runningHubAdminBotConfig>>;
type Receipt = Awaited<ReturnType<typeof import('./runninghub').runningHubAdminBotReceipt>>;
export type RunningHubAlertResult = { configured: boolean; sent: number; failed: number; cancelled: number; backfilled: number };

/** Called inside the proof transaction; provider availability never changes whether proof is saved. */
export async function enqueueRunningHubAdminReceipt(connection: PoolConnection, orderId: string, proofRequestId: string) {
  uuid.parse(orderId); uuid.parse(proofRequestId);
  await connection.execute(`INSERT IGNORE INTO digimium_runninghub_admin_outbox
    (id, order_id, proof_request_id, created_at, next_attempt_at)
    VALUES (?, ?, ?, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))`, [randomUUID(), orderId, proofRequestId]);
}

/** Activation recovery is bounded and never revives a sent or cancelled receipt. */
async function backfillRunningHubAdminReceipts() {
  const [result] = await getPool().execute<ResultSetHeader>(`INSERT IGNORE INTO digimium_runninghub_admin_outbox
    (id, order_id, proof_request_id, created_at, next_attempt_at)
    SELECT UUID(), o.id, o.proof_request_id, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3)
    FROM digimium_runninghub_orders o
    LEFT JOIN digimium_runninghub_admin_outbox q ON q.order_id = o.id AND q.proof_request_id = o.proof_request_id
    WHERE o.status = 'payment_review' AND o.proof_request_id IS NOT NULL AND o.proof_cipher IS NOT NULL
      AND o.proof_mime IN ('image/png', 'image/jpeg', 'image/webp') AND q.id IS NULL
    ORDER BY o.created_at, o.id LIMIT 20`);
  return result.affectedRows;
}

async function telegramResult(response: Response): Promise<{ posted: boolean; rejectedPhoto: boolean }> {
  const reader = response.body?.getReader();
  if (!reader) return { posted: false, rejectedPhoto: false };
  const decoder = new TextDecoder();
  let text = '', bytes = 0;
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      bytes += part.value.byteLength;
      if (bytes > 16384) { await reader.cancel(); return { posted: false, rejectedPhoto: false }; }
      text += decoder.decode(part.value, { stream: true });
    }
    const result = JSON.parse(text + decoder.decode()) as { ok?: unknown; error_code?: unknown };
    return { posted: response.ok && result.ok === true,
      rejectedPhoto: response.status === 400 && result.ok === false && result.error_code === 400 };
  } finally { reader.releaseLock(); }
}

async function sendReceipt(config: BotConfig, receipt: Receipt, deadline: number) {
  const extension = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }[receipt.contentType];
  if (!extension || !receipt.bytes.length || receipt.bytes.length > RUNNINGHUB_PROOF_MAX_BYTES || Date.now() >= deadline) return false;
  // The owner requires the original uploaded image, including on the document fallback.
  const image = new Blob([new Uint8Array(receipt.bytes)], { type: receipt.contentType });
  const shortReference = receipt.id.replaceAll('-', '').slice(0, 8).toUpperCase();
  const caption = `Running HUB payment review\nOrder #${shortReference}\n${receipt.paymentMethod === 'kpay' ? 'KPay' : 'AYA Pay'} · ${receipt.priceMmk.toLocaleString('en-US')} MMK`;
  const keyboard = { inline_keyboard: [
    [{ text: 'Review on website', url: `${config.origin}/admin/runninghub?order=${receipt.id}` }],
    [{ text: 'Approve payment', callback_data: signRunningHubApproval(config.secret, {
      id: receipt.id, proofRequestId: receipt.proofRequestId, revision: receipt.revision,
    }) }],
  ] };
  function upload(kind: 'photo' | 'document') {
    const form = new FormData();
    form.set('chat_id', config.ownerId);
    if (config.topicId !== undefined) form.set('message_thread_id', String(config.topicId));
    form.set('protect_content', 'true');
    form.set('caption', caption);
    form.set('reply_markup', JSON.stringify(keyboard));
    form.set(kind, image, `runninghub-payment-receipt.${extension}`);
    return fetch(`https://api.telegram.org/bot${config.token}/${kind === 'photo' ? 'sendPhoto' : 'sendDocument'}`, {
      method: 'POST', redirect: 'error', body: form, signal: AbortSignal.timeout(Math.max(1, deadline - Date.now())),
    });
  }
  const result = await telegramResult(await upload('photo'));
  // Never immediately duplicate a possibly accepted upload after a timeout/5xx/malformed response.
  if (!result.posted && result.rejectedPhoto && Date.now() < deadline) {
    const { runningHubAdminBotReceipt } = await import('./runninghub');
    await runningHubAdminBotReceipt(receipt.id, receipt.proofRequestId);
    if (Date.now() >= deadline) return false;
    return (await telegramResult(await upload('document'))).posted;
  }
  return result.posted;
}

/** Database locks are released before receipt reads and all Telegram traffic; the lease prevents concurrent sends. */
export async function drainRunningHubAdminReceipts(options: {
  limit?: number; budgetMs?: number; orderId?: string; backfill?: boolean;
} = {}): Promise<RunningHubAlertResult> {
  const config = runningHubAdminBotConfig();
  const result: RunningHubAlertResult = { configured: !!config, sent: 0, failed: 0, cancelled: 0, backfilled: 0 };
  if (!config) return result;
  if (options.orderId && !uuid.safeParse(options.orderId).success) return result;
  const { ensureRunningHub, runningHubAdminBotReceipt } = await import('./runninghub');
  await ensureRunningHub();
  const limit = Number.isFinite(options.limit) ? Math.min(5, Math.max(1, Math.floor(options.limit!))) : 1;
  const budget = Number.isFinite(options.budgetMs) ? Math.min(5000, Math.max(250, options.budgetMs!)) : 2000;
  const deadline = Date.now() + budget;
  if (options.backfill) result.backfilled = await backfillRunningHubAdminReceipts();
  for (let index = 0; index < limit && Date.now() < deadline; index++) {
    const connection = await getPool().getConnection();
    const lease = randomBytes(16);
    let row: QueueRow | undefined;
    try {
      await connection.beginTransaction();
      const [rows] = await connection.execute<QueueRow[]>(`SELECT id, order_id, proof_request_id, attempts
        FROM digimium_runninghub_admin_outbox WHERE sent_at IS NULL AND cancelled_at IS NULL
          AND next_attempt_at <= UTC_TIMESTAMP(3) AND (lease_until IS NULL OR lease_until < UTC_TIMESTAMP(3))
          ${options.orderId ? 'AND order_id = ?' : ''}
        ORDER BY created_at, id LIMIT 1 FOR UPDATE SKIP LOCKED`, options.orderId ? [options.orderId] : []);
      row = rows[0];
      if (row) await connection.execute(`UPDATE digimium_runninghub_admin_outbox
        SET lease_token = ?, lease_until = DATE_ADD(UTC_TIMESTAMP(3), INTERVAL 60 SECOND), attempts = LEAST(attempts + 1, 4294967295)
        WHERE id = ?`, [lease, row.id]);
      await connection.commit();
    } catch (error) { await connection.rollback(); throw error; }
    finally { connection.release(); }
    if (!row) break;
    let posted = false;
    try {
      const receipt = await runningHubAdminBotReceipt(row.order_id, row.proof_request_id);
      if (Date.now() < deadline) posted = await sendReceipt(config, receipt, deadline);
    } catch (error) {
      if (error instanceof CommerceError && [404, 409].includes(error.status)) {
        await getPool().execute(`UPDATE digimium_runninghub_admin_outbox
          SET cancelled_at = UTC_TIMESTAMP(3), lease_token = NULL, lease_until = NULL, last_error = 'proof-unavailable'
          WHERE id = ? AND lease_token = ?`, [row.id, lease]);
        result.cancelled++; continue;
      }
      // Persist only a fixed failure class: never tokens, URLs, images or provider bodies.
    }
    if (posted) {
      await getPool().execute(`UPDATE digimium_runninghub_admin_outbox
        SET sent_at = UTC_TIMESTAMP(3), lease_token = NULL, lease_until = NULL, last_error = NULL
        WHERE id = ? AND lease_token = ?`, [row.id, lease]);
      result.sent++;
    } else {
      const seconds = Math.min(3600, 60 * 2 ** Math.min(6, row.attempts));
      await getPool().execute(`UPDATE digimium_runninghub_admin_outbox
        SET next_attempt_at = DATE_ADD(UTC_TIMESTAMP(3), INTERVAL ? SECOND), lease_token = NULL, lease_until = NULL, last_error = 'delivery-failed'
        WHERE id = ? AND lease_token = ?`, [seconds, row.id, lease]);
      result.failed++;
    }
  }
  return result;
}
