import { createServer } from 'http';
import { readFileSync } from 'fs';
import { getLiveViewerScript } from '../report';
import { projectPath } from '../utils/paths';
import { logger } from '../utils/logger';

const PORT = Number(process.env.PORT) || 3000;
const DASHBOARD_PATH = projectPath('src', 'server', 'dashboard.html');

/**
 * Serves the dashboard plus a live version of reports/latest-jobs.js,
 * computed from the database on every request. This is what makes
 * `npm run dashboard` show today's data without a `npm run report` step
 * first — see README.md's "Live dashboard" section.
 *
 * The dashboard itself stays read-only: use `npm run apply` to change a
 * job's status, same as before.
 */
const server = createServer(async (req, res) => {
  try {
    if (req.url === '/' || req.url === '/index.html') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(readFileSync(DASHBOARD_PATH, 'utf-8'));
      return;
    }

    if (req.url === '/reports/latest-jobs.js') {
      const script = await getLiveViewerScript();
      res.writeHead(200, {
        'Content-Type': 'application/javascript; charset=utf-8',
        'Cache-Control': 'no-store',
      });
      res.end(script);
      return;
    }

    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
  } catch (error) {
    logger.error(`[dashboard-server] ${(error as Error).message}`);
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end(`Server error: ${(error as Error).message}`);
  }
});

server.listen(PORT, () => {
  logger.info(`Dashboard live at http://localhost:${PORT} (Ctrl+C to stop)`);
});
