import type { PoolConnection, RowDataPacket } from 'mysql2/promise';
import { todayInMyanmar } from '../lib/subscription-term';

const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

/** Assign after inserting the order, inside the same transaction as its creation. */
export async function assignOrderReference(connection: PoolConnection, orderId: string, createdAt: Date): Promise<string> {
  const orderDay = todayInMyanmar(createdAt);
  await connection.execute(`
    INSERT INTO digimium_order_daily_counters (order_day, last_number) VALUES (?, 1)
    ON DUPLICATE KEY UPDATE last_number = last_number + 1
  `, [orderDay]);
  // The upsert holds the day's row lock until commit, so concurrent orders get distinct numbers.
  const [[counter]] = await connection.execute<(RowDataPacket & { last_number: number })[]>(
    'SELECT last_number FROM digimium_order_daily_counters WHERE order_day = ?', [orderDay],
  );
  const [year, month, day] = orderDay.split('-');
  const date = year + months[Number(month) - 1] + day;
  const reference = `DG - ${date} - ${String(counter.last_number).padStart(3, '0')}`;
  await connection.execute('UPDATE digimium_orders SET order_reference = ? WHERE id = ?', [reference, orderId]);
  return reference;
}
