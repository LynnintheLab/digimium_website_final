import { randomBytes } from 'node:crypto';
import { writeFile } from 'node:fs/promises';

const origin = 'https://buywith-digimium.store';
const endpoint = origin + '/api/internal/admin-orders-bot/webhook';
const localFile = '.env.admin-orders-bot.local';
const updates = ['message', 'callback_query'];
const [mode, ownerHandle, ...extra] = process.argv.slice(2);
const usage = 'Choose --init, --discover-owner @yourusername, --check, or --apply. Use a private env file for bot credentials.';

async function telegram(token, method, params = {}) {
  let response, body;
  try {
    response = await fetch('https://api.telegram.org/bot' + token + '/' + method, {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(10000),
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(params),
    });
    body = await response.json();
  } catch {
    throw new Error('Telegram could not be reached. Try the same command again.');
  }
  if (!response.ok || body?.ok !== true) throw new Error('Telegram rejected ' + method + '. Check the dedicated token and private chat setup.');
  return body.result;
}

async function setup() {
  if (extra.length || !['--init', '--discover-owner', '--check', '--apply'].includes(mode) ||
      (mode === '--discover-owner' ? !/^@?[A-Za-z][A-Za-z0-9_]{3,31}$/.test(ownerHandle ?? '') : ownerHandle !== undefined)) {
    throw new Error(usage);
  }
  if (mode === '--init') {
    const contents = ['DIGIMIUM_ADMIN_ORDERS_TELEGRAM_BOT_TOKEN=', 'DIGIMIUM_ADMIN_ORDERS_TELEGRAM_OWNER_ID=',
      'DIGIMIUM_ADMIN_ORDERS_TELEGRAM_WEBHOOK_SECRET=' + randomBytes(32).toString('base64url'),
      'DIGIMIUM_ADMIN_ORDERS_TELEGRAM_PAYMENT_TOPIC_ID=', ''].join('\n');
    try { await writeFile(localFile, contents, { mode: 0o600, flag: 'wx' }); }
    catch (error) { throw new Error(error.code === 'EEXIST' ? 'The private setup file already exists.' : 'Could not write the private setup file.'); }
    console.log('Created ' + localFile + ' with a private webhook secret.');
    return;
  }

  const token = process.env.DIGIMIUM_ADMIN_ORDERS_TELEGRAM_BOT_TOKEN?.trim();
  if (!token || !/^\d{1,16}:[\w-]{20,200}$/.test(token) ||
      [process.env.TELEGRAM_BOT_TOKEN, process.env.ADMIN_TELEGRAM_BOT_TOKEN, process.env.ORDER_ALERTS_TELEGRAM_BOT_TOKEN]
        .some(value => value?.trim() === token)) {
    throw new Error('Use the token for the separate Digimium Admin Orders bot.');
  }
  const me = await telegram(token, 'getMe');
  if (me?.is_bot !== true || String(me?.id) !== token.split(':')[0]) throw new Error('The Digimium Admin Orders bot identity could not be verified.');
  const webhook = await telegram(token, 'getWebhookInfo');
  if (webhook.url && webhook.url !== endpoint) throw new Error('This bot already serves a different webhook. Use the separate Digimium Admin Orders bot.');

  if (mode === '--discover-owner') {
    if (webhook.url) throw new Error('The webhook is already connected. Use its existing private owner ID.');
    const handle = ownerHandle.replace(/^@/, '').toLowerCase();
    const records = await telegram(token, 'getUpdates', { allowed_updates: ['message'], limit: 100, timeout: 0 });
    const matches = new Set(records.map(update => update.message)
      .filter(message => message?.chat?.type === 'private' && message?.from?.is_bot === false &&
        message?.from?.id === message?.chat?.id && message?.from?.username?.toLowerCase() === handle)
      .map(message => String(message.chat.id)));
    if (matches.size !== 1) throw new Error('Send /start to the dedicated bot from the Telegram account that matches the supplied username, then retry.');
    console.log('Verified private owner ID:', [...matches][0]);
    return;
  }

  const ownerId = process.env.DIGIMIUM_ADMIN_ORDERS_TELEGRAM_OWNER_ID?.trim();
  const secret = process.env.DIGIMIUM_ADMIN_ORDERS_TELEGRAM_WEBHOOK_SECRET?.trim();
  const topic = process.env.DIGIMIUM_ADMIN_ORDERS_TELEGRAM_PAYMENT_TOPIC_ID?.trim();
  if (!ownerId || !/^[1-9]\d{0,15}$/.test(ownerId) || Number(ownerId) > 2 ** 52 - 1 || ownerId === String(me.id)) {
    throw new Error('Configure the numeric Telegram ID of the store owner.');
  }
  if (!secret || !/^[A-Za-z0-9_-]{32,128}$/.test(secret)) throw new Error('Configure a dedicated private webhook secret of 32–128 characters.');
  if (topic && (!/^[1-9]\d{0,9}$/.test(topic) || Number(topic) < 2 || Number(topic) > 0x7fffffff || me.has_topics_enabled !== true)) {
    throw new Error('Use an existing private Payment approval topic and enable Threaded mode in BotFather, or leave the topic empty.');
  }
  const chat = await telegram(token, 'getChat', { chat_id: ownerId });
  if (chat?.type !== 'private' || String(chat?.id) !== ownerId) throw new Error('The receiving chat is not the verified private owner chat.');

  if (mode === '--apply') {
    // An authenticated empty update confirms the deployed secret without sending a bot message.
    const probe = await fetch(endpoint, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(8000),
      headers: { 'Content-Type': 'application/json', 'X-Telegram-Bot-Api-Secret-Token': secret }, body: '{}' })
      .catch(() => null);
    if (!probe || probe.status !== 200) throw new Error('The production runtime has not accepted the private webhook secret. Set the matching environment values in Hostinger first.');
    const saved = await telegram(token, 'setWebhook', { url: endpoint, secret_token: secret, allowed_updates: updates, drop_pending_updates: false });
    if (saved !== true) throw new Error('Telegram did not confirm the webhook update.');
    const applied = await telegram(token, 'getWebhookInfo');
    if (applied.url !== endpoint || !updates.every(kind => applied.allowed_updates?.includes(kind))) {
      throw new Error('Telegram did not report both order approval update types.');
    }
  }

  console.log(mode === '--apply' ? 'Digimium Admin Orders webhook verified.' : 'Dedicated bot and private owner chat verified.');
}

setup().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
