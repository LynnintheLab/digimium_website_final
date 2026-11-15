import { getSubscriptionTerm, todayInMyanmar } from './subscription-term.ts';
import { durationText, priceText } from './shop-language.ts';

export type TelegramHistoryView = 'history' | 'plans';
export type TelegramTrackingLine = {
  orderId: string;
  createdAt: string;
  status: 'pending' | 'approved' | 'rejected';
  totalMmk: number | null;
  productName: string;
  planName: string | null;
  duration: string;
  price: string;
  quantity: number;
  startDate: string | null;
  endDate: string | null;
};

export const TELEGRAM_HISTORY_PAGE_LINES = 3;
export const TELEGRAM_HISTORY_TEXT_LIMIT = 3800;
const graphemes = new Intl.Segmenter('my', { granularity: 'grapheme' });

/** Telegram measures plain-message length in UTF-16 units; preserve whole emoji/Myanmar graphemes. */
export function telegramTrackingText(value: string, maximum: number): string {
  const clean = value.normalize('NFC').replace(/[\p{Cc}\u202a-\u202e\u2066-\u2069]/gu, ' ').replace(/\s+/gu, ' ').trim();
  if (clean.length <= maximum) return clean;
  let result = '';
  for (const { segment } of graphemes.segment(clean)) {
    if (result.length + segment.length > maximum - 1) break;
    result += segment;
  }
  return result + '…';
}

function dateLabel(date: string | null): string {
  if (!date || !/^(?!0000)\d{4}-\d{2}-\d{2}$/.test(date)) return 'မသတ်မှတ်ရသေး';
  const parsed = new Date(date + 'T00:00:00Z');
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date ? date : 'မသတ်မှတ်ရသေး';
}

function orderDate(raw: string): string {
  const parsed = new Date(raw);
  return Number.isFinite(parsed.getTime()) ? todayInMyanmar(parsed) : 'မသတ်မှတ်ရသေး';
}

export function telegramTermSummary(startDate: string | null, endDate: string | null, today: string): string[] {
  const term = getSubscriptionTerm(startDate, endDate, today);
  const status = term.status === 'upcoming' ? `🔵 စတင်ရန် ${term.daysUntilStart} ရက် ကျန်`
    : term.status === 'active' ? `${term.daysRemaining! <= 7 ? '🟠' : '🟢'} ${term.daysRemaining} ရက် ကျန်`
    : term.status === 'ends-today' ? '🟠 ယနေ့ သက်တမ်းကုန်မည်'
    : term.status === 'expired' ? '🔴 သက်တမ်းကုန်သွားပါပြီ'
    : '⚪ သက်တမ်းရက် မသတ်မှတ်ရသေးပါ';
  const lines = [status];
  if (term.remainingPercent !== null) {
    const filled = Math.max(0, Math.min(10, Math.round(term.remainingPercent / 10)));
    lines.push('▰'.repeat(filled) + '▱'.repeat(10 - filled));
  }
  lines.push('စရက် — ' + dateLabel(term.startDate));
  lines.push('ကုန်ရက် — ' + dateLabel(term.endDate));
  return lines;
}

