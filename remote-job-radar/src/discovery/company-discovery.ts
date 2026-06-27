import { readFileSync } from 'fs';
import { parse } from 'yaml';
import { join } from 'path';
import { AxiosInstance } from 'axios';
import { db } from '../db';
import { discoveredCompanies } from '../db/schema';
import { eq, and, sql } from 'drizzle-orm';
import { logger } from '../utils/logger';
import { getProjectRoot } from '../utils/paths';
import { createHttpClient } from '../utils/http-client';

interface CompanyEntry {
  name: string;
  industry: string;
  website?: string;
  priority?: string;
}

interface CompaniesConfig {
  companies: CompanyEntry[];
}

function loadCompaniesConfig(): CompaniesConfig {
  const configPath = join(getProjectRoot(), 'companies.yaml');
  const content = readFileSync(configPath, 'utf-8');
  return parse(content) as CompaniesConfig;
}

const ALLOWED_INDUSTRIES = [
  'SaaS',
  'FinTech',
  'Financial Technology',
  'B2B SaaS',
  'AI',
  'Data',
];

type AtsType = 'greenhouse' | 'lever' | 'ashby';

interface AtsProbe {
  atsType: AtsType;
  buildUrl: (slug: string) => string;
  checkResponse: (data: unknown) => boolean;
}

const ATS_PROBES: AtsProbe[] = [
  {
    atsType: 'greenhouse',
    buildUrl: (slug) =>
      `https://boards-api.greenhouse.io/v1/boards/${slug}/jobs?per_page=1`,
    checkResponse: (data) =>
      typeof data === 'object' &&
      data !== null &&
      Array.isArray((data as { jobs?: unknown }).jobs),
  },
  {
    atsType: 'lever',
    buildUrl: (slug) =>
      `https://api.lever.co/v0/postings/${slug}?limit=1&mode=json`,
    checkResponse: (data) => Array.isArray(data),
  },
  {
    atsType: 'ashby',
    buildUrl: (slug) =>
      `https://api.ashbyhq.com/posting-api/job-board/${slug}`,
    checkResponse: (data) =>
      typeof data === 'object' &&
      data !== null &&
      Array.isArray((data as { jobs?: unknown }).jobs),
  },
];

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function buildAltSlugs(name: string, slug: string): string[] {
  const alt = [
    name.toLowerCase().replace(/\s/g, ''),
    slug.replace(/-/g, ''),
    name.toLowerCase().replace(/\s/g, '-'),
  ];
  const unique: string[] = [];
  for (const s of alt) {
    if (s && s !== slug && !unique.includes(s)) {
      unique.push(s);
    }
  }
  return unique;
}

async function probeATS(
  client: AxiosInstance,
  slug: string
): Promise<{ atsType: AtsType; careerUrl: string } | null> {
  for (const probe of ATS_PROBES) {
    const url = probe.buildUrl(slug);
    try {
      const response = await client.get(url, { timeout: 5000 });
      if (probe.checkResponse(response.data)) {
        return { atsType: probe.atsType, careerUrl: url };
      }
    } catch {
      // Continue to next probe
    }
  }
  return null;
}

async function isAlreadyRegistered(slug: string, atsType: AtsType): Promise<boolean> {
  const existing = await db
    .select({ id: discoveredCompanies.id })
    .from(discoveredCompanies)
    .where(
      and(
        eq(discoveredCompanies.slug, slug),
        eq(discoveredCompanies.atsType, atsType)
      )
    )
    .limit(1);
  return existing.length > 0;
}

async function registerCompany(
  slug: string,
  name: string,
  atsType: AtsType,
  careerUrl: string
): Promise<void> {
  try {
    await db.insert(discoveredCompanies).values({
      slug,
      name,
      atsType,
      discoveredFrom: careerUrl,
      isActive: 1,
      failCount: 0,
    });
    logger.info(`  + Registered ${name} on ${atsType} (slug: ${slug})`);
  } catch {
    // Already exists — silently skip (unique constraint race)
  }
}

export interface DiscoverOptions {
  industry?: string;
  dryRun?: boolean;
}

export async function runCompanyDiscovery(
  options: DiscoverOptions = {}
): Promise<void> {
  const config = loadCompaniesConfig();
  let companies = config.companies;

  const requestedIndustries = options.industry
    ? options.industry.split(',').map((s) => s.trim()).filter(Boolean)
    : ALLOWED_INDUSTRIES;

  const excludeOther =
    !options.industry || !requestedIndustries.includes('Other');

  companies = companies.filter((c) => {
    if (!requestedIndustries.includes(c.industry)) return false;
    if (excludeOther && c.industry === 'Other') return false;
    return true;
  });

  logger.info(
    `Company discovery: ${companies.length} companies to probe ` +
      `(filtered by industry: ${requestedIndustries.join(', ')})`
  );

  if (options.dryRun) {
    companies.forEach((c) =>
      logger.info(`  [DRY RUN] ${c.name} (${c.industry})`)
    );
    return;
  }

  const client = createHttpClient('company-discovery');
  let discovered = 0;
  let alreadyExists = 0;
  let notFound = 0;

  for (let i = 0; i < companies.length; i++) {
    const company = companies[i];
    const slug = slugify(company.name);

    logger.info(
      `[${i + 1}/${companies.length}] Probing ${company.name} (${company.industry})...`
    );

    const candidateSlugs = [slug, ...buildAltSlugs(company.name, slug)];

    let found: { atsType: AtsType; careerUrl: string; matchedSlug: string } | null =
      null;

    for (const candidateSlug of candidateSlugs) {
      for (const probe of ATS_PROBES) {
        if (await isAlreadyRegistered(candidateSlug, probe.atsType)) {
          alreadyExists++;
          logger.debug(
            `  ${company.name} already registered (${probe.atsType}, slug: ${candidateSlug})`
          );
          found = { atsType: probe.atsType, careerUrl: '', matchedSlug: candidateSlug };
          break;
        }
      }
      if (found) break;

      const result = await probeATS(client, candidateSlug);
      if (result) {
        found = {
          atsType: result.atsType,
          careerUrl: result.careerUrl,
          matchedSlug: candidateSlug,
        };
        break;
      }
    }

    if (!found) {
      notFound++;
      logger.debug(`  ${company.name}: no ATS board found`);
      continue;
    }

    if (found.careerUrl === '') {
      // already exists — counted above
      continue;
    }

    await registerCompany(found.matchedSlug, company.name, found.atsType, found.careerUrl);
    discovered++;
  }

  logger.info(`\nCompany discovery complete:`);
  logger.info(`  Discovered: ${discovered}`);
  logger.info(`  Already registered: ${alreadyExists}`);
  logger.info(`  Not found: ${notFound}`);
  logger.info(`  Total probed: ${companies.length}`);
}