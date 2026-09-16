#!/usr/bin/env python3
"""
Multi-Source Job Scraper
Scrapes PM jobs from RemoteOK, HN, LinkedIn, Indeed, Glassdoor, and JobStreet.
Uses only Python standard library (urllib, html.parser, json, re).
"""

import os
import re
import json
import time
import hashlib
import urllib.request
import urllib.parse
import urllib.error
import ssl
import random
import sys
if sys.stdout.encoding.lower() != 'utf-8':
    sys.stdout.reconfigure(encoding='utf-8')
import subprocess
import argparse
from html import unescape
from html.parser import HTMLParser
from datetime import datetime

JOBS_DIR = "jobs"

PM_KEYWORDS = [
    "product manager",
    "product owner",
    "product lead",
    "head of product",
    "director of product",
    "director product",
    "vp of product",
    "vp product",
    "senior product manager",
    "group product manager",
]

SOURCE_LABELS = {
    "linkedin",
    "glassdoor",
    "indeed",
    "jobstreet",
    "remoteok",
    "duckduckgo",
}

USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
]


def get_headers():
    """Return headers with a random user agent."""
    return {
        "User-Agent": random.choice(USER_AGENTS),
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Accept-Encoding": "identity",
        "Connection": "keep-alive",
    }


def make_request(url, headers=None, timeout=20, max_retries=2):
    """Make an HTTP GET request with SSL bypass, error handling, and retries with backoff."""
    if headers is None:
        headers = get_headers()
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE

    req = urllib.request.Request(url, headers=headers)
    
    for attempt in range(max_retries + 1):
        try:
            with urllib.request.urlopen(req, timeout=timeout, context=ctx) as resp:
                return resp.read().decode("utf-8", errors="replace")
        except urllib.error.HTTPError as e:
            # Handle rate limit (429) specially
            if e.code == 429:
                retry_after = e.headers.get("Retry-After")
                wait_time = int(retry_after) if retry_after and retry_after.isdigit() else (10 * (2 ** attempt))
                print(f"    ⚠ HTTP 429 (Rate Limited) for {url[:70]}. Waiting {wait_time}s (attempt {attempt + 1}/{max_retries + 1})...")
                if attempt < max_retries:
                    time.sleep(wait_time)
                    continue
            elif e.code in [500, 502, 503, 504]:
                wait_time = 3 * (2 ** attempt)
                print(f"    ⚠ HTTP {e.code} for {url[:70]}. Retrying in {wait_time}s (attempt {attempt + 1}/{max_retries + 1})...")
                if attempt < max_retries:
                    time.sleep(wait_time)
                    continue
            else:
                print(f"    ⚠ HTTP {e.code} for {url[:80]}...")
                return None
        except (urllib.error.URLError, TimeoutError) as e:
            wait_time = 3 * (2 ** attempt)
            print(f"    ⚠ Request failed ({e}). Retrying in {wait_time}s (attempt {attempt + 1}/{max_retries + 1})...")
            if attempt < max_retries:
                time.sleep(wait_time)
                continue
        except Exception as e:
            print(f"    ⚠ Request failed: {e}")
            return None
            
    return None


def sanitize_filename(text):
    """Create a safe filename from text."""
    text = re.sub(r"[^\w\s-]", "", text.lower())
    text = re.sub(r"[\s]+", "_", text.strip())
    return text[:60]


def normalize_whitespace(text):
    """Collapse repeated whitespace and trim."""
    return re.sub(r"\s+", " ", (text or "")).strip()


def fetch_full_jd(url, source_name):
    """Fetch the full job description text from a job URL."""
    if not url or not url.startswith("http"):
        return None
        
    print(f"      [JD Fetch] Fetching full JD from {source_name}...")
    html_content = make_request(url, timeout=10)
    if not html_content:
        return None
        
    try:
        if source_name == "LinkedIn":
            m = re.search(r'show-more-less-html__markup[^>]*>(.*?)</div>', html_content, re.DOTALL)
            if m:
                content = m.group(1)
                clean = re.sub(r'<[^>]+>', '\n', content)
                return unescape(re.sub(r'\n+', '\n', clean).strip())
                
        elif source_name == "JobStreet":
            m = re.search(r'data-automation="jobDescription"[^>]*>(.*?)</section>', html_content, re.DOTALL)
            if not m:
                m = re.search(r'data-automation="jobDescription"[^>]*>(.*?)</div>', html_content, re.DOTALL)
            if m:
                content = m.group(1)
                clean = re.sub(r'<[^>]+>', '\n', content)
                return unescape(re.sub(r'\n+', '\n', clean).strip())
                
        # Generic fallback for duckduckgo links or others
        m = re.search(r'<article[^>]*>(.*?)</article>', html_content, re.DOTALL | re.IGNORECASE)
        if not m:
            m = re.search(r'<main[^>]*>(.*?)</main>', html_content, re.DOTALL | re.IGNORECASE)
        if not m:
            m = re.search(r'<body[^>]*>(.*?)</body>', html_content, re.DOTALL | re.IGNORECASE)
            
        if m:
            content = m.group(1)
            # Remove scripts, styles, navs before stripping tags
            content = re.sub(r'<script[^>]*>.*?</script>', '', content, flags=re.DOTALL | re.IGNORECASE)
            content = re.sub(r'<style[^>]*>.*?</style>', '', content, flags=re.DOTALL | re.IGNORECASE)
            content = re.sub(r'<nav[^>]*>.*?</nav>', '', content, flags=re.DOTALL | re.IGNORECASE)
            content = re.sub(r'<header[^>]*>.*?</header>', '', content, flags=re.DOTALL | re.IGNORECASE)
            content = re.sub(r'<footer[^>]*>.*?</footer>', '', content, flags=re.DOTALL | re.IGNORECASE)
            clean = re.sub(r'<[^>]+>', '\n', content)
            return unescape(re.sub(r'\s*\n\s*', '\n', clean).strip())
    except Exception:
        pass
    return None


