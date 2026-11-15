import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  decodeTelegramHistoryCursor, encodeTelegramHistoryCursor, formatTelegramHistory,
  TELEGRAM_HISTORY_TEXT_LIMIT, telegramTermSummary, telegramTrackingText,
} from '../lib/telegram-history.ts';
import { todayInMyanmar } from '../lib/subscription-term.ts';

const base = {
  orderId: '00000000-0000-4000-8000-000000000001', createdAt: '2026-11-14T17:29:59.999Z',
  status: 'approved', totalMmk: 32000, productName: 'ChatGPT', planName: 'Go Share', duration: '1 month',
  price: '16,000 MMK', quantity: 2, startDate: '2026-11-14', endDate: '2026-12-14',
};

function render(lines = [base], more = {}) {
  return formatTelegramHistory({ linked: true, view: 'history', today: '2026-11-29', lines, ...more });
}

test('approved history uses purchased snapshots, quantity, full-order total and remaining visual', () => {
  const text = render([{...base, accountInfo: 'NEVER_DELIVER_THIS_PASSWORD'}]);
  assert.match(text, /ChatGPT/); assert.match(text, /Go Share/);
  assert.match(text, /အရေအတွက် 2/); assert.match(text, /တစ်ခုလျှင် 16,000 ကျပ်/);
  assert.match(text, /အော်ဒါစုစုပေါင်း — 32,000 ကျပ်/);
  assert.match(text, /15 ရက် ကျန်/); assert.match(text, /▰{5}▱{5}/);
  assert.match(text, /စရက် — 2026-11-14/); assert.match(text, /ကုန်ရက် — 2026-12-14/);
  assert.doesNotMatch(text, /NEVER_DELIVER_THIS_PASSWORD|accountInfo/);
});

test('pending orders never invent active dates; enquiry prices and null totals have readable labels', () => {
  const text = render([{...base, status:'pending', price:'',totalMmk:null}]);
  assert.match(text, /အတည်ပြုရန် စောင့်နေသည်/); assert.match(text, /အော်ဒါစုစုပေါင်း — သတ်မှတ်ရန်/);
  assert.match(text, /ဈေးနှုန်း စုံစမ်းရန်/);
  assert.doesNotMatch(text, /2026-12-14|15 ရက် ကျန်|▰|▱/);
});

test('rejected history keeps the purchase snapshot without dates, remaining visuals, notes or approval guidance', () => {
  const text = render([{...base, status:'rejected', startDate:'2031-04-05', endDate:'2031-05-05',
    customerNote:'PRIVATE-CUSTOMER-NOTE-SENTINEL', accountInfo:'PRIVATE-DELIVERY-SENTINEL'}]);
  assert.match(text, /❌ ငြင်းပယ်ထားသည်/);
  assert.match(text, /ChatGPT/); assert.match(text, /Go Share/);
  assert.match(text, /အော်ဒါစုစုပေါင်း — 32,000 ကျပ်/);
  assert.doesNotMatch(text, /2031-04-05|2031-05-05|စရက် —|ကုန်ရက် —|ရက် ကျန်|▰|▱/);
  assert.doesNotMatch(text, /အတည်ပြုရန် စောင့်နေသည်|အတည်ပြုပြီးရင် သက်တမ်းရက်တွေ ပြပါမယ်|✅ အတည်ပြုပြီး/);
  assert.doesNotMatch(text, /PRIVATE-CUSTOMER-NOTE-SENTINEL|PRIVATE-DELIVERY-SENTINEL|customerNote|accountInfo/);
});

test('Myanmar midnight switches ends-today to expired, including same-day terms', () => {
  const before = todayInMyanmar(new Date('2026-11-14T17:29:59.999Z'));
  const after = todayInMyanmar(new Date('2026-11-14T17:30:00.000Z'));
  assert.match(telegramTermSummary('2026-11-14','2026-11-14',before).join('\n'), /ယနေ့ သက်တမ်းကုန်မည်/);
  assert.match(telegramTermSummary('2026-11-14','2026-11-14',after).join('\n'), /သက်တမ်းကုန်သွားပါပြီ/);
  assert.equal(telegramTermSummary('2026-11-14','2026-11-14',before)[1], '▱'.repeat(10));
});

test('upcoming dates show time until start, not the full service duration as remaining-time label', () => {
  const lines = telegramTermSummary('2026-11-14','2026-12-14','2026-11-12');
  assert.equal(lines[0], '🔵 စတင်ရန် 2 ရက် ကျန်');
  assert.equal(lines[1], '▰'.repeat(10));
  assert.doesNotMatch(lines.join('\n'), /30 ရက် ကျန်/);
});

test('urgent terms, leap days and a year boundary use calendar days', () => {
  assert.match(telegramTermSummary('2026-11-01','2026-11-15','2026-11-08')[0], /^🟠 7 ရက်/);
  assert.match(telegramTermSummary('2026-11-01','2026-11-15','2026-11-07')[0], /^🟢 8 ရက်/);
  assert.match(telegramTermSummary('2028-02-28','2028-03-01','2028-02-28')[0], /2 ရက် ကျန်/);
  assert.match(telegramTermSummary('2026-12-31','2027-01-01','2026-12-31')[0], /1 ရက် ကျန်/);
});

