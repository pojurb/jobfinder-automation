import { readFileSync } from 'fs';
import { parse } from 'yaml';
import { logger } from '../utils/logger';
import { getProfileConfigPath } from '../utils/paths';

export interface ProfileConfig {
  role: string;
  location: string;
  scoring_weights: {
    roleMatch: number;
    remoteEligibilityForIndonesia: number;
    seniorityMatch: number;
    domainMatch: number;
    aiOrTechnicalProductRelevance: number;
    freshness: number;
  };
  preferences: {
    domains: string[];
    anti_domains?: string[];
    ai_keywords?: string[];
    global_indicators?: string[];
    exclusion_indicators?: string[];
    restricted_location_patterns?: string[];
    title_aliases?: Record<string, string[]>;
  };
  hard_rejects: {
    locations_only: string[];
    work_types: string[];
    seniorities: string[];
  };
}

let profileConfig: ProfileConfig | null = null;

export function loadProfileConfig(): ProfileConfig {
  if (profileConfig) return profileConfig;
  
  try {
    const configPath = getProfileConfigPath();
    const configFile = readFileSync(configPath, 'utf-8');
    profileConfig = parse(configFile) as ProfileConfig;
    return profileConfig;
  } catch (error) {
    logger.error(`Failed to load config/profile.yaml: ${(error as Error).message}`);
    throw error;
  }
}

/**
 * Checks a job against hard-reject rules.
 * Returns a rejection reason string if a rule is hit, or null if it passes.
 */
export function evaluateHardRejects(job: { title: string; location?: string | null; description?: string | null }): string | null {
  const config = loadProfileConfig();
  
  const searchCorpus = [
    job.title.toLowerCase(),
    (job.location || '').toLowerCase(),
    (job.description || '').toLowerCase()
  ].join(' ');

  // Check Locations
  for (const loc of config.hard_rejects.locations_only) {
    if (searchCorpus.includes(loc.toLowerCase())) {
      return `Hard Reject: Found exclusionary location keyword '${loc}'`;
    }
  }

  // Check Work Types (onsite, hybrid)
  for (const wt of config.hard_rejects.work_types) {
    if (searchCorpus.includes(wt.toLowerCase())) {
      return `Hard Reject: Non-remote work type '${wt}' detected`;
    }
  }

  // Check Seniority (junior, intern)
  for (const sen of config.hard_rejects.seniorities) {
    // Check title specifically first
    if (job.title.toLowerCase().includes(sen.toLowerCase())) {
      return `Hard Reject: Junior/Intern seniority '${sen}' detected in title`;
    }
  }

  return null;
}

/**
 * Calculates a freshness score based on the job's posting or fetch date.
 */
export function calculateFreshnessScore(dateString: Date | string | null, fallbackDate: Date): number {
  const dateToUse = dateString ? new Date(dateString) : fallbackDate;
  const daysOld = (new Date().getTime() - dateToUse.getTime()) / (1000 * 3600 * 24);

  if (daysOld < 3) return 5;
  if (daysOld < 7) return 3;
  if (daysOld < 14) return 1;
  return 0;
}
