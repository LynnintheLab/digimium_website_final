import { cleanAdminTelegramValue, formatAdminTelegramNotice, formatAdminTimestamp } from './admin-telegram-message.ts';
import type { CheckoutContact } from './order-checkout-contact.ts';
import { displayOrderReference } from './order-reference.ts';

type OrderNoticeLine = {
  productName: string;
  planName?: string | null;
  duration?: string | null;
  price?: string | null;
  quantity: number;
};

type OrderNoticeDetails = {
  id: string;
  reference?: string | null;
  createdAt: string;
  status: 'pending' | 'approved' | 'rejected';
  lines: readonly OrderNoticeLine[];
  totalMmk: number | null;
  customerName?: string | null;
  customerEmail?: string | null;
  telegramUsername?: string | null;
  checkoutContact?: CheckoutContact | null;
  guest?: boolean;
  historical?: boolean;
};

const messageLimit = 3500;
const statusLabels = { pending: 'Pending', approved: 'Approved', rejected: 'Rejected' };
const checkoutContactLabels = {
  'telegram-username': 'Telegram username',
  'telegram-phone': 'Telegram phone',
  'viber-phone': 'Viber phone',
};

export function formatAdminOrderDetailsNotice(order: OrderNoticeDetails) {
  const time = formatAdminTimestamp(order.createdAt);
  const header = [
    order.historical ? '🛒 Order details' : '🛒 New order',
    'Order ID: ' + displayOrderReference(order.id, order.reference),
    time && 'Order time: ' + time,
    'Status: ' + statusLabels[order.status],
  ].filter(Boolean).join('\n');
  const name = order.guest ? 'Guest' : cleanAdminTelegramValue(order.customerName, 100);
  const email = order.guest ? '' : cleanAdminTelegramValue(order.customerEmail, 254);
  const username = !order.guest && /^[A-Za-z0-9_]{5,32}$/.test(order.telegramUsername ?? '') ? order.telegramUsername : '';
  const contact = order.guest ? null : order.checkoutContact;
  const buyer = [
    name && 'Customer: ' + name,
    email && 'Email: ' + email,
    username && 'Telegram: @' + username,
    contact && 'Checkout contact: ' + checkoutContactLabels[contact.method] + ' · ' + contact.value,
  ].filter(Boolean).join('\n');
  const total = 'Total: ' + (order.totalMmk == null ? 'Price on request' : order.totalMmk.toLocaleString('en-US') + ' MMK');

  // Keep every rendered item complete, with space for the total and an omission notice for very large carts.
  const itemBudget = messageLimit - header.length - buyer.length - total.length - 64;
  const items: string[] = [];
  let used = 0;
  for (const line of order.lines) {
    const offer = [
      cleanAdminTelegramValue(line.productName, 100),
      cleanAdminTelegramValue(line.planName, 180),
    ].filter(Boolean).join(' — ');
    const duration = cleanAdminTelegramValue(line.duration, 80);
    const price = cleanAdminTelegramValue(line.price, 80);
    const details = [duration, price ? price + ' each' : 'Price on request'].filter(Boolean).join(' · ');
    const item = offer + ' × ' + line.quantity + '\n' + details;
    if (used + item.length > itemBudget) break;
    items.push(item);
    used += item.length + 2;
  }
  const omitted = order.lines.length - items.length;
  if (omitted) items.push(omitted + ' more ' + (omitted === 1 ? 'item' : 'items') + ' in Admin');
  return formatAdminTelegramNotice([header, buyer, items.join('\n\n'), total].filter(Boolean).join('\n\n'));
}
