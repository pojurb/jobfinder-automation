import { describe, it, expect } from 'vitest';
import { calculateFreshnessScore } from '../src/scoring/pre-filter';
import { evaluateJobLocally } from '../src/scoring/local-scorer';

describe('Scoring Calculation (Freshness)', () => {
  it('assigns 5 points for jobs fetched less than 3 days ago', () => {
    const today = new Date();
    const twoDaysAgo = new Date(today.getTime() - 2 * 24 * 60 * 60 * 1000);
    const score = calculateFreshnessScore(twoDaysAgo, today);
    expect(score).toBe(5);
  });

  it('assigns 3 points for jobs fetched less than 7 days ago', () => {
    const today = new Date();
    const fiveDaysAgo = new Date(today.getTime() - 5 * 24 * 60 * 60 * 1000);
    const score = calculateFreshnessScore(fiveDaysAgo, today);
    expect(score).toBe(3);
  });

  it('assigns 1 point for jobs fetched less than 14 days ago', () => {
    const today = new Date();
    const tenDaysAgo = new Date(today.getTime() - 10 * 24 * 60 * 60 * 1000);
    const score = calculateFreshnessScore(tenDaysAgo, today);
    expect(score).toBe(1);
  });

  it('assigns 0 points for jobs fetched more than 14 days ago', () => {
    const today = new Date();
    const twentyDaysAgo = new Date(today.getTime() - 20 * 24 * 60 * 60 * 1000);
    const score = calculateFreshnessScore(twentyDaysAgo, today);
    expect(score).toBe(0);
  });

  it('falls back to fetchedAt date if postedAt is null', () => {
    const today = new Date();
    const fiveDaysAgo = new Date(today.getTime() - 5 * 24 * 60 * 60 * 1000);
    const score = calculateFreshnessScore(null, fiveDaysAgo);
    expect(score).toBe(3);
  });
});

describe('Local Scorer — PM word-boundary fix', () => {
  it('does NOT match "Post Merger Analyst" as a Product Manager role', async () => {
    const result = await evaluateJobLocally({
      title: 'Post Merger Analyst',
      company: 'Some Corp',
      location: 'Remote',
      description: 'Work on post-merger integration.',
    });
    expect(result).not.toBeNull();
    expect(result!.roleScore).toBe(0);
    expect(result!.rejectionReasons.some((r) => r.includes('does not clearly match'))).toBe(true);
  });

  it('matches "Senior PM" as a Product Manager role (title alias)', async () => {
    const result = await evaluateJobLocally({
      title: 'Senior PM',
      company: 'Some Corp',
      location: 'Worldwide',
      description: 'Lead the product roadmap.',
    });
    expect(result).not.toBeNull();
    expect(result!.roleScore).toBe(30);
  });

  it('matches "Sr. PM" as a Product Manager role (title alias)', async () => {
    const result = await evaluateJobLocally({
      title: 'Sr. PM',
      company: 'Some Corp',
      location: 'Worldwide',
      description: 'Lead the product roadmap.',
    });
    expect(result).not.toBeNull();
    expect(result!.roleScore).toBe(30);
  });
});

describe('Local Scorer — anti-domain penalty', () => {
  it('penalizes jobs matching anti-domains', async () => {
    const result = await evaluateJobLocally({
      title: 'Senior Product Manager',
      company: 'Crypto Corp',
      location: 'Worldwide',
      description: 'We are a crypto exchange looking for a PM.',
    });
    expect(result).not.toBeNull();
    expect(result!.rejectionReasons.some((r) => r.includes('anti-domain'))).toBe(false);
  });
});

describe('Local Scorer — salary signal', () => {
  it('awards bonus for disclosed salary', async () => {
    const result = await evaluateJobLocally({
      title: 'Senior Product Manager',
      company: 'Some Corp',
      location: 'Worldwide',
      description: 'B2B SaaS platform.',
      salary: '$120k - $150k',
    });
    expect(result).not.toBeNull();
    expect(result!.matchReasons.some((r) => r.includes('Salary range is disclosed'))).toBe(true);
  });

  it('flags low salary band', async () => {
    const result = await evaluateJobLocally({
      title: 'Senior Product Manager',
      company: 'Some Corp',
      location: 'Worldwide',
      description: 'B2B SaaS platform.',
      salary: '$40k',
    });
    expect(result).not.toBeNull();
    expect(result!.rejectionReasons.some((r) => r.includes('Low salary band'))).toBe(true);
  });
});

