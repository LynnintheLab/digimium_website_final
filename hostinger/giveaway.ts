import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { RowDataPacket } from 'mysql2/promise';
import { z } from 'zod';
import { CommerceError } from '../lib/commerce-http';
import { GIVEAWAY_PRIZES, giveawayDatesError, giveawayStatus, type AdminGiveawayData, type GiveawayCampaign, type GiveawayData } from '../lib/giveaway';
import { ensureCustomerSchema, type Customer } from './customer-auth';
import { getPool } from './mysql';

let schemaReady: Promise<void> | undefined;
const columns = `id, revision, DATE_FORMAT(starts_at, '%Y-%m-%dT%H:%i:%s.%fZ') AS startsAt,
  DATE_FORMAT(ends_at, '%Y-%m-%dT%H:%i:%s.%fZ') AS endsAt,
  DATE_FORMAT(launched_at, '%Y-%m-%dT%H:%i:%s.%fZ') AS launchedAt`;
type CampaignRow = RowDataPacket & { id: string; revision: number; startsAt: string | null; endsAt: string | null; launchedAt: string | null };
const iso = (value: string | null) => value ? value.replace(/(\.\d{3})\d{3}Z$/, '$1Z') : null;
const sqlDate = (value: string | null) => value ? value.replace('T', ' ').slice(0, 23) : null;
function present(row: CampaignRow): GiveawayCampaign {
  const dates = { startsAt: iso(row.startsAt), endsAt: iso(row.endsAt), launchedAt: iso(row.launchedAt) };
  return { id: row.id, revision: Number(row.revision), ...dates, status: giveawayStatus(dates), prizes: GIVEAWAY_PRIZES.map(prize => ({ ...prize })) };
}

export function ensureGiveaway(): Promise<void> {
  return schemaReady ??= (async () => {
    await ensureCustomerSchema();
    try { await getPool().query('SELECT 1 FROM digimium_giveaway_campaigns, digimium_giveaway_entries LIMIT 0'); }
    catch (error) {
      if (!(error instanceof Error && 'code' in error && error.code === 'ER_NO_SUCH_TABLE')) throw error;
      const schema = await readFile(join(process.cwd(), 'hostinger', 'giveaway-schema.sql'), 'utf8');
      for (const statement of schema.split(';').filter(value => value.trim())) await getPool().query(statement);
    }
  })().catch(error => { schemaReady = undefined; throw error; });
}

async function campaign() {
  await ensureGiveaway();
  let [rows] = await getPool().query<CampaignRow[]>(`SELECT ${columns} FROM digimium_giveaway_campaigns WHERE slot = 1`);
  if (!rows.length) {
    await getPool().execute('INSERT IGNORE INTO digimium_giveaway_campaigns (id, slot, created_at, updated_at) VALUES (?, 1, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))', [randomUUID()]);
    [rows] = await getPool().query<CampaignRow[]>(`SELECT ${columns} FROM digimium_giveaway_campaigns WHERE slot = 1`);
  }
  if (!rows.length) throw new Error('Giveaway configuration unavailable.');
  return present(rows[0]);
}

export async function publicGiveaway(customer: Customer | null): Promise<GiveawayData> {
  const current = await campaign();
  let joined = false;
  if (customer) {
    const [rows] = await getPool().execute<RowDataPacket[]>(
      'SELECT id FROM digimium_giveaway_entries WHERE campaign_id = ? AND (customer_id = ? OR telegram_id = ?) LIMIT 1',
      [current.id, customer.id, customer.telegram?.id ?? '']);
    joined = rows.length > 0;
  }
  const reason = !customer ? 'sign_in' : !customer.telegram ? 'link_telegram' : current.status !== 'open' ? 'not_open' : null;
  return { campaign: current, viewer: { signedIn: !!customer, telegramLinked: !!customer?.telegram, joined,
    canJoin: !joined && reason === null, reason } };
}

