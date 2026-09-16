import os
import json
import re
from http.server import HTTPServer, BaseHTTPRequestHandler

JOBS_DIR = "jobs"

class SyncHandler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        self.send_response(200, "ok")
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'X-Requested-With, Content-Type')
        self.end_headers()

    def do_POST(self):
        content_length = int(self.headers.get('Content-Length', 0))
        post_data = self.rfile.read(content_length)
        
        try:
            statuses = json.loads(post_data.decode('utf-8'))
            updated_count = 0
            
            for job_id, new_status in statuses.items():
                filepath = os.path.join(JOBS_DIR, f"{job_id}.md")
                if os.path.exists(filepath):
                    with open(filepath, "r", encoding="utf-8") as f:
                        content = f.read()
                    
                    # Update status in frontmatter
                    updated = re.sub(
                        r'^status:\s*.*',
                        f'status: "{new_status}"',
                        content,
                        count=1,
                        flags=re.MULTILINE
                    )
                    
                    if updated != content:
                        with open(filepath, "w", encoding="utf-8") as f:
                            f.write(updated)
                        updated_count += 1
                        
            self.send_response(200)
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({"status": "success", "updated": updated_count}).encode('utf-8'))
            print(f"Sync complete: Updated {updated_count} jobs.")
            
        except Exception as e:
            self.send_response(500)
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(str(e).encode('utf-8'))
            print(f"Error during sync: {e}")

    # Suppress default logging to keep console clean
    def log_message(self, format, *args):
        pass

def run(port=8989):
    server_address = ('', port)
    httpd = HTTPServer(server_address, SyncHandler)
    print(f"Starting sync server on port {port}...")
    print("Keep this running in the background to automatically sync dashboard status changes to markdown files.")
    print("Press Ctrl+C to stop.")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping sync server.")
        httpd.server_close()

if __name__ == '__main__':
    run()
