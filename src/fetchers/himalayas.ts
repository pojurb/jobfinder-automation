import { JobFetcher, NormalizedJob } from './types';
import { HimalayasResponseSchema } from './schemas';
import { createHttpClient, rateLimit } from '../utils/http-client';
import { computeContentHash } from '../utils/hash';
import { logger } from '../utils/logger';

const SOURCE = 'himalayas';
const BASE_URL = 'https://himalayas.app/jobs/api';
const MAX_PAGES = 25;

function formatSalary(
  minSalary?: number | null,
  maxSalary?: number | null,
  currency?: string | null,
  salaryPeriod?: string | null
): string | undefined {
  if (minSalary == null && maxSalary == null) return undefined;

  const formatAmount = (amount: number) => amount.toLocaleString();
  const range =
    minSalary != null && maxSalary != null
      ? `${formatAmount(minSalary)} - ${formatAmount(maxSalary)}`
      : minSalary != null
        ? `${formatAmount(minSalary)}+`
        : `Up to ${formatAmount(maxSalary!)}`;

  return [currency, range, salaryPeriod ? `/ ${salaryPeriod}` : undefined]
    .filter(Boolean)
    .join(' ');
}

export class HimalayasFetcher implements JobFetcher {
  name = SOURCE;

  async fetch(): Promise<NormalizedJob[]> {
    const client = createHttpClient(SOURCE);
    const seen = new Set<string>();
    const allJobs: NormalizedJob[] = [];
    let cursor: string | undefined;

    try {
      for (let page = 0; page < MAX_PAGES; page++) {
        const url = new URL(BASE_URL);
        if (cursor) url.searchParams.set('cursor', cursor);

        await rateLimit(SOURCE);
        logger.info(`[${SOURCE}] Fetching page ${page + 1}${cursor ? ' with cursor' : ''}.`);
        const response = await client.get(url.toString());
        const parsed = HimalayasResponseSchema.safeParse(response.data);

        if (!parsed.success) {
          logger.error(`[${SOURCE}] Invalid API response shape: ${parsed.error.message}`);
          break;
        }

        for (const job of parsed.data.jobs) {
          if (seen.has(job.guid)) continue;
          seen.add(job.guid);

          const location = Array.isArray(job.locationRestrictions)
            ? job.locationRestrictions.join(', ')
            : job.locationRestrictions || undefined;

          allJobs.push({
            source: SOURCE,
            sourceJobId: job.guid,
            title: job.title,
            company: job.companyName,
            location,
            url: job.applicationLink,
            description: job.description || undefined,
            salary: formatSalary(
              job.minSalary,
              job.maxSalary,
              job.currency,
              job.salaryPeriod
            ),
            postedAt: job.pubDate || undefined,
            contentHash: computeContentHash(job.title, job.companyName, job.applicationLink),
            rawJson: job,
          });
        }

        const nextCursor = parsed.data.nextCursor || undefined;
        if (!nextCursor || nextCursor === cursor) break;
        cursor = nextCursor;
      }
    } catch (error) {
      logger.error(`[${SOURCE}] Failed to fetch ${BASE_URL}: ${(error as Error).message}`);
    }

    logger.info(`[${SOURCE}] Fetched ${allJobs.length} unique jobs from the public feed`);
    return allJobs;
  }
}
