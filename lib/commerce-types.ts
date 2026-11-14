export type CommerceCustomer = {
  id: string;
  name: string;
  email: string;
  createdAt: string;
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
};

export type CommerceOrder = {
  id: string;
  customerId: string | null;
  guestName?: string;
  createdAt: string;
  approvedAt: string | null;
  status: 'pending' | 'approved';
  revision: number;
  lines: CommerceOrderLine[];
  totalMmk: number | null;
};

export type OrderFulfillment = {
  id: string;
  startDate: string;
  endDate: string;
  accountInfo: string;
};

export type TelegramOrder = Pick<CommerceOrder, 'id' | 'totalMmk'> & {
  lines: Pick<CommerceOrderLine, 'productName' | 'planName' | 'duration' | 'price' | 'quantity'>[];
};

export type TelegramCheckout = {
  id: string;
  order: TelegramOrder;
  customer: { name: string; email: string; guest?: false } | { name: string | null; email: null; guest: true };
  telegram: string;
};
