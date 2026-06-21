import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { eq } from 'drizzle-orm';
import { stringify } from 'csv-stringify/sync';
import { db } from '../db';
import { jobs, jobScores, discoveredCompanies } from '../db/schema';
import { logger } from '../utils/logger';

export async function runListCommand() {
  const activeCompanies = await db
    .select()
    .from(discoveredCompanies)
    .where(eq(discoveredCompanies.isActive, 1));

  logger.info('\n' + '═'.repeat(50));
  logger.info(`📋 Currently Tracking ${activeCompanies.length} Active ATS Companies`);
  logger.info('═'.repeat(50));
  
  if (activeCompanies.length > 0) {
    const grouped = activeCompanies.reduce((acc, curr) => {
      if (!acc[curr.atsType]) acc[curr.atsType] = [];
      acc[curr.atsType].push(curr.name || curr.slug);
      return acc;
    }, {} as Record<string, string[]>);

    for (const [ats, names] of Object.entries(grouped)) {
      logger.info(`\n🏢 ${ats.toUpperCase()} (${names.length})`);
      logger.info(names.sort().join(', '));
    }
  }

  logger.info('\n📡 Aggregators');
  logger.info('Remotive API, RemoteOK API\n');
}

export async function runExportCommand() {
  logger.info('Fetching all data from database...');
  const allData = await db
    .select({
      id: jobs.id,
      source: jobs.source,
      sourceJobId: jobs.sourceJobId,
      title: jobs.title,
      company: jobs.company,
      location: jobs.location,
      url: jobs.url,
      salary: jobs.salary,
      postedAt: jobs.postedAt,
      fetchedAt: jobs.fetchedAt,
      totalScore: jobScores.totalScore,
      matchReasons: jobScores.matchReasons,
      rejectionReasons: jobScores.rejectionReasons,
    })
    .from(jobs)
    .leftJoin(jobScores, eq(jobs.id, jobScores.jobId));

  if (allData.length === 0) {
    logger.warn('No jobs found in the database to export.');
    return;
  }

  const records = allData.map(row => ({
    ID: row.id,
    Source: row.source,
    Company: row.company,
    Title: row.title,
    Location: row.location || '',
    Salary: row.salary || '',
    URL: row.url,
    'Total Score': row.totalScore !== null ? row.totalScore : 'Unscored',
    'Match Reasons': Array.isArray(row.matchReasons) ? row.matchReasons.join('; ') : '',
    'Rejection Reasons': Array.isArray(row.rejectionReasons) ? row.rejectionReasons.join('; ') : '',
    'Posted At': row.postedAt || '',
    'Fetched At': row.fetchedAt.toISOString()
  }));

  const reportsDir = join(process.cwd(), 'reports');
  mkdirSync(reportsDir, { recursive: true });
  
  const exportPath = join(reportsDir, 'all_jobs_export.csv');
  const csvContent = stringify(records, { header: true });
  
  writeFileSync(exportPath, csvContent, 'utf-8');
  
  logger.info('\n' + '═'.repeat(50));
  logger.info(`✅ Export Successful`);
  logger.info(`Exported ${allData.length} records to:`);
  logger.info(exportPath);
  logger.info('═'.repeat(50) + '\n');
}
