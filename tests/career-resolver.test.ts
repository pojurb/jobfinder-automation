import { describe, it, expect, vi } from 'vitest';
import {
  normalizeCompanyName,
  isInvalidCompanyName,
  generateSlugVariants,
  isFullCompanySlug,
  classifyConfidence,
  probeCompany,
  probeGreenhouse,
  probeLever,
  probeAshby,
  probeWorkable,
  probeSmartRecruiters,
  probeRecruitee,
  HttpRequester,
  CandidateCompany,
  normalizeTitleForOverlap,
  titleJaccardOverlap,
  titleMatches,
  normalizeLocationForOverlap,
  locationMatches,
  countProductRoles,
  boardNameMatchesCompany,
  assessBoardWithEvidence,
  parseCareerAliases,
  summarizeEvidence,
  computeRetryDelayMs,
  MAX_RETRY_DELAY_MS,
} from '../src/discovery/career-resolver';
import { normalizeCompanyNameFull } from '../src/utils/normalize';

describe('Career Resolver - Name Normalization', () => {
  it('lowercases and strips accents and punctuation', () => {
    expect(normalizeCompanyName('Café & Restaurant, Inc.')).toBe('cafe restaurant');
    expect(normalizeCompanyName('Stripe, Inc.')).toBe('stripe');
    expect(normalizeCompanyName('Twilio Inc')).toBe('twilio');
  });

  it('strips HTML entities', () => {
    expect(normalizeCompanyName('AT&amp;T')).toBe('at t');
    expect(normalizeCompanyName('Company&#x27;s Name')).toBe('company s name');
    expect(normalizeCompanyName('Tech &#x2F; Labs')).toBe('tech labs');
  });

  it('drops suffixes (pt, tbk, inc, ltd, llc, corp, co, group, holdings, indonesia) when trailing', () => {
    expect(normalizeCompanyName('Acme Corp')).toBe('acme');
    expect(normalizeCompanyName('Globex LLC')).toBe('globex');
    expect(normalizeCompanyName('Initech Ltd.')).toBe('initech');
    expect(normalizeCompanyName('Umbrella Co.')).toBe('umbrella');
    expect(normalizeCompanyName('Decile Group')).toBe('decile');
    expect(normalizeCompanyName('Tether Holdings')).toBe('tether');
    expect(normalizeCompanyName('Shopee Indonesia')).toBe('shopee');
    expect(normalizeCompanyName('Fintech PT')).toBe('fintech');
    expect(normalizeCompanyName('Bank Central Asia Tbk')).toBe('bank central asia');
  });

  it('handles Indonesian PT prefix and trailing suffixes together', () => {
    expect(normalizeCompanyName('PT Bank Sinarmas Tbk')).toBe('bank sinarmas');
    expect(normalizeCompanyName('PT. Trimegah Sekuritas Indonesia, Tbk')).toBe('trimegah sekuritas');
    expect(normalizeCompanyName('PT Telinco Networks Indonesia')).toBe('telinco networks');
    expect(normalizeCompanyName('PT X Tbk')).toBe('x');
  });

  it('does not drop standalone words if they are the entire name', () => {
    expect(normalizeCompanyName('Group')).toBe('group');
    expect(normalizeCompanyName('Indonesia')).toBe('indonesia');
    expect(normalizeCompanyName('PT')).toBe('pt');
  });

  it('identifies invalid company names', () => {
    // Longer than 60 chars
    const longName = 'A'.repeat(61);
    expect(isInvalidCompanyName(longName)).toBe(true);

    // Contains URLs
    expect(isInvalidCompanyName('Check out https://example.com for jobs')).toBe(true);
    expect(isInvalidCompanyName('www.acme.com/careers')).toBe(true);

    // Sentences and conversational text
    expect(isInvalidCompanyName('Hello. I am really interested in the role')).toBe(true);
    expect(isInvalidCompanyName('TrueAccord is hiring engineers (SF, KC)')).toBe(true);
    expect(isInvalidCompanyName('Could you refer me to this position?')).toBe(true);
    expect(isInvalidCompanyName('We are looking to hire senior devs')).toBe(true);

    // Valid company names should pass
    expect(isInvalidCompanyName('Twilio')).toBe(false);
    expect(isInvalidCompanyName('PT Bank Sinarmas Tbk')).toBe(false);
    expect(isInvalidCompanyName('Monday.com')).toBe(false);
  });
});

