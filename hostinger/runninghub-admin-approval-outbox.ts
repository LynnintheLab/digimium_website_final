import { randomBytes, randomUUID } from 'node:crypto';
import type { PoolConnection, RowDataPacket } from 'mysql2/promise';
import { z } from 'zod';
import { formatAdminTelegramNotice } from '../lib/admin-telegram-message';
import { CommerceError } from '../lib/commerce-http';
import { adminOrdersBotConfig } from './admin-orders-telegram';
import { getPool } from './mysql';
import { runningHubAdminMessage } from './runninghub-admin-bot';

const uuid = z.string().uuid();
type QueueRow = RowDataPacket & { id: string; order_id: string; attempts: number };
type Approval = Awaited<ReturnType<typeof import('./runninghub').runningHubAdminBotApproval>>;
type BotConfig = NonNullable<ReturnType<typeof adminOrdersBotConfig>>;

/** One reference-only notice per order, committed atomically with key issuance. */
export async function enqueueRunningHubAdminApproval(connection: PoolConnection, orderId: string) {
  uuid.parse(orderId);
  await connection.execute(`INSERT IGNORE INTO digimium_runninghub_approval_outbox
    (id, order_id, created_at, next_attempt_at) VALUES (?, ?, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))`, [randomUUID(), orderId]);
}

function plain(value: unknown, max: number) {
  return typeof value === 'string' ? value.replace(/[\p{Cc}\u200e\u200f\u202a-\u202e\u2066-\u2069]/gu, ' ')
    .replace(/\s+/gu, ' ').trim().slice(0, max) : '';
}

async function sendApproval(config: BotConfig, approval: Approval, deadline: number) {
  const dedicatedTopic = config.runningHubTopicId !== undefined;
  const details = runningHubAdminMessage(approval, 'approved', dedicatedTopic ? approval.customer : undefined);
  if (!dedicatedTopic) {
    const { name, email, telegramUsername } = approval.customer;
    const legacyEmail = z.email().max(254).safeParse(email);
    if (telegramUsername && /^[A-Za-z0-9_]{5,32}$/.test(telegramUsername)) {
      details.push('', 'Telegram: @' + telegramUsername);
    } else if (legacyEmail.success) {
      const legacyName = plain(name, 100);
      details.push('');
      if (legacyName) details.push('Customer: ' + legacyName);
      details.push('Email: ' + legacyEmail.data);
    }
  }
  details.push('', 'The key is now available in the customer’s website purchase details.');
  const notice = formatAdminTelegramNotice(details.join('\n'));
  if (Date.now() >= deadline) return false;
  const topicId = config.runningHubTopicId ?? config.topicId;
  const response = await fetch(`https://api.telegram.org/bot${config.token}/sendMessage`, {
    method: 'POST', redirect: 'error', signal: AbortSignal.timeout(Math.max(1, deadline - Date.now())),
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: Number(config.ownerId), ...notice, protect_content: true,
      link_preview_options: { is_disabled: true }, ...(topicId !== undefined ? { message_thread_id: topicId } : {}) }),
  });
  const reader = response.body?.getReader();
  if (!reader) return false;
  const decoder = new TextDecoder();
  let bytes = 0, body = '';
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      bytes += part.value.byteLength;
      if (bytes > 16384) { await reader.cancel(); return false; }
      body += decoder.decode(part.value, { stream: true });
    }
    return response.ok && JSON.parse(body + decoder.decode())?.ok === true;
  } finally { reader.releaseLock(); }
}

/** Leases prevent concurrent sends; acknowledged notices are never sent again. */
export async function drainRunningHubAdminApprovals(options: { limit?: number; budgetMs?: number; orderId?: string } = {}) {
  const config = adminOrdersBotConfig();
  const result = { configured: !!config, sent: 0, failed: 0, cancelled: 0 };
  if (!config || (options.orderId && !uuid.safeParse(options.orderId).success)) return result;
  const { ensureRunningHub, runningHubAdminBotApproval } = await import('./runninghub');
  await ensureRunningHub();
  const limit = Number.isFinite(options.limit) ? Math.min(5, Math.max(1, Math.floor(options.limit!))) : 1;
  const budget = Number.isFinite(options.budgetMs) ? Math.min(3000, Math.max(250, options.budgetMs!)) : 2000;
  const deadline = Date.now() + budget;
  for (let index = 0; index < limit && Date.now() < deadline; index++) {
    const connection = await getPool().getConnection(), lease = randomBytes(16);
    let row: QueueRow | undefined;
    try {
      await connection.beginTransaction();
      const [rows] = await connection.execute<QueueRow[]>(`SELECT id, order_id, attempts
        FROM digimium_runninghub_approval_outbox WHERE sent_at IS NULL AND cancelled_at IS NULL
          AND next_attempt_at <= UTC_TIMESTAMP(3) AND (lease_until IS NULL OR lease_until < UTC_TIMESTAMP(3))
          ${options.orderId ? 'AND order_id = ?' : ''}
        ORDER BY created_at, id LIMIT 1 FOR UPDATE SKIP LOCKED`, options.orderId ? [options.orderId] : []);
      row = rows[0];
      if (row) await connection.execute(`UPDATE digimium_runninghub_approval_outbox
        SET lease_token = ?, lease_until = DATE_ADD(UTC_TIMESTAMP(3), INTERVAL 60 SECOND), attempts = LEAST(attempts + 1, 4294967295)
        WHERE id = ?`, [lease, row.id]);
      await connection.commit();
    } catch (error) { await connection.rollback(); throw error; }
    finally { connection.release(); }
    if (!row) break;
    let posted = false;
    try {
      const approval = await runningHubAdminBotApproval(row.order_id);
      if (Date.now() < deadline) posted = await sendApproval(config, approval, deadline);
    } catch (error) {
      if (error instanceof CommerceError && [404, 409].includes(error.status)) {
        await getPool().execute(`UPDATE digimium_runninghub_approval_outbox
          SET cancelled_at = UTC_TIMESTAMP(3), lease_token = NULL, lease_until = NULL, last_error = 'approval-unavailable'
          WHERE id = ? AND lease_token = ?`, [row.id, lease]);
        result.cancelled++; continue;
      }
      // No customer identity, bot tokens, provider response, or key data is logged or persisted here.
    }
    if (posted) {
      await getPool().execute(`UPDATE digimium_runninghub_approval_outbox
        SET sent_at = UTC_TIMESTAMP(3), lease_token = NULL, lease_until = NULL, last_error = NULL WHERE id = ? AND lease_token = ?`, [row.id, lease]);
      result.sent++;
    } else {
      const seconds = Math.min(3600, 60 * 2 ** Math.min(6, row.attempts));
      await getPool().execute(`UPDATE digimium_runninghub_approval_outbox
        SET next_attempt_at = DATE_ADD(UTC_TIMESTAMP(3), INTERVAL ? SECOND), lease_token = NULL, lease_until = NULL, last_error = 'delivery-failed'
        WHERE id = ? AND lease_token = ?`, [seconds, row.id, lease]);
      result.failed++;
    }
  }
  return result;
}
