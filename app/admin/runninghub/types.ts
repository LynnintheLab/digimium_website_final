import type { RunningHubOrder, RunningHubPack, RunningHubPaymentMethod, RunningHubStock } from '@/lib/runninghub';

export type Pack = RunningHubPack;
export type StockItem = RunningHubStock;
export type AdminOrder = RunningHubOrder & { customerName?: string; customerEmail?: string | null };
export type RunningHubData = {
  packs: RunningHubPack[];
  methods: RunningHubPaymentMethod[];
  settingsRevision: number;
  stock: RunningHubStock[];
  orders: AdminOrder[];
};

export const paymentLabels = { kpay: 'KPay', aya: 'AYA Pay' } as const;
export const orderLabels: Record<RunningHubOrder['status'], string> = {
  awaiting_payment: 'Awaiting payment', payment_review: 'Review payment', approved: 'Key delivered',
  rejected: 'Payment rejected', expired: 'Reservation expired',
};
export const reference = (id: string) => id.replaceAll('-', '').slice(0, 8).toUpperCase();
export const mmk = (amount: number) => `${amount.toLocaleString('en-US')} MMK`;
export function orderDate(value: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Yangon',
  }).format(date);
}
