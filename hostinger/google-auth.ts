import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { isIP } from 'node:net';
import { join } from 'node:path';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import type { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { CommerceError, commerceJson, readCommerceJson } from '../lib/commerce-http';
import { customerMutationAllowed, ensureCustomerSchema, issueCustomerSession, currentCustomer, type Customer } from './customer-auth';
import { completeGoogleIdentity, resolveGoogleIdentity, type GoogleIdentity } from './google-identity';
import { getPool } from './mysql';

const lifetime = 600;
const tokenPattern = /^[A-Za-z0-9_-]{43}$/;
type ReturnTo = 'checkout' | 'account' | 'history';
type BrowserBinding = { id: string; browser: string; exp: number };
type Flow = { returnTo: ReturnTo; verifier?: string; nonce?: string; identity?: GoogleIdentity };
interface Challenge extends RowDataPacket { stage: 'oauth' | 'exchanging' | 'link' | 'name' | 'processing'; payload: string; attempts: number }
type Result = { type: 'digimium-google-auth'; status: 'success' | 'link' | 'name' | 'error'; customer?: Customer; email?: string; error?: string };
let schemaReady: Promise<void> | undefined;
const googleKeys = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'), { timeoutDuration: 5000, cooldownDuration: 30000, cacheMaxAge: 600000 });

function configuration() {
  const rawOrigin = process.env.APP_ORIGIN;
  const secret = process.env.ADMIN_AUTH_SECRET?.trim();
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  if (!rawOrigin || !secret || secret.length < 32 || !clientId || !clientSecret) return null;
  let url: URL;
  try { url = new URL(rawOrigin); } catch { return null; }
  if (url.origin !== rawOrigin || url.username || url.password ||
      !(url.protocol === 'https:' || (url.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname))) ||
      clientId.length > 256 || /\s/.test(clientId) || clientSecret.length > 4096) return null;
  return { origin: url.origin, secret, clientId, clientSecret, secure: url.protocol === 'https:',
    cookie: url.protocol === 'https:' ? '__Host-digimium_google' : 'digimium_local_google',
    redirect: url.origin + '/api/customer/google/callback' };
}
function requiredConfig() {
  const config = configuration();
  if (!config) throw new CommerceError(503, 'unavailable');
  return config;
}
function digest(value: string) { return createHash('sha256').update(value).digest(); }
function key() {
  const config = requiredConfig();
  return createHmac('sha256', config.secret).update('digimium/google-auth/v1\n' + config.origin).digest();
}
function seal(data: unknown, purpose: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  cipher.setAAD(Buffer.from(purpose));
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(data), 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString('base64url');
}
function unseal<T>(value: string, purpose: string): T {
  const envelope = Buffer.from(value, 'base64url');
  if (envelope.length < 29) throw new Error('Invalid Google challenge.');
  const decipher = createDecipheriv('aes-256-gcm', key(), envelope.subarray(0, 12));
  decipher.setAAD(Buffer.from(purpose));
  decipher.setAuthTag(envelope.subarray(12, 28));
  return JSON.parse(Buffer.concat([decipher.update(envelope.subarray(28)), decipher.final()]).toString('utf8'));
}
function cookie(value: string, age = lifetime) {
  const config = requiredConfig();
  return `${config.cookie}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${age}${config.secure ? '; Secure' : ''}`;
}
function binding(request: Request): BrowserBinding | null {
  const config = requiredConfig();
  const value = (request.headers.get('cookie') || '').split(';').map(part => part.trim())
    .find(part => part.startsWith(config.cookie + '='))?.slice(config.cookie.length + 1);
  if (!value || value.length > 1500 || !/^[A-Za-z0-9_-]+$/.test(value)) return null;
  try {
    const data = unseal<BrowserBinding>(value, 'browser');
    const now = Math.floor(Date.now() / 1000);
    return tokenPattern.test(data.id) && tokenPattern.test(data.browser) && Number.isInteger(data.exp) && data.exp > now && data.exp <= now + lifetime ? data : null;
  } catch { return null; }
}
function resultCookie(customerId: string, flowId: string) {
  const config = requiredConfig();
  const name = config.secure ? '__Host-digimium_google_result' : 'digimium_local_google_result';
  const value = seal({customerId,flowId,exp:Math.floor(Date.now()/1000)+120},'result');
  return `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=120${config.secure ? '; Secure' : ''}`;
}
function clearResultCookie() {
  const config = requiredConfig();
  return `${config.secure ? '__Host-digimium_google_result' : 'digimium_local_google_result'}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${config.secure ? '; Secure' : ''}`;
}
function readResultCookie(request: Request): {customerId:string;flowId:string;exp:number} | null {
  const config = requiredConfig();
  const name = config.secure ? '__Host-digimium_google_result' : 'digimium_local_google_result';
  const value = (request.headers.get('cookie') || '').split(';').map(part=>part.trim()).find(part=>part.startsWith(name+'='))?.slice(name.length+1);
  if (!value || value.length>1500 || !/^[A-Za-z0-9_-]+$/.test(value)) return null;
  try {
    const receipt=unseal<{customerId:string;flowId:string;exp:number}>(value,'result');
    const now=Math.floor(Date.now()/1000);
    return /^[a-f0-9-]{36}$/.test(receipt.customerId) && tokenPattern.test(receipt.flowId) && Number.isInteger(receipt.exp) && receipt.exp>now && receipt.exp<=now+120 ? receipt : null;
  } catch { return null; }
}
async function ensureSchema() {
  return schemaReady ??= (async () => {
    await ensureCustomerSchema();
    await getPool().query(await readFile(join(process.cwd(), 'hostinger/google-auth-schema.sql'), 'utf8'));
  })().catch(error => { schemaReady = undefined; throw error; });
}
async function claim(scope: string, maximum: number, bucket: number) {
  const hash = digest('google-auth:' + scope);
  await getPool().execute('INSERT IGNORE INTO digimium_customer_auth_limits (bucket, scope_hash) VALUES (?, ?)', [bucket, hash]);
  const [result] = await getPool().execute<ResultSetHeader>('UPDATE digimium_customer_auth_limits SET attempts = attempts + 1 WHERE bucket = ? AND scope_hash = ? AND attempts < ?', [bucket, hash, maximum]);
  return result.affectedRows === 1;
}
async function limit(request: Request, action: 'start' | 'complete') {
  const bucket = Math.floor(Date.now() / 900000);
  if (!await claim(action + ':all', action === 'start' ? 900 : 300, bucket)) throw new CommerceError(429, 'rate_limited');
  const ip = request.headers.get('x-forwarded-for')?.split(',').at(-1)?.trim();
  if (ip && isIP(ip) && !await claim(action + ':ip:' + ip, action === 'start' ? 40 : 30, bucket)) throw new CommerceError(429, 'rate_limited');
}
async function createChallenge(stage: 'oauth' | 'link' | 'name', payload: Flow) {
  const data: BrowserBinding = { id: randomBytes(32).toString('base64url'), browser: randomBytes(32).toString('base64url'), exp: Math.floor(Date.now() / 1000) + lifetime };
  await getPool().execute('INSERT INTO digimium_google_auth_challenges (id_hash, browser_hash, stage, payload, expires_at) VALUES (?, ?, ?, ?, DATE_ADD(UTC_TIMESTAMP(), INTERVAL ? SECOND))',
    [digest(data.id), digest(data.browser), stage, seal(payload, 'challenge:' + data.id), lifetime]);
  return { data, cookie: cookie(seal(data, 'browser')) };
}
async function pending(request: Request) {
  const browser = binding(request);
  if (!browser) return null;
  await ensureSchema();
  const [rows] = await getPool().execute<Challenge[]>('SELECT stage, payload, attempts FROM digimium_google_auth_challenges WHERE id_hash = ? AND browser_hash = ? AND expires_at > UTC_TIMESTAMP()', [digest(browser.id), digest(browser.browser)]);
  if (!rows.length) return null;
  return { browser, row: rows[0], flow: unseal<Flow>(rows[0].payload, 'challenge:' + browser.id) };
}
async function takeOAuth(request: Request, state: string) {
  const browser = binding(request);
  if (!browser || !tokenPattern.test(state) || browser.id !== state) throw new CommerceError(400, 'expired');
  await ensureSchema();
  const connection = await getPool().getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.execute<Challenge[]>('SELECT stage, payload, attempts FROM digimium_google_auth_challenges WHERE id_hash = ? AND browser_hash = ? AND expires_at > UTC_TIMESTAMP() FOR UPDATE', [digest(state), digest(browser.browser)]);
    if (!rows.length || rows[0].stage !== 'oauth') throw new CommerceError(400, 'expired');
    const flow = unseal<Flow>(rows[0].payload, 'challenge:' + state);
    await connection.execute("UPDATE digimium_google_auth_challenges SET stage = 'exchanging' WHERE id_hash = ?", [digest(state)]);
    await connection.commit();
    return {flow,browser};
  } catch (error) { await connection.rollback(); throw error; }
  finally { connection.release(); }
}
function safeReturn(returnTo: ReturnTo) {
  return returnTo === 'checkout' ? '/?checkout=1' : returnTo === 'history' ? '/order-history' : '/account';
}
function safeError(error: unknown) {
  if (error instanceof CommerceError && ['expired', 'cancelled', 'credentials', 'rate_limited', 'invalid', 'account_conflict'].includes(error.message)) return error.message;
  return 'unavailable';
}
function resultPage(result: Result, returnTo: ReturnTo, cookies: string[] = []) {
  const config = requiredConfig();
  const nonce = randomBytes(18).toString('base64');
  const json = JSON.stringify(result).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
  const destination = result.status === 'success' ? safeReturn(returnTo)
    : '/account?google=' + (result.status === 'error' ? 'error' : 'continue') + '&returnTo=' + returnTo;
  const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Google sign-in — Digimium</title><body><p>Return to Digimium to finish signing in.</p><a href="${destination.replace(/&/g, '&amp;')}">Return to Digimium</a><script nonce="${nonce}">if(window.opener&&!window.opener.closed){window.opener.postMessage(${json},${JSON.stringify(config.origin)});window.close();}else{window.location.replace(${JSON.stringify(destination)});}</script></body></html>`;
  const headers = new Headers({ 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'private, no-store', Vary: 'Cookie',
    'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': `default-src 'none'; script-src 'nonce-${nonce}'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'` });
  cookies.forEach(value => headers.append('Set-Cookie', value));
  return new Response(html, { headers });
}
async function readTokenResponse(response: Response) {
  if (!response.ok) throw new CommerceError(400, 'invalid');
  const reader = response.body?.getReader();
  if (!reader) throw new Error('Missing Google response.');
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) { const part = await reader.read(); if (part.done) break; length += part.value.length; if (length > 65536) { await reader.cancel(); throw new Error('Oversized Google response.'); } chunks.push(part.value); }
  } finally { reader.releaseLock(); }
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as {id_token?: unknown};
}
async function verifiedIdentity(code: string, flow: Flow): Promise<GoogleIdentity> {
  const config = requiredConfig();
  if (!flow.verifier || !flow.nonce) throw new CommerceError(400, 'invalid');
  const response = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', signal: AbortSignal.timeout(8000), redirect: 'error',
    headers: {'Content-Type': 'application/x-www-form-urlencoded'},
    body: new URLSearchParams({ code, client_id: config.clientId, client_secret: config.clientSecret, redirect_uri: config.redirect, grant_type: 'authorization_code', code_verifier: flow.verifier }) });
  const data = await readTokenResponse(response);
  if (typeof data.id_token !== 'string' || data.id_token.length > 32768) throw new CommerceError(400, 'invalid');
  const {payload} = await jwtVerify(data.id_token, googleKeys, { algorithms: ['RS256'], audience: config.clientId,
    issuer: ['https://accounts.google.com', 'accounts.google.com'], requiredClaims: ['sub', 'email', 'email_verified', 'exp', 'iat', 'nonce'], maxTokenAge: '10m', clockTolerance: 5 });
  if (payload.nonce !== flow.nonce || (payload.azp !== undefined && payload.azp !== config.clientId) ||
      (Array.isArray(payload.aud) && payload.aud.length > 1 && payload.azp !== config.clientId) || payload.email_verified !== true ||
      typeof payload.sub !== 'string' || !payload.sub || payload.sub.length > 255 || /\p{Cc}/u.test(payload.sub) || typeof payload.email !== 'string') throw new CommerceError(400, 'invalid');
  const email = payload.email.trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@,;<>\p{Cc}]+@[^\s@,;<>\p{Cc}]+\.[^\s@,;<>\p{Cc}]+$/u.test(email)) throw new CommerceError(400, 'invalid');
  const name = typeof payload.name === 'string' ? payload.name.trim() : '';
  return {sub: payload.sub, email, ...(name && name.length <= 100 && !/\p{Cc}/u.test(name) ? {name} : {})};
}

