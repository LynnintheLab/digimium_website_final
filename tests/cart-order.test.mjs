import { orderTelegramIdentity, orderTelegramMessages } from '../lib/order-telegram.ts';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { discountPriceError, effectivePrice } from '../lib/pricing.ts';
import { orderMessages, resolveOrder, restoreCart, sameItem, telegramDraft, totalMmk, withSelection } from '../lib/cart-order.ts';

const monthly = {id:'monthly', name:'One month', price:'25,000 MMK', duration:'1 month', published:true};
const annual = {...monthly, id:'annual', price:'100,000 MMK', duration:'1 year'};
const product = {id:'service', name:'Service', price:'', duration:'', availability:'available', published:true, plans:[monthly, annual]};
const enquiry = {...product, id:'enquiry', plans:[]};
const qty = quantity => ({productId:product.id, planId:monthly.id, quantity});

test('checkout includes a selected plan once and Add to Cart increments its quantity', () => {
  const existing = [{productId:'service',planId:'annual',quantity:1}];
  const first = withSelection(existing, qty(1), false);
  assert.deepEqual(withSelection(first, qty(1), false), first);
  const afterAdd = withSelection(first, qty(1), true);
  assert.equal(afterAdd.find(item => sameItem(item, qty(1))).quantity, 2);
  assert.equal(totalMmk(resolveOrder(afterAdd, [product])), 150000);
});

test('restore reconciles saved IDs and quantities against current published offers', () => {
  const original = [qty(2), qty(1), {productId:'service',planId:'annual',quantity:1}, qty(-4), {productId:'gone',planId:null,quantity:1}];
  const changed = {...product, plans:[{...monthly,price:'30,000 MMK'},{...annual,published:false}]};
  assert.deepEqual(restoreCart(original,[changed]), [qty(3)]);
  assert.equal(totalMmk(resolveOrder(original,[changed])), 90000);
  assert.deepEqual(restoreCart(original,[{...changed,availability:'unavailable'}]), []);
  assert.deepEqual(restoreCart(original,[{...changed,published:false}]), []);
});

test('a cart with an unpriced service never presents a partial amount as its total', () => {
  const cart = [qty(1), {productId:enquiry.id, planId:null, quantity:1}];
  assert.equal(resolveOrder(cart,[product,enquiry]).length,2);
  assert.equal(totalMmk(resolveOrder(cart,[product,enquiry])),undefined);
});

test('Telegram draft opens with ordinary spaces, line breaks and literal plus signs', () => {
  const message = [
    'Hi Digimium, I’d like to order:',
    '1 × Canva — 1 month (Own Mail) · 25,000 MMK',
    '1 × Disney+ — မိသားစု & Friends #1 (50%)',
    'Total: 50,000 MMK',
  ].join('\n');
  const url = new URL(telegramDraft('@ExampleStore', message));
  const encoded = url.search.slice('?text='.length);
  assert.ok(encoded.includes('%20') && encoded.includes('%0A') && encoded.includes('%2B'));
  assert.ok(!encoded.includes('+'));
  assert.equal(decodeURIComponent(encoded), message);
});

test('splitting long orders accounts for the full URL length of spaces', () => {
  const rows = Array.from({ length: 80 }, (_, i) => `${i + 1} × ${'A + က '.repeat(18)}`);
  const parts = orderMessages('Order', rows, 'Total', (n, total) => `${n}/${total}`);
  assert.deepEqual(parts.flatMap(part => part.split('\n').slice(1)), [...rows, 'Total']);
  for (const part of parts) assert.ok(telegramDraft('@ExampleStore', part).length < 8000);
});

