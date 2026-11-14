import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { isIP } from 'node:net';
import { join } from 'node:path';
import type { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { CommerceError, commerceJson, readCommerceJson } from '../lib/commerce-http';
import { customerMutationAllowed, currentCustomer, ensureCustomerSchema, issueTelegramCustomerSession } from './customer-auth';
import { ensureTelegramIdentitySchema, type TelegramIdentity } from './telegram-identity';
import { getTelegramHistory } from './telegram-history';
import { getPool } from './mysql';

const lifetime = 300;
const tokenPattern = /^[A-Za-z0-9_-]{43}$/;
type ReturnTo = 'account' | 'checkout' | 'history';
type Binding = { id: string; browser: string; exp: number };
type Stage = 'waiting' | 'sending' | 'sent' | 'approved' | 'rejected';
type Flow = { id: string; returnTo: ReturnTo; code: string; options: string[]; created: number; context: string; identity?: TelegramIdentity; messageId?: number };
interface Challenge extends RowDataPacket { id_hash: Buffer; browser_hash: Buffer; stage: Stage; payload: string }
let ready: Promise<void> | undefined;

function configuration() {
  const origin = process.env.APP_ORIGIN;
  const secret = process.env.ADMIN_AUTH_SECRET?.trim();
  const botToken = process.env.TELEGRAM_BOT_TOKEN?.trim();
  const username = process.env.TELEGRAM_BOT_USERNAME?.trim().replace(/^@/, '');
  const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET?.trim();
  if (!origin || !secret || secret.length < 32 || !botToken || !/^\d{5,16}:[A-Za-z0-9_-]{30,100}$/.test(botToken) ||
      !username || !/^[A-Za-z][A-Za-z0-9_]{4,31}$/.test(username) || !/bot$/i.test(username) || !webhookSecret || !/^[A-Za-z0-9_-]{32,256}$/.test(webhookSecret)) return null;
  let url: URL;
  try { url = new URL(origin); } catch { return null; }
  if (url.origin !== origin || url.username || url.password || !(url.protocol === 'https:' || (url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)))) return null;
  return { origin, secret, botToken, username, webhookSecret, botId: botToken.split(':')[0], secure: url.protocol === 'https:', cookie: url.protocol === 'https:' ? '__Host-digimium_telegram' : 'digimium_local_telegram' };
}
function config() { const value = configuration(); if (!value) throw new CommerceError(503, 'unavailable'); return value; }
function hash(value: string) { return createHash('sha256').update(value).digest(); }
function encryptionKey() { const c = config(); return createHmac('sha256', c.secret).update('digimium/telegram-auth/v1\n' + c.origin).digest(); }
function seal(value: unknown, purpose: string) {
  const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  cipher.setAAD(Buffer.from(purpose));
  const bytes = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), bytes]).toString('base64url');
}
function unseal<T>(value: string, purpose: string): T {
  const bytes = Buffer.from(value, 'base64url'); if (bytes.length < 29) throw new Error('Invalid authentication envelope.');
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), bytes.subarray(0, 12));
  decipher.setAAD(Buffer.from(purpose)); decipher.setAuthTag(bytes.subarray(12, 28));
  return JSON.parse(Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString('utf8'));
}
function authCookie(value: string, age = lifetime) { const c = config(); return `${c.cookie}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${age}${c.secure ? '; Secure' : ''}`; }
function cookieValue(request: Request, name: string) { return (request.headers.get('cookie') || '').split(';').map(part => part.trim()).find(part => part.startsWith(name + '='))?.slice(name.length + 1); }
function binding(request: Request): Binding | null {
  const value = cookieValue(request, config().cookie); if (!value || value.length > 1500 || !/^[A-Za-z0-9_-]+$/.test(value)) return null;
  try { const item = unseal<Binding>(value, 'browser'), now = Math.floor(Date.now() / 1000); return tokenPattern.test(item.id) && tokenPattern.test(item.browser) && Number.isInteger(item.exp) && item.exp > now && item.exp <= now + lifetime ? item : null; } catch { return null; }
}
function receiptName() { return config().secure ? '__Host-digimium_telegram_result' : 'digimium_local_telegram_result'; }
function receiptCookie(customerId?: string, flowId?: string) {
  const c = config(); const value = customerId ? seal({ customerId, flowId, exp: Math.floor(Date.now() / 1000) + 120 }, 'result') : '';
  return `${receiptName()}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${customerId ? 120 : 0}${c.secure ? '; Secure' : ''}`;
}
function receipt(request: Request): { customerId: string; flowId: string; exp: number } | null {
  const value = cookieValue(request, receiptName()); if (!value || value.length > 1500 || !/^[A-Za-z0-9_-]+$/.test(value)) return null;
  try { const item = unseal<{ customerId: string; flowId: string; exp: number }>(value, 'result'), now = Math.floor(Date.now() / 1000); return /^[a-f0-9-]{36}$/.test(item.customerId) && tokenPattern.test(item.flowId) && Number.isInteger(item.exp) && item.exp > now && item.exp <= now + 120 ? item : null; } catch { return null; }
}
async function ensureSchema() {
  return ready ??= (async () => { await ensureCustomerSchema(); await getPool().query(await readFile(join(process.cwd(), 'hostinger/telegram-auth-schema.sql'), 'utf8')); })().catch(error => { ready = undefined; throw error; });
}
async function claim(scope: string, maximum: number, seconds = 900) {
  const bucket = Math.floor(Date.now() / 900000), scopeHash = hash('telegram:' + seconds + ':' + scope + (seconds < 900 ? ':' + Math.floor(Date.now() / (seconds * 1000)) : ''));
  await getPool().execute('INSERT IGNORE INTO digimium_customer_auth_limits (bucket, scope_hash) VALUES (?, ?)', [bucket, scopeHash]);
  const [result] = await getPool().execute<ResultSetHeader>('UPDATE digimium_customer_auth_limits SET attempts = attempts + 1 WHERE bucket = ? AND scope_hash = ? AND attempts < ?', [bucket, scopeHash, maximum]);
  return result.affectedRows === 1;
}
async function limit(request: Request, action: 'start' | 'complete') {
  if (!await claim(action + ':all', action === 'start' ? 900 : 500)) throw new CommerceError(429, 'rate_limited');
  const ip = request.headers.get('x-forwarded-for')?.split(',').at(-1)?.trim();
  if (ip && isIP(ip) && !await claim(action + ':ip:' + ip, action === 'start' ? 40 : 100)) throw new CommerceError(429, 'rate_limited');
}
function purpose(idHash: Buffer) { return 'challenge:' + idHash.toString('base64url'); }
function unpack(row: Challenge) { return unseal<Flow>(row.payload, purpose(row.id_hash)); }
function pack(flow: Flow) { return seal(flow, purpose(hash(flow.id))); }
function publicFlow(flow: Flow) { return { flow: flow.id, code: flow.code, url: `https://t.me/${config().username}?start=login_${flow.id}`, expiresAt: new Date((flow.created + lifetime) * 1000).toISOString(), returnTo: flow.returnTo }; }
function errorReply(error: unknown) {
  const safe = error instanceof CommerceError && ['invalid', 'origin', 'rate_limited', 'expired', 'cancelled'].includes(error.message) ? error.message : 'unavailable';
  return commerceJson({ error: safe }, error instanceof CommerceError ? error.status : 503);
}
function requestedFlow(request: Request) {
  const params = new URL(request.url).searchParams;
  if ([...params.keys()].some(key => key !== 'flow') || params.getAll('flow').length > 1 || (params.has('flow') && !tokenPattern.test(params.get('flow')!))) throw new CommerceError(400, 'invalid');
  return params.get('flow');
}
function browserContext(request: Request) {
  const ua = (request.headers.get('user-agent') || '').slice(0, 1000);
  const browser = /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
  const device = /iPhone|iPad/.test(ua) ? 'iPhone / iPad' : /Android/.test(ua) ? 'Android' : /Windows/.test(ua) ? 'Windows' : /Macintosh|Mac OS/.test(ua) ? 'Mac' : /Linux/.test(ua) ? 'Linux' : 'Device';
  return browser + ' · ' + device;
}
export function telegramCapabilities() { return commerceJson({ enabled: !!configuration() }); }
export async function telegramStart(request: Request) {
  if (!customerMutationAllowed(request)) return commerceJson({ error: 'origin' }, 403);
  try {
    config(); const body = await readCommerceJson(request, 1024);
    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length !== 1 || !['account', 'checkout', 'history'].includes((body as { returnTo: string }).returnTo)) throw new CommerceError(400, 'invalid');
    await ensureSchema(); await limit(request, 'start');
    const previous = binding(request);
    if (previous) await getPool().execute('DELETE FROM digimium_telegram_auth_challenges WHERE id_hash = ? AND browser_hash = ?', [hash(previous.id), hash(previous.browser)]);
    await getPool().execute('DELETE FROM digimium_telegram_auth_challenges WHERE expires_at <= UTC_TIMESTAMP() LIMIT 100');
    await getPool().execute('DELETE FROM digimium_customer_auth_limits WHERE bucket < ? LIMIT 100', [Math.floor(Date.now() / 900000) - 1]);
    const created = Math.floor(Date.now() / 1000), id = randomBytes(32).toString('base64url');
    const code = String(randomInt(10000)).padStart(4, '0'), options = [code];
    while (options.length < 4) { const option = String(randomInt(10000)).padStart(4, '0'); if (!options.includes(option)) options.push(option); }
    for (let index = options.length - 1; index > 0; index--) { const next = randomInt(index + 1); [options[index], options[next]] = [options[next], options[index]]; }
    const flow: Flow = { id, returnTo: (body as { returnTo: ReturnTo }).returnTo, code, options, created, context: browserContext(request) };
    const browser: Binding = { id, browser: randomBytes(32).toString('base64url'), exp: created + lifetime };
    await getPool().execute("INSERT INTO digimium_telegram_auth_challenges (id_hash, browser_hash, stage, payload, expires_at) VALUES (?, ?, 'waiting', ?, DATE_ADD(UTC_TIMESTAMP(), INTERVAL ? SECOND))", [hash(id), hash(browser.browser), pack(flow), lifetime]);
    const response = commerceJson(publicFlow(flow)); response.headers.append('Set-Cookie', authCookie(seal(browser, 'browser'))); response.headers.append('Set-Cookie', receiptCookie()); return response;
  } catch (error) { return errorReply(error); }
}
export async function telegramPending(request: Request) {
  if (!configuration()) return commerceJson({ status: 'none' });
  try {
    const expected = requestedFlow(request), browser = binding(request);
    if (browser && (!expected || expected === browser.id)) {
      await ensureSchema();
      if (!await claim('poll:' + hash(browser.browser).toString('hex'), 180, 60)) throw new CommerceError(429, 'rate_limited');
      const [rows] = await getPool().execute<Challenge[]>('SELECT id_hash, browser_hash, stage, payload FROM digimium_telegram_auth_challenges WHERE id_hash = ? AND browser_hash = ? AND expires_at > UTC_TIMESTAMP()', [hash(browser.id), hash(browser.browser)]);
      if (rows[0]) { const flow = unpack(rows[0]); return commerceJson({ status: rows[0].stage === 'approved' ? 'approved' : rows[0].stage === 'rejected' ? 'rejected' : 'waiting', ...publicFlow(flow) }); }
    }
    const completed = receipt(request);
    if (completed && (!expected || completed.flowId === expected) && (!browser || browser.id === completed.flowId)) {
      const customer = await currentCustomer(request); if (customer?.id === completed.customerId) return commerceJson({ status: 'success', customer });
    }
    return commerceJson({ status: browser && (!expected || expected === browser.id) ? 'expired' : 'none' });
  } catch (error) { return errorReply(error); }
}
export async function telegramCancel(request: Request) {
  if (!customerMutationAllowed(request)) return commerceJson({ error: 'origin' }, 403);
  if (!configuration()) return commerceJson({ status: 'none' });
  try {
    const expected = requestedFlow(request), browser = binding(request);
    if (browser && (!expected || browser.id === expected)) { await ensureSchema(); await getPool().execute('DELETE FROM digimium_telegram_auth_challenges WHERE id_hash = ? AND browser_hash = ?', [hash(browser.id), hash(browser.browser)]); }
    // Do not erase a binding cookie here: a delayed cancellation response must not erase a newer flow.
    return commerceJson({ status: 'none' });
  } catch (error) { return errorReply(error); }
}
export async function telegramComplete(request: Request) {
  if (!customerMutationAllowed(request)) return commerceJson({ error: 'origin' }, 403);
  try {
    config(); const body = await readCommerceJson(request, 1024);
    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length !== 1 || !tokenPattern.test((body as { flow: string }).flow)) throw new CommerceError(400, 'invalid');
    const flowId = (body as { flow: string }).flow, browser = binding(request);
    if (!browser || browser.id !== flowId) throw new CommerceError(400, 'expired');
    await ensureSchema(); await limit(request, 'complete');
    const [rows] = await getPool().execute<Challenge[]>("SELECT id_hash, browser_hash, stage, payload FROM digimium_telegram_auth_challenges WHERE id_hash = ? AND browser_hash = ? AND stage = 'approved' AND expires_at > UTC_TIMESTAMP()", [hash(browser.id), hash(browser.browser)]);
    if (!rows[0]) {
      const completed = receipt(request), customer = completed?.flowId === flowId ? await currentCustomer(request) : null;
      if (customer && completed?.customerId === customer.id) return commerceJson({ customer });
      throw new CommerceError(400, 'expired');
    }
    const flow = unpack(rows[0]); if (!flow.identity) throw new CommerceError(400, 'invalid');
    await ensureTelegramIdentitySchema();
    const response = await issueTelegramCustomerSession(request, flow.identity, { idHash: hash(browser.id), browserHash: hash(browser.browser), stage: 'approved' });
    const data = await response.clone().json() as { customer?: { id?: string } }; if (!data.customer?.id) throw new Error('Missing customer.');
    response.headers.append('Set-Cookie', receiptCookie(data.customer.id, flowId)); return response;
  } catch (error) { return errorReply(error); }
}