def normalize_url(url):
    """Drop query-string noise so the same posting is easier to dedupe."""
    url = normalize_whitespace(url)
    if not url:
        return ""

    parts = urllib.parse.urlsplit(url)
    scheme = parts.scheme or "https"
    netloc = parts.netloc.lower()
    path = re.sub(r"/{2,}", "/", parts.path).rstrip("/")
    return urllib.parse.urlunsplit((scheme, netloc, path, "", ""))


def strip_html(text):
    """Convert lightweight HTML to plain text."""
    text = re.sub(r"<[^>]+>", " ", text or "")
    text = unescape(text)
    return normalize_whitespace(text)


def normalize_title(title, fallback="Product Manager"):
    """Standardize noisy titles from search results."""
    cleaned = strip_html(title)
    cleaned = re.sub(
        r"\s*[-|:]\s*(LinkedIn|Glassdoor|Indeed|JobStreet|Jobstreet|RemoteOK)\b.*$",
        "",
        cleaned,
        flags=re.IGNORECASE,
    )
    cleaned = cleaned.strip(" -|:")
    return cleaned or fallback


def normalize_company(company, source_name=""):
    """Remove site labels and normalize spacing."""
    cleaned = strip_html(company)
    cleaned = re.sub(
        r"\b(LinkedIn|Glassdoor|Indeed|JobStreet|Jobstreet|RemoteOK|DuckDuckGo)\b",
        "",
        cleaned,
        flags=re.IGNORECASE,
    )
    cleaned = cleaned.strip(" -|:,")
    if cleaned:
        return cleaned
    return f"Unknown ({source_name})" if source_name else "Unknown"


def infer_work_type(*texts):
    """Infer remote/hybrid/on-site hints from any supplied text."""
    haystack = " ".join(normalize_whitespace(text).lower() for text in texts if text)
    if "hybrid" in haystack:
        return "Hybrid"
    if any(token in haystack for token in ("on-site", "on site", "onsite")):
        return "On-site"
    if any(token in haystack for token in ("remote", "work from home", "wfh")):
        return "Remote"
    return "See posting"


def normalize_description(description):
    """Keep markdown readable without runaway whitespace."""
    cleaned = (description or "No description available.").replace("\r\n", "\n")
    cleaned = re.sub(r"[ \t]+\n", "\n", cleaned)
    cleaned = re.sub(r"\n{3,}", "\n\n", cleaned)
    return cleaned.strip()


def split_search_result_title(raw_title):
    """Best-effort split for search result titles like 'Role - Company | Site'."""
    segments = [
        segment.strip()
        for segment in re.split(r"\s+\|\s+|\s+-\s+|\s+:\s+", normalize_whitespace(unescape(raw_title)))
        if segment.strip()
    ]
    segments = [segment for segment in segments if segment.lower() not in SOURCE_LABELS]

    if not segments:
        return "Product Manager", "Unknown"
    if len(segments) == 1:
        return normalize_title(segments[0]), "Unknown"
    return normalize_title(segments[0]), normalize_company(segments[1])


def normalize_job(job):
    """Normalize scraped job records before deduping or writing."""
    source = normalize_whitespace(job.get("source", "Unknown")) or "Unknown"
    title = normalize_title(job.get("title", ""), "Product Manager")
    company = normalize_company(job.get("company", ""), source)
    location = normalize_whitespace(job.get("location", "")) or "See posting"
    work_type = normalize_whitespace(job.get("work_type", ""))
    if not work_type or work_type in {"Unknown", "See posting"}:
        work_type = infer_work_type(location, job.get("description", ""))

    raw_date = normalize_whitespace(job.get("date_added", ""))
    try:
        datetime.strptime(raw_date, "%Y-%m-%d")
        date_added = raw_date
    except ValueError:
        date_added = datetime.now().strftime("%Y-%m-%d")

    return {
        "title": title,
        "company": company,
        "url": normalize_url(job.get("url", "")),
        "date_added": date_added,
        "source": source,
        "location": location,
        "work_type": work_type or "See posting",
        "description": normalize_description(job.get("description", "")),
    }


