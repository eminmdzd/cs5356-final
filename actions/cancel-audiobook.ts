"use server"

import { headers } from "next/headers"
import { revalidatePath } from "next/cache"
import { auth } from "@/lib/auth"
import { db } from "@/database/db"
import { audiobooks } from "@/database/schema"
import { and, eq } from "drizzle-orm"

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

    // Update the database to mark the audiobook as failed with cancellation message
    await db
      .update(audiobooks)
      .set({
        processingStatus: "failed",
        errorDetails: "Processing was cancelled by the user"
      })
      .where(
        and(
          eq(audiobooks.id, audiobookId),
          eq(audiobooks.userId, session.user.id)
        )
      );

    // Reset progress
    setJobProgress(audiobookId, 0);
    console.log(`Reset progress for audiobook ${audiobookId}`);

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