type TelegramUser = { id: number; is_bot: boolean; first_name?: unknown; last_name?: unknown; username?: unknown };
type TelegramMessage = { message_id: number; date: number; chat: { id: number; type: string }; from?: TelegramUser; text?: unknown };
type TelegramCallback = { id?: unknown; from?: TelegramUser; data?: unknown; message?: TelegramMessage };
function telegramId(value: unknown): value is number { return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 && value <= 2 ** 52 - 1; }
function safeName(value: unknown, fallback = '') { return typeof value === 'string' && value.trim().length <= 100 && !/\p{Cc}/u.test(value) ? value.trim() : fallback; }
function sender(user?: TelegramUser): TelegramIdentity | null {
  if (!user || !telegramId(user.id) || user.is_bot !== false) return null;
  const firstName = safeName(user.first_name); if (!firstName) return null;
  const username = typeof user.username === 'string' && /^[A-Za-z][A-Za-z0-9_]{0,31}$/.test(user.username) ? user.username : undefined;
  const lastName = safeName(user.last_name); return { id: String(user.id), firstName, ...(lastName ? { lastName } : {}), ...(username ? { username } : {}) };
}
async function botApi(method: 'sendMessage' | 'answerCallbackQuery' | 'editMessageText', fields: object) {
  const response = await fetch(`https://api.telegram.org/bot${config().botToken}/${method}`, { method: 'POST', signal: AbortSignal.timeout(8000), redirect: 'error', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(fields) });
  const reader = response.body?.getReader(); if (!reader) throw new Error('Missing bot response.');
  const chunks: Uint8Array[] = []; let bytes = 0;
  try { for (;;) { const part = await reader.read(); if (part.done) break; bytes += part.value.length; if (bytes > 65536) { await reader.cancel(); throw new Error('Oversized bot response.'); } chunks.push(part.value); } } finally { reader.releaseLock(); }
  const result = JSON.parse(Buffer.concat(chunks).toString('utf8')) as { ok?: boolean; result?: TelegramMessage };
  if (!response.ok || result.ok !== true) throw new Error('Bot request failed.'); return result.result;
}
async function bestEffort(method: 'answerCallbackQuery' | 'editMessageText', fields: object) { try { await botApi(method, fields); } catch { /* Auth state is authoritative; Telegram UI cleanup may be retried by the user. */ } }

