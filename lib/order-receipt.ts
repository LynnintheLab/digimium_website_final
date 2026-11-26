import type { TelegramOrder } from './commerce-types';
import { isOrderReference } from './order-reference.ts';

export const ORDER_RECEIPT_KEY = 'digimium:last-order-receipt:v1';
export const ORDER_RECEIPT_TTL = 24 * 60 * 60 * 1000;
export const ORDER_RECEIPT_MAX_LENGTH = 262144;

export type OrderReceipt = {
  version: 1;
  savedAt: number;
  customerId: string | null;
  telegram: string;
  messages: string[];
  order: TelegramOrder;
};

export function createOrderReceipt(input: Omit<OrderReceipt, 'version' | 'savedAt'>, now = Date.now()) {
  return readOrderReceipt({...input, version: 1, savedAt: now}, now);
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const text = (value: unknown, max: number, required = false): value is string =>
  typeof value === 'string' && value.length <= max && (!required || value.length > 0) && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(value);

/** Keep only the checkout projection, never fulfillment data or customer/session credentials. */
export function readOrderReceipt(raw: unknown, now = Date.now()): OrderReceipt | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const value = raw as Record<string, unknown>;
  if (value.version !== 1 || !Number.isSafeInteger(value.savedAt) || typeof value.savedAt !== 'number' ||
    value.savedAt <= 0 || value.savedAt > now + 60000 || now - value.savedAt >= ORDER_RECEIPT_TTL ||
    (value.customerId !== null && (typeof value.customerId !== 'string' || !uuid.test(value.customerId))) ||
    typeof value.telegram !== 'string') return null;
  const telegram = value.telegram.trim().replace(/^@/, '');
  if (!/^[A-Za-z][A-Za-z0-9_]{3,31}$/.test(telegram) || !Array.isArray(value.messages) ||
    !value.messages.length || value.messages.length > 3000 || !value.messages.every(part => text(part, 16384, true))) return null;
  if (!value.order || typeof value.order !== 'object' || Array.isArray(value.order)) return null;
  const order = value.order as Record<string, unknown>;
  if (typeof order.id !== 'string' || !uuid.test(order.id) ||
    (order.totalMmk !== null && (!Number.isSafeInteger(order.totalMmk) || typeof order.totalMmk !== 'number' || order.totalMmk < 0)) ||
    !Array.isArray(order.lines) || !order.lines.length || order.lines.length > 3000) return null;
  const lines: TelegramOrder['lines'] = [];
  for (const item of order.lines) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
    const line = item as Record<string, unknown>;
    if (!text(line.productName, 500, true) || (line.planName !== null && !text(line.planName, 4000)) ||
      !text(line.duration, 4000) || !text(line.price, 1000) || !Number.isSafeInteger(line.quantity) ||
      typeof line.quantity !== 'number' || line.quantity < 1) return null;
    lines.push({ productName: line.productName, planName: line.planName, duration: line.duration, price: line.price, quantity: line.quantity });
  }
  const receipt: OrderReceipt = {
    version: 1, savedAt: value.savedAt, customerId: value.customerId,
    telegram, messages: [...value.messages],
    order: { id: order.id, ...(isOrderReference(order.reference) ? { reference: order.reference } : {}), totalMmk: order.totalMmk, lines },
  };
  return JSON.stringify(receipt).length <= ORDER_RECEIPT_MAX_LENGTH ? receipt : null;
}

export function parseOrderReceipt(raw: string | null, now = Date.now()): OrderReceipt | null {
  if (!raw || raw.length > ORDER_RECEIPT_MAX_LENGTH) return null;
  try { return readOrderReceipt(JSON.parse(raw), now); } catch { return null; }
}

export function receiptCanResume(receipt: OrderReceipt, customerId: string | null, telegram: string) {
  const contact = telegram.trim().replace(/^@/, '');
  return receipt.telegram.toLowerCase() === contact.toLowerCase() &&
    (receipt.customerId === null || receipt.customerId === customerId);
}
