export type NotificationAction = { label: string; url: string };

const unsafeText = /[\p{Cc}\u202a-\u202e\u2066-\u2069\uD800-\uDFFF]/u;
const internalPaths = new Set(['/', '/account', '/order-history']);

/** Plain-text button labels share the same validation in the composer and API. */
export function normalizeNotificationActionLabel(raw: string): string | null {
  const value = raw.trim();
  // The Unicode flag treats a valid surrogate pair (for example an emoji) as one point.
  return value.length > 0 && value.length <= 60 && !unsafeText.test(value) ? value : null;
}

/** A notification never accepts executable URLs or an off-site protocol-relative path. */
export function normalizeNotificationActionUrl(raw: string): string | null {
  if (raw.length > 2048) return null;
  const value = raw.trim();
  if (!value || /\s/u.test(value) || unsafeText.test(value) || value.includes('\\')) return null;
  try {
    // Reject disguised controls/backslashes as well as malformed percent encodings.
    const decoded = decodeURIComponent(value);
    if (unsafeText.test(decoded) || decoded.includes('\\')) return null;
    if (value.startsWith('/')) {
      if (value.startsWith('//')) return null;
      const url = new URL(value, 'https://notification.invalid');
      // Only customer-facing destinations with no redirect/query behavior are supported.
      if (url.origin !== 'https://notification.invalid' || !internalPaths.has(url.pathname) || url.search) return null;
      // Do not accept path normalization (encoded separators, dot segments, and aliases).
      const path = value.split('#', 1)[0];
      return internalPaths.has(path) ? url.pathname + url.hash : null;
    }
    if (!/^https:\/\//i.test(value)) return null;
    const url = new URL(value);
    if (url.protocol !== 'https:' || !url.hostname || url.username || url.password) return null;
    return url.href.length <= 2048 ? url.href : null;
  } catch { return null; }
}
