import os
import re
import json

def parse_frontmatter(content):
    """Parse frontmatter and body from a markdown file content."""
    parts = re.split(r"^---\s*$", content, maxsplit=2, flags=re.MULTILINE)
    
    if len(parts) >= 3:
        frontmatter_text = parts[1].strip()
        body = parts[2].strip()
    else:
        frontmatter_text = ""
        body = content.strip()
        
    metadata = {}
    for line in frontmatter_text.splitlines():
        if ":" in line:
            key, value = line.split(":", 1)
            key = key.strip()
            value = value.strip()
            
            # Strip outer quotes if any
            if (value.startswith('"') and value.endswith('"')) or (value.startswith("'") and value.endswith("'")):
                value = value[1:-1].strip()
                
            # Type casting
            if key == "match_score":
                try:
                    value = int(value)
                except ValueError:
                    value = 0
            elif key == "score_breakdown":
                try:
                    # Handle double single quotes from DB escaping if needed
                    val_json = value.replace("''", "'")
                    value = json.loads(val_json)
                except Exception:
                    pass
            metadata[key] = value
            
    return {"metadata": metadata, "body": body}

def load_job(filepath):
    """Load and parse a job file."""
    if not os.path.exists(filepath):
        return None
    try:
        with open(filepath, "r", encoding="utf-8") as f:
            content = f.read()
        return parse_frontmatter(content)
    except Exception:
        return None

def sanitize_filename(text):
    """Create a safe filename from text."""
    text = re.sub(r"[^\w\s-]", "", text.lower())
    text = re.sub(r"[\s]+", "_", text.strip())
    return text[:60]
