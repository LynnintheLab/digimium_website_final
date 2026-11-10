import { z } from "zod";
import { markKeys } from "./catalog";

export const MAX_PRODUCTS = 100;
export const MAX_CATALOG_BYTES = 768 * 1024;

// These values are display text, never markup, image paths, or links.
const unsafeText = /[<>\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]|(?:[a-z][a-z\d+.-]*:\/\/|\b(?:javascript|data|vbscript|mailto):|\bwww\.)/i;
const plainText = (max: number, min = 0) =>
  z.string().trim().min(min).max(max).refine((text) => !unsafeText.test(text), {
    message: "Use plain text without HTML or links.",
  });

export const productSchema = z.object({
  id: z.string().min(1).max(64).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase letters, numbers, and single hyphens."),
  name: plainText(100, 1),
  category: z.number().int().min(1).max(4),
  mark: z.union([z.enum(markKeys), z.literal("")]),
  description: plainText(500, 1),
  mm: plainText(500).optional(),
  price: plainText(80),
  duration: plainText(80),
  availability: z.enum(["available", "on-request", "unavailable"]),
  featured: z.boolean(),
  published: z.boolean(),
}).strict();

export const catalogSettingsSchema = z.object({
  email: z.string().trim().max(254).email(),
  viber: z.string().trim().regex(/^\+?[0-9]{7,15}$/, "Enter a phone number with 7–15 digits and an optional leading +."),
  viberLabel: plainText(80, 1),
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
