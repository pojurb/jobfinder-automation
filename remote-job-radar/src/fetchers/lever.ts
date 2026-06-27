import { JobFetcher, NormalizedJob } from './types';
import { LeverResponseSchema } from './schemas';
import { createHttpClient, rateLimit } from '../utils/http-client';
import { computeContentHash } from '../utils/hash';
import { logger } from '../utils/logger';
import {
  getActiveCompanies,
  markCompanySuccess,
  markCompanyFailure,
} from '../discovery/ats-discovery';

const SOURCE = 'lever';

export class LeverFetcher implements JobFetcher {
  name = SOURCE;

  async fetch(): Promise<NormalizedJob[]> {
    const companies = await getActiveCompanies('lever');
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
        logger.info(`${progress} Checking ${company.name || company.slug} on Lever...`);
        await rateLimit(SOURCE);

        // Lever paginates with offset param
        let offset: string | undefined = undefined;
        let hasMore = true;

        while (hasMore) {
          let url = `https://api.lever.co/v0/postings/${company.slug}?mode=json&limit=100`;
          if (offset) url += `&offset=${offset}`;

          const response = await client.get(url);

          const parsed = LeverResponseSchema.safeParse(response.data);
          if (!parsed.success) {
            logger.warn(
              `${progress} Invalid response from ${company.slug}: ${parsed.error.message}`
            );
            break;
          }

          for (const posting of parsed.data) {
            const description = [posting.descriptionPlain, posting.additionalPlain]
              .filter(Boolean)
              .join('\n\n');

            allJobs.push({
              source: SOURCE,
              sourceJobId: posting.id,
              title: posting.text,
              company: company.name || company.slug,
              location: posting.categories?.location || undefined,
              url: posting.hostedUrl,
              description: description || undefined,
              postedAt: posting.createdAt
                ? new Date(posting.createdAt).toISOString()
                : undefined,
              contentHash: computeContentHash(
                posting.text,
                company.name || company.slug,
                posting.hostedUrl
              ),
              rawJson: posting,
            });
          }

          // Lever returns fewer results when exhausted; also check response header
          if (parsed.data.length < 100) {
            hasMore = false;
          } else {
            // Use the last posting ID as the offset for next page
            offset = parsed.data[parsed.data.length - 1].id;
            await rateLimit(SOURCE);
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
