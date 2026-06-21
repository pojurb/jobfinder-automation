import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { eq, desc, sql } from 'drizzle-orm';
import { stringify } from 'csv-stringify/sync';
import { db } from '../db';
import { jobs, jobScores } from '../db/schema';
import { logger } from '../utils/logger';

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

export async function generateDailyReport() {
  const reportsDir = join(process.cwd(), 'reports');
  mkdirSync(reportsDir, { recursive: true });

  const today = new Date();
  const dateString = today.toISOString().split('T')[0];

  // Fetch jobs scored within the last 24 hours
  logger.info(`Fetching scored jobs for ${dateString}...`);
  
  const recentJobs = await db
    .select({
      id: jobs.id,
      title: jobs.title,
      company: jobs.company,
      location: jobs.location,
      remoteRegion: jobs.remoteRegion,
      salary: jobs.salary,
      url: jobs.url,
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
    .where(sql`date(${jobScores.createdAt}) >= date('now', '-1 day')`)
    .orderBy(desc(jobScores.totalScore));

  if (recentJobs.length === 0) {
    logger.warn('No jobs scored in the last 24 hours. Report will be empty.');
  }

  const { topMatches, manualReview, rejected } = categorizeJobs(recentJobs as ReportJob[]);

  const mdContent = generateMarkdown(dateString, topMatches, manualReview, rejected);
  const csvContent = generateCSV(recentJobs as ReportJob[]);

  const mdPath = join(reportsDir, `${dateString}-remote-jobs.md`);
  const csvPath = join(reportsDir, `${dateString}-remote-jobs.csv`);

  writeFileSync(mdPath, mdContent, 'utf-8');
  writeFileSync(csvPath, csvContent, 'utf-8');

  logger.info('\n' + '═'.repeat(50));
  logger.info(`📊 Daily Report Generated for ${dateString}`);
  logger.info(`- Top Matches: ${topMatches.length}`);
  logger.info(`- Manual Review: ${manualReview.length}`);
  logger.info(`- Rejected: ${rejected.length}`);
  logger.info(`Files saved to:`);
  logger.info(`- ${mdPath}`);
  logger.info(`- ${csvPath}`);
  logger.info('═'.repeat(50) + '\n');
}
