"use server"

import { headers } from "next/headers"
import { revalidatePath } from "next/cache"
import { auth } from "@/lib/auth"
import { db } from "@/database/db"
import { audiobooks } from "@/database/schema"
import { and, eq } from "drizzle-orm"
import * as fs from "fs/promises"
import * as path from "path"

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

export async function cancelAudiobookGeneration(formData: FormData) {
  // Verify user is authenticated
  const session = await auth.api.getSession({
    headers: await headers()
  });

  if (!session || !session.user) {
    return "Not authenticated; please log in.";
  }

  try {
    const audiobookId = formData.get("audiobookId") as string;

    if (!audiobookId) {
      return "Audiobook ID is required";
    }

    // Verify the audiobook belongs to the user
    const audiobook = await db.query.audiobooks.findFirst({
      where: and(
        eq(audiobooks.id, audiobookId),
        eq(audiobooks.userId, session.user.id)
      )
    });

    if (!audiobook) {
      return "Audiobook not found or you don't have permission to access it";
    }

    // Only allow cancellation if it's in processing or pending state
    if (audiobook.processingStatus !== "processing" && audiobook.processingStatus !== "pending") {
      return "Cannot cancel audiobook that is not in processing or pending state";
    }

    console.log(`Cancelling audiobook generation for ${audiobookId}`);

    // Clean up any partial audio files if they exist
    if (audiobook.audioPath) {
      try {
        if (isProduction) {
          if (audiobook.audioPath.startsWith('http://') || audiobook.audioPath.startsWith('https://')) {
            // In production, delete from Blob Storage
            if (!process.env.BLOB_READ_WRITE_TOKEN || !vercelBlob.del) {
              console.error("Missing Vercel Blob configuration for deletion in production");
            } else {
              try {
                await vercelBlob.del(audiobook.audioPath);
                console.log(`Deleted partial audiobook file from Blob Storage: ${audiobook.audioPath}`);
              } catch (error) {
                console.error(`Error deleting file from Blob Storage: ${audiobook.audioPath}`, error);
              }
            }
          }
        } else {
          // In development, delete from local filesystem
          try {
            const filePath = path.join(process.cwd(), "public", audiobook.audioPath);
            await fs.unlink(filePath);
            console.log(`Deleted partial audiobook file from local filesystem: ${filePath}`);
          } catch (fileError) {
            console.error("Error deleting local audio file:", fileError);
          }
        }
      } catch (error) {
        console.error("Error during file cleanup:", error);
        // Continue with cancellation even if file removal fails
      }
    }

    // Update the database to mark the audiobook as failed with cancellation message
    // Also remove any partial audioPath that might have been set
    await db
      .update(audiobooks)
      .set({
        processingStatus: "failed",
        progress: 0,
        errorDetails: "Processing was cancelled by the user",
        audioPath: null, // Clear any partial audio path
        duration: null   // Clear any partial duration
      })
      .where(
        and(
          eq(audiobooks.id, audiobookId),
          eq(audiobooks.userId, session.user.id)
        )
      );

    // Check if any temporary files need cleaning up in the /tmp directory
    try {
      const tempDir = path.join(process.cwd(), 'tmp');
      const tempFilePath = path.join(tempDir, `${audiobookId}.mp3`);
      await fs.unlink(tempFilePath).catch(() => {
        // Ignore errors if the file doesn't exist
      });
    } catch (tempError) {
      console.warn('Error cleaning up temp files:', tempError);
      // Non-critical, so continue with cancellation
    }

    // Revalidate paths
    revalidatePath("/audiobooks");
    revalidatePath("/dashboard");
    revalidatePath(`/audiobooks/${audiobookId}`);

    return "success";
  } catch (error: any) {
    console.error("Error cancelling audiobook:", error);
    return error.message || "Failed to cancel audiobook";
  }
}