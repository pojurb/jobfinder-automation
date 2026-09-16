# Legacy Python tracker

This directory preserves the useful parts of `jobfinder-automation-2` while the
TypeScript/SQLite app in the project root is the canonical pipeline.

- `markdown-jobs/` is the original 661-record Markdown archive.
- `python/` contains the previous scraper, dashboard builder, scorer, and the
  opt-in Playwright application helper. It is preserved for reference and is
  not invoked by the main pipeline.

Import the historical records with:

```bash
npm run import-legacy
npm run score
npm run report -- --all
```

The importer is safe to run repeatedly. It deduplicates using the same
normalized title/company/URL content hash as the current fetchers, stores the
old frontmatter in `raw_json`, retains each historical application status, and
leaves the job unscored so the current scoring rules are authoritative.

`python/apply.py` can open and pre-fill an application form, but it relies on a
local browser profile and optional `GEMINI_API_KEY`. It intentionally leaves
final submission to the user.
