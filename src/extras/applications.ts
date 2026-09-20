import { and, desc, eq, gte, isNull } from 'drizzle-orm';
import { db } from '../db';
import { applications, jobs, jobScores } from '../db/schema';
import { logger } from '../utils/logger';

export const APPLICATION_STATUSES = ['pending', 'applied', 'interviewing', 'rejected', 'ghosted'] as const;
export type ApplicationStatus = typeof APPLICATION_STATUSES[number];
export const APPLY_READY_FRESH_DAYS = 14;

export interface ApplicationRecord {
  status: ApplicationStatus;
  notes: string | null;
  appliedAt: Date | null;
  updatedAt: Date;
}

export interface ApplicationWrite {
  status: ApplicationStatus;
  notes: string | null;
  appliedAt: Date | null;
  updatedAt: Date;
}

export interface ApplyOptions {
  jobId: number;
  status: ApplicationStatus;
  notes?: string;
}

export function isApplicationStatus(value: string): value is ApplicationStatus {
  return (APPLICATION_STATUSES as readonly string[]).includes(value);
}

export function appendApplicationNotes(existing: string | null, addition?: string): string | null {
  const cleanAddition = addition?.trim();
  if (!cleanAddition) return existing;
  const cleanExisting = existing?.trim();
  return cleanExisting ? `${cleanExisting}\n\n${cleanAddition}` : cleanAddition;
}

export function buildApplicationWrite(
  existing: ApplicationRecord | undefined,
  status: ApplicationStatus,
  notes: string | undefined,
  now: Date,
): ApplicationWrite {
  const transitionedToApplied = status === 'applied' && existing?.status !== 'applied';
  return {
    status,
    notes: appendApplicationNotes(existing?.notes ?? null, notes),
    appliedAt: transitionedToApplied ? now : existing?.appliedAt ?? null,
    updatedAt: now,
  };
}

export function isFollowUpDue(
  application: Pick<ApplicationRecord, 'status' | 'appliedAt' | 'updatedAt'>,
  now: Date = new Date(),
): boolean {
  if (application.status !== 'applied' || !application.appliedAt) return false;

  const cutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  return application.appliedAt < cutoff && application.updatedAt < cutoff;
}

export async function recordApplicationStatus(options: ApplyOptions): Promise<'inserted' | 'updated'> {
  const existing = await db
    .select({
      status: applications.status,
      notes: applications.notes,
      appliedAt: applications.appliedAt,
      updatedAt: applications.updatedAt,
    })
    .from(applications)
    .where(eq(applications.jobId, options.jobId))
    .limit(1);

  const now = new Date();
  const current = existing[0]
    ? { ...existing[0], status: existing[0].status as ApplicationStatus }
    : undefined;
  const write = buildApplicationWrite(current, options.status, options.notes, now);

  if (current) {
    await db
      .update(applications)
      .set(write)
      .where(eq(applications.jobId, options.jobId));
    return 'updated';
  }

  await db.insert(applications).values({ jobId: options.jobId, ...write });
  return 'inserted';
}

interface FunnelJob {
  id: number;
  title: string;
  company: string;
  location: string | null;
  totalScore: number | null;
}

export async function getApplyReadyBacklog(options: { includeStale?: boolean; includeUncertain?: boolean; now?: Date } = {}): Promise<FunnelJob[]> {
  const now = options.now ?? new Date();
  const freshnessCutoff = new Date(now.getTime() - APPLY_READY_FRESH_DAYS * 24 * 60 * 60 * 1000);
  const conditions = [
    eq(jobs.isJunk, false),
    gte(jobScores.totalScore, 70),
    gte(jobScores.remoteScore, options.includeUncertain ? 18 : 25),
    isNull(applications.id),
  ];
  if (!options.includeStale) conditions.push(gte(jobs.fetchedAt, freshnessCutoff));

  const candidates = await db
    .select({
      id: jobs.id,
      title: jobs.title,
      company: jobs.company,
      location: jobs.location,
      totalScore: jobScores.totalScore,
      rejectionReasons: jobScores.rejectionReasons,
    })
    .from(jobs)
    .innerJoin(jobScores, eq(jobs.id, jobScores.jobId))
    .leftJoin(applications, eq(jobs.id, applications.jobId))
    .where(and(...conditions))
    .orderBy(desc(jobScores.totalScore));

  return candidates.filter((job) =>
    !Array.isArray(job.rejectionReasons) || job.rejectionReasons.length === 0,
  );
}

