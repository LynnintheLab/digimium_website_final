const adminTimestamp = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Yangon', dateStyle: 'medium', timeStyle: 'short',
});

export function formatAdminTimestamp(value: string | null | undefined): string {
  const time = value ? Date.parse(value) : NaN;
  return Number.isFinite(time) ? adminTimestamp.format(time) + ' MMT' : '';
}

export function cleanAdminTelegramValue(value: string | null | undefined, maximum: number): string {
  const clean = (value ?? '').replace(/[\p{Cc}\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/gu, ' ')
    .replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/gu, '');
  let result = '';
  for (const point of clean) {
    if (result.length + point.length > maximum) break;
    result += point;
  }
  return result.trim();
}

export function formatAdminTelegramNotice(text: string) {
  const newline = text.indexOf('\n');
  // Telegram counts UTF-16 units, including both halves of a supplementary emoji.
  return { text, entities: [{ type: 'bold' as const, offset: 0, length: newline < 0 ? text.length : newline }] };
}

export function formatAdminOrderCustomer(input: {
  name?: string | null;
  email?: string | null;
  telegramId?: string | null;
  telegramUsername?: string | null;
}): string {
  const name = cleanAdminTelegramValue(input.name, 100);
  const email = cleanAdminTelegramValue(input.email, 254);
  const username = /^[A-Za-z0-9_]{5,32}$/.test(input.telegramUsername ?? '') ? input.telegramUsername : null;
  const telegramId = /^[1-9]\d{0,15}$/.test(input.telegramId ?? '') && Number(input.telegramId) <= 2 ** 52 - 1
    ? input.telegramId : null;
  return [
    name && 'Customer: ' + name,
    email && (/@gmail\.com$/i.test(email) ? 'Gmail: ' : 'Email: ') + email,
    username && 'Telegram: @' + username,
    telegramId && 'Telegram ID: ' + telegramId,
  ].filter(Boolean).join('\n');
}

export function formatAdminRegistrationNotice(input: {
  customerId: string;
  authProvider?: 'email' | 'google' | 'telegram';
  name?: string | null;
  email?: string | null;
  telegramUsername?: string | null;
  telegramName?: string | null;
  createdAt?: string | null;
}) {
  const reference = input.customerId.slice(0, 8).toUpperCase();
  const time = formatAdminTimestamp(input.createdAt);
  const name = cleanAdminTelegramValue(input.name, 200);
  const email = cleanAdminTelegramValue(input.email, 254);
  const username = input.telegramUsername && /^[A-Za-z0-9_]{5,32}$/.test(input.telegramUsername)
    ? input.telegramUsername : '';
  const telegramName = input.authProvider === 'telegram' ? cleanAdminTelegramValue(input.telegramName, 200) : '';
  const providers = { email: 'Email', google: 'Google', telegram: 'Telegram' };
  const header = ['👤 Account registration', 'Account ID: #' + reference, time && 'Registered at: ' + time]
    .filter(Boolean).join('\n');
  const details = [
    name && 'Name: ' + name,
    email && 'Email: ' + email,
    username && 'Telegram username: @' + username,
    telegramName && 'Telegram name: ' + telegramName,
    input.authProvider && 'Sign-up method: ' + providers[input.authProvider],
  ].filter(Boolean).join('\n');
  return formatAdminTelegramNotice([header, details].filter(Boolean).join('\n\n'));
}
