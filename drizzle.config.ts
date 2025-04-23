import "dotenv/config"

import { defineConfig } from 'drizzle-kit';

// Choose the database URL based on environment
const isProduction = process.env.NODE_ENV === 'production';
const url = isProduction 
  ? process.env.DATABASE_URL 
  : process.env.LOCAL_DATABASE_URL;

if (!url) {
  throw new Error(`Database connection string not found for ${isProduction ? 'production' : 'local'} environment.`);
}

console.log(`Using ${isProduction ? 'production' : 'local'} database URL for migrations:`, url);

export default defineConfig({
  out: './database/migrations',
  schema: './database/schema/*',
  dialect: 'postgresql',
  dbCredentials: { url },
});