const joinSchema = z.object({ campaignId: z.string().uuid() }).strict();
export async function joinGiveaway(customer: Customer, raw: unknown): Promise<{ data: GiveawayData; created: boolean }> {
  const parsed = joinSchema.safeParse(raw);
  if (!parsed.success) throw new CommerceError(400, 'Choose the current giveaway.');
  const current = await campaign();
  if (parsed.data.campaignId !== current.id) throw new CommerceError(409, 'This giveaway has changed. Refresh and try again.');
  const connection = await getPool().getConnection();
  let created = false;
  try {
    await connection.beginTransaction();
    const [campaignRows] = await connection.execute<CampaignRow[]>(`SELECT ${columns} FROM digimium_giveaway_campaigns WHERE id = ? FOR UPDATE`, [current.id]);
    if (!campaignRows.length) throw new CommerceError(409, 'This giveaway has changed. Refresh and try again.');
    // Check the verified, stable identity inside the transaction. Names/usernames are never eligibility proof.
    const [people] = await connection.execute<(RowDataPacket & { name: string; email: string | null; telegramId: string; telegramUsername: string | null })[]>(
      `SELECT c.name, c.email, t.telegram_id AS telegramId, t.username AS telegramUsername
       FROM digimium_customers c JOIN digimium_telegram_identities t ON t.customer_id = c.id WHERE c.id = ? FOR UPDATE`, [customer.id]);
    if (!people.length) throw new CommerceError(403, 'Connect your Telegram account before joining.');
    const person = people[0];
    const [existing] = await connection.execute<RowDataPacket[]>(
      'SELECT id FROM digimium_giveaway_entries WHERE campaign_id = ? AND (customer_id = ? OR telegram_id = ?) LIMIT 1',
      [current.id, customer.id, person.telegramId]);
    // A retry never creates a second entry or changes the original owner/snapshot, even after the deadline.
    if (!existing.length) {
      if (present(campaignRows[0]).status !== 'open') throw new CommerceError(409, 'This giveaway is not open for entries.');
      await connection.execute(`INSERT INTO digimium_giveaway_entries
        (id, campaign_id, customer_id, telegram_id, customer_name, customer_email, telegram_username, joined_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP(3))`,
      [randomUUID(), current.id, customer.id, person.telegramId, person.name, person.email, person.telegramUsername]);
      created = true;
    }
    await connection.commit();
    return { data: { campaign: present(campaignRows[0]), viewer: { signedIn: true, telegramLinked: true,
      joined: true, canJoin: false, reason: null } }, created };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally { connection.release(); }
}

export async function adminGiveaway(page = 1): Promise<AdminGiveawayData> {
  const current = await campaign();
  const pageSize = 100;
  const [counts] = await getPool().execute<(RowDataPacket & { total: number })[]>('SELECT COUNT(*) AS total FROM digimium_giveaway_entries WHERE campaign_id = ?', [current.id]);
  const entryCount = Number(counts[0].total);
  const totalPages = Math.max(1, Math.ceil(entryCount / pageSize));
  page = Math.min(Math.max(1, Math.floor(page)), totalPages);
  const [rows] = await getPool().query<(RowDataPacket & { id: string; customerId: string; name: string; email: string | null; telegramId: string; telegramUsername: string | null; joinedAt: string })[]>(
    `SELECT id, customer_id AS customerId, customer_name AS name, customer_email AS email, telegram_id AS telegramId,
     telegram_username AS telegramUsername, DATE_FORMAT(joined_at, '%Y-%m-%dT%H:%i:%s.%fZ') AS joinedAt
     FROM digimium_giveaway_entries WHERE campaign_id = ? ORDER BY joined_at DESC, id DESC LIMIT ? OFFSET ?`,
    [current.id, pageSize, (page - 1) * pageSize]);
  return { campaign: current, entryCount, entries: rows.map(row => ({ id: row.id, customerId: row.customerId, name: row.name,
    email: row.email, telegramId: row.telegramId, telegramUsername: row.telegramUsername, joinedAt: iso(row.joinedAt)! })), pagination: { page, pageSize, totalPages } };
}

const saveSchema = z.object({ revision: z.number().int().positive().max(Number.MAX_SAFE_INTEGER - 1), action: z.enum(['save', 'launch']),
  startsAt: z.string().nullable(), endsAt: z.string().nullable() }).strict();
export async function updateGiveaway(raw: unknown): Promise<AdminGiveawayData> {
  const parsed = saveSchema.safeParse(raw);
  if (!parsed.success) throw new CommerceError(400, 'Check the giveaway settings.');
  const current = await campaign();
  const input = parsed.data;
  const connection = await getPool().getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.execute<CampaignRow[]>(`SELECT ${columns} FROM digimium_giveaway_campaigns WHERE id = ? FOR UPDATE`, [current.id]);
    if (!rows.length || Number(rows[0].revision) !== input.revision) throw new CommerceError(409, 'The giveaway changed. Load the latest settings before saving.');
    const previous = present(rows[0]);
    if (input.action === 'launch' && previous.launchedAt) throw new CommerceError(409, 'This giveaway has already been launched.');
    const error = giveawayDatesError(input.startsAt, input.endsAt, input.action === 'launch');
    if (error) throw new CommerceError(400, error);
    if (previous.launchedAt && (!input.startsAt || !input.endsAt)) throw new CommerceError(400, 'A launched giveaway must keep its start and end times.');
    await connection.execute(`UPDATE digimium_giveaway_campaigns SET starts_at = ?, ends_at = ?,
      launched_at = ${input.action === 'launch' ? 'UTC_TIMESTAMP(3)' : 'launched_at'}, revision = revision + 1, updated_at = UTC_TIMESTAMP(3) WHERE id = ?`,
    [sqlDate(input.startsAt), sqlDate(input.endsAt), current.id]);
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally { connection.release(); }
  return adminGiveaway();
}
