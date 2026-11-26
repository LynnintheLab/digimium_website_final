// Loaded only by the disposable notification integration test and its local server.
import './resend-fetch.mjs';
import assert from 'node:assert/strict';
import { appendFile, readFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';

const previousFetch = globalThis.fetch;
const sharedToken = process.env.NOTIFICATION_FIXTURE_SHARED_TOKEN;
const tokens = [process.env.NOTIFICATION_FIXTURE_TOKEN, process.env.NOTIFICATION_FIXTURE_FALLBACK_TOKEN, sharedToken].filter(Boolean);
assert.ok(tokens.length && tokens.every(token => token.startsWith('99990000:fixture_')));
globalThis.fetch = async function notificationFixtureFetch(input, options) {
  const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
  if (['127.0.0.1', 'localhost'].includes(url.hostname)) return previousFetch(input, options);
  if (url.href === 'https://api.resend.com/emails') return previousFetch(input, options);
  const token = tokens.find(value => url.href === 'https://api.telegram.org/bot' + value + '/sendMessage');
  assert.ok(token, 'External provider call is blocked by the notification fixture.');
  const shared = token === sharedToken;
  assert.equal(options?.method, 'POST');
  assert.equal(options?.redirect, 'error');
  const fields = JSON.parse(options.body);
  assert.equal(fields.chat_id, shared ? process.env.NOTIFICATION_FIXTURE_SHARED_CHAT : process.env.NOTIFICATION_FIXTURE_CHAT);
  assert.equal(typeof fields.text, 'string'); assert.ok(fields.text.length <= 4096);
  assert.ok(fields.text.isWellFormed(), 'Truncated display text must preserve valid Unicode.');
  assert.deepEqual(fields.link_preview_options, { is_disabled: true });
  assert.equal(fields.parse_mode, undefined);
  for (const secret of [process.env.ADMIN_AUTH_SECRET, process.env.ORDER_FULFILLMENT_SECRET, ...tokens]) {
    if (secret) assert.ok(!JSON.stringify(fields).includes(secret), 'Provider payload must not contain an application secret.');
  }
  await appendFile(process.env.NOTIFICATION_FIXTURE_LOG, JSON.stringify({ fields, shared }) + '\n', { mode: 0o600 });
  let control = {};
  try { control = JSON.parse(await readFile(process.env.NOTIFICATION_FIXTURE_CONTROL, 'utf8')); } catch {}
  if (control.delayMs) await delay(control.delayMs, undefined, { signal: options.signal });
  if (control.mode === 'throw') throw new Error('Synthetic delivery failure');
  if (control.mode === 'oversize') return new Response('x'.repeat(20000));
  if (control.mode === 'error') return Response.json({ ok: false }, { status: 503 });
  if (control.mode === 'false') return Response.json({ ok: false });
  return Response.json({ ok: true, result: { message_id: 1 } });
};
