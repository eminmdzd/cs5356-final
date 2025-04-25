import { db } from '@/database/db';
import { audiobooks } from '@/database/schema';
import { eq } from 'drizzle-orm';
import { TextToSpeechClient } from '@google-cloud/text-to-speech';
import * as fs from 'fs/promises';
import * as path from 'path';
import pdfParse from 'pdf-parse';
import mp3Duration from 'mp3-duration';

const isProduction = process.env.NODE_ENV === 'production';

async function extractTextWithPdfParse(dataBuffer: Buffer): Promise<string> {
  // Use pdf-parse to extract text
  const data = await pdfParse(dataBuffer);
  return data.text;
}

function splitTextIntoChunks(text: string, maxBytes: number): string[] {
  // Optimized chunk splitting that maximizes chunk size for fewer API calls
  // Split by sentences first
  const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
  const chunks: string[] = [];
  let chunk = '';
  let chunkBytes = 0;

  for (const sentence of sentences) {
    const sentenceBytes = Buffer.byteLength(sentence, 'utf8');

    // If adding this sentence would exceed maxBytes and we already have content
    if (chunkBytes + sentenceBytes > maxBytes && chunk) {
      // If we're far below maxBytes, try to fill more (avoid small chunks)
      if (chunkBytes < maxBytes * 0.75) {
        // Add as much of the sentence as possible
        let partialSentence = '';
        const words = sentence.split(/\s+/);

        for (const word of words) {
          const wordBytes = Buffer.byteLength(word + ' ', 'utf8');
          if (chunkBytes + wordBytes <= maxBytes) {
            partialSentence += word + ' ';
            chunkBytes += wordBytes;
          } else {
            break;
          }
        }

        if (partialSentence) {
          chunk += partialSentence;
        }
      }

      chunks.push(chunk);
      chunk = sentenceBytes > maxBytes ?
        sentence.substring(0, Math.floor(maxBytes / 2)) : // Handle very long sentences
        sentence;
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

    // 2. Split text into optimized chunks for production
    // Use larger chunks but stay under request limit
    const maxChunkSize = isProduction ? 4700 : 5000; // Increased from 3000 to 4700 for production
    console.log(`Splitting text into chunks with max size of ${maxChunkSize} bytes`);
    const chunks = splitTextIntoChunks(text, maxChunkSize);
    console.log(`Created ${chunks.length} chunks for processing`);
    await db.update(audiobooks).set({ progress: 40 }).where(eq(audiobooks.id, audiobookId));

    // 3. Generate audio for each chunk with optimized concurrency
    const audioBuffers: Buffer[] = new Array(chunks.length);
    // Use adaptive concurrency based on document size
    const docSizeInMB = dataBuffer.length / (1024 * 1024);
    // Adjust concurrency based on document size to prevent API rate limits
    // Small docs: higher concurrency, large docs: lower concurrency
    const baseConcurrency = isProduction ? 4 : 5; // Increased from 3 to 4 for production
    const concurrency = docSizeInMB > 5 ? Math.max(2, Math.floor(baseConcurrency / 2)) : baseConcurrency;

    console.log(`Using concurrency of ${concurrency} for TTS API calls (document size: ${docSizeInMB.toFixed(2)}MB)`);

    let completed = 0;
    let consecutiveErrors = 0;
    const MAX_CONSECUTIVE_ERRORS = 3;

    async function synthesizeChunk(i: number) {
      const startTime = Date.now();
      console.log(`Starting synthesis for chunk ${i}/${chunks.length} at ${new Date().toISOString()}`);

      // Optimize input by removing excessive whitespace and normalizing text
      const optimizedText = chunks[i].replace(/\s+/g, ' ').trim();

      const synthesisInput = { text: optimizedText };
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
        console.log(`Calling TTS API for chunk ${i}, text length: ${optimizedText.length}`);
        const [response] = await ttsClient.synthesizeSpeech({ input: synthesisInput, voice, audioConfig });
        const duration = Date.now() - startTime;
        console.log(`TTS completed for chunk ${i} in ${duration}ms, response size: ${response.audioContent ? Buffer.from(response.audioContent as string, 'base64').length : 0} bytes`);

        if (!response.audioContent) throw new Error(`No audio content for chunk ${i}`);
        const buffer = Buffer.isBuffer(response.audioContent)
          ? response.audioContent
          : Buffer.from(response.audioContent as string, 'base64');
        audioBuffers[i] = buffer;
        consecutiveErrors = 0; // Reset error counter on success
      } catch (error) {
        console.error(`Error synthesizing chunk ${i}:`, error);
        consecutiveErrors++;

        if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
          throw error; // Stop processing after multiple consecutive errors
        }

        // For isolated errors, retry once with reduced content
        if (optimizedText.length > 1000) {
          console.log(`Retrying chunk ${i} with reduced content`);
          try {
            const shorterText = optimizedText.substring(0, Math.floor(optimizedText.length * 0.8));
            const [retryResponse] = await ttsClient.synthesizeSpeech({
              input: { text: shorterText },
              voice,
              audioConfig
            });

            if (!retryResponse.audioContent) throw new Error(`No audio content for retry of chunk ${i}`);
            const buffer = Buffer.isBuffer(retryResponse.audioContent)
              ? retryResponse.audioContent
              : Buffer.from(retryResponse.audioContent as string, 'base64');
            audioBuffers[i] = buffer;
            consecutiveErrors = 0; // Reset error counter on successful retry
          } catch (retryError) {
            console.error(`Retry failed for chunk ${i}:`, retryError);
            throw retryError; // Re-throw if retry also fails
          }
        } else {
          throw error; // Re-throw for short chunks that can't be reduced further
        }
      }

      completed++;
      // Progress: 40 + (completed/chunks.length)*50
      const progress = 40 + Math.floor((completed / chunks.length) * 50);
      await db.update(audiobooks).set({ progress }).where(eq(audiobooks.id, audiobookId));
    }

    // Process chunks in batches with adaptive delay to prevent rate limiting
    for (let batchStart = 0; batchStart < chunks.length; batchStart += concurrency) {
      const batch = [];
      for (let j = 0; j < concurrency && batchStart + j < chunks.length; j++) {
        batch.push(synthesizeChunk(batchStart + j));
      }

      await Promise.all(batch);

      // Add small delay between batches in production to avoid rate limiting
      if (isProduction && batchStart + concurrency < chunks.length) {
        const delay = 500; // 500ms delay between batches
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    // 4. Concatenate audio and save to appropriate storage
    const concatenatedAudio = Buffer.concat(audioBuffers);
    const audioFileName = `${audiobookId}.mp3`;
    let audioPath = `/audio/${audioFileName}`;
    let audioDuration = 0;

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

        // Calculate MP3 duration before uploading
        try {
          // Need to write to temp file first since mp3Duration requires a file path
          const tempDir = path.join(process.cwd(), 'tmp');
          await fs.mkdir(tempDir, { recursive: true });
          const tempFilePath = path.join(tempDir, audioFileName);
          await fs.writeFile(tempFilePath, concatenatedAudio);

          // Get duration using mp3-duration
          audioDuration = await new Promise<number>((resolve, reject) => {
            mp3Duration(tempFilePath, (err, duration) => {
              if (err) reject(err);
              else resolve(duration);
            });
          });

          // Clean up temp file
          await fs.unlink(tempFilePath).catch(err => console.warn('Error deleting temp file:', err));

          console.log(`Calculated MP3 duration: ${audioDuration} seconds`);
        } catch (durationError) {
          console.error("Failed to calculate MP3 duration:", durationError);
          // Continue without duration if we can't calculate it
        }

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

      // Calculate duration from the saved file
      try {
        audioDuration = await new Promise<number>((resolve, reject) => {
          mp3Duration(localAudioPath, (err, duration) => {
            if (err) reject(err);
            else resolve(duration);
          });
        });
        console.log(`Calculated MP3 duration: ${audioDuration} seconds`);
      } catch (durationError) {
        console.error("Failed to calculate MP3 duration:", durationError);
        // Continue without duration if we can't calculate it
      }

      console.log(`Audiobook saved locally: ${localAudioPath}`);
    }

    // Round the duration to the nearest second
    const durationInSeconds = Math.round(audioDuration);

    // Update audiobook with path, duration, and completed status
    await db.update(audiobooks).set({
      progress: 100,
      processingStatus: 'completed',
      audioPath,
      duration: durationInSeconds || null // Use null if we couldn't calculate duration
    }).where(eq(audiobooks.id, audiobookId));
  } catch (error: any) {
    await db.update(audiobooks).set({ processingStatus: 'failed', errorDetails: error.message }).where(eq(audiobooks.id, audiobookId));
    throw error;
  }
}
