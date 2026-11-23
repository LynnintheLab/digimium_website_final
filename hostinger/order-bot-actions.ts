import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';

export const orderBotActions = {
  'order-created': { action: 'order-approve', code: 'o', label: 'Approve order' },
  'payment-proof-submitted': { action: 'payment-approve', code: 'p', label: 'Approve payment' },
  'order-delivery-ready': { action: 'order-send', code: 's', label: 'Send order' },
} as const;

export type OrderBotActionKind = keyof typeof orderBotActions;
export const orderBotTopicKeys = {
  'order-created': 'ORDER_ALERTS_TELEGRAM_ORDERS_TOPIC_ID',
  'payment-proof-submitted': 'ORDER_ALERTS_TELEGRAM_PAYMENT_TOPIC_ID',
  'customer-created': 'ORDER_ALERTS_TELEGRAM_REGISTRATION_TOPIC_ID',
  'order-delivery-ready': 'ORDER_ALERTS_TELEGRAM_FULFILLMENT_TOPIC_ID',
} as const;

export function privateTelegramId(value: string | undefined) {
  const id = value?.trim();
  return id && /^[1-9]\d{0,15}$/.test(id) && Number(id) <= 2 ** 52 - 1 ? id : null;
}

export function orderBotTestEnvironment() {
  return /^https:\/\/test\.buywith-digimium\.store\/?$/.test(process.env.APP_ORIGIN ?? '');
}

export function orderBotActionSettings() {
  if (!orderBotTestEnvironment()) return null;
  const secret = process.env.ORDER_ALERTS_TELEGRAM_WEBHOOK_SECRET?.trim();
  const owner = privateTelegramId(process.env.ORDER_ALERTS_TELEGRAM_CHAT_ID);
  const token = process.env.ORDER_ALERTS_TELEGRAM_BOT_TOKEN?.trim();
  if (!secret || !/^[A-Za-z0-9_-]{32,256}$/.test(secret) || !owner || !token ||
    !/^\d{1,16}:[A-Za-z0-9_-]{20,200}$/.test(token) || token === process.env.TELEGRAM_BOT_TOKEN?.trim() ||
    token === process.env.ADMIN_TELEGRAM_BOT_TOKEN?.trim()) return null;
  const ids = Object.fromEntries(Object.entries(orderBotTopicKeys).map(([kind, key]) =>
    [kind, Number(privateTelegramId(process.env[key]))],
  )) as Record<keyof typeof orderBotTopicKeys, number>;
  const topics = Object.values(ids);
  if (topics.some(id => id < 2 || id > 0x7fffffff) || new Set(topics).size !== topics.length) return null;
  return { secret, owner: Number(owner), bot: Number(token.split(':', 1)[0]), topics: ids };
}

export function equalOrderBotSecret(expected: string, provided: string | null) {
  if (!provided || provided.length !== expected.length) return false;
  const value = Buffer.from(provided);
  const secret = Buffer.from(expected);
  return value.length === secret.length && timingSafeEqual(secret, value);
}

export function orderBotCallbackData(secret: string, kind: OrderBotActionKind, id: string) {
  const body = orderBotActions[kind].code + ':' + id;
  const tag = createHmac('sha256', secret).update('digimium-order-bot:' + body).digest().subarray(0, 16).toString('base64url');
  return `${body}:${tag}`;
}

export function readOrderBotCallbackData(secret: string, data: string) {
  const [code, id, tag] = data.split(':');
  const kind = (Object.keys(orderBotActions) as OrderBotActionKind[]).find(key => orderBotActions[key].code === code);
  if (!kind || !tag || !z.string().uuid().safeParse(id).success ||
    !equalOrderBotSecret(orderBotCallbackData(secret, kind, id), data)) return null;
  return { kind, id };
}
