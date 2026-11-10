import { createHash } from "node:crypto";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import type { CatalogSnapshot, StoredLogo } from "../lib/storage-types";
import { getPool } from "./mysql";

export async function readSnapshot(): Promise<CatalogSnapshot | null> {
  const [rows] = await getPool().execute<(CatalogSnapshot & RowDataPacket)[]>(
    "SELECT payload, revision, updated_at AS updatedAt FROM digimium_catalog WHERE id = 'main'",
  );
  return rows[0] ?? null;
}

export async function writeSnapshot(snapshot: CatalogSnapshot, expectedRevision: number): Promise<boolean> {
  const { payload, revision, updatedAt } = snapshot;
  if (expectedRevision === 0) {
    try {
      await getPool().execute(
        "INSERT INTO digimium_catalog (id, payload, revision, updated_at) VALUES ('main', ?, ?, ?)",
        [payload, revision, updatedAt],
      );
      return true;
    } catch (error) {
      // Exactly one of two concurrent first saves may create the singleton.
      if (error instanceof Error && "code" in error && error.code === "ER_DUP_ENTRY") return false;
      throw error;
    }
  }
  const [result] = await getPool().execute<ResultSetHeader>(
    "UPDATE digimium_catalog SET payload = ?, revision = ?, updated_at = ? WHERE id = 'main' AND revision = ?",
    [payload, revision, updatedAt, expectedRevision],
  );
  return result.affectedRows === 1;
}

export async function putLogo(key: string, bytes: Uint8Array<ArrayBuffer>, _contentType: string): Promise<void> {
  // The shared upload validator has already verified image type, dimensions and size.
  await getPool().execute("INSERT INTO digimium_logos (object_key, image_bytes) VALUES (?, ?)", [
    key,
    Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength),
  ]);
}

export async function logoExists(key: string): Promise<boolean> {
  const [rows] = await getPool().execute<RowDataPacket[]>(
    "SELECT 1 FROM digimium_logos WHERE object_key = ?",
    [key],
  );
  return rows.length > 0;
}

export async function readLogo(key: string): Promise<StoredLogo | null> {
  const [rows] = await getPool().execute<(RowDataPacket & { image_bytes: Buffer })[]>(
    "SELECT image_bytes FROM digimium_logos WHERE object_key = ?",
    [key],
  );
  if (!rows[0]) return null;
  const bytes = rows[0].image_bytes;
  const digest = createHash("sha256").update(bytes).digest("hex");
  return { body: new Uint8Array(bytes), size: bytes.byteLength, httpEtag: '"' + digest + '"' };
}
