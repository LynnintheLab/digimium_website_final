import { PAYMENT_METHODS, type CheckoutPaymentMethod, type PaymentMethod } from './payment.ts';

const testingOrigin = 'https://test.buywith-digimium.store';

const demoMethods: CheckoutPaymentMethod[] = PAYMENT_METHODS.map(({ id, name }) => ({
  id,
  enabled: true,
  demo: true,
  accountName: `${name} demo · Testing only`,
  accountNumber: `DEMO-${id.toUpperCase()}-NO-PAYMENT`,
  qrPath: `/assets/demo-payments/${id}.png`,
  instructions: '',
  ...(id === 'binance' ? { mmkPerUsdt: 4000 } : {}),
}));

export function checkoutPaymentMethods(saved: PaymentMethod[] | undefined, origin = process.env.APP_ORIGIN): readonly CheckoutPaymentMethod[] | undefined {
  if (saved !== undefined) return saved;
  if (origin === testingOrigin || origin === `${testingOrigin}/`) return demoMethods;
}
