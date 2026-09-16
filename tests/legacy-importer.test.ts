import { describe, expect, it } from 'vitest';
import { parseLegacyMarkdownJob } from '../src/legacy/importer';

describe('legacy Markdown importer', () => {
  it('parses the original Python tracker frontmatter and body', () => {
    const job = parseLegacyMarkdownJob('sample.md', `---
title: "Senior Product Manager"
company: Example Co
status: "Ready to Apply"
url: https://example.com/jobs/123
date_added: "2026-06-22"
---
Build an excellent product.`);

    expect(job.filename).toBe('sample.md');
    expect(job.metadata).toMatchObject({
      title: 'Senior Product Manager',
      company: 'Example Co',
      status: 'Ready to Apply',
    });
    expect(job.description).toBe('Build an excellent product.');
  });

  it('retains body-only Markdown instead of discarding it', () => {
    const job = parseLegacyMarkdownJob('notes.md', 'No frontmatter available.');

    expect(job.metadata).toEqual({});
    expect(job.description).toBe('No frontmatter available.');
  });
});
