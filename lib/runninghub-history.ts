import type { RunningHubOrder } from './runninghub';

export type RunningHubHistoryStatus = 'pending' | 'purchased' | 'rejected';
export type RunningHubHistoryOrder = Pick<RunningHubOrder,
  'id' | 'packId' | 'packLabel' | 'priceMmk' | 'status' | 'createdAt' | 'approvedAt' | 'expiresAt'>;
export type RunningHubHistoryCounts = Record<RunningHubHistoryStatus, number>;
export type RunningHubHistoryPage = {
  customerId: string;
  orders: RunningHubHistoryOrder[];
  counts: RunningHubHistoryCounts;
  nextCursor: string | null;
};
