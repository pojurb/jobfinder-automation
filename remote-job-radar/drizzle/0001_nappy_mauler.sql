CREATE TABLE `discovered_companies` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`slug` text NOT NULL,
	`name` text,
	`ats_type` text NOT NULL,
	`discovered_from` text,
	`is_active` integer DEFAULT 1 NOT NULL,
	`fail_count` integer DEFAULT 0 NOT NULL,
	`last_checked_at` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `slug_ats_type_idx` ON `discovered_companies` (`slug`,`ats_type`);--> statement-breakpoint
CREATE UNIQUE INDEX `source_job_id_idx` ON `jobs` (`source`,`source_job_id`);