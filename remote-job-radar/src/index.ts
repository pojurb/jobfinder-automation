import { Command } from 'commander';
import * as dotenv from 'dotenv';
import { setLogLevel } from './utils/logger';
import { runFetchPipeline } from './fetchers';
import { runScoringEngine } from './scoring';
import { generateDailyReport } from './report';
import { runListCommand, runExportCommand } from './extras';
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
  .action(async () => {
    await generateDailyReport();
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

program.parse(process.argv);
