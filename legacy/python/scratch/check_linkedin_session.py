import os
import sys
if sys.stdout.encoding.lower() != 'utf-8':
    sys.stdout.reconfigure(encoding='utf-8')
from playwright.sync_api import sync_playwright

USER_DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".browser_data")

def check_session():
    print(f"Checking LinkedIn session in: {USER_DATA_DIR}")
    if not os.path.exists(USER_DATA_DIR):
        print("❌ No persistent browser data directory found yet (.browser_data).")
        print("👉 Run 'python apply.py jobs/ada_senior_product_manager_2026-07-08.md' to launch the browser and sign in once.")
        return

    with sync_playwright() as p:
        context = p.chromium.launch_persistent_context(
            user_data_dir=USER_DATA_DIR,
            headless=True,
            args=["--disable-blink-features=AutomationControlled"]
        )
        page = context.new_page()
        page.goto("https://www.linkedin.com/feed/", wait_until="domcontentloaded")
        url = page.url
        print(f"Current page URL: {url}")
        
        if "feed" in url or page.query_selector(".global-nav") or page.query_selector(".profile-rail-card"):
            print("✅ LINKEDIN SESSION ACTIVE: You are logged in!")
        elif "login" in url or "signup" in url or "authwall" in url or page.query_selector("a[href*='login']"):
            print("🔑 LINKEDIN SESSION NOT LOGGED IN: Redirected to login page.")
        else:
            print(f"ℹ️ Page loaded. URL: {url}")
            
        context.close()

if __name__ == "__main__":
    check_session()
