import { JobFetcher, NormalizedJob } from './types';
import { createHttpClient, rateLimit } from '../utils/http-client';
import { computeContentHash } from '../utils/hash';
import { logger } from '../utils/logger';

const SOURCE = 'wellfound';
const API_URL = 'https://api.wellfound.com/api/v1/jobs';

/**
 * Wellfound (formerly AngelList) fetcher.
 *
 * Wellfound requires authentication. This fetcher reads an optional
 * WELLFOUND_API_KEY or WELLFOUND_TOKEN from the environment. If no credential
 * is present, it logs a warning and returns an empty array.
 *
 * TODO: Replace with a real implementation once authenticated access is
 * configured.
 */
export class WellfoundFetcher implements JobFetcher {
  name = SOURCE;

  async fetch(): Promise<NormalizedJob[]> {
    const token = process.env.WELLFOUND_API_KEY || process.env.WELLFOUND_TOKEN;

    if (!token) {
      logger.warn(
        `[${SOURCE}] No WELLFOUND_API_KEY/WELLFOUND_TOKEN set — returning 0 jobs.`
      );
      return [];
    }

    const client = createHttpClient(SOURCE);

    try {
      await rateLimit(SOURCE);
      logger.info(`[${SOURCE}] Fetching from ${API_URL}...`);
      const response = await client.get(API_URL, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

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
        `[${SOURCE}] Request failed (${(error as Error).message}). Returning 0 jobs.`
      );
      return [];
    }
  }

  private normalize(jobs: any[]): NormalizedJob[] {
    return jobs.map((job) => ({
      source: SOURCE,
      sourceJobId: String(job.id ?? job.slug ?? ''),
      title: job.title ?? '',
      company: job.company_name ?? job.company ?? job.startup?.name ?? '',
      location: job.location || undefined,
      remoteRegion: job.region || undefined,
      url: job.url || job.angellist_url || `https://wellfound.com/jobs/${job.id ?? job.slug}`,
      description: job.description || undefined,
      salary: job.salary || undefined,
      postedAt: job.posted_at || job.updated_at || undefined,
      contentHash: computeContentHash(
        job.title ?? '',
        job.company_name ?? job.company ?? job.startup?.name ?? '',
        job.url || job.angellist_url || `https://wellfound.com/jobs/${job.id ?? job.slug}`
      ),
      rawJson: job,
    }));
  }
}