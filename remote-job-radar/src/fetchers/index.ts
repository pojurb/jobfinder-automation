import { readFileSync } from 'fs';
import { join } from 'path';
import { parse } from 'yaml';
import { eq, and } from 'drizzle-orm';
import { db } from '../db';
import { jobs } from '../db/schema';
import { NormalizedJob, FetchStats, JobFetcher } from './types';
import { RemotiveFetcher } from './remotive';
import { RemoteOKFetcher } from './remoteok';
import { GreenhouseFetcher } from './greenhouse';
import { LeverFetcher } from './lever';
import { AshbyFetcher } from './ashby';
import { discoverCompanies, loadSeedCompanies } from '../discovery/ats-discovery';
import { logger } from '../utils/logger';
import { normalizeText, normalizeUrl, normalizeDate } from '../utils/normalize';

interface PipelineOptions {
  source?: string;
  dryRun?: boolean;
}

interface Config {
  search: {
    keywords: string[];
    locations: string[];
    excluded_keywords: string[];
  };
  staleness?: {
    max_failures?: number;
  };
}

function loadConfig(): Config {
  const configPath = join(process.cwd(), 'config.yaml');
  const configFile = readFileSync(configPath, 'utf-8');
  return parse(configFile) as Config;
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
 * A job passes if its title matches any keyword AND doesn't match any excluded keyword.
 */
function filterJobs(jobs: NormalizedJob[], config: Config): NormalizedJob[] {
  const keywords = config.search.keywords.map((k) => k.toLowerCase());
  const excluded = config.search.excluded_keywords.map((k) => k.toLowerCase());

  return jobs.filter((job) => {
    const title = job.title.toLowerCase();

    if (excluded.some((ex) => title.includes(ex))) return false;
    return keywords.some((kw) => title.includes(kw));
  });
}

/**
 * Insert or update jobs in the database.
 * Detects duplicates by (source, sourceJobId).
 * Updates fetchedAt and rawJson for existing duplicates.
 */
async function insertOrUpdateJobs(
  normalizedJobs: NormalizedJob[],
  dryRun: boolean
): Promise<{ inserted: number; updated: number; skipped: number }> {
  let inserted = 0;
  let updated = 0;
  let skipped = 0;

  if (dryRun || normalizedJobs.length === 0) {
    return { inserted: 0, updated: 0, skipped: normalizedJobs.length };
  }

  for (const job of normalizedJobs) {
    try {
      // Check if job already exists
      const existing = await db
        .select({ id: jobs.id })
        .from(jobs)
        .where(
          and(
            eq(jobs.source, job.source),
            eq(jobs.sourceJobId, job.sourceJobId)
          )
        )
        .limit(1);

      if (existing.length > 0) {
        // Update fetchedAt and rawJson
        await db
          .update(jobs)
          .set({
            fetchedAt: new Date(),
            rawJson: job.rawJson as any,
          })
          .where(eq(jobs.id, existing[0].id));
        updated++;
      } else {
        // Insert new job
        await db.insert(jobs).values({
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
        });
        inserted++;
      }
    } catch (err) {
      logger.error(`Failed to insert/update job ${job.sourceJobId}: ${(err as Error).message}`);
      skipped++;
    }
  }

  return { inserted, updated, skipped };
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

/**
 * Run a single fetcher and return stats.
 */
async function runFetcher(
  fetcher: JobFetcher,
  config: Config,
  dryRun: boolean
): Promise<{ stats: FetchStats; jobs: NormalizedJob[] }> {
  try {
    const fetchedJobs = await fetcher.fetch();
    const normalized = fetchedJobs.map(normalizeJobData);
    const matchedJobs = filterJobs(normalized, config);
    
    const dbResult = await insertOrUpdateJobs(matchedJobs, dryRun);
    const filteredOut = fetchedJobs.length - matchedJobs.length;

    const stats: FetchStats = {
      source: fetcher.name,
      fetched: fetchedJobs.length,
      inserted: dbResult.inserted,
      updated: dbResult.updated,
      skipped: dbResult.skipped + filteredOut,
      errors: 0,
    };

    return { stats, jobs: normalized }; // Return all for discovery
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
      jobs: [],
    };
  }
}

/**
 * Main fetch pipeline orchestrator.
 * Phase 1: Aggregators → Phase 2: Discovery → Phase 3: ATS Fetchers
 */
export async function runFetchPipeline(options: PipelineOptions = {}): Promise<void> {
  const config = loadConfig();
  const allStats: FetchStats[] = [];
  const { source, dryRun = false } = options;

  if (dryRun) {
    logger.info('🔍 DRY RUN MODE — no data will be written to the database.');
  }

  // ── Phase 1: Aggregators ──────────────────────────────────────────────────

  const aggregators: JobFetcher[] = [new RemotiveFetcher(), new RemoteOKFetcher()];
  const aggregatorJobs: NormalizedJob[] = [];

  if (!source || source === 'remotive' || source === 'remoteok') {
    logger.info('\n📡 Phase 1: Fetching from aggregators...\n');

    for (const fetcher of aggregators) {
      if (source && fetcher.name !== source) continue;
      const result = await runFetcher(fetcher, config, dryRun);
      allStats.push(result.stats);
      aggregatorJobs.push(...result.jobs);
    }
  }

  // ── Phase 2: ATS Discovery ────────────────────────────────────────────────

  if (!source || !['remotive', 'remoteok'].includes(source)) {
    logger.info('\n🔎 Phase 2: Running ATS discovery...\n');

    // Load seed companies on first run
    if (!dryRun) {
      await loadSeedCompanies();
    }

    // Discover from aggregator results
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
  ];

  if (!source || ['greenhouse', 'lever', 'ashby'].includes(source)) {
    logger.info('\n🏢 Phase 3: Fetching from ATS boards...\n');

    for (const fetcher of atsFetchers) {
      if (source && fetcher.name !== source) continue;
      const result = await runFetcher(fetcher, config, dryRun);
      allStats.push(result.stats);
    }
  }

  // ── Summary ───────────────────────────────────────────────────────────────

  printSummary(allStats);

  if (dryRun) {
    logger.info('🔍 Dry run complete. No data was written.');
  }
}
