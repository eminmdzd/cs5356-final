"use server"

import { headers } from "next/headers"
import { revalidatePath } from "next/cache"
import { auth } from "@/lib/auth"
import { db } from "@/database/db"
import { audiobooks, pdfs } from "@/database/schema"
import { and, eq } from "drizzle-orm"

// This is a mock function that would normally call a text-to-speech API like Google TTS
async function mockTextToSpeech(pdfId: string, userId: string) {
  try {
    // Update the audiobook status to processing
    await db
      .update(audiobooks)
      .set({ processingStatus: "processing" })
      .where(
        and(
          eq(audiobooks.pdfId, pdfId),
          eq(audiobooks.userId, userId)
        )
      )
    
    revalidatePath("/audiobooks")
    
    // In a real application, you would:
    // 1. Extract text from the PDF
    // 2. Call a TTS API like Google TTS
    // 3. Save the generated audio file
    // 4. Update the audiobook record with the audio path and metadata
    
    // Simulate processing time (5 seconds)
    await new Promise(resolve => setTimeout(resolve, 5000))
    
    // Generate a mock audio path
    const audioPath = `/audio/${pdfId}.mp3`
    
    // Update the audiobook as completed
    await db
      .update(audiobooks)
      .set({ 
        processingStatus: "completed",
        audioPath: audioPath,
        duration: Math.floor(Math.random() * 1800) + 300 // Random duration between 5-35 minutes
      })
      .where(
        and(
          eq(audiobooks.pdfId, pdfId),
          eq(audiobooks.userId, userId)
        )
      )
    
    revalidatePath("/audiobooks")
    return true
  } catch (error) {
    console.error("Error generating audiobook:", error)
    
    // Update the audiobook status to failed
    await db
      .update(audiobooks)
      .set({ processingStatus: "failed" })
      .where(
        and(
          eq(audiobooks.pdfId, pdfId),
          eq(audiobooks.userId, userId)
        )
      )
    
    revalidatePath("/audiobooks")
    return false
  }
}

export async function generateAudiobook(formData: FormData) {
  // Verify user is authenticated
  const session = await auth.api.getSession({
    headers: await headers()
  })

  if (!session || !session.user) {
    return "Not authenticated; please log in."
  }

  try {
    const pdfId = formData.get("pdfId") as string
    
    if (!pdfId) {
      return "PDF ID is required"
    }
    
    // Verify the PDF belongs to the user
    const pdf = await db.query.pdfs.findFirst({
      where: and(
        eq(pdfs.id, pdfId),
        eq(pdfs.userId, session.user.id)
      )
    })
    
    if (!pdf) {
      return "PDF not found or you don't have permission to access it"
    }
    
    // Start the text-to-speech conversion process
    // This would typically be handled by a background job
    // But for this example, we'll handle it synchronously
    const result = await mockTextToSpeech(pdfId, session.user.id)
    
    if (result) {
      return "success"
    } else {
      return "Failed to generate audiobook"
    }
  } catch (error: any) {
    console.error("Error generating audiobook:", error)
    return error.message || "Failed to generate audiobook"
  }
}

export async function deleteAudiobook(formData: FormData) {
  // Verify user is authenticated
  const session = await auth.api.getSession({
    headers: await headers()
  })

  if (!session || !session.user) {
    return "Not authenticated; please log in."
  }

  try {
    const audiobookId = formData.get("id") as string
    
    if (!audiobookId) {
      return "Audiobook ID is required"
    }
    
    // Delete the audiobook if it belongs to the user
    await db
      .delete(audiobooks)
      .where(
        and(
          eq(audiobooks.id, audiobookId),
          eq(audiobooks.userId, session.user.id)
        )
      )
    
    revalidatePath("/audiobooks")
    revalidatePath("/dashboard")
    
    return "success"
  } catch (error: any) {
    console.error("Error deleting audiobook:", error)
    return error.message || "Failed to delete audiobook"
  }
}