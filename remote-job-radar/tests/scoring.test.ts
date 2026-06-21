import { describe, it, expect } from 'vitest';
import { calculateFreshnessScore } from '../src/scoring/pre-filter';

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
