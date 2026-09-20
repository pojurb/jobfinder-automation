import { describe, expect, it } from 'vitest';
import { findLegacyJunkReasons } from '../src/legacy/junk';

describe('legacy junk detection', () => {
  it('flags an HTML-encoded first-person referral request', () => {
    expect(findLegacyJunkReasons('I&#X27;M Interested In Product Manager Role, Could You Refer Me?')).toEqual(
      expect.arrayContaining([
        'first-person post, not a job title',
        'referral/request language',
        'question-style title',
      ]),
    );
  });

  it('flags an application error report', () => {
    expect(findLegacyJunkReasons('Hello. I am trying to apply but get a 413 Request Entity Too Large Error.')).toEqual(
      expect.arrayContaining([
        'first-person post, not a job title',
        'application error report',
      ]),
    );
  });

  it('does not flag a normal product-manager posting', () => {
    expect(findLegacyJunkReasons('Senior Product Manager, Payments')).toEqual([]);
  });
});
