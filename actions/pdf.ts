"use server"

import { headers } from "next/headers"
import { revalidatePath } from "next/cache"
import { auth } from "@/lib/auth"
import { db } from "@/database/db"
import { insertPdfSchema, pdfs, insertAudiobookSchema, audiobooks } from "@/database/schema"
import { generateAudiobook } from "./audiobook"

import { z } from "zod"
import { writeFile } from "fs/promises"
import { nanoid } from "nanoid"
import path from "path"

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
    const uploadDir = path.resolve("public/uploads")
    const filePath = `/uploads/${fileName}`
    const fullPath = path.join(uploadDir, fileName)

    // Save the file to the uploads directory
    const buffer = Buffer.from(await file.arrayBuffer())
    await writeFile(fullPath, buffer)

    // Create a record in the database
    const pdfData = {
      fileName: file.name,
      fileSize: file.size,
      filePath,
      userId: session.user.id
    }

    const parsedPdf = insertPdfSchema.safeParse(pdfData)
    if (!parsedPdf.success) {
      return parsedPdf.error.errors[0].message
    }

    // Insert the PDF record
    const [newPdf] = await db.insert(pdfs).values(parsedPdf.data).returning()

    console.log("before insert")
    // Create a pending audiobook record
    const audiobookData = {
      title: file.name.replace(".pdf", ""),
      processingStatus: "pending",
      pdfId: newPdf.id,
      userId: session.user.id
    }

    const parsedAudiobook = insertAudiobookSchema.safeParse(audiobookData)
    if (!parsedAudiobook.success) {
      return parsedAudiobook.error.errors[0].message
    }

    await db.insert(audiobooks).values(parsedAudiobook.data)
    
    console.log("after insert")

    // Automatically trigger the audiobook generation process
    const audiobookFormData = new FormData()
    audiobookFormData.append("pdfId", newPdf.id)
    await generateAudiobook(audiobookFormData)

    revalidatePath("/dashboard")
    revalidatePath("/audiobooks")

    return "success"
  } catch (error: any) {
    console.error("Error uploading PDF:", error)
    return error.message || "Failed to upload PDF"
  }
}