test('long Telegram order preserves every row and opens only the supplied direct DM', () => {
  const rows = Array.from({length:104}, (_, index) => `${index + 1} × ဈေးခြင်း — ${'ကြိုက်နှစ်သက်ရာ'.repeat(9)}`);
  const parts = orderMessages('Order',rows,'Confirm total',(n,total)=>`${n}/${total}`);
  assert.ok(parts.length>1);
  assert.deepEqual(parts.flatMap(part=>part.split('\n').slice(1)), [...rows,'Confirm total']);
  for (const part of parts) {
    assert.ok(Array.from(part).length<=4096);
    const href = new URL(telegramDraft('@ExampleStore',part));
    assert.ok(href.href.length < 8000);
    assert.equal(href.origin,'https://t.me');
    assert.equal(href.pathname,'/ExampleStore');
    assert.equal(href.searchParams.get('text'),part);
    assert.equal(decodeURIComponent(href.search.slice('?text='.length)), part);
  }
  assert.equal(telegramDraft('https://elsewhere.invalid','message'),undefined);
});

test('a restored cart charges current sale prices for the selected plan and standalone services', () => {
  const service = { ...enquiry, price: '10,000 Ks', discountPrice: '၈၀၀၀' };
  const onSale = { ...monthly, discountPrice: '20,000 MMK', duration: '3 months + 1 month free' };
  const withPlans = { ...product, price: '9,000 MMK', discountPrice: '1000', plans: [onSale, annual] };
  const cart = [qty(2), { productId: service.id, planId: null, quantity: 3 }];
  assert.equal(totalMmk(resolveOrder(cart, [withPlans, service])), 64000);
  assert.equal(effectivePrice(service), '8,000 MMK');
  assert.equal(totalMmk(resolveOrder([qty(1)], [{ ...withPlans, plans: [monthly] }])), 25000);
  assert.equal(totalMmk(resolveOrder([qty(1)], [{ ...withPlans, plans: [{ ...onSale, discountPrice: '0' }] }])), 0);
  assert.equal(totalMmk(resolveOrder(cart, [withPlans, enquiry])), undefined);
});

test('discounts require a lower whole MMK amount and preserve ordinary quotes and other currencies', () => {
  for (const invalid of ['25,000 MMK', '26000', '-1', '20,00', '19 USD', '0.25']) {
    assert.equal(discountPriceError(monthly.price, invalid)?.field, 'discountPrice');
    assert.equal(effectivePrice({ price: monthly.price, discountPrice: invalid }), monthly.price);
  }
  for (const invalid of ['', 'Price on enquiry', '30 USD', '9007199254740993 MMK']) {
    assert.equal(discountPriceError(invalid, '10')?.field, 'price');
    assert.equal(discountPriceError(invalid, ''), undefined);
    assert.equal(effectivePrice({ price: invalid }), invalid);
  }
  assert.equal(effectivePrice({ price: '၃၀,၀၀၀ ကျပ်', discountPrice: '၂၅၀၀၀' }), '25,000 MMK');
});

const telegramOrderLine = {
  productName: 'ChatGPT', planName: 'ChatGPT Plus Share - 1 Device', duration: '1 month', price: '38,000 MMK',
  quantity: 1, accountInfo: 'private delivery credential',
};
const telegramOrder = {
  id: '22ced3c4-b727-44e2-b3ab-9d25ce2a64db', lines: [telegramOrderLine], totalMmk: 38000,
};

test('the customer Telegram draft uses the short reference and repeats each purchased unit', () => {
  const identity = { telegramUsername: 'real_buyer', googleEmail: 'buyer+shop@gmail.com',
    name: 'private account name', checkoutContact: 'private manual contact' };
  const item = 'ChatGPT Plus Share - 1 Device · 1 လ — 38,000 ကျပ်';
  const header = ['📦 Order ID — #22CED3C4', '💬 Telegram — @real_buyer', '📧 Gmail — buyer+shop@gmail.com', ''];
  const [single] = orderTelegramMessages(telegramOrder, identity, 'my');
  assert.equal(single, [...header, item, '', '─────', '', '🧾 Total — 38,000 ကျပ်'].join('\n'));
  const [two] = orderTelegramMessages({
    ...telegramOrder, lines: [{ ...telegramOrderLine, quantity: 2 }], totalMmk: 76000,
  }, identity, 'my');
  assert.equal(two, [...header, item, item, '', '─────', '', '🧾 Total — 76,000 ကျပ်'].join('\n'));
  assert.equal(new URL(telegramDraft('DigimiumCheckout', two)).searchParams.get('text'), two);
});

