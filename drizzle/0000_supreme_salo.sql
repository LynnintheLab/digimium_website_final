CREATE TABLE `catalog_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`payload` text NOT NULL,
	`revision` integer NOT NULL,
	`updated_at` text NOT NULL,
	CONSTRAINT "catalog_singleton" CHECK("catalog_snapshots"."id" = 'main'),
	CONSTRAINT "catalog_positive_revision" CHECK("catalog_snapshots"."revision" > 0),
	CONSTRAINT "catalog_valid_json" CHECK(json_valid("catalog_snapshots"."payload"))
);
