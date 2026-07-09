CREATE TABLE `layer` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`icon` text,
	`display_order` integer DEFAULT 0 NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `layer_order_idx` ON `layer` (`display_order`);--> statement-breakpoint
CREATE TABLE `place` (
	`id` text PRIMARY KEY NOT NULL,
	`layer_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`lat` real NOT NULL,
	`lng` real NOT NULL,
	`address` text,
	`phone` text,
	`hours` text,
	`images` text,
	`kosher_meta` text,
	`source` text NOT NULL,
	`source_id` text,
	`license` text NOT NULL,
	`attribution` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`layer_id`) REFERENCES `layer`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `place_lat_lng_idx` ON `place` (`lat`,`lng`);--> statement-breakpoint
CREATE INDEX `place_layer_idx` ON `place` (`layer_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `place_source_uidx` ON `place` (`source`,`source_id`);--> statement-breakpoint
ALTER TABLE `user` ADD `is_admin` integer DEFAULT false NOT NULL;--> statement-breakpoint
--> 010 hand-authored: per-name case-insensitive uniqueness for layers (Drizzle can't emit COLLATE).
CREATE UNIQUE INDEX `layer_name_uidx` ON `layer` (`name` COLLATE NOCASE);--> statement-breakpoint
--> 010 hand-authored data migration: seed a "Chabad houses" layer and COPY existing beit_chabad
--> pins into `place` (additive — the old table + discovery stay untouched; the drop/fold defers to 011).
INSERT INTO `layer` (`id`,`name`,`icon`,`display_order`,`active`,`created_at`,`updated_at`)
  VALUES ('layer_chabad_houses','Chabad houses','chabad',0,1,unixepoch(),unixepoch());--> statement-breakpoint
INSERT INTO `place` (`id`,`layer_id`,`name`,`lat`,`lng`,`address`,`phone`,`source`,`source_id`,`license`,`created_at`,`updated_at`)
  SELECT 'place_'||`id`,'layer_chabad_houses',`name`,`lat`,`lng`,`address`,`phone`,'beit_chabad_seed',`id`,'internal',`created_at`,`updated_at` FROM `beit_chabad_pin`;