"use server"

import { headers } from "next/headers"
import { revalidatePath } from "next/cache"
import { auth } from "@/lib/auth"
import { db } from "@/database/db"
import { audiobooks, pdfs } from "@/database/schema"
import { and, eq } from "drizzle-orm"
import { TextToSpeechClient } from "@google-cloud/text-to-speech"
import { Storage } from "@google-cloud/storage"
import * as fs from "fs/promises"
import * as path from "path"
import pdfParse from "pdf-parse"
import { setJobProgress } from "@/lib/queue"

// Initialize Google Cloud clients
let ttsClient: TextToSpeechClient;
try {
  ttsClient = new TextToSpeechClient({
    keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS
  });
  console.log("Google TTS client initialized successfully");
} catch (error) {
  console.error("Failed to initialize Google TTS client:", error);
  // We'll handle this error when the function is called
}

export async function extractTextFromPDF(filePath: string, originalPath?: string | null): Promise<string> {
  try {
    let dataBuffer: Buffer;
    
    // First try the original path if provided (for files uploaded from client's device)
    if (originalPath) {
      try {
        dataBuffer = await fs.readFile(originalPath);
        console.log("Successfully read PDF from original path:", originalPath);
      } catch (originalPathError) {
        console.log("Failed to read from original path, falling back to app path:", originalPathError);
        
        // Fall back to the app's public directory
        const cleanPath = filePath.startsWith('/') ? filePath.slice(1) : filePath;
        const absolutePath = path.join(process.cwd(), "public", cleanPath);
        
        console.log("Attempting to read PDF at:", absolutePath);
        
        try {
          await fs.access(absolutePath);
        } catch (error: any) {
          console.error("File does not exist at path:", absolutePath);
          throw new Error(`PDF file not found at ${absolutePath}`);
        }
        
        dataBuffer = await fs.readFile(absolutePath);
      }
    } else {
      // No original path, use the app's public directory
      const cleanPath = filePath.startsWith('/') ? filePath.slice(1) : filePath;
      const absolutePath = path.join(process.cwd(), "public", cleanPath);
      
      console.log("Attempting to read PDF at:", absolutePath);
      
      try {
        await fs.access(absolutePath);
      } catch (error: any) {
        console.error("File does not exist at path:", absolutePath);
        throw new Error(`PDF file not found at ${absolutePath}`);
      }
      
      dataBuffer = await fs.readFile(absolutePath);
    }

    console.log("Successfully read PDF file, size:", dataBuffer.length);

    const data = await pdfParse(dataBuffer);
    console.log("Successfully parsed PDF, text length:", data.text.length);

    return data.text;
  } catch (error: any) {
    console.error("Error extracting text from PDF:", error);
    throw new Error(`Failed to extract text from PDF: ${error.message}`);
  }
}

