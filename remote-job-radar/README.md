# Remote Job Radar 📡

A fully automated, CLI-based job discovery and scoring pipeline tailored for finding high-quality remote opportunities. Designed to sidestep crowded job boards, automatically discover direct ATS (Applicant Tracking System) listings, filter out bad fits, and use AI to score the remaining jobs based on your exact preferences.

## What this tool does

Remote Job Radar executes a 3-step pipeline:
1. **Fetch**: Pulls raw job data from aggregator feeds (Remotive, RemoteOK) and auto-discovers hidden company boards hosted on Greenhouse, Lever, and Ashby.
2. **Score**: Evaluates each job against local rules to instantly hard-reject obvious misfits (e.g., non-remote, junior roles). The survivors are evaluated by Google's Gemini AI to compute a comprehensive score (0-100) based on seniority, role match, domain preference, and freshness.
3. **Report**: Generates clean Markdown and CSV reports bucketing jobs into Top Matches, Manual Review, and Rejections, complete with "Why it matched" summaries and direct apply links.

## Setup Steps

1. **Clone the repository** and install dependencies:
   ```bash
   npm install
   ```
2. **Initialize the database**:
   ```bash
   npm run db:push
   ```
3. **Configure your Profile**: 
   Edit the `config/profile.yaml` to specify your role, target locations, domains, and hard rejects.
4. **Setup Environment Variables**:
   Copy the example file and add your Gemini API key.
   ```bash
   cp .env.example .env
   ```

## Environment Variables

The project uses a `.env` file to manage secrets:
- `GEMINI_API_KEY`: **(Required)** Your Google Gemini API Key used by the scoring engine to evaluate job descriptions.

## How to configure `profile.yaml`

The `config/profile.yaml` file acts as the "brain" for the pre-filter and the AI.

- **`role` and `location`**: Tells the AI who you are and where you are located.
- **`scoring_weights`**: Defines the maximum point value for each category (totaling 100).
- **`preferences.domains`**: A list of industries you prefer (e.g., SaaS, FinTech). The AI checks the job description against this list for extra points.
- **`hard_rejects`**: A powerful local pre-filter. Jobs containing these keywords in their title, location, or description are instantly dropped (given a 0 score) without wasting API tokens. Categories include `locations_only` (e.g., "us only"), `work_types` (e.g., "hybrid", "onsite"), and `seniorities` (e.g., "junior").

## CLI Commands

- **`npm run fetch`**: Discovers and downloads jobs. Can be targeted to a single source with `npm run fetch -- --source greenhouse`.
- **`npm run score`**: Runs the unscored jobs through the hard-reject pre-filter and Gemini AI.
- **`npm run report`**: Reads the scored jobs and spits out Markdown and CSV lists into the `reports/` folder.
- **`npm run daily`**: **Recommended.** Chains all three commands `fetch -> score -> report`. Run this every morning.
- **`npm run list`**: Prints all the active ATS company boards currently being tracked by the database.
- **`npm run export`**: Exports the entire database of fetched and scored jobs to a master CSV file.

## How Scoring Works

Every job starts unscored. 
1. **Freshness Math**: The job's age is calculated locally. (< 3 days = 5pts, < 7 days = 3pts, < 14 days = 1pt).
2. **The Pre-filter**: The text is scanned against your `hard_rejects` lists. If it triggers a rule, it immediately gets `totalScore: 0`, a rejection reason is logged, and the process ends.
3. **The AI Evaluation**: If it passes the pre-filter, the title, company, location, and description are sent to Google Gemini via Structured Outputs. The AI awards points across 4 categories (Role Match, Remote Eligibility, Seniority, Domain Relevance) up to the maximums defined in your config.
4. **Total**: The AI scores and the freshness score are combined to create the `totalScore`.
   - `> 70`: Top Match
   - `31 - 69`: Manual Review
   - `<= 30`: Rejected

## How to add a new job source

1. **Create the Fetcher**: Add a new file in `src/fetchers/my-source.ts`. Implement the `JobFetcher` interface.
2. **Normalize Data**: Ensure the raw response is mapped to the standard `NormalizedJob` format.
3. **Generate a Hash**: Call `computeContentHash` with the source, title, company, and url.
4. **Register**: Add the new fetcher to the `FETCHERS` array in `src/fetchers/index.ts`.

## Known Limitations

- **Staleness**: Some auto-discovered ATS boards may eventually be taken down by the company. The system attempts to track fetch failures and marks boards inactive after consecutive misses, but occasional manual cleanup of the `discovered_companies` table might be required.
- **Rate Limits**: The ATS endpoints (Greenhouse/Lever/Ashby) do not have official public SLAs. Heavy or overly aggressive fetching might result in temporary IP bans. Rate limiting and Axios retries are built-in to mitigate this.

## Why LinkedIn is not scraped

This tool specifically avoids scraping LinkedIn. LinkedIn heavily restricts automated access, constantly deploys bot-detection measures, and utilizes dynamic DOMs that frequently break scrapers. Bypassing these measures usually results in account bans or requires expensive proxy networks. 

Instead, this tool focuses on the source of truth: **Aggregators** (via official APIs) and **ATS Systems** (via public unauthenticated JSON boards). By pulling directly from Greenhouse, Lever, and Ashby, we get cleaner data, faster performance, and completely bypass LinkedIn's walled garden.
