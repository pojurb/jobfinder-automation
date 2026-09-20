import { db } from '../db';
import { companyCareerSources, discoveredCompanies, jobs, jobScores } from '../db/schema';
import { AtsType } from './ats-types';
import { logger } from '../utils/logger';
import { getReportsDir } from '../utils/paths';
import { normalizeCompanyName, normalizeCompanyNameFull, isInvalidCompanyName } from '../utils/normalize';
import { projectPath } from '../utils/paths';
import { eq, and, gte, desc } from 'drizzle-orm';
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';
import axios, { AxiosRequestConfig, AxiosResponse } from 'axios';
import { parse as parseYaml } from 'yaml';
import { z } from 'zod';

// Re-export normalization helpers for convenience
export { normalizeCompanyName, isInvalidCompanyName };

export type ConfidenceLevel = 'high' | 'medium' | 'none';
export type ResolutionStatus = 'resolved' | 'unresolved';

export interface CandidateCompany {
  companyDisplay: string;
  companyNorm: string;
  bestScore: number;
  bestJobTitle: string;
  /** Suffix-preserving normalized name; derived from companyDisplay when omitted. */
  companyNormFull?: string;
  /** Titles/locations we already hold for this company in `jobs`, used to corroborate a board. */
  knownTitles?: string[];
  knownLocations?: string[];
}

export interface PostingLite {
  title: string;
  location: string | null;
}

export interface AtsProbeResult {
  atsType: AtsType;
  slug: string;
  boardUrl: string;
  returnedName: string | null;
  openJobsCount: number | null;
  /** Omitted when the payload was truncated or otherwise unknown. */
  postings?: PostingLite[];
}

export interface ResolutionEvidence {
  source: 'probe' | 'alias';
  boardName: string | null;
  matchedTitles: string[];
  matchedLocations: string[];
  productRoles: number;
  slugMatch?: 'full-name';
  openJobsCount?: number | null;
  /** For unresolved rows: the best board we looked at and why it was rejected. */
  rejectedBoard?: string;
  rejectedReason?: string;
}

export interface ProbedCompanyResult {
  companyDisplay: string;
  companyNorm: string;
  bestScore: number;
  bestJobTitle: string;
  method: 'slug-probe' | 'manual';
  atsType: AtsType | null;
  slug: string | null;
  boardUrl: string | null;
  confidence: ConfidenceLevel;
  status: ResolutionStatus;
  openJobsCount: number | null;
  evidence: ResolutionEvidence | null;
  /** True when a rate-limited host prevented a full check: "unknown", not "no match". Never persisted as unresolved. */
  inconclusive?: boolean;
}

export const GENERIC_SLUGS = new Set([
  'remote',
  'work',
  'team',
  'jobs',
  'careers',
  'apply',
  'hiring',
  'talent',
  'tech',
  'software',
  'dev',
  'engineering',
  'global',
  'cloud',
  'data',
  'consulting',
  'digital',
  'media',
  'solutions',
  'services',
  'corp',
  'group',
  'holdings',
  'company',
  'hr',
  'recruiting',
  'recruitment',
  'people',
  'staffing',
  'partners',
  'international',
]);

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

/**
 * Generate slug variants:
 * 1. Compact: "acmecorp"
 * 2. Hyphenated: "acme-corp"
 * 3. First word only: ONLY if it is >= 5 chars
 */
export function generateSlugVariants(companyNorm: string): string[] {
  if (!companyNorm || typeof companyNorm !== 'string') return [];

  const clean = companyNorm.toLowerCase().replace(/[^a-z0-9\s-]/g, ' ').trim();
  const words = clean.split(/[\s-]+/).filter(Boolean);
  if (words.length === 0) return [];

  const compact = words.join('');
  const hyphenated = words.join('-');

  const variants: string[] = [];

  // 1. Compact variant
  if (compact.length > 0) {
    variants.push(compact);
  }

  // 2. Hyphenated variant (if distinct from compact)
  if (hyphenated.length > 0 && hyphenated !== compact) {
    variants.push(hyphenated);
  }

  // 3. First word only ONLY if it is >= 5 chars
  const firstWord = words[0];
  if (firstWord.length >= 5 && firstWord !== compact && firstWord !== hyphenated) {
    variants.push(firstWord);
  }

  return variants;
}

/**
 * Checks if a slug variant equals the full normalized company name
 * (either compact or hyphenated).
 */
export function isFullCompanySlug(slug: string, companyNorm: string): boolean {
  const normClean = companyNorm.toLowerCase().replace(/[^a-z0-9\s-]/g, '').trim();
  const compact = normClean.replace(/[\s-]+/g, '');
  const hyphenated = normClean.replace(/\s+/g, '-');
  const slugClean = slug.toLowerCase().trim();
  return slugClean === compact || slugClean === hyphenated;
}

export interface ConfidenceParams {
  companyNorm: string;
  slugVariant: string;
  returnedName: string | null;
  openJobsCount: number | null; // null means unknown (e.g. Ashby >5MB)
}

/**
 * Classify confidence based on platform response and slug variant:
 * - high: platform returns a board/company name whose normalized form equals companyNorm AND >= 1 posting
 * - medium: no name available (lever, ashby) but slug variant equals full normalized company name AND >= 1 posting
 * - none: otherwise (mismatch, first-word-only, 0 postings, or collides with generic words)
 */
