// Disposable Running HUB integration only: no Telegram request reaches the network.
import './resend-fetch.mjs';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { appendFile, readFile } from 'node:fs/promises';

const previousFetch = globalThis.fetch;
const token = process.env.DIGIMIUM_ADMIN_ORDERS_TELEGRAM_BOT_TOKEN;
assert.ok(token?.startsWith('99990001:fixture_'), 'The fixture requires a synthetic dedicated bot.');
let nextMessageId = 1000;

globalThis.fetch = async function runningHubTelegramFixture(input, options) {
  const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
  if (['127.0.0.1', 'localhost'].includes(url.hostname) || url.href === 'https://api.resend.com/emails') return previousFetch(input, options);
  assert.equal(url.origin, 'https://api.telegram.org', 'Unrecognized external provider is blocked.');
  assert.ok(url.pathname.startsWith('/bot' + token + '/'), 'Only the synthetic dedicated bot may be called.');
  const method = url.pathname.split('/').at(-1);
  assert.ok(['sendPhoto', 'sendDocument', 'sendMessage', 'answerCallbackQuery', 'editMessageReplyMarkup'].includes(method), 'Unexpected Telegram method.');
  assert.equal(options?.method, 'POST');
  assert.equal(options?.redirect, 'error');
  let fields, upload;
  if (options.body instanceof FormData) {
    fields = {};
    for (const [name, value] of options.body.entries()) {
      if (typeof value === 'string') fields[name] = value;
      else {
        assert.ok(['photo', 'document'].includes(name), 'Unexpected multipart attachment.');
        const bytes = Buffer.from(await value.arrayBuffer());
        upload = { field: name, size: bytes.length, type: value.type, name: value.name,
          sha256: createHash('sha256').update(bytes).digest('hex') };
      }
    }
  } else fields = JSON.parse(options.body);
  for (const secret of [token, process.env.ADMIN_AUTH_SECRET, process.env.ORDER_FULFILLMENT_SECRET, process.env.DIGIMIUM_ADMIN_ORDERS_TELEGRAM_WEBHOOK_SECRET]) {
    assert.ok(!JSON.stringify(fields).includes(secret), 'Telegram output must not contain application secrets.');
  }
  if (method.startsWith('send')) {
    assert.equal(String(fields.chat_id), process.env.DIGIMIUM_ADMIN_ORDERS_TELEGRAM_OWNER_ID);
    assert.equal(String(fields.message_thread_id), process.env.DIGIMIUM_ADMIN_ORDERS_TELEGRAM_RUNNINGHUB_TOPIC_ID);
    assert.ok(fields.protect_content === true || fields.protect_content === 'true', 'Private receipts and prompts must be protected.');
    assert.equal(fields.parse_mode, undefined, 'Alerts use plain text.');
  }
  if (method === 'sendPhoto' || method === 'sendDocument') assert.ok(upload, 'Proof must be uploaded as private original bytes, never a URL.');
  const messageId = ++nextMessageId;
  await appendFile(process.env.RUNNINGHUB_FIXTURE_LOG, JSON.stringify({ method, fields, upload, messageId }) + '\n', { mode: 0o600 });
  let control = {};
  try { control = JSON.parse(await readFile(process.env.RUNNINGHUB_FIXTURE_CONTROL, 'utf8')); } catch { /* Default successful provider. */ }
  if (control.rejectPhoto && method === 'sendPhoto') return Response.json({ ok: false, error_code: 400, description: 'Bad Request: PHOTO_INVALID_DIMENSIONS' }, { status: 400 });
  if (control.fail) return Response.json({ ok: false, error_code: 503, description: 'Synthetic failure' }, { status: 503 });
  return Response.json({ ok: true, result: method === 'answerCallbackQuery' ? true : { message_id: messageId,
    from: { id: Number(token.split(':')[0]), is_bot: true }, chat: { id: Number(fields.chat_id), type: 'private' },
    ...(fields.message_thread_id ? { message_thread_id: Number(fields.message_thread_id) } : {}),
    ...(fields.text ? { text: fields.text } : {}) } });
};
