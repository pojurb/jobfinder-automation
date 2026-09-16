# Job Finder Automation

This is the merged job-search workspace for `jobfinder-automation` and
`jobfinder-automation-2`.

The TypeScript application at the repository root is the canonical system. It
uses SQLite, deterministic scoring, cross-source deduplication, ATS discovery,
reports, and a standalone dashboard. The original Python tracker is retained in
[`legacy/`](legacy/README.md) so its historical Markdown archive and optional
application helper remain available without creating two competing pipelines.

## What is included

- Public job sources: Remotive, RemoteOK, WeWorkRemotely, Wellfound, and more.
- Company ATS sources: Greenhouse, Lever, Ashby, and Workday.
- Company-first ATS discovery from `companies.yaml`.
- Local scoring for role, Indonesia/APAC remote eligibility, seniority, domain,
  AI/technical relevance, salary signal, and freshness.
- Historical migration of the 661 Markdown jobs from the original Python tool.
- A browser dashboard at `src/server/dashboard.html`, powered by
  `reports/latest-jobs.js`.

## Setup

```bash
npm install
npm run db:migrate
```

Configure `config.yaml` for sources and `config/profile.yaml` for scoring.
No API key is needed for the main pipeline; Wellfound is optional and may use a
token from `.env`.

## Daily workflow

```bash
npm run fetch
npm run score
npm run report
```

Or run the full pipeline with `npm run daily`.

Useful commands:

```bash
npm run discover -- --dry-run
npm run review -- --apply-ready
npm run export
```

## Community and LinkedIn leads

Candidate-provided LinkedIn posts and a direct Fluxon posting are preserved in
[`sources/linkedin-leads.yaml`](sources/linkedin-leads.yaml). These are a manual
discovery queue: LinkedIn may require authentication, so the main pipeline does
not scrape it. Review a lead, then add its company ATS board or direct posting
to the canonical fetch pipeline. Fluxon is already seeded as a Greenhouse
company for future discovery.

## Import the previous Python tracker

The legacy archive is already stored in `legacy/markdown-jobs`. Import it once
into SQLite, then score it using the current rules:

```bash
npm run import-legacy
npm run score
npm run report -- --all
```

The import is idempotent: repeat runs skip records already represented by the
same normalized title, company, and URL. Legacy scoring details stay in the raw
record; all imported jobs are scored with the current profile.

For details on the preserved Python tooling, see [`legacy/README.md`](legacy/README.md).

## Safety and collaboration

Final application submission is always manual. Agent and sub-agent rules for
future changes live in [`AGENTS.md`](AGENTS.md).
