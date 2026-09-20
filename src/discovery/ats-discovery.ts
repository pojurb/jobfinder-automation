import { db } from '../db';
import { discoveredCompanies } from '../db/schema';
import { seedCompanies } from '../data/seed-companies';
import { NormalizedJob } from '../fetchers/types';
import { logger } from '../utils/logger';
import { eq, and, sql } from 'drizzle-orm';
import { readFileSync } from 'fs';
import { parse } from 'yaml';
import { getConfigPath } from '../utils/paths';
import { AtsType } from './ats-types';

// URL patterns for ATS platforms
const ATS_PATTERNS: Array<{
  regex: RegExp;
  atsType: AtsType;
}> = [
  { regex: /boards\.greenhouse\.io\/([a-zA-Z0-9_-]+)/i, atsType: 'greenhouse' },
  { regex: /jobs\.lever\.co\/([a-zA-Z0-9_-]+)/i, atsType: 'lever' },
  { regex: /jobs\.ashbyhq\.com\/([a-zA-Z0-9_-]+)/i, atsType: 'ashby' },
  { regex: /apply\.workable\.com\/([a-zA-Z0-9_-]+)/i, atsType: 'workable' },
  { regex: /jobs\.smartrecruiters\.com\/([a-zA-Z0-9_-]+)/i, atsType: 'smartrecruiters' },
];

/**
 * Scan job URLs from aggregators and discover ATS company slugs.
 */
export async function discoverCompanies(
  jobs: NormalizedJob[]
): Promise<{ newlyDiscovered: number; totalActive: number }> {
  let newlyDiscovered = 0;

  for (const job of jobs) {
    for (const pattern of ATS_PATTERNS) {
      const match = job.url.match(pattern.regex);
      if (!match) continue;

      const slug = match[1].toLowerCase();

      try {
        // Check if already exists
        const existing = await db
          .select()
          .from(discoveredCompanies)
          .where(
            and(
              eq(discoveredCompanies.slug, slug),
              eq(discoveredCompanies.atsType, pattern.atsType)
            )
          )
          .limit(1);

        if (existing.length === 0) {
          await db.insert(discoveredCompanies).values({
            slug,
            name: job.company,
            atsType: pattern.atsType,
            discoveredFrom: job.url,
            isActive: 1,
            failCount: 0,
          });
          newlyDiscovered++;
          logger.info(
            `Discovered new company: ${job.company} (${slug}) on ${pattern.atsType}`
          );
        } else if (existing[0].isActive === 0) {
          // Re-discovered a previously inactive company — reactivate
          await db
            .update(discoveredCompanies)
            .set({ isActive: 1, failCount: 0 })
            .where(eq(discoveredCompanies.id, existing[0].id));
          logger.info(`Reactivated company: ${slug} on ${pattern.atsType}`);
        }
      } catch (error) {
        // Ignore unique constraint violations (race condition safe)
        logger.debug(`Company ${slug} on ${pattern.atsType} already exists`);
      }
    }
  }

  // Count total active
  const activeResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(discoveredCompanies)
    .where(eq(discoveredCompanies.isActive, 1));

  const totalActive = activeResult[0]?.count || 0;

  return { newlyDiscovered, totalActive };
}

/**
 * Load seed companies that have not been registered yet. This is intentionally
 * additive: a database can already contain discovered companies while still
 * missing a newly added seed (such as a Workday board).
 */
export async function loadSeedCompanies(): Promise<number> {
  const existingCompanies = await db
    .select({ slug: discoveredCompanies.slug, atsType: discoveredCompanies.atsType })
    .from(discoveredCompanies);
  const existingKeys = new Set(
    existingCompanies.map((company) => `${company.atsType}:${company.slug.toLowerCase()}`),
  );

  let loaded = 0;
  for (const company of seedCompanies) {
    const key = `${company.atsType}:${company.slug.toLowerCase()}`;
    if (existingKeys.has(key)) continue;

    try {
      await db.insert(discoveredCompanies).values({
        slug: company.slug,
        name: company.name,
        atsType: company.atsType,
        discoveredFrom: 'seed',
        isActive: 1,
        failCount: 0,
      });
      loaded++;
      existingKeys.add(key);
    } catch {
      // Skip duplicates (e.g. same slug+atsType in seed list)
    }
  }

  logger.info(loaded > 0 ? `Loaded ${loaded} missing seed companies.` : 'All seed companies already registered.');
  return loaded;
}

/**
 * Get all active companies for a given ATS type.
 */
export async function getActiveCompanies(
  atsType: AtsType
): Promise<Array<{ id: number; slug: string; name: string | null }>> {
  return db
    .select({
      id: discoveredCompanies.id,
      slug: discoveredCompanies.slug,
      name: discoveredCompanies.name,
    })
    .from(discoveredCompanies)
    .where(
      and(
        eq(discoveredCompanies.atsType, atsType),
        eq(discoveredCompanies.isActive, 1)
      )
    );
}

/**
 * Record a successful check for a company.
 */
export async function markCompanySuccess(companyId: number): Promise<void> {
  await db
    .update(discoveredCompanies)
    .set({ failCount: 0, lastCheckedAt: new Date() })
    .where(eq(discoveredCompanies.id, companyId));
}

/**
 * Record a failed check. Deactivate after max_failures consecutive failures.
 * Reads max_failures from config.yaml staleness.max_failures (default: 3).
 */
export async function markCompanyFailure(
  companyId: number,
  maxFailures?: number
): Promise<void> {
  if (maxFailures === undefined) {
    maxFailures = readStalenessMaxFailures();
  }

  const company = await db
    .select()
    .from(discoveredCompanies)
    .where(eq(discoveredCompanies.id, companyId))
    .limit(1);

  if (!company[0]) return;

  const newFailCount = (company[0].failCount || 0) + 1;
  const isActive = newFailCount >= maxFailures ? 0 : 1;

  await db
    .update(discoveredCompanies)
    .set({
      failCount: newFailCount,
      isActive,
      lastCheckedAt: new Date(),
    })
    .where(eq(discoveredCompanies.id, companyId));

  if (!isActive) {
    logger.warn(
      `Deactivated company: ${company[0].slug} on ${company[0].atsType} (${newFailCount} consecutive failures)`
    );
  }
}

function readStalenessMaxFailures(): number {
  try {
    const configPath = getConfigPath();
    const configFile = readFileSync(configPath, 'utf-8');
    const parsed = parse(configFile) as { staleness?: { max_failures?: number } };
    return parsed.staleness?.max_failures ?? 3;
  } catch {
    return 3;
  }
}
