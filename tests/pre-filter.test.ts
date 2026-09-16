import { describe, it, expect } from 'vitest';
import { evaluateHardRejects } from '../src/scoring/pre-filter';
import { mockJobs } from './fixtures/jobs';

describe('Hard Rejection Rules (Pre-filter)', () => {
  it('passes Worldwide Senior PM role (Job 1)', () => {
    const job = mockJobs[0];
    const result = evaluateHardRejects(job);
    expect(result).toBeNull(); // Should pass
  });

  it('rejects US-only Product Manager role (Job 2)', () => {
    const job = mockJobs[1];
    const result = evaluateHardRejects(job);
    expect(result).toContain("Found exclusionary location keyword 'us only'");
  });

  it('rejects Hybrid Product Owner role (Job 3)', () => {
    const job = mockJobs[2];
    const result = evaluateHardRejects(job);
    expect(result).toContain("Non-remote work type 'hybrid' detected");
  });

  it('passes AI Product Manager APAC role (Job 4)', () => {
    const job = mockJobs[3];
    const result = evaluateHardRejects(job);
    expect(result).toBeNull(); // Should pass
  });

  it('rejects Junior PM role (Job 5)', () => {
    const job = mockJobs[4];
    const result = evaluateHardRejects(job);
    expect(result).toContain("Junior/Intern seniority 'junior' detected in title");
  });
});
