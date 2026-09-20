import { Command } from 'commander';
import * as dotenv from 'dotenv';
import { setLogLevel } from './utils/logger';
import { runFetchPipeline } from './fetchers';
import { runScoringEngine } from './scoring';
import { generateDailyReport } from './report';
import { APPLICATION_STATUSES, isApplicationStatus, runApplyCommand, runFunnelCommand, runListCommand, runExportCommand, runReviewCommand, runLegacyJunkCleanup, runLinkedInImportCommand } from './extras';
import { runLegacyImportCommand } from './extras/import-legacy';
import { logger } from './utils/logger';

dotenv.config();

const program = new Command();

program
  .name('remote-job-radar')
  .description('CLI to help Johannes Purba find high-quality remote jobs as a Senior PM.')
  .version('1.0.0');

program
  .command('fetch')
  .description('Fetch job listings from configured sources')
  .option('-s, --source <source>', 'Fetch from a single source (remotive, remoteok, weworkremotely, himalayas, greenhouse, lever, ashby)')
  .option('-d, --dry-run', 'Fetch and validate but do not write to the database')
  .option('-v, --verbose', 'Enable debug-level logging')
  .action(async (options) => {
    if (options.verbose) {
      setLogLevel('debug');
    }
    await runFetchPipeline({
      source: options.source,
      dryRun: options.dryRun,
    });
  });

program
  .command('score')
  .description('Score unscored jobs using deterministic local matching rules')
  .option('--rescore-fresh', 'Re-score jobs verified in the last 14 days after changing local rules')
  .action(async (options) => {
    await runScoringEngine({ rescoreFreshDays: options.rescoreFresh ? 14 : undefined });
  });

program
  .command('report')
  .description('Generate a daily report of scored jobs (Markdown and CSV)')
  .option('--since <date>', 'Include jobs scored since this date (YYYY-MM-DD)')
  .option('--all', 'Include all scored jobs regardless of date')
  .action(async (options) => {
    await generateDailyReport({
      since: options.since,
      all: options.all,
    });
  });

program
  .command('daily')
  .description('Run the full daily pipeline (fetch -> score -> report)')
  .action(async () => {
    logger.info('\n🚀 STARTING DAILY PIPELINE 🚀\n');
    await runFetchPipeline();
    await runScoringEngine();
    await generateDailyReport();
    logger.info('\n✅ DAILY PIPELINE COMPLETE! ✅\n');
  });

program
  .command('list')
  .description('List all active tracked companies and sources')
  .action(async () => {
    await runListCommand();
  });

program
  .command('export')
  .description('Export all jobs and scores to a CSV file')
  .action(async () => {
    await runExportCommand();
  });

program
  .command('discover')
  .description('Discover career sites for target companies and register ATS boards')
  .option('--industry <industries>', 'Filter by industry (comma-separated, e.g. SaaS,AI)')
  .option('--dry-run', 'List companies without probing career sites')
  .action(async (options) => {
    const { runCompanyDiscovery } = await import('./discovery/company-discovery');
    await runCompanyDiscovery({
      industry: options.industry,
      dryRun: options.dryRun,
    });
  });

program
  .command('review')
  .description('Output LLM-paste-ready job summaries for review')
  .option('-n, --top <number>', 'Number of jobs to show', '10')
  .option('-j, --job <id>', 'Review a single job by database ID')
  .option('-c, --category <category>', 'Job category: top, manual, rejected, or all', 'manual')
  .option('--apply-ready', 'Show only genuinely applyable jobs (score 70+, remote 18+, no rejections)')
  .action(async (options) => {
    await runReviewCommand({
      top: options.top ? parseInt(options.top, 10) : undefined,
      jobId: options.job,
      category: options.category as 'top' | 'manual' | 'rejected' | 'all',
      applyReady: options.applyReady,
    });
  });

