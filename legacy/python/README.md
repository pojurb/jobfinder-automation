# Job Tracker & Scraper Pipeline

A lightweight, local, flat-file job tracking system that automates the process of finding, scoring, and managing job applications. It uses Markdown files as a database and compiles them into a single, interactive HTML dashboard.

## 🚀 Features

- **Multi-Source Scraping**: Automatically fetches job postings from LinkedIn, Hacker News (Who is Hiring), RemoteOK, JobStreet, Indeed, and Glassdoor using direct HTML scraping and DuckDuckGo search proxies to bypass anti-bot protections.
- **Robust Web Scraping**: Exponential backoff and retry logic handles rate limits and API failures. Automatically refetches "thin" or stub job descriptions.
- **Offline AI Scoring Engine**: Scores each job against your CV/profile locally. It uses a weighted keyword category system (e.g., matching Hard Skills, AI domains, remote preferences) and applies a confidence penalty based on description length to calculate a match percentage (0-100%).
- **Flat-File Database**: All jobs are saved as individual `.md` files in the `./jobs/` directory with YAML frontmatter. This means your data is future-proof, easily editable in any text editor, and version-controllable.
- **Standalone Interactive Dashboard**: Compiles all Markdown files into a beautiful, single-file `index.html` dashboard using TailwindCSS and vanilla JavaScript. Includes score gradients, badges, and quick-filter metrics.
- **Advanced Filtering**: Filter your job pipeline by Match Score (High/Good/Low), Work Type (Remote/Hybrid/On-site), Status, and Source directly in the browser.

## 📂 Project Structure

```text
.
├── jobs/               # Directory containing all scraped jobs as Markdown files
├── profile.json        # Your customized scoring profile (keyword categories & weights)
├── scrape.py           # The orchestration script to scrape jobs and run the scorer
├── score.py            # The offline scoring engine logic
├── build.py            # Compiles the jobs into the interactive dashboard
├── utils.py            # Shared utility library (Markdown parsing, filename sanitization)
└── index.html          # The generated, standalone dashboard (open in browser)
```

## 🛠️ Usage

### 1. Configure Your Profile
Edit `profile.json` to include the keywords and weights that matter to you. The scoring engine uses this file to calculate the `match_score` for every job.

### 2. Run the Scraping Pipeline
Run the scraper to fetch new jobs, score them, and automatically build the dashboard.

```bash
# On Windows, ensure UTF-8 encoding is used for the terminal
$env:PYTHONIOENCODING='utf-8'; python scrape.py
```

The script will:
1. Hit all configured sources.
2. Deduplicate against existing jobs.
3. Save new jobs to `./jobs/`.
4. Run the scoring engine on new jobs.
5. Compile the `index.html` dashboard.

### 3. View Your Dashboard
Open `index.html` in your web browser. You can click on any job card to view the full details, extracted metadata, and the direct link to apply.

### 4. Update Job Statuses
To move a job through your pipeline (e.g., from "Ready to Apply" to "Interviewing"), simply open the corresponding Markdown file in `./jobs/` and edit the `status` field in the YAML frontmatter. 

```yaml
---
title: "Senior Product Manager"
company: "Tech Corp"
status: "Interviewing"
...
---
```

Run `python build.py` to regenerate the dashboard with the updated statuses.

## ⚙️ Requirements
- Python 3.x
- No heavy external dependencies (uses standard library `urllib`, `html.parser`, etc. where possible).

## 🤖 Automation (Windows)
To automatically run the scraper in the background:
1. Run `setup_task.bat` to create a scheduled task that runs `auto_scrape.bat`.
2. Or use `sync.py` if you prefer a Python-based background worker.