def generate_job_id(title, company):
    """Generate a unique hash for deduplication."""
    key = f"{normalize_title(title).lower()}|{normalize_company(company).lower()}"
    return hashlib.md5(key.encode()).hexdigest()[:12]


def get_existing_job_state():
    """Scan existing .md files and return dedupe fingerprints and URLs."""
    existing = {"ids": set(), "urls": set()}
    if not os.path.exists(JOBS_DIR):
        os.makedirs(JOBS_DIR)
        return existing

    for fname in os.listdir(JOBS_DIR):
        if not fname.endswith(".md"):
            continue
        filepath = os.path.join(JOBS_DIR, fname)
        try:
            with open(filepath, "r", encoding="utf-8") as fh:
                content = fh.read(2000)  # Only need frontmatter
            title_m = re.search(r'^title:\s*"(.+?)"', content, re.MULTILINE)
            company_m = re.search(r'^company:\s*"(.+?)"', content, re.MULTILINE)
            url_m = re.search(r'^url:\s*"(.+?)"', content, re.MULTILINE)
            if title_m and company_m:
                existing["ids"].add(generate_job_id(title_m.group(1), company_m.group(1)))
            if url_m:
                normalized = normalize_url(url_m.group(1))
                if normalized:
                    existing["urls"].add(normalized)
        except Exception:
            pass
    return existing


def count_saved_jobs():
    """Count markdown job files."""
    if not os.path.exists(JOBS_DIR):
        return 0
    return sum(1 for fname in os.listdir(JOBS_DIR) if fname.endswith(".md"))


def dedupe_jobs(jobs):
    """Deduplicate normalized jobs inside a scrape batch."""
    seen_ids = set()
    seen_urls = set()
    unique = []

    for job in jobs:
        normalized = normalize_job(job)
        job_id = generate_job_id(normalized["title"], normalized["company"])
        job_url = normalized["url"]
        if job_id in seen_ids or (job_url and job_url in seen_urls):
            continue
        seen_ids.add(job_id)
        if job_url:
            seen_urls.add(job_url)
        unique.append(normalized)

    return unique


def save_job(job, existing_state):
    """Save a job dict as a markdown file. Returns True if new job saved."""
    job = normalize_job(job)
    title = job.get("title", "Unknown").replace('"', "'")
    company = job.get("company", "Unknown").replace('"', "'")
    job_id = generate_job_id(title, company)
    job_url = job.get("url", "")

    if job_id in existing_state["ids"] or (job_url and job_url in existing_state["urls"]):
        return False

    existing_state["ids"].add(job_id)
    if job_url:
        existing_state["urls"].add(job_url)

    date_added = job.get("date_added", datetime.now().strftime("%Y-%m-%d"))
    filename = f"{sanitize_filename(company)}_{sanitize_filename(title)}_{date_added}.md"
    filepath = os.path.join(JOBS_DIR, filename)

    # Avoid overwriting
    counter = 1
    while os.path.exists(filepath):
        filepath = os.path.join(JOBS_DIR, f"{counter}_{filename}")
        counter += 1

    url = job.get("url", "").replace('"', "%22")
    location = job.get("location", "See posting").replace('"', "'")
    work_type = job.get("work_type", "See posting").replace('"', "'")
    source = job.get("source", "Unknown").replace('"', "'")
    
    description = job.get("description", "No description available.")
    
    # Only fetch full JD if it's not Hacker News or RemoteOK (they already provide full desc)
    if source not in ["Hacker News", "RemoteOK"]:
        full_jd = fetch_full_jd(job.get("url", ""), source)
        if full_jd:
            description += f"\n\n### Full Job Description\n{full_jd}"

    content = f"""---
title: "{title}"
company: "{company}"
match_score: 0
status: "Ready to Apply"
url: "{url}"
date_added: "{date_added}"
source: "{source}"
location: "{location}"
work_type: "{work_type}"
---
{description}
"""

    with open(filepath, "w", encoding="utf-8") as f:
        f.write(content)

    return True


# ============================================================
#  SCRAPER: RemoteOK (JSON API)
# ============================================================

def scrape_remoteok():
    """Scrape RemoteOK public JSON API for PM roles."""
    print("\n  📡 [1/6] RemoteOK (JSON API)...")
    jobs = []

    headers = get_headers()
    headers["Accept"] = "application/json"
    data = make_request("https://remoteok.com/api", headers=headers)

    if not data:
        print("    ❌ Could not reach RemoteOK API")
        return jobs

    try:
        listings = json.loads(data)
        # First element is often metadata/legal notice
        if isinstance(listings, list) and len(listings) > 1:
            listings = listings[1:]

        for item in listings:
            position = item.get("position", "").lower()
            tags = " ".join(item.get("tags", [])).lower()
            searchable = f"{position} {tags}"

            if not any(kw in searchable for kw in PM_KEYWORDS):
                continue

            desc = strip_html(item.get("description", ""))

            raw_date = item.get("date", "")[:10]
            try:
                datetime.strptime(raw_date, "%Y-%m-%d")
            except ValueError:
                raw_date = datetime.now().strftime("%Y-%m-%d")

            slug = item.get("slug", item.get("id", ""))
            jobs.append({
                "title": item.get("position", "Product Manager"),
                "company": item.get("company", "Unknown"),
                "url": f"https://remoteok.com/remote-jobs/{slug}" if slug else "",
                "date_added": raw_date,
                "source": "RemoteOK",
                "location": item.get("location", "Remote"),
                "work_type": "Remote",
                "description": f"### Job Description\n{desc[:4000]}",
            })

    except (json.JSONDecodeError, TypeError) as e:
        print(f"    ⚠ JSON parse error: {e}")

    print(f"    ✅ Found {len(jobs)} PM jobs")
    return jobs