test('the customer Telegram draft shows only available identity rows and localizes prices', () => {
  const email = 'buyer@example.invalid';
  const emailAccount = orderTelegramIdentity({ email, signInMethods: { google: false } });
  const googleAccount = orderTelegramIdentity({ email, signInMethods: { google: true } });
  assert.ok(!orderTelegramMessages(telegramOrder, emailAccount, 'en')[0].includes(email));
  const [google] = orderTelegramMessages(telegramOrder, googleAccount, 'en');
  assert.equal(google, [
    '📦 Order ID — #22CED3C4', '📧 Email — buyer@example.invalid', '',
    'ChatGPT Plus Share - 1 Device · 1 month — 38,000 MMK', '', '─────', '', '🧾 Total — 38,000 MMK',
  ].join('\n'));
  const unpriced = { ...telegramOrder, totalMmk: null,
    lines: [{ ...telegramOrderLine, productName: 'Canva', planName: null, price: '' }] };
  for (const [lang, item, total] of [
    ['en', 'Canva · 1 month — Price on enquiry', 'Price on enquiry'],
    ['my', 'Canva · 1 လ — ဈေးနှုန်း စုံစမ်းရန်', 'ဈေးနှုန်း စုံစမ်းရန်'],
  ]) {
    const [guest] = orderTelegramMessages(unpriced, { telegramUsername: null, googleEmail: null }, lang);
    assert.equal(guest, ['📦 Order ID — #22CED3C4', '', item, '', '─────', '', '🧾 Total — ' + total].join('\n'));
  }
});

test('multipart customer Telegram drafts retain short references, repeated lines and safe direct links', () => {
  const line = { ...telegramOrderLine, quantity: 2 };
  const order = { ...telegramOrder, lines: Array.from({ length: 200 }, () => line), totalMmk: 15200000 };
  const identity = { telegramUsername: 'real_buyer', googleEmail: 'buyer@gmail.com' };
  for (const [lang, item, total] of [
    ['en', 'ChatGPT Plus Share - 1 Device · 1 month — 38,000 MMK', '🧾 Total — 15,200,000 MMK'],
    ['my', 'ChatGPT Plus Share - 1 Device · 1 လ — 38,000 ကျပ်', '🧾 Total — 15,200,000 ကျပ်'],
  ]) {
    const parts = orderTelegramMessages(order, identity, lang);
    assert.ok(parts.length > 1);
    for (const message of parts) {
      assert.ok(message.startsWith('📦 Order ID — #22CED3C4'));
      assert.match(message, /💬 Telegram — @real_buyer/);
      assert.match(message, /📧 Gmail — buyer@gmail\.com/);
      assert.ok(!message.includes(order.id.toUpperCase()) && !message.includes(line.accountInfo));
      const link = new URL(telegramDraft('DigimiumCheckout', message));
      assert.equal(link.origin, 'https://t.me');
      assert.equal(link.pathname, '/DigimiumCheckout');
      assert.equal(link.searchParams.get('text'), message);
      assert.ok(link.href.length < 8000);
    }
    const rows = parts.join('\n').split('\n');
    assert.equal(rows.filter(row => row === item).length, 400);
    assert.equal(rows.filter(row => row === total).length, 1);
    assert.ok(parts.at(-1).endsWith('─────\n\n' + total));
  }
});

test('a bulk quantity stays readable without creating a draft line for every unit', () => {
  const quantity = Number.MAX_SAFE_INTEGER;
  const order = { ...telegramOrder, lines: [{ ...telegramOrderLine, quantity }], totalMmk: null };
  assert.deepEqual(orderTelegramMessages(order, {}, 'en'), [[
    '📦 Order ID — #22CED3C4', '',
    '9,007,199,254,740,991 × ChatGPT Plus Share - 1 Device · 1 month — 38,000 MMK', '',
    '─────', '', '🧾 Total — Price on enquiry',
  ].join('\n')]);
});