describe('Career Resolver - Slug Variant Generation', () => {
  it('generates compact, hyphenated, and first-word (>= 5 chars) variants', () => {
    // 1-word company
    expect(generateSlugVariants('twilio')).toEqual(['twilio']);

    // 2-word company with first word < 5 chars
    expect(generateSlugVariants('acme corp')).toEqual(['acmecorp', 'acme-corp']);

    // 2-word company with first word >= 5 chars
    expect(generateSlugVariants('insider one')).toEqual(['insiderone', 'insider-one', 'insider']);

    // Multi-word company
    expect(generateSlugVariants('bank sinarmas')).toEqual(['banksinarmas', 'bank-sinarmas']);
  });

  it('correctly checks isFullCompanySlug', () => {
    expect(isFullCompanySlug('twilio', 'twilio')).toBe(true);
    expect(isFullCompanySlug('insiderone', 'insider one')).toBe(true);
    expect(isFullCompanySlug('insider-one', 'insider one')).toBe(true);
    // First-word-only is not full company slug
    expect(isFullCompanySlug('insider', 'insider one')).toBe(false);
    expect(isFullCompanySlug('bank', 'bank sinarmas')).toBe(false);
  });
});

describe('Career Resolver - Confidence Classification', () => {
  it('assigns HIGH confidence when platform name matches companyNorm and openJobs >= 1', () => {
    const result = classifyConfidence({
      companyNorm: 'twilio',
      slugVariant: 'twilio',
      returnedName: 'Twilio',
      openJobsCount: 45,
    });
    expect(result).toBe('high');
  });

  it('assigns NONE confidence when platform name does not match companyNorm', () => {
    const result = classifyConfidence({
      companyNorm: 'twilio',
      slugVariant: 'twilio',
      returnedName: 'Completely Different Corp',
      openJobsCount: 10,
    });
    expect(result).toBe('none');
  });

  it('assigns NONE confidence when openJobsCount is 0', () => {
    const result = classifyConfidence({
      companyNorm: 'twilio',
      slugVariant: 'twilio',
      returnedName: 'Twilio',
      openJobsCount: 0,
    });
    expect(result).toBe('none');
  });

  it('assigns MEDIUM confidence when no name is available, slug is full company name, and openJobs >= 1', () => {
    const result = classifyConfidence({
      companyNorm: 'altaml',
      slugVariant: 'altaml',
      returnedName: null,
      openJobsCount: 5,
    });
    expect(result).toBe('medium');
  });

  it('assigns MEDIUM confidence for Ashby truncated responses (openJobsCount null) with full slug', () => {
    const result = classifyConfidence({
      companyNorm: 'linear',
      slugVariant: 'linear',
      returnedName: null,
      openJobsCount: null,
    });
    expect(result).toBe('medium');
  });

  it('assigns NONE confidence when slug is first-word-only and no name is returned', () => {
    const result = classifyConfidence({
      companyNorm: 'insider one',
      slugVariant: 'insider',
      returnedName: null,
      openJobsCount: 15,
    });
    expect(result).toBe('none');
  });

  it('assigns NONE confidence when slug collides with generic words', () => {
    const result = classifyConfidence({
      companyNorm: 'remote',
      slugVariant: 'remote',
      returnedName: 'Remote',
      openJobsCount: 20,
    });
    expect(result).toBe('none');
  });
});

