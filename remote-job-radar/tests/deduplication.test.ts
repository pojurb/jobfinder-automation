import { describe, it, expect } from 'vitest';
import { computeContentHash } from '../src/utils/hash';
import { mockJobs } from './fixtures/jobs';

describe('Deduplication Hashing', () => {
  it('generates consistent hashes for identical inputs', () => {
    const job = mockJobs[0];
    const hash1 = computeContentHash(job.source, job.title, job.company, job.location);
    const hash2 = computeContentHash(job.source, job.title, job.company, job.location);
    expect(hash1).toBe(hash2);
  });

  it('generates different hashes for different sources', () => {
    const job = mockJobs[0];
    const hash1 = computeContentHash(job.source, job.title, job.company, job.location);
    const hash2 = computeContentHash('different_source', job.title, job.company, job.location);
    expect(hash1).not.toBe(hash2);
  });

  it('normalizes inputs before hashing (case insensitive)', () => {
    const hash1 = computeContentHash('src', 'Title', 'Company', 'URL');
    const hash2 = computeContentHash('SRC', 'title', 'COMPANY', 'url');
    expect(hash1).toBe(hash2);
  });
});
