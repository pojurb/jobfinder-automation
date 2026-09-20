import { describe, expect, it } from 'vitest';
import { parseLinkedInCaptureFile } from '../src/extras/import-linkedin';

describe('parseLinkedInCaptureFile', () => {
  it('accepts a JSON object with a jobs array', () => {
    expect(parseLinkedInCaptureFile('{"jobs":[]}')).toEqual({ jobs: [] });
  });

  it('rejects malformed capture structures', () => {
    expect(() => parseLinkedInCaptureFile('{"items":[]}')).toThrow('jobs array');
  });
});
