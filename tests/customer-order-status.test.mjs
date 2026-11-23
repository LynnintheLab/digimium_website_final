import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { test } from 'node:test';
import { customerOrderStatusCommand, customerOrderStatusLabel, formatCustomerOrderStatus } from '../lib/customer-order-status.ts';

const senderId = '9999100000001';
const id = 'a1234567-abcd-4000-8000-000000000001';
const request = { senderId, chatId: senderId, chatType: 'private', text: '/status' };

test('current status commands require the exact private numeric sender and a bounded command', () => {
  assert.deepEqual(customerOrderStatusCommand(request), {});
  assert.deepEqual(customerOrderStatusCommand({ ...request, text: '/start' }), {});
  assert.deepEqual(customerOrderStatusCommand({ ...request, text: '/status@DigimiumTestingOrdersBot' }), {});
  assert.deepEqual(customerOrderStatusCommand({ ...request, text: `/start order_${id.toUpperCase()}` }), { orderId: id });
  for (const patch of [{ chatType: 'group' }, { chatType: 'supergroup' }, { chatId: '9999100000002' },
    { senderId: '0', chatId: '0' }, { senderId: '4503599627370496', chatId: '4503599627370496' },
    { senderId: '01', chatId: '01' }, { text: '/status ' + 'x'.repeat(200) }, { text: '/help' },
    { text: `/status order_${id}` }, { text: '/start order_--------invalid---------------------' },
    { text: '/start untrusted-link' }, { text: `other /start order_${id}` }]) {
    assert.equal(customerOrderStatusCommand({ ...request, ...patch }), null, JSON.stringify(patch));
  }
});

test('each website checkout stage has a Burmese status and an order rejection wins over stale stages', () => {
  const stages = ['quote_required', 'awaiting_payment', 'payment_review', 'payment_rejected', 'processing', 'completed'];
  const labels = stages.map(stage => customerOrderStatusLabel({ id, stage, rejected: false }));
  assert.equal(new Set(labels).size, stages.length);
  assert.ok(labels.every(label => /[\u1000-\u109f]/.test(label)));
  assert.match(labels[3], /screenshot/);
  assert.equal(customerOrderStatusLabel({ id, stage: 'completed', rejected: true }), 'အော်ဒါ ငြင်းပယ်ထားသည်');
  assert.equal(customerOrderStatusLabel({ id, stage: 'private-unrecognized-value', rejected: false }), 'လက်ရှိအဆင့်ကို website မှာ ကြည့်ပါ');
});

