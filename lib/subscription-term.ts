const DAY_MS = 24 * 60 * 60 * 1000;
const shopDateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Yangon', year: 'numeric', month: '2-digit', day: '2-digit',
});

export type SubscriptionTermStatus = 'upcoming' | 'active' | 'ends-today' | 'expired' | 'unknown';

export interface SubscriptionTermState {
  status: SubscriptionTermStatus;
  startDate: string | null;
  endDate: string | null;
  daysRemaining: number | null;
  daysUntilStart: number | null;
  remainingPercent: number | null;
}

export function todayInMyanmar(now = new Date()): string {
  const parts = shopDateFormatter.formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find(value => value.type === type)?.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

function dateDay(value: string | null): number | null {
  if (!value || !/^(?!0000)\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const milliseconds = Date.parse(`${value}T00:00:00Z`);
  if (!Number.isFinite(milliseconds) || new Date(milliseconds).toISOString().slice(0, 10) !== value) return null;
  return milliseconds / DAY_MS;
}

/** Calendar dates are compared in Myanmar time; elapsed days never depend on the viewer's timezone. */
export function getSubscriptionTerm(
  startDate: string | null,
  endDate: string | null,
  today: string = todayInMyanmar(),
): SubscriptionTermState {
  const start = dateDay(startDate);
  const end = dateDay(endDate);
  const current = dateDay(today);
  const unknown: SubscriptionTermState = {
    status: 'unknown', startDate: start === null ? null : startDate, endDate: end === null ? null : endDate,
    daysRemaining: null, daysUntilStart: null, remainingPercent: null,
  };
  if (start === null || end === null || current === null || end < start) return unknown;

  const dates = { startDate, endDate };
  if (current < start) {
    return { ...dates, status: 'upcoming', daysRemaining: end - start, daysUntilStart: start - current, remainingPercent: 100 };
  }
  // The end date remains visible as "Ends today" for that whole shop calendar date,
  // including same-day subscriptions. It is expired from the following date.
  if (current === end) {
    return { ...dates, status: 'ends-today', daysRemaining: 0, daysUntilStart: 0, remainingPercent: 0 };
  }
  if (current > end) {
    return { ...dates, status: 'expired', daysRemaining: 0, daysUntilStart: 0, remainingPercent: 0 };
  }
  const daysRemaining = end - current;
  return {
    ...dates, status: 'active', daysRemaining, daysUntilStart: 0,
    remainingPercent: (daysRemaining / (end - start)) * 100,
  };
}
