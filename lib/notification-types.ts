import type { NotificationAction } from './notification-action';

export type { NotificationAction } from './notification-action';

export type CustomerNotification = {
  id: string;
  type: 'message' | 'expiry';
  title: string;
  body: string;
  bodyMy?: string;
  createdAt: string;
  readAt: string | null;
  orderId?: string;
  action?: NotificationAction;
};

export type CustomerNotificationPage = {
  notifications: CustomerNotification[];
  unreadCount: number;
  nextCursor: string | null;
};
