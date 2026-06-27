import { JobFetcher, NormalizedJob } from './types';
import { createHttpClient, rateLimit } from '../utils/http-client';
import { computeContentHash } from '../utils/hash';
import { logger } from '../utils/logger';

const SOURCE = 'workatastartup';
const API_URL = 'https://www.workatastartup.com/api/v1/jobs';

/**
 * YC Work at a Startup fetcher.
 *
 * The endpoint https://www.workatastartup.com/api/v1/jobs is not officially
 * documented and may be unavailable. This stub attempts it and gracefully
 * returns an empty array on failure.
 *
 * TODO: Replace with a real implementation once a working API or scraping
 * strategy is available.
 */
export class WorkAtAStartupFetcher implements JobFetcher {
  name = SOURCE;

  async fetch(): Promise<NormalizedJob[]> {
    const client = createHttpClient(SOURCE);

    try {
      await rateLimit(SOURCE);
      logger.info(`[${SOURCE}] Attempting ${API_URL}...`);
      const response = await client.get(API_URL);

      const data = response.data;
      if (Array.isArray(data)) {
        return this.normalize(data);
      }
      if (data && Array.isArray((data as any).jobs)) {
        return this.normalize((data as any).jobs);
      }

      logger.warn(`[${SOURCE}] Unexpected response shape — returning 0 jobs.`);
      return [];
    } catch (error) {
      logger.warn(
        `[${SOURCE}] Endpoint unavailable (${(error as Error).message}). Returning 0 jobs.`
      );
      return [];
    }
  }

  private normalize(jobs: any[]): NormalizedJob[] {
    return jobs.map((job) => ({
      source: SOURCE,
      sourceJobId: String(job.id ?? job.slug ?? ''),
      title: job.title ?? '',
      company: job.company_name ?? job.company ?? '',
      location: job.location || undefined,
      remoteRegion: job.region || undefined,
      url: job.url || `https://www.workatastartup.com/jobs/${job.id ?? job.slug}`,
      description: job.description || undefined,
      salary: job.salary || undefined,
      postedAt: job.posted_at || job.date || undefined,
      contentHash: computeContentHash(
        job.title ?? '',
        job.company_name ?? job.company ?? '',
        job.url || `https://www.workatastartup.com/jobs/${job.id ?? job.slug}`
      ),
      rawJson: job,
    }));
  }
}