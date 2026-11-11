import type { Product, ProductPlan } from './catalog';

export type CartItem = { productId: string; planId: string | null; quantity: number };
export type OrderLine = CartItem & { product: Product; plan?: ProductPlan };
export const CART_KEY = 'digimium:shopping-cart:v1';

export function sameItem(a: CartItem, b: CartItem) {
  return a.productId === b.productId && a.planId === b.planId;
}

export function restoreCart(raw: unknown, products: Product[]): CartItem[] {
  if (!Array.isArray(raw)) return [];
  const catalog = new Map(products.map(product => [product.id, product]));
  const result: CartItem[] = [];
  for (const candidate of raw) {
    if (!candidate || typeof candidate !== 'object') continue;
    const { productId, planId, quantity } = candidate;
    const product = catalog.get(productId);
    if (!product?.published || product.availability === 'unavailable' || !Number.isSafeInteger(quantity) || quantity <= 0) continue;
    const plans = product.plans?.filter(plan => plan.published) ?? [];
    if (plans.length ? !plans.some(plan => plan.id === planId) : planId !== null) continue;
    const item = { productId, planId, quantity };
    const previous = result.find(existing => sameItem(existing, item));
    if (previous) previous.quantity = Math.min(Number.MAX_SAFE_INTEGER, previous.quantity + quantity);
    else result.push(item);
  }
  return result;
}

export function withSelection(cart: CartItem[], selected: CartItem, increment: boolean) {
  const found = cart.some(item => sameItem(item, selected));
  if (!found) return [...cart, selected];
  if (!increment) return cart;
  return cart.map(item => sameItem(item, selected)
    ? { ...item, quantity: Math.min(Number.MAX_SAFE_INTEGER, item.quantity + selected.quantity) }
    : item);
}

export function resolveOrder(raw: CartItem[], products: Product[]): OrderLine[] {
  const catalog = new Map(products.map(product => [product.id, product]));
  return restoreCart(raw, products).map(item => {
    const product = catalog.get(item.productId)!;
    return { ...item, product, plan: product.plans?.find(plan => plan.id === item.planId) };
  });
}

export function totalMmk(lines: OrderLine[]): number | undefined {
  let result = 0;
  if (!lines.length) return;
  for (const line of lines) {
    const price = line.plan ? line.plan.price : line.product.price;
    const match = /^(\d{1,3}(?:,\d{3})+|\d+)\s*(?:MMK|Ks|ကျပ်)$/i.exec(price.trim());
    if (!match) return;
    result += Number(match[1].replaceAll(',', '')) * line.quantity;
    if (!Number.isSafeInteger(result)) return;
  }
  return result;
}

function telegramTextQuery(text: string) {
  // Some Telegram clients display form-encoded spaces as literal plus signs.
  return new URLSearchParams({ text }).toString().replaceAll('+', '%20');
}

// Keep whole order lines together. Leave room for the part number in each message.
export function orderMessages(header: string, rows: string[], finalLine: string, partLabel: (index: number, total: number) => string) {
  const batches: string[][] = [[]];
  let used = header.length + 2;
  // Myanmar glyphs use several percent-encoded bytes in a DM link.
  let encoded = telegramTextQuery(header).length;
  for (const row of [...rows, finalLine].filter(Boolean)) {
    const rowSize = telegramTextQuery(row).length + 3;
    if (batches[batches.length - 1].length && (used + row.length + 1 > 3200 || encoded + rowSize > 7000)) {
      batches.push([]);
      used = header.length + 2;
      encoded = telegramTextQuery(header).length;
    }
    batches[batches.length - 1].push(row);
    used += row.length + 1;
    encoded += rowSize;
  }
  return batches.map((batch, index) => {
    const title = batches.length === 1 ? header : `${header} (${partLabel(index + 1, batches.length)})`;
    return [title, ...batch].join('\n');
  });
}

export function telegramDraft(username: string, message: string) {
  const clean = username.trim().replace(/^@/, '');
  if (!/^[A-Za-z][A-Za-z0-9_]{3,31}$/.test(clean)) return undefined;
  const chat = `https://t.me/${clean}`;
  return message ? `${chat}?${telegramTextQuery(message)}` : chat;
}
