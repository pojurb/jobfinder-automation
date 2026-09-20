import { JobFetcher, NormalizedJob } from './types';
import { WorkableResponseSchema } from './schemas';
import { createHttpClient, rateLimit } from '../utils/http-client';
import { computeContentHash } from '../utils/hash';
import { logger } from '../utils/logger';
import {
  getActiveCompanies,
  markCompanySuccess,
  markCompanyFailure,
} from '../discovery/ats-discovery';

const SOURCE = 'workable';

function formatLocation(job: {
  city?: string | null;
  state?: string | null;
  country?: string | null;
}): string | undefined {
  const location = [job.city, job.state, job.country].filter(Boolean).join(', ');
  return location || undefined;
}

export class WorkableFetcher implements JobFetcher {
  name = SOURCE;

  async fetch(): Promise<NormalizedJob[]> {
    const companies = await getActiveCompanies(SOURCE);
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
        logger.info(`${progress} Checking ${company.name || company.slug} on Workable...`);
        await rateLimit(SOURCE);

        const response = await client.get(
          `https://apply.workable.com/api/v1/widget/accounts/${company.slug}`
        );
        const parsed = WorkableResponseSchema.safeParse(response.data);
        if (!parsed.success) {
          logger.warn(
            `${progress} Invalid response from ${company.slug}: ${parsed.error.message}`
          );
          await markCompanyFailure(company.id);
          continue;
        }

        const companyName = company.name || parsed.data.name || company.slug;
        for (const job of parsed.data.jobs) {
          allJobs.push({
            source: SOURCE,
            sourceJobId: job.shortcode,
            title: job.title,
            company: companyName,
            location: formatLocation(job),
            remoteRegion: job.telecommuting ? 'Remote' : undefined,
            url: job.url,
            postedAt: job.published_on || undefined,
            contentHash: computeContentHash(job.title, companyName, job.url),
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
