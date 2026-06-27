import { Command } from 'commander';
import * as dotenv from 'dotenv';
import { setLogLevel } from './utils/logger';
import { runFetchPipeline } from './fetchers';
import { runScoringEngine } from './scoring';
import { generateDailyReport } from './report';
import { runListCommand, runExportCommand, runReviewCommand } from './extras';
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
  .option('-s, --source <source>', 'Fetch from a single source (remotive, remoteok, greenhouse, lever, ashby)')
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
  .description('Score fetched jobs using local rules and Gemini AI')
  .action(async () => {
    await runScoringEngine();
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

program.parse(process.argv);
