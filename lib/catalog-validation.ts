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
  published: z.boolean(),
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
  published: z.boolean(),
}).strict().superRefine(validateDiscount);

export const catalogSettingsSchema = z.object({
  hideShortDescriptions: z.boolean().optional(),
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
