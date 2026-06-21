import { db } from '../db';
import { discoveredCompanies } from '../db/schema';
import { seedCompanies } from '../data/seed-companies';
import { NormalizedJob } from '../fetchers/types';
import { logger } from '../utils/logger';
import { eq, and, sql } from 'drizzle-orm';

// URL patterns for ATS platforms
const ATS_PATTERNS: Array<{
  regex: RegExp;
  atsType: 'greenhouse' | 'lever' | 'ashby';
}> = [
  { regex: /boards\.greenhouse\.io\/([a-zA-Z0-9_-]+)/i, atsType: 'greenhouse' },
  { regex: /jobs\.lever\.co\/([a-zA-Z0-9_-]+)/i, atsType: 'lever' },
  { regex: /jobs\.ashbyhq\.com\/([a-zA-Z0-9_-]+)/i, atsType: 'ashby' },
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
 * Load seed companies into the database if the table is empty (first run).
 */
export async function loadSeedCompanies(): Promise<number> {
  const countResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(discoveredCompanies);

  if ((countResult[0]?.count || 0) > 0) {
    logger.debug('Seed companies already loaded, skipping.');
    return 0;
  }

  logger.info(`Loading ${seedCompanies.length} seed companies...`);

  let loaded = 0;
  for (const company of seedCompanies) {
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
    } catch {
      // Skip duplicates (e.g. same slug+atsType in seed list)
    }
  }

  logger.info(`Loaded ${loaded} seed companies.`);
  return loaded;
}

/**
 * Get all active companies for a given ATS type.
 */
export async function getActiveCompanies(
  atsType: 'greenhouse' | 'lever' | 'ashby'
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
 */
export async function markCompanyFailure(
  companyId: number,
  maxFailures: number = 3
): Promise<void> {
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