export function formatTelegramHistory(input: {
  linked: boolean; view: TelegramHistoryView; lines: TelegramTrackingLine[]; today?: string; hasMore?: boolean;
}): string {
  const { view, linked } = input;
  const today = input.today ?? todayInMyanmar();
  const output = [view === 'history' ? '🧾 အော်ဒါမှတ်တမ်း' : '🛍 ဝယ်ထားသော Plan များ', 'မြန်မာစံတော်ချိန် • ' + today];
  if (!linked) {
    output.push('', 'ဒီ Telegram နဲ့ ချိတ်ထားတဲ့ website အကောင့် မတွေ့သေးပါ။',
      'Website မှာ Telegram ဖြင့် အကောင့်ဝင်ပြီး ထိုအကောင့်နဲ့ ဝယ်ထားတဲ့ အော်ဒါတွေကို ဒီမှာကြည့်နိုင်ပါတယ်။',
      'Google/email ဖြင့် ဝယ်ထားရင် မူလအကောင့်နဲ့ website မှာ ကြည့်ပါ။');
    return output.join('\n');
  }
  const lines = input.lines.slice(0, TELEGRAM_HISTORY_PAGE_LINES);
  if (!lines.length) {
    output.push('', view === 'history' ? 'အော်ဒါမှတ်တမ်း မရှိသေးပါ။' : 'အတည်ပြုပြီးသော ဝယ်ယူမှု မရှိသေးပါ။',
      'ဒီ Telegram အကောင့်နဲ့ website မှာ ဝယ်ယူထားတဲ့ အော်ဒါတွေကို ဒီမှာပြပါမယ်။',
      'အကောင့်မသုံးဘဲ ဝယ်ထားတဲ့ အော်ဒါအတွက် ဆိုင်နဲ့ပြောထားတဲ့ Telegram chat မှာ ပြန်ကြည့်ပါ။',
      'Google/email ဖြင့် ဝယ်ထားရင် မူလအကောင့်နဲ့ website မှာ ကြည့်ပါ။');
    return output.join('\n');
  }
  let previousOrder = '';
  for (const line of lines) {
    if (line.orderId !== previousOrder) {
      output.push('', `အော်ဒါ #${telegramTrackingText(line.orderId.slice(0, 8).toUpperCase(), 8)} • ${orderDate(line.createdAt)}`,
        line.status === 'rejected' ? '❌ ငြင်းပယ်ထားသည်' : line.status === 'pending' ? '⏳ အတည်ပြုရန် စောင့်နေသည်' : '✅ အတည်ပြုပြီး',
        'အော်ဒါစုစုပေါင်း — ' + (line.totalMmk === null ? 'သတ်မှတ်ရန်' : line.totalMmk.toLocaleString('en-US') + ' ကျပ်'));
      previousOrder = line.orderId;
    }
    output.push('', '• ' + telegramTrackingText(line.productName, 100));
    if (line.planName) output.push(telegramTrackingText(line.planName, 140));
    if (line.duration) output.push(telegramTrackingText(durationText(line.duration, 'my'), 60));
    output.push('အရေအတွက် ' + line.quantity + ' • တစ်ခုလျှင် ' + telegramTrackingText(priceText(line.price, 'my'), 60));
    if (line.status === 'approved') output.push(...telegramTermSummary(line.startDate, line.endDate, today));
    else if (line.status === 'pending') output.push('အတည်ပြုပြီးရင် သက်တမ်းရက်တွေ ပြပါမယ်။');
  }
  if (input.hasMore) output.push('', 'နောက်ထပ်မှတ်တမ်းတွေကို အောက်က ခလုတ်နဲ့ ကြည့်နိုင်ပါတယ်။');
  const result = output.join('\n');
  // Fields/pages are bounded above; this last guard also protects future copy changes.
  if (result.length > TELEGRAM_HISTORY_TEXT_LIMIT) throw new Error('Tracking message exceeds its supported length.');
  return result;
}

export type TelegramHistoryCursor = { createdAt: string; orderId: string; line: number };
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

/** A compact public position; the dispatcher authenticates it and every DB read rechecks the sender. */
export function encodeTelegramHistoryCursor(cursor: TelegramHistoryCursor): string {
  const milliseconds = Date.parse(cursor.createdAt);
  if (!Number.isSafeInteger(milliseconds) || milliseconds < 0 || milliseconds >= 2 ** 48 || new Date(milliseconds).toISOString() !== cursor.createdAt || cursor.createdAt.length !== 24 || !uuid.test(cursor.orderId) || !Number.isInteger(cursor.line) || cursor.line < 0 || cursor.line > 3000) throw new Error('Invalid tracking cursor.');
  const bytes = new Uint8Array(24);
  let remainder = milliseconds;
  for (let index = 5; index >= 0; index--) { bytes[index] = remainder % 256; remainder = Math.floor(remainder / 256); }
  const hex = cursor.orderId.replaceAll('-', '');
  for (let index = 0; index < 16; index++) bytes[6 + index] = parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  new DataView(bytes.buffer).setUint16(22, cursor.line);
  return btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

export function decodeTelegramHistoryCursor(raw: string): TelegramHistoryCursor {
  if (!/^[A-Za-z0-9_-]{32}$/.test(raw)) throw new Error('Invalid tracking cursor.');
  const binary = atob(raw.replaceAll('-', '+').replaceAll('_', '/'));
  if (binary.length !== 24) throw new Error('Invalid tracking cursor.');
  const bytes = Uint8Array.from(binary, value => value.charCodeAt(0));
  let milliseconds = 0;
  for (let index = 0; index < 6; index++) milliseconds = milliseconds * 256 + bytes[index];
  const createdAt = new Date(milliseconds).toISOString();
  const hex = Array.from(bytes.subarray(6, 22), value => value.toString(16).padStart(2, '0')).join('');
  const cursor = { createdAt, orderId: `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`, line: new DataView(bytes.buffer).getUint16(22) };
  if (encodeTelegramHistoryCursor(cursor) !== raw) throw new Error('Invalid tracking cursor.');
  return cursor;
}
