import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { eq, desc, sql } from 'drizzle-orm';
import { stringify } from 'csv-stringify/sync';
import { db } from '../db';
import { jobs, jobScores } from '../db/schema';
import { logger } from '../utils/logger';
import { getReportsDir } from '../utils/paths';

// Thresholds for categorizing jobs
const TOP_MATCH_THRESHOLD = 70;
const REJECTED_THRESHOLD = 30; // Anything <= 30 or totalScore === 0

interface ReportJob {
  id: number;
  title: string;
  company: string;
  location: string | null;
  remoteRegion: string | null;
  salary: string | null;
  url: string;
  description?: string | null;
  totalScore: number | null;
  roleScore: number | null;
  remoteScore: number | null;
  seniorityScore: number | null;
  domainScore: number | null;
  aiProductScore: number | null;
  freshnessScore: number | null;
  matchReasons: string[] | null;
  rejectionReasons: string[] | null;
  fetchedAt: Date;
}

export function categorizeJobs(scoredJobs: ReportJob[]) {
  const topMatches: ReportJob[] = [];
  const manualReview: ReportJob[] = [];
  const rejected: ReportJob[] = [];

  for (const job of scoredJobs) {
    const score = job.totalScore || 0;
    if (score === 0 || score <= REJECTED_THRESHOLD || (job.rejectionReasons && job.rejectionReasons.length > 0 && score < TOP_MATCH_THRESHOLD)) {
      rejected.push(job);
    } else if (score >= TOP_MATCH_THRESHOLD) {
      topMatches.push(job);
    } else {
      manualReview.push(job);
    }
  }

  // Sort each category by descending score
  const sortByScore = (a: ReportJob, b: ReportJob) => (b.totalScore || 0) - (a.totalScore || 0);
  topMatches.sort(sortByScore);
  manualReview.sort(sortByScore);
  rejected.sort(sortByScore);

  return { topMatches, manualReview, rejected };
}

function generateMarkdown(
  dateString: string,
  topMatches: ReportJob[],
  manualReview: ReportJob[],
  rejected: ReportJob[]
): string {
  let md = `# Remote Job Shortlist — Johannes Purba (${dateString})\n\n`;

  md += `## 🌟 Top Matches (${topMatches.length})\n\n`;
  if (topMatches.length === 0) md += `*No top matches found today.*\n\n`;
  
  topMatches.forEach((job, index) => {
    md += `### ${index + 1}. [${job.title} @ ${job.company}](${job.url})\n`;
    md += `- **Score**: ${job.totalScore}/100 (Role: ${job.roleScore}, Remote: ${job.remoteScore}, Seniority: ${job.seniorityScore}, Domain: ${job.domainScore}, AI/Tech: ${job.aiProductScore}, Fresh: ${job.freshnessScore})\n`;
    md += `- **Remote Fit / Location**: ${job.remoteRegion || job.location || 'Not specified'}\n`;
    md += `- **Salary**: ${job.salary || 'Not specified'}\n`;
    
    if (job.matchReasons && job.matchReasons.length > 0) {
      md += `- **Why it matches**: \n  - ${job.matchReasons.join('\n  - ')}\n`;
    }
    
    if (job.rejectionReasons && job.rejectionReasons.length > 0) {
      md += `- **Risks / red flags**: \n  - ${job.rejectionReasons.join('\n  - ')}\n`;
    }
    md += '\n';
  });

  md += `## 🤔 Manual Review (${manualReview.length})\n\n`;
  if (manualReview.length === 0) md += `*No ambiguous jobs to review.*\n\n`;
  
  manualReview.forEach((job) => {
    md += `### [${job.title} @ ${job.company}](${job.url})\n`;
    md += `- **Score**: ${job.totalScore}/100\n`;
    if (job.rejectionReasons && job.rejectionReasons.length > 0) {
      md += `- **Concerns**: ${job.rejectionReasons.join(' | ')}\n`;
    }
    md += '\n';
  });

  md += `## ❌ Rejected Jobs (${rejected.length})\n\n`;
  if (rejected.length === 0) md += `*No rejected jobs today.*\n\n`;
  
  rejected.forEach((job) => {
    md += `- **${job.company}** - [${job.title}](${job.url}) (Score: ${job.totalScore || 0})\n`;
    if (job.rejectionReasons && job.rejectionReasons.length > 0) {
      md += `  - *Reason*: ${job.rejectionReasons.join(' | ')}\n`;
    }
  });

  return md;
}

function generateCSV(scoredJobs: ReportJob[]): string {
  const records = scoredJobs.map((job) => ({
    Score: job.totalScore || 0,
    Title: job.title,
    Company: job.company,
    Location: job.location || '',
    Salary: job.salary || '',
    URL: job.url,
    'Match Reasons': (job.matchReasons || []).join('; '),
    'Rejection Reasons': (job.rejectionReasons || []).join('; '),
    FetchedAt: job.fetchedAt.toISOString(),
  }));

  // Sort globally by score for CSV
  records.sort((a, b) => b.Score - a.Score);

  return stringify(records, { header: true });
}

