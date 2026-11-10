import { env } from "cloudflare:workers";
import { and, eq } from "drizzle-orm";
import { getDb } from "../db";
import { catalogSnapshots } from "../db/schema";
import type { CatalogSnapshot, StoredLogo } from "../lib/storage-types";

export async function readSnapshot(): Promise<CatalogSnapshot | null> {
  const [row] = await getDb().select().from(catalogSnapshots).where(eq(catalogSnapshots.id, "main")).limit(1);
  return row ?? null;
}

export async function writeSnapshot(snapshot: CatalogSnapshot, expectedRevision: number): Promise<boolean> {
  const db = getDb();
  const rows = expectedRevision === 0
    ? await db.insert(catalogSnapshots).values({ id: "main", ...snapshot }).onConflictDoNothing().returning({ id: catalogSnapshots.id })
    : await db.update(catalogSnapshots).set(snapshot).where(
      and(eq(catalogSnapshots.id, "main"), eq(catalogSnapshots.revision, expectedRevision)),
    ).returning({ id: catalogSnapshots.id });
  return rows.length === 1;
}

function bucket(): R2Bucket {
  if (!env.BUCKET) throw new Error("The BUCKET binding is unavailable.");
  return env.BUCKET;
}

export async function putLogo(key: string, bytes: Uint8Array<ArrayBuffer>, contentType: string): Promise<void> {
  await bucket().put(key, bytes, { httpMetadata: { contentType, cacheControl: "public, max-age=31536000, immutable" } });
}

export async function logoExists(key: string): Promise<boolean> {
  return Boolean(await bucket().head(key));
}

export async function readLogo(key: string): Promise<StoredLogo | null> {
  return bucket().get(key);
}