program
  .command('apply')
  .description('Record a human application decision; this never submits an application')
  .requiredOption('-j, --job <id>', 'Job database ID')
  .option('-s, --status <status>', 'pending, applied, interviewing, rejected, or ghosted', 'pending')
  .option('-n, --notes <text>', 'Append a note to the application record')
  .action(async (options) => {
    const jobId = Number.parseInt(options.job, 10);
    if (!Number.isInteger(jobId) || jobId <= 0) {
      logger.error('--job must be a positive integer.');
      return;
    }
    if (!isApplicationStatus(options.status)) {
      logger.error(`Invalid --status. Use one of: ${APPLICATION_STATUSES.join(', ')}.`);
      return;
    }
    await runApplyCommand({ jobId, status: options.status, notes: options.notes });
  });

program
  .command('import-linkedin')
  .description('Import manually captured LinkedIn job details into the database; never applies or saves jobs')
  .argument('<file>', 'JSON capture file containing job details')
  .option('--dry-run', 'Validate captures without writing to the database')
  .action(async (file, options) => {
    await runLinkedInImportCommand(file, Boolean(options.dryRun));
  });

program
  .command('funnel')
  .description('Show application status counts, apply-ready backlog, and follow-up due jobs')
  .option('--include-stale', 'Include jobs not verified in the last 14 days')
  .option('--include-uncertain', 'Include bare-remote jobs whose Indonesia eligibility is not explicit')
  .action(async (options) => {
    await runFunnelCommand({
      includeStale: Boolean(options.includeStale),
      includeUncertain: Boolean(options.includeUncertain),
    });
  });

program
  .command('import-legacy')
  .description('Import the legacy Markdown job archive into SQLite and preserve application statuses')
  .option('-d, --directory <path>', 'Directory containing legacy Markdown jobs')
  .option('--dry-run', 'Validate and count records without writing to SQLite')
  .action(async (options) => {
    await runLegacyImportCommand({
      directory: options.directory,
      dryRun: options.dryRun,
    });
  });

program
  .command('legacy-junk')
  .description('Find obvious non-job records imported from the legacy Markdown archive')
  .option('--apply', 'Mark the displayed records as junk; default is a dry run')
  .action(async (options) => {
    await runLegacyJunkCleanup({ apply: Boolean(options.apply) });
  });

program
  .command('resolve-careers')
  .description('Resolve company names in database to official public ATS career boards')
  .option('-l, --limit <number>', 'Maximum number of companies to resolve', '50')
  .option('-d, --dry-run', 'Probe and report without writing to database')
  .option('--recheck', 'Re-evaluate companies already in company_career_sources with the current rules')
  .action(async (options) => {
    const { runCareerResolver } = await import('./discovery/career-resolver');
    await runCareerResolver({
      limit: options.limit ? parseInt(options.limit, 10) : 50,
      dryRun: Boolean(options.dryRun),
      recheck: Boolean(options.recheck),
    });
  });

program
  .command('promote-careers')
  .description('Copy verified (high-confidence) career boards from company_career_sources into discovered_companies')
  .option('-d, --dry-run', 'List what would be promoted without writing')
  .option('--include-manual', 'Also promote manual aliases (e.g. the large shared BJAK board)')
  .option('--include-medium', 'Also promote medium-confidence matches')
  .action(async (options) => {
    const { promoteCareerSources } = await import('./discovery/career-promote');
    await promoteCareerSources({
      dryRun: Boolean(options.dryRun),
      includeManual: Boolean(options.includeManual),
      includeMedium: Boolean(options.includeMedium),
    });
  });

program
  .command('verify-legacy')
  .description('Flag legacy jobs open/stale by comparing them with freshly fetched official board postings')
  .option('-d, --dry-run', 'Report verdicts without writing')
  .action(async (options) => {
    const { verifyLegacyJobs } = await import('./discovery/legacy-verify');
    await verifyLegacyJobs({ dryRun: Boolean(options.dryRun) });
  });

program.parse(process.argv);

