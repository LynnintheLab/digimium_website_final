import type { CheckoutContact } from './order-checkout-contact';

export type CommerceCustomer = {
  id: string;
  name: string;
  email: string | null;
  createdAt: string;
  passwordAvailable?: false;
  telegram?: { id: string; username: string | null };
  signInMethods?: { emailPassword: boolean; google: boolean; telegram: boolean };
};

export type AdminCustomerRecord = {
  customer: CommerceCustomer;
  version: string;
  summary: { orders: number; pending: number; approved: number; rejected: number; giveawayEntries: number };
};

export type CommerceAccountDetails = {
  account: string;
  password: string;
  manager: string;
  username: string;
};

export type CommerceOrderLine = {
  id: string;
  productId: string;
  planId: string | null;
  productName: string;
  planName: string | null;
  duration: string;
  price: string;
  quantity: number;
  startDate: string | null;
  endDate: string | null;
  accountInfo: string;
  accountDetails?: CommerceAccountDetails;
};

export type CommerceOrder = {
  id: string;
  customerId: string | null;
  guestName?: string;
  createdAt: string;
  approvedAt: string | null;
  rejectedAt?: string | null;
  customerNote?: string;
  status: 'pending' | 'approved' | 'rejected';
  revision: number;
  lines: CommerceOrderLine[];
  totalMmk: number | null;
};

export type OrderFulfillment = {
  id: string;
  startDate: string;
  endDate: string;
  accountInfo: string;
  accountDetails?: CommerceAccountDetails;
};

export type AdminCommerceOrder = CommerceOrder & { checkoutContact?: CheckoutContact };

export type TelegramOrder = Pick<CommerceOrder, 'id' | 'totalMmk'> & {
  lines: Pick<CommerceOrderLine, 'productName' | 'planName' | 'duration' | 'price' | 'quantity'>[];
};

export type TelegramCheckout = {
  id: string;
  customerId: string | null;
  order: TelegramOrder;
  customer: { name: string; email: string | null; googleEmail?: string; telegram?: Pick<NonNullable<CommerceCustomer['telegram']>, 'username'>; guest?: false }
    | { name: string | null; email: null; guest: true };
  telegram: string;
};
