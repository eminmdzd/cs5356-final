"use server"

import { headers } from "next/headers"
import { revalidatePath } from "next/cache"
import { auth } from "@/lib/auth"
import { db } from "@/database/db"
import { audiobooks, pdfs } from "@/database/schema"
import { and, eq } from "drizzle-orm"
import { TextToSpeechClient } from "@google-cloud/text-to-speech"
import * as fs from "fs/promises"
import * as path from "path"
import { processAudiobookJob } from "@/lib/audiobook-processing"
// Import Vercel Blob conditionally
let vercelBlob: any = { del: null };
try {
  if (process.env.NODE_ENV === 'production') {
    import('@vercel/blob').then(module => {
      vercelBlob = module;
    });
  }
} catch (error) {
  console.warn('Vercel Blob not available, using local filesystem for storage');
}

// Determine if we're in production
const isProduction = process.env.NODE_ENV === 'production';

// Initialize Google Cloud clients
let ttsClient: TextToSpeechClient;
try {
  const isProduction = process.env.NODE_ENV === 'production';

  console.log(`Initializing Google TTS client in ${isProduction ? 'production' : 'development'} mode`);

  if (isProduction) {
    // In production, directly use credentials from environment variables
    if (process.env.GOOGLE_PROJECT_ID &&
        process.env.GOOGLE_PRIVATE_KEY &&
        process.env.GOOGLE_CLIENT_EMAIL) {

      // Create credentials object directly from environment variables
      const credentials = {
        projectId: process.env.GOOGLE_PROJECT_ID,
        credentials: {
          client_email: process.env.GOOGLE_CLIENT_EMAIL,
          private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n')
        }
      };

      console.log(`Using Google credentials directly from environment variables`);
      ttsClient = new TextToSpeechClient(credentials);
    }
    // Fall back to credentials file if available
    else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      console.log(`Falling back to credentials file: ${process.env.GOOGLE_APPLICATION_CREDENTIALS}`);
      ttsClient = new TextToSpeechClient({
        keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS
      });
    }
    else {
      throw new Error("No Google credentials found in production environment");
    }
  }
  // Development mode - use credentials file
  else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    console.log(`Using credentials file from GOOGLE_APPLICATION_CREDENTIALS: ${process.env.GOOGLE_APPLICATION_CREDENTIALS}`);
    ttsClient = new TextToSpeechClient({
      keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS
    });
  }
  else {
    throw new Error("No Google credentials found. In development, set GOOGLE_APPLICATION_CREDENTIALS environment variable.")
  }

  console.log("Google TTS client initialized successfully");
} catch (error) {
  console.error("Failed to initialize Google TTS client:", error);
  // We'll handle this error when the function is called
}

export async function generateAudiobook(formData: FormData) {
  // Verify user is authenticated
  const session = await auth.api.getSession({
    headers: await headers()
  });

  if (!session || !session.user) {
    return "Not authenticated; please log in.";
  }

  try {
    const pdfId = formData.get("pdfId") as string;
    const audiobookId = formData.get("audiobookId") as string; // For retry functionality

    if (!pdfId) {
      return "PDF ID is required";
    }

    // Verify the PDF belongs to the user
    const pdf = await db.query.pdfs.findFirst({
      where: and(
        eq(pdfs.id, pdfId),
        eq(pdfs.userId, session.user.id)
      )
    });

    if (!pdf) {
      return "PDF not found or you don't have permission to access it";
    }

    let targetAudiobookId = audiobookId;

    // If no audiobook ID was provided (new generation)
    if (!targetAudiobookId) {
      // Get the existing audiobook record
      const existingAudiobook = await db.query.audiobooks.findFirst({
        where: and(
          eq(audiobooks.pdfId, pdfId),
          eq(audiobooks.userId, session.user.id)
        )
      });

      if (!existingAudiobook) {
        return "No existing audiobook"
      }

      targetAudiobookId = existingAudiobook.id;
    }

    console.log(`Starting audiobook generation for ID ${targetAudiobookId}`);

    // Clear any previous error details and update status to processing
    await db
      .update(audiobooks)
      .set({
        processingStatus: "processing",
        errorDetails: null,
      })
      .where(
        and(
          eq(audiobooks.id, targetAudiobookId),
          eq(audiobooks.userId, session.user.id)
        )
      );

    // Revalidate paths to show updated status immediately
    revalidatePath("/audiobooks");
    revalidatePath("/dashboard");
    revalidatePath(`/audiobooks/${targetAudiobookId}`);

    // Set initial progress to 5% in the DB
    await db.update(audiobooks)
      .set({ progress: 5 })
      .where(and(
        eq(audiobooks.id, targetAudiobookId),
        eq(audiobooks.userId, session.user.id)
      ));

    // Start processing asynchronously (do not await)
    void processAudiobookJob({
      audiobookId: targetAudiobookId,
      pdfPath: pdf.filePath,
      userId: session.user.id,
      ttsClient
    });

    return "success";
  } catch (error: any) {
    console.error("Error initiating audiobook generation:", error);
    return error.message || "Failed to start audiobook generation";
  }
}