# ============================================================
#  SCRAPER: Remotive (JSON API)
# ============================================================

def scrape_remotive():
    """Scrape Remotive JSON API for PM roles."""
    print("\n  📡 [New] Remotive (JSON API)...")
    jobs = []

    headers = get_headers()
    headers["Accept"] = "application/json"
    data = make_request("https://remotive.com/api/remote-jobs?category=product", headers=headers)

    if not data:
        print("    ❌ Could not reach Remotive API")
        return jobs

    try:
        response = json.loads(data)
        listings = response.get("jobs", [])

        for item in listings:
            position = item.get("title", "").lower()
            
            if not any(kw in position for kw in PM_KEYWORDS):
                continue

            desc = strip_html(item.get("description", ""))

            raw_date = item.get("publication_date", "")[:10]
            try:
                if raw_date:
                    datetime.strptime(raw_date, "%Y-%m-%d")
                else:
                    raw_date = datetime.now().strftime("%Y-%m-%d")
            except ValueError:
                raw_date = datetime.now().strftime("%Y-%m-%d")

            jobs.append({
                "title": item.get("title", "Product Manager"),
                "company": item.get("company_name", "Unknown"),
                "url": item.get("url", ""),
                "date_added": raw_date,
                "source": "Remotive",
                "location": item.get("candidate_required_location", "Remote"),
                "work_type": "Remote",
                "description": f"### Job Description\n{desc[:4000]}",
            })

    except (json.JSONDecodeError, TypeError) as e:
        print(f"    ⚠ JSON parse error: {e}")

    print(f"    ✅ Found {len(jobs)} PM jobs")
    return jobs


# ============================================================
#  SCRAPER: Hacker News "Who is Hiring" (Algolia API)
# ============================================================

def scrape_hn_who_is_hiring():
    """Scrape the latest HN 'Who is Hiring' thread via Algolia API."""
    print("\n  📡 [2/6] Hacker News 'Who is Hiring' (Algolia API)...")
    jobs = []

    # Step 1: Find latest "Who is Hiring" story
    search_url = (
        "https://hn.algolia.com/api/v1/search?"
        "query=%22Ask%20HN%3A%20Who%20is%20hiring%22"
        "&tags=story&hitsPerPage=5"
    )
    data = make_request(search_url)
    if not data:
        return jobs

    try:
        result = json.loads(data)
    except json.JSONDecodeError:
        print("    ⚠ Failed to parse Algolia response")
        return jobs

    story_id = None
    for hit in result.get("hits", []):
        t = hit.get("title", "").lower()
        if "who is hiring" in t and "wants" not in t:
            story_id = hit.get("objectID")
            print(f"    📰 Thread: {hit.get('title')}")
            break

    if not story_id:
        print("    ⚠ No 'Who is Hiring' thread found")
        return jobs

    # Step 2: Fetch top-level comments
    page = 0
    all_comments = []
    while page < 3:  # Max 3 pages
        comments_url = (
            f"https://hn.algolia.com/api/v1/search?"
            f"tags=comment,story_{story_id}&hitsPerPage=200&page={page}"
        )
        cdata = make_request(comments_url)
        if not cdata:
            break
        try:
            parsed = json.loads(cdata)
            hits = parsed.get("hits", [])
            if not hits:
                break
            all_comments.extend(hits)
            page += 1
            time.sleep(0.5)
        except json.JSONDecodeError:
            break

    # Step 3: Filter for PM-related comments
    for comment in all_comments:
        raw_html = comment.get("comment_text", "") or ""
        text_lower = raw_html.lower()

        if not any(kw in text_lower for kw in PM_KEYWORDS):
            continue

        # Strip HTML tags
        clean = re.sub(r"<[^>]+>", "\n", raw_html)
        clean = re.sub(r"&[a-z]+;", " ", clean)
        lines = [l.strip() for l in clean.split("\n") if l.strip()]

        if not lines:
            continue

        # First line is usually "Company | Title | Location | ..."
        header = lines[0]
        parts = re.split(r"\s*\|\s*", header)
        company = parts[0].strip()[:60] if parts else "Unknown (HN)"
        title = "Product Manager"
        location = "Unknown"
        work_type = "Unknown"

        for part in parts:
            pl = part.lower()
            for kw in PM_KEYWORDS:
                if kw in pl:
                    title = normalize_title(part.strip(), "Product Manager")
                    break
            if any(loc in pl for loc in ["remote", "onsite", "hybrid"]):
                location = part.strip()
                if "remote" in pl:
                    work_type = "Remote"
                elif "hybrid" in pl:
                    work_type = "Hybrid"
                else:
                    work_type = "On-site"

        # Find a URL if any
        url_match = re.search(r"https?://[^\s<\"]+", raw_html)
        hn_item_url = f"https://news.ycombinator.com/item?id={comment.get('objectID', '')}"
        url = url_match.group(0) if url_match else hn_item_url

        body_lines = lines[1:] if len(lines) > 1 else lines
        body = "\n".join(f"- {strip_html(l)}" for l in body_lines[:20])

        jobs.append({
            "title": title,
            "company": company,
            "url": url,
            "date_added": datetime.now().strftime("%Y-%m-%d"),
            "source": "Hacker News",
            "location": location,
            "work_type": work_type,
            "description": f"### HN Who is Hiring\n{body[:4000]}",
        })

    print(f"    ✅ Found {len(jobs)} PM jobs")
    return jobs


