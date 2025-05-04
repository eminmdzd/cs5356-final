import { db } from '@/database/db';
import { audiobooks } from '@/database/schema';
import { eq } from 'drizzle-orm';
import { TextToSpeechClient } from '@google-cloud/text-to-speech';
import * as fs from 'fs/promises';
import * as path from 'path';
import pdfParse from 'pdf-parse';
import mp3Duration from 'mp3-duration';
import { sendAudiobookCompletionEmail } from './email';
import { revalidatePath } from 'next/cache';

// Initialize Google Cloud clients
let ttsClient: TextToSpeechClient;
try {
  const isProduction = process.env.NODE_ENV === 'production';
  console.log(`Initializing Google TTS client in ${isProduction ? 'production' : 'development'} mode`);

  if (isProduction) {
    // In production, directly use credentials from environment variables
    if (process.env.GOOGLE_PROJECT_ID &&
        process.env.GOOGLE_PRIVATE_KEY &&
        process.env.GOOGLE_CLIENT_EMAIL) {

      // Create credentials object directly from environment variables
      const credentials = {
        projectId: process.env.GOOGLE_PROJECT_ID,
        credentials: {
          client_email: process.env.GOOGLE_CLIENT_EMAIL,
          private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n')
        }
      };

      console.log(`Using Google credentials directly from environment variables`);
      ttsClient = new TextToSpeechClient(credentials);
    }
    // Fall back to credentials file if available
    else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      console.log(`Falling back to credentials file: ${process.env.GOOGLE_APPLICATION_CREDENTIALS}`);
      ttsClient = new TextToSpeechClient({
        keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS
      });
    }
    else {
      throw new Error("No Google credentials found in production environment");
    }
  }
  // Development mode - use credentials file
  else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    console.log(`Using credentials file from GOOGLE_APPLICATION_CREDENTIALS: ${process.env.GOOGLE_APPLICATION_CREDENTIALS}`);
    ttsClient = new TextToSpeechClient({
      keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS
    });
  }
  else {
    throw new Error("No Google credentials found. In development, set GOOGLE_APPLICATION_CREDENTIALS environment variable.")
  }

  console.log("Google TTS client initialized successfully");
} catch (error) {
  console.error("Failed to initialize Google TTS client:", error);
  // We'll handle this error when the function is called
}

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
  startChunkIndex = 0,
  existingAudioBlobUrl = null,
  timeoutMs = 50000, // Default timeout of 50 seconds to allow for saving progress
}: {
  audiobookId: string;
  pdfPath: string;
  startChunkIndex?: number;
  existingAudioBlobUrl?: string | null;
  timeoutMs?: number;
}) {
  // Track if we're in a timed-out state
  let isTimedOut = false;
  let timeoutId: NodeJS.Timeout | null = null;
  
  try {
    // Set timeout to stop processing before Vercel's 60s limit
    if (isProduction) {
      timeoutId = setTimeout(() => {
        isTimedOut = true;
        console.log(`Approaching timeout limit of ${timeoutMs}ms, preparing to save progress`);
      }, timeoutMs);
    }
    
    // Only update status to processing if this is the first run (startChunkIndex === 0)
    if (startChunkIndex === 0) {
      await db.update(audiobooks)
        .set({ processingStatus: 'processing', progress: 5 })
        .where(eq(audiobooks.id, audiobookId));
    } else {
      console.log(`Resuming audiobook processing from chunk ${startChunkIndex}`);
    }

    // 1. Extract PDF text (only on first run)
    let dataBuffer: Buffer;
    let text: string;
    let chunks: string[];
    
    if (startChunkIndex === 0) {
      const isRemote = pdfPath.startsWith('http://') || pdfPath.startsWith('https://');
      const isProd = process.env.NODE_ENV === 'production';

      // Update progress to 10% - PDF fetching
      await db.update(audiobooks).set({ progress: 10 }).where(eq(audiobooks.id, audiobookId));

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

      // Update progress to 15% - PDF retrieved
      await db.update(audiobooks).set({ progress: 15 }).where(eq(audiobooks.id, audiobookId));

      // Update progress to 20% - Starting text extraction
      await db.update(audiobooks).set({ progress: 20 }).where(eq(audiobooks.id, audiobookId));
      text = await extractTextWithPdfParse(dataBuffer);

      // Update progress to 25% - Text extraction complete
      await db.update(audiobooks).set({ progress: 25 }).where(eq(audiobooks.id, audiobookId));

      // 2. Split text into optimized chunks for production
      // Use larger chunks but stay under request limit
      const maxChunkSize = isProduction ? 3000 : 5000;
      console.log(`Splitting text into chunks with max size of ${maxChunkSize} bytes`);

      // Update progress to 30% - Starting text chunking
      await db.update(audiobooks).set({ progress: 30 }).where(eq(audiobooks.id, audiobookId));

      chunks = splitTextIntoChunks(text, maxChunkSize);
      
      // Store chunks count in database for resumption
      await db.update(audiobooks)
        .set({ 
          metadata: JSON.stringify({ 
            totalChunks: chunks.length 
          })
        })
        .where(eq(audiobooks.id, audiobookId));
        
      console.log(`Created ${chunks.length} chunks for processing`);

      // Update progress to 35% - Text chunking complete
      await db.update(audiobooks).set({ progress: 35 }).where(eq(audiobooks.id, audiobookId));
    } else {
      // Get existing chunks information for resuming
      const audiobook = await db.query.audiobooks.findFirst({
        where: eq(audiobooks.id, audiobookId)
      });
      
      if (!audiobook || !audiobook.metadata) {
        throw new Error("Cannot resume processing - missing metadata");
      }
      
      const metadata = JSON.parse(audiobook.metadata);
      if (!metadata.totalChunks) {
        throw new Error("Cannot resume processing - missing chunks information");
      }
      
      // Refetch PDF content for chunking
      const isRemote = pdfPath.startsWith('http://') || pdfPath.startsWith('https://');
      const isProd = process.env.NODE_ENV === 'production';

      if (isRemote && isProd) {
        const response = await fetch(pdfPath);
        if (!response.ok) throw new Error(`Failed to fetch remote PDF: ${response.statusText}`);
        const arrayBuffer = await response.arrayBuffer();
        dataBuffer = Buffer.from(arrayBuffer);
      } else {
        const cleanPath = pdfPath.startsWith('/') ? pdfPath.slice(1) : pdfPath;
        const absolutePath = path.join(process.cwd(), 'public', cleanPath);
        dataBuffer = await fs.readFile(absolutePath);
      }
      
      text = await extractTextWithPdfParse(dataBuffer);
      const maxChunkSize = isProduction ? 3000 : 5000; 
      chunks = splitTextIntoChunks(text, maxChunkSize);
      
      console.log(`Resumed processing with ${chunks.length} total chunks, starting from chunk ${startChunkIndex}`);
    }

    // 3. Generate audio for each chunk with optimized concurrency
    const docSizeInMB = dataBuffer.length / (1024 * 1024);
    // Adjust concurrency based on document size to prevent API rate limits
    const baseConcurrency = isProduction ? 3 : 5; // Reduced from 4 to 3 for production to avoid rate limits
    const concurrency = docSizeInMB > 5 ? Math.max(2, Math.floor(baseConcurrency / 2)) : baseConcurrency;

    console.log(`Using concurrency of ${concurrency} for TTS API calls (document size: ${docSizeInMB.toFixed(2)}MB)`);

    // Update progress appropriately
    let currentProgress = startChunkIndex === 0 ? 40 : 
      40 + Math.floor((startChunkIndex / chunks.length) * 50); // 40-90% range for audio generation
    
    await db.update(audiobooks).set({ progress: currentProgress }).where(eq(audiobooks.id, audiobookId));

    let completed = startChunkIndex;
    let consecutiveErrors = 0;
    const MAX_CONSECUTIVE_ERRORS = 3;

    // Allocate progress range from 40% to 90% for audio generation based on chunks
    const AUDIO_GEN_START_PROGRESS = 40;
    const AUDIO_GEN_END_PROGRESS = 90;
    const AUDIO_GEN_RANGE = AUDIO_GEN_END_PROGRESS - AUDIO_GEN_START_PROGRESS;

    // Create a buffer array for new chunks to process
    const audioBuffers: Buffer[] = [];
    let existingAudioBuffer: Buffer | null = null;
    
    // Fetch existing audio if resuming
    if (existingAudioBlobUrl) {
      try {
        console.log(`Fetching existing audio from ${existingAudioBlobUrl}`);
        const response = await fetch(existingAudioBlobUrl);
        if (!response.ok) throw new Error(`Failed to fetch existing audio: ${response.statusText}`);
        const arrayBuffer = await response.arrayBuffer();
        existingAudioBuffer = Buffer.from(arrayBuffer);
        console.log(`Successfully retrieved existing audio (${existingAudioBuffer.length} bytes)`);
      } catch (error) {
        console.error("Failed to retrieve existing audio:", error);
        // Continue without existing audio - will start from scratch
        existingAudioBuffer = null;
      }
    }

    async function synthesizeChunk(i: number) {
      // Check if we're timed out before processing each chunk
      if (isTimedOut) {
        console.log(`Timeout reached, skipping chunk ${i}`);
        return;
      }
      
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
        audioBuffers.push(buffer);
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
            audioBuffers.push(buffer);
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
      // Calculate more precise progress between 40% and 90% based on chunk completion
      const progress = AUDIO_GEN_START_PROGRESS + Math.floor((completed / chunks.length) * AUDIO_GEN_RANGE);
      await db.update(audiobooks).set({ progress }).where(eq(audiobooks.id, audiobookId));
      console.log(`Updated progress to ${progress}% after completing chunk ${i}/${chunks.length}`);
      
      // Check if we've reached timeout after each chunk
      if (isTimedOut) {
        console.log(`Timeout reached after processing chunk ${i}`);
        return;
      }
    }

    // Process chunks in batches with adaptive delay to prevent rate limiting
    let savedProgress = false;
    
    for (let batchStart = startChunkIndex; batchStart < chunks.length; batchStart += concurrency) {
      // Check if we've timed out before processing each batch
      if (isTimedOut) {
        console.log(`Timeout reached, saving progress at chunk ${batchStart}`);
        
        // Save progress to blob storage
        if (isProduction && audioBuffers.length > 0) {
          // Save our progress to blob storage
          await saveProgressAndScheduleResumption(
            audiobookId, 
            pdfPath, 
            batchStart, 
            chunks.length, 
            audioBuffers, 
            existingAudioBuffer
          );
          savedProgress = true;
        }
        break;
      }
      
      const batch = [];
      for (let j = 0; j < concurrency && batchStart + j < chunks.length; j++) {
        batch.push(synthesizeChunk(batchStart + j));
      }

      try {
        await Promise.all(batch);

        // Add small delay between batches in production to avoid rate limiting
        if (isProduction && batchStart + concurrency < chunks.length && !isTimedOut) {
          const delay = 500; // 500ms delay between batches
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      } catch (error) {
        console.error(`Error processing batch starting at chunk ${batchStart}:`, error);
        
        if (isProduction && audioBuffers.length > 0) {
          // Save our progress to blob storage
          await saveProgressAndScheduleResumption(
            audiobookId, 
            pdfPath, 
            batchStart, 
            chunks.length, 
            audioBuffers, 
            existingAudioBuffer
          );
          savedProgress = true;
        }
        
        throw error;
      }
    }
    
    // Clear timeout if we've made it this far
    if (timeoutId) clearTimeout(timeoutId);
    
    // If we timed out and saved progress, return early
    if (isTimedOut && savedProgress) {
      await db.update(audiobooks)
        .set({ 
          processingStatus: 'processing',
          progress: Math.min(85, 40 + Math.floor((completed / chunks.length) * 50)),
          metadata: JSON.stringify({
            totalChunks: chunks.length,
            processedChunks: completed,
            resumeScheduled: true
          })
        })
        .where(eq(audiobooks.id, audiobookId));
      
      return; // Exit early, the resumption is scheduled
    }

    // 4. Concatenate audio and save to appropriate storage
    // Update progress to 90% - Starting audio file preparation
    await db.update(audiobooks).set({ progress: 90 }).where(eq(audiobooks.id, audiobookId));

    // Combine existing audio from previous runs with newly generated audio
    let allAudioBuffers: Buffer[] = [];
    
    if (existingAudioBuffer) {
      console.log(`Adding existing audio buffer (${existingAudioBuffer.length} bytes) to newly generated audio`);
      allAudioBuffers.push(existingAudioBuffer);
    }
    
    // Filter out any undefined or null buffer entries before concatenation
    const validNewBuffers = audioBuffers.filter(buffer => buffer !== undefined && buffer !== null);
    if (validNewBuffers.length === 0 && !existingAudioBuffer) {
      throw new Error("No valid audio buffers were generated");
    }
    
    allAudioBuffers = allAudioBuffers.concat(validNewBuffers);
    const concatenatedAudio = Buffer.concat(allAudioBuffers);
    const audioFileName = `${audiobookId}.mp3`;
    let audioPath = `/audio/${audioFileName}`;
    let audioDuration = 0;

    // Update progress to 92% - Audio concatenation complete
    await db.update(audiobooks).set({ progress: 92 }).where(eq(audiobooks.id, audiobookId));

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

        // Update progress to 95% - Preparing to upload file
        await db.update(audiobooks).set({ progress: 95 }).where(eq(audiobooks.id, audiobookId));

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

        // Update progress to 98% - File uploaded successfully
        await db.update(audiobooks).set({ progress: 98 }).where(eq(audiobooks.id, audiobookId));
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

      // Update progress to 95% - File saved successfully
      await db.update(audiobooks).set({ progress: 95 }).where(eq(audiobooks.id, audiobookId));

      // Calculate duration from the saved file
      try {
        audioDuration = await new Promise<number>((resolve, reject) => {
          mp3Duration(localAudioPath, (err, duration) => {
            if (err) reject(err);
            else resolve(duration);
          });
        });
        console.log(`Calculated MP3 duration: ${audioDuration} seconds`);

        // Update progress to 98% - Duration calculated successfully
        await db.update(audiobooks).set({ progress: 98 }).where(eq(audiobooks.id, audiobookId));
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

    // Get audiobook details for email notification
    const audiobook = await db.query.audiobooks.findFirst({
      where: eq(audiobooks.id, audiobookId),
      with: {
        user: true
      }
    });

    // Send email notification
    if (audiobook && audiobook.user && audiobook.user.email) {
      try {
        const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
        await sendAudiobookCompletionEmail({
          to: audiobook.user.email,
          audiobookTitle: audiobook.title,
          audiobookId: audiobook.id,
          appUrl
        });
        console.log(`Sent completion email to ${audiobook.user.email} for audiobook: ${audiobook.id}`);
      } catch (emailError) {
        console.error('Error sending audiobook completion email:', emailError);
        // Continue even if email fails
      }
    }

    // Use server actions for revalidation outside of render context
    try {
      const { default: revalidatePaths } = await import('@/actions/revalidate');
      await revalidatePaths(['/audiobooks', '/dashboard', `/audiobooks/${audiobookId}`]);
      console.log(`Revalidated paths for completed audiobook: ${audiobookId}`);
    } catch (revalidateError) {
      console.error('Error revalidating paths:', revalidateError);
      // Continue even if revalidation fails
    }
  } catch (error: any) {
    // Only mark as failed if we didn't save progress for resumption
    if (!isTimedOut) {
      await db.update(audiobooks).set({ processingStatus: 'failed', errorDetails: error.message }).where(eq(audiobooks.id, audiobookId));
    }
    throw error;
  } finally {
    // Clear the timeout if it's still active
    if (timeoutId) clearTimeout(timeoutId);
  }
}

/**
 * Saves the audio processing progress to Vercel Blob Storage and schedules a resumption 
 * of the processing via a new API call.
 */
async function saveProgressAndScheduleResumption(
  audiobookId: string,
  pdfPath: string,
  nextChunkIndex: number,
  totalChunks: number,
  audioBuffers: Buffer[],
  existingAudioBuffer: Buffer | null
): Promise<void> {
  try {
    console.log(`Saving progress for audiobook ${audiobookId}, next chunk: ${nextChunkIndex}/${totalChunks}`);
    
    // Dynamic import of Vercel Blob
    const { put } = await import('@vercel/blob');
    
    // Check if we have the necessary token
    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      throw new Error("Missing BLOB_READ_WRITE_TOKEN in production environment");
    }
    
    // Combine existing audio with new audio buffers
    let allAudioBuffers: Buffer[] = [];
    if (existingAudioBuffer) {
      allAudioBuffers.push(existingAudioBuffer);
    }
    
    // Add all valid new audio buffers
    const validBuffers = audioBuffers.filter(b => b !== undefined && b !== null);
    allAudioBuffers = allAudioBuffers.concat(validBuffers);
    
    if (allAudioBuffers.length === 0) {
      throw new Error("No valid audio buffers to save");
    }
    
    // Concatenate all audio buffers
    const concatenatedAudio = Buffer.concat(allAudioBuffers);
    
    // Create a unique temporary filename to avoid collisions
    const tempFileName = `${audiobookId}_temp_${Date.now()}.mp3`;
    
    // Create a File object from the buffer
    const file = new File([concatenatedAudio], tempFileName, { type: 'audio/mpeg' });
    
    // Upload to Vercel Blob Storage
    const blob = await put(tempFileName, file, {
      access: 'public',
    });
    
    console.log(`Temporary audio saved to Blob Storage: ${blob.url}`);
    
    // Update the audiobook record with temporary blob URL and progress information
    await db.update(audiobooks)
      .set({ 
        metadata: JSON.stringify({
          totalChunks,
          nextChunkIndex,
          tempAudioUrl: blob.url,
          resumptionTimestamp: Date.now()
        })
      })
      .where(eq(audiobooks.id, audiobookId));
    
    // Schedule the resumption by making a new API call
    // This needs to be a non-blocking fire-and-forget operation
    setTimeout(async () => {
      try {
        const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
        const resumeUrl = `${appUrl}/api/process-audiobook`;
        
        console.log(`Scheduling resumption of audiobook processing: ${resumeUrl}`);
        
        // Make the API call to continue processing
        const response = await fetch(resumeUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            audiobookId,
            resumeFrom: nextChunkIndex,
            existingAudioUrl: blob.url
          }),
        });
        
        if (!response.ok) {
          console.error(`Failed to schedule resumption: ${response.statusText}`);
        } else {
          console.log(`Successfully scheduled resumption of audiobook processing`);
        }
      } catch (error) {
        console.error("Error scheduling processing resumption:", error);
      }
    }, 1000); // 1 second delay before scheduling
    
  } catch (error) {
    console.error("Error saving progress:", error);
    throw error;
  }
}
