import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';

type ApprovalBinding = { id: string; proofRequestId: string; revision: number };
export type RunningHubAdminBotConfig = {
  token: string; ownerId: string; botId: string; secret: string; topicId?: number; origin: string;
};
const uuid = z.string().uuid();
const bindingSchema = z.object({ id: uuid, proofRequestId: uuid, revision: z.number().int().positive().max(0xfffffffe) }).strict();
const positiveId = (value: string | undefined) => value && /^[1-9]\d{0,15}$/.test(value) &&
  Number(value) <= 2 ** 52 - 1 ? value : null;

/** This bot has its own credentials and never falls back to a login or order-alert bot. */
export function runningHubAdminBotConfig(): RunningHubAdminBotConfig | null {
  const origin = process.env.APP_ORIGIN ?? '';
  let url: URL;
  try { url = new URL(origin); } catch { return null; }
  if (url.origin !== origin || (origin !== 'https://buywith-digimium.store' &&
    !(url.protocol === 'http:' && url.hostname === '127.0.0.1' && url.port))) return null;
  const token = process.env.RUNNINGHUB_ADMIN_TELEGRAM_BOT_TOKEN?.trim();
  const ownerId = positiveId(process.env.RUNNINGHUB_ADMIN_TELEGRAM_OWNER_ID?.trim());
  const secret = process.env.RUNNINGHUB_ADMIN_TELEGRAM_WEBHOOK_SECRET?.trim();
  if (!token || !/^\d{1,16}:[A-Za-z0-9_-]{20,200}$/.test(token) || !ownerId ||
    !secret || !/^[A-Za-z0-9_-]{32,256}$/.test(secret) ||
    [process.env.TELEGRAM_BOT_TOKEN, process.env.ADMIN_TELEGRAM_BOT_TOKEN, process.env.ORDER_ALERTS_TELEGRAM_BOT_TOKEN]
      .some(other => other?.trim() === token)) return null;
  const botId = positiveId(token.split(':', 1)[0]);
  if (!botId) return null;
  const topic = process.env.RUNNINGHUB_ADMIN_TELEGRAM_PAYMENT_TOPIC_ID?.trim();
  const topicId = topic ? Number(positiveId(topic)) : undefined;
  if (topic && (!topicId || topicId > 0x7fffffff)) return null;
  return { token, ownerId, botId, secret, origin, ...(topicId ? { topicId } : {}) };
}
export function equalRunningHubBotSecret(expected: string, provided: string | null) {
  if (!provided || provided.length !== expected.length) return false;
  const a = Buffer.from(expected), b = Buffer.from(provided);
  return a.length === b.length && timingSafeEqual(a, b);
}
function signature(secret: string, bytes: Buffer) {
  return createHmac('sha256', secret).update('digimium/runninghub/approval-button/v1/').update(bytes).digest().subarray(0, 12);
}
/** 36-byte binding + 12-byte MAC = exactly Telegram's 64-byte callback_data limit. */
export function signRunningHubApproval(secret: string, order: ApprovalBinding): string {
  const input = bindingSchema.parse({ id: order.id, proofRequestId: order.proofRequestId, revision: order.revision });
  const body = Buffer.alloc(36);
  Buffer.from(input.id.replaceAll('-', ''), 'hex').copy(body, 0);
  Buffer.from(input.proofRequestId.replaceAll('-', ''), 'hex').copy(body, 16);
  body.writeUInt32BE(input.revision, 32);
  return Buffer.concat([body, signature(secret, body)]).toString('base64url');
}
function formatUuid(bytes: Buffer) {
  const hex = bytes.toString('hex');
  return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join('-');
}
export function readRunningHubApproval(secret: string, code: string): ApprovalBinding | null {
  if (!/^[A-Za-z0-9_-]{64}$/.test(code)) return null;
  const bytes = Buffer.from(code, 'base64url');
  if (bytes.length !== 48 || !timingSafeEqual(bytes.subarray(36), signature(secret, bytes.subarray(0, 36)))) return null;
  const parsed = bindingSchema.safeParse({ id: formatUuid(bytes.subarray(0, 16)),
    proofRequestId: formatUuid(bytes.subarray(16, 32)), revision: bytes.readUInt32BE(32) });
  return parsed.success ? parsed.data : null;
}
export function runningHubApprovalPrompt(code: string, orderId: string) {
  return 'Running HUB payment check\nOrder #' + orderId.slice(0, 8).toUpperCase() +
    '\nCheck the amount and recipient in your wallet, then reply to this message with that transaction reference.' +
    '\nNever send an API key or password.\nRH approval: ' + code;
}
export function readRunningHubApprovalPrompt(secret: string, text: string) {
  const code = /\nRH approval: ([A-Za-z0-9_-]{64})$/.exec(text)?.[1];
  if (!code) return null;
  const order = readRunningHubApproval(secret, code);
  return order && text === runningHubApprovalPrompt(code, order.id) ? { code, order } : null;
}
/** Repeated replies to the same proof/revision map to one durable mutation receipt. */
export function runningHubApprovalRequestId(secret: string, code: string) {
  const bytes = createHmac('sha256', secret).update('digimium/runninghub/approval-request/v1/' + code).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  return formatUuid(bytes);
}
/** Token-bearing transport is bounded, never redirected, logged, or returned to a caller. */
export async function promptRunningHubApproval(config: RunningHubAdminBotConfig, code: string, orderId: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2500);
  try {
    const response = await fetch('https://api.telegram.org/bot' + config.token + '/sendMessage', {
      method: 'POST', redirect: 'error', signal: controller.signal, headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: Number(config.ownerId), text: runningHubApprovalPrompt(code, orderId), protect_content: true,
        link_preview_options: { is_disabled: true },
        ...(config.topicId ? { message_thread_id: config.topicId } : {}),
        reply_markup: { force_reply: true, selective: true, input_field_placeholder: 'Checked wallet reference' } }),
    });
    const reader = response.body?.getReader();
    if (!reader) return false;
    let size = 0, text = '';
    const decoder = new TextDecoder();
    try {
      for (;;) {
        const part = await reader.read();
        if (part.done) break;
        size += part.value.byteLength;
        if (size > 16384) { await reader.cancel(); return false; }
        text += decoder.decode(part.value, { stream: true });
      }
      return response.ok && JSON.parse(text + decoder.decode())?.ok === true;
    } finally { reader.releaseLock(); }
  } catch { return false; }
  finally { clearTimeout(timeout); }
}
