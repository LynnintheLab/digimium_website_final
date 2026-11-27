import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { formatAdminOrderCustomer, formatAdminTimestamp } from '../lib/admin-telegram-message';
import { CommerceError } from '../lib/commerce-http';
import { RUNNINGHUB_PRODUCT_NAME, type RunningHubPaymentMethod } from '../lib/runninghub';
import { AdminOrdersActionError, type AdminOrdersBotAdapter } from './admin-orders-telegram';

type ApprovalBinding = { id: string; proofRequestId: string; revision: number };
const uuid = z.string().uuid();
const bindingSchema = z.object({ id: uuid, proofRequestId: uuid, revision: z.number().int().positive().max(0xfffffffe) }).strict();
function signature(secret: string, bytes: Buffer) {
  return createHmac('sha256', secret).update('digimium/runninghub/approval-button/v1/').update(bytes).digest().subarray(0, 12);
}
/** 36-byte binding + 12-byte MAC = exactly Telegram's 64-byte callback_data limit. */
export function signRunningHubApproval(secret: string, order: ApprovalBinding): string {
  const input = bindingSchema.parse({ id: order.id, proofRequestId: order.proofRequestId, revision: order.revision });
  const body = Buffer.alloc(36);
  Buffer.from(input.id.replaceAll('-', ''), 'hex').copy(body, 0);
  Buffer.from(input.proofRequestId.replaceAll('-', ''), 'hex').copy(body, 16);
  body.writeUInt32BE(input.revision, 32);
  return Buffer.concat([body, signature(secret, body)]).toString('base64url');
}
export function runningHubAdminMessage(order: {
  id: string; createdAt: string; packLabel: string; paymentMethod: RunningHubPaymentMethod['id']; priceMmk: number;
}, status: 'payment_review' | 'approved', customer?: Parameters<typeof formatAdminOrderCustomer>[0]) {
  const reference = order.id.slice(0, 8).toUpperCase();
  const time = formatAdminTimestamp(order.createdAt);
  const method = order.paymentMethod === 'kpay' ? 'KPay' : 'AYA Pay';
  const customerDetails = customer ? formatAdminOrderCustomer(customer) : '';
  return [
    status === 'payment_review' ? '🧾 Payment review' : '✅ Payment approved',
    'Order ID: #' + reference,
    ...(time ? ['Order time: ' + time] : []),
    '',
    ...(customerDetails ? [customerDetails, ''] : []),
    RUNNINGHUB_PRODUCT_NAME + ' — ' + order.packLabel,
    `Payment: ${method} · ${order.priceMmk.toLocaleString('en-US')} MMK`,
  ];
}

function formatUuid(bytes: Buffer) {
  const hex = bytes.toString('hex');
  return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join('-');
}
export function readRunningHubApproval(secret: string, code: string): ApprovalBinding | null {
  if (!/^[A-Za-z0-9_-]{64}$/.test(code)) return null;
  const bytes = Buffer.from(code, 'base64url');
  if (bytes.length !== 48 || !timingSafeEqual(bytes.subarray(36), signature(secret, bytes.subarray(0, 36)))) return null;
  const parsed = bindingSchema.safeParse({ id: formatUuid(bytes.subarray(0, 16)),
    proofRequestId: formatUuid(bytes.subarray(16, 32)), revision: bytes.readUInt32BE(32) });
  return parsed.success ? parsed.data : null;
}
export function runningHubApprovalPrompt(code: string, orderId: string) {
  return 'Running HUB payment check\nOrder #' + orderId.slice(0, 8).toUpperCase() +
    '\nCheck the amount and recipient in your wallet, then reply to this message with that transaction reference.' +
    '\nNever send an API key or password.\nRH approval: ' + code;
}
export function readRunningHubApprovalPrompt(secret: string, text: string) {
  const code = /\nRH approval: ([A-Za-z0-9_-]{64})$/.exec(text)?.[1];
  if (!code) return null;
  const order = readRunningHubApproval(secret, code);
  return order && text === runningHubApprovalPrompt(code, order.id) ? { code, order } : null;
}
/** Repeated clicks on the same proof/revision map to one durable mutation receipt. */
export function runningHubApprovalRequestId(secret: string, code: string) {
  const bytes = createHmac('sha256', secret).update('digimium/runninghub/approval-request/v1/' + code).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  return formatUuid(bytes);
}
/** Running HUB is the first adapter of the store-wide Admin Orders bot. */
export const runningHubAdminOrdersAdapter: AdminOrdersBotAdapter = {
  namespace: 'runninghub.approval.v1',
  matchesCallback: (secret, code) => readRunningHubApproval(secret, code) !== null,
  async beginApproval(config, code) {
    const binding = readRunningHubApproval(config.secret, code);
    if (!binding) throw new CommerceError(400, 'Invalid Running HUB approval.');
    const { runningHubOrder, decideRunningHubOrder, recoverRunningHubAdminApproval } = await import('./runninghub');
    const { order } = await runningHubOrder(binding.id).catch(error => {
      if (error instanceof CommerceError && error.status === 404) throw new AdminOrdersActionError('order_missing');
      throw error;
    });
    // This also recognizes completed legacy reference-based approvals without changing their receipts.
    if (order.status === 'approved' && order.proofRequestId === binding.proofRequestId && order.revision === binding.revision + 1) {
      await recoverRunningHubAdminApproval(binding.id, binding.proofRequestId, binding.revision);
      return 'This payment was already approved. The key is available in the customer’s website purchase details.';
    }
    if (order.status === 'rejected') throw new AdminOrdersActionError('order_rejected');
    if (order.status === 'expired') throw new AdminOrdersActionError('order_expired');
    if (order.status === 'approved') throw new AdminOrdersActionError('order_approved');
    if (order.status !== 'payment_review' || !order.proofRequestId) throw new AdminOrdersActionError('receipt_missing');
    if (order.proofRequestId !== binding.proofRequestId) throw new AdminOrdersActionError('receipt_changed');
    if (order.revision !== binding.revision) throw new AdminOrdersActionError('order_changed');
    const result = await decideRunningHubOrder(binding.id, {
      action: 'approve', revision: binding.revision, proofRequestId: binding.proofRequestId,
      requestId: runningHubApprovalRequestId(config.secret, code),
    }, 'telegram:' + config.ownerId);
    return result.applied ? 'Payment approved. The key is available in the customer’s website purchase details.' : 'This approval was already recorded.';
  },
  matchesReply: (secret, prompt) => readRunningHubApprovalPrompt(secret, prompt) !== null,
  async completeApproval(config, prompt) {
    if (!readRunningHubApprovalPrompt(config.secret, prompt)) throw new CommerceError(400, 'Invalid Running HUB approval prompt.');
    // Old ForceReply messages remain recognizable, but replies no longer authorize payment.
    return 'A transaction reference is no longer needed. After checking the payment, tap Approve payment on the receipt or use website Admin.';
  },
};