describe('Career Resolver - Probing with Mocked HTTP Responses', () => {
  it('probes Greenhouse successfully with high confidence', async () => {
    const mockRequester: HttpRequester = async (url) => {
      if (url === 'https://boards-api.greenhouse.io/v1/boards/twilio') {
        return { status: 200, data: { name: 'Twilio' } };
      }
      if (url === 'https://boards-api.greenhouse.io/v1/boards/twilio/jobs') {
        return { status: 200, data: { jobs: [{ id: 1, title: 'PM' }] } };
      }
      return { status: 404, data: null };
    };

    const probeRes = await probeGreenhouse('twilio', mockRequester);
    expect(probeRes).not.toBeNull();
    expect(probeRes?.atsType).toBe('greenhouse');
    expect(probeRes?.returnedName).toBe('Twilio');
    expect(probeRes?.openJobsCount).toBe(1);
  });

  it('probes Lever successfully with posting count', async () => {
    const mockRequester: HttpRequester = async (url) => {
      if (url.includes('api.lever.co/v0/postings/altaml')) {
        return { status: 200, data: [{ id: 'job-1', text: 'Senior PM' }] };
      }
      return { status: 404, data: null };
    };

    const probeRes = await probeLever('altaml', mockRequester);
    expect(probeRes).not.toBeNull();
    expect(probeRes?.atsType).toBe('lever');
    expect(probeRes?.openJobsCount).toBe(1);
    expect(probeRes?.returnedName).toBeNull();
  });

  it('probes Ashby handling truncated (>5MB) response', async () => {
    const mockRequester: HttpRequester = async () => {
      return { status: 200, data: null, truncated: true };
    };

    const probeRes = await probeAshby('hugecompany', mockRequester);
    expect(probeRes).not.toBeNull();
    expect(probeRes?.atsType).toBe('ashby');
    expect(probeRes?.openJobsCount).toBeNull();
  });

  it('probes Workable successfully with company name and jobs count', async () => {
    const mockRequester: HttpRequester = async (url) => {
      if (url.includes('apply.workable.com/api/v1/widget/accounts/ripjar')) {
        return { status: 200, data: { name: 'Ripjar', jobs: [{ title: 'PM' }, { title: 'Dev' }] } };
      }
      return { status: 404, data: null };
    };

    const probeRes = await probeWorkable('ripjar', mockRequester);
    expect(probeRes).not.toBeNull();
    expect(probeRes?.atsType).toBe('workable');
    expect(probeRes?.returnedName).toBe('Ripjar');
    expect(probeRes?.openJobsCount).toBe(2);
  });

  it('probes SmartRecruiters requiring totalFound > 0', async () => {
    const mockRequester: HttpRequester = async (url) => {
      if (url.includes('nonexistent')) {
        return { status: 200, data: { totalFound: 0, content: [] } };
      }
      if (url.includes('canva')) {
        return {
          status: 200,
          data: {
            totalFound: 15,
            content: [{ company: { name: 'Canva' } }],
          },
        };
      }
      return { status: 404, data: null };
    };

    const nonexistentRes = await probeSmartRecruiters('nonexistent', mockRequester);
    expect(nonexistentRes).toBeNull();

    const canvaRes = await probeSmartRecruiters('canva', mockRequester);
    expect(canvaRes).not.toBeNull();
    expect(canvaRes?.atsType).toBe('smartrecruiters');
    expect(canvaRes?.openJobsCount).toBe(15);
    expect(canvaRes?.returnedName).toBe('Canva');
  });

  it('probes Recruitee successfully', async () => {
    const mockRequester: HttpRequester = async (url) => {
      if (url.includes('tacx.recruitee.com')) {
        return {
          status: 200,
          data: {
            offers: [{ id: 10, title: 'PM', company_name: 'Tacx' }],
          },
        };
      }
      return { status: 404, data: null };
    };

    const res = await probeRecruitee('tacx', mockRequester);
    expect(res).not.toBeNull();
    expect(res?.atsType).toBe('recruitee');
    expect(res?.openJobsCount).toBe(1);
    expect(res?.returnedName).toBe('Tacx');
  });

  it('probeCompany stops at first successful match in ladder', async () => {
    const mockRequester: HttpRequester = async (url) => {
      // Greenhouse returns 404
      if (url.includes('boards-api.greenhouse.io')) {
        return { status: 404, data: null };
      }
      // Lever returns 200 with postings
      if (url.includes('api.lever.co/v0/postings/altaml')) {
        return { status: 200, data: [{ id: '1', text: 'Senior Product Manager' }] };
      }
      return { status: 404, data: null };
    };

    const candidate: CandidateCompany = {
      companyDisplay: 'AltaML Inc',
      companyNorm: 'altaml',
      bestScore: 85,
      bestJobTitle: 'Senior Product Manager',
    };

    const result = await probeCompany(candidate, mockRequester);
    expect(result.status).toBe('resolved');
    expect(result.atsType).toBe('lever');
    expect(result.confidence).toBe('medium');
    expect(result.slug).toBe('altaml');
    expect(result.openJobsCount).toBe(1);
  });

  it('probeCompany marks as unresolved when no platform matches', async () => {
    const mockRequester: HttpRequester = async () => ({ status: 404, data: null });

    const candidate: CandidateCompany = {
      companyDisplay: 'Unknown Local Corp',
      companyNorm: 'unknown local',
      bestScore: 60,
      bestJobTitle: 'Product Manager',
    };

    const result = await probeCompany(candidate, mockRequester);
    expect(result.status).toBe('unresolved');
    expect(result.confidence).toBe('none');
    expect(result.atsType).toBeNull();
    expect(result.slug).toBeNull();
  });
});