# ============================================================
#  SCRAPER: DuckDuckGo HTML Search Proxy (replaces Google)
# ============================================================

class DuckDuckGoParser(HTMLParser):
    """Parse DuckDuckGo HTML search results."""

    def __init__(self):
        super().__init__()
        self.results = []
        self._in_title = False
        self._current_title = ""
        self._current_url = ""
        self._in_snippet = False
        self._current_snippet = ""

    def handle_starttag(self, tag, attrs):
        d = dict(attrs)
        cls = d.get("class", "")

        # DuckDuckGo result links
        if tag == "a" and "result__a" in cls:
            href = d.get("href", "")
            # DDG sometimes wraps URLs
            if href.startswith("//duckduckgo.com/l/?uddg="):
                m = re.search(r"uddg=([^&]+)", href)
                if m:
                    href = urllib.parse.unquote(m.group(1))
            elif href.startswith("//"):
                href = "https:" + href
            self._current_url = href
            self._in_title = True
            self._current_title = ""

        # Snippet
        if tag == "a" and "result__snippet" in cls:
            self._in_snippet = True
            self._current_snippet = ""

    def handle_data(self, data):
        if self._in_title:
            self._current_title += data
        if self._in_snippet:
            self._current_snippet += data

    def handle_endtag(self, tag):
        if tag == "a" and self._in_title:
            self._in_title = False
            if self._current_url and self._current_title.strip():
                self.results.append({
                    "url": self._current_url,
                    "title": self._current_title.strip(),
                    "snippet": "",
                })
        if tag == "a" and self._in_snippet:
            self._in_snippet = False
            if self.results and self._current_snippet.strip():
                self.results[-1]["snippet"] = self._current_snippet.strip()


def _scrape_via_duckduckgo(site_domain, source_name, label_index):
    """Search for PM jobs on a specific site using DuckDuckGo HTML search."""
    print(f"\n  📡 [{label_index}/6] {source_name} (via DuckDuckGo)...")
    jobs = []

    raw_queries = [
        f'site:{site_domain} "product manager" remote',
        f'site:{site_domain} "product manager" indonesia',
        f'site:{site_domain} "senior product manager"',
    ]

    for raw_q in raw_queries:
        q = urllib.parse.quote_plus(raw_q)
        url = f"https://html.duckduckgo.com/html/?q={q}"
        headers = get_headers()
        headers["Referer"] = "https://duckduckgo.com/"

        data = make_request(url, headers=headers)
        if not data:
            continue

        parser = DuckDuckGoParser()
        try:
            parser.feed(data)
        except Exception:
            pass

        for r in parser.results:
            r_url = r.get("url", "")
            domain_root = site_domain.split("/")[0]
            if domain_root not in r_url:
                continue

            raw_title = r.get("title", "")
            title, company = split_search_result_title(raw_title)
            if company == "Unknown":
                company = f"Unknown ({source_name})"

            snippet = r.get("snippet", "")
            loc = "Indonesia" if "jobstreet" in site_domain else "See posting"
            combined = (snippet + " " + raw_title).lower()
            wt = infer_work_type(combined)
            if wt == "Remote":
                loc = "Remote"
            if "indonesia" in combined:
                loc = "Indonesia"
            if "jakarta" in combined:
                loc = "Jakarta, Indonesia"

            jobs.append({
                "title": title[:120],
                "company": company[:80],
                "url": r_url,
                "date_added": datetime.now().strftime("%Y-%m-%d"),
                "source": source_name,
                "location": loc,
                "work_type": wt,
                "description": (
                    f"### {source_name} Listing\n"
                    f"- {snippet if snippet else 'Visit the link for full details.'}\n"
                    f"- **Source**: [View on {source_name}]({r_url})"
                ),
            })

        time.sleep(random.uniform(2, 3))

    unique = dedupe_jobs(jobs)

    print(f"    ✅ Found {len(unique)} PM jobs")
    return unique


# ============================================================
#  SCRAPER: LinkedIn Public Jobs (Direct)
# ============================================================

