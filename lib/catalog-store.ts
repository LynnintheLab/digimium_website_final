import { readSnapshot, writeSnapshot } from "@digimium/storage";
import type { CatalogSnapshot } from "./storage-types";
import type { Catalog } from "./catalog";
import { initialCatalog } from "./initial-catalog";
import { catalogPayloadSchema, saveCatalogSchema, type SaveCatalogInput } from "./catalog-validation";

export class CatalogUnavailableError extends Error {
  constructor(cause: unknown) {
    super("The catalog is temporarily unavailable. Please try again shortly.", { cause });
    this.name = "CatalogUnavailableError";
  }
}

export class CatalogConflictError extends Error {
  constructor() {
    super("The catalog changed since you opened it. Reload the latest catalog before saving.");
    this.name = "CatalogConflictError";
  }
}

export function decodeSnapshot(row: CatalogSnapshot): Catalog {
  const payload = catalogPayloadSchema.parse(JSON.parse(row.payload));
  if (!Number.isSafeInteger(row.revision) || row.revision < 1 || Number.isNaN(Date.parse(row.updatedAt))) {
    throw new Error("Invalid catalog revision or timestamp.");
  }
  return { ...payload, revision: row.revision, updatedAt: row.updatedAt };
}

export async function getCatalog(): Promise<Catalog> {
  try {
    const row = await readSnapshot();
    // A successful empty query is the only situation that uses the seed.
    // Reads never create a record, and storage failures must stay visible.
    if (!row) return initialCatalog();
    return decodeSnapshot(row);
  } catch (error) {
    throw new CatalogUnavailableError(error);
  }
}

export async function getPublicCatalog(): Promise<Catalog> {
  const catalog = await getCatalog();
  return { ...catalog, products: catalog.products.filter((product) => product.published).map((product) => ({
    ...product,
    ...(catalog.settings.hideShortDescriptions ? { description: "", mm: undefined } : {}),
    ...(product.plans ? { plans: product.plans.filter((plan) => plan.published) } : {}),
  })) };
}

export async function saveCatalog(input: SaveCatalogInput): Promise<Catalog> {
  // Validate at the storage boundary as well as the HTTP boundary.
  const { expectedRevision, products, settings } = saveCatalogSchema.parse(input);
  const payload = JSON.stringify({ products, settings });
  const updatedAt = new Date().toISOString();
  try {
    const snapshot = { payload, updatedAt, revision: expectedRevision + 1 };
    if (!await writeSnapshot(snapshot, expectedRevision)) throw new CatalogConflictError();
    return { products, settings, updatedAt, revision: snapshot.revision };
  } catch (error) {
    if (error instanceof CatalogConflictError) throw error;
    throw new CatalogUnavailableError(error);
  }
}