function generateViewerDataset(dateString: string, scoredJobs: ReportJob[]) {
  return {
    generatedAt: new Date().toISOString(),
    reportDate: dateString,
    source: `${dateString}-remote-jobs`,
    jobs: scoredJobs.map((job) => ({
      id: job.id,
      title: job.title,
      company: job.company,
      location: job.location,
      remoteRegion: job.remoteRegion,
      salary: job.salary,
      url: job.url,
      description: job.description || '',
      totalScore: job.totalScore || 0,
      roleScore: job.roleScore || 0,
      remoteScore: job.remoteScore || 0,
      seniorityScore: job.seniorityScore || 0,
      domainScore: job.domainScore || 0,
      aiProductScore: job.aiProductScore || 0,
      freshnessScore: job.freshnessScore || 0,
      matchReasons: job.matchReasons || [],
      rejectionReasons: job.rejectionReasons || [],
      fetchedAt: job.fetchedAt.toISOString(),
    })),
  };
}

function generateViewerScript(dateString: string, scoredJobs: ReportJob[]): string {
  const payload = JSON.stringify(generateViewerDataset(dateString, scoredJobs));
  return `window.REMOTE_JOB_RADAR_DATA = ${payload};\n`;
}

export interface ReportOptions {
  since?: string;
  all?: boolean;
}

export async function generateDailyReport(options: ReportOptions = {}) {
  const reportsDir = getReportsDir();
  mkdirSync(reportsDir, { recursive: true });

  const today = new Date();
  const dateString = today.toISOString().split('T')[0];

  const scopeLabel = options.all
    ? 'all time'
    : options.since
      ? `since ${options.since}`
      : 'the last 24 hours';
  logger.info(`Fetching scored jobs for ${dateString} (${scopeLabel})...`);

  let whereClause;
  if (options.all) {
    whereClause = undefined;
  } else if (options.since) {
    whereClause = sql`date(${jobScores.createdAt}, 'unixepoch') >= date(${options.since})`;
  } else {
    whereClause = sql`date(${jobScores.createdAt}, 'unixepoch') >= date('now', '-1 day')`;
  }

  let query = db
    .select({
      id: jobs.id,
      title: jobs.title,
      company: jobs.company,
      location: jobs.location,
      remoteRegion: jobs.remoteRegion,
      salary: jobs.salary,
      url: jobs.url,
      description: jobs.description,
      totalScore: jobScores.totalScore,
      roleScore: jobScores.roleScore,
      remoteScore: jobScores.remoteScore,
      seniorityScore: jobScores.seniorityScore,
      domainScore: jobScores.domainScore,
      aiProductScore: jobScores.aiProductScore,
      freshnessScore: jobScores.freshnessScore,
      matchReasons: jobScores.matchReasons,
      rejectionReasons: jobScores.rejectionReasons,
      fetchedAt: jobs.fetchedAt,
    })
    .from(jobs)
    .innerJoin(jobScores, eq(jobs.id, jobScores.jobId))
    .orderBy(desc(jobScores.totalScore));

  const recentJobs = whereClause ? await query.where(whereClause) : await query;

  if (recentJobs.length === 0) {
    logger.warn(`No jobs scored ${scopeLabel}. Report will be empty.`);
  }

  const { topMatches, manualReview, rejected } = categorizeJobs(recentJobs as ReportJob[]);

  const mdContent = generateMarkdown(dateString, topMatches, manualReview, rejected);
  const csvContent = generateCSV(recentJobs as ReportJob[]);
  const viewerJsonContent = JSON.stringify(
    generateViewerDataset(dateString, recentJobs as ReportJob[]),
    null,
    2
  );
  const viewerScriptContent = generateViewerScript(dateString, recentJobs as ReportJob[]);

  const mdPath = join(reportsDir, `${dateString}-remote-jobs.md`);
  const csvPath = join(reportsDir, `${dateString}-remote-jobs.csv`);
  const viewerJsonPath = join(reportsDir, 'latest-jobs.json');
  const viewerScriptPath = join(reportsDir, 'latest-jobs.js');

  writeFileSync(mdPath, mdContent, 'utf-8');
  writeFileSync(csvPath, csvContent, 'utf-8');
  writeFileSync(viewerJsonPath, viewerJsonContent, 'utf-8');
  writeFileSync(viewerScriptPath, viewerScriptContent, 'utf-8');

  logger.info('\n' + '═'.repeat(50));
  logger.info(`📊 Daily Report Generated for ${dateString}`);
  logger.info(`- Top Matches: ${topMatches.length}`);
  logger.info(`- Manual Review: ${manualReview.length}`);
  logger.info(`- Rejected: ${rejected.length}`);
  logger.info(`Files saved to:`);
  logger.info(`- ${mdPath}`);
  logger.info(`- ${csvPath}`);
  logger.info(`- ${viewerJsonPath}`);
  logger.info(`- ${viewerScriptPath}`);
  logger.info('═'.repeat(50) + '\n');
}
