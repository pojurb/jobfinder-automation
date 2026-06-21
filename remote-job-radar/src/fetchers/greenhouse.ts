import { JobFetcher, NormalizedJob } from './types';
import { GreenhouseResponseSchema } from './schemas';
import { createHttpClient, rateLimit } from '../utils/http-client';
import { computeContentHash } from '../utils/hash';
import { logger } from '../utils/logger';
import {
  getActiveCompanies,
  markCompanySuccess,
  markCompanyFailure,
} from '../discovery/ats-discovery';

const SOURCE = 'greenhouse';

export class GreenhouseFetcher implements JobFetcher {
  name = SOURCE;

  async fetch(): Promise<NormalizedJob[]> {
    const companies = await getActiveCompanies('greenhouse');
    if (companies.length === 0) {
      logger.info(`[${SOURCE}] No active companies to check.`);
      return [];
    }

    logger.info(`[${SOURCE}] Checking ${companies.length} company boards...`);
    const client = createHttpClient(SOURCE);
    const allJobs: NormalizedJob[] = [];

    for (let i = 0; i < companies.length; i++) {
      const company = companies[i];
      const progress = `[${i + 1}/${companies.length}]`;

      try {
        logger.info(`${progress} Checking ${company.name || company.slug} on Greenhouse...`);
        await rateLimit(SOURCE);

        // Greenhouse paginates with page and per_page params
        let page = 1;
        const perPage = 100;
        let hasMore = true;

        while (hasMore) {
          const url = `https://boards-api.greenhouse.io/v1/boards/${company.slug}/jobs?content=true&page=${page}&per_page=${perPage}`;
          const response = await client.get(url);

          const parsed = GreenhouseResponseSchema.safeParse(response.data);
          if (!parsed.success) {
            logger.warn(
              `${progress} Invalid response from ${company.slug}: ${parsed.error.message}`
            );
            break;
          }

          for (const job of parsed.data.jobs) {
            allJobs.push({
              source: SOURCE,
              sourceJobId: String(job.id),
              title: job.title,
              company: company.name || company.slug,
              location: job.location?.name || undefined,
              url: job.absolute_url,
              description: job.content || undefined,
              postedAt: job.updated_at || undefined,
              contentHash: computeContentHash(
                SOURCE,
                job.title,
                company.name || company.slug,
                job.absolute_url
              ),
              rawJson: job,
            });
          }

          // If we got fewer than perPage results, we're on the last page
          hasMore = parsed.data.jobs.length === perPage;
          page++;

          if (hasMore) await rateLimit(SOURCE);
        }

        await markCompanySuccess(company.id);
      } catch (error: any) {
        if (error?.response?.status === 404) {
          logger.warn(`${progress} ${company.slug}: board not found (404)`);
          await markCompanyFailure(company.id);
        } else {
          logger.error(
            `${progress} ${company.slug}: ${error?.message || 'Unknown error'}`
          );
        }
        // Error isolated — continue to next company
      }
    }

    logger.info(`[${SOURCE}] Fetched ${allJobs.length} jobs from ${companies.length} boards`);
    return allJobs;
  }
}