export function classifyConfidence(params: ConfidenceParams): ConfidenceLevel {
  const { companyNorm, slugVariant, returnedName, openJobsCount } = params;

  // Collision with generic words
  if (GENERIC_SLUGS.has(slugVariant.toLowerCase())) {
    return 'none';
  }

  // Postings check: must have at least 1 posting (null = unknown from truncated response, treated as exists)
  const hasPostings = openJobsCount === null || openJobsCount >= 1;
  if (!hasPostings) {
    return 'none';
  }

  // High confidence rule: name returned matches companyNorm
  if (returnedName) {
    const returnedNorm = normalizeCompanyName(returnedName);
    if (returnedNorm === companyNorm) {
      return 'high';
    }
    // If name is returned but does not match, reject
    return 'none';
  }

  // Medium confidence rule: no name returned, but slug variant is the full company name
  if (isFullCompanySlug(slugVariant, companyNorm)) {
    return 'medium';
  }

  return 'none';
}

// ─── Corroboration evidence ──────────────────────────────────────────────────
// A matching board NAME is not proof of the same company ("numi" the London
// startup vs "Nūmi" the French biotech). A board is only trusted when its
// postings also line up with what we already know about the company.

// Seniority/level words carry no identity ("Senior PM" ~ "PM").
const TITLE_STOPWORDS = new Set([
  'senior', 'sr', 'lead', 'staff', 'principal', 'junior', 'jr',
  'i', 'ii', 'iii', 'iv', 'associate', 'head', 'director',
]);

// Placeholders from the spec, plus generic geo words so "United States" and
// "United Kingdom" do not match each other on the shared word "united".
const LOCATION_STOPWORDS = new Set([
  'remote', 'anywhere', 'worldwide', 'hybrid', 'onsite', 'on', 'site',
  'united', 'area', 'greater', 'region', 'metropolitan', 'province', 'city',
  'of', 'the', 'and', 'in',
]);

