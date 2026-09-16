import { loadProfileConfig } from './pre-filter';

export interface ScoreBreakdown {
  roleScore: number;
  remoteScore: number;
  seniorityScore: number;
  domainScore: number;
  aiProductScore: number;
  matchReasons: string[];
  rejectionReasons: string[];
  shortExplanation: string;
}

const DEFAULT_AI_KEYWORDS = [
  'ai', 'artificial intelligence', 'llm', 'machine learning', 'ml', 'nlp', 'gpt',
  'generative', 'deep learning', 'neural', 'copilot', 'agentic', 'agents', 'technical product',
  'api', 'developer platform', 'sdk', 'infrastructure', 'cloud', 'analytics', 'data platform',
];

const DEFAULT_GLOBAL_INDICATORS = [
  'worldwide', 'global', 'anywhere', 'any location', 'international',
  'indonesia', 'apac', 'asia', 'southeast asia',
];

const DEFAULT_EXCLUSION_INDICATORS = [
  'us only', 'canada only', 'uk only', 'europe only', 'eu only', 'emea only',
  'north america only', 'americas only', 'us citizen', 'work authorization',
];

function buildRegex(words: string[]): RegExp {
  const escaped = words.map((w) => w.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'));
  return new RegExp(`\\b(?:${escaped.join('|')})\\b`, 'i');
}

function normalizeTitle(title: string, aliases: Record<string, string[]> | undefined): string {
  if (!aliases) return title;
  let result = title;
  for (const [canonical, variants] of Object.entries(aliases)) {
    for (const variant of variants) {
      const regex = new RegExp(`\\b${variant.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')}\\b`, 'gi');
      result = result.replace(regex, canonical);
    }
  }
  return result;
}

export async function evaluateJobLocally(job: {
  title: string;
  company: string;
  location?: string | null;
  description?: string | null;
  salary?: string | null;
}): Promise<ScoreBreakdown | null> {
  const config = loadProfileConfig();

  const rawTitleLower = job.title.toLowerCase();
  const titleLower = normalizeTitle(rawTitleLower, config.preferences.title_aliases);
  const locationLower = (job.location || '').toLowerCase();
  const descLower = (job.description || '').toLowerCase();
  const salaryLower = (job.salary || '').toLowerCase();
  const textToSearch = `${titleLower} ${locationLower} ${descLower}`;

  const matchReasons: string[] = [];
  const rejectionReasons: string[] = [];

  // 1. Role Match (max config.scoring_weights.roleMatch, default 30)
  let roleScore = 0;
  const maxRoleMatch = config.scoring_weights.roleMatch;
  const pmRegex = /\bpm\b/i;
  if (titleLower.includes('product manager') || pmRegex.test(titleLower) || titleLower.includes('prod mgr')) {
    roleScore = maxRoleMatch;
    matchReasons.push('Role matches Product Manager');
  } else if (titleLower.includes('product owner') || titleLower.includes('product lead')) {
    roleScore = Math.round(maxRoleMatch * 0.8);
    matchReasons.push('Role matches Product Owner / Lead Product');
  } else if (titleLower.includes('director of product') || titleLower.includes('head of product') || titleLower.includes('vp of product')) {
    roleScore = Math.round(maxRoleMatch * 0.9);
    matchReasons.push('Role matches Leadership Product (Director/Head/VP)');
  } else if (titleLower.includes('product')) {
    roleScore = Math.round(maxRoleMatch * 0.5);
    matchReasons.push('Role contains "Product" but is not explicitly Product Manager');
  } else {
    rejectionReasons.push('Job title does not clearly match a Product Management role');
  }

  // 2. Remote Eligibility (max config.scoring_weights.remoteEligibilityForIndonesia, default 25)
  let remoteScore = 0;
  const maxRemoteScore = config.scoring_weights.remoteEligibilityForIndonesia;
  const exclusionWords = config.preferences.exclusion_indicators ?? DEFAULT_EXCLUSION_INDICATORS;
  const globalWords = config.preferences.global_indicators ?? DEFAULT_GLOBAL_INDICATORS;
  const restrictedPatterns = config.preferences.restricted_location_patterns ?? [];
  const excludesIndo = buildRegex(exclusionWords);
  const explicitlyGlobal = buildRegex(globalWords);

  // Build a regex for restricted location patterns (city/country names that indicate location-locked roles)
  const restrictedRegex = restrictedPatterns.length > 0
    ? new RegExp(`(?:${restrictedPatterns.map((p) => p.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')).join('|')})`, 'i')
    : null;

  const isLocationRestricted = restrictedRegex !== null && restrictedRegex.test(locationLower);
  const locationIsGenuinelyGlobal = explicitlyGlobal.test(locationLower);
  const locationIsJustRemote = /\bremote\b/i.test(locationLower) && !locationIsGenuinelyGlobal;

  if (excludesIndo.test(textToSearch)) {
    remoteScore = 0;
    rejectionReasons.push('Strict geographic restrictions or work authorization (US/EU/Canada only)');
  } else if (isLocationRestricted) {
    // Location names a specific city/country — this is NOT globally remote even if the description says "worldwide"
    remoteScore = Math.round(maxRemoteScore * 0.2);
    rejectionReasons.push(`Location "${job.location}" indicates a region-locked role, not globally remote`);
  } else if (locationIsGenuinelyGlobal) {
    remoteScore = maxRemoteScore;
    matchReasons.push('Location is explicitly open to Worldwide, APAC, or Indonesia remote candidates');
  } else if (locationIsJustRemote || (locationLower === '' && explicitlyGlobal.test(descLower))) {
    // "Remote" with no region qualifier, or empty location but description says worldwide
    remoteScore = Math.round(maxRemoteScore * 0.7);
    matchReasons.push('Job is listed as remote but region criteria is not explicitly stated');
  } else if (descLower.includes('remote friendly') || descLower.includes('remote work')) {
    remoteScore = Math.round(maxRemoteScore * 0.7);
    matchReasons.push('Job is listed as remote but region criteria is not explicitly stated');
  } else {
    remoteScore = Math.round(maxRemoteScore * 0.2);
    rejectionReasons.push('No explicit worldwide or region-free remote availability found');
  }

  // 3. Seniority Match (max config.scoring_weights.seniorityMatch, default 15)
  let seniorityScore = 0;
  const maxSeniorityMatch = config.scoring_weights.seniorityMatch;
  const isSenior = /senior|sr\.|lead|principal|director|head|vp|staff/i.test(titleLower);
  const isJunior = /junior|jr\.|associate|intern|entry/i.test(titleLower);

  if (isSenior) {
    seniorityScore = maxSeniorityMatch;
    matchReasons.push('Seniority matches target profile (Senior/Lead/Leadership)');
  } else if (isJunior) {
    seniorityScore = 0;
    rejectionReasons.push('Seniority matches Junior/Associate/Intern (exclusionary)');
  } else {
    const expMatch = descLower.match(/(\d+)\+?\s*(?:years|yrs)\s*(?:of)?\s*(?:experience|exp)/i);
    if (expMatch) {
      const years = parseInt(expMatch[1]);
      if (years >= 5) {
        seniorityScore = maxSeniorityMatch;
        matchReasons.push(`Requires ${years}+ years of experience, indicating senior level`);
      } else if (years >= 2) {
        seniorityScore = Math.round(maxSeniorityMatch * 0.6);
        matchReasons.push(`Requires ${years} years of experience (mid-level)`);
      } else {
        seniorityScore = Math.round(maxSeniorityMatch * 0.2);
        rejectionReasons.push('Low experience requirement (junior level)');
      }
    } else {
      seniorityScore = Math.round(maxSeniorityMatch * 0.7);
      matchReasons.push('Mid-level or unspecified seniority');
    }
  }

  // 4. Domain Match (max config.scoring_weights.domainMatch, default 15)
  let domainScore = 0;
  const maxDomainMatch = config.scoring_weights.domainMatch;
  const matchedDomains: string[] = [];

  for (const domain of config.preferences.domains) {
    const cleanDomain = domain.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
    const regex = new RegExp(`\\b${cleanDomain}\\b`, 'i');
    if (regex.test(textToSearch)) {
      matchedDomains.push(domain);
    }
  }

  if (matchedDomains.length > 0) {
    domainScore = Math.min(
      maxDomainMatch,
      matchedDomains.length * 5 + 5
    );
    matchReasons.push(`Matches preferred domain(s): ${matchedDomains.join(', ')}`);
  } else {
    domainScore = 0;
    rejectionReasons.push('Does not match target domains (SaaS/FinTech)');
  }

  // 4b. Anti-Domain Penalty
  const antiDomains = config.preferences.anti_domains ?? [];
  const matchedAntiDomains: string[] = [];
  for (const domain of antiDomains) {
    const cleanDomain = domain.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
    const regex = new RegExp(`\\b${cleanDomain}\\b`, 'i');
    if (regex.test(textToSearch)) {
      matchedAntiDomains.push(domain);
    }
  }
  if (matchedAntiDomains.length > 0) {
    const penalty = Math.min(domainScore, matchedAntiDomains.length * 3);
    domainScore -= penalty;
    rejectionReasons.push(`Matches anti-domain(s): ${matchedAntiDomains.join(', ')} (-${penalty} points)`);
  }

  // 5. AI/Technical Relevance (max config.scoring_weights.aiOrTechnicalProductRelevance, default 10)
  let aiProductScore = 0;
  const maxTechScore = config.scoring_weights.aiOrTechnicalProductRelevance;
  const aiKeywords = config.preferences.ai_keywords ?? DEFAULT_AI_KEYWORDS;

  const matchedTech: string[] = [];
  for (const word of aiKeywords) {
    const regex = new RegExp(`\\b${word}\\b`, 'i');
    if (regex.test(textToSearch)) {
      matchedTech.push(word);
    }
  }

  if (matchedTech.length > 0) {
    aiProductScore = Math.min(
      maxTechScore,
      matchedTech.length * 3 + 4
    );
    matchReasons.push(`Has AI or technical relevance: matching ${matchedTech.slice(0, 3).join(', ')}`);
  } else {
    aiProductScore = 0;
  }

  // 5b. Salary Signal
  if (salaryLower) {
    aiProductScore = Math.min(maxTechScore, aiProductScore + 2);
    matchReasons.push('Salary range is disclosed');
    const salaryMatch = salaryLower.match(/(\d+)\s*k/i);
    if (salaryMatch && parseInt(salaryMatch[1]) < 50) {
      rejectionReasons.push('Low salary band detected (under 50k)');
    }
  }

  const totalSubScore = roleScore + remoteScore + seniorityScore + domainScore + aiProductScore;
  const shortExplanation = `Locally scored ${totalSubScore}/95 based on keyword matching: Role (${roleScore}), Remote (${remoteScore}), Seniority (${seniorityScore}), Domain (${domainScore}), and Tech/AI (${aiProductScore}).`;

  return {
    roleScore,
    remoteScore,
    seniorityScore,
    domainScore,
    aiProductScore,
    matchReasons,
    rejectionReasons,
    shortExplanation,
  };
}