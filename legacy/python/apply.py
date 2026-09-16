#!/usr/bin/env python3
"""
Automated Job Application Helper powered by Gemini Spark (Gemini 2.0 Flash API)
Uses local browser session (Playwright) to apply to jobs, filling tailored cover letters,
CV info, and custom application answers generated in real-time.
"""

import os
import sys
if sys.stdout.encoding.lower() != 'utf-8':
    sys.stdout.reconfigure(encoding='utf-8')
import re
import json
import time
import argparse
import subprocess
import urllib.request
import urllib.parse
from pathlib import Path
from utils import load_job

USER_DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".browser_data")
JOBS_DIR = "jobs"
RESUME_HTML_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "resume.html")
RESUME_PDF_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "resume.pdf")


def get_candidate_info():
    """Load candidate profile info from profile.json and resume.html."""
    info = {
        "name": "Johannes Purba",
        "first_name": "Johannes",
        "last_name": "Purba",
        "email": "jopurb@gmail.com",
        "phone": "081287454446",
        "phone_formatted": "+6281287454446",
        "location": "Jakarta, Indonesia",
        "linkedin": "https://linkedin.com/in/johannes-p-1000736b",
        "github": "https://github.com/pojurb",
    }
    profile_path = "profile.json"
    if os.path.exists(profile_path):
        try:
            with open(profile_path, "r", encoding="utf-8") as f:
                pdata = json.load(f)
                info["name"] = pdata.get("name", info["name"])
                names = info["name"].split()
                if len(names) >= 2:
                    info["first_name"] = names[0]
                    info["last_name"] = " ".join(names[1:])
        except Exception:
            pass
    return info


def export_resume_pdf():
    """Convert resume.html to resume.pdf using Playwright in headless mode."""
    if not os.path.exists(RESUME_HTML_PATH):
        print("  ⚠ resume.html not found, skipping PDF generation.")
        return None
        
    print("  📄 Converting resume.html -> resume.pdf...")
    try:
        from playwright.sync_api import sync_playwright
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            page = browser.new_page()
            page.goto(Path(RESUME_HTML_PATH).as_uri(), wait_until="networkidle")
            page.pdf(
                path=RESUME_PDF_PATH,
                format="Letter",
                print_background=True,
                margin={"top": "0.36in", "right": "0.36in", "bottom": "0.36in", "left": "0.36in"}
            )
            browser.close()
        print(f"  ✅ Exported latest PDF CV: {RESUME_PDF_PATH}")
        return RESUME_PDF_PATH
    except Exception as e:
        print(f"  ⚠ PDF Export warning: {e}")
        return None


def generate_spark_cover_letter(candidate_info, job_title, company_name, job_body, api_key=None):
    """Use Gemini Spark (Gemini 2.0 Flash REST API) to generate a high-converting, tailored cover letter."""
    print("  ⚡ [Gemini Spark] Generating tailored cover letter & application insights...")
    
    api_key = api_key or os.environ.get("GEMINI_API_KEY")
    
    prompt = f"""
You are an expert AI Product Manager application assistant.
Write a highly compelling, professional, concise Cover Letter (150-220 words) for {candidate_info['name']} applying for the role of {job_title} at {company_name}.

Candidate Highlights:
- Senior Product Manager with 10+ years experience in Insurtech, B2B SaaS, Mobility, and Logistics.
- AI-Augmented PM Workflows: Expert in VS Code, Antigravity IDE, and MCP (Model Context Protocol) prototyping (cutting feature validation turnaround by 60-70%).
- ASTRNT: Built 0-to-1 CDC University Platform (slashed screening time by 83% for UI & Kalbis partners), Candidate Transfer, 32% ARR impact, 70% retention.
- Qoala: Built Qoala Plus 0-to-1 (200+ agents, IDR 50-70B GWP in 6 mos), Golang high-concurrency queueing (60k to 1.5M tx/mo, 10x GMV), Computer Vision instant claims (1-2 mins).

Target Job Description Summary:
{job_body[:2500]}

Format Requirements:
- Professional greeting and strong hook tailored to {company_name}.
- Connect candidate's 0-to-1 building, AI workflows, and scaling metrics directly to what {company_name} needs.
- Professional closing.
"""

    if api_key:
        try:
            url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key={api_key}"
            payload = json.dumps({
                "contents": [{"parts": [{"text": prompt}]}]
            }).encode("utf-8")
            
            req = urllib.request.Request(url, data=payload, headers={"Content-Type": "application/json"})
            with urllib.request.urlopen(req, timeout=15) as response:
                result = json.loads(response.read().decode("utf-8"))
                text = result["candidates"][0]["content"]["parts"][0]["text"].strip()
                print("  ✨ [Gemini Spark REST API] Cover Letter generated successfully!")
                return text
        except Exception as e:
            print(f"  ⚠ Gemini Spark API Notice ({e}). Falling back to Spark Tailored Template Engine.")

    # High-quality fallback template based on Gemini Spark structure
    return f"""Dear Hiring Team at {company_name},

I am writing to express my strong interest in the {job_title} position at {company_name}. As an AI-Augmented Senior Product Manager with 10+ years of experience building and scaling digital products across Insurtech, B2B SaaS, and Logistics, I specialize in 0-to-1 product launches, high-concurrency systems, and embedding modern LLM/MCP workflows directly into product discovery.

In my recent roles, I have consistently driven measurable business outcomes:
• Built 0-to-1 platform solutions such as ASTRNT's CDC Platform (slashing candidate screening turnaround by 83% for top-tier university partners) and Qoala Plus (onboarding 200+ active agents and generating IDR 50–70 Billion GWP in 6 months).
• Scaled high-concurrency architecture (Golang stack) from 60,000 to 1.5 Million monthly transactions, powering 80% of total policy issuances and driving 10x GMV growth.
• Accelerated technical specs and prototyping using VS Code, Antigravity IDE, and Model Context Protocol (MCP), cutting feature turnaround from 3 days down to 1 day.

I am particularly excited about {company_name}'s vision and would love the opportunity to leverage my technical grounding, data-driven strategy, and AI-assisted workflows to accelerate your product roadmap.

Thank you for your time and consideration.

Best regards,
{candidate_info['name']}
{candidate_info['phone']} | {candidate_info['email']}
{candidate_info['linkedin']}"""


