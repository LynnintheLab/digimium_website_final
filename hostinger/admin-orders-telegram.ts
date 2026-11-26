import { timingSafeEqual } from 'node:crypto';
import { CommerceError } from '../lib/commerce-http';

const adminTimestamp = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Yangon', dateStyle: 'medium', timeStyle: 'short',
});

export function formatAdminTimestamp(value: string | null | undefined): string {
  const time = value ? Date.parse(value) : NaN;
  return Number.isFinite(time) ? adminTimestamp.format(time) + ' MMT' : '';
}

// Only these fixed messages may be shown for a recognized, authenticated payment action.
// Never forward arbitrary exception text or interpolate customer/payment data into a bot reply.
const actionFailures = {
  receipt_used: 'This exact screenshot was already used for an approved order. No key was issued. For a different transfer, ask for its payment receipt.',
  receipt_changed: 'This button is for an older receipt. Open the latest receipt or review the current screenshot in website Admin.',
  receipt_missing: 'This order has no current payment screenshot to approve. Review it in website Admin.',
  order_changed: 'This order changed after this button was created. Review the current payment in website Admin.',
  order_rejected: 'This order was rejected. No key was issued by this click. Review it in website Admin.',
  order_expired: 'This unpaid order expired. No key was issued by this click. Review it in website Admin.',
  order_approved: 'This order is already approved. Open website Admin to check the issued key.',
  order_missing: 'This order is no longer available. Open website Admin to review current orders.',
  stock_unavailable: 'The reserved key is unavailable. No key was issued by this click. Check stock and the order in website Admin.',
  request_conflict: 'This approval conflicts with an earlier action. No key was issued by this click. Review the order in website Admin.',
  reference_used: 'This wallet transaction reference was already used for an approved order. No key was issued by this click. Review the payment in website Admin.',
} as const;

export class AdminOrdersActionError extends CommerceError {
  constructor(public readonly code: keyof typeof actionFailures) {
    super(code === 'order_missing' ? 404 : 409, actionFailures[code]);
  }
}

export type AdminOrdersBotConfig = {
  token: string; ownerId: string; botId: string; secret: string; topicId?: number; runningHubTopicId?: number; origin: string;
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
  const runningHubTopicId = readTopicId(process.env.DIGIMIUM_ADMIN_ORDERS_TELEGRAM_RUNNINGHUB_TOPIC_ID);
  const generalTopics = [process.env.DIGIMIUM_ADMIN_ORDERS_TELEGRAM_ORDERS_TOPIC_ID,
    process.env.DIGIMIUM_ADMIN_ORDERS_TELEGRAM_REGISTRATION_TOPIC_ID].map(readTopicId);
  return { token, ownerId, botId, secret, origin, topicId,
    runningHubTopicId: runningHubTopicId && !generalTopics.includes(runningHubTopicId) ? runningHubTopicId : undefined };
}

function readTopicId(value: string | undefined) {
  const id = Number(positiveId(value?.trim()));
  return id >= 2 && id <= 0x7fffffff ? id : undefined;
}

export function adminOrdersNotificationTopicsConfigured() {
  return Boolean(process.env.DIGIMIUM_ADMIN_ORDERS_TELEGRAM_ORDERS_TOPIC_ID?.trim() ||
    process.env.DIGIMIUM_ADMIN_ORDERS_TELEGRAM_REGISTRATION_TOPIC_ID?.trim());
}

export function adminOrdersNotificationTopics() {
  const config = adminOrdersBotConfig();
  const ordersTopicId = readTopicId(process.env.DIGIMIUM_ADMIN_ORDERS_TELEGRAM_ORDERS_TOPIC_ID);
  const registrationTopicId = readTopicId(process.env.DIGIMIUM_ADMIN_ORDERS_TELEGRAM_REGISTRATION_TOPIC_ID);
  const reserved = [config?.topicId, readTopicId(process.env.DIGIMIUM_ADMIN_ORDERS_TELEGRAM_RUNNINGHUB_TOPIC_ID)];
  if (!config || !ordersTopicId || !registrationTopicId || ordersTopicId === registrationTopicId ||
      reserved.includes(ordersTopicId) || reserved.includes(registrationTopicId)) return null;
  return { token: config.token, ownerId: config.ownerId, origin: config.origin,
    ordersTopicId, registrationTopicId, runningHubTopicId: config.runningHubTopicId };
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
