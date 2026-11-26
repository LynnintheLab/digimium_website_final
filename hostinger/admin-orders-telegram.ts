import { timingSafeEqual } from 'node:crypto';

export type AdminOrdersBotConfig = {
  token: string; ownerId: string; botId: string; secret: string; topicId?: number; origin: string;
};
const positiveId = (value: string | undefined) => value && /^[1-9]\d{0,15}$/.test(value) &&
  Number(value) <= 2 ** 52 - 1 ? value : null;

/** One store-wide Admin Orders bot; never fall back to customer login or older alert bots. */
export function adminOrdersBotConfig(): AdminOrdersBotConfig | null {
  const origin = process.env.APP_ORIGIN ?? '';
  let url: URL;
  try { url = new URL(origin); } catch { return null; }
  if (url.origin !== origin || (origin !== 'https://buywith-digimium.store' &&
    !(url.protocol === 'http:' && url.hostname === '127.0.0.1' && url.port))) return null;
  const token = process.env.DIGIMIUM_ADMIN_ORDERS_TELEGRAM_BOT_TOKEN?.trim();
  const ownerId = positiveId(process.env.DIGIMIUM_ADMIN_ORDERS_TELEGRAM_OWNER_ID?.trim());
  const secret = process.env.DIGIMIUM_ADMIN_ORDERS_TELEGRAM_WEBHOOK_SECRET?.trim();
  if (!token || !/^\d{1,16}:[A-Za-z0-9_-]{20,200}$/.test(token) || !ownerId ||
    !secret || !/^[A-Za-z0-9_-]{32,256}$/.test(secret) ||
    [process.env.TELEGRAM_BOT_TOKEN, process.env.ADMIN_TELEGRAM_BOT_TOKEN, process.env.ORDER_ALERTS_TELEGRAM_BOT_TOKEN]
      .some(other => other?.trim() === token)) return null;
  const botId = positiveId(token.split(':', 1)[0]);
  if (!botId) return null;
  const topic = process.env.DIGIMIUM_ADMIN_ORDERS_TELEGRAM_PAYMENT_TOPIC_ID?.trim();
  const topicId = topic ? Number(positiveId(topic)) : undefined;
  if (topic && (!topicId || topicId > 0x7fffffff)) return null;
  return { token, ownerId, botId, secret, origin, ...(topicId ? { topicId } : {}) };
}
export function equalAdminOrdersBotSecret(expected: string, provided: string | null) {
  if (!provided || provided.length !== expected.length) return false;
  const a = Buffer.from(expected), b = Buffer.from(provided);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Register each checkout workflow at the common webhook.
 * Every adapter verifies its own cryptographic namespace; user-provided labels never select a handler.
 * The router authenticates the owner/private chat/bot/topic before calling either mutation method.
 */
export type AdminOrdersBotAdapter = {
  namespace: string;
  matchesCallback(secret: string, code: string): boolean;
  beginApproval(config: AdminOrdersBotConfig, code: string): Promise<string>;
  matchesReply(secret: string, prompt: string): boolean;
  completeApproval(config: AdminOrdersBotConfig, prompt: string, reference: string): Promise<string>;
};
