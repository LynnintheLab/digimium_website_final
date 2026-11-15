'use client';

import { useSyncExternalStore } from 'react';
import type { ShopLanguage } from '../../lib/shop-language';
import { getSubscriptionTerm, todayInMyanmar } from '../../lib/subscription-term';
import './subscription-term.css';

const dateListeners = new Set<() => void>();
let dateTimer: ReturnType<typeof setTimeout> | undefined;

function refreshShopDate() {
  dateListeners.forEach(listener => listener());
  clearTimeout(dateTimer);
  if (document.visibilityState === 'hidden' || dateListeners.size === 0) return;
  // Myanmar is UTC+06:30 year-round. Wake once at the next shop midnight.
  const nextMidnight = Date.parse(`${todayInMyanmar()}T00:00:00+06:30`) + 86_400_000;
  dateTimer = setTimeout(refreshShopDate, Math.max(100, nextMidnight - Date.now() + 100));
}

function subscribeShopDate(listener: () => void) {
  dateListeners.add(listener);
  if (dateListeners.size === 1) {
    document.addEventListener('visibilitychange', refreshShopDate);
    window.addEventListener('focus', refreshShopDate);
    refreshShopDate();
  }
  return () => {
    dateListeners.delete(listener);
    if (dateListeners.size === 0) {
      clearTimeout(dateTimer);
      document.removeEventListener('visibilitychange', refreshShopDate);
      window.removeEventListener('focus', refreshShopDate);
    }
  };
}

function serverShopDate() { return ''; }

export interface SubscriptionTermProps {
  startDate: string | null;
  endDate: string | null;
  lang: ShopLanguage;
  compact?: boolean;
}

export function SubscriptionTerm({ startDate, endDate, lang, compact = false }: SubscriptionTermProps) {
  const today = useSyncExternalStore(subscribeShopDate, todayInMyanmar, serverShopDate);
  const term = getSubscriptionTerm(startDate, endDate, today);
  const my = lang === 'my';
  const number = (value: number) => new Intl.NumberFormat(my ? 'my-MM' : 'en-GB').format(value);
  const date = (value: string) => new Intl.DateTimeFormat(my ? 'my-MM' : 'en-GB', {
    dateStyle: 'medium', timeZone: 'UTC',
  }).format(new Date(`${value}T00:00:00Z`));
  const status = {
    upcoming: my ? 'မစတင်သေး' : 'Upcoming',
    active: my ? 'အသုံးပြုနိုင်ဆဲ' : 'Active',
    'ends-today': my ? 'ယနေ့ သက်တမ်းကုန်မည်' : 'Ends today',
    expired: my ? 'သက်တမ်းကုန်ပြီ' : 'Expired',
    unknown: my ? 'ရက်စွဲ မသတ်မှတ်ရသေး' : 'Dates to be confirmed',
  }[term.status];
  let detail = '';
  if (term.status === 'active' && term.daysRemaining !== null) {
    detail = my ? `${number(term.daysRemaining)} ရက် ကျန်` : `${number(term.daysRemaining)} ${term.daysRemaining === 1 ? 'day' : 'days'} left`;
  } else if (term.status === 'upcoming' && term.daysUntilStart !== null) {
    detail = my ? `${number(term.daysUntilStart)} ရက်အကြာ စတင်မည်` : `Starts in ${number(term.daysUntilStart)} ${term.daysUntilStart === 1 ? 'day' : 'days'}`;
  }
  const urgent = term.status === 'ends-today' || (term.status === 'active' && (term.daysRemaining ?? Infinity) <= 7);
  const meterLabel = term.status === 'upcoming'
    ? my ? 'စတင်ရန် ကျန်သောရက်' : 'Days until subscription starts'
    : my ? 'ကျန်ရှိသော သက်တမ်းရက်' : 'Subscription days remaining';
  const pendingDate = my ? 'သတ်မှတ်ရန် ကျန်' : 'To be confirmed';
  const value = term.status === 'upcoming' ? term.daysUntilStart : term.daysRemaining;
  const digits = value === null ? 0 : String(value).length;
  const unit = term.status === 'upcoming' ? (my ? 'ရက်အကြာ' : value === 1 ? 'day to start' : 'days to start')
    : term.status === 'unknown' ? (my ? compact ? 'ရက်စွဲ' : 'ရက်စွဲစောင့်ဆိုင်း' : compact ? 'Dates' : 'Dates pending')
    : (my ? 'ရက်ကျန်' : value === 1 ? 'day left' : 'days left');
  const meterText = [status, detail, term.endDate ? `${my ? 'သက်တမ်းကုန်ရက်' : 'Ends'} ${date(term.endDate)}` : ''].filter(Boolean).join(', ');
  const percent = term.remainingPercent === null ? null : Math.max(0, Math.min(100, term.remainingPercent));
  const filledSegments = percent === null || percent === 0 ? 0 : Math.max(1, Math.round(percent / 100 * 41));
  const durationDays = term.startDate && term.endDate
    ? Math.round((Date.parse(`${term.endDate}T00:00:00Z`) - Date.parse(`${term.startDate}T00:00:00Z`)) / 86_400_000) : 0;
  const maximumDays = value === null ? undefined : Math.max(1, durationDays, value);

  return (
    <div className={`subscription-term${compact ? ' subscription-term-compact' : ''}`} data-status={term.status} data-urgent={urgent || undefined}>
      <div className="subscription-term-visual">
        <div className="subscription-term-gauge" data-long={digits > 3 || undefined} data-extra-long={digits > 5 || undefined}
          role={value === null ? 'img' : 'meter'} aria-label={value === null ? meterText : meterLabel}
          aria-valuemin={value === null ? undefined : 0} aria-valuemax={maximumDays}
          aria-valuenow={value ?? undefined} aria-valuetext={value === null ? undefined : meterText}>
          <svg viewBox="0 0 160 92" aria-hidden="true" focusable="false">
            {Array.from({length: 41}, (_, index) => <rect key={index} x="-1.6" y="-76" width="3.2" height="11"
              transform={`translate(80 82) rotate(${-90 + index * 4.5})`} data-filled={index < filledSegments || undefined} />)}
          </svg>
          <span className="subscription-term-value" aria-hidden="true"><strong>{value === null ? '—' : new Intl.NumberFormat(my ? 'my-MM' : 'en-GB', {useGrouping: false}).format(value)}</strong><span>{unit}</span></span>
        </div>
        <div className="subscription-term-copy">
          <div className="subscription-term-status">
            <span className="subscription-term-label">{status}</span>
            {compact && term.endDate && <span className="subscription-term-expiry">{my ? 'ကုန်ရက်' : 'Ends'} <time dateTime={term.endDate}>{date(term.endDate)}</time></span>}
          </div>
          {!compact && <dl className="subscription-term-dates">
            <div><dt>{my ? 'စတင်ရက်' : 'Start date'}</dt><dd>{term.startDate ? <time dateTime={term.startDate}>{date(term.startDate)}</time> : pendingDate}</dd></div>
            <div><dt>{my ? 'သက်တမ်းကုန်ရက်' : 'End date'}</dt><dd>{term.endDate ? <time dateTime={term.endDate}>{date(term.endDate)}</time> : pendingDate}</dd></div>
          </dl>}
        </div>
      </div>
    </div>
  );
}