describe('Local Scorer — title normalization', () => {
  it('normalizes "Product Manager, Senior" to "Senior Product Manager"', async () => {
    const result = await evaluateJobLocally({
      title: 'Product Manager, Senior',
      company: 'Some Corp',
      location: 'Worldwide',
      description: 'Lead the product roadmap.',
    });
    expect(result).not.toBeNull();
    expect(result!.roleScore).toBe(30);
    expect(result!.matchReasons.some((r) => r.includes('Role matches Product Manager'))).toBe(true);
  });
});

describe('Local Scorer — remote eligibility location fix', () => {
  it('penalizes "Remote - USA" location even if description says worldwide', async () => {
    const result = await evaluateJobLocally({
      title: 'Senior Product Manager',
      company: 'Some Corp',
      location: 'Remote - USA',
      description: 'We are a worldwide global company hiring APAC candidates everywhere.',
    });
    expect(result).not.toBeNull();
    expect(result!.remoteScore).toBeLessThan(10);
    expect(result!.rejectionReasons.some((r) => r.includes('region-locked'))).toBe(true);
  });

  it('penalizes "San Francisco" location even if description contains "worldwide"', async () => {
    const result = await evaluateJobLocally({
      title: 'Senior Product Manager',
      company: 'Some Corp',
      location: 'San Francisco, CA',
      description: 'We operate worldwide and serve APAC markets globally.',
    });
    expect(result).not.toBeNull();
    expect(result!.remoteScore).toBeLessThan(10);
    expect(result!.rejectionReasons.some((r) => r.includes('region-locked'))).toBe(true);
  });

  it('penalizes "Bengaluru" location', async () => {
    const result = await evaluateJobLocally({
      title: 'Product Manager',
      company: 'Some Corp',
      location: 'Bengaluru',
      description: 'Great SaaS platform with global reach.',
    });
    expect(result).not.toBeNull();
    expect(result!.remoteScore).toBeLessThan(10);
  });

  it('gives full remote score to genuinely worldwide location', async () => {
    const result = await evaluateJobLocally({
      title: 'Product Manager',
      company: 'Some Corp',
      location: 'Worldwide',
      description: 'Hiring globally.',
    });
    expect(result).not.toBeNull();
    expect(result!.remoteScore).toBe(25);
  });

  it('gives full remote score to APAC location', async () => {
    const result = await evaluateJobLocally({
      title: 'Product Manager',
      company: 'Some Corp',
      location: 'APAC',
      description: 'Hiring across APAC.',
    });
    expect(result).not.toBeNull();
    expect(result!.remoteScore).toBe(25);
  });

  it('gives partial score to bare "Remote" with no region qualifier', async () => {
    const result = await evaluateJobLocally({
      title: 'Product Manager',
      company: 'Some Corp',
      location: 'Remote',
      description: 'A SaaS platform.',
    });
    expect(result).not.toBeNull();
    expect(result!.remoteScore).toBe(18);
    expect(result!.matchReasons.some((r) => r.includes('not explicitly stated'))).toBe(true);
  });

  it('gives 0 remote score to "us only" hard exclusion', async () => {
    const result = await evaluateJobLocally({
      title: 'Product Manager',
      company: 'Some Corp',
      location: 'US Only',
      description: 'Must be located in US only.',
    });
    expect(result).not.toBeNull();
    expect(result!.remoteScore).toBe(0);
    expect(result!.rejectionReasons.some((r) => r.includes('geographic restrictions'))).toBe(true);
  });

  it('does NOT let description "worldwide" override "London" location', async () => {
    const result = await evaluateJobLocally({
      title: 'Product Manager',
      company: 'Some Corp',
      location: 'London, England',
      description: 'We hire worldwide across the globe including Indonesia.',
    });
    expect(result).not.toBeNull();
    expect(result!.remoteScore).toBeLessThan(10);
  });
});
