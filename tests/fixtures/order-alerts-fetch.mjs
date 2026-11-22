// Loaded only by the disposable checkout integration server.
import './resend-fetch.mjs';
import assert from 'node:assert/strict';

const guardedFetch = globalThis.fetch;
const fakeToken = '99990001:order_alerts_fixture_1234567890';
const fakeChat = '987654321';
const endpoint = 'https://api.telegram.org/bot' + fakeToken + '/sendMessage';
let mode = process.env.FIXTURE_ORDER_ALERT_FAILURE === '1' ? 'http-error' : 'success';

process.on('message', message => {
  if (message?.type !== 'order-alert-control') return;
  assert.ok(['success', 'http-error', 'ok-false'].includes(message.mode));
  mode = message.mode;
  process.send({ type: 'order-alert-control', id: message.id });
});

globalThis.fetch = async function orderAlertFixtureFetch(input, options) {
  const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
  if (url.href !== endpoint) return guardedFetch(input, options);
  assert.equal(options?.method, 'POST');
  assert.equal(options?.redirect, 'error');
  const fields = JSON.parse(options.body);
  assert.deepEqual(Object.keys(fields).sort(), ['chat_id', 'text', 'message_thread_id', 'protect_content', 'link_preview_options',
    ...(fields.reply_markup ? ['reply_markup'] : [])].sort());
  assert.equal(fields.chat_id, fakeChat);
  assert.ok([11, 12, 13].includes(fields.message_thread_id));
  assert.equal(fields.protect_content, true);
  assert.deepEqual(fields.link_preview_options, { is_disabled: true });
  assert.equal(fields.parse_mode, undefined);
  assert.equal(typeof fields.text, 'string');
  assert.ok(fields.text.length <= 4096 && fields.text.isWellFormed());
  for (const secret of [fakeToken, process.env.ADMIN_AUTH_SECRET, process.env.ORDER_FULFILLMENT_SECRET,
    process.env.NOTIFICATIONS_CRON_SECRET, process.env.ADMIN_TELEGRAM_BOT_TOKEN]) {
    assert.ok(!secret || !JSON.stringify(fields).includes(secret), 'An alert must not disclose private configuration.');
  }
  const safeFields = { text: fields.text, message_thread_id: fields.message_thread_id,
    protect_content: fields.protect_content, link_preview_options: fields.link_preview_options,
    ...(fields.reply_markup ? { reply_markup: fields.reply_markup } : {}) };
  await new Promise((resolve, reject) => process.send({ type: 'order-alert', delivery: mode, fields: safeFields },
    error => error ? reject(error) : resolve()));
  if (mode === 'http-error') return Response.json({ ok: false }, { status: 503 });
  if (mode === 'ok-false') return Response.json({ ok: false });
  return Response.json({ ok: true, result: { message_id: 1 } });
};