export async function generateAudioWithGoogleTTS(
  text: string, 
  outputFileName: string, 
  userId: string,
  audiobookId: string
): Promise<string> {
  try {
    if (!ttsClient) {
      throw new Error("Google TTS client not initialized");
    }

    // Split text into chunks of approximately 5000 bytes
    const chunks = splitTextIntoChunks(text, 5000);
    console.log(`Split text into ${chunks.length} chunks`);
    
    // Update progress to 20%
    setJobProgress(audiobookId, 20);
    console.log(`Updated progress for ${audiobookId} to 20%`);

    // Create the output directory if it doesn't exist
    const outputDir = path.join(process.cwd(), "public/audio");
    await fs.mkdir(outputDir, { recursive: true });

    // Generate audio for each chunk
    const audioChunks: Buffer[] = [];
    for (let i = 0; i < chunks.length; i++) {
      // Calculate and update progress - scale from 20% to 90% based on chunk processing
      const progress = Math.floor(20 + (i / chunks.length * 70));
      setJobProgress(audiobookId, progress);
      console.log(`Processing chunk ${i + 1}/${chunks.length}, progress: ${progress}%`);

      // Prepare the synthesis input
      const synthesisInput = {
        text: chunks[i],
      };

      // Configure the voice parameters
      const voice = {
        languageCode: "en-US",
        name: "en-US-Neural2-D",
      };

      // Configure the audio parameters
      const audioConfig = {
        audioEncoding: "MP3" as const,
        effectsProfileId: ["small-bluetooth-speaker-class-device"],
        pitch: 0.0,
        speakingRate: 1.0,
      };

      try {
        // Make the request to generate audio
        const [response] = await ttsClient.synthesizeSpeech({
          input: synthesisInput,
          voice,
          audioConfig,
        });
  
        if (!response.audioContent) {
          throw new Error(`No audio content received for chunk ${i + 1}`);
        }
  
        // Convert the audio content to Buffer
        const audioBuffer = typeof response.audioContent === 'string'
          ? Buffer.from(response.audioContent, 'base64')
          : Buffer.from(response.audioContent);
  
        audioChunks.push(audioBuffer);
        console.log(`Successfully generated audio for chunk ${i + 1}/${chunks.length}`);
      } catch (ttsError) {
        console.error(`Error generating audio for chunk ${i + 1}:`, ttsError);
        throw ttsError;
      }
    }

    // Concatenate all audio chunks
    const concatenatedAudio = Buffer.concat(audioChunks);
    console.log(`Combined ${audioChunks.length} audio chunks into a single file`);

    // Save the final audio file
    const audioPath = path.join(outputDir, `${outputFileName}.mp3`);
    await fs.writeFile(audioPath, concatenatedAudio);
    console.log(`Saved audio file to ${audioPath}`);

    // Update progress to 90%
    setJobProgress(audiobookId, 90);
    console.log(`Updated progress for ${audiobookId} to 90%`);

    // Return the public path to the audio file
    return `/audio/${outputFileName}.mp3`;
  } catch (error: any) {
    console.error("Error generating audio with Google TTS:", error);
    throw new Error(`Failed to generate audio: ${error.message}`);
  }
}

// Helper function to split text into chunks of approximately maxBytes
function splitTextIntoChunks(text: string, maxBytes: number): string[] {
  const chunks: string[] = [];
  let currentChunk = '';
  let currentBytes = 0;

  // Split text into sentences to avoid cutting words
  const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];

  for (const sentence of sentences) {
    const sentenceBytes = Buffer.from(sentence).length;

    if (currentBytes + sentenceBytes > maxBytes) {
      if (currentChunk) {
        chunks.push(currentChunk.trim());
        currentChunk = '';
        currentBytes = 0;
      }

      // If a single sentence is too long, split it into words
      if (sentenceBytes > maxBytes) {
        const words = sentence.split(/\s+/);
        let tempChunk = '';
        let tempBytes = 0;

        for (const word of words) {
          const wordBytes = Buffer.from(word + ' ').length;

          if (tempBytes + wordBytes > maxBytes) {
            if (tempChunk) {
              chunks.push(tempChunk.trim());
              tempChunk = '';
              tempBytes = 0;
            }
          }

          tempChunk += word + ' ';
          tempBytes += wordBytes;
        }

        if (tempChunk) {
          chunks.push(tempChunk.trim());
        }
      } else {
        currentChunk = sentence;
        currentBytes = sentenceBytes;
      }
    } else {
      currentChunk += sentence;
      currentBytes += sentenceBytes;
    }
  }

  if (currentChunk) {
    chunks.push(currentChunk.trim());
  }

  return chunks;
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

      targetAudiobookId = existingAudiobook?.id;
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

    // Set initial progress to 5% - job added to queue
    setJobProgress(targetAudiobookId, 5);
    
    // Make sure worker is running by accessing the API endpoint
    try {
      // Use absolute URL with the current domain
      const protocol = process.env.NODE_ENV === 'production' ? 'https' : 'http';
      const host = process.env.VERCEL_URL || process.env.NEXT_PUBLIC_APP_URL || 'localhost:3000';
      const workerUrl = `${protocol}://${host}/api/worker`;
      
      console.log(`Checking worker at URL: ${workerUrl}`);
      await fetch(workerUrl);
    } catch (error) {
      console.log('Worker check error (ignoring):', error);
    }

    // Add job to queue for processing by the worker
    console.log('Adding job to queue for audiobook:', targetAudiobookId);
    const { addAudiobookJob } = await import('@/lib/queue');
    const job = await addAudiobookJob({
      pdfId,
      userId: session.user.id,
      audiobookId: targetAudiobookId
    });
    
    console.log(`Added job ${job.id} to queue for audiobook ${targetAudiobookId}`);

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
        const filePath = path.join(process.cwd(), "public", audiobook.audioPath);
        await fs.unlink(filePath);
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