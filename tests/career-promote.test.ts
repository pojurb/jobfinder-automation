import { describe, it, expect } from 'vitest';
import { planPromotion, ResolvedSourceRow } from '../src/discovery/career-promote';

const row = (over: Partial<ResolvedSourceRow>): ResolvedSourceRow => ({
  companyDisplay: 'Acme',
  atsType: 'greenhouse',
  slug: 'acme',
  confidence: 'high',
  status: 'resolved',
  method: 'slug-probe',
  ...over,
});

describe('planPromotion', () => {
  it('promotes high-confidence rows for supported ATS types', () => {
    const plan = planPromotion([row({})], new Set());
    expect(plan.promote).toHaveLength(1);
  });

  it('ignores unresolved rows entirely', () => {
    const plan = planPromotion([row({ status: 'unresolved', atsType: null, slug: null, confidence: 'none' })], new Set());
    expect(plan.promote).toHaveLength(0);
    expect(plan.skipped).toHaveLength(0);
  });

  it('skips medium unless asked, and manual aliases unless asked', () => {
    const rows = [row({ confidence: 'medium' }), row({ companyDisplay: 'BJAK', slug: 'bjakcareer', atsType: 'ashby', method: 'manual' })];
    expect(planPromotion(rows, new Set()).promote).toHaveLength(0);
    expect(planPromotion(rows, new Set(), { includeMedium: true }).promote).toHaveLength(1);
    expect(planPromotion(rows, new Set(), { includeManual: true }).promote).toHaveLength(1);
  });

  it('skips ATS types with no fetcher (recruitee)', () => {
    const plan = planPromotion([row({ atsType: 'recruitee', slug: 'grip' })], new Set());
    expect(plan.promote).toHaveLength(0);
    expect(plan.skipped[0].reason).toContain('recruitee');
  });

  it('skips boards already tracked, case-insensitively, and de-duplicates within the batch', () => {
    const rows = [row({ slug: 'Twilio', atsType: 'greenhouse' }), row({ companyDisplay: 'Other', slug: 'x' }), row({ companyDisplay: 'X2', slug: 'x' })];
    const plan = planPromotion(rows, new Set(['greenhouse:twilio']));
    expect(plan.promote.map((r) => r.slug)).toEqual(['x']);
  });
});
