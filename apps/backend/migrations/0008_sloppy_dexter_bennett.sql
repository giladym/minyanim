CREATE TABLE `message` (
	`id` text PRIMARY KEY NOT NULL,
	`sender_user_id` text NOT NULL,
	`recipient_user_id` text NOT NULL,
	`body` text NOT NULL,
	`read` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`sender_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`recipient_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `message_recipient_idx` ON `message` (`recipient_user_id`);--> statement-breakpoint
CREATE INDEX `message_pair_idx` ON `message` (`recipient_user_id`,`sender_user_id`);--> statement-breakpoint
ALTER TABLE `user` ADD `accept_messages` integer DEFAULT true NOT NULL;