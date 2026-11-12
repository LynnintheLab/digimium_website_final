type Offer = { price: string; discountPrice?: string };
type PriceIssue = { field: 'price' | 'discountPrice'; message: string };

export function parseMmk(raw: string, allowBare = false): number | undefined {
  const value = raw.trim().replace(/[၀-၉]/g, digit => String(digit.charCodeAt(0) - 0x1040));
  const match = /^(\d{1,3}(?:,\d{3})+|\d+)\s*(MMK|Ks|ကျပ်)?$/i.exec(value);
  if (!match || (!match[2] && !allowBare)) return;
  const amount = Number(match[1].replaceAll(',', ''));
  return Number.isSafeInteger(amount) ? amount : undefined;
}

export function discountPriceError(price: string, discountPrice?: string): PriceIssue | undefined {
  if (!discountPrice?.trim()) return;
  const regular = parseMmk(price);
  if (regular === undefined) return { field: 'price', message: 'Enter a regular price in MMK, for example 30,000 MMK.' };
  const sale = parseMmk(discountPrice, true);
  if (sale === undefined) return { field: 'discountPrice', message: 'Enter a whole amount in MMK for the discount price.' };
  if (sale >= regular) return { field: 'discountPrice', message: 'The discount price must be lower than the regular price.' };
}

export function effectivePrice({ price, discountPrice }: Offer): string {
  if (!discountPrice?.trim() || discountPriceError(price, discountPrice)) return price;
  return parseMmk(discountPrice, true)!.toLocaleString('en-US') + ' MMK';
}
