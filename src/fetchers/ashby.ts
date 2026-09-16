import { JobFetcher, NormalizedJob } from './types';
import { AshbyResponseSchema } from './schemas';
import { createHttpClient, rateLimit } from '../utils/http-client';
import { computeContentHash } from '../utils/hash';
import { logger } from '../utils/logger';
import {
  getActiveCompanies,
  markCompanySuccess,
  markCompanyFailure,
} from '../discovery/ats-discovery';

const SOURCE = 'ashby';

export class AshbyFetcher implements JobFetcher {
  name = SOURCE;

  async fetch(): Promise<NormalizedJob[]> {
    const companies = await getActiveCompanies('ashby');
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
        logger.info(`${progress} Checking ${company.name || company.slug} on Ashby...`);
        await rateLimit(SOURCE);

        const url = `https://api.ashbyhq.com/posting-api/job-board/${company.slug}`;
        const response = await client.get(url);

        const parsed = AshbyResponseSchema.safeParse(response.data);
        if (!parsed.success) {
          logger.warn(
            `${progress} Invalid response from ${company.slug}: ${parsed.error.message}`
          );
          await markCompanyFailure(company.id);
          continue;
        }

        for (const job of parsed.data.jobs) {
          allJobs.push({
            source: SOURCE,
            sourceJobId: job.id,
            title: job.title,
            company: company.name || company.slug,
            location: job.location || undefined,
            url: job.jobUrl || `https://jobs.ashbyhq.com/${company.slug}/${job.id}`,
            description: job.descriptionPlain || job.descriptionHtml || undefined,
            postedAt: job.publishedDate || undefined,
            contentHash: computeContentHash(
              job.title,
              company.name || company.slug,
              job.jobUrl || `https://jobs.ashbyhq.com/${company.slug}/${job.id}`
            ),
            rawJson: job,
          });
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
      }
    }

    logger.info(`[${SOURCE}] Fetched ${allJobs.length} jobs from ${companies.length} boards`);
    return allJobs;
  }
}
