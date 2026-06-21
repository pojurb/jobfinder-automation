import { describe, it, expect } from 'vitest';
import { normalizeText, normalizeUrl, normalizeDate } from '../src/utils/normalize';

describe('Job Normalization', () => {
  it('normalizes text by stripping whitespace and zero-width chars', () => {
    const raw = '  Senior   Product\u200BManager  ';
    expect(normalizeText(raw)).toBe('Senior ProductManager');
  });

  it('normalizes urls', () => {
    expect(normalizeUrl('  https://example.com/job  ')).toBe('https://example.com/job');
  });

  it('normalizes valid dates to ISO strings', () => {
    const raw = '2023-10-01T12:00:00Z';
    expect(normalizeDate(raw)).toBe('2023-10-01T12:00:00.000Z');
  });

  it('returns undefined for invalid dates', () => {
    expect(normalizeDate('invalid date')).toBeUndefined();
  });
});
