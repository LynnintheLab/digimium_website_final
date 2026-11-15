import { createDecipheriv, createHash, createHmac } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { z } from 'zod';
import { CommerceError } from '../lib/commerce-http';
import type { AdminCustomerRecord } from '../lib/commerce-types';
import { presentCustomer, type CustomerIdentityRow } from './customer-auth';
import { ensureGiveaway } from './giveaway';
import { getPool } from './mysql';
import { ensureOrders } from './orders';

const uuid = z.string().uuid();
const version = z.string().regex(/^[a-f0-9]{64}$/);
const email = z.string().trim().toLowerCase().max(254)
  .regex(/^[^\s@,;<>\p{Cc}]+@[^\s@,;<>\p{Cc}]+\.[^\s@,;<>\p{Cc}]+$/u);
const updateSchema = z.object({
  version,
  name: z.string().trim().min(1).max(100).refine(value => !/\p{Cc}/u.test(value)),
  email: email.nullable(),
}).strict();
const removeSchema = z.object({ version, confirmation: uuid }).strict();

type ProfileRow = CustomerIdentityRow & RowDataPacket;
type TelegramRow = RowDataPacket & { telegram_id: string; username: string | null };
type GoogleRow = RowDataPacket & { google_sub: string };
type OrderVersionRow = RowDataPacket & { id: string; revision: number; approved_at: string | null };
type EntryVersionRow = RowDataPacket & { id: string };
type ChallengeRow = RowDataPacket & { id_hash: Buffer; payload: string };
type State = { profile: ProfileRow; orders: OrderVersionRow[]; entries: EntryVersionRow[]; record: AdminCustomerRecord };

let schemaReady: Promise<void> | undefined;
function ensureAdminCustomerSchema() {
  return schemaReady ??= (async () => {
    // These bootstrap helpers create schemas only; they do not seed a campaign or edit a customer.
    await ensureOrders();
    await ensureGiveaway();
    for (const file of ['google-auth-schema.sql', 'telegram-auth-schema.sql']) {
      const sql = await readFile(join(process.cwd(), 'hostinger', file), 'utf8');
      for (const statement of sql.split(';').filter(part => part.trim())) await getPool().query(statement);
    }
  })().catch(error => { schemaReady = undefined; throw error; });
}

function customerId(value: string) {
  if (!uuid.safeParse(value).success) throw new CommerceError(404, 'Customer not found.');
  return value;
}

async function readState(connection: PoolConnection, id: string, lock: boolean): Promise<State> {
  const suffix = lock ? ' FOR UPDATE' : '';
  // Every mutation locks the parent first. FK checks then prevent a new owned order/entry
  // from appearing between the version check and removal of its parent.
  const [profiles] = await connection.execute<ProfileRow[]>(
    `SELECT c.id, c.name, c.email, DATE_FORMAT(c.created_at, '%Y-%m-%dT%H:%i:%s.%fZ') AS createdAt,
     c.password_hash IS NOT NULL AS password_available FROM digimium_customers c WHERE c.id = ?${suffix}`, [id],
  );
  const profile = profiles[0];
  if (!profile) throw new CommerceError(404, 'Customer not found.');
  // Separate current reads after the parent lock also notice a provider connected
  // while this request was waiting; a nonlocking EXISTS subquery could see an old snapshot.
  const [telegram] = await connection.execute<TelegramRow[]>(
    `SELECT telegram_id, username FROM digimium_telegram_identities WHERE customer_id = ?${suffix}`, [id],
  );
  const [google] = await connection.execute<GoogleRow[]>(
    `SELECT google_sub FROM digimium_google_identities WHERE customer_id = ? ORDER BY google_sub${suffix}`, [id],
  );
  profile.telegram_id = telegram[0]?.telegram_id ?? null;
  profile.telegram_username = telegram[0]?.username ?? null;
  profile.google_connected = google.length > 0 ? 1 : 0;
  const [orders] = await connection.execute<OrderVersionRow[]>(
    `SELECT id, revision, approved_at FROM digimium_orders WHERE customer_id = ? ORDER BY id${suffix}`, [id],
  );
  const [entries] = await connection.execute<EntryVersionRow[]>(
    `SELECT id FROM digimium_giveaway_entries WHERE customer_id = ? ORDER BY id${suffix}`, [id],
  );
  const customer = presentCustomer(profile);
  const approved = orders.filter(order => order.approved_at !== null).length;
  // Opaque concurrency token only: no password hashes, sessions or fulfillment data are projected.
  const currentVersion = createHash('sha256').update(JSON.stringify([
    'digimium/admin-customer/v1', customer, google.map(identity => identity.google_sub),
    orders.map(order => [order.id, Number(order.revision), order.approved_at === null ? 'pending' : 'approved']),
    entries.map(entry => entry.id),
  ])).digest('hex');
  return { profile, orders, entries, record: {
    customer, version: currentVersion,
    summary: { orders: orders.length, pending: orders.length - approved, approved, giveawayEntries: entries.length },
  } };
}

