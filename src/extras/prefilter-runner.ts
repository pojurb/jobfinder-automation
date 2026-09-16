import { eq, isNull } from 'drizzle-orm';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { db } from '../db';
import { jobs, jobScores } from '../db/schema';
import { evaluateHardRejects, calculateFreshnessScore } from '../scoring/pre-filter';
import { logger } from '../utils/logger';
import { getReportsDir } from '../utils/paths';

async function main() {
  // Find jobs that don't have a score yet
  const unscoredJobs = await db
    .select({
      id: jobs.id,
      title: jobs.title,
      company: jobs.company,
      location: jobs.location,
      description: jobs.description,
      postedAt: jobs.postedAt,
      fetchedAt: jobs.fetchedAt,
    })
    .from(jobs)
    .leftJoin(jobScores, eq(jobs.id, jobScores.jobId))
    .where(isNull(jobScores.id));

  logger.info(`Found ${unscoredJobs.length} unscored jobs in the database.`);

  let hardRejectedCount = 0;
  const candidates: any[] = [];

  for (const job of unscoredJobs) {
    const freshnessScore = calculateFreshnessScore(job.postedAt, job.fetchedAt);
    const rejectReason = evaluateHardRejects({
      title: job.title,
      location: job.location,
      description: job.description,
    });

    if (rejectReason) {
      await db.insert(jobScores).values({
        jobId: job.id,
        totalScore: 0,
        roleScore: 0,
        remoteScore: 0,
        seniorityScore: 0,
        domainScore: 0,
        aiProductScore: 0,
        freshnessScore,
        matchReasons: [],
        rejectionReasons: [rejectReason],
      });
      hardRejectedCount++;
    } else {
      candidates.push({
        id: job.id,
        title: job.title,
        company: job.company,
        location: job.location,
        description: job.description,
        freshnessScore,
      });
    }
  }

  logger.info(`- Hard Rejected (Local): ${hardRejectedCount}`);
  logger.info(`- Candidates for AI evaluation: ${candidates.length}`);

  if (candidates.length > 0) {
    const reportsDir = getReportsDir();
    mkdirSync(reportsDir, { recursive: true });
    const outputPath = join(reportsDir, 'candidates_to_score.json');
    writeFileSync(outputPath, JSON.stringify(candidates, null, 2), 'utf-8');
    logger.info(`Wrote candidates to: ${outputPath}`);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
