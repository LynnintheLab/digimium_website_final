import { z } from 'zod';
import { MAX_CUSTOMER_INPUT_UNITS } from './payment';
import { MAX_ORDER_CONTACT_LENGTH, normalizeOrderContact } from './order-contact';

const safeId = z.string().min(1).max(64).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const revision = z.number().int().positive().max(0xfffffffe);
const inputValue = z.string().max(1000).refine(value => !/\p{Cc}/u.test(value));
const note = z.string().max(1000).transform(value => value.replace(/\r\n?/g, '\n').trim())
  .refine(value => !/[\p{Cc}\u202a-\u202e\u2066-\u2069]/u.test(value.replace(/\n/g, '')));
const orderContactSchema = z.object({
  method: z.enum(['telegram', 'viber', 'facebook', 'phone']),
  value: z.string().max(MAX_ORDER_CONTACT_LENGTH),
}).strict().transform((input, context) => {
  const contact = normalizeOrderContact(input);
  if (contact) return contact;
  context.addIssue({ code: 'custom', message: 'Enter a valid contact for the selected channel.' });
  return z.NEVER;
});

export const websiteCheckoutSchema = z.object({
  requestId: z.string().uuid(),
  expectedCustomerId: z.string().uuid(),
  expectedCatalogRevision: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER - 1),
  contact: orderContactSchema,
  items: z.array(z.object({
    productId: safeId,
    planId: safeId.nullable(),
    quantity: z.number().int().positive().safe(),
    inputs: z.array(z.object({
      unit: z.number().int().nonnegative().safe(),
      values: z.record(safeId, inputValue),
    }).strict()).max(MAX_CUSTOMER_INPUT_UNITS).optional(),
  }).strict()).min(1).max(3000),
}).strict();

// Missing contact is accepted only for exact retries of orders created before contact was required.
export const websiteCheckoutRetrySchema = websiteCheckoutSchema.partial({ contact: true });

export const selectPaymentSchema = z.object({
  revision,
  methodId: z.enum(['kpay', 'aya', 'wave', 'binance']),
}).strict();

export const paymentDecisionSchema = z.object({
  action: z.enum(['payment-approve', 'payment-reject']),
  revision,
  note: note.optional(),
}).strict();

export const quoteOrderSchema = z.object({
  action: z.literal('quote'),
  revision,
  lines: z.array(z.object({
    id: z.string().uuid(),
    unitPriceMmk: z.number().int().nonnegative().safe(),
  }).strict()).min(1).max(3000),
}).strict();

export const proofRequestSchema = z.object({
  revision,
  requestId: z.string().uuid(),
}).strict();