async function transaction<T>(work: (connection: PoolConnection) => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const connection = await getPool().getConnection();
    try {
      await connection.beginTransaction();
      const result = await work(connection);
      await connection.commit();
      return result;
    } catch (error) {
      await connection.rollback();
      const code = error instanceof Error && 'code' in error ? String(error.code) : '';
      if (code === 'ER_DUP_ENTRY') throw new CommerceError(409, 'That email belongs to another customer.');
      if (attempt >= 2 || !['ER_LOCK_DEADLOCK', 'ER_LOCK_WAIT_TIMEOUT', 'ER_CHECKREAD'].includes(code)) throw error;
      // Provider/session code can lock a challenge before its customer. Retry the whole
      // transaction after a deadlock, including ownership and optimistic-version checks.
    } finally { connection.release(); }
  }
}

function assertVersion(state: State, expected: string) {
  if (state.record.version !== expected) {
    throw new CommerceError(409, 'This customer or their orders changed. Reload the customer before continuing.');
  }
}

export async function getAdminCustomer(rawId: string): Promise<AdminCustomerRecord> {
  const id = customerId(rawId);
  await ensureAdminCustomerSchema();
  return transaction(async connection => (await readState(connection, id, false)).record);
}

export async function updateAdminCustomer(rawId: string, body: unknown): Promise<AdminCustomerRecord> {
  const id = customerId(rawId);
  const input = updateSchema.safeParse(body);
  if (!input.success) throw new CommerceError(400, 'Enter a valid customer name, email and current version.');
  await ensureAdminCustomerSchema();
  return transaction(async connection => {
    const state = await readState(connection, id, true);
    assertVersion(state, input.data.version);
    if (state.profile.password_available && input.data.email === null) {
      throw new CommerceError(400, 'Keep an email address for this customer’s password sign-in.');
    }
    // Profile contact fields never transfer Google/Telegram identities or touch passwords.
    await connection.execute('UPDATE digimium_customers SET name = ?, email = ? WHERE id = ?',
      [input.data.name, input.data.email, id]);
    return (await readState(connection, id, true)).record;
  });
}

function telegramChallengeKey(): Buffer | null {
  const secret = process.env.ADMIN_AUTH_SECRET?.trim();
  const origin = process.env.APP_ORIGIN;
  if (!secret || secret.length < 32 || !origin) return null;
  return createHmac('sha256', secret).update('digimium/telegram-auth/v1\n' + origin).digest();
}

