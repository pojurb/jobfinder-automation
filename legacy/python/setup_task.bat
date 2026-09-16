@echo off
echo Setting up daily automatic job scraping...
set SCRIPT_PATH=%~dp0auto_scrape.bat
schtasks /create /tn "JobFinderAutoScrape" /tr "\"%SCRIPT_PATH%\"" /sc daily /st 09:00 /f
echo Task scheduled! It will run daily at 9:00 AM.
pause