class LinkedInJobParser(HTMLParser):
    """Parse LinkedIn public job search result pages."""

    def __init__(self):
        super().__init__()
        self.jobs = []
        self._in_title = False
        self._in_company = False
        self._in_location = False
        self._current = {}
        self._tag_stack = []

    def handle_starttag(self, tag, attrs):
        d = dict(attrs)
        cls = d.get("class", "")
        self._tag_stack.append(tag)

        # Job title link
        if tag == "a" and "base-card__full-link" in cls:
            self._current["url"] = d.get("href", "").split("?")[0]
            self._in_title = True
            self._current["title"] = ""

        # Also try h3 with specific class
        if tag == "h3" and "base-search-card__title" in cls:
            self._in_title = True
            self._current["title"] = ""

        # Company
        if tag == "h4" and "base-search-card__subtitle" in cls:
            self._in_company = True
            self._current["company"] = ""

        if tag == "a" and "hidden-nested-link" in cls:
            self._in_company = True
            self._current["company"] = ""

        # Location
        if tag == "span" and "job-search-card__location" in cls:
            self._in_location = True
            self._current["location"] = ""

    def handle_data(self, data):
        data = data.strip()
        if not data:
            return
        if self._in_title:
            self._current["title"] = self._current.get("title", "") + data
        if self._in_company:
            self._current["company"] = self._current.get("company", "") + data
        if self._in_location:
            self._current["location"] = self._current.get("location", "") + data

    def handle_endtag(self, tag):
        if self._tag_stack:
            self._tag_stack.pop()

        if tag in ("a", "h3") and self._in_title:
            self._in_title = False
        if tag in ("h4", "a") and self._in_company:
            self._in_company = False
        if tag == "span" and self._in_location:
            self._in_location = False
            # Save when we have the location (usually last field per card)
            if self._current.get("title"):
                self.jobs.append(dict(self._current))
                self._current = {}


def scrape_linkedin():
    """Scrape LinkedIn public job search (no login required) using fragment API with pagination."""
    print("\n  📡 [3/6] LinkedIn (fragment API)...")
    jobs = []

    searches = [
        ("product%20manager", "Worldwide", "f_WT=2"),  # Remote filter
        ("product%20manager", "Indonesia", ""),
        ("senior%20product%20manager", "Worldwide", "f_WT=2"),
    ]

    for keywords, location, extra in searches:
        loc_encoded = urllib.parse.quote_plus(location)
        for start in range(0, 100, 25):  # 4 pages
            url = f"https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?keywords={keywords}&location={loc_encoded}&{extra}&sortBy=DD&start={start}"
            data = make_request(url)
            if not data:
                continue

            parser = LinkedInJobParser()
            try:
                parser.feed(data)
            except Exception:
                pass

            for r in parser.jobs:
                loc = r.get("location", "See posting").strip()
                wt = infer_work_type(loc)
                if wt == "See posting" and "f_WT=2" in extra:
                    wt = "Remote"

                job_url = r.get("url", "").strip()
                if job_url and not job_url.startswith("http"):
                    job_url = "https://www.linkedin.com" + job_url

                jobs.append({
                    "title": r.get("title", "Product Manager").strip(),
                    "company": r.get("company", "Unknown").strip(),
                    "url": job_url,
                    "date_added": datetime.now().strftime("%Y-%m-%d"),
                    "source": "LinkedIn",
                    "location": loc,
                    "work_type": wt,
                    "description": f"### LinkedIn Job\n- **Location**: {loc}\n- Visit the link for full job details.",
                })

            time.sleep(random.uniform(2, 4))

    unique = dedupe_jobs(jobs)

    # If direct scraping found nothing, fallback to DuckDuckGo
    if not unique:
        print("    ↩ Falling back to DuckDuckGo search...")
        return _scrape_via_duckduckgo("linkedin.com/jobs", "LinkedIn", 3)

    print(f"    ✅ Found {len(unique)} PM jobs")
    return unique


def scrape_glassdoor():
    """Scrape Glassdoor via DuckDuckGo search."""
    return _scrape_via_duckduckgo("glassdoor.com/job-listing", "Glassdoor", 5)


def scrape_glints():
    """Scrape Glints via DuckDuckGo search."""
    return _scrape_via_duckduckgo("glints.com/id/opportunities/jobs", "Glints", 7)


# ============================================================
#  SCRAPER: JobStreet Indonesia (Direct + DDG fallback)
# ============================================================

