import { createHash } from 'node:crypto';
import { isIP } from 'node:net';
import type { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { CommerceError, commerceJson, readCommerceJson } from '../lib/commerce-http';
import { customerMutationAllowed, ensureCustomerSchema } from './customer-auth';
import { getPool } from './mysql';

async function claim(scope: string, maximum: number, bucket: number) {
  const pool = getPool();
  const scopeHash = createHash('sha256').update('email-step:' + scope).digest();
  await pool.execute('INSERT IGNORE INTO digimium_customer_auth_limits (bucket, scope_hash) VALUES (?, ?)', [bucket, scopeHash]);
  const [result] = await pool.execute<ResultSetHeader>(
    'UPDATE digimium_customer_auth_limits SET attempts = attempts + 1 WHERE bucket = ? AND scope_hash = ? AND attempts < ?',
    [bucket, scopeHash, maximum],
  );
  return result.affectedRows === 1;
}

async function allowedAttempt(request: Request, email: string) {
  const bucket = Math.floor(Date.now() / 900000);
  if (!await claim('all', 900, bucket)) return false;
  // Match the account endpoint's proxy policy: only the final forwarded address is considered.
  const ip = request.headers.get('x-forwarded-for')?.split(',').at(-1)?.trim();
  if (ip && isIP(ip) && !await claim('ip:' + ip, 60, bucket)) return false;
  if (!await claim('email:' + email, 12, bucket)) return false;
  await getPool().execute('DELETE FROM digimium_customer_auth_limits WHERE bucket < ? LIMIT 100', [bucket - 1]);
  return true;
}

export async function customerEmailStep(request: Request): Promise<Response> {
  if (!customerMutationAllowed(request)) return commerceJson({ error: 'origin' }, 403);
  try {
    const body = await readCommerceJson(request, 2048);
    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length !== 1 || !Object.hasOwn(body, 'email')) {
      return commerceJson({ error: 'invalid' }, 400);
    }
    const rawEmail = (body as { email?: unknown }).email;
    const email = typeof rawEmail === 'string' ? rawEmail.trim().toLowerCase() : '';
    if (email.length > 254 || !/^[^\s@,;<>\p{Cc}]+@[^\s@,;<>\p{Cc}]+\.[^\s@,;<>\p{Cc}]+$/u.test(email)) {
      return commerceJson({ error: 'invalid' }, 400);
    }
    await ensureCustomerSchema();
    if (!await allowedAttempt(request, email)) return commerceJson({ error: 'rate_limited' }, 429);
    const [rows] = await getPool().execute<RowDataPacket[]>('SELECT 1 FROM digimium_customers WHERE email = ? LIMIT 1', [email]);
    // Existence is the minimum disclosure needed for the requested email-first sign-in/registration flow.
    // Do not return a customer identifier, profile, credentials, or any session from this step.
    return commerceJson({ next: rows.length ? 'password' : 'register' });
  } catch (error) {
    if (error instanceof CommerceError) return commerceJson({ error: 'invalid' }, error.status);
    return commerceJson({ error: 'unavailable' }, 503);
  }
}
