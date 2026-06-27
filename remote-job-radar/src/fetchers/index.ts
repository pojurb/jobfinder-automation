import { readFileSync } from 'fs';
import { parse } from 'yaml';
import { sql } from 'drizzle-orm';
import { db } from '../db';
import { jobs } from '../db/schema';
import { NormalizedJob, FetchStats, JobFetcher } from './types';
import { RemotiveFetcher } from './remotive';
import { RemoteOKFetcher } from './remoteok';
import { WeWorkRemotelyFetcher } from './weworkremotely';
import { HimalayasFetcher } from './himalayas';
import { WorkAtAStartupFetcher } from './workatastartup';
import { WellfoundFetcher } from './wellfound';
import { GreenhouseFetcher } from './greenhouse';
import { LeverFetcher } from './lever';
import { AshbyFetcher } from './ashby';
import { WorkdayFetcher } from './workday';
import { discoverCompanies, loadSeedCompanies } from '../discovery/ats-discovery';
import { logger } from '../utils/logger';
import { normalizeText, normalizeUrl, normalizeDate } from '../utils/normalize';
import { getConfigPath } from '../utils/paths';

interface PipelineOptions {
  source?: string;
  dryRun?: boolean;
}

export interface PipelineConfig {
  search: {
    keywords: string[];
    locations: string[];
    excluded_keywords: string[];
  };
  staleness?: {
    max_failures?: number;
  };
  hard_rejects?: {
    locations_only: string[];
  };
}

export function loadPipelineConfig(): PipelineConfig {
  const configPath = getConfigPath();
  const configFile = readFileSync(configPath, 'utf-8');
  const parsed = parse(configFile) as PipelineConfig;

  // Merge hard_rejects.locations_only from config/profile.yaml for location filtering
  try {
    const { loadProfileConfig } = require('../scoring/pre-filter');
    const profile = loadProfileConfig();
    parsed.hard_rejects = {
      locations_only: profile.hard_rejects.locations_only,
    };
  } catch {
    // Profile config not available — skip location filtering
  }

  return parsed;
}

/**
 * Normalizes all fields of a job according to standard rules.
 */
function normalizeJobData(job: NormalizedJob): NormalizedJob {
  const title = normalizeText(job.title) || job.title;
  const company = normalizeText(job.company) || job.company;
  const url = normalizeUrl(job.url) || job.url;

  return {
    ...job,
    title,
    company,
    url,
    location: normalizeText(job.location),
    remoteRegion: normalizeText(job.remoteRegion),
    description: normalizeText(job.description),
    salary: normalizeText(job.salary),
    postedAt: normalizeDate(job.postedAt) || job.postedAt,
  };
}

/**
 * Pre-filter jobs based on keywords from config.yaml.
 * A job passes if:
 *   - its title matches any keyword AND doesn't match any excluded keyword
 *   - its location doesn't match any hard-reject location patterns
 */
function filterJobs(jobs: NormalizedJob[], config: PipelineConfig): NormalizedJob[] {
  const keywords = config.search.keywords.map((k) => k.toLowerCase());
  const excluded = config.search.excluded_keywords.map((k) => k.toLowerCase());
  const rejectedLocations = config.hard_rejects?.locations_only?.map((l) => l.toLowerCase()) ?? [];

  return jobs.filter((job) => {
    const title = job.title.toLowerCase();
    const location = (job.location || '').toLowerCase();
    const remoteRegion = (job.remoteRegion || '').toLowerCase();

    if (excluded.some((ex) => title.includes(ex))) return false;
    if (!keywords.some((kw) => title.includes(kw))) return false;

    if (rejectedLocations.length > 0) {
      for (const loc of rejectedLocations) {
        if (location.includes(loc) || remoteRegion.includes(loc)) return false;
      }
    }

    return true;
  });
}

/**
 * Insert or update jobs in the database using a bulk upsert.
 * Detects duplicates by (source, sourceJobId) via the unique index.
 * Updates fetchedAt and rawJson for existing duplicates.
 */