type NavigationView = 'm' | 'h' | 'p';
type BotButton = { text: string; callback_data?: string; url?: string };
const navigationLifetime = 24 * 60 * 60;
const menuText = 'Digimium\n\nအော်ဒါမှတ်တမ်းနဲ့ ဝယ်ထားတဲ့ plan သက်တမ်းတွေကို အောက်ကခလုတ်တွေကနေ စစ်နိုင်ပါတယ်။\n\nWebsite မှာ ဝယ်ယူခဲ့တဲ့ အကောင့်ကို Telegram ဖြင့် ဝင်ထားရန် လိုပါတယ်။';

function navigationSignature(userId: string, messageId: number, view: NavigationView, cursor: string, expires: number) {
  const c = config();
  const key = createHmac('sha256', c.secret).update('digimium/telegram-navigation/v1\n' + c.origin).digest();
  return createHmac('sha256', key).update(JSON.stringify([userId, userId, messageId, view, cursor, expires])).digest().subarray(0, 12).toString('base64url');
}
function navigationData(userId: string, messageId: number, view: NavigationView, cursor = '-', expires = Math.floor(Date.now() / 1000) + navigationLifetime) {
  if (!telegramId(Number(userId)) || !telegramId(messageId) || !/^(?:-|[A-Za-z0-9_-]{32})$/.test(cursor) || (view === 'm' && cursor !== '-')) throw new Error('Invalid bot navigation.');
  const value = `th1.${view}.${cursor}.${expires.toString(36)}.${navigationSignature(userId, messageId, view, cursor, expires)}`;
  if (Buffer.byteLength(value, 'utf8') > 64) throw new Error('Oversized bot navigation.');
  return value;
}
function readNavigation(data: string, userId: string, messageId: number): { view: NavigationView; cursor?: string; expired: boolean } | null {
  const match = /^th1\.([mhp])\.(-|[A-Za-z0-9_-]{32})\.([0-9a-z]{1,7})\.([A-Za-z0-9_-]{16})$/.exec(data);
  if (!match || Buffer.byteLength(data, 'utf8') > 64 || (match[1] === 'm' && match[2] !== '-')) return null;
  const expires = Number.parseInt(match[3], 36), now = Math.floor(Date.now() / 1000);
  if (!Number.isSafeInteger(expires) || expires.toString(36) !== match[3] || expires > now + navigationLifetime + 60) return null;
  const signature = navigationSignature(userId, messageId, match[1] as NavigationView, match[2], expires);
  if (!timingSafeEqual(Buffer.from(signature), Buffer.from(match[4]))) return null;
  return { view: match[1] as NavigationView, ...(match[2] !== '-' ? { cursor: match[2] } : {}), expired: expires <= now };
}
function mainButtons(userId: string, messageId: number): BotButton[][] {
  return [[
    { text: '📋 အော်ဒါမှတ်တမ်း', callback_data: navigationData(userId, messageId, 'h') },
    { text: '⏳ Plan သက်တမ်း', callback_data: navigationData(userId, messageId, 'p') },
  ], [{ text: 'Website ဖွင့်မယ် ↗', url: config().origin }]];
}
async function botPage(userId: string, messageId: number, view: NavigationView, cursor?: string, loaded?: Awaited<ReturnType<typeof getTelegramHistory>>) {
  if (view === 'm') return { text: menuText, reply_markup: { inline_keyboard: mainButtons(userId, messageId) } };
  const page = loaded ?? await getTelegramHistory(userId, { view: view === 'h' ? 'history' : 'plans', ...(cursor ? { cursor } : {}) });
  const rows: BotButton[][] = [];
  if (page.linked) {
    if (page.nextCursor) rows.push([{ text: 'နောက်ထပ် →', callback_data: navigationData(userId, messageId, view, page.nextCursor) }]);
    rows.push([
      { text: '↻ ပြန်စစ်မယ်', callback_data: navigationData(userId, messageId, view, cursor) },
      ...(cursor ? [{ text: 'အစမှ', callback_data: navigationData(userId, messageId, view) }] : []),
    ]);
    rows.push([{ text: '🏠 Menu', callback_data: navigationData(userId, messageId, 'm') },
      { text: 'Website မှာကြည့်မယ် ↗', url: config().origin + '/order-history' }]);
  } else {
    rows.push([{ text: 'Website မှာ Telegram ဖြင့် ဝင်မယ် ↗', url: config().origin + '/account' }],
      [{ text: '🏠 Menu', callback_data: navigationData(userId, messageId, 'm') }]);
  }
  return { text: page.text, reply_markup: { inline_keyboard: rows } };
}
function validSentMessage(message: TelegramMessage | undefined, userId: string): message is TelegramMessage {
  return !!message && telegramId(message.message_id) && message.chat?.type === 'private' && String(message.chat.id) === userId &&
    String(message.from?.id) === config().botId && message.from?.is_bot === true;
}
async function sendBotPage(userId: string, view: NavigationView) {
  // Bind buttons to the actual Telegram message ID. The initial text contains no reusable navigation capability.
  const initial = view === 'm' ? undefined : await getTelegramHistory(userId, { view: view === 'h' ? 'history' : 'plans' });
  const sent = await botApi('sendMessage', { chat_id: userId, text: initial?.text ?? menuText, protect_content: true, link_preview_options: { is_disabled: true } });
  if (!validSentMessage(sent, userId)) throw new Error('Invalid bot response.');
  const page = await botPage(userId, sent.message_id, view, undefined, initial);
  await bestEffort('editMessageText', { chat_id: userId, message_id: sent.message_id, ...page, link_preview_options: { is_disabled: true } });
}
async function navigationFromBot(query: TelegramCallback, identity: TelegramIdentity, message: TelegramMessage) {
  const selected = readNavigation(String(query.data), identity.id, message.message_id);
  // Unauthenticated/cross-user payloads cannot amplify requests into Bot API calls.
  if (!selected) return;
  if (!await claim('navigation:all', 3600) || !await claim('navigation:user:' + identity.id, 120)) return;
  await bestEffort('answerCallbackQuery', { callback_query_id: query.id, ...(selected.expired ? { text: 'Menu အသစ် ပြန်ဖွင့်ပေးလိုက်ပါတယ်။' } : {}) });
  const page = await botPage(identity.id, message.message_id, selected.expired ? 'm' : selected.view, selected.expired ? undefined : selected.cursor);
  await bestEffort('editMessageText', { chat_id: identity.id, message_id: message.message_id, ...page, link_preview_options: { is_disabled: true } });
}
async function startFromBot(message: TelegramMessage) {
  const identity = sender(message.from);
  if (!identity || message.chat?.type !== 'private' || message.chat.id !== message.from!.id || !telegramId(message.message_id) || !Number.isInteger(message.date)) return;
  const text = typeof message.text === 'string' ? message.text : '';
  const command = new RegExp('^/start(?:@' + config().username + ')? login_([A-Za-z0-9_-]{43})$','i').exec(text);
  if (!command) {
    const menuCommand = new RegExp('^/(start|menu|help|history|plans)(?:@' + config().username + ')?$','i').exec(text.trim());
    if (menuCommand && await claim('menu:all', 1800) && await claim('menu:user:' + identity.id, 90)) {
      const requested = menuCommand[1].toLowerCase();
      await sendBotPage(identity.id, requested === 'history' ? 'h' : requested === 'plans' ? 'p' : 'm');
    }
    return;
  }
  if (!await claim('bot:all', 900) || !await claim('bot:user:' + identity.id, 25)) return;
  const idHash = hash(command[1]), callback = randomBytes(32).toString('base64url'), connection = await getPool().getConnection();
  let flow: Flow | undefined;
  try {
    await connection.beginTransaction();
    const [rows] = await connection.execute<Challenge[]>('SELECT id_hash, browser_hash, stage, payload FROM digimium_telegram_auth_challenges WHERE id_hash = ? AND expires_at > UTC_TIMESTAMP() FOR UPDATE', [idHash]);
    if (rows[0]?.stage !== 'waiting') { await connection.commit(); return; }
    flow = unpack(rows[0]); if (message.date < flow.created - 30 || message.date > Math.floor(Date.now() / 1000) + 30) { await connection.commit(); return; }
    flow.identity = identity;
    await connection.execute("UPDATE digimium_telegram_auth_challenges SET stage = 'sending', callback_hash = ?, payload = ? WHERE id_hash = ?", [hash(callback), pack(flow), idHash]);
    await connection.commit();
  } catch (error) { await connection.rollback(); throw error; } finally { connection.release(); }
  if (!flow) return;
  let sent: TelegramMessage | undefined;
  try {
    const buttons = flow.options.map((option, index) => ({ text: option, callback_data: `tg1.${callback}.${index}` }));
    sent = await botApi('sendMessage', { chat_id: identity.id, text: `🔐 Digimium Website Login\n${new URL(config().origin).hostname}\n${flow.context}\n\nWebsite မှာ ပြထားတဲ့ code နဲ့ တူတဲ့ နံပါတ်ကို ရွေးပါ။\nကိုယ်တိုင် မစတင်ထားရင် Reject ကိုနှိပ်ပါ။`, reply_markup: { inline_keyboard: [buttons.slice(0, 2), buttons.slice(2), [{ text: '❌ ကျွန်ုပ် မဟုတ်ပါ / Reject', callback_data: `tg1.${callback}.4` }]] }, protect_content: true });
    if (!sent || !telegramId(sent.message_id) || sent.chat?.type !== 'private' || String(sent.chat.id) !== identity.id || String(sent.from?.id) !== config().botId || sent.from?.is_bot !== true) throw new Error('Invalid bot response.');
    flow.messageId = sent.message_id;
    const [saved] = await getPool().execute<ResultSetHeader>("UPDATE digimium_telegram_auth_challenges SET stage = 'sent', payload = ? WHERE id_hash = ? AND callback_hash = ? AND stage = 'sending' AND expires_at > UTC_TIMESTAMP()", [pack(flow), idHash, hash(callback)]);
    if (!saved.affectedRows) await bestEffort('editMessageText', { chat_id: identity.id, message_id: sent.message_id, text: 'ဒီ login request ကို ပယ်ဖျက်ထားပါတယ် သို့မဟုတ် သက်တမ်းကုန်သွားပါပြီ။', reply_markup: { inline_keyboard: [] } });
  } catch (error) {
    // A lost send acknowledgement must never leave an approveable but unbound keyboard.
    const retry: Flow = { ...flow }; delete retry.identity; delete retry.messageId;
    await getPool().execute("UPDATE digimium_telegram_auth_challenges SET stage = 'waiting', callback_hash = NULL, payload = ? WHERE id_hash = ? AND callback_hash = ? AND stage = 'sending'", [pack(retry), idHash, hash(callback)]);
    throw error;
  }
}
async function callbackFromBot(query: TelegramCallback) {
  const identity = sender(query.from), message = query.message;
  if (!identity || typeof query.id !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(query.id) || typeof query.data !== 'string' || !message || message.chat?.type !== 'private' || message.chat.id !== query.from!.id || !telegramId(message.message_id) || String(message.from?.id) !== config().botId || message.from?.is_bot !== true) return;
  if (query.data.startsWith('th1.')) { await navigationFromBot(query, identity, message); return; }
  const parsed = /^tg1\.([A-Za-z0-9_-]{43})\.([0-4])$/.exec(query.data); if (!parsed) return;
  if (!await claim('callback:all', 1800) || !await claim('callback:user:' + identity.id, 80)) return;
  const connection = await getPool().getConnection(); let state: 'approved' | 'rejected' | 'expired' = 'expired';
  try {
    await connection.beginTransaction();
    const [rows] = await connection.execute<Challenge[]>('SELECT id_hash, browser_hash, stage, payload FROM digimium_telegram_auth_challenges WHERE callback_hash = ? AND expires_at > UTC_TIMESTAMP() FOR UPDATE', [hash(parsed[1])]);
    if (rows[0]?.stage === 'sent') {
      const flow = unpack(rows[0]);
      if (flow.identity?.id === identity.id && flow.messageId === message.message_id) {
        state = Number(parsed[2]) < 4 && flow.options[Number(parsed[2])] === flow.code ? 'approved' : 'rejected';
        await connection.execute('UPDATE digimium_telegram_auth_challenges SET stage = ? WHERE id_hash = ? AND stage = ?', [state, rows[0].id_hash, 'sent']);
      }
    }
    await connection.commit();
  } catch (error) { await connection.rollback(); throw error; } finally { connection.release(); }
  const notice = state === 'approved' ? 'အတည်ပြုပြီးပါပြီ။ Website ကို ပြန်သွားပါ။' : state === 'rejected' ? 'အကောင့်ဝင်ရန် request ကို ပယ်ဖျက်လိုက်ပါပြီ။' : 'ဒီ request ကို အသုံးပြုပြီးပါပြီ သို့မဟုတ် သက်တမ်းကုန်သွားပါပြီ။';
  await bestEffort('answerCallbackQuery', { callback_query_id: query.id, text: notice, show_alert: state !== 'approved' });
  // Do not edit a valid keyboard when a forged/mismatching callback points at it.
  if (state !== 'expired') await bestEffort('editMessageText', { chat_id: identity.id, message_id: message.message_id, text: notice,
    reply_markup: { inline_keyboard: state === 'approved' ? mainButtons(identity.id, message.message_id) : [] } });
}
export async function telegramWebhook(request: Request) {
  const c = configuration(); if (!c) return commerceJson({ error: 'unavailable' }, 503);
  const supplied = request.headers.get('x-telegram-bot-api-secret-token') || '';
  if (!/^[A-Za-z0-9_-]{32,256}$/.test(supplied) || supplied.length !== c.webhookSecret.length || !timingSafeEqual(Buffer.from(supplied), Buffer.from(c.webhookSecret))) return commerceJson({ error: 'origin' }, 403);
  try {
    const update = await readCommerceJson(request, 65536);
    if (!update || typeof update !== 'object' || Array.isArray(update) || !Number.isSafeInteger((update as { update_id: number }).update_id) || (update as { update_id: number }).update_id < 0) throw new CommerceError(400, 'invalid');
    await ensureSchema();
    const body = update as { message?: TelegramMessage; callback_query?: TelegramCallback };
    if (body.callback_query) await callbackFromBot(body.callback_query);
    else if (body.message) await startFromBot(body.message);
    return commerceJson({ ok: true });
  } catch (error) { return errorReply(error); }
}
