import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { PoolConnection, RowDataPacket } from 'mysql2/promise';
import { CommerceError } from '../lib/commerce-http';
import { ensureCustomerSchema, proveCustomerPasswordForGoogle, type Customer } from './customer-auth';
import { getPool } from './mysql';

/** These fields must come only from a fully verified Google ID token or server-held pending identity. */
export type GoogleIdentity = { sub: string; email: string; name?: string };
export type GoogleIdentityResult = { status: 'success'; customer: Customer } | { status: 'link'; email: string } | { status: 'name' };
type CustomerRow = RowDataPacket & Customer & { password_hash: string | null };
type PasswordProof = { customerId: string; hash: string };
const customerColumns = "c.id, c.name, c.email, c.password_hash, DATE_FORMAT(c.created_at, '%Y-%m-%dT%H:%i:%sZ') AS createdAt";
let ready: Promise<void> | undefined;

export function ensureGoogleIdentitySchema(): Promise<void> {
  return ready ??= (async () => {
    await ensureCustomerSchema();
    const pool = getPool();
    const [columns] = await pool.query<RowDataPacket[]>("SHOW COLUMNS FROM digimium_customers LIKE 'password_hash'");
    if (columns[0]?.Null !== 'YES') {
      // Existing local password hashes are preserved; Google-only accounts do not get fabricated passwords.
      await pool.query('ALTER TABLE digimium_customers MODIFY password_hash VARCHAR(180) CHARACTER SET ascii COLLATE ascii_bin NULL');
    }
    const sql = await readFile(join(process.cwd(), 'hostinger', 'google-identity-schema.sql'), 'utf8');
    for (const statement of sql.split(';').filter(value => value.trim())) await pool.query(statement);
  })().catch(error => { ready = undefined; throw error; });
}

function normalizedIdentity(input: GoogleIdentity): GoogleIdentity {
  if (typeof input.sub !== 'string' || input.sub.length < 1 || input.sub.length > 255 || /\p{Cc}/u.test(input.sub)) {
    throw new CommerceError(400, 'invalid');
  }
  const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : '';
  if (email.length > 254 || !/^[^\s@,;<>\p{Cc}]+@[^\s@,;<>\p{Cc}]+\.[^\s@,;<>\p{Cc}]+$/u.test(email)) {
    throw new CommerceError(400, 'invalid');
  }
  return { sub: input.sub, email, name: validName(input.name) ?? undefined };
}

function validName(value: unknown): string | null {
  const name = typeof value === 'string' ? value.trim() : '';
  return name && name.length <= 100 && !/\p{Cc}/u.test(name) ? name : null;
}

function present(row: CustomerRow): Customer {
  const customer: Customer = { id: row.id, name: row.name, email: row.email, createdAt: row.createdAt };
  return row.password_hash === null ? { ...customer, passwordAvailable: false } : customer;
}

async function bySubject(connection: PoolConnection, sub: string): Promise<CustomerRow | undefined> {
  const [rows] = await connection.execute<CustomerRow[]>(
    `SELECT ${customerColumns} FROM digimium_google_identities i JOIN digimium_customers c ON c.id = i.customer_id WHERE i.google_sub = ? FOR UPDATE`, [sub],
  );
  return rows[0];
}

