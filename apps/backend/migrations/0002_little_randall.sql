CREATE TABLE `beit_chabad_pin` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`address` text,
	`phone` text,
	`city` text NOT NULL,
	`country` text NOT NULL,
	`lat` real NOT NULL,
	`lng` real NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `commitment` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`user_id` text NOT NULL,
	`num_men` integer NOT NULL,
	`stay_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `event`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`stay_id`) REFERENCES `stay`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `commitment_event_user_uidx` ON `commitment` (`event_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `commitment_event_idx` ON `commitment` (`event_id`);--> statement-breakpoint
CREATE INDEX `commitment_user_idx` ON `commitment` (`user_id`);--> statement-breakpoint
CREATE TABLE `event` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text DEFAULT 'minyan' NOT NULL,
	`host_user_id` text NOT NULL,
	`city` text NOT NULL,
	`country` text NOT NULL,
	`lat` real NOT NULL,
	`lng` real NOT NULL,
	`address_private` text,
	`event_date` integer NOT NULL,
	`event_time` text NOT NULL,
	`status` text DEFAULT 'forming' NOT NULL,
	`hidden` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`host_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `event_host_idx` ON `event` (`host_user_id`);--> statement-breakpoint
CREATE INDEX `event_lat_lng_idx` ON `event` (`lat`,`lng`);--> statement-breakpoint
CREATE INDEX `event_status_type_date_idx` ON `event` (`status`,`type`,`event_date`);--> statement-breakpoint
CREATE TABLE `event_role` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`role` text NOT NULL,
	`user_id` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `event`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `event_role_uidx` ON `event_role` (`event_id`,`role`);--> statement-breakpoint
CREATE TABLE `flag` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`user_id` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `event`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `flag_event_user_uidx` ON `flag` (`event_id`,`user_id`);--> statement-breakpoint
CREATE TABLE `minyan` (
	`event_id` text PRIMARY KEY NOT NULL,
	`tefilla` text NOT NULL,
	`nusach` text DEFAULT 'any' NOT NULL,
	`sefer_torah` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `event`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `notification` (
	`id` text PRIMARY KEY NOT NULL,
	`recipient_user_id` text NOT NULL,
	`event_id` text NOT NULL,
	`kind` text NOT NULL,
	`read` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`recipient_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`event_id`) REFERENCES `event`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `notification_recipient_idx` ON `notification` (`recipient_user_id`);--> statement-breakpoint
CREATE TABLE `notification_event_log` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`kind` text NOT NULL,
	`threshold` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `event`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `notification_event_log_uidx` ON `notification_event_log` (`event_id`,`kind`,`threshold`);--> statement-breakpoint
CREATE INDEX `stay_lat_lng_idx` ON `stay` (`lat`,`lng`);