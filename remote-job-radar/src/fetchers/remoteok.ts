import { JobFetcher, NormalizedJob } from './types';
import { RemoteOKResponseSchema, RemoteOKJobSchema } from './schemas';
import { createHttpClient } from '../utils/http-client';
import { computeContentHash } from '../utils/hash';
import { logger } from '../utils/logger';

const SOURCE = 'remoteok';
const API_URL = 'https://remoteok.com/api?tag=product';

export class RemoteOKFetcher implements JobFetcher {
  name = SOURCE;

  async fetch(): Promise<NormalizedJob[]> {
    const client = createHttpClient(SOURCE);

    try {
      logger.info(`[${SOURCE}] Fetching jobs from RemoteOK API...`);
      const response = await client.get(API_URL);

      const parsed = RemoteOKResponseSchema.safeParse(response.data);
      if (!parsed.success) {
        logger.error(`[${SOURCE}] Invalid API response shape: ${parsed.error.message}`);
        return [];
      }

      const jobs: NormalizedJob[] = [];

      // Skip index 0 (metadata) — real jobs start at index 1
      for (let i = 1; i < parsed.data.length; i++) {
        const jobParsed = RemoteOKJobSchema.safeParse(parsed.data[i]);
        if (!jobParsed.success) {
          logger.debug(`[${SOURCE}] Skipping invalid job at index ${i}`);
          continue;
        }

        const job = jobParsed.data;
        const salary =
          job.salary_min && job.salary_max
            ? `$${job.salary_min.toLocaleString()} - $${job.salary_max.toLocaleString()}`
            : undefined;

        jobs.push({
          source: SOURCE,
          sourceJobId: String(job.id),
          title: job.position,
          company: job.company,
          location: job.location || undefined,
          url: job.url || `https://remoteok.com/remote-jobs/${job.id}`,
          description: job.description || undefined,
          salary,
          postedAt: job.date || undefined,
          contentHash: computeContentHash(SOURCE, job.position, job.company, job.url || `https://remoteok.com/remote-jobs/${job.id}`),
          rawJson: parsed.data[i],
        });
      }

      logger.info(`[${SOURCE}] Fetched ${jobs.length} jobs`);
      return jobs;
    } catch (error) {
      logger.error(`[${SOURCE}] Failed to fetch: ${(error as Error).message}`);
      return [];
    }
  }
}
