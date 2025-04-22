"use server"

import { headers } from "next/headers"
import { revalidatePath } from "next/cache"
import { auth } from "@/lib/auth"
import { db } from "@/database/db"
import { audiobooks, pdfs } from "@/database/schema"
import { and, eq } from "drizzle-orm"
import { TextToSpeechClient, TextToSpeechLongAudioSynthesizeClient } from "@google-cloud/text-to-speech"
import { Storage } from "@google-cloud/storage"
import * as fs from "fs/promises"
import * as path from "path"
import pdfParse from "pdf-parse"

// Initialize Google Cloud clients
const ttsClient = new TextToSpeechClient({
  keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS
});
const storageClient = new Storage();

async function extractTextFromPDF(filePath: string): Promise<string> {
  try {
    // Remove the leading slash if it exists
    const cleanPath = filePath.startsWith('/') ? filePath.slice(1) : filePath;
    const absolutePath = path.join(process.cwd(), "public", cleanPath);

    console.error("Attempting to read PDF at:", absolutePath);

    // Check if file exists
    try {
      await fs.access(absolutePath);
    } catch (error: any) {
      console.error("File does not exist at path:", absolutePath);
      throw new Error(`PDF file not found at ${absolutePath}`);
    }

    const dataBuffer = await fs.readFile(absolutePath);
    console.error("Successfully read PDF file, size:", dataBuffer.length);

    const data = await pdfParse(dataBuffer);
    console.error("Successfully parsed PDF, text length:", data.text.length);

    return data.text;
  } catch (error: any) {
    console.error("Error extracting text from PDF:", error);
    throw new Error(`Failed to extract text from PDF: ${error.message}`);
  }
}

async function generateAudioWithGoogleTTS(text: string, outputFileName: string, userId: string): Promise<string> {
  try {
    // Split text into chunks of approximately 5000 bytes
    const chunks = splitTextIntoChunks(text, 5000);
    console.error(`Split text into ${chunks.length} chunks`);

    // Create the output directory if it doesn't exist
    const outputDir = path.join(process.cwd(), "public/audio");
    await fs.mkdir(outputDir, { recursive: true });

    // Generate audio for each chunk
    const audioChunks: Buffer[] = [];
    for (let i = 0; i < chunks.length; i++) {
      console.error(`Processing chunk ${i + 1}/${chunks.length}`);

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
    }

    // Concatenate all audio chunks
    const concatenatedAudio = Buffer.concat(audioChunks);

    // Save the final audio file
    const audioPath = path.join(outputDir, `${outputFileName}.mp3`);
    await fs.writeFile(audioPath, concatenatedAudio);

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

    // Update the audiobook status to processing
    await db
      .update(audiobooks)
      .set({ processingStatus: "processing" })
      .where(
        and(
          eq(audiobooks.pdfId, pdfId),
          eq(audiobooks.userId, session.user.id)
        )
      );

    console.log("here")

    revalidatePath("/audiobooks");

    // Start the audiobook generation process
    // This would typically be handled by a background job in production
    try {
      // Extract text from PDF
      console.log(pdf)
      console.log(pdf.filePath)
      const text = await extractTextFromPDF(pdf.filePath);
      console.log(`extracted text ${text}`)
      // Generate a unique filename for the audiobook
      const outputFileName = `audiobook-${pdfId}`;

      // Generate the audiobook using Google TTS
      const audioPath = await generateAudioWithGoogleTTS(text, outputFileName, session.user.id);

      // Get approximate duration - estimate 150 words per minute
      const wordCount = text.split(/\s+/).length;
      const estimatedDuration = Math.ceil(wordCount / 150 * 60); // Duration in seconds

      // Update the audiobook as completed
      await db
        .update(audiobooks)
        .set({
          processingStatus: "completed",
          audioPath: audioPath,
          duration: estimatedDuration
        })
        .where(
          and(
            eq(audiobooks.pdfId, pdfId),
            eq(audiobooks.userId, session.user.id)
          )
        );

      revalidatePath("/audiobooks");
      return "success";
    } catch (error) {
      console.error("Error generating audiobook:", error);

      // Update the audiobook status to failed
      await db
        .update(audiobooks)
        .set({ processingStatus: "failed" })
        .where(
          and(
            eq(audiobooks.pdfId, pdfId),
            eq(audiobooks.userId, session.user.id)
          )
        );

      revalidatePath("/audiobooks");
      throw error;
    }
  } catch (error: any) {
    console.error("Error generating audiobook:", error);
    return error.message || "Failed to generate audiobook";
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