async function insertOrUpdateJobs(
  normalizedJobs: NormalizedJob[],
  dryRun: boolean
): Promise<{ inserted: number; updated: number; skipped: number }> {
  if (dryRun || normalizedJobs.length === 0) {
    return { inserted: 0, updated: 0, skipped: normalizedJobs.length };
  }

  const values = normalizedJobs.map((job) => ({
    source: job.source,
    sourceJobId: job.sourceJobId,
    title: job.title,
    company: job.company,
    location: job.location,
    remoteRegion: job.remoteRegion,
    url: job.url,
    description: job.description,
    salary: job.salary,
    postedAt: job.postedAt,
    contentHash: job.contentHash,
    rawJson: job.rawJson as any,
  }));

  try {
    const result = await db
      .insert(jobs)
      .values(values)
      .onConflictDoUpdate({
        target: [jobs.source, jobs.sourceJobId],
        set: {
          fetchedAt: new Date(),
          rawJson: sql`excluded.raw_json`,
        },
      });

    const changes = (result as any).changes ?? values.length;
    return { inserted: changes, updated: 0, skipped: 0 };
  } catch (err) {
    logger.error(`Bulk upsert failed: ${(err as Error).message}`);
    return { inserted: 0, updated: 0, skipped: values.length };
  }
}

/**
 * Print a summary table of fetch results.
 */
function printSummary(stats: FetchStats[]): void {
  console.log('\n' + '═'.repeat(74));
  console.log(
    '│ Source        │ Fetched │ Inserted │ Updated │ Skipped │ Errors │'
  );
  console.log('├' + '─'.repeat(72) + '┤');

  let totals = { fetched: 0, inserted: 0, updated: 0, skipped: 0, errors: 0 };

  for (const s of stats) {
    console.log(
      `│ ${s.source.padEnd(13)}│ ${String(s.fetched).padStart(7)} │ ${String(
        s.inserted
      ).padStart(8)} │ ${String(s.updated).padStart(7)} │ ${String(s.skipped).padStart(7)} │ ${String(
        s.errors
      ).padStart(6)} │`
    );
    totals.fetched += s.fetched;
    totals.inserted += s.inserted;
    totals.updated += s.updated;
    totals.skipped += s.skipped;
    totals.errors += s.errors;
  }

  console.log('├' + '─'.repeat(72) + '┤');
  console.log(
    `│ ${'Total'.padEnd(13)}│ ${String(totals.fetched).padStart(7)} │ ${String(
      totals.inserted
    ).padStart(8)} │ ${String(totals.updated).padStart(7)} │ ${String(
      totals.skipped
    ).padStart(7)} │ ${String(totals.errors).padStart(6)} │`
  );
  console.log('═'.repeat(74) + '\n');
}

const SOURCE_PRIORITY: Record<string, number> = {
  workday: 10,
  greenhouse: 9,
  lever: 8,
  ashby: 7,
  weworkremotely: 6,
  himalayas: 5,
  workatastartup: 4,
  wellfound: 3,
  remotive: 2,
  remoteok: 1,
};

/**
 * Deduplicate jobs across sources by contentHash.
 * When the same job appears from multiple sources, keep the one
 * from the highest-priority source (ATS > aggregator).
 */
export function deduplicateCrossSource(jobs: NormalizedJob[]): NormalizedJob[] {
  const byHash = new Map<string, NormalizedJob>();

  for (const job of jobs) {
    const existing = byHash.get(job.contentHash);
    if (!existing) {
      byHash.set(job.contentHash, job);
      continue;
    }

    const existingPriority = SOURCE_PRIORITY[existing.source] ?? 0;
    const newPriority = SOURCE_PRIORITY[job.source] ?? 0;
    if (newPriority > existingPriority) {
      byHash.set(job.contentHash, job);
    }
  }

  return Array.from(byHash.values());
}

/**
 * Run a single fetcher and return stats + filtered jobs.
 * Does NOT insert into DB — caller handles insertion after cross-source dedup.
 */
async function runFetcher(
  fetcher: JobFetcher,
  config: PipelineConfig
): Promise<{ stats: FetchStats; filteredJobs: NormalizedJob[]; allJobs: NormalizedJob[] }> {
  try {
    const fetchedJobs = await fetcher.fetch();
    const normalized = fetchedJobs.map(normalizeJobData);
    const matchedJobs = filterJobs(normalized, config);
    const filteredOut = fetchedJobs.length - matchedJobs.length;

    const stats: FetchStats = {
      source: fetcher.name,
      fetched: fetchedJobs.length,
      inserted: 0,
      updated: 0,
      skipped: filteredOut,
      errors: 0,
    };

    return { stats, filteredJobs: matchedJobs, allJobs: normalized };
  } catch (error) {
    logger.error(`[${fetcher.name}] Pipeline error: ${(error as Error).message}`);
    return {
      stats: {
        source: fetcher.name,
        fetched: 0,
        inserted: 0,
        updated: 0,
        skipped: 0,
        errors: 1,
      },
      filteredJobs: [],
      allJobs: [],
    };
  }
}

