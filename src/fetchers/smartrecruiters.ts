import { JobFetcher, NormalizedJob } from './types';
import {
  SmartRecruitersListResponseSchema,
  SmartRecruitersPosting,
  SmartRecruitersPostingDetailSchema,
} from './schemas';
import { loadTitleSearchConfig, matchesTitleKeywords } from './filtering';
import { createHttpClient, rateLimit } from '../utils/http-client';
import { computeContentHash } from '../utils/hash';
import { logger } from '../utils/logger';
import {
  getActiveCompanies,
  markCompanySuccess,
  markCompanyFailure,
} from '../discovery/ats-discovery';

const SOURCE = 'smartrecruiters';
const PAGE_SIZE = 100;
const MAX_PAGES = 10;

function formatLocation(posting: SmartRecruitersPosting): string | undefined {
  const location = posting.location;
  if (!location) return undefined;

  return (
    location.fullLocation ||
    [location.city, location.region, location.country].filter(Boolean).join(', ') ||
    undefined
  );
}

function remoteRegion(posting: SmartRecruitersPosting): string | undefined {
  if (posting.location?.remote) return 'Remote';
  if (posting.location?.hybrid) return 'Hybrid';
  return undefined;
}

export class SmartRecruitersFetcher implements JobFetcher {
  name = SOURCE;

  async fetch(): Promise<NormalizedJob[]> {
    const companies = await getActiveCompanies(SOURCE);
    if (companies.length === 0) {
      logger.info(`[${SOURCE}] No active companies to check.`);
      return [];
    }

    const titleSearchConfig = loadTitleSearchConfig();
    logger.info(`[${SOURCE}] Checking ${companies.length} company boards...`);
    const client = createHttpClient(SOURCE);
    const allJobs: NormalizedJob[] = [];

    for (let i = 0; i < companies.length; i++) {
      const company = companies[i];
      const progress = `[${i + 1}/${companies.length}]`;
      let companyValid = false;

      try {
        logger.info(`${progress} Checking ${company.name || company.slug} on SmartRecruiters...`);

        for (let page = 0, offset = 0; page < MAX_PAGES; page++, offset += PAGE_SIZE) {
          await rateLimit(SOURCE);
          const response = await client.get(
            `https://api.smartrecruiters.com/v1/companies/${company.slug}/postings?limit=${PAGE_SIZE}&offset=${offset}`
          );
          const parsed = SmartRecruitersListResponseSchema.safeParse(response.data);
          if (!parsed.success) {
            logger.warn(
              `${progress} Invalid response from ${company.slug}: ${parsed.error.message}`
            );
            break;
          }

          if (parsed.data.totalFound === 0) {
            logger.warn(`${progress} ${company.slug}: board not found (no postings)`);
            break;
          }

          companyValid = true;
          const matchingPostings = parsed.data.content.filter((posting) =>
            matchesTitleKeywords(posting.name, titleSearchConfig)
          );

          for (const posting of matchingPostings) {
            await rateLimit(SOURCE);
            const detailResponse = await client.get(
              `https://api.smartrecruiters.com/v1/companies/${company.slug}/postings/${posting.id}`
            );
            const detail = SmartRecruitersPostingDetailSchema.safeParse(detailResponse.data);
            if (!detail.success) {
              logger.warn(
                `${progress} Invalid posting detail for ${posting.id}: ${detail.error.message}`
              );
              continue;
            }

            const companyName = company.name || detail.data.company?.name || company.slug;
            const url = detail.data.postingUrl || detail.data.applyUrl;
            if (!url) {
              logger.warn(`${progress} ${posting.id}: posting detail has no public URL`);
              continue;
            }

            const sections = detail.data.jobAd?.sections;
            const description = [
              sections?.companyDescription?.text,
              sections?.jobDescription?.text,
              sections?.qualifications?.text,
              sections?.additionalInformation?.text,
            ]
              .filter(Boolean)
              .join('\n\n');

            allJobs.push({
              source: SOURCE,
              sourceJobId: detail.data.id,
              title: detail.data.name,
              company: companyName,
              location: formatLocation(detail.data),
              remoteRegion: remoteRegion(detail.data),
              url,
              description: description || undefined,
              postedAt: detail.data.releasedDate || undefined,
              contentHash: computeContentHash(detail.data.name, companyName, url),
              rawJson: detail.data,
            });
          }

          if (offset + parsed.data.content.length >= parsed.data.totalFound || parsed.data.content.length === 0) {
            break;
          }
        }

        if (companyValid) {
          await markCompanySuccess(company.id);
        } else {
          await markCompanyFailure(company.id);
        }
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
