import { describe, it, expect } from 'vitest';
import { formatJobBlock } from '../src/extras/review';

const mockJob: any = {
  id: 42,
  title: 'Senior Product Manager',
  company: 'Acme SaaS',
  location: 'Worldwide',
  remoteRegion: 'Worldwide',
  salary: '$120k - $150k',
  url: 'https://example.com/job/42',
  description: 'Lead our B2B SaaS platform roadmap.',
  totalScore: 55,
  roleScore: 30,
  remoteScore: 25,
  seniorityScore: 15,
  domainScore: 5,
  aiProductScore: 2,
  freshnessScore: 3,
  matchReasons: ['Role matches Product Manager', 'Worldwide remote'],
  rejectionReasons: ['Does not match target domains'],
};

describe('Review command — formatJobBlock', () => {
  it('includes job ID, title, and company', () => {
    const block = formatJobBlock(mockJob, 1, 3);
    expect(block).toContain('ID 42');
    expect(block).toContain('Senior Product Manager');
    expect(block).toContain('Acme SaaS');
  });

  it('includes score and breakdown', () => {
    const block = formatJobBlock(mockJob, 1, 3);
    expect(block).toContain('55/100');
    expect(block).toContain('Role: 30');
    expect(block).toContain('Remote: 25');
  });

  it('includes match and rejection reasons', () => {
    const block = formatJobBlock(mockJob, 1, 3);
    expect(block).toContain('Role matches Product Manager');
    expect(block).toContain('Does not match target domains');
  });

  it('wraps description in a code fence', () => {
    const block = formatJobBlock(mockJob, 1, 3);
    expect(block).toContain('```');
    expect(block).toContain('Lead our B2B SaaS platform roadmap.');
  });

  it('handles missing reasons gracefully', () => {
    const job: any = { ...mockJob, matchReasons: [], rejectionReasons: [] };
    const block = formatJobBlock(job, 1, 1);
    expect(block).toContain('- None');
  });

  it('shows progress index', () => {
    const block = formatJobBlock(mockJob, 2, 5);
    expect(block).toContain('Job 2/5');
  });
});