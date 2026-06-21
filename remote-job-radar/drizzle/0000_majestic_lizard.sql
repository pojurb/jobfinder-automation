CREATE TABLE `applications` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`job_id` integer NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`notes` text,
	`applied_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `job_scores` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`job_id` integer NOT NULL,
	`total_score` integer,
	`role_score` integer,
	`remote_score` integer,
	`seniority_score` integer,
	`domain_score` integer,
	`ai_product_score` integer,
	`freshness_score` integer,
	`match_reasons` text,
	`rejection_reasons` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `jobs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`source` text NOT NULL,
	`source_job_id` text,
	`title` text NOT NULL,
	`company` text NOT NULL,
	`location` text,
	`remote_region` text,
	`url` text NOT NULL,
	`description` text,
	`salary` text,
	`posted_at` text,
	`fetched_at` integer NOT NULL,
	`content_hash` text,
	`raw_json` text
);