test('status replies stay bounded, protected and project only safe reference/status links', () => {
  const orders = Array.from({ length: 20 }, (_, index) => ({ id: id.slice(0, -2) + String(index).padStart(2, '0'),
    stage: 'payment_review', rejected: false, accountInfo: 'SECRET-ACCOUNT', customerInputs: 'SECRET-INPUT',
    proofUrl: '/private/SECRET-PROOF', payment: { accountNumber: 'SECRET-RECEIVER' }, customerNote: 'SECRET-NOTE' }));
  const result = formatCustomerOrderStatus(senderId, { linked: true, orders });
  assert.equal(result.method, 'sendMessage');
  assert.equal(result.chat_id, Number(senderId));
  assert.equal(result.protect_content, true);
  assert.equal(result.link_preview_options.is_disabled, true);
  assert.equal(result.reply_markup.inline_keyboard.length, 4);
  assert.equal((result.text.match(/အော်ဒါ #/g) || []).length, 3);
  assert.ok(result.text.length < 4096);
  assert.match(result.text, /\/status/);
  assert.doesNotMatch(JSON.stringify(result), /SECRET-|proofUrl|customerInputs|payment|accountInfo|parse_mode/);
  for (const button of result.reply_markup.inline_keyboard.flat()) assert.equal(new URL(button.url).origin, 'https://test.buywith-digimium.store');
  const invalid = formatCustomerOrderStatus(senderId, { linked: true, orders: [{ id: 'https://evil.invalid', stage: 'completed' }] });
  assert.doesNotMatch(JSON.stringify(invalid), /evil/);
});

test('unlinked, missing selected order, and empty website history have distinct recovery guidance', () => {
  const unlinked = formatCustomerOrderStatus(senderId, { linked: false, orders: [] });
  assert.match(unlinked.text, /Account မှာ Telegram ချိတ်ပါ/);
  assert.match(unlinked.text, /\/status/);
  assert.equal(unlinked.reply_markup.inline_keyboard[0][0].url, 'https://test.buywith-digimium.store/account');
  assert.doesNotMatch(unlinked.text, /password|စကားဝှက်|email|အီးမေးလ်/);
  const missing = formatCustomerOrderStatus(senderId, { linked: true, orders: [], requestedOrder: true });
  assert.match(missing.text, /ဒီအော်ဒါကို/);
  const empty = formatCustomerOrderStatus(senderId, { linked: true, orders: [] });
  assert.match(empty.text, /အော်ဒါ မရှိသေးပါ/);
});

registerHooks({ resolve(specifier, context, nextResolve) {
  if (context.parentURL?.endsWith('.ts') && !context.parentURL.includes('/node_modules/') && specifier.startsWith('.') && !/\.[a-z]+$/i.test(specifier)) return nextResolve(specifier + '.ts', context);
  return nextResolve(specifier, context);
} });

test('the customer CTA exposes only the testing order bot handle with valid action configuration', async () => {
  const { customerOrderBotLink, customerOrderTelegramReply } = await import('../hostinger/customer-order-telegram.ts');
  const env = { APP_ORIGIN: 'https://test.buywith-digimium.store', ORDER_ALERTS_TELEGRAM_WEBHOOK_SECRET: 's'.repeat(40),
    ORDER_ALERTS_TELEGRAM_CHAT_ID: senderId, ORDER_ALERTS_TELEGRAM_BOT_TOKEN: '99990001:' + 't'.repeat(32),
    ORDER_ALERTS_TELEGRAM_ORDERS_TOPIC_ID: '11', ORDER_ALERTS_TELEGRAM_PAYMENT_TOPIC_ID: '12',
    ORDER_ALERTS_TELEGRAM_REGISTRATION_TOPIC_ID: '13', ORDER_ALERTS_TELEGRAM_FULFILLMENT_TOPIC_ID: '14',
    ORDER_ALERTS_TELEGRAM_BOT_USERNAME: '', TELEGRAM_BOT_USERNAME: 'ProductionLoginBot', TELEGRAM_BOT_TOKEN: '', ADMIN_TELEGRAM_BOT_TOKEN: '' };
  const before = Object.fromEntries(Object.keys(env).map(key => [key, process.env[key]]));
  try {
    Object.assign(process.env, env);
    assert.equal(customerOrderBotLink(), 'https://t.me/DigimiumTestingOrdersBot');
    process.env.ORDER_ALERTS_TELEGRAM_BOT_USERNAME = '@CustomTestOrderBot';
    assert.equal(customerOrderBotLink(), 'https://t.me/CustomTestOrderBot');
    process.env.ORDER_ALERTS_TELEGRAM_BOT_USERNAME = 'https://evil.invalid/';
    assert.equal(customerOrderBotLink(), undefined);
    process.env.ORDER_ALERTS_TELEGRAM_BOT_USERNAME = '';
    for (const origin of ['https://buywith-digimium.store', 'https://test.buywith-digimium.store.evil.invalid', 'http://test.buywith-digimium.store', '']) {
      process.env.APP_ORIGIN = origin;
      assert.equal(customerOrderBotLink(), undefined);
      assert.equal(await customerOrderTelegramReply(request), null);
    }
    process.env.APP_ORIGIN = env.APP_ORIGIN;
    process.env.ORDER_ALERTS_TELEGRAM_WEBHOOK_SECRET = '';
    assert.equal(customerOrderBotLink(), undefined);
    assert.equal(await customerOrderTelegramReply({ ...request, chatType: 'group' }), null);
    assert.equal(await customerOrderTelegramReply({ ...request, chatId: '9999100000002' }), null);
  } finally { for (const [key, value] of Object.entries(before)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } }
});