export function googleCapabilities() { return commerceJson({enabled: !!configuration()}); }
export async function googleStart(request: Request) {
  if (!customerMutationAllowed(request)) return commerceJson({error:'origin'}, 403);
  try {
    const config = requiredConfig();
    const body = await readCommerceJson(request, 1024);
    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length !== 1 || !Object.hasOwn(body, 'returnTo') ||
        !['account', 'checkout', 'history'].includes((body as {returnTo: string}).returnTo)) throw new CommerceError(400, 'invalid');
    const returnTo = (body as {returnTo: ReturnTo}).returnTo;
    await ensureSchema();
    await limit(request, 'start');
    // One active Google flow per browser. Starting again revokes an older in-flight flow.
    const previous = binding(request);
    if (previous) await getPool().execute('DELETE FROM digimium_google_auth_challenges WHERE id_hash = ? AND browser_hash = ?',[digest(previous.id),digest(previous.browser)]);
    await getPool().execute('DELETE FROM digimium_google_auth_challenges WHERE expires_at <= UTC_TIMESTAMP() LIMIT 100');
    const flow: Flow = { returnTo, nonce: randomBytes(32).toString('base64url'), verifier: randomBytes(32).toString('base64url') };
    const challenge = await createChallenge('oauth', flow);
    const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    url.search = new URLSearchParams({client_id: config.clientId, redirect_uri: config.redirect, response_type:'code', scope:'openid email profile',
      state: challenge.data.id, nonce: flow.nonce!, code_challenge: digest(flow.verifier!).toString('base64url'), code_challenge_method:'S256', prompt:'select_account'}).toString();
    const response = commerceJson({url: url.href});
    response.headers.append('Set-Cookie', challenge.cookie);
    response.headers.append('Set-Cookie',clearResultCookie());
    return response;
  } catch (error) {
    const response = commerceJson({error: safeError(error)}, error instanceof CommerceError ? error.status : 503);
    if (configuration()) response.headers.append('Set-Cookie',clearResultCookie());
    return response;
  }
}
export async function googleCallback(request: Request) {
  if (!configuration()) return commerceJson({error:'unavailable'}, 503);
  let returnTo: ReturnTo = 'account';
  let active: BrowserBinding | undefined;
  try {
    const query = new URL(request.url).searchParams;
    if (query.getAll('state').length !== 1 || query.getAll('code').length > 1 || query.getAll('error').length > 1) throw new CommerceError(400, 'invalid');
    const taken = await takeOAuth(request, query.get('state') || '');
    const {flow,browser} = taken;
    active = browser;
    returnTo = flow.returnTo;
    if (query.has('error')) throw new CommerceError(400, 'cancelled');
    const code = query.get('code');
    if (!code || code.length > 4096) throw new CommerceError(400, 'invalid');
    const identity = await verifiedIdentity(code, flow);
    const [live] = await getPool().execute<RowDataPacket[]>("SELECT 1 FROM digimium_google_auth_challenges WHERE id_hash = ? AND browser_hash = ? AND stage = 'exchanging' AND expires_at > UTC_TIMESTAMP()",[digest(browser.id),digest(browser.browser)]);
    if (!live.length) throw new CommerceError(400,'expired');
    const result = await resolveGoogleIdentity(identity);
    if (result.status === 'success') {
      const session = await issueCustomerSession(request, result.customer, {idHash:digest(browser.id),browserHash:digest(browser.browser),stage:'exchanging'});
      const signed = await session.json() as {customer: Customer};
      return resultPage({type:'digimium-google-auth', status:'success', customer:signed.customer}, returnTo, [...session.headers.getSetCookie(), resultCookie(signed.customer.id,browser.id)]);
    }
    // Retain the originating OAuth state ID through name/password completion and its receipt.
    const [changed] = await getPool().execute<ResultSetHeader>("UPDATE digimium_google_auth_challenges SET stage = ?, payload = ?, attempts = 0 WHERE id_hash = ? AND browser_hash = ? AND stage = 'exchanging' AND expires_at > UTC_TIMESTAMP()",[result.status,seal({returnTo,identity},'challenge:'+browser.id),digest(browser.id),digest(browser.browser)]);
    if (changed.affectedRows !== 1) throw new CommerceError(400,'expired');
    return resultPage({type:'digimium-google-auth', ...result}, returnTo, [cookie(seal(browser,'browser'),Math.max(0,browser.exp-Math.floor(Date.now()/1000)))]);
  } catch (error) {
    let removed = false;
    if (active) {
      const cleanup = await getPool().execute<ResultSetHeader>("DELETE FROM digimium_google_auth_challenges WHERE id_hash = ? AND browser_hash = ? AND stage = 'exchanging'",[digest(active.id),digest(active.browser)]).catch(()=>null);
      removed = !!cleanup && cleanup[0].affectedRows === 1;
    }
    return resultPage({type:'digimium-google-auth', status:'error', error:safeError(error)}, returnTo, removed ? [cookie('',0)] : []);
  }
}
export async function googlePending(request: Request) {
  if (!configuration()) return commerceJson({status:'none'});
  try {
    const query = new URL(request.url).searchParams;
    const expected = query.get('flow');
    if (query.getAll('flow').length > 1 || (expected !== null && !tokenPattern.test(expected))) return commerceJson({error:'invalid'},400);
    const data = await pending(request);
    if (data) {
      if (expected && expected !== data.browser.id) return commerceJson({status:'none'});
      if (!['link','name'].includes(data.row.stage) || data.row.attempts >= 5) return commerceJson({status:'none'});
      return commerceJson({status:data.row.stage, ...(data.row.stage === 'link' ? {email:data.flow.identity?.email} : {})});
    }
    const receipt = readResultCookie(request);
    const browser = binding(request);
    const customer = receipt && (!expected || receipt.flowId === expected) && (!browser || browser.id === receipt.flowId)
      ? await currentCustomer(request) : null;
    return commerceJson(customer && customer.id === receipt?.customerId ? {status:'success',customer} : {status:'none'});
  } catch { return commerceJson({error:'unavailable'},503); }
}
export async function googleComplete(request: Request) {
  if (!customerMutationAllowed(request)) return commerceJson({error:'origin'},403);
  let selected: Awaited<ReturnType<typeof pending>> = null;
  let processing = false;
  try {
    requiredConfig();
    const body = await readCommerceJson(request,4096);
    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length !== 1) throw new CommerceError(400,'invalid');
    selected = await pending(request);
    if (!selected || !selected.flow.identity || !['link','name'].includes(selected.row.stage)) throw new CommerceError(400,'expired');
    const field = selected.row.stage === 'link' ? 'password' : 'name';
    const value = (body as Record<string,unknown>)[field];
    if (!Object.hasOwn(body,field) || typeof value !== 'string' || !value.length || value.length > (field === 'password' ? 256 : 100) || (field === 'name' && (!value.trim() || /\p{Cc}/u.test(value)))) throw new CommerceError(400,'invalid');
    await limit(request,'complete');
    const [claimed] = await getPool().execute<ResultSetHeader>("UPDATE digimium_google_auth_challenges SET stage = 'processing', attempts = attempts + 1 WHERE id_hash = ? AND browser_hash = ? AND stage = ? AND attempts < 5 AND expires_at > UTC_TIMESTAMP()", [digest(selected.browser.id),digest(selected.browser.browser),selected.row.stage]);
    if (claimed.affectedRows !== 1) throw new CommerceError(409,'expired');
    processing = true;
    const result = await completeGoogleIdentity(request,selected.flow.identity,{[field]:value});
    if (result.status !== 'success') throw new CommerceError(409,'account_conflict');
    const session = await issueCustomerSession(request,result.customer,{idHash:digest(selected.browser.id),browserHash:digest(selected.browser.browser),stage:'processing'});
    const signed = await session.json() as {customer: Customer};
    const response = commerceJson({status:'success',customer:signed.customer});
    session.headers.getSetCookie().forEach(value=>response.headers.append('Set-Cookie',value));
    response.headers.append('Set-Cookie',resultCookie(signed.customer.id,selected.browser.id));
    return response;
  } catch (error) {
    if (selected && processing) await getPool().execute("UPDATE digimium_google_auth_challenges SET stage = ? WHERE id_hash = ? AND browser_hash = ? AND stage = 'processing'",[selected.row.stage,digest(selected.browser.id),digest(selected.browser.browser)]).catch(()=>{});
    return commerceJson({error:safeError(error)},error instanceof CommerceError ? error.status : 503);
  }
}

export async function googleCancel(request: Request) {
  if (!customerMutationAllowed(request)) return commerceJson({error:'origin'},403);
  if (!configuration()) return commerceJson({status:'none'});
  try {
    const query = new URL(request.url).searchParams;
    const expected = query.get('flow');
    if (query.getAll('flow').length > 1 || (expected !== null && !tokenPattern.test(expected))) return commerceJson({error:'invalid'},400);
    const browser = binding(request);
    // A stale popup must not cancel or overwrite a newer browser flow's cookies.
    if (expected && browser?.id !== expected) return commerceJson({status:'none'});
    if (browser) {
      await ensureSchema();
      await getPool().execute("DELETE FROM digimium_google_auth_challenges WHERE id_hash = ? AND browser_hash = ?",[digest(browser.id),digest(browser.browser)]);
    }
    // Row revocation is authoritative. A delayed response must not erase a newer login's binding or receipt.
    return commerceJson({status:'none'});
  } catch { return commerceJson({error:'unavailable'},503); }
}
