# Audiobook Generator App

This application allows users to generate audiobooks from PDF files using Google's Text-to-Speech Long Audio API.

## Features

- User authentication (sign up, sign in, session management)
- PDF upload and management
- Audiobook generation from PDFs using Google Cloud TTS
- Audiobook playback and management
- Real-time progress tracking for audiobook generation
- Editable audiobook titles
- Responsive UI for desktop and mobile

## Technologies Used

### Frontend
- **Next.js 15** - React framework with App Router for server and client components
- **React 19** - UI library
- **Tailwind CSS 4** - Utility-first CSS framework
- **Shadcn/UI** - Component library built on Radix UI
- **TypeScript** - Type-safe JavaScript
- **Tanstack Query** - Data fetching and state management

### Backend
- **Next.js Server Actions** - API endpoints for data mutations
- **Better Auth** - Authentication system
- **Bull** - Redis-based job queue for background processing
- **Google Cloud Text-to-Speech** - Long Audio API for converting text to speech
- **Vercel Blob Storage** - Cloud storage for PDFs and audio files in production
- **Upstash Redis** - Serverless Redis for the job queue in production

### Database
- **PostgreSQL** - Relational database
- **Drizzle ORM** - Type-safe SQL toolkit
- **Redis** - In-memory data structure store for job queue

### Tools & Utilities
- **PDF-Parse** - Library for extracting text from PDFs
- **Zod** - Schema validation
- **SSE.js** - Server-sent events for real-time progress updates
- **Docker** - Containerization for local development
- **Vercel Cron Jobs** - For processing queued jobs in production

## Application Flow

1. **Authentication Flow**
   - User registers or signs in using Better Auth
   - Sessions are managed with HTTP-only cookies
   - Password inputs include visibility toggles

2. **PDF Upload Flow**
   - User uploads a PDF file from the upload page
   - PDF is validated for size and format
   - In development: PDF is stored in local filesystem
   - In production: PDF is stored in Vercel Blob Storage
   - PDF metadata is stored in the database

3. **Audiobook Generation Flow**
   - User initiates audiobook generation from the dashboard
   - A job is added to the Bull queue for processing
   - Worker processes the job:
     - Extracts text from PDF
     - Sends text to Google Cloud TTS API
     - In development: Stores audio file locally
     - In production: Stores audio in Vercel Blob Storage
     - Updates the database with the audio file location
   - Real-time progress is shown to the user via Redis

4. **Audiobook Management Flow**
   - Users can view all their audiobooks on the dashboard
   - Audiobooks show processing status and progress
   - Users can play, pause, and seek through completed audiobooks
   - Users can edit audiobook titles
   - Users can delete audiobooks, removing both database records and files

## Local Setup Instructions

### Prerequisites

- Node.js (v18+)
- pnpm
- Docker (for PostgreSQL and Redis)
- Google Cloud account with Text-to-Speech and Storage APIs enabled

### Google Cloud Setup

1. Create a new Google Cloud project or use an existing one
2. Enable the Text-to-Speech API (specifically the Long Audio Synthesis API)
3. Enable the Cloud Storage API
4. Create a service account with the following permissions:
   - Cloud Text-to-Speech User
   - Storage Object Admin
5. Download the service account JSON key
6. Create a Cloud Storage bucket to store audio files

### App Setup

1. Ensure Docker is running locally
2. Create a `.env` file based on `.env.example`
3. Install dependencies:

```bash
pnpm install
```

4. Start the database and Redis:

```bash
pnpm db:start
```

5. Generate the auth schema:

```bash
pnpm auth:generate
```

6. Generate and run migrations:

```bash
pnpm db:generate
pnpm db:migrate
```

7. Run the development server:

```bash
pnpm dev
```

## Production Setup

For deployment to Vercel, you'll need:

1. **Vercel Account** - For hosting the application
2. **Upstash Redis** - For the job queue
3. **Vercel Blob Storage** - For storing PDFs and audio files
4. **Google Cloud** - For Text-to-Speech API

### Vercel Environment Variables

Set these environment variables in your Vercel project:

```
# Database
DATABASE_URL=your-production-postgres-url

# Authentication
BETTER_AUTH_SECRET=your-production-secret-key
BETTER_AUTH_URL=https://your-vercel-app-url.vercel.app

# Google Cloud
GOOGLE_APPLICATION_CREDENTIALS=./.google-credentials.json
# Also add the JSON content of your Google credentials file as GOOGLE_CREDENTIALS_JSON

# Redis
UPSTASH_REDIS_REST_URL=your-upstash-redis-rest-url
UPSTASH_REDIS_REST_TOKEN=your-upstash-redis-rest-token

# Vercel Blob Storage
BLOB_READ_WRITE_TOKEN=your-vercel-blob-read-write-token
```

### Google Credentials in Vercel

Since you can't upload files to Vercel, create a build step that generates the Google credentials file from an environment variable:

1. Add your entire Google credentials JSON content as an environment variable called `GOOGLE_CREDENTIALS_JSON`
2. Vercel will create the credentials file during build using the JSON content

### Vercel Cron Jobs

The application uses Vercel Cron Jobs to process audiobook generation tasks. The `vercel.json` file configures a cron job to run every minute to process jobs in the queue.

## Environment Variables

Create a `.env` file with the following variables:

```
# Database
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/audiobooks
LOCAL_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/audiobooks

# Authentication
BETTER_AUTH_SECRET=your-secret-key-here
BETTER_AUTH_URL=http://localhost:3000

# Google Cloud
GOOGLE_APPLICATION_CREDENTIALS=path/to/your/google-credentials.json
GOOGLE_CLOUD_PROJECT_ID=your-google-cloud-project-id
GOOGLE_CLOUD_STORAGE_BUCKET=your-google-cloud-storage-bucket

# Redis
REDIS_URL=redis://localhost:6379
# Only for production:
# UPSTASH_REDIS_REST_URL=your-upstash-redis-rest-url
# UPSTASH_REDIS_REST_TOKEN=your-upstash-redis-rest-token

# Vercel Blob Storage (only for production)
# BLOB_READ_WRITE_TOKEN=your-vercel-blob-read-write-token
```

## Project Structure

- `/actions`: Server actions for PDF upload, audiobook generation and management
- `/app`: Next.js app router pages and API routes
- `/app/api/workers`: Serverless functions for processing audiobook jobs
- `/components`: React components including UI elements and audiobook player
- `/database`: Database schema, migrations and utilities
- `/lib`: Utility functions, authentication, and queue management
- `/public`: Static assets and generated audio files (in development)
- `/styles`: Global CSS and auth override styles
- `/workers`: Background job workers for audiobook processing

## Limitations

- PDF files must contain selectable text (not scanned images)
- Maximum PDF size of 10MB
- Only English text tested
- Long PDFs may take significant time to process
- In production, there's a 5-minute serverless function timeout

## Future Enhancements

- Multiple voice options and languages
- Voice customization options (pitch, speed, etc.)
- PDF text extraction improvements
- Bookmarking functionality
- Sharing capabilities for audiobooks