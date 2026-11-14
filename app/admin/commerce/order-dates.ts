import { durationPattern } from '../../../lib/duration.ts';

const shopDate = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Yangon', year: 'numeric', month: '2-digit', day: '2-digit',
});

export function todayInMyanmar() {
  return shopDate.format(new Date());
}

export function suggestedEndDate(start: string, duration: string) {
  const match = durationPattern.exec(duration.trim());
  if (!match || !/^\d{4}-\d{2}-\d{2}$/.test(start)) return '';
  const date = new Date(start + 'T00:00:00Z');
  if (!Number.isFinite(date.getTime()) || !date.toISOString().startsWith(start + 'T')) return '';

  function addPeriod(value: number, unit: string) {
    if (unit === 'day') {
      date.setUTCDate(date.getUTCDate() + value);
      return;
    }
    // Clamp Jan 31 + one month to the last day of February.
    const day = date.getUTCDate();
    const months = value * (unit === 'year' ? 12 : 1);
    date.setUTCMonth(date.getUTCMonth() + months + 1, 0);
    date.setUTCDate(Math.min(day, date.getUTCDate()));
  }

  const unit = match[2].toLowerCase();
  const giftUnit = match[4]?.toLowerCase();
  // A month plus a free month is a single two-month subscription.
  if (giftUnit && unit !== 'day' && giftUnit !== 'day') {
    const months = Number(match[1]) * (unit === 'year' ? 12 : 1)
      + Number(match[3]) * (giftUnit === 'year' ? 12 : 1);
    addPeriod(months, 'month');
  } else {
    addPeriod(Number(match[1]), unit);
    if (giftUnit) addPeriod(Number(match[3]), giftUnit);
  }
  if (!Number.isFinite(date.getTime()) || date.getUTCFullYear() > 9999) return '';
  return date.toISOString().slice(0, 10);
}
