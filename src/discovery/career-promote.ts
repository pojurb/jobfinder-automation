import { db } from '../db';
import { companyCareerSources, discoveredCompanies } from '../db/schema';
import { logger } from '../utils/logger';

// ATS types that already have a fetcher in src/fetchers. Recruitee is resolvable
// but nothing consumes it yet, so promoting it would create rows that never run.
export const FETCHABLE_ATS_TYPES = new Set(['greenhouse', 'lever', 'ashby', 'workable', 'smartrecruiters']);

export interface ResolvedSourceRow {
  companyDisplay: string;
  atsType: string | null;
  slug: string | null;
  confidence: string;
  status: string;
  method: string;
}

export interface PromoteOptions {
  dryRun?: boolean;
  /** Also promote high-confidence rows that came from config/career-aliases.yaml. */
  includeManual?: boolean;
  /** Also promote medium-confidence rows (name not verified by the ATS). Off by default. */
  includeMedium?: boolean;
}

export interface PromotionPlan {
  promote: ResolvedSourceRow[];
  skipped: Array<{ row: ResolvedSourceRow; reason: string }>;
}

/** Pure selection logic so it can be tested without a database. */
export function planPromotion(
  rows: ResolvedSourceRow[],
  existingKeys: Set<string>,
  options: PromoteOptions = {}
): PromotionPlan {
  const plan: PromotionPlan = { promote: [], skipped: [] };
  const seen = new Set<string>();

  for (const row of rows) {
    const skip = (reason: string) => plan.skipped.push({ row, reason });

    if (row.status !== 'resolved' || !row.atsType || !row.slug) continue;
    if (row.confidence !== 'high' && !(options.includeMedium && row.confidence === 'medium')) {
      skip(`confidence ${row.confidence} (only high is promoted automatically)`);
      continue;
    }
    if (row.method === 'manual' && !options.includeManual) {
      skip('manual alias (shared or very large board); promote explicitly with --include-manual');
      continue;
    }
    if (!FETCHABLE_ATS_TYPES.has(row.atsType)) {
      skip(`no ${row.atsType} fetcher in this repo yet`);
      continue;
    }
    const key = `${row.atsType}:${row.slug.toLowerCase()}`;
    if (existingKeys.has(key) || seen.has(key)) {
      skip('already tracked in discovered_companies');
      continue;
    }
    seen.add(key);
    plan.promote.push(row);
  }
  return plan;
}

/**
 * Copies verified career sources into discovered_companies so the normal
 * `npm run fetch` pulls their current openings. Never deletes or edits
 * existing rows and never touches `jobs`.
 */
export async function promoteCareerSources(options: PromoteOptions = {}): Promise<PromotionPlan> {
  const rows = await db.select().from(companyCareerSources);
  const existing = await db
    .select({ slug: discoveredCompanies.slug, atsType: discoveredCompanies.atsType })
    .from(discoveredCompanies);
  const existingKeys = new Set(existing.map((e) => `${e.atsType}:${e.slug.toLowerCase()}`));

  const plan = planPromotion(rows, existingKeys, options);

  logger.info(`Promotable: ${plan.promote.length}, skipped: ${plan.skipped.length}`);
  for (const row of plan.promote) {
    logger.info(`  + ${row.companyDisplay} -> ${row.atsType}:${row.slug}`);
  }
  for (const { row, reason } of plan.skipped) {
    logger.info(`  - ${row.companyDisplay} (${row.atsType}:${row.slug}): ${reason}`);
  }

  if (options.dryRun) {
    logger.info('\n[DRY RUN] Nothing written to discovered_companies.');
    return plan;
  }

  for (const row of plan.promote) {
    await db
      .insert(discoveredCompanies)
      .values({
        slug: row.slug as string,
        name: row.companyDisplay,
        atsType: row.atsType as string,
        discoveredFrom: 'career-resolver',
        isActive: 1,
        failCount: 0,
      })
      .onConflictDoNothing();
  }
  logger.info(`Promoted ${plan.promote.length} board(s) into discovered_companies.`);
  return plan;
}
