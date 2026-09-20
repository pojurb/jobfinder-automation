CREATE TABLE `company_career_sources` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`company_norm` text NOT NULL,
	`company_display` text NOT NULL,
	`domain` text,
	`ats_type` text,
	`slug` text,
	`board_url` text,
	`method` text NOT NULL,
	`confidence` text NOT NULL,
	`status` text NOT NULL,
	`open_jobs_count` integer,
	`last_checked_at` integer NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `company_career_sources_company_norm_unique` ON `company_career_sources` (`company_norm`);