export async function updateAudiobookTitle(formData: FormData) {
  // Verify user is authenticated
  const session = await auth.api.getSession({
    headers: await headers()
  });

  if (!session || !session.user) {
    return "Not authenticated; please log in.";
  }

  try {
    const audiobookId = formData.get("id") as string;
    const title = formData.get("title") as string;

    if (!audiobookId) {
      return "Audiobook ID is required";
    }

    if (!title) {
      return "Title is required";
    }

    // Verify the audiobook belongs to the user
    const audiobook = await db.query.audiobooks.findFirst({
      where: and(
        eq(audiobooks.id, audiobookId),
        eq(audiobooks.userId, session.user.id)
      )
    });

    if (!audiobook) {
      return "Audiobook not found or you don't have permission to update it";
    }

    // Update the audiobook title
    await db
      .update(audiobooks)
      .set({ title })
      .where(
        and(
          eq(audiobooks.id, audiobookId),
          eq(audiobooks.userId, session.user.id)
        )
      );

    revalidatePath("/audiobooks");
    revalidatePath("/dashboard");
    revalidatePath(`/audiobooks/${audiobookId}`);

    return "success";
  } catch (error: any) {
    console.error("Error updating audiobook title:", error);
    return error.message || "Failed to update audiobook title";
  }
}

export async function deleteAudiobook(formData: FormData) {
  // Verify user is authenticated
  const session = await auth.api.getSession({
    headers: await headers()
  });

  if (!session || !session.user) {
    return "Not authenticated; please log in.";
  }

  try {
    const audiobookId = formData.get("id") as string;

    if (!audiobookId) {
      return "Audiobook ID is required";
    }

    // Get the audiobook to delete
    const audiobook = await db.query.audiobooks.findFirst({
      where: and(
        eq(audiobooks.id, audiobookId),
        eq(audiobooks.userId, session.user.id)
      )
    });

    if (!audiobook) {
      return "Audiobook not found or you don't have permission to delete it";
    }

    // If there's an audio file, delete it
    if (audiobook.audioPath) {
      try {
        if (isProduction && process.env.BLOB_READ_WRITE_TOKEN && vercelBlob.del &&
            (audiobook.audioPath.startsWith('http://') || audiobook.audioPath.startsWith('https://'))) {
          try {
            // Delete from Vercel Blob Storage
            await vercelBlob.del(audiobook.audioPath);
            console.log(`Deleted audiobook file from Blob Storage: ${audiobook.audioPath}`);
          } catch (error) {
            console.error(`Error deleting file from Blob Storage: ${audiobook.audioPath}`, error);
          }
        } else {
          // Delete from local filesystem
          const filePath = path.join(process.cwd(), "public", audiobook.audioPath);
          await fs.unlink(filePath);
          console.log(`Deleted audiobook file from local filesystem: ${filePath}`);
        }
      } catch (error) {
        console.error("Error deleting audio file:", error);
        // Continue with deletion even if file removal fails
      }
    }

    // Delete the audiobook from the database
    await db
      .delete(audiobooks)
      .where(
        and(
          eq(audiobooks.id, audiobookId),
          eq(audiobooks.userId, session.user.id)
        )
      );

    revalidatePath("/audiobooks");
    revalidatePath("/dashboard");

    return "success";
  } catch (error: any) {
    console.error("Error deleting audiobook:", error);
    return error.message || "Failed to delete audiobook";
  }
}