// ─── Stage 1.5: corroboration ────────────────────────────────────────────────

describe('Career Resolver - Title overlap', () => {
  it('drops level words when tokenizing', () => {
    expect(normalizeTitleForOverlap('Senior Product Manager')).toEqual(['product', 'manager']);
    expect(normalizeTitleForOverlap('Staff / Principal Product Manager')).toEqual(['product', 'manager']);
  });

  it('computes token Jaccard similarity', () => {
    expect(titleJaccardOverlap('Senior Product Manager', 'Product Manager')).toBe(1);
    expect(titleJaccardOverlap('Product Manager', 'Head of Production')).toBe(0);
    expect(titleJaccardOverlap('Data Product Manager', 'Product Manager')).toBeCloseTo(2 / 3, 5);
  });

  it('matches on exact set equality or Jaccard >= 0.6', () => {
    expect(titleMatches('Product Manager', ['Senior Product Manager'])).toBe(true);
    expect(titleMatches('Data Product Manager', ['Product Manager'])).toBe(true);
    expect(titleMatches('Head of Production', ['Product Manager'])).toBe(false);
    expect(titleMatches('Senior', ['Senior Product Manager'])).toBe(false);
    expect(titleMatches('Product Manager', [])).toBe(false);
  });
});

describe('Career Resolver - Location overlap', () => {
  it('matches on a shared city or country token', () => {
    expect(locationMatches('London, England, United Kingdom', ['London Area, UK'])).toBe(true);
    expect(locationMatches('Jakarta, Indonesia', ['Tanah Abang, Jakarta, Indonesia'])).toBe(true);
    expect(locationMatches('France', ['London Area, UK'])).toBe(false);
  });

  it('never matches on placeholders or empty values', () => {
    expect(normalizeLocationForOverlap('Remote')).toEqual([]);
    expect(normalizeLocationForOverlap('Anywhere')).toEqual([]);
    expect(locationMatches('Remote', ['Remote'])).toBe(false);
    expect(locationMatches('Anywhere in the World', ['Anywhere'])).toBe(false);
    expect(locationMatches('', ['London'])).toBe(false);
    expect(locationMatches(null, ['London'])).toBe(false);
  });

  it('does not treat "United States" and "United Kingdom" as the same place', () => {
    expect(locationMatches('New York, United States', ['London, United Kingdom'])).toBe(false);
  });
});

describe('Career Resolver - Product role counting', () => {
  it('counts product manager/owner/lead/head/director titles only', () => {
    expect(
      countProductRoles([
        { title: 'Senior Product Manager' },
        { title: 'Product Owner' },
        { title: 'Head of Product' },
        { title: 'Head of Production' },
        { title: 'Product Designer' },
        { title: 'Software Engineer' },
      ])
    ).toBe(3);
  });
});

