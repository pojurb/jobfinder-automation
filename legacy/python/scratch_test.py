import urllib.request
import ssl

USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
]

def make_request(url):
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    
    headers = {
        "User-Agent": USER_AGENTS[0],
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
    }
    
    req = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=10, context=ctx) as resp:
            return resp.read().decode("utf-8", errors="replace")
    except Exception as e:
        return str(e)

html = make_request("https://in.linkedin.com/jobs/view/senior-product-manager-at-adobe-4418269916")
import re
from html import unescape
m = re.search(r'show-more-less-html__markup[^>]*>(.*?)</div>', html, re.DOTALL)
if m:
    content = m.group(1)
    clean = re.sub(r'<[^>]+>', '\n', content)
    clean = re.sub(r'\n+', '\n', clean).strip()
    print(unescape(clean)[:500])
else:
    print("Not found")
