# Audiobook Generator App

This application allows users to generate audiobooks from PDF files using Google's Text-to-Speech Long Audio API

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
- **Google Cloud Storage** - Cloud storage for audio files

### Database
- **PostgreSQL** - Relational database
- **Drizzle ORM** - Type-safe SQL toolkit
- **Redis** - In-memory data structure store for job queue

### Tools & Utilities
- **PDF-Parse** - Library for extracting text from PDFs
- **Zod** - Schema validation
- **SSE.js** - Server-sent events for real-time progress updates
- **Docker** - Containerization for local development

## Application Flow

1. **Authentication Flow**
   - User registers or signs in using Better Auth
   - Sessions are managed with HTTP-only cookies
   - Password inputs include visibility toggles

2. **PDF Upload Flow**
   - User uploads a PDF file from the upload page
   - PDF is validated for size and format
   - Text is extracted from the PDF
   - PDF metadata is stored in the database

3. **Audiobook Generation Flow**
   - User initiates audiobook generation from the dashboard
   - A job is added to the Bull queue for processing
   - Worker processes the job asynchronously:
     - Extracts text from PDF
     - Sends text to Google Cloud TTS API
     - Stores the resulting audio file
     - Updates the database with the audio file location
   - Real-time progress is shown to the user via server-sent events

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

ENSURE that ffmpeg is installed

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

8. Start the worker for processing background jobs:

```bash
NODE_ENV=development node --loader ts-node/esm workers/audiobook-worker.ts
```

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
```

## Project Structure

- `/actions`: Server actions for PDF upload, audiobook generation and management
- `/app`: Next.js app router pages and API routes
- `/components`: React components including UI elements and audiobook player
- `/database`: Database schema, migrations and utilities
- `/lib`: Utility functions, authentication, and queue management
- `/public`: Static assets and generated audio files
- `/styles`: Global CSS and auth override styles
- `/workers`: Background job workers for audiobook processing

## Limitations

- PDF files must contain selectable text (not scanned images)
- Maximum PDF size of 10MB
- Only English text tested
- Long PDFs may take significant time to process

## Future Enhancements

- Multiple voice options and languages
- Voice customization options (pitch, speed, etc.)
- PDF text extraction improvements
- Bookmarking functionality
- Sharing capabilities for audiobooks
