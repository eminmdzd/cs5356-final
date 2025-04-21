// Modified seed.ts file to align with your db.ts configuration

import { db } from './db';
import { UsersTable } from './schema';

export async function seed() {
  try {
    // Create table using Drizzle ORM
    await db.execute(`
      CREATE TABLE IF NOT EXISTS profiles (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        image VARCHAR(255),
        "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log(`Created "profiles" table`);

    // Insert users using Drizzle ORM
    const insertedUsers = await Promise.all([
      db.insert(UsersTable).values({
        name: 'Guillermo Rauch',
        email: 'rauchg@vercel.com',
        image: 'https://images.ctfassets.net/e5382hct74si/2P1iOve0LZJRZWUzfXpi9r/9d4d27765764fb1ad7379d7cbe5f1043/ucxb4lHy_400x400.jpg'
      }).onConflictDoNothing(),
      db.insert(UsersTable).values({
        name: 'Lee Robinson',
        email: 'lee@vercel.com',
        image: 'https://images.ctfassets.net/e5382hct74si/4BtM41PDNrx4z1ml643tdc/7aa88bdde8b5b7809174ea5b764c80fa/adWRdqQ6_400x400.jpg'
      }).onConflictDoNothing(),
      db.insert(UsersTable).values({
        name: 'Steven Tey',
        email: 'stey@vercel.com',
        image: 'https://images.ctfassets.net/e5382hct74si/4QEuVLNyZUg5X6X4cW4pVH/eb7cd219e21b29ae976277871cd5ca4b/profile.jpg'
      }).onConflictDoNothing()
    ]);
    
    console.log(`Seeded users successfully`);

    return {
      createdTable: true,
      insertedUsers: true
    };
  } catch (error) {
    console.error("Error in seed function:", error);
    throw error;
  }
}