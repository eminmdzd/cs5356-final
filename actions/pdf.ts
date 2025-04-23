"use server"

import { headers } from "next/headers"
import { revalidatePath } from "next/cache"
import { auth } from "@/lib/auth"
import { db } from "@/database/db"
import { insertPdfSchema, pdfs, insertAudiobookSchema, audiobooks } from "@/database/schema"
import { and, eq } from "drizzle-orm"
import { z } from "zod"
import { writeFile, mkdir } from "fs/promises"
import { nanoid } from "nanoid"
import path from "path"
import { addAudiobookJob } from "@/lib/queue"

// Validates the file is a PDF
const validatePdfFile = (file: File) => {
  const fileTypeSchema = z.object({
    name: z.string().endsWith(".pdf", { message: "File must be a PDF" }),
    type: z.string().includes("pdf", { message: "File must be a PDF" }),
    size: z.number().max(10 * 1024 * 1024, { message: "File must be less than 10MB" })
  })

  return fileTypeSchema.safeParse(file)
}

export async function uploadPdf(formData: FormData) {
  // Verify user is authenticated
  const session = await auth.api.getSession({
    headers: await headers()
  })

  if (!session || !session.user) {
    return "Not authenticated; please log in."
  }

  try {
    // Get the file from the form
    const file = formData.get("file") as File

    // Validate the PDF file
    const validation = validatePdfFile(file)
    if (!validation.success) {
      return validation.error.errors[0].message
    }

    // Get the original path if provided (for files uploaded from client's device)
    const originalPath = formData.get("originalPath") as string || null;

    // Generate a unique file name
    const uniqueId = nanoid()
    const fileName = `${uniqueId}-${file.name.replace(/\s+/g, '-')}`
    const uploadDir = path.resolve("public/uploads")
    const filePath = `/uploads/${fileName}`
    const fullPath = path.join(uploadDir, fileName)

    // Ensure upload directory exists
    await mkdir(uploadDir, { recursive: true });

    // Save the file to the uploads directory
    const buffer = Buffer.from(await file.arrayBuffer())
    await writeFile(fullPath, buffer)

    // Create a record in the database
    const pdfData = {
      fileName: file.name,
      fileSize: file.size,
      filePath,
      originalPath,
      userId: session.user.id
    }

    const parsedPdf = insertPdfSchema.safeParse(pdfData)
    if (!parsedPdf.success) {
      return parsedPdf.error.errors[0].message
    }

    // Insert the PDF record
    const [newPdf] = await db.insert(pdfs).values(parsedPdf.data).returning()

    console.log("before insert")
    // Create an audiobook record with "pending" status initially
    const audiobookData = {
      title: file.name.replace(".pdf", ""),
      processingStatus: "pending", // Start as pending until worker picks it up
      pdfId: newPdf.id,
      userId: session.user.id
    }

    const parsedAudiobook = insertAudiobookSchema.safeParse(audiobookData)
    if (!parsedAudiobook.success) {
      return parsedAudiobook.error.errors[0].message
    }

    await db.insert(audiobooks).values(parsedAudiobook.data)
    
    console.log("after insert")

    // Create job data for the audiobook processing queue
    const [newAudiobook] = await db.select().from(audiobooks)
      .where(and(
        eq(audiobooks.pdfId, newPdf.id),
        eq(audiobooks.userId, session.user.id)
      ));

    if (!newAudiobook) {
      throw new Error("Failed to create audiobook record");
    }

    // Import the progress tracking function
    const { setJobProgress } = await import('@/lib/queue')
    
    // Set initial progress to 5% to indicate job is starting
    setJobProgress(newAudiobook.id, 5)
    console.log(`Set initial progress for audiobook ${newAudiobook.id} to 5%`)
    
    // Ensure worker is running by accessing the API endpoint
    try {
      // Use absolute URL with the current domain
      const protocol = process.env.NODE_ENV === 'production' ? 'https' : 'http';
      const host = process.env.VERCEL_URL || process.env.NEXT_PUBLIC_APP_URL || 'localhost:3000';
      const workerUrl = `${protocol}://${host}/api/worker`;
      
      console.log(`Checking worker at URL: ${workerUrl}`);
      await fetch(workerUrl);
      console.log('Worker endpoint accessed to ensure worker is running');
    } catch (error) {
      console.log('Worker check error (ignored):', error);
    }
    
    // NOTE: We've moved job creation to the worker API endpoint
    // This prevents duplicate jobs from being created
    console.log(`Letting worker API create the job for audiobook ${newAudiobook.id}`)

    revalidatePath("/dashboard")
    revalidatePath("/audiobooks")

    return "success"
  } catch (error: any) {
    console.error("Error uploading PDF:", error)
    return error.message || "Failed to upload PDF"
  }
}