import { JobFetcher, NormalizedJob } from './types';
import { createHttpClient, rateLimit } from '../utils/http-client';
import { computeContentHash } from '../utils/hash';
import { logger } from '../utils/logger';
import {
  getActiveCompanies,
  markCompanySuccess,
  markCompanyFailure,
} from '../discovery/ats-discovery';

const SOURCE = 'workday';

const PAGE_LIMIT = 100;
const MAX_PAGES = 10;

interface WorkdayJobPosting {
  title?: string;
  companyName?: string;
  locationText?: string;
  externalPath?: string;
  jobPostingId?: string;
  bulletFields?: string[];
}

interface WorkdayResponse {
  jobPostings?: WorkdayJobPosting[];
  total?: number;
}

export class WorkdayFetcher implements JobFetcher {
  name = SOURCE;

  async fetch(): Promise<NormalizedJob[]> {
    const companies = await getActiveCompanies('workday');
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
        logger.info(`${progress} Checking ${company.name || company.slug} on Workday...`);

        const slug = company.slug;
        const postUrl = `https://${slug}.wd1.myworkdayjobs.com/wday/cxs/en-US/${slug}/jobs`;

        let offset = 0;
        let page = 0;
        let hasMore = true;
        const companyName = company.name || company.slug;

        while (hasMore && page < MAX_PAGES) {
          await rateLimit(SOURCE);

          const response = await client.post(postUrl, {
            limit: PAGE_LIMIT,
            offset,
          });

          const data = response.data as WorkdayResponse;
          const postings = data.jobPostings || [];

          for (const job of postings) {
            const externalPath = job.externalPath || '';
            const url = `https://${slug}.wd1.myworkdayjobs.com${externalPath}`;
            allJobs.push({
              source: SOURCE,
              sourceJobId: job.jobPostingId || externalPath,
              title: job.title || '',
              company: companyName,
              location: job.locationText || undefined,
              url,
              description: undefined,
              postedAt: undefined,
              contentHash: computeContentHash(job.title || '', companyName, url),
              rawJson: job,
            });
          }

          page++;
          offset += PAGE_LIMIT;
          hasMore = postings.length === PAGE_LIMIT;

          if (hasMore) {
            logger.debug(`${progress} Page ${page}: fetched ${postings.length}, continuing...`);
          }
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