import { eq, isNull } from 'drizzle-orm';
import { db } from '../db';
import { jobs, jobScores } from '../db/schema';
import { evaluateHardRejects, loadProfileConfig, calculateFreshnessScore } from './pre-filter';
import { evaluateJobWithGemini } from './gemini';
import { logger } from '../utils/logger';

export async function runScoringEngine() {
  const config = loadProfileConfig();

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
  let aiEvaluatedCount = 0;
  let errorCount = 0;

  for (const job of unscoredJobs) {
    try {
      // 1. Calculate Freshness Score Locally
      const freshnessScore = calculateFreshnessScore(job.postedAt, job.fetchedAt);

      // 2. Pre-filter (Hard Rejects)
      const rejectReason = evaluateHardRejects({
        title: job.title,
        location: job.location,
        description: job.description,
      });

      if (rejectReason) {
        // Insert hard reject with 0 score
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
        continue;
      }

      // 3. AI Qualitative Evaluation
      logger.info(`Evaluating job ${job.id} (${job.company} - ${job.title})...`);
      const breakdown = await evaluateJobWithGemini({
        title: job.title,
        company: job.company,
        location: job.location,
        description: job.description,
      });

      if (!breakdown) {
        errorCount++;
        continue;
      }

      // 4. Calculate Final Total Score
      const totalScore = 
        breakdown.roleScore + 
        breakdown.remoteScore + 
        breakdown.seniorityScore + 
        breakdown.domainScore + 
        breakdown.aiProductScore + 
        freshnessScore;

      // 5. Save to database
      await db.insert(jobScores).values({
        jobId: job.id,
        totalScore,
        roleScore: breakdown.roleScore,
        remoteScore: breakdown.remoteScore,
        seniorityScore: breakdown.seniorityScore,
        domainScore: breakdown.domainScore,
        aiProductScore: breakdown.aiProductScore,
        freshnessScore,
        matchReasons: breakdown.matchReasons,
        rejectionReasons: breakdown.rejectionReasons,
      });

      aiEvaluatedCount++;
      
      // Artificial delay to respect rate limits
      await new Promise(resolve => setTimeout(resolve, 2000));
      
    } catch (error) {
      logger.error(`Error scoring job ${job.id}: ${(error as Error).message}`);
      errorCount++;
    }
  }

  logger.info('\n' + '═'.repeat(50));
  logger.info(`🎯 Scoring Complete!`);
  logger.info(`- Hard Rejected (Local): ${hardRejectedCount}`);
  logger.info(`- AI Evaluated: ${aiEvaluatedCount}`);
  logger.info(`- Errors: ${errorCount}`);
  logger.info('═'.repeat(50) + '\n');
}
