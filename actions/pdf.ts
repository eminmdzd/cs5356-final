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
// Import Vercel Blob conditionally to allow development without it
let vercelBlob: any = { put: null };
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

    // Generate a unique file name
    const uniqueId = nanoid()
    const fileName = `${uniqueId}-${file.name.replace(/\s+/g, '-')}`
    let filePath = '';
    let originalPath = null;

    // Get file buffer
    const buffer = Buffer.from(await file.arrayBuffer())

    if (isProduction) {
      // In production, we MUST use Vercel Blob Storage, no fallbacks
      if (!process.env.BLOB_READ_WRITE_TOKEN || !vercelBlob.put) {
        console.error("Missing Vercel Blob configuration in production");
        throw new Error("Storage configuration error: Missing Blob Storage token");
      }
      
      // Use Vercel Blob Storage in production
      const blob = await vercelBlob.put(fileName, file, {
        access: 'public',
      });
      
      filePath = blob.url;
      console.log(`File uploaded to Blob Storage: ${filePath}`);
    } else {
      // Use local filesystem in development
      const uploadDir = path.resolve("public/uploads");
      filePath = `/uploads/${fileName}`;
      const fullPath = path.join(uploadDir, fileName);
      originalPath = fullPath; // Store local path for development environment
      
      // Ensure upload directory exists
      await mkdir(uploadDir, { recursive: true });
      
      // Save to local filesystem
      await writeFile(fullPath, buffer);
      console.log(`File saved locally: ${fullPath}`);
    }

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

    const { generateAudiobook } = await import('@/actions/audiobook');

    // Add the audiobook ID to the form data
    formData.append('audiobookId', newAudiobook.id);
    formData.append('pdfId', newPdf.id);

    // Call the server action
    const result = await generateAudiobook(formData);

    revalidatePath("/dashboard")
    revalidatePath("/audiobooks")

    return result
  } catch (error: any) {
    console.error("Error uploading PDF:", error)
    return error.message || "Failed to upload PDF"
  }
}