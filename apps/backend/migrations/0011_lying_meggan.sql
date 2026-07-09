PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_flag` (
	`id` text PRIMARY KEY NOT NULL,
	`content_type` text NOT NULL,
	`content_id` text NOT NULL,
	`user_id` text NOT NULL,
	`reason` text NOT NULL,
	`reported_user_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`reported_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
--> 006: destructive flag reshape (event_id → polymorphic content_type/content_id). Old event-only
--> flag rows can't map to the new shape and are discarded (pre-launch, no real data) — no copy.
DROP TABLE `flag`;--> statement-breakpoint
ALTER TABLE `__new_flag` RENAME TO `flag`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `flag_content_user_uidx` ON `flag` (`content_type`,`content_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `flag_content_idx` ON `flag` (`content_type`,`content_id`);--> statement-breakpoint
ALTER TABLE `stay` ADD `hidden` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `user` ADD `status` text DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE `user` ADD `suspended_until` integer;