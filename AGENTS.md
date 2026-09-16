# Job Finder agent rules

## Ownership and scope

- Keep the TypeScript/SQLite pipeline at the repository root as the canonical
  implementation. `legacy/` is a preserved compatibility and data-import layer.
- Do not merge SQLite files manually. Import historical Markdown records through
  `npm run import-legacy` so deduplication and application status preservation
  are deterministic.
- Do not automate final job-application submission. Helpers may open, populate,
  and prepare a form; the candidate always reviews and submits it.

## Agent and sub-agent workflow

- The primary agent owns architecture, implementation, and validation end to end.
- Use a sub-agent only for an isolated, low-risk task such as inventorying
  sources, adding focused tests, or a mechanical migration. Give it a bounded
  objective and do not delegate integration decisions.
- Before any AI review, prefer deterministic checks: tests, typecheck, lint,
  and a dry run. Preserve user data and unrelated changes.

## Validation

After changing TypeScript code, run `npm test` and `npx tsc --noEmit`. For a
legacy import change, also run `npm run import-legacy -- --dry-run`.
