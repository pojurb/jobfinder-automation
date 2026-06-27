import { JobFetcher, NormalizedJob } from './types';
import { RemotiveResponseSchema } from './schemas';
import { createHttpClient, rateLimit } from '../utils/http-client';
import { computeContentHash } from '../utils/hash';
import { logger } from '../utils/logger';
import { loadPipelineConfig } from './index';

const SOURCE = 'remotive';
const BASE_URL = 'https://remotive.com/api/remote-jobs';

export class RemotiveFetcher implements JobFetcher {
  name = SOURCE;

  async fetch(): Promise<NormalizedJob[]> {
    const client = createHttpClient(SOURCE);
    const seen = new Set<string>();
    const allJobs: NormalizedJob[] = [];

    const config = loadPipelineConfig();
    const keywords = config.search.keywords;

    for (const keyword of keywords) {
      const url = `${BASE_URL}?search=${encodeURIComponent(keyword)}`;
      try {
        await rateLimit(SOURCE);
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
            contentHash: computeContentHash(job.title, job.company_name, job.url),
            rawJson: job,
          });
        }
      } catch (error) {
        logger.error(`[${SOURCE}] Failed to fetch ${url}: ${(error as Error).message}`);
      }
    }

    logger.info(`[${SOURCE}] Fetched ${allJobs.length} unique jobs from ${keywords.length} keyword searches`);
    return allJobs;
  }
}