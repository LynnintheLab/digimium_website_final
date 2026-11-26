// Loaded only by the disposable checkout integration server.
import './resend-fetch.mjs';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

const guardedFetch = globalThis.fetch;
const fakeToken = '99990001:order_alerts_fixture_1234567890';
const fakeChat = '987654321';
const endpoint = 'https://api.telegram.org/bot' + fakeToken + '/';
const deliveryModes = { admin: process.env.FIXTURE_ORDER_ALERT_FAILURE === '1' ? 'http-error' : 'success', customer: 'success' };

process.on('message', message => {
  if (message?.type !== 'order-alert-control') return;
  assert.ok(['success', 'http-error', 'ok-false', 'forbidden'].includes(message.mode));
  const audience = message.audience || 'admin';
  assert.ok(Object.hasOwn(deliveryModes, audience));
  deliveryModes[audience] = message.mode;
  process.send({ type: 'order-alert-control', id: message.id });
});

globalThis.fetch = async function orderAlertFixtureFetch(input, options) {
  const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
  if (!['sendMessage', 'sendPhoto', 'sendDocument'].some(method => url.href === endpoint + method)) return guardedFetch(input, options);
  assert.equal(options?.method, 'POST');
  assert.equal(options?.redirect, 'error');
  let receipt;
  let fields;
  if (url.href === endpoint + 'sendMessage') fields = JSON.parse(options.body);
  else {
    assert.ok(options.body instanceof FormData);
    const form = options.body;
    const attachment = form.get(url.href.endsWith('/sendPhoto') ? 'photo' : 'document');
    assert.ok(attachment instanceof Blob);
    assert.match(attachment.type, /^image\/(png|jpeg|webp)$/);
    assert.match(attachment.name, /^payment-receipt\.(png|jpg|webp)$/);
    assert.equal(form.get('protect_content'), 'true');
    assert.equal(form.get('message_thread_id'), '11');
    receipt = { hash: createHash('sha256').update(Buffer.from(await attachment.arrayBuffer())).digest('hex'), mime: attachment.type };
    fields = { chat_id: form.get('chat_id'), text: form.get('caption'), message_thread_id: Number(form.get('message_thread_id')),
      protect_content: true, link_preview_options: { is_disabled: true }, reply_markup: JSON.parse(form.get('reply_markup')) };
  }
  const isCustomer = !Object.hasOwn(fields, 'message_thread_id');
  const mode = deliveryModes[isCustomer ? 'customer' : 'admin'];
  assert.deepEqual(Object.keys(fields).sort(), ['chat_id', 'text', 'protect_content', 'link_preview_options',
    ...(!isCustomer ? ['message_thread_id'] : []),
    ...(fields.reply_markup ? ['reply_markup'] : [])].sort());
  if (isCustomer) {
    assert.ok([987654330, 987654331].includes(fields.chat_id));
    assert.equal(receipt, undefined);
    assert.ok(fields.reply_markup.inline_keyboard.flat().every(button => Object.keys(button).sort().join(',') === 'text,url'));
  } else {
    assert.equal(fields.chat_id, fakeChat);
    assert.ok([11, 12, 13, 14].includes(fields.message_thread_id));
  }
  assert.equal(fields.protect_content, true);
  assert.deepEqual(fields.link_preview_options, { is_disabled: true });
  assert.equal(fields.parse_mode, undefined);
  assert.equal(typeof fields.text, 'string');
  assert.ok(fields.text.length <= 4096 && fields.text.isWellFormed());
  for (const secret of [fakeToken, process.env.ADMIN_AUTH_SECRET, process.env.ORDER_FULFILLMENT_SECRET,
    process.env.NOTIFICATIONS_CRON_SECRET, process.env.ADMIN_TELEGRAM_BOT_TOKEN, process.env.ORDER_ALERTS_TELEGRAM_WEBHOOK_SECRET]) {
    assert.ok(!secret || !JSON.stringify(fields).includes(secret), 'An alert must not disclose private configuration.');
  }
  const safeFields = { text: fields.text, ...(isCustomer ? { chat_id: fields.chat_id } : { message_thread_id: fields.message_thread_id }),
    protect_content: fields.protect_content, link_preview_options: fields.link_preview_options,
    ...(fields.reply_markup ? { reply_markup: fields.reply_markup } : {}) };
  await new Promise((resolve, reject) => process.send({ type: isCustomer ? 'customer-order-update' : 'order-alert',
    delivery: mode, fields: safeFields, ...(receipt ? { receipt } : {}) },
    error => error ? reject(error) : resolve()));
  if (mode === 'forbidden') return Response.json({ ok: false }, { status: 403 });
  if (mode === 'http-error') return Response.json({ ok: false }, { status: 503 });
  if (mode === 'ok-false') return Response.json({ ok: false });
  return Response.json({ ok: true, result: { message_id: 1 } });
};
