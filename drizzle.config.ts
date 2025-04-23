import "dotenv/config"

import { defineConfig } from 'drizzle-kit';

// For local development, use direct connection string
const url = process.env.LOCAL_DATABASE_URL;
if (!url)
  throw new Error(`Connection string to local Postgres not found.`);

console.log('Using URL for migrations:', url);

export default defineConfig({
  out: './database/migrations',
  schema: './database/schema/*',
  dialect: 'postgresql',
  dbCredentials: { url },
});