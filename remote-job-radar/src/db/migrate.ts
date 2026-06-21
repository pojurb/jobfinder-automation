import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { db } from './index';

console.log('Running migrations...');

try {
  // This will run migrations on the database, skipping the ones already applied
  migrate(db, { migrationsFolder: './drizzle' });
  console.log('Migrations completed successfully.');
} catch (error) {
  console.error('Error running migrations:', error);
  process.exit(1);
}