/**
 * Main fetch pipeline orchestrator.
 * Phase 1: Aggregators → Phase 2: Discovery → Phase 3: ATS Fetchers
 */
export async function runFetchPipeline(options: PipelineOptions = {}): Promise<void> {
  const config = loadPipelineConfig();
  const allStats: FetchStats[] = [];
  const { source, dryRun = false } = options;

  if (dryRun) {
    logger.info('🔍 DRY RUN MODE — no data will be written to the database.');
  }

  // ── Phase 1: Aggregators ──────────────────────────────────────────────────

  const aggregators: JobFetcher[] = [new RemotiveFetcher(), new RemoteOKFetcher(), new WeWorkRemotelyFetcher(), new HimalayasFetcher(), new WorkAtAStartupFetcher(), new WellfoundFetcher()];
  const aggregatorJobs: NormalizedJob[] = [];
  const allFilteredJobs: NormalizedJob[] = [];

  if (!source || ['remotive', 'remoteok', 'weworkremotely', 'himalayas', 'workatastartup', 'wellfound'].includes(source)) {
    logger.info('\n📡 Phase 1: Fetching from aggregators...\n');

    for (const fetcher of aggregators) {
      if (source && fetcher.name !== source) continue;
      const result = await runFetcher(fetcher, config);
      allStats.push(result.stats);
      aggregatorJobs.push(...result.allJobs);
      allFilteredJobs.push(...result.filteredJobs);
    }
  }

  // ── Phase 2: ATS Discovery ────────────────────────────────────────────────

  if (!source || !['remotive', 'remoteok', 'weworkremotely', 'himalayas', 'workatastartup', 'wellfound'].includes(source)) {
    logger.info('\n🔎 Phase 2: Running ATS discovery...\n');

    if (!dryRun) {
      await loadSeedCompanies();
    }

    if (aggregatorJobs.length > 0 && !dryRun) {
      const discovery = await discoverCompanies(aggregatorJobs);
      logger.info(
        `Discovered ${discovery.newlyDiscovered} new companies. Total active: ${discovery.totalActive}.`
      );
    }
  }

  // ── Phase 3: ATS Fetchers ─────────────────────────────────────────────────

  const atsFetchers: JobFetcher[] = [
    new GreenhouseFetcher(),
    new LeverFetcher(),
    new AshbyFetcher(),
    new WorkdayFetcher(),
  ];

  if (!source || ['greenhouse', 'lever', 'ashby', 'workday'].includes(source)) {
    logger.info('\n🏢 Phase 3: Fetching from ATS boards...\n');

    for (const fetcher of atsFetchers) {
      if (source && fetcher.name !== source) continue;
      const result = await runFetcher(fetcher, config);
      allStats.push(result.stats);
      allFilteredJobs.push(...result.filteredJobs);
    }
  }

  // ── Phase 4: Cross-source dedup + bulk insert ─────────────────────────────

  const beforeDedup = allFilteredJobs.length;
  const dedupedJobs = deduplicateCrossSource(allFilteredJobs);
  const removedByDedup = beforeDedup - dedupedJobs.length;

  if (removedByDedup > 0) {
    logger.info(`\n🔄 Cross-source dedup: removed ${removedByDedup} duplicate job(s) out of ${beforeDedup}.`);
  }

  if (!dryRun && dedupedJobs.length > 0) {
    const dbResult = await insertOrUpdateJobs(dedupedJobs, dryRun);
    logger.info(`Bulk insert: ${dbResult.inserted} inserted, ${dbResult.skipped} skipped.`);
    // Update aggregator stats with actual insert numbers
    for (const stat of allStats) {
      stat.inserted = dbResult.inserted;
    }
  }

  // ── Summary ───────────────────────────────────────────────────────────────

  printSummary(allStats);

  if (dryRun) {
    logger.info('🔍 Dry run complete. No data was written.');
  }
}