class JobStreetParser(HTMLParser):
    """Parse JobStreet search results."""

    def __init__(self):
        super().__init__()
        self.jobs = []
        self._in_title = False
        self._in_company = False
        self._in_location = False
        self._current = {}

    def handle_starttag(self, tag, attrs):
        d = dict(attrs)
        da = d.get("data-automation", "")
        cls = d.get("class", "")
        role = d.get("role", "")

        # Title link
        if tag == "a" and (da == "jobTitle" or da == "job-list-item-link-overlay"):
            self._in_title = True
            href = d.get("href", "")
            if href and not href.startswith("http"):
                href = "https://www.jobstreet.co.id" + href
            self._current = {"url": href, "title": "", "company": "", "location": ""}

        # H1/H3 with job title
        if tag in ("h1", "h3") and (da == "jobTitle" or "job-title" in cls.lower()):
            self._in_title = True
            if "title" not in self._current:
                self._current["title"] = ""

        # Company
        if tag == "a" and (da == "jobCompany" or "company" in da.lower()):
            self._in_company = True
            self._current["company"] = ""
        if tag == "span" and (da == "jobCompany" or "company" in cls.lower()):
            self._in_company = True
            self._current["company"] = ""

        # Location
        if tag == "span" and (da == "jobLocation" or "location" in da.lower()):
            self._in_location = True
            self._current["location"] = ""
        if tag == "a" and da == "jobLocation":
            self._in_location = True
            self._current["location"] = ""

    def handle_data(self, data):
        data = data.strip()
        if not data:
            return
        if self._in_title:
            self._current["title"] = self._current.get("title", "") + data
        if self._in_company:
            self._current["company"] = self._current.get("company", "") + data
        if self._in_location:
            self._current["location"] = self._current.get("location", "") + data

    def handle_endtag(self, tag):
        if tag in ("a", "h1", "h3") and self._in_title:
            self._in_title = False
        if tag in ("a", "span") and self._in_company:
            self._in_company = False
        if tag in ("span", "a") and self._in_location:
            self._in_location = False
            if self._current.get("title"):
                self.jobs.append(dict(self._current))
                self._current = {}


def scrape_jobstreet():
    """Scrape JobStreet Indonesia directly, with pagination and DDG fallback."""
    print("\n  📡 [6/6] JobStreet Indonesia (direct)...")
    jobs = []

    base_urls = [
        "https://www.jobstreet.co.id/product-manager-jobs",
        "https://www.jobstreet.co.id/senior-product-manager-jobs",
        "https://www.jobstreet.co.id/product-owner-jobs",
    ]

    for base_url in base_urls:
        for page in range(1, 4):  # 3 pages
            url = f"{base_url}?page={page}" if page > 1 else base_url
            data = make_request(url)
            if not data:
                continue

            parser = JobStreetParser()
            try:
                parser.feed(data)
            except Exception:
                pass

            for r in parser.jobs:
                loc = r.get("location", "Indonesia").strip()
                jobs.append({
                    "title": r.get("title", "Product Manager").strip(),
                    "company": r.get("company", "Unknown").strip(),
                    "url": r.get("url", ""),
                    "date_added": datetime.now().strftime("%Y-%m-%d"),
                    "source": "JobStreet",
                    "location": loc or "Indonesia",
                    "work_type": "See posting",
                    "description": f"### JobStreet Listing\n- **Location**: {loc or 'Indonesia'}\n- Visit the link for full job details.",
                })

            time.sleep(random.uniform(1.5, 3))

    unique = dedupe_jobs(jobs)

    # Fallback to DuckDuckGo if nothing found
    if not unique:
        print("    ↩ Falling back to DuckDuckGo search...")
        return _scrape_via_duckduckgo("jobstreet.co.id", "JobStreet", 6)

    print(f"    ✅ Found {len(unique)} PM jobs")
    return unique


# ============================================================
#  SCRAPER: Indeed (via DuckDuckGo, since direct scraping gets 403)
# ============================================================

def scrape_indeed():
    """Scrape Indeed PM jobs via DuckDuckGo (direct Indeed scraping blocked)."""
    return _scrape_via_duckduckgo("indeed.com/viewjob", "Indeed", 4)



# ============================================================
#  MAIN PIPELINE
# ============================================================