async function resolveTransaction(identity: GoogleIdentity, completionName?: string, proof?: PasswordProof): Promise<GoogleIdentityResult> {
  const connection = await getPool().getConnection();
  try {
    await connection.beginTransaction();
    const bound = await bySubject(connection, identity.sub);
    if (bound) {
      // Google subjects, not mutable email addresses, bind ownership of orders and the account.
      await connection.commit();
      return { status: 'success', customer: present(bound) };
    }
    const [rows] = await connection.execute<CustomerRow[]>(
      `SELECT ${customerColumns} FROM digimium_customers c WHERE c.email = ? FOR UPDATE`, [identity.email],
    );
    const existing = rows[0];
    if (existing) {
      if (existing.password_hash === null) throw new CommerceError(409, 'account_conflict');
      if (!proof) {
        await connection.commit();
        return { status: 'link', email: identity.email };
      }
      if (proof.customerId !== existing.id || proof.hash !== existing.password_hash) throw new CommerceError(400, 'credentials');
      await connection.execute(
        'INSERT INTO digimium_google_identities (google_sub, customer_id, created_at) VALUES (?, ?, ?)',
        [identity.sub, existing.id, new Date().toISOString().slice(0, 23).replace('T', ' ')],
      );
      await connection.commit();
      return { status: 'success', customer: present(existing) };
    }
    if (proof) throw new CommerceError(400, 'credentials');
    const name = completionName ?? validName(identity.name);
    if (!name) {
      await connection.commit();
      return { status: 'name' };
    }
    const createdAt = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
    const customer: Customer = { id: randomUUID(), name, email: identity.email, createdAt, passwordAvailable: false };
    const timestamp = createdAt.slice(0, 19).replace('T', ' ');
    await connection.execute(
      'INSERT INTO digimium_customers (id, name, email, password_hash, created_at) VALUES (?, ?, ?, NULL, ?)',
      [customer.id, name, customer.email, timestamp],
    );
    await connection.execute('INSERT INTO digimium_google_identities (google_sub, customer_id, created_at) VALUES (?, ?, ?)', [identity.sub, customer.id, timestamp]);
    await connection.commit();
    return { status: 'success', customer };
  } catch (error) { await connection.rollback(); throw error; }
  finally { connection.release(); }
}

async function resolveWithRetry(identity: GoogleIdentity, name?: string, proof?: PasswordProof): Promise<GoogleIdentityResult> {
  await ensureGoogleIdentitySchema();
  for (let attempt = 0; ; attempt++) {
    try { return await resolveTransaction(identity, name, proof); }
    catch (error) {
      const code = error instanceof Error && 'code' in error ? error.code : '';
      if (attempt >= 2 || !['ER_DUP_ENTRY', 'ER_LOCK_DEADLOCK', 'ER_LOCK_WAIT_TIMEOUT'].includes(String(code))) throw error;
      // Retry after a concurrent local registration or Google callback wins a unique key.
    }
  }
}

export async function resolveGoogleIdentity(input: GoogleIdentity): Promise<GoogleIdentityResult> {
  return resolveWithRetry(normalizedIdentity(input));
}

export async function completeGoogleIdentity(request: Request, input: GoogleIdentity, fields: { password?: string; name?: string }): Promise<GoogleIdentityResult> {
  const identity = normalizedIdentity(input);
  await ensureGoogleIdentitySchema();
  if (fields.password !== undefined && fields.name !== undefined) throw new CommerceError(400, 'invalid');
  if (fields.name !== undefined) {
    const name = validName(fields.name);
    if (!name) throw new CommerceError(400, 'invalid');
    return resolveWithRetry(identity, name);
  }
  if (typeof fields.password !== 'string' || !fields.password.length || fields.password.length > 256) throw new CommerceError(400, 'invalid');
  const [bound] = await getPool().execute<RowDataPacket[]>('SELECT 1 FROM digimium_google_identities WHERE google_sub = ?', [identity.sub]);
  if (bound.length) return resolveWithRetry(identity);
  const [rows] = await getPool().execute<CustomerRow[]>(
    `SELECT ${customerColumns} FROM digimium_customers c WHERE c.email = ?`, [identity.email],
  );
  const customer = rows[0];
  if (!customer) throw new CommerceError(400, 'invalid');
  if (customer.password_hash === null) throw new CommerceError(409, 'account_conflict');
  const hash = await proveCustomerPasswordForGoogle(request, customer, fields.password);
  return resolveWithRetry(identity, undefined, { customerId: customer.id, hash });
}
