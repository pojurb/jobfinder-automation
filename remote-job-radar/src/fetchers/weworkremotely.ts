import { XMLParser } from 'fast-xml-parser';
import { JobFetcher, NormalizedJob } from './types';
import { createHttpClient, rateLimit } from '../utils/http-client';
import { computeContentHash } from '../utils/hash';
import { logger } from '../utils/logger';

const SOURCE = 'weworkremotely';
const FEED_URL = 'https://weworkremotely.com/categories/remote-product-jobs.rss';

interface RSSItem {
  title?: string;
  link?: string;
  description?: string;
  pubDate?: string;
  guid?: string;
  region?: string;
}

/**
 * Extract the slug from a WeWorkRemotely guid/job URL.
 * e.g. https://weworkremotely.com/remote-jobs/12345-senior-product-manager → 12345-senior-product-manager
 */
function extractSlug(guid: string): string {
  try {
    const url = new URL(guid);
    const parts = url.pathname.split('/').filter(Boolean);
    return parts[parts.length - 1] || guid;
  } catch {
    // Not a URL — use the trailing segment or the value itself
    const parts = guid.split('/').filter(Boolean);
    return parts[parts.length - 1] || guid;
  }
}

/**
 * Parse a title formatted as "Company Name: Job Title" into parts.
 * Splits on the first colon.
 */
function parseTitle(rawTitle: string): { company: string; title: string } {
  const colonIdx = rawTitle.indexOf(':');
  if (colonIdx === -1) {
    return { company: 'Unknown', title: rawTitle.trim() };
  }
  return {
    company: rawTitle.slice(0, colonIdx).trim(),
    title: rawTitle.slice(colonIdx + 1).trim(),
  };
}

export class WeWorkRemotelyFetcher implements JobFetcher {
  name = SOURCE;

  async fetch(): Promise<NormalizedJob[]> {
    const client = createHttpClient(SOURCE);
    const seen = new Set<string>();
    const allJobs: NormalizedJob[] = [];
    const parser = new XMLParser();

    try {
      await rateLimit(SOURCE);
      logger.info(`[${SOURCE}] Fetching from ${FEED_URL}...`);
      const response = await client.get(FEED_URL, {
        headers: { Accept: 'application/rss+xml, application/xml, text/xml' },
        responseType: 'text',
      });

      let parsed: unknown;
      try {
        parsed = parser.parse(response.data as string);
      } catch (parseErr) {
        logger.error(`[${SOURCE}] Failed to parse RSS XML: ${(parseErr as Error).message}`);
        return allJobs;
      }

      const channel = (parsed as any)?.rss?.channel;
      if (!channel || !channel.item) {
        logger.warn(`[${SOURCE}] No <item> elements found in feed.`);
        return allJobs;
      }

      const items: RSSItem[] = Array.isArray(channel.item) ? channel.item : [channel.item];

      for (const item of items) {
        try {
          if (!item.title || !item.link) continue;

          const guid = item.guid || item.link;
          const sourceJobId = extractSlug(guid);
          if (seen.has(sourceJobId)) continue;
          seen.add(sourceJobId);

          const { company, title } = parseTitle(item.title);

          allJobs.push({
            source: SOURCE,
            sourceJobId,
            title,
            company,
            location: item.region || undefined,
            remoteRegion: item.region || undefined,
            url: item.link,
            description: item.description || undefined,
            postedAt: item.pubDate || undefined,
            contentHash: computeContentHash(title, company, item.link),
            rawJson: item,
          });
        } catch (itemErr) {
          logger.warn(`[${SOURCE}] Skipped malformed item: ${(itemErr as Error).message}`);
        }
      }
    } catch (error) {
      logger.error(`[${SOURCE}] Failed to fetch feed: ${(error as Error).message}`);
    }

    logger.info(`[${SOURCE}] Fetched ${allJobs.length} unique jobs`);
    return allJobs;
  }
}