@echo off
cd /d "%~dp0"
echo Running Job Scraper Pipeline...
python scrape.py
echo Pipeline finished.
