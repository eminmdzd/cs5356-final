import { migrate } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export async function up(db: any) {
  await db.execute(sql`
    ALTER TABLE audiobooks
    ADD COLUMN progress INTEGER NOT NULL DEFAULT 0;
  `);
}

export async function down(db: any) {
  await db.execute(sql`
    ALTER TABLE audiobooks
    DROP COLUMN progress;
  `);
}
