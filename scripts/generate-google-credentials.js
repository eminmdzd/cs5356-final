// This script creates a Google credentials file from environment variable
// It's meant to be run during Vercel build process

const fs = require('fs');
const path = require('path');

// Check if the GOOGLE_CREDENTIALS_JSON environment variable exists
if (!process.env.GOOGLE_CREDENTIALS_JSON) {
  console.error('Error: GOOGLE_CREDENTIALS_JSON environment variable is not set.');
  process.exit(1);
}

try {
  // Create the file path where Google credentials should be stored
  const filePath = path.resolve('./.google-credentials.json');

  // Write the JSON content from the environment variable to the file
  fs.writeFileSync(filePath, process.env.GOOGLE_CREDENTIALS_JSON);
  
  console.log(`Successfully created Google credentials file at: ${filePath}`);
  
  // Set read-only permissions for security
  fs.chmodSync(filePath, 0o400);
  console.log('Set read-only permissions on credentials file');
  
} catch (error) {
  console.error('Error creating Google credentials file:', error);
  process.exit(1);
}