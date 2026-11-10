// The store's previous checkout and its delivery guide both use this order contact.
export const DEFAULT_TELEGRAM_CONTACT = 'LynnIsHeree';

export function normalizeTelegramUsername(value: string): string {
  return value.trim().replace(/^@/, '');
}

export function validTelegramUsername(value: string): boolean {
  const username = normalizeTelegramUsername(value);
  return /^[A-Za-z][A-Za-z0-9_]{4,31}$/.test(username) && !['share', 'login', 'proxy', 'socks', 'iv', 'joinchat', 'addstickers', 'addemoji', 'addlist', 'addtheme', 'confirmphone', 'invoice', 'boost', 'contact'].includes(username.toLowerCase());
}

export function resolveTelegramContact(settings: { telegram?: string }): string {
  if (settings.telegram === undefined) return DEFAULT_TELEGRAM_CONTACT;
  return validTelegramUsername(settings.telegram) ? normalizeTelegramUsername(settings.telegram) : '';
}
