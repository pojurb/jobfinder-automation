import { sqliteTable, text, integer, uniqueIndex } from 'drizzle-orm/sqlite-core';

// ─── Jobs ───────────────────────────────────────────────────────────────────────

export const jobs = sqliteTable('jobs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  source: text('source').notNull(),
  sourceJobId: text('source_job_id'),
  title: text('title').notNull(),
  company: text('company').notNull(),
  location: text('location'),
  remoteRegion: text('remote_region'),
  url: text('url').notNull(),
  description: text('description'),
  salary: text('salary'),
  postedAt: text('posted_at'),
  fetchedAt: integer('fetched_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  contentHash: text('content_hash'),
  rawJson: text('raw_json', { mode: 'json' }),
}, (table) => ({
  sourceJobIdx: uniqueIndex('source_job_id_idx').on(table.source, table.sourceJobId),
}));

// ─── Job Scores ─────────────────────────────────────────────────────────────────

export const jobScores = sqliteTable('job_scores', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  jobId: integer('job_id').notNull().references(() => jobs.id, { onDelete: 'cascade' }),
  totalScore: integer('total_score'),
  roleScore: integer('role_score'),
  remoteScore: integer('remote_score'),
  seniorityScore: integer('seniority_score'),
  domainScore: integer('domain_score'),
  aiProductScore: integer('ai_product_score'),
  freshnessScore: integer('freshness_score'),
  matchReasons: text('match_reasons', { mode: 'json' }),
  rejectionReasons: text('rejection_reasons', { mode: 'json' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
});

// ─── Applications ───────────────────────────────────────────────────────────────

export const applications = sqliteTable('applications', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  jobId: integer('job_id').notNull().references(() => jobs.id, { onDelete: 'cascade' }),
  status: text('status').notNull().default('pending'),
  notes: text('notes'),
  appliedAt: integer('applied_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
});

// ─── Discovered Companies ───────────────────────────────────────────────────────

export const discoveredCompanies = sqliteTable('discovered_companies', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  slug: text('slug').notNull(),
  name: text('name'),
  atsType: text('ats_type').notNull(), // 'greenhouse' | 'lever' | 'ashby'
  discoveredFrom: text('discovered_from'), // URL or 'seed'
  isActive: integer('is_active').notNull().default(1),
  failCount: integer('fail_count').notNull().default(0),
  lastCheckedAt: integer('last_checked_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
}, (table) => ({
  slugAtsIdx: uniqueIndex('slug_ats_type_idx').on(table.slug, table.atsType),
}));
