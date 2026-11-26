import { orderMessages } from './cart-order.ts';
import type { CommerceCustomer, TelegramOrder } from './commerce-types';
import { displayOrderReference } from './order-reference.ts';
import { durationDetail, priceText, type ShopLanguage } from './shop-language.ts';

export type OrderTelegramIdentity = { telegramUsername?: string | null; googleEmail?: string | null };

export function orderTelegramIdentity(customer: Pick<CommerceCustomer, 'telegram' | 'email' | 'signInMethods'>): OrderTelegramIdentity {
  return { telegramUsername: customer.telegram?.username, googleEmail: customer.signInMethods?.google ? customer.email : undefined };
}

export function orderTelegramMessages(order: TelegramOrder, identity: OrderTelegramIdentity, lang: ShopLanguage): string[] {
  const username = identity.telegramUsername ?? '';
  const googleEmail = identity.googleEmail?.trim() ?? '';
  const header = [
    '📦 Order ID — ' + displayOrderReference(order.id, order.reference),
    /^[A-Za-z0-9_]{5,32}$/.test(username) && '💬 Telegram — @' + username,
    googleEmail && (/@gmail\.com$/i.test(googleEmail) ? '📧 Gmail — ' : '📧 Email — ') + googleEmail,
  ].filter(Boolean).join('\n');
  // Keep large bulk orders bounded while still representing the exact purchased quantity.
  const repeatUnits = order.lines.reduce((sum, line) => sum + line.quantity, 0) <= 3000;
  const rows = order.lines.flatMap(line => {
    const product = line.productName.trim();
    const plan = line.planName?.trim();
    const lowerProduct = product.toLowerCase();
    const lowerPlan = plan?.toLowerCase();
    const planStartsWithProduct = lowerPlan === lowerProduct || lowerPlan?.startsWith(lowerProduct + ' ');
    const title = plan && planStartsWithProduct ? plan : [product, plan].filter(Boolean).join(' · ');
    const duration = durationDetail(line.duration, title, lang);
    const offer = [title, duration].filter(Boolean).join(' · ');
    const row = offer + ' — ' + priceText(line.price, lang);
    if (repeatUnits) return Array<string>(line.quantity).fill(row);
    return [line.quantity === 1 ? row : line.quantity.toLocaleString('en-US') + ' × ' + row];
  });
  const total = '\n─────\n\n🧾 Total — ' + priceText(order.totalMmk === null ? '' : order.totalMmk.toLocaleString('en-US') + ' MMK', lang);
  return orderMessages(header, rows, total, (part, count) => lang === 'my'
    ? 'အပိုင်း ' + part + ' / ' + count : 'Part ' + part + ' of ' + count, '\n\n');
}