def main():
    ap = argparse.ArgumentParser(
        description="Job Scraper — scrape, score, and build the dashboard"
    )
    ap.add_argument(
        "--sources",
        type=str,
        default="all",
        help="Comma-separated: remoteok,hn,linkedin,indeed,glassdoor,jobstreet,remotive,glints",
    )
    ap.add_argument("--skip-ai", action="store_true", help="Skip AI scoring")
    ap.add_argument("--rescore", action="store_true", help="Only re-score existing jobs")
    ap.add_argument("--refetch", action="store_true", help="Refetch full job descriptions for existing jobs with missing/short descriptions")
    args = ap.parse_args()

    print()
    print("╔" + "═" * 58 + "╗")
    print("║   🚀  Job Scraper Pipeline                               ║")
    print("║   Target: Product Manager roles                          ║")
    print(f"║   Date:   {datetime.now().strftime('%Y-%m-%d %H:%M')}                                 ║")
    print("╚" + "═" * 58 + "╝")

    if not os.path.exists(JOBS_DIR):
        os.makedirs(JOBS_DIR)

    existing_state = get_existing_job_state()
    print(
        f"\n  📂 Existing jobs in ./jobs/: {count_saved_jobs()} files "
        f"({len(existing_state['ids'])} unique fingerprints)"
    )

    total_scraped = 0
    total_new = 0

    if args.refetch:
        print("\n  🔄 Refetching missing job descriptions...")
        refetched = 0
        for fname in os.listdir(JOBS_DIR):
            if not fname.endswith(".md"): continue
            filepath = os.path.join(JOBS_DIR, fname)
            with open(filepath, "r", encoding="utf-8") as f:
                content = f.read()
            body = content.split("---", 2)[-1].strip()
            if "Visit the link for full details" in body or "Visit the link for full job details" in body or len(body) < 150:
                url_m = re.search(r'^url:\s*"(.+?)"', content, re.MULTILINE)
                source_m = re.search(r'^source:\s*"(.+?)"', content, re.MULTILINE)
                if url_m and source_m:
                    url = url_m.group(1).replace("%22", '"')
                    source = source_m.group(1)
                    if source not in ["Hacker News", "RemoteOK"]:
                        full_jd = fetch_full_jd(url, source)
                        if full_jd:
                            parts = content.split("---", 2)
                            new_content = parts[0] + "---" + parts[1] + "---\n\n### Full Job Description\n" + full_jd + "\n"
                            with open(filepath, "w", encoding="utf-8") as f:
                                f.write(new_content)
                            refetched += 1
                            time.sleep(random.uniform(1, 2))
        print(f"    ✅ Refetched {refetched} job descriptions")
        return

    if not args.rescore:
        scrapers = {
            "remoteok": scrape_remoteok,
            "hn": scrape_hn_who_is_hiring,
            "linkedin": scrape_linkedin,
            "indeed": scrape_indeed,
            "glassdoor": scrape_glassdoor,
            "jobstreet": scrape_jobstreet,
            "remotive": scrape_remotive,
            "glints": scrape_glints,
        }

        if args.sources != "all":
            selected = {s.strip() for s in args.sources.split(",")}
            scrapers = {k: v for k, v in scrapers.items() if k in selected}

        for name, scraper_fn in scrapers.items():
            try:
                found_jobs = scraper_fn()
                new_count = 0
                for job in found_jobs:
                    if save_job(job, existing_state):
                        new_count += 1
                total_scraped += len(found_jobs)
                total_new += new_count
                if new_count > 0:
                    print(f"    💾 Saved {new_count} new unique jobs")
            except Exception as e:
                print(f"    ❌ Scraper '{name}' crashed: {e}")

            time.sleep(random.uniform(1, 2))

    # Summary
    print()
    print("─" * 60)
    print(f"  📊 Scraping Summary")
    print(f"     Found:     {total_scraped} jobs across all sources")
    print(f"     New saved:  {total_new} (after deduplication)")
    print(f"     Total:     {count_saved_jobs()} jobs in ./jobs/")
    print("─" * 60)

    # Auto-refetch thin descriptions (max 10 per run to avoid rate limits)
    print("\n  🔄 Running auto-refetch check for thin job descriptions...")
    refetched = 0
    refetch_limit = 10
    for fname in os.listdir(JOBS_DIR):
        if not fname.endswith(".md"): continue
        if refetched >= refetch_limit: break
        
        filepath = os.path.join(JOBS_DIR, fname)
        try:
            with open(filepath, "r", encoding="utf-8") as f:
                content = f.read()
            
            parts = content.split("---", 2)
            if len(parts) < 3: continue
            
            body = parts[2].strip()
            if "Visit the link for full details" in body or "Visit the link for full job details" in body or len(body) < 150:
                url_m = re.search(r'^url:\s*"(.+?)"', content, re.MULTILINE)
                source_m = re.search(r'^source:\s*"(.+?)"', content, re.MULTILINE)
                if url_m and source_m:
                    url = url_m.group(1).replace("%22", '"')
                    source = source_m.group(1)
                    if source not in ["Hacker News", "RemoteOK"]:
                        full_jd = fetch_full_jd(url, source)
                        if full_jd:
                            new_content = parts[0] + "---" + parts[1] + "---\n\n### Full Job Description\n" + full_jd + "\n"
                            with open(filepath, "w", encoding="utf-8") as f:
                                f.write(new_content)
                            refetched += 1
                            print(f"    ✨ Successfully refetched description for {fname}")
                            time.sleep(random.uniform(1.5, 3))
        except Exception as e:
            print(f"    ⚠ Error refetching {fname}: {e}")

    # Auto-run scoring
    print("\n  🧠 Running scorer...")
    score_args = [sys.executable, "score.py"]
    if args.skip_ai:
        score_args.append("--skip-ai")
    try:
        subprocess.run(score_args, check=True, cwd=os.path.dirname(os.path.abspath(__file__)) or ".")
    except FileNotFoundError:
        print("    ⚠ score.py not found, skipping")
    except subprocess.CalledProcessError as e:
        print(f"    ⚠ Scoring error: {e}")

    # Auto-run dashboard build
    print("\n  🏗️  Building dashboard...")
    try:
        subprocess.run(
            [sys.executable, "build.py"],
            check=True,
            cwd=os.path.dirname(os.path.abspath(__file__)) or ".",
        )
    except FileNotFoundError:
        print("    ⚠ build.py not found, skipping")
    except subprocess.CalledProcessError as e:
        print(f"    ⚠ Build error: {e}")

    print("\n  ✅ Pipeline complete! Open index.html in your browser.\n")


if __name__ == "__main__":
    main()
