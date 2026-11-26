export type CheckoutContactMethod = 'telegram-username' | 'telegram-phone' | 'viber-phone';

export type CheckoutContact = { method: CheckoutContactMethod; value: string };

export function normalizeCheckoutContact(input: unknown): CheckoutContact | null {
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).length !== 2) return null;
  const { method, value } = input as Record<string, unknown>;
  if (typeof value !== 'string' || value.length > 64 || /\p{Cc}/u.test(value)) return null;

  const trimmed = value.trim();
  if (method === 'telegram-username') {
    const username = trimmed.replace(/^@/, '');
    return /^[a-z0-9_]{5,32}$/i.test(username) ? { method, value: '@' + username } : null;
  }
  if (method === 'telegram-phone' || method === 'viber-phone') {
    const phone = trimmed.replace(/[\u1040-\u1049]/g, digit => String(digit.charCodeAt(0) - 0x1040))
      .replace(/[ ().-]/g, '');
    return /^\+?[0-9]{7,15}$/.test(phone) ? { method, value: phone } : null;
  }
  return null;
}
