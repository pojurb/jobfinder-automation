import { loadProfileConfig } from './pre-filter';
import { logger } from '../utils/logger';

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

export async function evaluateJobWithGemini(job: {
  title: string;
  company: string;
  location?: string | null;
  description?: string | null;
}): Promise<ScoreBreakdown | null> {
  const config = loadProfileConfig();

  const titleLower = job.title.toLowerCase();
  const locationLower = (job.location || '').toLowerCase();
  const descLower = (job.description || '').toLowerCase();
  const textToSearch = `${titleLower} ${locationLower} ${descLower}`;

  const matchReasons: string[] = [];
  const rejectionReasons: string[] = [];

  // 1. Role Match (max config.scoring_weights.roleMatch, default 30)
  let roleScore = 0;
  const maxRoleMatch = config.scoring_weights.roleMatch;
  if (titleLower.includes('product manager') || titleLower.includes('pm') || titleLower.includes('prod mgr')) {
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
  const excludesIndo = /us only|canada only|uk only|europe only|eu only|emea only|north america only|americas only|us citizen|work authorization/i;
  const explicitlyGlobal = /worldwide|global|anywhere|any location|international|indonesia|apac|asia|southeast asia/i;

  if (excludesIndo.test(textToSearch)) {
    remoteScore = 0;
    rejectionReasons.push('Strict geographic restrictions or work authorization (US/EU/Canada only)');
  } else if (explicitlyGlobal.test(textToSearch) || explicitlyGlobal.test(locationLower)) {
    remoteScore = maxRemoteScore;
    matchReasons.push('Job is explicitly open to Worldwide, APAC, or Indonesia remote candidates');
  } else if (locationLower.includes('remote') || descLower.includes('remote friendly') || descLower.includes('remote work')) {
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
    // Check years of experience in the description
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
      // Default to mid-level score if not specified
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

  // 5. AI/Technical Relevance (max config.scoring_weights.aiOrTechnicalProductRelevance, default 10)
  let aiProductScore = 0;
  const maxTechScore = config.scoring_weights.aiOrTechnicalProductRelevance;
  const aiKeywords = [
    'ai', 'artificial intelligence', 'llm', 'machine learning', 'ml', 'nlp', 'gpt',
    'generative', 'deep learning', 'neural', 'copilot', 'agentic', 'agents', 'technical product',
    'api', 'developer platform', 'sdk', 'infrastructure', 'cloud', 'analytics', 'data platform'
  ];

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

  const shortExplanation = `Locally scored ${roleScore + remoteScore + seniorityScore + domainScore + aiProductScore}/95 based on keyword matching: Role (${roleScore}), Remote (${remoteScore}), Seniority (${seniorityScore}), Domain (${domainScore}), and Tech/AI (${aiProductScore}).`;

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

