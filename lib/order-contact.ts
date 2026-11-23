export type OrderContact = {
  method: 'telegram' | 'viber' | 'facebook' | 'phone';
  value: string;
};

export const MAX_ORDER_CONTACT_LENGTH = 200;

/** Contact values are private text, never HTML or automatically trusted links. */
export function normalizeOrderContact(input: unknown): OrderContact | null {
  if (!input || typeof input !== 'object' || Array.isArray(input) ||
    !Object.hasOwn(input, 'method') || !Object.hasOwn(input, 'value') ||
    Object.keys(input).some(key => key !== 'method' && key !== 'value')) return null;
  const { method, value: raw } = input as Record<string, unknown>;
  if (typeof raw !== 'string' || raw.length > MAX_ORDER_CONTACT_LENGTH ||
    /[\p{Cc}\p{Cs}\u200e\u200f\u202a-\u202e\u2066-\u2069<>]/u.test(raw)) return null;
  const value = raw.trim().normalize('NFC');
  if (!value) return null;

  if (method === 'telegram') {
    const handle = value
      .replace(/^(?:https:\/\/)?t\.me\//i, '')
      .replace(/^(?:https:\/\/)?([a-z][a-z0-9_]{3,31})\.t\.me\/?$/i, '$1')
      .replace(/^@/, '').replace(/\/$/, '');
    if (!/^[a-z][a-z0-9_]{3,31}$/i.test(handle)) return null;
    return { method, value: '@' + handle.toLowerCase() };
  }

  if (method === 'phone' || method === 'viber') {
    const digits = value.replace(/[၀-၉]/g, digit => String(digit.charCodeAt(0) - 0x1040)).replace(/[\s().-]/g, '');
    if (!/^\+?[0-9]{7,15}$/.test(digits) || /^\+?0+$/.test(digits) || digits.startsWith('+0')) return null;
    return { method, value: digits };
  }

  if (method === 'facebook') {
    if (/^(?:https?:\/\/)?(?:(?:www|m)\.)?facebook\.com(?:\/|$)/i.test(value)) {
      let url: URL;
      try { url = new URL(/^https?:\/\//i.test(value) ? value : 'https://' + value); }
      catch { return null; }
      if (!['facebook.com', 'www.facebook.com', 'm.facebook.com'].includes(url.hostname.toLowerCase()) ||
        url.username || url.password || url.port || url.pathname === '/' || /%(?:0[0-9a-f]|1[0-9a-f]|7f|3c|3e)/i.test(url.pathname)) return null;
      const profileId = url.searchParams.get('id');
      if (url.pathname.toLowerCase() === '/profile.php' && (!profileId || !/^[1-9]\d{0,30}$/.test(profileId))) return null;
      url.protocol = 'https:';
      url.hostname = 'www.facebook.com';
      url.search = url.pathname.toLowerCase() === '/profile.php' ? '?id=' + profileId : '';
      url.hash = '';
      const normalized = url.toString();
      return normalized.length <= MAX_ORDER_CONTACT_LENGTH ? { method, value: normalized } : null;
    }
    // A profile name is allowed, but a link from another service is not a Facebook contact.
    if (value.length < 2 || /^[a-z][a-z\d+.-]*:/i.test(value) || /^(?:www\.)?[^/\s]+\.[^/\s]+\//u.test(value)) return null;
    return { method, value };
  }
  return null;
}
