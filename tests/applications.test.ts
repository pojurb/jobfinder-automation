import { describe, expect, it } from 'vitest';
import { appendApplicationNotes, buildApplicationWrite, isFollowUpDue } from '../src/extras/applications';

describe('application writes', () => {
  const now = new Date('2026-09-16T10:00:00.000Z');

  it('creates an applied record with an applied timestamp', () => {
    expect(buildApplicationWrite(undefined, 'applied', 'Submitted on company site', now)).toEqual({
      status: 'applied',
      notes: 'Submitted on company site',
      appliedAt: now,
      updatedAt: now,
    });
  });

  it('appends notes and only resets appliedAt when transitioning to applied', () => {
    const existing = {
      status: 'pending' as const,
      notes: 'Saved from dashboard',
      appliedAt: null,
      updatedAt: new Date('2026-09-15T10:00:00.000Z'),
    };

    const write = buildApplicationWrite(existing, 'applied', 'Submitted today', now);
    expect(write.notes).toBe('Saved from dashboard\n\nSubmitted today');
    expect(write.appliedAt).toEqual(now);
    expect(buildApplicationWrite(write, 'interviewing', undefined, now).appliedAt).toEqual(now);
  });

  it('does not duplicate empty notes', () => {
    expect(appendApplicationNotes('Existing note', '   ')).toBe('Existing note');
  });
});

describe('follow-up due calculation', () => {
  const now = new Date('2026-09-16T10:00:00.000Z');

  it('flags an unchanged application older than seven days', () => {
    expect(isFollowUpDue({
      status: 'applied',
      appliedAt: new Date('2026-09-08T09:00:00.000Z'),
      updatedAt: new Date('2026-09-08T09:00:00.000Z'),
    }, now)).toBe(true);
  });

  it('does not flag a recently updated or non-applied application', () => {
    expect(isFollowUpDue({
      status: 'applied',
      appliedAt: new Date('2026-09-01T09:00:00.000Z'),
      updatedAt: new Date('2026-09-15T09:00:00.000Z'),
    }, now)).toBe(false);
    expect(isFollowUpDue({
      status: 'pending',
      appliedAt: null,
      updatedAt: new Date('2026-09-01T09:00:00.000Z'),
    }, now)).toBe(false);
  });
});
