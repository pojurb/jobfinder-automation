import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { db } from './index';
import { getMigrationsDir } from '../utils/paths';

console.log('Running migrations...');

try {
  // This will run migrations on the database, skipping the ones already applied
  migrate(db, { migrationsFolder: getMigrationsDir() });
  console.log('Migrations completed successfully.');
} catch (error) {
  console.error('Error running migrations:', error);
  process.exit(1);
}
