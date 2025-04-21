# Audiobook Generator App

This application allows users to generate audiobooks from PDF files using text-to-speech technology.

## Features

- User authentication (sign up, sign in, session management)
- PDF upload and management
- Audiobook generation from PDFs
- Audiobook playback and management
- Admin dashboard for system monitoring

## Tech Stack

- **Frontend**: Next.js, React, Tailwind CSS, Shadcn/UI
- **Authentication**: Better Auth
- **Database**: PostgreSQL with Drizzle ORM
- **Validation**: Zod
- **State Management**: React Query

## Getting Started

### Prerequisites

- Node.js (v18+)
- pnpm
- Docker (for the PostgreSQL database)

### Setup

1. Ensure Docker is running locally
2. Create a `.env` file (see below for required environment variables)
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
BETTER_AUTH_SECRET=your-secret-key
BETTER_AUTH_URL=http://localhost:3000
```

## Project Structure

- `/app`: Next.js app router pages
- `/components`: React components
- `/lib`: Utility functions and configuration
- `/database`: Database schema and queries
- `/actions`: Server actions
- `/public`: Static assets

## User Flows

1. **Registration/Login**: Users can create an account or sign in
2. **PDF Upload**: Users can upload PDF files
3. **Audiobook Generation**: The system converts the PDF to audio using TTS
4. **Audiobook Management**: Users can view, play, and delete their audiobooks
5. **Admin Dashboard**: Administrators can view system-wide statistics

## Limitations

- Mock TTS implementation (in a production environment, you would integrate with a real TTS service like Google TTS)
- Maximum PDF size of 10MB
- English text support only
- Basic error handling

## Future Enhancements

- Multiple voice options
- Support for multiple languages
- PDF text extraction improvements
- Progress tracking for long audiobooks
- Bookmarking functionality
- Mobile app with offline playback