function challengeOwnedBy(row: ChallengeRow, id: string, telegramId: string | null | undefined, key: Buffer): boolean {
  try {
    if (row.payload.length > 32 * 1024) return false;
    const envelope = Buffer.from(row.payload, 'base64url');
    if (envelope.length < 29) return false;
    const decipher = createDecipheriv('aes-256-gcm', key, envelope.subarray(0, 12));
    decipher.setAAD(Buffer.from('challenge:' + row.id_hash.toString('base64url')));
    decipher.setAuthTag(envelope.subarray(12, 28));
    const value: unknown = JSON.parse(Buffer.concat([decipher.update(envelope.subarray(28)), decipher.final()]).toString('utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const flow = value as Record<string, unknown>;
    if (flow.purpose === 'link') {
      const link = flow.link;
      return !!link && typeof link === 'object' && !Array.isArray(link) &&
        (link as Record<string, unknown>).customerId === id;
    }
    // A link attempted by another website customer remains theirs even if it names
    // this Telegram user. Only ordinary verified login flows use the identity binding.
    if (flow.purpose !== undefined && flow.purpose !== 'login') return false;
    const identity = flow.identity;
    return !!telegramId && !!identity && typeof identity === 'object' && !Array.isArray(identity) &&
      (identity as Record<string, unknown>).id === telegramId;
  } catch {
    // Legacy/corrupt envelopes cannot prove ownership. Never guess from email/name,
    // delete another customer's flow, or expose challenge data through an error.
    return false;
  }
}

async function removeOwnedTelegramChallenges(connection: PoolConnection, state: State) {
  const key = telegramChallengeKey();
  if (!key) return;
  let cursor: Buffer | undefined;
  for (;;) {
    // Page the legacy encrypted table; there is no plaintext customer index.
    // Only matching rows are locked and rechecked, so unrelated flows stay untouched.
    const [rows] = await connection.execute<ChallengeRow[]>(
      `SELECT id_hash, payload FROM digimium_telegram_auth_challenges${cursor ? ' WHERE id_hash > ?' : ''} ORDER BY id_hash LIMIT 100`,
      cursor ? [cursor] : [],
    );
    if (!rows.length) return;
    for (const row of rows) {
      if (!challengeOwnedBy(row, state.profile.id, state.profile.telegram_id, key)) continue;
      const [locked] = await connection.execute<ChallengeRow[]>(
        'SELECT id_hash, payload FROM digimium_telegram_auth_challenges WHERE id_hash = ? FOR UPDATE', [row.id_hash],
      );
      if (locked[0] && challengeOwnedBy(locked[0], state.profile.id, state.profile.telegram_id, key)) {
        await connection.execute('DELETE FROM digimium_telegram_auth_challenges WHERE id_hash = ?', [row.id_hash]);
      }
    }
    cursor = rows[rows.length - 1].id_hash;
    if (rows.length < 100) return;
  }
}

export async function removeAdminCustomer(rawId: string, body: unknown): Promise<{ removed: true; id: string }> {
  const id = customerId(rawId);
  const input = removeSchema.safeParse(body);
  if (!input.success || input.data.confirmation !== id) {
    throw new CommerceError(400, 'Confirm removal using this customer’s exact ID and current version.');
  }
  await ensureAdminCustomerSchema();
  return transaction(async connection => {
    const state = await readState(connection, id, true);
    assertVersion(state, input.data.version);
    await removeOwnedTelegramChallenges(connection, state);
    await connection.execute('DELETE FROM digimium_orders WHERE customer_id = ?', [id]);
    await connection.execute('DELETE FROM digimium_giveaway_entries WHERE customer_id = ?', [id]);
    await connection.execute('DELETE FROM digimium_customer_sessions WHERE customer_id = ?', [id]);
    await connection.execute('DELETE FROM digimium_google_identities WHERE customer_id = ?', [id]);
    await connection.execute('DELETE FROM digimium_telegram_identities WHERE customer_id = ?', [id]);
    // Google challenge rows are unowned encrypted OAuth flows, not customer records.
    // Their result/session paths re-check the customer; never erase unrelated flows.
    const [removed] = await connection.execute<ResultSetHeader>('DELETE FROM digimium_customers WHERE id = ?', [id]);
    if (removed.affectedRows !== 1) throw new CommerceError(409, 'The customer changed. Reload before continuing.');
    return { removed: true as const, id };
  });
}
