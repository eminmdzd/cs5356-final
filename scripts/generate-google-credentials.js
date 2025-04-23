// This script creates a Google credentials file from environment variable
// It's meant to be run during Vercel build process

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Get the directory name using ESM compatible approach
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Check if we're in production mode
const isProduction = process.env.NODE_ENV === 'production';

// Check if the GOOGLE_CREDENTIALS_JSON environment variable exists
if (!process.env.GOOGLE_CREDENTIALS_JSON) {
  // For local development, just log a message and exit successfully
  if (!isProduction) {
    console.log('GOOGLE_CREDENTIALS_JSON environment variable is not set. Skipping credentials generation in development mode.');
    process.exit(0);
  } else {
    // In production, this is an error
    console.error('Error: GOOGLE_CREDENTIALS_JSON environment variable is not set.');
    process.exit(1);
  }
}

try {
  // Only proceed if we have credentials to write
  if (process.env.GOOGLE_CREDENTIALS_JSON) {
    // Create the file path where Google credentials should be stored
    const filePath = path.resolve(path.join(__dirname, '..', '.google-credentials.json'));

    // Write the JSON content from the environment variable to the file
    fs.writeFileSync(filePath, process.env.GOOGLE_CREDENTIALS_JSON);
    
    console.log(`Successfully created Google credentials file at: ${filePath}`);
    
    // Set read-only permissions for security
    fs.chmodSync(filePath, 0o400);
    console.log('Set read-only permissions on credentials file');
  }
} catch (error) {
  console.error('Error creating Google credentials file:', error);
  process.exit(1);
}