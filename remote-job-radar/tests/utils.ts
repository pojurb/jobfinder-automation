import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { join } from 'path';

// Create an in-memory SQLite database
const sqlite = new Database(':memory:');
export const testDb = drizzle(sqlite);

// Run migrations on the in-memory database to match the real schema
migrate(testDb, { migrationsFolder: join(process.cwd(), 'drizzle') });
