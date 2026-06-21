import { JobFetcher, NormalizedJob } from './types';
import { RemotiveResponseSchema } from './schemas';
import { createHttpClient } from '../utils/http-client';
import { computeContentHash } from '../utils/hash';
import { logger } from '../utils/logger';

const SOURCE = 'remotive';
const API_URLS = [
  'https://remotive.com/api/remote-jobs?category=product',
  'https://remotive.com/api/remote-jobs?search=product+manager',
];

export class RemotiveFetcher implements JobFetcher {
  name = SOURCE;

  async fetch(): Promise<NormalizedJob[]> {
    const client = createHttpClient(SOURCE);
    const seen = new Set<string>();
    const allJobs: NormalizedJob[] = [];

    for (const url of API_URLS) {
      try {
        logger.info(`[${SOURCE}] Fetching from ${url}...`);
        const response = await client.get(url);

        const parsed = RemotiveResponseSchema.safeParse(response.data);
        if (!parsed.success) {
          logger.error(`[${SOURCE}] Invalid API response shape: ${parsed.error.message}`);
          continue;
        }

        for (const job of parsed.data.jobs) {
          const jobId = String(job.id);
          if (seen.has(jobId)) continue;
          seen.add(jobId);

          allJobs.push({
            source: SOURCE,
            sourceJobId: jobId,
            title: job.title,
            company: job.company_name,
            location: job.candidate_required_location || undefined,
            url: job.url,
            description: job.description || undefined,
            salary: job.salary || undefined,
            postedAt: job.publication_date || undefined,
            contentHash: computeContentHash(SOURCE, job.title, job.company_name, job.url),
            rawJson: job,
          });
        }
      } catch (error) {
        logger.error(`[${SOURCE}] Failed to fetch ${url}: ${(error as Error).message}`);
      }
    }

    logger.info(`[${SOURCE}] Fetched ${allJobs.length} unique jobs`);
    return allJobs;
  }
}
