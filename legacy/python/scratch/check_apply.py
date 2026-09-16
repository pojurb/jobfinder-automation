import urllib.request
import re

url = "https://id.linkedin.com/jobs/view/senior-product-manager-at-ada-4432643846"
headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
}

try:
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req, timeout=15) as resp:
        html = resp.read().decode("utf-8", errors="replace")
    
    print("Page title:", re.findall(r'<title>(.*?)</title>', html, re.IGNORECASE))
    print("Apply links:", re.findall(r'href=["\'](https?://[^"\']*apply[^"\']*)["\']', html, re.IGNORECASE))
    print("Any external links:", [link for link in re.findall(r'href=["\'](https?://[^"\']+)["\']', html) if 'linkedin' not in link][:10])
except Exception as e:
    print("Error:", e)
