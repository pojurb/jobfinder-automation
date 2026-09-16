import Database from 'better-sqlite3';
import { getDatabasePath } from '../utils/paths';

const sqlite = new Database(getDatabasePath());
const result = sqlite.prepare("SELECT date(created_at, 'unixepoch') AS d1, date(created_at) AS d2 FROM job_scores LIMIT 1").get();
console.log(result);
