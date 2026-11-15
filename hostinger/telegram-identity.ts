import { randomUUID } from 'node:crypto';
import type { PoolConnection, RowDataPacket } from 'mysql2/promise';
import { CommerceError } from '../lib/commerce-http';
import { ensureCustomerSchema, presentCustomer, type Customer, type CustomerIdentityRow } from './customer-auth';
import { getPool } from './mysql';
import { enqueueNotificationAlert } from './notifications';

/** Accept only Telegram profile fields verified by the bot webhook, never browser-provided identity claims. */
export type TelegramIdentity = { id: string; firstName: string; lastName?: string; username?: string };

export function ensureTelegramIdentitySchema(): Promise<void> {
  return ensureCustomerSchema();
}

function normalizedIdentity(input: TelegramIdentity) {
  const id = typeof input.id === 'string' ? input.id : '';
  const numericId = Number(id);
  if (!/^[1-9]\d{0,15}$/.test(id) || !Number.isSafeInteger(numericId) || numericId > 2 ** 52 - 1) throw new CommerceError(400, 'invalid');
  const first = typeof input.firstName === 'string' ? input.firstName.trim() : '';
  const last = typeof input.lastName === 'string' ? input.lastName.trim() : '';
  if (!first || first.length > 100 || last.length > 100 || /\p{Cc}/u.test(first + last)) throw new CommerceError(400, 'invalid');
  const name = Array.from([first, last].filter(Boolean).join(' ')).slice(0, 100).join('');
  const username = typeof input.username === 'string' && /^[A-Za-z0-9_]{5,32}$/.test(input.username) ? input.username : null;
  return { id, name, username };
}

async function resolveOnConnection(connection: PoolConnection, identity: ReturnType<typeof normalizedIdentity>): Promise<Customer> {
  const [bound] = await connection.execute<(RowDataPacket & CustomerIdentityRow)[]>(
    `SELECT c.id, c.name, c.email, c.password_hash IS NOT NULL AS password_available,
     DATE_FORMAT(c.created_at, '%Y-%m-%dT%H:%i:%sZ') AS createdAt, t.telegram_id, t.username AS telegram_username
     FROM digimium_telegram_identities t JOIN digimium_customers c ON c.id = t.customer_id WHERE t.telegram_id = ? FOR UPDATE`,
    [identity.id],
  );
  if (bound[0]) {
    // Only the stable numeric ID owns this account. Profile changes do not move orders or overwrite a saved name.
    if (bound[0].telegram_username !== identity.username) await connection.execute(
      'UPDATE digimium_telegram_identities SET username = ? WHERE telegram_id = ?', [identity.username, identity.id],
    );
    return presentCustomer({ ...bound[0], telegram_username: identity.username });
  }
  const createdAt = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  const timestamp = createdAt.slice(0, 19).replace('T', ' ');
  const customer: Customer = { id: randomUUID(), name: identity.name, email: null, createdAt,
    passwordAvailable: false, telegram: { id: identity.id, username: identity.username } };
  await connection.execute(
    'INSERT INTO digimium_customers (id, name, email, password_hash, created_at) VALUES (?, ?, NULL, NULL, ?)',
    [customer.id, customer.name, timestamp],
  );
  await connection.execute(
    'INSERT INTO digimium_telegram_identities (telegram_id, customer_id, username, created_at) VALUES (?, ?, ?, ?)',
    [identity.id, customer.id, identity.username, timestamp],
  );
  await enqueueNotificationAlert(connection, { kind: 'customer-created', dedupeKey: 'customer-created:' + customer.id,
    entityId: customer.id, customerName: customer.name, authProvider: 'telegram' });
  return customer;
}

/** A caller-supplied connection must already be inside a transaction and have completed schema bootstrap. */
export async function resolveTelegramIdentity(input: TelegramIdentity, connection?: PoolConnection): Promise<Customer> {
  const identity = normalizedIdentity(input);
  if (connection) return resolveOnConnection(connection, identity);
  await ensureTelegramIdentitySchema();
  for (let attempt = 0; ; attempt++) {
    const ownConnection = await getPool().getConnection();
    try {
      await ownConnection.beginTransaction();
      const customer = await resolveOnConnection(ownConnection, identity);
      await ownConnection.commit();
      return customer;
    } catch (error) {
      await ownConnection.rollback();
      const code = error instanceof Error && 'code' in error ? String(error.code) : '';
      if (attempt >= 2 || !['ER_DUP_ENTRY', 'ER_LOCK_DEADLOCK', 'ER_LOCK_WAIT_TIMEOUT'].includes(code)) throw error;
    } finally { ownConnection.release(); }
  }
}

/** Link only after both the original website session and this Telegram ID are proved. Never merge or transfer owners. */
export async function linkTelegramIdentity(input: TelegramIdentity, customerId: string, connection: PoolConnection): Promise<Customer> {
  const identity = normalizedIdentity(input);
  const [customers] = await connection.execute<(RowDataPacket & CustomerIdentityRow)[]>(
    `SELECT c.id, c.name, c.email, c.password_hash IS NOT NULL AS password_available,
     DATE_FORMAT(c.created_at, '%Y-%m-%dT%H:%i:%sZ') AS createdAt, t.telegram_id, t.username AS telegram_username,
     EXISTS(SELECT 1 FROM digimium_google_identities g WHERE g.customer_id = c.id) AS google_connected
     FROM digimium_customers c LEFT JOIN digimium_telegram_identities t ON t.customer_id = c.id WHERE c.id = ? FOR UPDATE`, [customerId],
  );
  const customer = customers[0];
  if (!customer) throw new CommerceError(401, 'signed_out');
  if (customer.telegram_id && customer.telegram_id !== identity.id) throw new CommerceError(409, 'telegram_already_linked');
  const [bound] = await connection.execute<(RowDataPacket & { customer_id: string })[]>(
    'SELECT customer_id FROM digimium_telegram_identities WHERE telegram_id = ? FOR UPDATE', [identity.id],
  );
  if (bound[0] && bound[0].customer_id !== customerId) throw new CommerceError(409, 'telegram_in_use');
  if (bound[0]) {
    await connection.execute('UPDATE digimium_telegram_identities SET username = ? WHERE telegram_id = ? AND customer_id = ?',
      [identity.username, identity.id, customerId]);
  } else {
    await connection.execute('INSERT INTO digimium_telegram_identities (telegram_id, customer_id, username, created_at) VALUES (?, ?, ?, UTC_TIMESTAMP(3))',
      [identity.id, customerId, identity.username]);
  }
  return presentCustomer({ ...customer, telegram_id: identity.id, telegram_username: identity.username });
}
