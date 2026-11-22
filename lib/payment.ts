export const PAYMENT_METHODS = [
  { id: 'kpay', name: 'KPay', file: 'kbzpay.jpg' },
  { id: 'aya', name: 'AYA Pay', file: 'ayapay.jpg' },
  { id: 'wave', name: 'Wave Pay', file: 'wavepay.jpg' },
  { id: 'binance', name: 'Binance Pay', file: 'binance.png' },
] as const;

export type PaymentMethodId = typeof PAYMENT_METHODS[number]['id'];
export const MAX_CUSTOMER_INPUT_UNITS = 100;

export type CustomerField = {
  id: string;
  label: string;
  labelMy?: string;
  type: 'text' | 'email' | 'password';
  required: boolean;
};

export type PaymentMethod = {
  id: PaymentMethodId;
  enabled: boolean;
  accountName: string;
  accountNumber: string;
  qrPath?: string;
  instructions: string;
  mmkPerUsdt?: number;
};

export type WebsiteCheckout = {
  stage: 'quote_required' | 'awaiting_payment' | 'payment_review' | 'payment_rejected' | 'processing' | 'completed';
  quotedAt?: string;
  payment?: {
    method: PaymentMethod;
    amount: string;
    currency: 'MMK' | 'USDT';
    submittedAt: string | null;
    approvedAt: string | null;
    rejectedAt: string | null;
    note: string;
    proofUrl: string | null;
  };
};

export type CustomerOrderInput = {
  lineId: string;
  unit: number;
  fields: (Pick<CustomerField, 'id' | 'label' | 'labelMy' | 'type'> & { value: string })[];
};

/** An explicit empty plan definition means that the plan requires no customer fields. */
export function checkoutFieldsFor(
  product: { checkoutFields?: CustomerField[] },
  plan?: { checkoutFields?: CustomerField[] } | null,
): CustomerField[] {
  return plan?.checkoutFields ?? product.checkoutFields ?? [];
}