def update_job_status(job_filepath, new_status="Applied"):
    """Update job frontmatter status in markdown file."""
    with open(job_filepath, "r", encoding="utf-8") as f:
        content = f.read()
    
    parts = content.split("---", 2)
    if len(parts) >= 3:
        frontmatter = parts[1]
        if re.search(r'^status:\s*".*?"', frontmatter, re.MULTILINE):
            new_frontmatter = re.sub(r'^status:\s*".*?"', f'status: "{new_status}"', frontmatter, flags=re.MULTILINE)
        else:
            new_frontmatter = frontmatter + f'\nstatus: "{new_status}"'
        new_content = parts[0] + "---" + new_frontmatter + "---" + parts[2]
        with open(job_filepath, "w", encoding="utf-8") as f:
            f.write(new_content)
        print(f"  ✅ Updated status to '{new_status}' in {os.path.basename(job_filepath)}")


def rebuild_dashboard():
    """Run build.py to refresh index.html."""
    try:
        subprocess.run([sys.executable, "build.py"], check=True)
    except Exception as e:
        print(f"  ⚠ Build dashboard warning: {e}")


def auto_fill_form(page, candidate_info, cover_letter, pdf_path):
    """Auto-fill form inputs using Playwright selectors."""
    print("\n⚡ [Playwright Agent] Auto-filling candidate application details...")
    try:
        # First Name
        fn_input = page.query_selector("input[name*='first' i], input[id*='first' i], input[aria-label*='first' i]")
        if fn_input and not fn_input.input_value():
            fn_input.fill(candidate_info["first_name"])
            print("  ✓ Filled First Name")

        # Last Name
        ln_input = page.query_selector("input[name*='last' i], input[id*='last' i], input[aria-label*='last' i]")
        if ln_input and not ln_input.input_value():
            ln_input.fill(candidate_info["last_name"])
            print("  ✓ Filled Last Name")

        # Email
        email_input = page.query_selector("input[type='email'], input[name*='email' i], input[id*='email' i]")
        if email_input and not email_input.input_value():
            email_input.fill(candidate_info["email"])
            print("  ✓ Filled Email")

        # Phone
        phone_input = page.query_selector("input[type='tel'], input[name*='phone' i], input[id*='phone' i]")
        if phone_input and not phone_input.input_value():
            phone_input.fill(candidate_info["phone_formatted"])
            print("  ✓ Filled Phone")

        # Cover Letter Textarea
        cover_area = page.query_selector("textarea[name*='cover' i], textarea[id*='cover' i], textarea[aria-label*='cover' i]")
        if cover_area and not cover_area.input_value():
            cover_area.fill(cover_letter)
            print("  ✓ Pasted Gemini Spark Cover Letter")

        # File Upload (Resume PDF)
        if pdf_path and os.path.exists(pdf_path):
            file_input = page.query_selector("input[type='file'][name*='resume' i], input[type='file'][id*='resume' i], input[type='file']")
            if file_input:
                file_input.set_input_files(pdf_path)
                print("  ✓ Uploaded resume.pdf")
    except Exception as e:
        print(f"  Notice during auto-fill: {e}")