describe('Career Resolver - Suffix-safe board name matching', () => {
  it('normalizeCompanyNameFull keeps descriptive suffixes but drops pure legal forms', () => {
    expect(normalizeCompanyNameFull('FUSE GROUP')).toBe('fuse group');
    expect(normalizeCompanyNameFull('Tether Holdings')).toBe('tether holdings');
    expect(normalizeCompanyNameFull('Shopee Indonesia')).toBe('shopee indonesia');
    expect(normalizeCompanyNameFull('AltaML Inc.')).toBe('altaml');
    expect(normalizeCompanyNameFull('PT Bank Sinarmas Tbk')).toBe('bank sinarmas');
  });

  it('a suffix-stripped board name cannot satisfy a company that kept a suffix', () => {
    const company = { companyNorm: 'fuse', companyNormFull: 'fuse group' };
    expect(boardNameMatchesCompany('fuse', company)).toBe(false);
    expect(boardNameMatchesCompany('Fuse Group', company)).toBe(true);
  });

  it('allows the BOARD to carry an extra suffix when the company kept none', () => {
    const company = { companyNorm: 'reddit', companyNormFull: 'reddit' };
    expect(boardNameMatchesCompany('Reddit, Inc.', company)).toBe(true);
  });
});

const base = {
  companyNorm: 'acme',
  companyNormFull: 'acme',
  slugVariant: 'acme',
  openJobsCount: 3,
};

describe('Career Resolver - Confidence with evidence', () => {
  it('HIGH: name match and a title match', () => {
    const r = assessBoardWithEvidence({
      ...base,
      returnedName: 'Acme',
      postings: [{ title: 'Product Manager', location: 'Berlin, Germany' }],
      knownTitles: ['Senior Product Manager'],
      knownLocations: [],
    });
    expect(r.confidence).toBe('high');
    expect(r.evidence.matchedTitles).toEqual(['Product Manager']);
  });

  it('MEDIUM: name match, location match, and a product role (no title match)', () => {
    const r = assessBoardWithEvidence({
      ...base,
      returnedName: 'Acme',
      postings: [{ title: 'Head of Product', location: 'Jakarta, Indonesia' }],
      knownTitles: ['Data Scientist'],
      knownLocations: ['Jakarta'],
    });
    expect(r.confidence).toBe('medium');
    expect(r.evidence.matchedLocations).toEqual(['Jakarta, Indonesia']);
  });

  it('MEDIUM: no name, slug equals the FULL name, and a product role', () => {
    const r = assessBoardWithEvidence({
      ...base,
      returnedName: null,
      postings: [{ title: 'Product Owner', location: null }],
      knownTitles: [],
      knownLocations: [],
    });
    expect(r.confidence).toBe('medium');
    expect(r.evidence.slugMatch).toBe('full-name');
  });

  it('NONE: name matches but nothing corroborates it', () => {
    const r = assessBoardWithEvidence({
      ...base,
      returnedName: 'Acme',
      postings: [{ title: 'Chemist', location: 'Lyon, France' }],
      knownTitles: ['Product Manager'],
      knownLocations: ['London'],
    });
    expect(r.confidence).toBe('none');
    expect(r.evidence.rejectedReason).toBeTruthy();
  });

  it('NONE: truncated payload cannot be corroborated', () => {
    const r = assessBoardWithEvidence({
      ...base,
      returnedName: null,
      openJobsCount: null,
      postings: undefined,
      knownTitles: ['Product Manager'],
      knownLocations: [],
    });
    expect(r.confidence).toBe('none');
  });

  it('a suffix-stripped name alone can never produce HIGH', () => {
    const r = assessBoardWithEvidence({
      companyNorm: 'fuse',
      companyNormFull: 'fuse group',
      slugVariant: 'fuse',
      returnedName: 'Fuse',
      openJobsCount: 4,
      postings: [{ title: 'Product Manager', location: 'Jakarta' }],
      knownTitles: ['Product Manager'],
      knownLocations: ['Jakarta'],
    });
    expect(r.confidence).toBe('none');
  });
});

// Builds a requester that serves one board and 404s everything else.
function boardRequester(routes: Record<string, unknown>): HttpRequester {
  return async (url) => {
    for (const [needle, data] of Object.entries(routes)) {
      if (url.includes(needle)) return { status: 200, data };
    }
    return { status: 404, data: null };
  };
}

