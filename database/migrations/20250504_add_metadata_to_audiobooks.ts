import { sql } from 'drizzle-orm';
import { migrate } from '../utils';

export async function runMigration() {
  console.log('Running migration: 20250504_add_metadata_to_audiobooks.ts');
  await migrate(async (db) => {
    await db.execute(sql`
      ALTER TABLE audiobooks
      ADD COLUMN IF NOT EXISTS metadata TEXT;
    `);
    
    console.log('✅ Added metadata column to audiobooks table');
  });
}

// Run migration directly when file is executed (for local dev)
if (require.main === module) {
  runMigration()
    .then(() => {
      console.log('✅ Migration completed');
      process.exit(0);
    })
    .catch((err) => {
      console.error('❌ Migration failed:', err);
      process.exit(1);
    });
}