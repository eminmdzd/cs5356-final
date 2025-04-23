# Audiobook Generator App

This application allows users to generate audiobooks from PDF files using Google's Text-to-Speech Long Audio API.

## Features

- User authentication (sign up, sign in, session management)
- PDF upload and management
- Audiobook generation from PDFs using Google Cloud TTS
- Audiobook playback and management

## Tech Stack

- **Frontend**: Next.js, React, Tailwind CSS, Shadcn/UI
- **Authentication**: Better Auth
- **Database**: PostgreSQL with Drizzle ORM
- **Text-to-Speech**: Google Cloud Text-to-Speech Long Audio API
- **Storage**: Google Cloud Storage
- **Validation**: Zod

## Getting Started

### Prerequisites

- Node.js (v18+)
- pnpm
- Docker (for the PostgreSQL database)
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

4. Start the database:

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
```

## How It Works

1. Users sign up and authenticate with Better Auth
2. Users upload PDF files through the web interface
3. The app extracts text from the PDF using pdf-parse
4. The app sends the text to Google's Text-to-Speech Long Audio API
5. Google TTS processes the text and stores the audio file in Google Cloud Storage
6. The app downloads the audio file to the local server and makes it available for streaming
7. Users can manage their audiobooks and listen to them directly in the browser

## Project Structure

- `/app`: Next.js app router pages
- `/components`: React components
- `/lib`: Utility functions and configuration
- `/database`: Database schema and queries
- `/actions`: Server actions for PDF upload and TTS processing
- `/public`: Static assets and generated audio files

## User Flows

1. **Registration/Login**: Users create an account or sign in
2. **PDF Upload**: Users upload PDF files
3. **Audiobook Generation**: The system converts the PDF to audio using Google TTS
4. **Audiobook Management**: Users can view, play, and delete their audiobooks

## Limitations

- PDF files must contain selectable text (not scanned images)
- Maximum PDF size of 10MB
- Only english text tested
- Long PDFs may take significant time to process

## Future Enhancements

- Multiple voice options and languages
- Voice customization options (pitch, speed, etc.)
- PDF text extraction improvements
- Progress tracking for long audiobooks
- Bookmarking functionality