describe('Career Resolver - Regression cases from the pilot', () => {
  it('FUSE GROUP: a Jakarta PM must not resolve to the unrelated US board "fuse"', async () => {
    const requester = boardRequester({
      'api.ashbyhq.com/posting-api/job-board/fuse': {
        jobs: [{ title: 'Head of Production', location: 'San Leandro, California' }],
      },
    });
    const candidate: CandidateCompany = {
      companyDisplay: 'FUSE GROUP',
      companyNorm: 'fuse',
      bestScore: 80,
      bestJobTitle: 'Product Manager',
      knownTitles: ['Product Manager'],
      knownLocations: ['Tanah Abang, Jakarta, Indonesia'],
    };
    const result = await probeCompany(candidate, requester, { aliases: {} });
    expect(result.status).toBe('unresolved');
    expect(result.confidence).toBe('none');
  });

  it('numi: a London PM must not resolve to the French biotech board "numi"', async () => {
    const requester = boardRequester({
      'apply.workable.com/api/v1/widget/accounts/numi': {
        name: 'Nūmi',
        jobs: [
          { title: 'Ingénieur Procédés', country: 'France' },
          { title: 'Cell Biologist Intern', country: 'France' },
        ],
      },
    });
    const candidate: CandidateCompany = {
      companyDisplay: 'numi',
      companyNorm: 'numi',
      bestScore: 80,
      bestJobTitle: 'Senior Product Manager',
      knownTitles: ['Senior Product Manager'],
      knownLocations: ['London Area, UK'],
    };
    const result = await probeCompany(candidate, requester, { aliases: {} });
    expect(result.status).toBe('unresolved');
    expect(result.evidence?.rejectedBoard).toBe('workable:numi');
  });

  it('Grip: same title on the board -> high', async () => {
    const requester = boardRequester({
      'grip.recruitee.com/api/offers': {
        offers: [
          { title: 'Data and AI Product Manager', company_name: 'Grip', city: 'London', country: 'United Kingdom' },
          { title: 'Principal AI Engineer', company_name: 'Grip', city: 'London', country: 'United Kingdom' },
        ],
      },
    });
    const candidate: CandidateCompany = {
      companyDisplay: 'Grip',
      companyNorm: 'grip',
      bestScore: 80,
      bestJobTitle: 'Data and AI Product Manager',
      knownTitles: ['Data and AI Product Manager'],
      knownLocations: ['London'],
    };
    const result = await probeCompany(candidate, requester, { aliases: {} });
    expect(result.status).toBe('resolved');
    expect(result.atsType).toBe('recruitee');
    expect(result.confidence).toBe('high');
  });

  it('Great Minds: parenthetical title still matches via overlap -> high', async () => {
    const requester = boardRequester({
      'greatminds.recruitee.com/api/offers': {
        offers: [
          {
            title: 'Principal Product Manager (Content Authoring, Delivery & CMS)',
            company_name: 'Great Minds',
            city: 'Washington',
            country: 'United States',
          },
        ],
      },
    });
    const candidate: CandidateCompany = {
      companyDisplay: 'Great Minds',
      companyNorm: 'great minds',
      bestScore: 77,
      bestJobTitle: 'Principal Product Manager (Content Authoring, Delivery & CMS)',
      knownTitles: ['Principal Product Manager (Content Authoring, Delivery & CMS)'],
      knownLocations: ['Anywhere in the World'],
    };
    const result = await probeCompany(candidate, requester, { aliases: {} });
    expect(result.status).toBe('resolved');
    expect(result.confidence).toBe('high');
    expect(result.slug).toBe('greatminds');
  });

  it('no known evidence: never HIGH; medium only through the full-name slug branch', async () => {
    const requester = boardRequester({
      'apply.workable.com/api/v1/widget/accounts/orbit': {
        name: 'Orbit',
        jobs: [{ title: 'Senior Product Manager', country: 'Germany' }],
      },
    });
    const candidate: CandidateCompany = {
      companyDisplay: 'Orbit',
      companyNorm: 'orbit',
      bestScore: 70,
      bestJobTitle: '',
      knownTitles: [],
      knownLocations: [],
    };
    const result = await probeCompany(candidate, requester, { aliases: {} });
    expect(result.confidence).not.toBe('high');
    expect(result.confidence).toBe('medium');
    expect(result.evidence?.slugMatch).toBe('full-name');
  });
});

