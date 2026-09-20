# Job Finder Automation

This is the merged job-search workspace for `jobfinder-automation` and
`jobfinder-automation-2`.

The TypeScript application at the repository root is the canonical system. It
uses SQLite, deterministic scoring, cross-source deduplication, ATS discovery,
reports, and a standalone dashboard. The original Python tracker is retained in
[`legacy/`](legacy/README.md) so its historical Markdown archive and optional
application helper remain available without creating two competing pipelines.

## What is included

- Public job sources: Remotive, RemoteOK, and WeWorkRemotely.
- Company ATS sources: Greenhouse, Lever, and Ashby.
- Company-first ATS discovery from `companies.yaml`.
- Deterministic local scoring for role, Indonesia/APAC remote eligibility,
  seniority, domain, AI/technical relevance, salary signal, and freshness.
- Historical migration of the 661 Markdown jobs from the original Python tool.
- A browser dashboard at `src/server/dashboard.html`, powered by
  `reports/latest-jobs.js`.

## Setup

```bash
npm install
npm run db:migrate
```

Configure `config.yaml` for sources and `config/profile.yaml` for scoring.
No API key is needed for the main pipeline.

## Daily workflow

```bash
npm run fetch
npm run score
npm run report
```

Or run the full pipeline with `npm run daily`.

### Run automatically every five hours (Linux)

This machine uses a systemd **user** timer rather than cron, Docker, or a
long-running process. It runs at 00:00, 05:00, 10:00, 15:00, and 20:00 local
time. A missed run is started at the next user-session opportunity, and both
stdout and stderr append to `logs/job-finder-daily.log`.

Install or update the timer from the repository root:

```bash
mkdir -p "$HOME/.config/systemd/user" logs
install -m 0644 systemd/job-finder-daily.service systemd/job-finder-daily.timer "$HOME/.config/systemd/user/"
systemctl --user daemon-reload
systemctl --user enable --now job-finder-daily.timer
systemctl --user list-timers job-finder-daily.timer
```

Inspect the most recent run with `systemctl --user status job-finder-daily.service`
or follow the log with `tail -f logs/job-finder-daily.log`. To stop it, run
`systemctl --user disable --now job-finder-daily.timer`.

Useful commands:

```bash
npm run discover -- --dry-run
npm run review -- --apply-ready
npm run export
npm run funnel
npm run funnel -- --include-stale
npm run funnel -- --include-uncertain
```

## Human application tracking

This tool never submits an application. After you decide what to do, record
your own action and use the funnel to see the remaining backlog and follow-ups:

```bash
npm run apply -- --job 123 --status applied --notes "Submitted on company site"
npm run apply -- --job 123 --status interviewing --notes "Recruiter call booked for Friday"
npm run funnel
```

Statuses are `pending`, `applied`, `interviewing`, `rejected`, and `ghosted`.
Notes are appended to preserve the history of your decisions. `funnel` excludes
jobs marked as legacy junk, defaults to jobs verified within the last 14 days,
requires explicit Indonesia/APAC/worldwide eligibility, and flags unchanged
applications older than seven days. Add `--include-stale` only when you
intentionally want to inspect historical results; add `--include-uncertain`
to review bare-remote jobs whose location eligibility needs human confirmation.

## CV tailoring evidence policy

CV and cover-letter drafts use the strongest relevant, candidate-provided evidence
from [`base-cv.md`](base-cv.md) and
[`candidate-evidence.md`](candidate-evidence.md), which consolidates the raw
interview evidence retained in `legacy/python/`. A draft may promote specific
evidence beyond the bullets in `base-cv.md`; it must remain traceable to these
sources and must not invent an employer, metric, skill, domain, or management
experience. The candidate reviews every factual claim before manual submission.

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

To identify obvious non-job posts imported by the historical scraper, inspect
the candidates first. Nothing changes unless `--apply` is explicitly supplied:

```bash
npm run legacy-junk
npm run legacy-junk -- --apply
```

For details on the preserved Python tooling, see [`legacy/README.md`](legacy/README.md).

## Safety and collaboration

Final application submission is always manual. Agent and sub-agent rules for
future changes live in [`AGENTS.md`](AGENTS.md).
