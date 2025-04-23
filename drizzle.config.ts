import "dotenv/config"

import { defineConfig } from 'drizzle-kit';

// Choose the database URL based on environment
const isProduction = process.env.NODE_ENV === 'production';

// Use DATABASE_URL for production, otherwise LOCAL_DATABASE_URL
// If you're running db:migrate-production, prompt for DATABASE_URL if it's not set
let url = isProduction 
  ? process.env.DATABASE_URL 
  : process.env.LOCAL_DATABASE_URL;

// Check if we're missing the needed URL
if (!url) {
  if (isProduction) {
    // For production without DATABASE_URL, provide a helpful error message
    console.error(`
=======================================================================
ERROR: DATABASE_URL environment variable is required for production migrations.

When running db:migrate-production, you need to provide the DATABASE_URL:

# Method 1: Set it directly in your terminal session
export DATABASE_URL="your_production_db_url_here" && pnpm db:migrate-production

# Method 2: Create a .env.production file with your DATABASE_URL
echo 'DATABASE_URL="your_production_db_url_here"' > .env.production
pnpm db:migrate-production

# Method 3: Provide it as a one-time environment variable
DATABASE_URL="your_production_db_url_here" pnpm db:migrate-production
=======================================================================
`);
    throw new Error(`DATABASE_URL not found for production environment.`);
  } else {
    throw new Error(`LOCAL_DATABASE_URL not found for local environment.`);
  }
}

console.log(`Using ${isProduction ? 'production' : 'local'} database URL for migrations`);

export default defineConfig({
  out: './database/migrations',
  schema: './database/schema/*',
  dialect: 'postgresql',
  dbCredentials: { url },
});