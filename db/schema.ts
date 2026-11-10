import { sql } from "drizzle-orm";
import { check, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

// One versioned snapshot makes a catalog save all-or-nothing.
export const catalogSnapshots = sqliteTable(
  "catalog_snapshots",
  {
    id: text("id").primaryKey(),
    payload: text("payload").notNull(),
    revision: integer("revision").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    check("catalog_singleton", sql`${table.id} = 'main'`),
    check("catalog_positive_revision", sql`${table.revision} > 0`),
    check("catalog_valid_json", sql`json_valid(${table.payload})`),
  ],
);
