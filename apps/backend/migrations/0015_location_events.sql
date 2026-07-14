ALTER TABLE `event` ADD `stay_id` text REFERENCES stay(id);--> statement-breakpoint
CREATE INDEX `event_stay_idx` ON `event` (`stay_id`);--> statement-breakpoint
ALTER TABLE `stay` DROP COLUMN `brings_sefer_torah`;--> statement-breakpoint
ALTER TABLE `stay` DROP COLUMN `prayer_needs`;