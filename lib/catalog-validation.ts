import { z } from "zod";
import { discountPriceError } from "./pricing";
import { markKeys } from "./catalog";
import { normalizeTelegramUsername, validTelegramUsername } from "./telegram-contact";
import { LOGO_PATH_PATTERN } from "./logo-path";

export const MAX_PRODUCTS = 100;
export const MAX_CATALOG_BYTES = 768 * 1024;

// These values are display text, never markup, image paths, or links.
const unsafeText = /[<>\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]|(?:[a-z][a-z\d+.-]*:\/\/|\b(?:javascript|data|vbscript|mailto):|\bwww\.)/i;
const plainText = (max: number, min = 0) =>
  z.string().trim().min(min).max(max).refine((text) => !unsafeText.test(text), {
    message: "Use plain text without HTML or links.",
  });

const safeId = z.string().min(1).max(64).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase letters, numbers, and single hyphens.");

export const customerFieldSchema = z.object({
  id: safeId,
  label: plainText(100, 1),
  labelMy: plainText(160).optional(),
  type: z.enum(['text', 'email', 'password']),
  required: z.boolean(),
}).strict();

const checkoutFieldsSchema = z.array(customerFieldSchema).max(12).superRefine((fields, context) => {
  const ids = new Set<string>();
  for (const [index, field] of fields.entries()) {
    if (ids.has(field.id)) context.addIssue({ code: 'custom', path: [index, 'id'], message: 'Each requested field must have a unique ID.' });
    ids.add(field.id);
  }
});

export const paymentMethodSchema = z.object({
  id: z.enum(['kpay', 'aya', 'wave', 'binance']),
  enabled: z.boolean(),
  accountName: plainText(150),
  accountNumber: plainText(250),
  qrPath: z.union([z.string().regex(LOGO_PATH_PATTERN, 'Choose an uploaded payment QR image.'), z.literal('')]).optional(),
  instructions: plainText(1000),
  mmkPerUsdt: z.number().positive().max(1_000_000_000).optional(),
}).strict().superRefine((method, context) => {
  if (!method.enabled) return;
  for (const field of ['accountName', 'accountNumber'] as const) {
    if (!method[field]) context.addIssue({ code: 'custom', path: [field], message: 'Enter the recipient details before enabling this payment method.' });
  }
  if (method.id === 'binance' && !method.mmkPerUsdt) {
    context.addIssue({ code: 'custom', path: ['mmkPerUsdt'], message: 'Enter the MMK amount for one USDT before enabling Binance Pay.' });
  }
});

const paymentMethodsSchema = z.array(paymentMethodSchema).max(4).superRefine((methods, context) => {
  const ids = new Set<string>();
  for (const [index, method] of methods.entries()) {
    if (ids.has(method.id)) context.addIssue({ code: 'custom', path: [index, 'id'], message: 'Configure each payment method once.' });
    ids.add(method.id);
  }
});

function validateDiscount(offer: { price: string; discountPrice?: string }, context: z.RefinementCtx) {
  const issue = discountPriceError(offer.price, offer.discountPrice);
  if (issue) context.addIssue({ code: z.ZodIssueCode.custom, path: [issue.field], message: issue.message });
}

export const productPlanSchema = z.object({
  id: safeId,
  name: plainText(180, 1),
  price: plainText(80),
  discountPrice: plainText(80).optional(),
  duration: plainText(80),
  bestSeller: z.boolean().optional(),
  published: z.boolean(),
  checkoutFields: checkoutFieldsSchema.optional(),
}).strict().superRefine(validateDiscount);

const plansSchema = z.array(productPlanSchema).max(30).superRefine((plans, context) => {
  const ids = new Set<string>();
  for (const [index, plan] of plans.entries()) {
    if (ids.has(plan.id)) context.addIssue({ code: z.ZodIssueCode.custom, path: [index, "id"], message: "Each plan must have a unique ID within its product." });
    ids.add(plan.id);
  }
});

export const productSchema = z.object({
  id: safeId,
  name: plainText(100, 1),
  category: z.number().int().min(1).max(4),
  mark: z.union([z.enum(markKeys), z.literal("")]),
  logoPath: z.union([z.string().regex(LOGO_PATH_PATTERN, "Choose an uploaded product logo."), z.literal("")]).optional(),
  plans: plansSchema.optional(),
  description: plainText(500, 1),
  mm: plainText(500).optional(),
  price: plainText(80),
  discountPrice: plainText(80).optional(),
  duration: plainText(80),
  availability: z.enum(["available", "on-request", "unavailable"]),
  featured: z.boolean(),
  bestSeller: z.boolean().optional(),
  published: z.boolean(),
  checkoutFields: checkoutFieldsSchema.optional(),
}).strict().superRefine(validateDiscount);

export const catalogSettingsSchema = z.object({
  hideShortDescriptions: z.boolean().optional(),
  paymentMethods: paymentMethodsSchema.optional(),
  email: z.string().trim().max(254).email(),
  viber: z.string().trim().regex(/^\+?[0-9]{7,15}$/, "Enter a phone number with 7–15 digits and an optional leading +."),
  viberLabel: plainText(80, 1),
  telegram: z.string().trim().max(33).refine(validTelegramUsername, "Enter the Telegram username for order messages.").transform(normalizeTelegramUsername).optional(),
}).strict();

const productsSchema = z.array(productSchema).max(MAX_PRODUCTS).superRefine((products, context) => {
  const ids = new Set<string>();
  for (const [index, product] of products.entries()) {
    if (ids.has(product.id)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: [index, "id"], message: "Each product must have a unique ID." });
    }
    ids.add(product.id);
  }
});

export const catalogPayloadSchema = z.object({
  products: productsSchema,
  settings: catalogSettingsSchema,
}).strict();

export const saveCatalogSchema = catalogPayloadSchema.extend({
  expectedRevision: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER - 1),
}).strict();

export type SaveCatalogInput = z.infer<typeof saveCatalogSchema>;
