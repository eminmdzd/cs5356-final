import { db } from '@/database/db';
import { audiobooks } from '@/database/schema';
import { eq } from 'drizzle-orm';
import { TextToSpeechClient } from '@google-cloud/text-to-speech';
import * as fs from 'fs/promises';
import * as path from 'path';
import pdfParse from 'pdf-parse';
const isProduction = process.env.NODE_ENV === 'production';

async function extractTextWithPdfParse(dataBuffer: Buffer): Promise<string> {
  // Use pdf-parse to extract text
  const data = await pdfParse(dataBuffer);
  return data.text;
}

function splitTextIntoChunks(text: string, maxBytes: number): string[] {
  // Simple split by sentences, but keep under maxBytes
  const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
  const chunks: string[] = [];
  let chunk = '';
  let chunkBytes = 0;
  for (const sentence of sentences) {
    const sentenceBytes = Buffer.byteLength(sentence, 'utf8');
    if (chunkBytes + sentenceBytes > maxBytes && chunk) {
      chunks.push(chunk);
      chunk = sentence;
      chunkBytes = sentenceBytes;
    } else {
      chunk += sentence;
      chunkBytes += sentenceBytes;
    }
  }
  if (chunk) chunks.push(chunk);
  return chunks;
}

export async function processAudiobookJob({
  audiobookId,
  pdfPath,
  userId,
  ttsClient,
}: {
  audiobookId: string;
  pdfPath: string;
  userId: string;
  ttsClient: TextToSpeechClient;
}) {
  try {
    await db.update(audiobooks)
      .set({ processingStatus: 'processing', progress: 5 })
      .where(eq(audiobooks.id, audiobookId));

    // 1. Extract PDF text
    let dataBuffer: Buffer;
    const isRemote = pdfPath.startsWith('http://') || pdfPath.startsWith('https://');
    const isProd = process.env.NODE_ENV === 'production';
    if (isRemote && isProd) {
      // Fetch from Vercel Blob Storage or remote URL
      const response = await fetch(pdfPath);
      if (!response.ok) throw new Error(`Failed to fetch remote PDF: ${response.statusText}`);
      const arrayBuffer = await response.arrayBuffer();
      dataBuffer = Buffer.from(arrayBuffer);
    } else {
      // Local file system (dev)
      const cleanPath = pdfPath.startsWith('/') ? pdfPath.slice(1) : pdfPath;
      const absolutePath = path.join(process.cwd(), 'public', cleanPath);
      dataBuffer = await fs.readFile(absolutePath);
    }
    await db.update(audiobooks).set({ progress: 20 }).where(eq(audiobooks.id, audiobookId));
    const text = await extractTextWithPdfParse(dataBuffer);
    await db.update(audiobooks).set({ progress: 30 }).where(eq(audiobooks.id, audiobookId));

    // 2. Split text into smaller chunks for production
    // Use smaller chunks in production to prevent timeouts
    const maxChunkSize = isProduction ? 3000 : 5000;
    console.log(`Splitting text into chunks with max size of ${maxChunkSize} bytes`);
    const chunks = splitTextIntoChunks(text, maxChunkSize);
    await db.update(audiobooks).set({ progress: 40 }).where(eq(audiobooks.id, audiobookId));

    // 3. Generate audio for each chunk (reduced concurrency in production)
    const audioBuffers: Buffer[] = new Array(chunks.length);
    // Use lower concurrency in production to prevent TTS API overwhelm
    const concurrency = isProduction ? 3 : 5;
    console.log(`Using concurrency of ${concurrency} for TTS API calls`);
    let completed = 0;
    async function synthesizeChunk(i: number) {
      const startTime = Date.now();
      console.log(`Starting synthesis for chunk ${i}/${chunks.length} at ${new Date().toISOString()}`);
      
      const synthesisInput = { text: chunks[i] };
      // Use a different voice in production to avoid potential overloaded voices
      const voice = {
        languageCode: 'en-US',
        name: isProduction ? 'en-US-Neural2-F' : 'en-US-Neural2-D',
      };
      const audioConfig = {
        audioEncoding: 'MP3' as const,
        effectsProfileId: ['small-bluetooth-speaker-class-device'],
        pitch: 0.0,
        speakingRate: 1.0,
      };
      
      try {
        console.log(`Calling TTS API for chunk ${i}, text length: ${chunks[i].length}`);
        const [response] = await ttsClient.synthesizeSpeech({ input: synthesisInput, voice, audioConfig });
        const duration = Date.now() - startTime;
        console.log(`TTS completed for chunk ${i} in ${duration}ms, response size: ${response.audioContent ? Buffer.from(response.audioContent as string, 'base64').length : 0} bytes`);
        
        if (!response.audioContent) throw new Error(`No audio content for chunk ${i}`);
        const buffer = Buffer.isBuffer(response.audioContent)
          ? response.audioContent
          : Buffer.from(response.audioContent as string, 'base64');
        audioBuffers[i] = buffer;
      } catch (error) {
        console.error(`Error synthesizing chunk ${i}:`, error);
        throw error; // Re-throw to halt processing
      }
      completed++;
      // Progress: 40 + (completed/chunks.length)*50
      const progress = 40 + Math.floor((completed / chunks.length) * 50);
      await db.update(audiobooks).set({ progress }).where(eq(audiobooks.id, audiobookId));
    }
    // Process chunks in batches of 5
    for (let batchStart = 0; batchStart < chunks.length; batchStart += concurrency) {
      const batch = [];
      for (let j = 0; j < concurrency && batchStart + j < chunks.length; j++) {
        batch.push(synthesizeChunk(batchStart + j));
      }
      await Promise.all(batch);
    }

    // 4. Concatenate audio and save to appropriate storage
    const concatenatedAudio = Buffer.concat(audioBuffers);
    const audioFileName = `${audiobookId}.mp3`;
    let audioPath = `/audio/${audioFileName}`;
    
    // In production, use Vercel Blob Storage
    if (isProduction) {
      try {
        // Dynamic import of Vercel Blob
        const { put } = await import('@vercel/blob');
        
        // Check if we have the necessary token
        if (!process.env.BLOB_READ_WRITE_TOKEN) {
          throw new Error("Missing BLOB_READ_WRITE_TOKEN in production environment");
        }
        
        // Create a File object from the buffer
        const file = new File([concatenatedAudio], audioFileName, { type: 'audio/mpeg' });
        
        // Upload to Vercel Blob Storage
        const blob = await put(audioFileName, file, {
          access: 'public',
        });
        
        // Update the path to the Blob URL
        audioPath = blob.url;
        console.log(`Audiobook saved to Blob Storage: ${audioPath}`);
      } catch (error) {
        console.error("Failed to save audiobook to Blob Storage:", error);
        throw new Error(`Unable to save audiobook in production: ${error.message}`);
      }
    } else {
      // In development, use local filesystem
      const outputDir = path.join(process.cwd(), 'public/audio');
      await fs.mkdir(outputDir, { recursive: true });
      const localAudioPath = path.join(outputDir, audioFileName);
      await fs.writeFile(localAudioPath, concatenatedAudio);
      console.log(`Audiobook saved locally: ${localAudioPath}`);
    }
    await db.update(audiobooks).set({ progress: 100, processingStatus: 'completed', audioPath }).where(eq(audiobooks.id, audiobookId));
  } catch (error: any) {
    await db.update(audiobooks).set({ processingStatus: 'failed', errorDetails: error.message }).where(eq(audiobooks.id, audiobookId));
    throw error;
  }
}