export async function getFollowUpDue(now: Date = new Date()) {
  const appliedJobs = await db
    .select({
      id: jobs.id,
      title: jobs.title,
      company: jobs.company,
      url: jobs.url,
      appliedAt: applications.appliedAt,
      updatedAt: applications.updatedAt,
      status: applications.status,
    })
    .from(applications)
    .innerJoin(jobs, eq(applications.jobId, jobs.id))
    .where(and(eq(jobs.isJunk, false), eq(applications.status, 'applied')))
    .orderBy(applications.appliedAt);

  return appliedJobs.filter((job) => isFollowUpDue({
    status: job.status as ApplicationStatus,
    appliedAt: job.appliedAt,
    updatedAt: job.updatedAt,
  }, now));
}

export async function runApplyCommand(options: ApplyOptions): Promise<void> {
  const existingJob = await db
    .select({ id: jobs.id, title: jobs.title, company: jobs.company })
    .from(jobs)
    .where(and(eq(jobs.id, options.jobId), eq(jobs.isJunk, false)))
    .limit(1);

  if (!existingJob[0]) {
    logger.error(`No non-junk job found with ID ${options.jobId}.`);
    return;
  }

  const action = await recordApplicationStatus(options);
  logger.info(`${action === 'inserted' ? 'Recorded' : 'Updated'} ${existingJob[0].company} — ${existingJob[0].title} as ${options.status}.`);
}

export async function runFunnelCommand(options: { includeStale?: boolean; includeUncertain?: boolean } = {}): Promise<void> {
  const statusCounts = await db
    .select({ status: applications.status })
    .from(applications)
    .innerJoin(jobs, eq(applications.jobId, jobs.id))
    .where(eq(jobs.isJunk, false));
  const counts = Object.fromEntries(APPLICATION_STATUSES.map((status) => [status, 0]));
  for (const row of statusCounts) {
    if (isApplicationStatus(row.status)) counts[row.status]++;
  }

  const [backlog, followUpDue] = await Promise.all([
    getApplyReadyBacklog({ includeStale: options.includeStale, includeUncertain: options.includeUncertain }),
    getFollowUpDue(),
  ]);

  console.log('\nApplication funnel');
  for (const status of APPLICATION_STATUSES) console.log(`- ${status}: ${counts[status]}`);

  const verificationScope = options.includeStale ? 'all verification dates' : `verified in the last ${APPLY_READY_FRESH_DAYS} days`;
  const eligibilityScope = options.includeUncertain ? 'including uncertain remote locations' : 'explicit Indonesia/APAC/worldwide eligibility only';
  console.log(`\nApply-ready backlog (${backlog.length}; ${verificationScope}; ${eligibilityScope})`);
  for (const job of backlog) {
    console.log(`- [${job.id}] ${job.title} @ ${job.company} (${job.totalScore}/100, ${job.location || 'location not specified'})`);
  }
  if (backlog.length === 0 && !options.includeStale) {
    console.log('No recently verified apply-ready jobs. Run `npm run fetch`, then `npm run score`.');
  }

  console.log(`\nFollow-up due (${followUpDue.length})`);
  for (const job of followUpDue) {
    console.log(`- [${job.id}] ${job.title} @ ${job.company} — applied ${job.appliedAt?.toISOString()}`);
    console.log(`  ${job.url}`);
  }
}
