import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import * as schema from './schema';
import { getDatabasePath } from '../utils/paths';

const sqlite = new Database(getDatabasePath());
export const db = drizzle(sqlite, { schema });