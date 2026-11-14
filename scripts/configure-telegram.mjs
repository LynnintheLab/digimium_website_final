// Registers the login bot with its active Hostinger app; moving it requires an exact source origin.
// Run with Node 24. Never print request URLs: Telegram embeds the bot token in them.
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseEnv } from 'node:util';

const allowedUpdates = ['message', 'callback_query'];
export class TelegramSetupError extends Error {}

function configuration(env) {
  const token = env.TELEGRAM_BOT_TOKEN?.trim();
  const username = env.TELEGRAM_BOT_USERNAME?.trim().replace(/^@/, '');
  const secret = env.TELEGRAM_WEBHOOK_SECRET?.trim();
  const origin = env.APP_ORIGIN;
  if (!token || !/^\d{5,16}:[A-Za-z0-9_-]{30,100}$/.test(token)) throw new TelegramSetupError('Set a valid TELEGRAM_BOT_TOKEN in the private environment.');
  if (!username || (!/^[A-Za-z][A-Za-z0-9_]{4,31}$/.test(username) || !/bot$/i.test(username))) throw new TelegramSetupError('Set the dedicated bot username in TELEGRAM_BOT_USERNAME.');
  if (!secret || !/^[A-Za-z0-9_-]{32,256}$/.test(secret)) throw new TelegramSetupError('Set a private TELEGRAM_WEBHOOK_SECRET of 32–256 letters, digits, underscores or hyphens.');
  let url;
  try { url = new URL(origin); } catch { throw new TelegramSetupError('Set APP_ORIGIN to the exact public HTTPS website origin.'); }
  if (url.origin !== origin || url.protocol !== 'https:' || url.username || url.password || ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || url.hostname.endsWith('.localhost')) throw new TelegramSetupError('APP_ORIGIN must be the exact public HTTPS website origin, without a path or trailing slash.');
  const botId = Number(token.split(':')[0]);
  if (!Number.isSafeInteger(botId) || botId < 1 || botId > 2 ** 52 - 1) throw new TelegramSetupError('The configured bot token has an invalid bot ID.');
  return { token, username, secret, botId, webhookUrl: origin + '/api/customer/telegram/webhook' };
}

function moveSourceOrigin(value, targetOrigin) {
  let url;
  try { url = new URL(value); } catch { throw new TelegramSetupError('Provide an exact public HTTPS origin for --move-from.'); }
  if (typeof value !== 'string' || url.origin !== value || url.protocol !== 'https:' || url.username || url.password || ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || url.hostname.endsWith('.localhost')) throw new TelegramSetupError('--move-from must be an exact public HTTPS origin, without a path or trailing slash.');
  if (value === targetOrigin) throw new TelegramSetupError('--move-from must be different from the target APP_ORIGIN.');
  return value;
}

async function readResponse(response) {
  const reader = response.body?.getReader();
  if (!reader) throw new TelegramSetupError('Telegram returned an invalid response.');
  const chunks = [];
  let length = 0;
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      length += part.value.length;
      if (length > 65536) {
        await reader.cancel();
        throw new TelegramSetupError('Telegram returned an invalid response.');
      }
      chunks.push(part.value);
    }
    const data = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!response.ok || !data || data.ok !== true || !Object.hasOwn(data, 'result')) throw new TelegramSetupError('Telegram rejected the setup request. Check the private bot settings and try again.');
    return data.result;
  } catch (error) {
    if (error instanceof TelegramSetupError) throw error;
    throw new TelegramSetupError('Telegram returned an invalid response.');
  } finally { reader.releaseLock(); }
}

