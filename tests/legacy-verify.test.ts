import { describe, it, expect } from 'vitest';
import { matchLegacyJobs } from '../src/discovery/legacy-verify';

const tracked = (t: string) => /product manager/i.test(t);

describe('matchLegacyJobs', () => {
  const fresh = [
    { company: 'Reddit', title: 'Group Product Manager, Finance Technology', url: 'https://boards.greenhouse.io/reddit/jobs/1' },
    { company: 'Reddit', title: 'Software Engineer', url: 'https://boards.greenhouse.io/reddit/jobs/2' },
  ];

  it('marks a matching legacy job open with the official apply URL', () => {
    const v = matchLegacyJobs([{ id: 1, company: 'Reddit, Inc.', title: 'Group Product Manager, Finance Technology' }], fresh, tracked);
    expect(v).toEqual([
      { id: 1, status: 'open', canonicalApplyUrl: 'https://boards.greenhouse.io/reddit/jobs/1', matchedTitle: 'Group Product Manager, Finance Technology' },
    ]);
  });

  it('marks a legacy job stale when its company board was read but no title matches', () => {
    const v = matchLegacyJobs([{ id: 2, company: 'Reddit', title: 'Senior Product Manager, Ads' }], fresh, tracked);
    expect(v).toEqual([{ id: 2, status: 'stale' }]);
  });

  it('gives no verdict when the company has no fresh postings (board unknown)', () => {
    expect(matchLegacyJobs([{ id: 3, company: 'Unknown Co', title: 'Product Manager' }], fresh, tracked)).toEqual([]);
  });

  it('gives no verdict for generic titles that cannot identify one posting', () => {
    const v = matchLegacyJobs(
      [
        { id: 5, company: 'Brex', title: 'Product Manager' },
        { id: 6, company: 'Brex', title: 'Senior Product Manager' },
      ],
      [{ company: 'Brex', title: 'Staff Product Manager', url: 'https://x/1' }],
      tracked
    );
    expect(v).toEqual([]);
  });

  it('a partly overlapping specific title is stale, not open', () => {
    const v = matchLegacyJobs(
      [{ id: 7, company: 'Rithum', title: 'Senior Product Manager - Catalog' }],
      [{ company: 'Rithum', title: 'Product Manager - Technical', url: 'https://x/2' }],
      tracked
    );
    expect(v).toEqual([{ id: 7, status: 'stale' }]);
  });

  it('gives no verdict for titles the fetch pipeline would never have kept', () => {
    expect(matchLegacyJobs([{ id: 4, company: 'Reddit', title: 'Brand Manager' }], fresh, tracked)).toEqual([]);
  });
});