test('missing, invalid and reversed term dates never fabricate a remaining-time bar', () => {
  for (const [start,end] of [[null,null],['2026-02-29','2026-03-01'],['2026-12-01','2026-11-01'],['bad','2026-12-01']]) {
    const text=telegramTermSummary(start,end,'2026-11-15').join('\n');
    assert.match(text,/သက်တမ်းရက် မသတ်မှတ်ရသေးပါ/); assert.doesNotMatch(text,/ရက် ကျန်|▰|▱/);
    assert.doesNotMatch(text,/bad|2026-02-29/);
  }
});

test('long Myanmar/emoji fields stay below Telegram UTF-16 limits and pages never exceed three lines', () => {
  const long = 'ကျောင်းသား 👨‍👩‍👧‍👦 '.repeat(3000);
  const text = render(Array.from({length:4},(_,index)=>({...base,orderId:`00000000-0000-4000-8000-00000000000${index}`, productName:long,planName:long,duration:long,price:long})), {hasMore:true});
  assert.ok(text.length <= TELEGRAM_HISTORY_TEXT_LIMIT);
  assert.equal((text.match(/^• /gm)||[]).length,3);
  assert.doesNotMatch(text,/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u);
  assert.match(text,/နောက်ထပ်မှတ်တမ်း/);
});

test('untrusted catalog text cannot inject control lines; grapheme clipping keeps whole emoji', () => {
  assert.equal(telegramTrackingText('Name\nInjected\tLine\u202e',100),'Name Injected Line');
  const text = telegramTrackingText('👨‍👩‍👧‍👦'.repeat(5),23);
  assert.equal(text,'👨‍👩‍👧‍👦👨‍👩‍👧‍👦…');
  assert.ok(text.length<=23);
});

test('unlinked and empty states explain website Telegram ownership without asking for email/password', () => {
  const unlinked = formatTelegramHistory({linked:false,view:'plans',lines:[],today:'2026-11-15'});
  assert.match(unlinked,/ချိတ်ထားတဲ့ website အကောင့် မတွေ့သေးပါ/);
  assert.match(unlinked,/Telegram ဖြင့် အကောင့်ဝင်/);
  assert.match(unlinked,/Google\/email ဖြင့် ဝယ်ထားရင် မူလအကောင့်/);
  assert.doesNotMatch(unlinked,/password|စကားဝှက်|@/);
  const empty = render([], {view:'plans'});
  assert.match(empty,/အတည်ပြုပြီးသော ဝယ်ယူမှု မရှိသေးပါ/);
  assert.match(empty,/အကောင့်မသုံးဘဲ ဝယ်ထားတဲ့ အော်ဒါ/);
});

test('cursor preserves equal timestamps, UUID tie-break and a large order continuation in32chars', () => {
  for (const line of [0,1,2999,3000]) {
    const cursor = {createdAt:'2026-11-15T01:02:03.004Z',orderId:'12345678-abcd-4000-8000-000000000001',line};
    const encoded = encodeTelegramHistoryCursor(cursor);
    assert.equal(encoded.length,32);assert.match(encoded,/^[A-Za-z0-9_-]{32}$/);
    assert.deepEqual(decodeTelegramHistoryCursor(encoded),cursor);
  }
  const a={createdAt:'2026-11-15T01:02:03.004Z',orderId:base.orderId,line:0};
  const b={...a,orderId:'00000000-0000-4000-8000-000000000002'};
  assert.notEqual(encodeTelegramHistoryCursor(a),encodeTelegramHistoryCursor(b));
});

test('cursor rejects malformed, noncanonical timestamps and unsupported line offsets', () => {
  for(const raw of ['', 'x'.repeat(31),'x'.repeat(33),'!'.repeat(32)])assert.throws(()=>decodeTelegramHistoryCursor(raw));
  for(const cursor of [
    {createdAt:'bad',orderId:base.orderId,line:0},
    {createdAt:'2026-11-15T00:00:00Z',orderId:base.orderId,line:0},
    {createdAt:'2026-11-15T00:00:00.000Z',orderId:'other-customer',line:0},
    {createdAt:'2026-11-15T00:00:00.000Z',orderId:base.orderId,line:-1},
    {createdAt:'2026-11-15T00:00:00.000Z',orderId:base.orderId,line:3001},
  ])assert.throws(()=>encodeTelegramHistoryCursor(cursor));
  const bytes=Buffer.from(encodeTelegramHistoryCursor({createdAt:'2026-11-15T00:00:00.000Z',orderId:base.orderId,line:0}),'base64url');
  bytes.writeUInt16BE(3001,22);assert.throws(()=>decodeTelegramHistoryCursor(bytes.toString('base64url')));
});

test('order creation date is displayed in Myanmar time',()=>{
 const text=render([{...base,createdAt:'2026-11-14T17:30:00.000Z'}]);
 assert.match(text,/အော်ဒါ #00000000 • 2026-11-15/);
});
