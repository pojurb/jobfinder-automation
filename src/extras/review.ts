import { eq, and, desc, sql } from 'drizzle-orm';
import { db } from '../db';
import { jobs, jobScores } from '../db/schema';
import { logger } from '../utils/logger';

interface ReviewJob {
  id: number;
  title: string;
  company: string;
  location: string | null;
  remoteRegion: string | null;
  salary: string | null;
  url: string;
  description: string | null;
  totalScore: number | null;
  roleScore: number | null;
  remoteScore: number | null;
  seniorityScore: number | null;
  domainScore: number | null;
  aiProductScore: number | null;
  freshnessScore: number | null;
  matchReasons: string[] | null;
  rejectionReasons: string[] | null;
}

export interface ReviewOptions {
  top?: number;
  jobId?: string;
  category?: 'top' | 'manual' | 'rejected' | 'all';
  applyReady?: boolean;
}

function formatScoreBreakdown(job: ReviewJob): string {
  const parts = [
    `Role: ${job.roleScore ?? 0}`,
    `Remote: ${job.remoteScore ?? 0}`,
    `Seniority: ${job.seniorityScore ?? 0}`,
    `Domain: ${job.domainScore ?? 0}`,
    `AI/Tech: ${job.aiProductScore ?? 0}`,
    `Freshness: ${job.freshnessScore ?? 0}`,
  ];
  return parts.join(' | ');
}

function formatList(items: string[] | null, fallback: string): string {
  if (!items || items.length === 0) return fallback;
  return items.map((item) => `  - ${item}`).join('\n');
}

function stripHtml(html: string | null | undefined): string {
  if (!html) return '';
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

export function formatJobBlock(job: ReviewJob, index: number, total: number): string {
  const location = job.remoteRegion || job.location || 'Not specified';
  const salary = job.salary || 'Not specified';
  const reasons = formatList(job.matchReasons, '  - None');
  const rejections = formatList(job.rejectionReasons, '  - None');

  return [
    `### Job ${index}/${total} — ID ${job.id}`,
    `Title: ${job.title}`,
    `Company: ${job.company}`,
    `Location: ${location}`,
    `Salary: ${salary}`,
    `URL: ${job.url}`,
    `Score: ${job.totalScore ?? 0}/100 (${formatScoreBreakdown(job)})`,
    ``,
    `Match reasons:`,
    reasons,
    ``,
    `Risks / rejection reasons:`,
    rejections,
    ``,
    `Description:`,
    '```',
    stripHtml(job.description) || 'No description available.',
    '```',
    ``,
  ].join('\n');
}

export async function runReviewCommand(options: ReviewOptions = {}): Promise<void> {
  const { top = 10, jobId, category = 'manual', applyReady = false } = options;

  let reviewJobs: ReviewJob[];

  if (jobId) {
    const numericId = parseInt(jobId, 10);
    if (isNaN(numericId)) {
      logger.error(`Invalid job ID: ${jobId}`);
      return;
    }

    const result = await db
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
      })
      .from(jobs)
      .innerJoin(jobScores, eq(jobs.id, jobScores.jobId))
      .where(eq(jobs.id, numericId))
      .limit(1);

    if (result.length === 0) {
      logger.warn(`No scored job found with ID ${numericId}.`);
      return;
    }

    reviewJobs = result as ReviewJob[];
  } else {
    const result = await db
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
      })
      .from(jobs)
      .innerJoin(jobScores, eq(jobs.id, jobScores.jobId))
      .orderBy(desc(jobScores.totalScore));

    let filtered = result as ReviewJob[];

    if (applyReady) {
      filtered = filtered.filter(j =>
        (j.totalScore ?? 0) >= 70 &&
        (j.remoteScore ?? 0) >= 18 &&
        (!j.rejectionReasons || j.rejectionReasons.length === 0)
      );
    } else {
      switch (category) {
        case 'top':
          filtered = filtered.filter(j => (j.totalScore ?? 0) >= 70);
          break;
        case 'rejected':
          filtered = filtered.filter(j => (j.totalScore ?? 0) <= 30);
          break;
        case 'all':
          break;
        case 'manual':
        default:
          filtered = filtered.filter(j =>
            (j.totalScore ?? 0) >= 31 && (j.totalScore ?? 0) <= 69
          );
          break;
      }
    }

    reviewJobs = filtered.slice(0, top);
  }

  if (reviewJobs.length === 0) {
    const label = applyReady ? 'apply-ready jobs' : `category "${category}"`;
    logger.info(`No jobs to review for ${label}. Run \`npm run score\` first or check the job ID.`);
    return;
  }

  const scopeLabel = applyReady
    ? 'apply-ready jobs'
    : category === 'all'
      ? 'all jobs'
      : `${category} matches`;

  const header = [
    '============================================================',
    `Review ${reviewJobs.length} ${scopeLabel} for apply/skip decision`,
    '============================================================',
    ``,
    `For each job below, decide: apply or skip, and why.`,
    ``,
  ].join('\n');

  const body = reviewJobs
    .map((job, i) => formatJobBlock(job, i + 1, reviewJobs.length))
    .join('\n');

  console.log(header + body);
}