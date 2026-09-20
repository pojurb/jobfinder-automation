import { eq, inArray } from 'drizzle-orm';
import { db } from '../db';
import { jobs } from '../db/schema';
import { logger } from '../utils/logger';

export interface JunkMatch {
  reasons: string[];
}

export interface LegacyJunkCandidate extends JunkMatch {
  id: number;
  title: string;
  company: string;
}

export interface LegacyJunkCleanupOptions {
  apply?: boolean;
}

function decodeCommonEntities(value: string): string {
  return value
    .replace(/&#x27;|&#39;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/&amp;/gi, '&');
}

/**
 * Flags obvious non-job posts imported from the old Markdown scraper. The
 * result is advisory: callers must explicitly opt into persisting the flag.
 */
export function findLegacyJunkReasons(title: string): string[] {
  const normalized = decodeCommonEntities(title).replace(/\s+/g, ' ').trim().toLowerCase();
  const reasons: string[] = [];

  if (/^(?:hello[.!]?\s+)?i(?:'m| am)\b/.test(normalized)) {
    reasons.push('first-person post, not a job title');
  }
  if (/\b(?:refer me|could you refer|could you)\b/.test(normalized)) {
    reasons.push('referral/request language');
  }
  if (normalized.includes('?')) {
    reasons.push('question-style title');
  }
  if (/\b(?:request entity too large|application error|http\s*\d{3}\s+error)\b/.test(normalized)) {
    reasons.push('application error report');
  }

  return reasons;
}

export async function findLegacyJunkCandidates(): Promise<LegacyJunkCandidate[]> {
  const legacyJobs = await db
    .select({ id: jobs.id, title: jobs.title, company: jobs.company })
    .from(jobs)
    .where(eq(jobs.source, 'legacy-markdown'));

  return legacyJobs.flatMap((job) => {
    const reasons = findLegacyJunkReasons(job.title);
    return reasons.length > 0 ? [{ ...job, reasons }] : [];
  });
}

export async function runLegacyJunkCleanup(
  options: LegacyJunkCleanupOptions = {},
): Promise<{ candidates: LegacyJunkCandidate[]; marked: number }> {
  const candidates = await findLegacyJunkCandidates();

  if (candidates.length === 0) {
    logger.info('No likely junk legacy records found.');
    return { candidates, marked: 0 };
  }

  logger.info(`Found ${candidates.length} likely junk legacy record(s):`);
  for (const candidate of candidates) {
    console.log(`- [${candidate.id}] ${candidate.title} @ ${candidate.company}`);
    console.log(`  Reasons: ${candidate.reasons.join('; ')}`);
  }

  if (!options.apply) {
    logger.info('Dry run only. Re-run with --apply to mark these records as junk.');
    return { candidates, marked: 0 };
  }

  const ids = candidates.map((candidate) => candidate.id);
  await db.update(jobs).set({ isJunk: true }).where(inArray(jobs.id, ids));
  logger.info(`Marked ${ids.length} legacy record(s) as junk. No records were deleted.`);
  return { candidates, marked: ids.length };
}
