import { describe, it, expect } from 'vitest';
import { computeContentHash } from '../src/utils/hash';
import { deduplicateCrossSource } from '../src/fetchers';
import { mockJobs } from './fixtures/jobs';

describe('Deduplication Hashing', () => {
  it('generates consistent hashes for identical inputs', () => {
    const job = mockJobs[0];
    const hash1 = computeContentHash(job.title, job.company, job.url || job.location);
    const hash2 = computeContentHash(job.title, job.company, job.url || job.location);
    expect(hash1).toBe(hash2);
  });

  it('generates the SAME hash for the same job from different sources (cross-source dedup)', () => {
    const job = mockJobs[0];
    const hash1 = computeContentHash(job.title, job.company, job.url || job.location);
    const hash2 = computeContentHash(job.title, job.company, job.url || job.location);
    expect(hash1).toBe(hash2);
  });

  it('normalizes inputs before hashing (case insensitive)', () => {
    const hash1 = computeContentHash('Title', 'Company', 'URL');
    const hash2 = computeContentHash('title', 'COMPANY', 'url');
    expect(hash1).toBe(hash2);
  });

  it('generates different hashes for different jobs', () => {
    const hash1 = computeContentHash('Senior PM', 'Stripe', 'https://stripe.com/job1');
    const hash2 = computeContentHash('Senior PM', 'Stripe', 'https://stripe.com/job2');
    expect(hash1).not.toBe(hash2);
  });
});

describe('Cross-source deduplication', () => {
  it('removes duplicate jobs across sources, keeping the higher-priority source', () => {
    const hash = computeContentHash('Senior PM', 'Stripe', 'https://stripe.com/jobs/123');
    const aggregatorJob = {
      source: 'remotive',
      sourceJobId: '999',
      title: 'Senior PM',
      company: 'Stripe',
      url: 'https://stripe.com/jobs/123',
      contentHash: hash,
      rawJson: {},
    } as any;
    const atsJob = {
      source: 'greenhouse',
      sourceJobId: '123',
      title: 'Senior PM',
      company: 'Stripe',
      url: 'https://stripe.com/jobs/123',
      contentHash: hash,
      rawJson: {},
    } as any;

    const result = deduplicateCrossSource([aggregatorJob, atsJob]);
    expect(result).toHaveLength(1);
    expect(result[0].source).toBe('greenhouse');
  });

  it('keeps all jobs when there are no duplicates', () => {
    const job1 = { source: 'remotive', sourceJobId: '1', title: 'PM', company: 'A', url: 'https://a.com/1', contentHash: 'hash1', rawJson: {} } as any;
    const job2 = { source: 'greenhouse', sourceJobId: '2', title: 'PM', company: 'B', url: 'https://b.com/2', contentHash: 'hash2', rawJson: {} } as any;

    const result = deduplicateCrossSource([job1, job2]);
    expect(result).toHaveLength(2);
  });

  it('handles empty input', () => {
    const result = deduplicateCrossSource([]);
    expect(result).toHaveLength(0);
  });
});