function stripAccents(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

export function normalizeTitleForOverlap(title: string): string[] {
  if (!title || typeof title !== 'string') return [];
  const tokens = stripAccents(title)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((t) => t && !TITLE_STOPWORDS.has(t));
  return Array.from(new Set(tokens));
}

export function titleJaccardOverlap(a: string, b: string): number {
  const setA = new Set(normalizeTitleForOverlap(a));
  const setB = new Set(normalizeTitleForOverlap(b));
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  for (const token of setA) if (setB.has(token)) intersection++;
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

export function titleMatches(candidateTitle: string, knownTitles: string[]): boolean {
  const candidate = normalizeTitleForOverlap(candidateTitle);
  if (candidate.length === 0) return false;
  return knownTitles.some((known) => {
    const other = normalizeTitleForOverlap(known);
    if (other.length === 0) return false;
    const sameSet = candidate.length === other.length && candidate.every((t) => other.includes(t));
    return sameSet || titleJaccardOverlap(candidateTitle, known) >= 0.6;
  });
}

export function normalizeLocationForOverlap(location: string): string[] {
  if (!location || typeof location !== 'string') return [];
  const tokens = stripAccents(location)
    .toLowerCase()
    .replace(/united kingdom|great britain|england/g, 'uk')
    .replace(/united states( of america)?|\busa\b/g, 'us')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((t) => t && !LOCATION_STOPWORDS.has(t));
  return Array.from(new Set(tokens));
}

export function locationMatches(candidateLocation: string | null, knownLocations: string[]): boolean {
  if (!candidateLocation) return false;
  const candidate = normalizeLocationForOverlap(candidateLocation);
  if (candidate.length === 0) return false;
  return knownLocations.some((known) => {
    const other = normalizeLocationForOverlap(known);
    return other.some((token) => candidate.includes(token));
  });
}

export function countProductRoles(postings: Array<{ title: string }>): number {
  // \bproducts?\b: "Head of Production" must not count as a product role.
  return postings.filter((p) => /\bproducts?\b/i.test(p.title) && /\b(manager|owner|lead|head|director)\b/i.test(p.title)).length;
}

/**
 * A board name counts as the same company when the full (suffix-preserving)
 * names are equal, or when only the BOARD carries an extra suffix
 * ("Reddit, Inc." for a company we stored as "Reddit"). Never the other way
 * round: a company stored as "FUSE GROUP" cannot be satisfied by "fuse".
 */
export function boardNameMatchesCompany(
  returnedName: string,
  company: { companyNorm: string; companyNormFull: string }
): boolean {
  const returnedFull = normalizeCompanyNameFull(returnedName);
  if (returnedFull === company.companyNormFull) return true;
  const companyKeptAllWords = company.companyNorm === company.companyNormFull;
  return companyKeptAllWords && normalizeCompanyName(returnedName) === company.companyNorm;
}

export interface EvidenceParams {
  companyNorm: string;
  companyNormFull: string;
  slugVariant: string;
  returnedName: string | null;
  openJobsCount: number | null; // null = unknown (truncated payload)
  postings?: PostingLite[];
  knownTitles: string[];
  knownLocations: string[];
}

export interface EvidenceAssessment {
  confidence: ConfidenceLevel;
  evidence: ResolutionEvidence;
}

/**
 * Confidence with corroboration:
 * - high   = name match AND a board posting whose title matches a title we know for this company
 * - medium = (name match AND a location match AND >= 1 product role) OR
 *            (slug equals the FULL name, suffixes intact, AND >= 1 product role)
 * - none   = everything else, even when the name superficially matches.
 * With nothing known about the company, `high` is unreachable.
 */
export function assessBoardWithEvidence(params: EvidenceParams): EvidenceAssessment {
  const postings = params.postings ?? [];
  const matchedTitles = Array.from(
    new Set(postings.filter((p) => titleMatches(p.title, params.knownTitles)).map((p) => p.title))
  );
  const matchedLocations = Array.from(
    new Set(
      postings
        .filter((p) => p.location && locationMatches(p.location, params.knownLocations))
        .map((p) => p.location as string)
    )
  );
  const productRoles = countProductRoles(postings);

  const evidence: ResolutionEvidence = {
    source: 'probe',
    boardName: params.returnedName,
    matchedTitles: matchedTitles.slice(0, 5),
    matchedLocations: matchedLocations.slice(0, 5),
    productRoles,
    openJobsCount: params.openJobsCount,
  };
  const reject = (reason: string): EvidenceAssessment => {
    evidence.rejectedReason = reason;
    return { confidence: 'none', evidence };
  };

  if (GENERIC_SLUGS.has(params.slugVariant.toLowerCase())) return reject('slug is a generic word');
  if (params.openJobsCount !== null && params.openJobsCount < 1) return reject('board has no postings');
  if (params.postings === undefined) return reject('postings unavailable (truncated); needs a manual alias');

  const companyName = { companyNorm: params.companyNorm, companyNormFull: params.companyNormFull };
  if (params.returnedName && !boardNameMatchesCompany(params.returnedName, companyName)) {
    return reject(`board name "${params.returnedName}" does not match`);
  }
  const nameMatch = Boolean(params.returnedName);
  const fullSlug = isFullCompanySlug(params.slugVariant, params.companyNormFull);

  if (nameMatch && matchedTitles.length > 0) return { confidence: 'high', evidence };

  if ((nameMatch && matchedLocations.length > 0 && productRoles >= 1) || (fullSlug && productRoles >= 1)) {
    if (fullSlug && !(nameMatch && matchedLocations.length > 0)) evidence.slugMatch = 'full-name';
    return { confidence: 'medium', evidence };
  }

  return reject(
    productRoles === 0 && matchedTitles.length === 0 && matchedLocations.length === 0
      ? 'no title/location overlap and no product roles on this board'
      : 'not enough corroboration (need a title match, or location + product role, or full-name slug + product role)'
  );
}

/**
 * Host-based rate limiter to ensure >= minIntervalMs between requests to each host.
 */
class HostRateLimiter {
  private lastRequestByHost = new Map<string, number>();
  private readonly minIntervalMs: number;

  constructor(minIntervalMs = 500) {
    this.minIntervalMs = minIntervalMs;
  }

  async throttle(host: string): Promise<void> {
    const now = Date.now();
    const last = this.lastRequestByHost.get(host) || 0;
    const elapsed = now - last;
    if (elapsed < this.minIntervalMs) {
      await new Promise((resolve) => setTimeout(resolve, this.minIntervalMs - elapsed));
    }
    this.lastRequestByHost.set(host, Date.now());
  }
}

const hostLimiter = new HostRateLimiter(500);

// Hosts that asked us to wait longer than MAX_RETRY_DELAY_MS (e.g. a daily quota):
// stop calling them for the rest of the run instead of burning more of their quota.
const blockedHosts = new Set<string>();

export type HttpRequester = (
  url: string,
  config?: AxiosRequestConfig
) => Promise<{ status: number; data: any; truncated?: boolean; rateLimited?: boolean } | null>;

/** Longest single wait we accept before giving up on a rate-limited URL. */
export const MAX_RETRY_DELAY_MS = 30_000;

/**
 * Delay before retrying a 429: the Retry-After header (seconds or HTTP date)
 * when present, otherwise exponential backoff (2s, 4s). Not capped here.
 */
export function computeRetryDelayMs(
  retryAfterHeader: string | undefined,
  attempt: number,
  now: number = Date.now()
): number {
  let delayMs = Math.pow(2, attempt) * 1000;
  if (retryAfterHeader) {
    const seconds = Number(retryAfterHeader);
    if (!isNaN(seconds) && seconds > 0) {
      delayMs = seconds * 1000;
    } else {
      const parsedDate = Date.parse(retryAfterHeader);
      if (!isNaN(parsedDate) && parsedDate > now) {
        delayMs = parsedDate - now;
      }
    }
  }
  return delayMs;
}

/**
 * Default HTTP requester with host rate-limiting, retry logic (max 2 retries),
 * 10s timeout, and Retry-After header handling.
 */
export const defaultHttpRequester: HttpRequester = async (url, config = {}) => {
  const maxRetries = 2;
  const timeout = 10000;
  const urlObj = new URL(url);
  const host = urlObj.hostname;

  if (blockedHosts.has(host)) {
    return { status: 429, data: null, rateLimited: true };
  }

  let attempt = 0;
  while (attempt <= maxRetries) {
    await hostLimiter.throttle(host);

    try {
      const response: AxiosResponse = await axios.get(url, {
        timeout,
        headers: {
          'User-Agent': USER_AGENT,
          Accept: 'application/json',
          ...config.headers,
        },
        maxContentLength: config.maxContentLength,
        maxBodyLength: config.maxBodyLength,
        validateStatus: (status) => (status >= 200 && status < 300) || status === 404,
      });

      return {
        status: response.status,
        data: response.data,
      };
    } catch (err: any) {
      // Check if response exceeded maxContentLength (Ashby > 5MB)
      if (
        config.maxContentLength &&
        (err?.message?.includes('maxContentLength') ||
          err?.code === 'ERR_BAD_RESPONSE')
      ) {
        return {
          status: 200,
          data: null,
          truncated: true,
        };
      }

      const status = err?.response?.status;
      if (status === 404) {
        return {
          status: 404,
          data: err.response.data,
        };
      }

      // 429 Rate limited -> honor Retry-After, but never wait longer than MAX_RETRY_DELAY_MS
      if (status === 429) {
        attempt++;
        if (attempt <= maxRetries) {
          const delayMs = computeRetryDelayMs(err.response?.headers?.['retry-after'], attempt);
          if (delayMs > MAX_RETRY_DELAY_MS) {
            // Some hosts answer with hours (e.g. a per-day quota). Skip this URL instead of stalling the run.
            logger.warn(
              `[career-resolver] ${host} asks to wait ${Math.round(delayMs / 1000)}s; skipping it for the rest of this run`
            );
            blockedHosts.add(host);
            return { status: 429, data: null, rateLimited: true };
          }
          logger.warn(`[career-resolver] 429 for ${url}, retrying in ${delayMs}ms (attempt ${attempt}/${maxRetries})`);
          await new Promise((resolve) => setTimeout(resolve, delayMs));
          continue;
        }
      }

      // 5xx Server error -> exponential backoff
      if (status >= 500 && status <= 599) {
        attempt++;
        if (attempt <= maxRetries) {
          const delayMs = Math.pow(2, attempt) * 1000;
          logger.warn(`[career-resolver] ${status} for ${url}, retrying in ${delayMs}ms (attempt ${attempt}/${maxRetries})`);
          await new Promise((resolve) => setTimeout(resolve, delayMs));
          continue;
        }
      }

      // Non-retryable error (DNS failure, connection reset, etc.)
      return null;
    }
  }

  return null;
};

// ─── ATS Probers ─────────────────────────────────────────────────────────────

export async function probeGreenhouse(
  slug: string,
  requester: HttpRequester = defaultHttpRequester
): Promise<AtsProbeResult | null> {
  const infoUrl = `https://boards-api.greenhouse.io/v1/boards/${slug}`;
  const res = await requester(infoUrl);
  if (!res || res.status !== 200 || !res.data) return null;

  const returnedName = typeof res.data.name === 'string' ? res.data.name : null;

  // Query jobs endpoint to obtain open_jobs_count
  const jobsUrl = `https://boards-api.greenhouse.io/v1/boards/${slug}/jobs`;
  const jobsRes = await requester(jobsUrl);
  let openJobsCount: number | null = null;
  let postings: PostingLite[] | undefined;
  if (jobsRes && jobsRes.status === 200 && Array.isArray(jobsRes.data?.jobs)) {
    openJobsCount = jobsRes.data.jobs.length;
    postings = jobsRes.data.jobs.map((j: any) => ({
      title: String(j?.title ?? ''),
      location: typeof j?.location?.name === 'string' ? j.location.name : null,
    }));
  } else if (jobsRes && jobsRes.status === 404) {
    openJobsCount = 0;
    postings = [];
  }

  return {
    atsType: 'greenhouse',
    slug,
    boardUrl: `https://boards.greenhouse.io/${slug}`,
    returnedName,
    openJobsCount,
    postings,
  };
}

export async function probeLever(
  slug: string,
  requester: HttpRequester = defaultHttpRequester
): Promise<AtsProbeResult | null> {
  const url = `https://api.lever.co/v0/postings/${slug}?mode=json`;
  const res = await requester(url);
  if (!res || res.status !== 200 || !Array.isArray(res.data)) return null;

  return {
    atsType: 'lever',
    slug,
    boardUrl: `https://jobs.lever.co/${slug}`,
    returnedName: null,
    openJobsCount: res.data.length,
    postings: res.data.map((j: any) => ({
      title: String(j?.text ?? ''),
      location: typeof j?.categories?.location === 'string' ? j.categories.location : null,
    })),
  };
}

export async function probeAshby(
  slug: string,
  requester: HttpRequester = defaultHttpRequester
): Promise<AtsProbeResult | null> {
  const url = `https://api.ashbyhq.com/posting-api/job-board/${slug}`;
  const res = await requester(url, {
    maxContentLength: 5 * 1024 * 1024, // 5MB cap
    maxBodyLength: 5 * 1024 * 1024,
  });
  if (!res || res.status !== 200) return null;

  if (res.truncated) {
    return {
      atsType: 'ashby',
      slug,
      boardUrl: `https://jobs.ashbyhq.com/${slug}`,
      returnedName: null,
      openJobsCount: null, // unknown due to truncated payload
    };
  }

  if (res.data && Array.isArray(res.data.jobs)) {
    return {
      atsType: 'ashby',
      slug,
      boardUrl: `https://jobs.ashbyhq.com/${slug}`,
      returnedName: null,
      openJobsCount: res.data.jobs.length,
      postings: res.data.jobs.map((j: any) => ({
        title: String(j?.title ?? ''),
        location: typeof j?.location === 'string' ? j.location : null,
      })),
    };
  }

  return null;
}

export async function probeWorkable(
  slug: string,
  requester: HttpRequester = defaultHttpRequester
): Promise<AtsProbeResult | null> {
  const url = `https://apply.workable.com/api/v1/widget/accounts/${slug}`;
  const res = await requester(url);
  if (!res || res.status !== 200 || !res.data) return null;

  const returnedName = typeof res.data.name === 'string' ? res.data.name : null;
  const rawJobs: any[] = Array.isArray(res.data.jobs) ? res.data.jobs : [];
  const openJobsCount = rawJobs.length;

  return {
    atsType: 'workable',
    slug,
    boardUrl: `https://apply.workable.com/${slug}`,
    returnedName,
    openJobsCount,
    postings: rawJobs.map((j) => ({
      title: String(j?.title ?? ''),
      location: [j?.city, j?.state, j?.country].filter(Boolean).join(', ') || null,
    })),
  };
}

export async function probeSmartRecruiters(
  slug: string,
  requester: HttpRequester = defaultHttpRequester
): Promise<AtsProbeResult | null> {
  const url = `https://api.smartrecruiters.com/v1/companies/${slug}/postings?limit=100`;
  const res = await requester(url);
  if (!res || res.status !== 200 || !res.data) return null;

  const totalFound = Number(res.data.totalFound);
  if (isNaN(totalFound) || totalFound <= 0) return null;

  const returnedName = res.data.content?.[0]?.company?.name || null;
  const content: any[] = Array.isArray(res.data.content) ? res.data.content : [];

  return {
    atsType: 'smartrecruiters',
    slug,
    boardUrl: `https://jobs.smartrecruiters.com/${slug}`,
    returnedName,
    openJobsCount: totalFound,
    // First page only (100); enough to corroborate a board.
    postings: content.map((j) => ({
      title: String(j?.name ?? ''),
      location:
        (typeof j?.location?.fullLocation === 'string' && j.location.fullLocation) ||
        [j?.location?.city, j?.location?.region, j?.location?.country].filter(Boolean).join(', ') ||
        null,
    })),
  };
}

export async function probeRecruitee(
  slug: string,
  requester: HttpRequester = defaultHttpRequester
): Promise<AtsProbeResult | null> {
  const url = `https://${slug}.recruitee.com/api/offers/`;
  const res = await requester(url);
  if (!res || res.status !== 200 || !res.data || res.data.error) return null;

  if (!Array.isArray(res.data.offers)) return null;

  const returnedName = res.data.offers[0]?.company_name || null;

  return {
    atsType: 'recruitee',
    slug,
    boardUrl: `https://${slug}.recruitee.com`,
    returnedName,
    openJobsCount: res.data.offers.length,
    // `location` is a placeholder ("Remote job"); city/state_name/country carry the real place.
    postings: res.data.offers.map((o: any) => ({
      title: String(o?.title ?? ''),
      location: [o?.city, o?.state_name, o?.country].filter(Boolean).join(', ') || null,
    })),
  };
}

const ATS_PROBERS: Array<(slug: string, requester: HttpRequester) => Promise<AtsProbeResult | null>> = [
  probeGreenhouse,
  probeLever,
  probeAshby,
  probeWorkable,
  probeSmartRecruiters,
  probeRecruitee,
];

const PROBER_BY_ATS: Record<string, (slug: string, requester: HttpRequester) => Promise<AtsProbeResult | null>> = {
  greenhouse: probeGreenhouse,
  lever: probeLever,
  ashby: probeAshby,
  workable: probeWorkable,
  smartrecruiters: probeSmartRecruiters,
  recruitee: probeRecruitee,
};

// ─── Manual aliases ──────────────────────────────────────────────────────────

const AliasFileSchema = z.object({
  aliases: z
    .record(
      z.string(),
      z.object({
        ats_type: z.enum(['greenhouse', 'lever', 'ashby', 'workable', 'smartrecruiters', 'recruitee']),
        slug: z.string().min(1),
      })
    )
    .default({}),
});

export type AliasMap = Record<string, { ats_type: string; slug: string }>;

export function parseCareerAliases(raw: string): AliasMap {
  try {
    const parsed = AliasFileSchema.safeParse(parseYaml(raw) ?? {});
    if (!parsed.success) {
      logger.warn(`[career-resolver] Invalid career-aliases.yaml, ignoring aliases: ${parsed.error.message}`);
      return {};
    }
    return parsed.data.aliases;
  } catch (err) {
    logger.warn(`[career-resolver] Could not parse career-aliases.yaml: ${(err as Error).message}`);
    return {};
  }
}

let cachedAliases: AliasMap | null = null;

export function loadCareerAliases(): AliasMap {
  if (cachedAliases) return cachedAliases;
  const path = projectPath('config', 'career-aliases.yaml');
  cachedAliases = existsSync(path) ? parseCareerAliases(readFileSync(path, 'utf-8')) : {};
  return cachedAliases;
}

export interface ProbeOptions {
  aliases?: AliasMap;
}

function unresolvedResult(
  company: CandidateCompany,
  evidence: ResolutionEvidence | null,
  inconclusive = false
): ProbedCompanyResult {
  const noteEvidence: ResolutionEvidence | null =
    evidence ??
    (inconclusive
      ? {
          source: 'probe',
          boardName: null,
          matchedTitles: [],
          matchedLocations: [],
          productRoles: 0,
          rejectedReason: 'inconclusive: a host rate-limited us; previous result kept',
        }
      : null);
  return {
    companyDisplay: company.companyDisplay,
    companyNorm: company.companyNorm,
    bestScore: company.bestScore,
    bestJobTitle: company.bestJobTitle,
    method: 'slug-probe',
    atsType: null,
    slug: null,
    boardUrl: null,
    confidence: 'none',
    status: 'unresolved',
    openJobsCount: null,
    evidence: noteEvidence,
    inconclusive,
  };
}

/**
 * Probe an individual company against all slug variants and ATS platforms.
 * A manual alias (config/career-aliases.yaml) skips slug guessing. Otherwise
 * stops at the first board that is corroborated by our own job data.
 */
export async function probeCompany(
  company: CandidateCompany,
  requester: HttpRequester = defaultHttpRequester,
  options: ProbeOptions = {}
): Promise<ProbedCompanyResult> {
  const aliases = options.aliases ?? loadCareerAliases();
  const alias = aliases[company.companyNorm];

  let rateLimited = false;
  const baseRequester = requester;
  requester = async (url, config) => {
    const res = await baseRequester(url, config);
    if (res?.rateLimited) rateLimited = true;
    return res;
  };

  if (alias) {
    const prober = PROBER_BY_ATS[alias.ats_type];
    const probeRes = prober ? await prober(alias.slug, requester).catch(() => null) : null;
    const live = probeRes && (probeRes.openJobsCount === null || probeRes.openJobsCount >= 1);
    if (probeRes && live) {
      return {
        companyDisplay: company.companyDisplay,
        companyNorm: company.companyNorm,
        bestScore: company.bestScore,
        bestJobTitle: company.bestJobTitle,
        method: 'manual',
        atsType: probeRes.atsType,
        slug: probeRes.slug,
        boardUrl: probeRes.boardUrl,
        confidence: 'high',
        status: 'resolved',
        openJobsCount: probeRes.openJobsCount,
        evidence: {
          source: 'alias',
          boardName: probeRes.returnedName,
          matchedTitles: [],
          matchedLocations: [],
          productRoles: probeRes.postings ? countProductRoles(probeRes.postings) : 0,
          openJobsCount: probeRes.openJobsCount,
        },
      };
    }
    return {
      ...unresolvedResult(company, {
        source: 'alias',
        boardName: null,
        matchedTitles: [],
        matchedLocations: [],
        productRoles: 0,
        rejectedBoard: `${alias.ats_type}:${alias.slug}`,
        rejectedReason: 'alias board did not respond with any postings',
      }),
      method: 'manual',
      inconclusive: rateLimited,
    };
  }

  const companyNormFull = company.companyNormFull ?? normalizeCompanyNameFull(company.companyDisplay);
  const knownTitles = company.knownTitles ?? [];
  const knownLocations = company.knownLocations ?? [];
  const variants = generateSlugVariants(company.companyNorm);
  let bestRejected: ResolutionEvidence | null = null;

  for (const variant of variants) {
    for (const prober of ATS_PROBERS) {
      try {
        const probeRes = await prober(variant, requester);
        if (!probeRes) continue;

        const assessment = assessBoardWithEvidence({
          companyNorm: company.companyNorm,
          companyNormFull,
          slugVariant: variant,
          returnedName: probeRes.returnedName,
          openJobsCount: probeRes.openJobsCount,
          postings: probeRes.postings,
          knownTitles,
          knownLocations,
        });

        if (assessment.confidence === 'high' || assessment.confidence === 'medium') {
          return {
            companyDisplay: company.companyDisplay,
            companyNorm: company.companyNorm,
            bestScore: company.bestScore,
            bestJobTitle: company.bestJobTitle,
            method: 'slug-probe',
            atsType: probeRes.atsType,
            slug: probeRes.slug,
            boardUrl: probeRes.boardUrl,
            confidence: assessment.confidence,
            status: 'resolved',
            openJobsCount: probeRes.openJobsCount,
            evidence: assessment.evidence,
          };
        }

        if (!bestRejected) {
          bestRejected = {
            ...assessment.evidence,
            rejectedBoard: `${probeRes.atsType}:${probeRes.slug}`,
          };
        }
      } catch (err) {
        // Continue to next probe
      }
    }
  }

  return unresolvedResult(company, bestRejected, rateLimited && !bestRejected);
}

/**
 * Query eligible candidates from database.
 */
export async function getCandidateCompanies(limit: number): Promise<CandidateCompany[]> {
  // 1. Get already registered companies in discovered_companies
  const discovered = await db
    .select({ name: discoveredCompanies.name, slug: discoveredCompanies.slug })
    .from(discoveredCompanies);

  const existingDiscovered = new Set<string>();
  for (const d of discovered) {
    if (d.name) {
      const norm = normalizeCompanyName(d.name);
      if (norm) existingDiscovered.add(norm);
    }
    if (d.slug) {
      const slugNorm = normalizeCompanyName(d.slug);
      if (slugNorm) existingDiscovered.add(slugNorm);
    }
  }

  // 2. Get already resolved/probed companies in company_career_sources
  const existingSources = await db
    .select({ companyNorm: companyCareerSources.companyNorm })
    .from(companyCareerSources);
  const existingSourceNorms = new Set(existingSources.map((s) => s.companyNorm));

  // 3. Query jobs joined to job_scores where is_junk = 0 and total_score >= 50
  const rows = await db
    .select({
      company: jobs.company,
      title: jobs.title,
      totalScore: jobScores.totalScore,
    })
    .from(jobs)
    .innerJoin(jobScores, eq(jobs.id, jobScores.jobId))
    .where(and(eq(jobs.isJunk, false), gte(jobScores.totalScore, 50)))
    .orderBy(desc(jobScores.totalScore));

  const candidateMap = new Map<string, CandidateCompany>();

  for (const row of rows) {
    if (isInvalidCompanyName(row.company)) continue;
    const norm = normalizeCompanyName(row.company);
    if (!norm || norm.length < 2) continue;

    if (existingDiscovered.has(norm)) continue;
    if (existingSourceNorms.has(norm)) continue;

    const score = row.totalScore ?? 0;
    const existing = candidateMap.get(norm);
    if (!existing) {
      candidateMap.set(norm, {
        companyDisplay: row.company,
        companyNorm: norm,
        bestScore: score,
        bestJobTitle: row.title,
      });
    } else if (score > existing.bestScore) {
      existing.bestScore = score;
      existing.bestJobTitle = row.title;
    }
  }

  return Array.from(candidateMap.values())
    .sort((a, b) => b.bestScore - a.bestScore)
    .slice(0, limit);
}

interface JobEvidenceIndex {
  titles: Map<string, string[]>;
  locations: Map<string, string[]>;
  best: Map<string, { display: string; score: number; title: string }>;
}

/** One read-only pass over `jobs` (is_junk = 0), grouped by normalized company name. */
async function buildJobEvidenceIndex(): Promise<JobEvidenceIndex> {
  const rows = await db
    .select({
      company: jobs.company,
      title: jobs.title,
      location: jobs.location,
      remoteRegion: jobs.remoteRegion,
      totalScore: jobScores.totalScore,
    })
    .from(jobs)
    .leftJoin(jobScores, eq(jobs.id, jobScores.jobId))
    .where(eq(jobs.isJunk, false));

  const index: JobEvidenceIndex = { titles: new Map(), locations: new Map(), best: new Map() };
  for (const row of rows) {
    if (isInvalidCompanyName(row.company)) continue;
    const norm = normalizeCompanyName(row.company);
    if (!norm) continue;

    const titles = index.titles.get(norm) ?? [];
    if (row.title) titles.push(row.title);
    index.titles.set(norm, titles);

    const locations = index.locations.get(norm) ?? [];
    for (const loc of [row.location, row.remoteRegion]) if (loc) locations.push(loc);
    index.locations.set(norm, locations);

    const score = row.totalScore ?? 0;
    const current = index.best.get(norm);
    if (!current || score > current.score) {
      index.best.set(norm, { display: row.company, score, title: row.title });
    }
  }
  return index;
}

/**
 * Titles and locations we already hold for a company (read-only on `jobs`),
 * matched with the same normalizeCompanyName() logic used elsewhere here.
 */
export async function getKnownJobEvidence(
  companyNorm: string
): Promise<{ titles: string[]; locations: string[] }> {
  const index = await buildJobEvidenceIndex();
  return {
    titles: index.titles.get(companyNorm) ?? [],
    locations: index.locations.get(companyNorm) ?? [],
  };
}

function attachEvidence(candidate: CandidateCompany, index: JobEvidenceIndex): CandidateCompany {
  return {
    ...candidate,
    companyNormFull: normalizeCompanyNameFull(candidate.companyDisplay),
    knownTitles: index.titles.get(candidate.companyNorm) ?? [],
    knownLocations: index.locations.get(candidate.companyNorm) ?? [],
  };
}

/**
 * --recheck: re-evaluate companies that are already in company_career_sources
 * (oldest first, so the original pilot batch comes back in the same order).
 */
export async function getRecheckCompanies(limit: number, index: JobEvidenceIndex): Promise<CandidateCompany[]> {
  const existing = await db
    .select({
      companyNorm: companyCareerSources.companyNorm,
      companyDisplay: companyCareerSources.companyDisplay,
    })
    .from(companyCareerSources)
    .orderBy(companyCareerSources.id)
    .limit(limit);

  return existing.map((row) => {
    const best = index.best.get(row.companyNorm);
    return {
      companyDisplay: row.companyDisplay,
      companyNorm: row.companyNorm,
      bestScore: best?.score ?? 0,
      bestJobTitle: best?.title ?? '',
    };
  });
}

/** Short, scannable evidence summary for the report table. */
export function summarizeEvidence(evidence: ResolutionEvidence | null): string {
  if (!evidence) return '-';
  const parts: string[] = [];
  if (evidence.source === 'alias') parts.push('alias');
  if (evidence.matchedTitles.length > 0) parts.push(`title:"${evidence.matchedTitles[0]}"`);
  if (evidence.matchedLocations.length > 0) parts.push(`loc:${evidence.matchedLocations[0]}`);
  if (evidence.slugMatch === 'full-name') parts.push('slug=full-name');
  if (evidence.productRoles > 0) parts.push(`product_roles=${evidence.productRoles}`);
  if (evidence.rejectedReason) parts.push(`rejected ${evidence.rejectedBoard ?? ''}: ${evidence.rejectedReason}`.trim());
  return parts.length > 0 ? parts.join('; ') : '-';
}

/**
 * Generate markdown report for career resolver results.
 */
export function generateReport(results: ProbedCompanyResult[], date: Date = new Date()): string {
  const dateStr = date.toISOString().split('T')[0];
  const total = results.length;
  const high = results.filter((r) => r.confidence === 'high').length;
  const medium = results.filter((r) => r.confidence === 'medium').length;
  const unresolved = results.filter((r) => r.status === 'unresolved').length;
  const hitRate = total > 0 ? (((high + medium) / total) * 100).toFixed(1) : '0.0';

  const lines: string[] = [];

  lines.push(`# Career Resolver Pilot Report - ${dateStr}`);
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push(`- **Total Probed**: ${total}`);
  lines.push(`- **Resolved (High Confidence)**: ${high}`);
  lines.push(`- **Resolved (Medium Confidence)**: ${medium}`);
  lines.push(`- **Unresolved (None)**: ${unresolved}`);
  const inconclusiveCount = results.filter((r) => r.inconclusive).length;
  if (inconclusiveCount > 0) {
    lines.push(`- **Inconclusive (rate limited, previous result kept, included in Unresolved above)**: ${inconclusiveCount}`);
  }
  lines.push(`- **Hit Rate**: ${hitRate}%`);
  lines.push('');
  lines.push('## All Probed Companies');
  lines.push('');
  lines.push('| Company | Method | ATS Type | Slug | Confidence | Open Jobs | Board URL | Evidence |');
  lines.push('|---|---|---|---|---|---|---|---|');

  for (const r of results) {
    const ats = r.atsType ?? '-';
    const slug = r.slug ?? '-';
    const jobsCount = r.openJobsCount !== null ? String(r.openJobsCount) : '-';
    const url = r.boardUrl ?? '-';
    lines.push(
      `| ${r.companyDisplay} | ${r.method} | ${ats} | ${slug} | ${r.confidence} | ${jobsCount} | ${url} | ${summarizeEvidence(r.evidence).replace(/\|/g, '/')} |`
    );
  }

  lines.push('');
  lines.push('## Unresolved Companies for Manual Follow-up');
  lines.push('');

  const unresolvedList = results.filter((r) => r.status === 'unresolved');
  if (unresolvedList.length === 0) {
    lines.push('_None. All probed companies were resolved!_');
  } else {
    lines.push('| Company | Best-Scoring Job Title | Score |');
    lines.push('|---|---|---|');
    for (const r of unresolvedList) {
      lines.push(`| ${r.companyDisplay} | ${r.bestJobTitle} | ${r.bestScore} |`);
    }
  }

  lines.push('');
  return lines.join('\n');
}

export interface CareerResolverOptions {
  limit?: number;
  dryRun?: boolean;
  /** Re-evaluate companies already in company_career_sources instead of picking new candidates. */
  recheck?: boolean;
}

/**
 * Main execution function for career resolver.
 */
export async function runCareerResolver(options: CareerResolverOptions = {}): Promise<ProbedCompanyResult[]> {
  const limit = options.limit ?? 50;
  const dryRun = Boolean(options.dryRun);
  const recheck = Boolean(options.recheck);

  logger.info(`\n🔍 STARTING CAREER RESOLVER (limit: ${limit}, dryRun: ${dryRun}, recheck: ${recheck})\n`);

  const evidenceIndex = await buildJobEvidenceIndex();
  const baseCandidates = recheck
    ? await getRecheckCompanies(limit, evidenceIndex)
    : await getCandidateCompanies(limit);
  const candidates = baseCandidates.map((c) => attachEvidence(c, evidenceIndex));
  logger.info(`Found ${candidates.length} candidate companies for resolution.\n`);

  if (candidates.length === 0) {
    logger.info('No candidate companies to resolve.');
    return [];
  }

  const results: ProbedCompanyResult[] = [];

  for (let i = 0; i < candidates.length; i++) {
    const candidate = candidates[i];
    const progress = `[${i + 1}/${candidates.length}]`;
    logger.info(`${progress} Probing ${candidate.companyDisplay} (norm: "${candidate.companyNorm}", bestScore: ${candidate.bestScore})...`);

    const result = await probeCompany(candidate);
    results.push(result);

    if (result.status === 'resolved') {
      logger.info(
        `  -> RESOLVED: ${result.atsType}:${result.slug} (confidence: ${result.confidence}, openJobs: ${result.openJobsCount ?? 'unknown'})`
      );
    } else {
      logger.info(`  -> UNRESOLVED`);
    }
  }

  // Calculate totals
  const total = results.length;
  const high = results.filter((r) => r.confidence === 'high').length;
  const medium = results.filter((r) => r.confidence === 'medium').length;
  const unresolved = results.filter((r) => r.status === 'unresolved').length;
  const hitRate = total > 0 ? (((high + medium) / total) * 100).toFixed(1) : '0.0';

  // Write to database if not dry-run
  if (!dryRun) {
    logger.info(`\nWriting ${results.length} records to company_career_sources...`);
    for (const r of results) {
      if (r.inconclusive) {
        logger.warn(`  Keeping previous result for ${r.companyDisplay}: check was inconclusive (rate limited).`);
        continue;
      }
      const row = {
        companyNorm: r.companyNorm,
        companyDisplay: r.companyDisplay,
        domain: null,
        atsType: r.atsType,
        slug: r.slug,
        boardUrl: r.boardUrl,
        method: r.method,
        confidence: r.confidence,
        status: r.status,
        openJobsCount: r.openJobsCount,
        evidence: r.evidence ? JSON.stringify(r.evidence) : null,
        lastCheckedAt: new Date(),
      };
      // Upsert on the unique company_norm key so a recheck updates rows instead of duplicating them.
      await db
        .insert(companyCareerSources)
        .values({ ...row, createdAt: new Date() })
        .onConflictDoUpdate({ target: companyCareerSources.companyNorm, set: row });
    }
    logger.info('Database write complete.');
  } else {
    logger.info('\n[DRY RUN] Skipping database write.');
  }

  // Generate and save markdown report
  const reportsDir = getReportsDir();
  if (!existsSync(reportsDir)) {
    mkdirSync(reportsDir, { recursive: true });
  }

  const dateStr = new Date().toISOString().split('T')[0];
  const reportContent = generateReport(results);
  // A recheck writes its own file so it never overwrites the original pilot report.
  const reportPath = join(reportsDir, `career-resolver-${dateStr}${recheck ? '-recheck' : ''}.md`);
  writeFileSync(reportPath, reportContent, 'utf-8');
  logger.info(`\nReport written to: ${reportPath}`);

  // Print results table to console
  console.log('\n' + '='.repeat(80));
  console.log(`CAREER RESOLVER SUMMARY`);
  console.log('='.repeat(80));
  console.log(`Total Probed: ${total}`);
  console.log(`Resolved High: ${high}`);
  console.log(`Resolved Medium: ${medium}`);
  console.log(`Unresolved: ${unresolved}`);
  console.log(`Inconclusive (kept previous result): ${results.filter((r) => r.inconclusive).length}`);
  console.log(`Hit Rate: ${hitRate}%\n`);

  console.log(
    'Company'.padEnd(28) +
      'ATS'.padEnd(16) +
      'Slug'.padEnd(20) +
      'Conf'.padEnd(10) +
      'Jobs'.padEnd(8) +
      'Status'
  );
  console.log('-'.repeat(88));

  for (const r of results) {
    const comp = r.companyDisplay.length > 26 ? r.companyDisplay.slice(0, 25) + '…' : r.companyDisplay;
    const ats = (r.atsType ?? '-').padEnd(16);
    const slug = ((r.slug ?? '-').length > 18 ? (r.slug ?? '-').slice(0, 17) + '…' : (r.slug ?? '-')).padEnd(20);
    const conf = r.confidence.padEnd(10);
    const jobsCount = (r.openJobsCount !== null ? String(r.openJobsCount) : '-').padEnd(8);
    const status = r.status;
    console.log(`${comp.padEnd(28)}${ats}${slug}${conf}${jobsCount}${status}`);
  }
  console.log('='.repeat(88) + '\n');

  return results;
}
