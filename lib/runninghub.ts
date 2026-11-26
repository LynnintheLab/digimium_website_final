export const RUNNINGHUB_PRODUCT_NAME = 'Running HUB API Key';
export const RUNNINGHUB_PACKS = [
  { id: 'usd10', label: '10 USD bundle', usd: 10, priceMmk: 70000 },
  { id: 'usd20', label: '20 USD bundle', usd: 20, priceMmk: 138000 },
] as const;
export type RunningHubPackId = typeof RUNNINGHUB_PACKS[number]['id'];
export type RunningHubPack = typeof RUNNINGHUB_PACKS[number] & { available: number };
export type RunningHubPaymentMethod = {
  id: 'kpay' | 'aya';
  enabled: boolean;
  accountLabel: string;
  accountNumber: string;
  qrPath?: string;
};
export type RunningHubOrder = {
  id: string;
  customerId: string;
  packId: RunningHubPackId;
  packLabel: string;
  priceMmk: number;
  status: 'awaiting_payment' | 'payment_review' | 'approved' | 'rejected' | 'expired';
  revision: number;
  createdAt: string;
  expiresAt: string | null;
  approvedAt: string | null;
  payment: RunningHubPaymentMethod;
  proofUrl: string | null;
  proofRequestId: string | null;
  keyId: string | null;
  keyName: string | null;
  note: string;
};
export type RunningHubStock = {
  id: string;
  packId: RunningHubPackId;
  keyName: string | null;
  status: 'available' | 'reserved' | 'issued' | 'retired';
  reservedOrderId: string | null;
  issuedOrderId: string | null;
  createdAt: string;
};
export const RUNNINGHUB_PROOF_MAX_BYTES = 5 * 1024 * 1024;
export const RUNNINGHUB_RESERVATION_MINUTES = 30;

/** Wallet transaction references are compared consistently without storing the original value. */
export function normalizeRunningHubReference(raw: unknown): string | null {
  if (typeof raw !== 'string' || raw.length > 100 || !/^[a-z0-9 -]+$/i.test(raw)) return null;
  const value = raw.trim().replace(/[ -]/g, '').toUpperCase();
  return /^[A-Z0-9]{6,80}$/.test(value) ? value : null;
}
