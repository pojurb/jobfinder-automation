import { and, eq, gte, inArray } from 'drizzle-orm';
import { db } from '../db';
import { jobs } from '../db/schema';
import { logger } from '../utils/logger';
import { normalizeCompanyName } from '../utils/normalize';
import { normalizeTitleForOverlap, titleJaccardOverlap } from './career-resolver';

const ATS_SOURCES = ['greenhouse', 'lever', 'ashby', 'workable', 'smartrecruiters'];

// A legacy job counts as the same posting only on a near-exact title match. Looser
// than the resolver's 0.6 on purpose: here a false "open" hands the user a link to a
// different role.
const SAME_POSTING_OVERLAP = 0.8;
const GENERIC_TITLE_TOKENS = new Set(['product', 'manager', 'owner', 'management']);

export interface LegacyJob {
  id: number;
  company: string;
  title: string;
}

export interface FreshJob {
  company: string;
  title: string;
  url: string;
}

export type LegacyVerdict =
  | { id: number; status: 'open'; canonicalApplyUrl: string; matchedTitle: string }
  | { id: number; status: 'stale' };

/**
 * Pure matching. A legacy job is judged only when its company has fresh postings
 * from an official board (so we know the board was actually read). Then:
 * - a fresh posting with a near-identical title -> 'open' + the official apply URL
 * - none matches                                -> 'stale'
 * No verdict at all for: companies with no fresh postings, titles the fetch
 * pipeline would never have kept, and generic titles ("Product Manager" and
 * "Senior Product Manager" reduce to the same tokens) that cannot identify one posting.
 */
export function matchLegacyJobs(
  legacy: LegacyJob[],
  fresh: FreshJob[],
  isTrackedTitle: (title: string) => boolean
): LegacyVerdict[] {
  const freshByCompany = new Map<string, FreshJob[]>();
  for (const job of fresh) {
    const norm = normalizeCompanyName(job.company);
    if (!norm) continue;
    const list = freshByCompany.get(norm) ?? [];
    list.push(job);
    freshByCompany.set(norm, list);
  }

  const verdicts: LegacyVerdict[] = [];
  for (const job of legacy) {
    if (!isTrackedTitle(job.title)) continue;
    const tokens = normalizeTitleForOverlap(job.title);
    if (tokens.length === 0 || tokens.every((t) => GENERIC_TITLE_TOKENS.has(t))) continue;
    const candidates = freshByCompany.get(normalizeCompanyName(job.company));
    if (!candidates || candidates.length === 0) continue;

    const hit = candidates.find((c) => titleJaccardOverlap(c.title, job.title) >= SAME_POSTING_OVERLAP);
    verdicts.push(
      hit
        ? { id: job.id, status: 'open', canonicalApplyUrl: hit.url, matchedTitle: hit.title }
        : { id: job.id, status: 'stale' }
    );
  }
  return verdicts;
}

export interface VerifyLegacyOptions {
  dryRun?: boolean;
  /** How recent a fetch must be to count as a fresh read of the board. */
  freshDays?: number;
}

/**
 * Flags legacy-markdown jobs as open/stale by comparing them with what official
 * boards list right now. Only sets verified_status / canonical_apply_url /
 * verified_at; never deletes or edits anything else, and is fully reversible.
 */
export async function verifyLegacyJobs(options: VerifyLegacyOptions = {}): Promise<LegacyVerdict[]> {
  const freshDays = options.freshDays ?? 3;
  const since = new Date(Date.now() - freshDays * 24 * 60 * 60 * 1000);

  const legacy = await db
    .select({ id: jobs.id, company: jobs.company, title: jobs.title })
    .from(jobs)
    .where(and(eq(jobs.source, 'legacy-markdown'), eq(jobs.isJunk, false)));

  const fresh = await db
    .select({ company: jobs.company, title: jobs.title, url: jobs.url })
    .from(jobs)
    .where(and(inArray(jobs.source, ATS_SOURCES), gte(jobs.fetchedAt, since)));

  const { loadPipelineConfig } = await import('../fetchers');
  const keywords = loadPipelineConfig().search.keywords.map((k) => k.toLowerCase());
  const isTrackedTitle = (title: string) => keywords.some((k) => title.toLowerCase().includes(k));

  const verdicts = matchLegacyJobs(legacy, fresh, isTrackedTitle);
  const open = verdicts.filter((v) => v.status === 'open').length;
  const stale = verdicts.length - open;
  logger.info(
    `Legacy jobs: ${legacy.length}; fresh official postings read: ${fresh.length}; verdicts: ${open} open, ${stale} stale, ${legacy.length - verdicts.length} left unknown.`
  );

  if (options.dryRun) {
    logger.info('[DRY RUN] Nothing written.');
    return verdicts;
  }

  const now = new Date();
  for (const v of verdicts) {
    await db
      .update(jobs)
      .set({
        verifiedStatus: v.status,
        canonicalApplyUrl: v.status === 'open' ? v.canonicalApplyUrl : null,
        verifiedAt: now,
      })
      .where(eq(jobs.id, v.id));
  }
  logger.info(`Updated ${verdicts.length} legacy job(s).`);
  return verdicts;
}
