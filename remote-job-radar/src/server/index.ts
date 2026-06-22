import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import { eq, desc } from 'drizzle-orm';
import { db } from '../db';
import { jobs, jobScores } from '../db/schema';
import { runFetchPipeline } from '../fetchers';
import { runScoringEngine } from '../scoring';
import { generateDailyReport } from '../report';
import { addLogListener, removeLogListener, logger } from '../utils/logger';
import { mdToPdf } from 'md-to-pdf';

const PORT = 3000;

function getMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case '.html': return 'text/html';
    case '.css': return 'text/css';
    case '.js': return 'application/javascript';
    case '.json': return 'application/json';
    case '.pdf': return 'application/pdf';
    case '.png': return 'image/png';
    case '.jpg': return 'image/jpeg';
    default: return 'application/octet-stream';
  }
}

const server = http.createServer(async (req, res) => {
  const url = req.url || '/';

  // Serve Dashboard HTML
  if (url === '/' || url === '/index.html') {
    try {
      const htmlPath = path.join(__dirname, 'dashboard.html');
      const content = fs.readFileSync(htmlPath, 'utf8');
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(content);
    } catch (e: any) {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('Error loading dashboard: ' + e.message);
    }
    return;
  }

  // GET Base CV
  if (url === '/api/base-cv' && req.method === 'GET') {
    try {
      const cvPath = path.join(process.cwd(), 'base-cv.md');
      const content = fs.readFileSync(cvPath, 'utf8');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ content }));
    } catch (e: any) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  // GET Jobs
  if (url === '/api/jobs' && req.method === 'GET') {
    try {
      const scoredJobs = await db
        .select({
          id: jobs.id,
          title: jobs.title,
          company: jobs.company,
          location: jobs.location,
          remoteRegion: jobs.remoteRegion,
          salary: jobs.salary,
          url: jobs.url,
          description: jobs.description,
          totalScore: jobScores.totalScore,
          roleScore: jobScores.roleScore,
          remoteScore: jobScores.remoteScore,
          seniorityScore: jobScores.seniorityScore,
          domainScore: jobScores.domainScore,
          aiProductScore: jobScores.aiProductScore,
          freshnessScore: jobScores.freshnessScore,
          matchReasons: jobScores.matchReasons,
          rejectionReasons: jobScores.rejectionReasons,
          fetchedAt: jobs.fetchedAt,
        })
        .from(jobs)
        .innerJoin(jobScores, eq(jobs.id, jobScores.jobId))
        .orderBy(desc(jobScores.totalScore));

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(scoredJobs));
    } catch (e: any) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  // SSE Scraper Stream
  if (url === '/api/scrape/stream' && req.method === 'GET') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });

    const listener = (level: string, msg: string) => {
      res.write(`data: [${level.toUpperCase()}] ${msg}\n\n`);
    };

    addLogListener(listener);

    try {
      logger.info('Starting daily pipeline from UI...');
      await runFetchPipeline();
      await runScoringEngine();
      await generateDailyReport();
      logger.info('Daily pipeline complete!');
    } catch (e: any) {
      logger.error('Error running pipeline: ' + e.message);
    } finally {
      removeLogListener(listener);
      res.end();
    }
    return;
  }

  // POST Save and Build CV
  if (url === '/api/save-and-build' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const { company, markdown } = JSON.parse(body);
        if (!company || !markdown) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Company and Markdown are required.' }));
          return;
        }

        const cleanCompany = company.replace(/[^a-zA-Z0-9_-]/g, '_');
        const cvDir = path.join(process.cwd(), 'tailored-cvs');
        if (!fs.existsSync(cvDir)) {
          fs.mkdirSync(cvDir, { recursive: true });
        }

        const mdPath = path.join(cvDir, `CV_${cleanCompany}.md`);
        const pdfPath = path.join(cvDir, `CV_${cleanCompany}.pdf`);

        // Save markdown
        fs.writeFileSync(mdPath, markdown, 'utf8');

        // Compile to PDF
        const pdf = await mdToPdf({ path: mdPath }, {
          pdf_options: {
            format: 'A4',
            margin: { top: '20mm', right: '20mm', bottom: '20mm', left: '20mm' },
            printBackground: true
          },
          css: `
            body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 11pt; color: #333; line-height: 1.4; }
            h1 { font-size: 24pt; margin-bottom: 5px; color: #000; }
            h2 { font-size: 14pt; border-bottom: 1px solid #ccc; padding-bottom: 3px; margin-top: 15px; margin-bottom: 10px; color: #444; text-transform: uppercase; letter-spacing: 1px; }
            h3 { font-size: 12pt; margin-bottom: 5px; margin-top: 10px; color: #000; }
            p, li { margin-bottom: 5px; }
            ul { padding-left: 20px; }
            a { color: #0366d6; text-decoration: none; }
            hr { display: none; }
          `
        });

        if (pdf) {
          fs.writeFileSync(pdfPath, pdf.content);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, pdfUrl: `/cvs/CV_${cleanCompany}.pdf` }));
        } else {
          throw new Error('PDF Generation content empty');
        }
      } catch (e: any) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  // Serve static files from tailored-cvs directory
  if (url.startsWith('/cvs/')) {
    const rawFilename = decodeURIComponent(url.substring(5));
    const cleanFilename = path.basename(rawFilename); // Prevent directory traversal
    const filePath = path.join(process.cwd(), 'tailored-cvs', cleanFilename);

    if (fs.existsSync(filePath)) {
      res.writeHead(200, { 'Content-Type': getMimeType(filePath) });
      fs.createReadStream(filePath).pipe(res);
    } else {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('File not found: ' + cleanFilename);
    }
    return;
  }

  // Fallback 404
  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not Found');
});

server.listen(PORT, () => {
  console.log(`\n==================================================`);
  console.log(`🚀 Local Job Dashboard running at:`);
  console.log(`👉 http://localhost:${PORT}`);
  console.log(`==================================================\n`);
});
