import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { isIP } from 'node:net';
import type { ResultSetHeader } from 'mysql2/promise';
import { CommerceError, commerceJson } from '../lib/commerce-http';
import { customerMutationAllowed, ensureCustomerSchema } from './customer-auth';
import { getPool } from './mysql';

const lifetime = 30 * 24 * 60 * 60;

function configuration() {
  const origin = process.env.APP_ORIGIN;
  const secret = process.env.ADMIN_AUTH_SECRET?.trim();
  if (!origin || !secret || secret.length < 32) throw new CommerceError(503, 'Guest checkout is temporarily unavailable.');
  const secure = new URL(origin).protocol === 'https:';
  return { origin, secret, secure, name: secure ? '__Host-digimium_guest' : 'digimium_local_guest' };
}

function signature(value: string) {
  const { origin, secret } = configuration();
  return createHmac('sha256', secret).update('digimium/guest/v1\n' + origin + '\n' + value).digest();
}

function tokenFrom(request: Request) {
  const { name } = configuration();
  const token = (request.headers.get('cookie') || '').split(';').map(part => part.trim())
    .find(part => part.startsWith(name + '='))?.slice(name.length + 1);
  const match = /^(\d{10})\.([A-Za-z0-9_-]{43})\.([A-Za-z0-9_-]{43})$/.exec(token || '');
  if (!match || Number(match[1]) <= Math.floor(Date.now() / 1000) ||
      Number(match[1]) > Math.floor(Date.now() / 1000) + lifetime) return null;
  const expected = signature(match[1] + '.' + match[2]);
  const received = Buffer.from(match[3], 'base64url');
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) return null;
  return { token: token!, key: createHash('sha256').update(match[2]).digest() };
}

export function currentGuest(request: Request): Buffer | null {
  return tokenFrom(request)?.key ?? null;
}

async function claim(scope: string, max: number, bucket: number) {
  const pool = getPool();
  const key = createHash('sha256').update('guest-checkout:' + scope).digest();
  await pool.execute('INSERT IGNORE INTO digimium_customer_auth_limits (bucket, scope_hash) VALUES (?, ?)', [bucket, key]);
  const [result] = await pool.execute<ResultSetHeader>(
    'UPDATE digimium_customer_auth_limits SET attempts = attempts + 1 WHERE bucket = ? AND scope_hash = ? AND attempts < ?',
    [bucket, key, max],
  );
  return result.affectedRows === 1;
}

export async function limitGuestCheckout(request: Request, key?: Buffer) {
  await ensureCustomerSchema();
  const bucket = Math.floor(Date.now() / 900000);
  const scope = key ? 'order' : 'session';
  const limited = () => new CommerceError(429, 'Too many checkout attempts. Please wait a few minutes and try again.');
  if (!await claim(scope + ':all', key ? 900 : 3000, bucket)) throw limited();
  // The rightmost proxy-provided address follows the account endpoint's existing policy.
  const ip = request.headers.get('x-forwarded-for')?.split(',').at(-1)?.trim();
  if (ip && isIP(ip) && !await claim(scope + ':ip:' + ip, key ? 60 : 100, bucket)) throw limited();
  if (key && !await claim(scope + ':guest:' + key.toString('hex'), 20, bucket)) throw limited();
  await getPool().execute('DELETE FROM digimium_customer_auth_limits WHERE bucket < ? LIMIT 100', [bucket - 1]);
}

export async function guestSession(request: Request) {
  if (!customerMutationAllowed(request)) throw new CommerceError(403, 'Start checkout from this website.');
  const { name, secure } = configuration();
  const previous = tokenFrom(request);
  if (previous) return commerceJson({ guest: true });
  await limitGuestCheckout(request);
  const value = Math.floor(Date.now() / 1000) + lifetime + '.' + randomBytes(32).toString('base64url');
  const response = commerceJson({ guest: true });
  response.headers.set('Set-Cookie', `${name}=${value}.${signature(value).toString('base64url')}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${lifetime}${secure ? '; Secure' : ''}`);
  return response;
}
