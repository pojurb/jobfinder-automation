import { JobFetcher, NormalizedJob } from './types';
import { RemoteOKResponseSchema, RemoteOKJobSchema } from './schemas';
import { createHttpClient, rateLimit } from '../utils/http-client';
import { computeContentHash } from '../utils/hash';
import { logger } from '../utils/logger';
import { loadPipelineConfig } from './index';

const SOURCE = 'remoteok';
const BASE_URL = 'https://remoteok.com/api';

export class RemoteOKFetcher implements JobFetcher {
  name = SOURCE;

  async fetch(): Promise<NormalizedJob[]> {
    const client = createHttpClient(SOURCE);
    const seen = new Set<string>();
    const allJobs: NormalizedJob[] = [];

    const config = loadPipelineConfig();
    const keywords = config.search.keywords;

    for (const keyword of keywords) {
      const tag = keyword.replace(/\s+/g, '+');
      const url = `${BASE_URL}?tag=${encodeURIComponent(tag)}`;
      try {
        await rateLimit(SOURCE);
        logger.info(`[${SOURCE}] Fetching from ${url}...`);
        const response = await client.get(url);

        const parsed = RemoteOKResponseSchema.safeParse(response.data);
        if (!parsed.success) {
          logger.error(`[${SOURCE}] Invalid API response shape: ${parsed.error.message}`);
          continue;
        }

        for (let i = 1; i < parsed.data.length; i++) {
          const jobParsed = RemoteOKJobSchema.safeParse(parsed.data[i]);
          if (!jobParsed.success) {
            continue;
          }

          const job = jobParsed.data;
          const jobId = String(job.id);
          if (seen.has(jobId)) continue;
          seen.add(jobId);

          const salary =
            job.salary_min && job.salary_max
              ? `$${job.salary_min.toLocaleString()} - $${job.salary_max.toLocaleString()}`
              : undefined;

          allJobs.push({
            source: SOURCE,
            sourceJobId: jobId,
            title: job.position,
            company: job.company,
            location: job.location || undefined,
            url: job.url || `https://remoteok.com/remote-jobs/${jobId}`,
            description: job.description || undefined,
            salary,
            postedAt: job.date || undefined,
            contentHash: computeContentHash(job.position, job.company, job.url || `https://remoteok.com/remote-jobs/${jobId}`),
            rawJson: parsed.data[i],
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