/** The injectable transport is for local mocked tests; the destination remains fixed. */
export async function configureTelegram(env, { fetchImpl = fetch, moveFrom } = {}) {
  const config = configuration(env);
  const sourceOrigin = moveFrom === undefined ? null : moveSourceOrigin(moveFrom, env.APP_ORIGIN);
  async function api(method, fields = {}) {
    try {
      return await readResponse(await fetchImpl(`https://api.telegram.org/bot${config.token}/${method}`, {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(10000),
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(fields),
      }));
    } catch (error) {
      // Provider/network exceptions can contain the credential-bearing request URL.
      if (error instanceof TelegramSetupError) throw error;
      throw new TelegramSetupError('Could not reach Telegram. Check the network and private bot settings, then try again.');
    }
  }
  const me = await api('getMe');
  if (!me || me.is_bot !== true || me.id !== config.botId || typeof me.username !== 'string' || me.username.toLowerCase() !== config.username.toLowerCase()) throw new TelegramSetupError('The bot token and configured username do not identify the same bot. Nothing was changed.');
  const before = await api('getWebhookInfo');
  if (!before || typeof before.url !== 'string') throw new TelegramSetupError('Telegram returned invalid webhook information. Nothing was changed.');
  if (sourceOrigin) {
    if (before.url !== sourceOrigin + '/api/customer/telegram/webhook') throw new TelegramSetupError('The current webhook does not exactly match --move-from. Nothing was changed.');
  } else if (before.url && before.url !== config.webhookUrl) throw new TelegramSetupError('This bot already uses a different webhook. Use a separate bot or an explicitly approved --move-from origin; the existing webhook was left unchanged.');
  const saved = await api('setWebhook', { url: config.webhookUrl, secret_token: config.secret, allowed_updates: allowedUpdates, drop_pending_updates: false });
  if (saved !== true) throw new TelegramSetupError('Telegram did not confirm the webhook update.');
  const after = await api('getWebhookInfo');
  if (!after || after.url !== config.webhookUrl || !Array.isArray(after.allowed_updates) || after.allowed_updates.length !== allowedUpdates.length || !allowedUpdates.every(value => after.allowed_updates.includes(value))) throw new TelegramSetupError('Telegram webhook verification failed. Recheck the environment settings before enabling login.');
  return { username: me.username, webhookUrl: config.webhookUrl, alreadyConfigured: before.url === config.webhookUrl,
    pendingUpdateCount: Number.isSafeInteger(after.pending_update_count) && after.pending_update_count >= 0 ? after.pending_update_count : 0 };
}

export async function readSetupEnvironment(args, base = process.env) {
  let filename;
  let moveFrom;
  let help = false;
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === '--help' || arg === '-h') { help = true; continue; }
    const flag = /^(--env|--env-file|--move-from)(?:=(.*))?$/.exec(arg);
    if (!flag || (flag[1] === '--move-from' ? moveFrom !== undefined : filename !== undefined)) throw new TelegramSetupError('Usage: node scripts/configure-telegram.mjs --env path/to/private.env [--move-from https://source-origin]');
    const value = flag[2] === undefined ? args[++index] : flag[2];
    if (!value || value.startsWith('--')) throw new TelegramSetupError(flag[1] === '--move-from' ? 'Provide the exact HTTPS source origin after --move-from.' : 'Provide the private environment file path after --env.');
    if (flag[1] === '--move-from') moveFrom = value;
    else filename = value;
  }
  if (help) return { help, env: base, moveFrom };
  if (filename === undefined) return { help, env: base, moveFrom };
  try {
    const contents = await readFile(filename, 'utf8');
    if (Buffer.byteLength(contents) > 65536) throw new Error('Oversized environment file.');
    return { help, env: { ...base, ...parseEnv(contents) }, moveFrom };
  } catch { throw new TelegramSetupError('Cannot read the private environment file. Check its path and permissions.'); }
}

async function main() {
  try {
    const { help, env, moveFrom } = await readSetupEnvironment(process.argv.slice(2));
    if (help) {
      console.log('Register a dedicated Telegram login bot with the existing Hostinger app.\n\nNode 24:\n  node --env-file=path/to/private.env scripts/configure-telegram.mjs\n  node scripts/configure-telegram.mjs --env path/to/private.env\n\nMove only after approving the exact current source origin:\n  node scripts/configure-telegram.mjs --env path/to/target.env --move-from https://source-origin\n\nPrivate keys: APP_ORIGIN, TELEGRAM_BOT_TOKEN, TELEGRAM_BOT_USERNAME, TELEGRAM_WEBHOOK_SECRET.');
      return;
    }
    const result = await configureTelegram(env, { moveFrom });
    console.log(`Telegram login webhook verified for @${result.username}.`);
    console.log(`Website endpoint: ${result.webhookUrl}`);
    console.log(`Pending updates: ${result.pendingUpdateCount}. Bot tokens and webhook secrets were not printed.`);
  } catch (error) {
    console.error(error instanceof TelegramSetupError ? error.message : 'Telegram setup failed. Check the private environment settings.');
    process.exitCode = 1;
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
