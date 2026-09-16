import urllib.request
import json

def test_remotive():
    print("Testing Remotive API...")
    url = "https://remotive.com/api/remote-jobs?category=product"
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(req) as resp:
        data = json.loads(resp.read().decode('utf-8'))
        print(f"Remotive jobs count: {data.get('job-count', 0)}")
        if data.get('jobs'):
            print(f"First job: {data['jobs'][0]['title']} at {data['jobs'][0]['company_name']}")

def test_linkedin_fragment():
    print("Testing LinkedIn Fragment API...")
    url = "https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?keywords=product%20manager&location=Worldwide&f_WT=2&sortBy=DD&start=0"
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'})
    try:
        with urllib.request.urlopen(req) as resp:
            data = resp.read().decode('utf-8')
            print(f"LinkedIn HTML size: {len(data)}")
            print(f"First 100 chars: {data[:100]}")
    except Exception as e:
        print(f"LinkedIn API failed: {e}")

if __name__ == "__main__":
    test_remotive()
    test_linkedin_fragment()
