import type { RowDataPacket } from 'mysql2/promise';
import {
  CUSTOMER_ORDER_STATUS_LIMIT, TEST_ORDER_STATUS_ORIGIN, customerOrderStatusCommand, formatCustomerOrderStatus,
  type CustomerOrderStatus, type CustomerOrderStatusReply, type CustomerOrderStatusRequest,
} from '../lib/customer-order-status';
import { orderBotActionSettings } from './order-bot-actions';

/** Public handle only. The server never serializes any bot token or webhook secret. */
export function customerOrderBotLink(): string | undefined {
  if (!orderBotActionSettings()) return undefined;
  const username = (process.env.ORDER_ALERTS_TELEGRAM_BOT_USERNAME?.trim() || 'DigimiumTestingOrdersBot').replace(/^@/, '');
  if (!username || !/^[a-zA-Z][a-zA-Z0-9_]{4,31}$/.test(username) || !/bot$/i.test(username)) return undefined;
  return `https://t.me/${username}`;
}

/** Call only after verifying the dedicated order-bot webhook secret. No identity is inferred from a username. */
export async function customerOrderTelegramReply(request: CustomerOrderStatusRequest): Promise<CustomerOrderStatusReply | null> {
  if (process.env.APP_ORIGIN?.replace(/\/$/, '') !== TEST_ORDER_STATUS_ORIGIN) return null;
  const command = customerOrderStatusCommand(request);
  if (!command) return null;
  const [{ ensureTelegramIdentitySchema }, { ensureOrders }, { getPool }] = await Promise.all([
    import('./telegram-identity'), import('./orders'), import('./mysql'),
  ]);
  await ensureTelegramIdentitySchema();
  const pool = getPool();
  const [owners] = await pool.execute<RowDataPacket[]>(
    'SELECT 1 FROM digimium_telegram_identities t JOIN digimium_customers c ON c.id = t.customer_id WHERE t.telegram_id = ? LIMIT 1',
    [request.senderId],
  );
  if (!owners.length) return formatCustomerOrderStatus(request.senderId, { linked: false, orders: [] });
  await ensureOrders();
  // Query the identity again with each order read. No snapshot, credentials, notes, payment destination or proof leaves SQL.
  const [rows] = await pool.execute<(RowDataPacket & { id: string; stage: CustomerOrderStatus['stage']; rejected: number; websiteCheckout: number })[]>(
    `SELECT o.id, (o.checkout_state IS NOT NULL) AS websiteCheckout, (o.rejected_at IS NOT NULL) AS rejected,
       COALESCE(JSON_UNQUOTE(JSON_EXTRACT(o.checkout_state, '$.stage')), CASE WHEN o.approved_at IS NOT NULL THEN 'completed' END) AS stage
     FROM digimium_orders o JOIN digimium_telegram_identities t ON t.customer_id = o.customer_id
     JOIN digimium_customers c ON c.id = t.customer_id
     WHERE t.telegram_id = ? AND o.guest_key IS NULL${command.orderId ? ' AND o.id = ?' : ''}
     ORDER BY o.created_at DESC, o.id DESC LIMIT ${CUSTOMER_ORDER_STATUS_LIMIT}`,
    command.orderId ? [request.senderId, command.orderId] : [request.senderId],
  );
  return formatCustomerOrderStatus(request.senderId, { linked: true, requestedOrder: !!command.orderId,
    orders: rows.map(row => ({ id: row.id, stage: row.stage, rejected: !!row.rejected, websiteCheckout: !!row.websiteCheckout })) });
}