def launch_browser_session(job_url, candidate_info, cover_letter, pdf_path):
    """Launch Playwright persistent browser context and navigate to job page."""
    from playwright.sync_api import sync_playwright

    os.makedirs(USER_DATA_DIR, exist_ok=True)
    print(f"\n🌐 Launching persistent browser session (Data Dir: {USER_DATA_DIR})...")
    
    with sync_playwright() as p:
        context = p.chromium.launch_persistent_context(
            user_data_dir=USER_DATA_DIR,
            headless=False,
            viewport={"width": 1280, "height": 900},
            args=["--disable-blink-features=AutomationControlled"]
        )
        
        page = context.new_page()
        print(f"🔗 Navigating to target job: {job_url}")
        page.goto(job_url, wait_until="domcontentloaded")
        time.sleep(2)
        
        # Try finding & clicking Easy Apply / Apply button
        apply_btn = page.query_selector("button.jobs-apply-button") or page.query_selector("button:has-text('Easy Apply')") or page.query_selector("button:has-text('Apply Now')") or page.query_selector("a:has-text('Apply')")
        if apply_btn:
            print("  Found Apply button! Clicking...")
            try:
                apply_btn.click()
                time.sleep(2)
            except Exception as e:
                print(f"  Notice clicking apply button: {e}")

        # Attempt auto-filling form fields
        auto_fill_form(page, candidate_info, cover_letter, pdf_path)
        
        print("\n" + "═" * 65)
        print("  💡 GEMINI SPARK AGENT IS ACTIVE IN YOUR BROWSER:")
        print("  - Cover Letter and Candidate details have been pre-filled.")
        print("  - Please review fields, answer any custom questions, and click SUBMIT in the browser.")
        print("  - The browser window will stay open until you close the tab/window or press ENTER.")
        print("═" * 65 + "\n")
        
        try:
            # Wait for user to close the browser window or up to 10 minutes
            page.wait_for_event("close", timeout=600000)
        except Exception:
            pass
        finally:
            try:
                context.close()
            except Exception:
                pass


def main():
    parser = argparse.ArgumentParser(description="Automated Job Application Helper (Gemini Spark)")
    parser.add_argument("job", help="Job ID or Markdown filename in ./jobs/")
    parser.add_argument("--status", default="Applied", help="New status after application (default: Applied)")
    parser.add_argument("--api-key", help="Gemini API Key for Gemini Spark REST API")
    args = parser.parse_args()

    job_file = args.job
    if not job_file.endswith(".md"):
        job_file = job_file + ".md"
    if not os.path.isabs(job_file) and not job_file.startswith("jobs"):
        job_file = os.path.join(JOBS_DIR, job_file)

    if not os.path.exists(job_file):
        print(f"❌ Job file not found: {job_file}")
        sys.exit(1)

    job_data = load_job(job_file)
    metadata = job_data.get("metadata", {})
    job_body = job_data.get("body", "")
    url = metadata.get("url")
    company = metadata.get("company", "Target Company")
    title = metadata.get("title", "Product Manager")

    print("\n╔" + "═" * 62 + "╗")
    print(f"║   ⚡ GEMINI SPARK AUTO-APPLY AGENT                         ║")
    print(f"║   Role:    {title[:38]:<38} ║")
    print(f"║   Company: {company[:38]:<38} ║")
    print("╚" + "═" * 62 + "╝\n")

    if not url:
        print("❌ Job metadata has no valid URL!")
        sys.exit(1)

    candidate_info = get_candidate_info()
    pdf_path = export_resume_pdf()
    cover_letter = generate_spark_cover_letter(candidate_info, title, company, job_body, api_key=args.api_key)

    print("\n" + "─" * 60)
    print("  📝 GENERATED GEMINI SPARK COVER LETTER PREVIEW:")
    print("─" * 60)
    print(cover_letter)
    print("─" * 60 + "\n")

    launch_browser_session(url, candidate_info, cover_letter, pdf_path)
    update_job_status(job_file, args.status)
    rebuild_dashboard()

    print("\n🎉 Application process complete and recorded!")


if __name__ == "__main__":
    main()

