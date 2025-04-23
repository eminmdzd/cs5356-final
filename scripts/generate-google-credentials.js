// This script creates a Google credentials file from environment variables
// It's meant to be run during Vercel build process

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Get the directory name using ESM compatible approach
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Check if we're in production mode
const isProduction = process.env.NODE_ENV === 'production';

// Function to create credentials from individual environment variables
function createCredentialsFromIndividualVars() {
  // Check for required individual credential variables
  const requiredVars = [
    'GOOGLE_PROJECT_ID',
    'GOOGLE_PRIVATE_KEY_ID',
    'GOOGLE_PRIVATE_KEY',
    'GOOGLE_CLIENT_EMAIL',
    'GOOGLE_CLIENT_ID',
    'GOOGLE_CLIENT_X509_CERT_URL'
  ];

  const missingVars = requiredVars.filter(varName => !process.env[varName]);
  if (missingVars.length > 0) {
    console.log(`Missing required Google credential variables: ${missingVars.join(', ')}`);
    return null;
  }

  // Create credentials object from individual environment variables
  const credentials = {
    type: 'service_account',
    project_id: process.env.GOOGLE_PROJECT_ID,
    private_key_id: process.env.GOOGLE_PRIVATE_KEY_ID,
    private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'), // Fix private key formatting
    client_email: process.env.GOOGLE_CLIENT_EMAIL,
    client_id: process.env.GOOGLE_CLIENT_ID,
    auth_uri: process.env.GOOGLE_AUTH_URI || 'https://accounts.google.com/o/oauth2/auth',
    token_uri: process.env.GOOGLE_TOKEN_URI || 'https://oauth2.googleapis.com/token',
    auth_provider_x509_cert_url: process.env.GOOGLE_AUTH_PROVIDER_X509_CERT_URL || 'https://www.googleapis.com/oauth2/v1/certs',
    client_x509_cert_url: process.env.GOOGLE_CLIENT_X509_CERT_URL,
    universe_domain: process.env.GOOGLE_UNIVERSE_DOMAIN || 'googleapis.com'
  };

  console.log('Successfully created Google credentials from individual environment variables');
  return JSON.stringify(credentials);
}

try {
  // Define the file path where Google credentials should be stored
  const filePath = path.resolve(path.join(__dirname, '..', '.google-credentials.json'));
  let credentialsJson = null;

  // First try to use individual variables (preferred in production)
  if (isProduction) {
    credentialsJson = createCredentialsFromIndividualVars();
    if (credentialsJson) {
      console.log('Using individual environment variables for Google credentials');
    }
  }

  // Fall back to the single JSON string if individual variables not available
  if (!credentialsJson && process.env.GOOGLE_CREDENTIALS_JSON) {
    credentialsJson = process.env.GOOGLE_CREDENTIALS_JSON;
    console.log('Using GOOGLE_CREDENTIALS_JSON for Google credentials');
  }

  // Check if we have credentials to write
  if (credentialsJson) {
    // Write the credentials to the file
    fs.writeFileSync(filePath, credentialsJson);
    console.log(`Successfully created Google credentials file at: ${filePath}`);
    
    // Set read-only permissions for security
    fs.chmodSync(filePath, 0o400);
    console.log('Set read-only permissions on credentials file');
  } else {
    // For local development, just log a message and exit successfully
    if (!isProduction) {
      console.log('No Google credentials found. Skipping credentials generation in development mode.');
      process.exit(0);
    } else {
      // In production, this is an error
      console.error('Error: No Google credentials found. Either set GOOGLE_CREDENTIALS_JSON or individual credential variables.');
      process.exit(1);
    }
  }
} catch (error) {
  console.error('Error creating Google credentials file:', error);
  process.exit(1);
}