describe('Career Resolver - Manual aliases', () => {
  it('parses a valid alias file and rejects an invalid one', () => {
    const ok = parseCareerAliases('aliases:\n  bjak:\n    ats_type: ashby\n    slug: bjakcareer\n');
    expect(ok).toEqual({ bjak: { ats_type: 'ashby', slug: 'bjakcareer' } });
    expect(parseCareerAliases('aliases:\n  bjak:\n    ats_type: nope\n    slug: x\n')).toEqual({});
    expect(parseCareerAliases(':::not yaml')).toEqual({});
  });

  it('an alias hit skips guessing, is method=manual, and needs a live board', async () => {
    const probed: string[] = [];
    const requester: HttpRequester = async (url) => {
      probed.push(url);
      if (url.includes('job-board/bjakcareer')) {
        return { status: 200, data: { jobs: [{ title: 'Product Manager', location: 'Indonesia' }] } };
      }
      return { status: 404, data: null };
    };
    const candidate: CandidateCompany = {
      companyDisplay: 'BJAK',
      companyNorm: 'bjak',
      bestScore: 83,
      bestJobTitle: 'Product Manager - AI Neobank App',
    };
    const aliases = { bjak: { ats_type: 'ashby', slug: 'bjakcareer' } };
    const result = await probeCompany(candidate, requester, { aliases });
    expect(result.status).toBe('resolved');
    expect(result.method).toBe('manual');
    expect(result.confidence).toBe('high');
    expect(result.evidence?.source).toBe('alias');
    expect(probed.every((u) => u.includes('bjakcareer'))).toBe(true);

    const dead: HttpRequester = async () => ({ status: 404, data: null });
    const failed = await probeCompany(candidate, dead, { aliases });
    expect(failed.status).toBe('unresolved');
    expect(failed.method).toBe('manual');
  });

  it('summarizeEvidence stays scannable', () => {
    expect(
      summarizeEvidence({
        source: 'probe',
        boardName: 'Grip',
        matchedTitles: ['Data and AI Product Manager'],
        matchedLocations: [],
        productRoles: 1,
      })
    ).toBe('title:"Data and AI Product Manager"; product_roles=1');
    expect(summarizeEvidence(null)).toBe('-');
  });
});

describe('Career Resolver - Retry-After handling', () => {
  it('uses the header in seconds, an HTTP date, or exponential backoff', () => {
    expect(computeRetryDelayMs('7', 1)).toBe(7000);
    expect(computeRetryDelayMs(undefined, 1)).toBe(2000);
    expect(computeRetryDelayMs(undefined, 2)).toBe(4000);
    const now = Date.parse('2026-09-19T00:00:00Z');
    expect(computeRetryDelayMs('Sat, 19 Sep 2026 00:00:10 GMT', 1, now)).toBe(10000);
  });

  it('a day-long Retry-After exceeds the cap, so the resolver skips instead of stalling', () => {
    expect(computeRetryDelayMs('86384', 1)).toBeGreaterThan(MAX_RETRY_DELAY_MS);
    expect(computeRetryDelayMs('5', 1)).toBeLessThanOrEqual(MAX_RETRY_DELAY_MS);
  });
});

describe('Career Resolver - Rate-limited checks are inconclusive', () => {
  it('a rate-limited host yields an inconclusive result, not a confident "no match"', async () => {
    const requester: HttpRequester = async (url) =>
      url.includes('apply.workable.com')
        ? { status: 429, data: null, rateLimited: true }
        : { status: 404, data: null };
    const candidate: CandidateCompany = {
      companyDisplay: 'Ajaib',
      companyNorm: 'ajaib',
      bestScore: 80,
      bestJobTitle: 'Senior Product Manager',
      knownTitles: ['Senior Product Manager'],
      knownLocations: ['Jakarta'],
    };
    const result = await probeCompany(candidate, requester, { aliases: {} });
    expect(result.status).toBe('unresolved');
    expect(result.inconclusive).toBe(true);
  });

  it('a genuine no-match stays conclusive', async () => {
    const requester: HttpRequester = async () => ({ status: 404, data: null });
    const candidate: CandidateCompany = {
      companyDisplay: 'Nobody',
      companyNorm: 'nobody',
      bestScore: 50,
      bestJobTitle: 'Product Manager',
    };
    const result = await probeCompany(candidate, requester, { aliases: {} });
    expect(result.inconclusive).toBe(false);
  });
});
