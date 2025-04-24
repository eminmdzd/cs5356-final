import { audiobookQueue, AudiobookJobData, setJobProgress, addAudiobookJob } from '@/lib/queue';
import { db } from '@/database/db';
import { audiobooks, pdfs } from '@/database/schema';
import { and, eq } from 'drizzle-orm';
import { TextToSpeechClient } from '@google-cloud/text-to-speech';
import * as fs from 'fs/promises';
import * as path from 'path';
import { PDFExtract } from 'pdf.js-extract';
// Import Vercel Blob conditionally
let vercelBlob: any = { get: null, put: null, del: null };
try {
  if (process.env.NODE_ENV === 'production') {
    import('@vercel/blob').then(module => {
      vercelBlob = module;
    });
  }
} catch (error) {
  console.warn('Worker: Vercel Blob not available, using local filesystem for storage');
}
import * as https from 'https';
import { Job } from 'bull';

// Initialize PDF extractor
const pdfExtract = new PDFExtract();

// Determine if we're in production
const isProduction = process.env.NODE_ENV === 'production';

// Initialize Google Cloud TTS client
let ttsClient: TextToSpeechClient;

try {
  console.log(`Worker: Initializing Google TTS client in ${isProduction ? 'production' : 'development'} mode`);

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

      console.log(`Worker: Using Google credentials directly from environment variables`);
      ttsClient = new TextToSpeechClient(credentials);
    }
    // Fall back to credentials file if available
    else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      console.log(`Worker: Falling back to credentials file: ${process.env.GOOGLE_APPLICATION_CREDENTIALS}`);
      ttsClient = new TextToSpeechClient({
        keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS
      });
    }
    else {
      throw new Error("Worker: No Google credentials found in production environment");
    }
  }
  // Development mode - use credentials file
  else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    console.log(`Worker: Using credentials file from GOOGLE_APPLICATION_CREDENTIALS: ${process.env.GOOGLE_APPLICATION_CREDENTIALS}`);
    ttsClient = new TextToSpeechClient({
      keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS
    });
  }
  else {
    throw new Error("Worker: No Google credentials found. In development, set GOOGLE_APPLICATION_CREDENTIALS environment variable.")
  }

  console.log("Worker: Google TTS client initialized successfully");
} catch (error) {
  console.error("Worker: Failed to initialize Google TTS client:", error);
  throw error;
}

// Helper function to check if a job has been cancelled
async function checkIfCancelled(audiobookId: string): Promise<boolean> {
  const audiobook = await db.query.audiobooks.findFirst({
    where: and(
      eq(audiobooks.id, audiobookId)
    )
  });

  // If the audiobook is marked as failed with a "cancelled" message, it was cancelled
  return audiobook?.processingStatus === 'failed' &&
         audiobook?.errorDetails === 'Processing was cancelled by the user';
}

// Helper function to fetch content from a URL
async function fetchFromUrl(url: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    https.get(url, (response) => {
      // Check for redirect
      if (response.statusCode === 302 || response.statusCode === 301) {
        const redirectUrl = response.headers.location;
        if (redirectUrl) {
          console.log(`Worker: Following redirect to ${redirectUrl}`);
          fetchFromUrl(redirectUrl).then(resolve).catch(reject);
          return;
        }
      }

      if (response.statusCode !== 200) {
        reject(new Error(`Failed to fetch URL: ${response.statusCode}`));
        return;
      }

      const chunks: Buffer[] = [];
      response.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
      response.on('end', () => resolve(Buffer.concat(chunks)));
      response.on('error', (err) => reject(err));
    }).on('error', (err) => reject(err));
  });
}

// Function to extract text from PDF using pdf.js-extract (faster parallel extraction)
async function extractTextWithPdfJsExtract(dataBuffer: Buffer): Promise<string> {
  return new Promise((resolve, reject) => {
    const pdfData = new Uint8Array(dataBuffer);

    pdfExtract.extractBuffer(pdfData, {})
      .then(data => {
        // Process pages in parallel with Promise.all
        const textPromises = data.pages.map(page => {
          return new Promise<string>((resolveText) => {
            let pageText = '';
            // Combine all content items into text
            if (page.content && page.content.length > 0) {
              // Group items by y-position for proper line handling
              const lineMap = new Map<number, Array<{x: number, str: string}>>();

              page.content.forEach(item => {
                // Round to nearest 0.5 to group lines together
                const yPos = Math.round(item.y * 2) / 2;
                if (!lineMap.has(yPos)) {
                  lineMap.set(yPos, []);
                }
                lineMap.get(yPos)!.push({x: item.x, str: item.str});
              });

              // Sort lines by y-position (top to bottom)
              const sortedLines = Array.from(lineMap.entries())
                .sort((a, b) => a[0] - b[0]);

              // For each line, sort items by x-position (left to right)
              sortedLines.forEach(([_, items]) => {
                items.sort((a, b) => a.x - b.x);
                pageText += items.map(item => item.str).join(' ') + '\n';
              });
            }
            resolveText(pageText);
          });
        });

        // Combine all page texts
        Promise.all(textPromises)
          .then(texts => {
            const fullText = texts.join('\n\n');
            resolve(fullText);
          })
          .catch(err => reject(err));
      })
      .catch(err => {
        console.error('Error in PDF.js extraction:', err);
        reject(err);
      });
  });
}

// Function to extract text from a PDF file using multiple methods in parallel for speed
async function extractTextFromPDF(filePath: string, originalPath?: string | null): Promise<string> {
  try {
    let dataBuffer: Buffer;
    console.log(`Worker: Starting PDF extraction. File path: ${filePath}, Original path: ${originalPath || 'not provided'}`);

    // Check if the file path is valid
    if (!filePath) {
      throw new Error("No file path provided for PDF extraction");
    }

    // If we're in production and the path looks like a URL, use Blob Storage
    if (isProduction && (filePath.startsWith('http://') || filePath.startsWith('https://'))) {
      console.log(`Worker: Fetching PDF from Blob Storage URL: ${filePath}`);
      try {
        // If vercel/blob is available, use it
        if (process.env.BLOB_READ_WRITE_TOKEN && vercelBlob.get) {
          try {
            const blob = await vercelBlob.get(filePath);
            if (blob) {
              console.log(`Worker: Successfully fetched PDF from Blob Storage, URL: ${filePath}`);
              // Convert arrayBuffer to Buffer
              dataBuffer = Buffer.from(await blob.arrayBuffer());
            } else {
              throw new Error(`Blob not found at ${filePath}`);
            }
          } catch (error) {
            console.error(`Worker: Error accessing Blob storage, falling back to HTTPS: ${error.message}`);
            // Fall back to HTTPS request
            dataBuffer = await fetchFromUrl(filePath);
            console.log(`Worker: Successfully fetched PDF via HTTPS fallback, URL: ${filePath}, size: ${dataBuffer.length} bytes`);
          }
        } else {
          // Fallback to HTTPS request
          dataBuffer = await fetchFromUrl(filePath);
          console.log(`Worker: Successfully fetched PDF via HTTPS, URL: ${filePath}, size: ${dataBuffer.length} bytes`);
        }
      } catch (blobError) {
        console.error(`Worker: Error fetching PDF from URL: ${filePath}`, blobError);
        throw new Error(`Failed to fetch PDF from URL: ${blobError.message}`);
      }
    } else {
      // Local file system logic for development
      console.log(`Worker: Using local file system for PDF extraction`);

      // List the directories to help with debugging
      try {
        const publicDir = path.join(process.cwd(), "public");
        const uploadsDir = path.join(publicDir, "uploads");

        console.log(`Worker: Checking directories - Public: ${publicDir}, Uploads: ${uploadsDir}`);
        await fs.access(publicDir);
        console.log(`Worker: Public directory exists`);

        try {
          await fs.access(uploadsDir);
          console.log(`Worker: Uploads directory exists`);
        } catch (error) {
          console.log(`Worker: Uploads directory doesn't exist or can't be accessed`);
        }
      } catch (error) {
        console.log(`Worker: Error checking directories:`, error);
      }

      // First try the original path if provided (for files uploaded from client's device)
      if (originalPath) {
        try {
          console.log(`Worker: Attempting to read from original path: ${originalPath}`);
          dataBuffer = await fs.readFile(originalPath);
          console.log("Worker: Successfully read PDF from original path:", originalPath);
        } catch (originalPathError) {
          console.log("Worker: Failed to read from original path, falling back to app path:", originalPathError);

          // Fall back to the app's public directory
          const cleanPath = filePath.startsWith('/') ? filePath.slice(1) : filePath;
          const absolutePath = path.join(process.cwd(), "public", cleanPath);

          console.log("Worker: Attempting to read PDF at:", absolutePath);

          try {
            await fs.access(absolutePath);
            console.log(`Worker: File found at ${absolutePath}`);
          } catch (error: any) {
            console.error("Worker: File does not exist at path:", absolutePath);
            throw new Error(`PDF file not found at ${absolutePath}`);
          }

          dataBuffer = await fs.readFile(absolutePath);
          console.log(`Worker: Successfully read file from ${absolutePath}, size: ${dataBuffer.length} bytes`);
        }
      } else {
        // No original path, use the app's public directory
        const cleanPath = filePath.startsWith('/') ? filePath.slice(1) : filePath;
        const absolutePath = path.join(process.cwd(), "public", cleanPath);

        console.log("Worker: Attempting to read PDF at:", absolutePath);

        try {
          await fs.access(absolutePath);
          console.log(`Worker: File found at ${absolutePath}`);
        } catch (error: any) {
          console.error("Worker: File does not exist at path:", absolutePath);
          throw new Error(`PDF file not found at ${absolutePath}`);
        }

        dataBuffer = await fs.readFile(absolutePath);
        console.log(`Worker: Successfully read file from ${absolutePath}, size: ${dataBuffer.length} bytes`);
      }
    }

    console.log("Worker: Successfully read PDF file, size:", dataBuffer.length);

    try {
      console.log("Worker: Starting parallel PDF text extraction");

      const text = await extractTextWithPdfJsExtract(dataBuffer)
      return text;

    } catch (extractError: any) {
      console.error("Worker: Error in parallel PDF extraction, falling back to pdf-parse:", extractError);

      // Fallback to original method if parallel extraction fails
      throw new Error(`Failed to extract text from PDF: ${extractError.message}`);
    }
  } catch (error: any) {
    console.error("Worker: Error extracting text from PDF:", error);
    throw new Error(`Failed to extract text from PDF: ${error.message}`);
  }
}

// Function to split text into chunks for TTS processing
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

// Function to generate audio using Google TTS
async function generateAudioWithGoogleTTS(
  text: string,
  outputFileName: string,
  audiobookId: string,
  job: Job
): Promise<string> {
  try {
    // Split text into chunks of approximately 5000 bytes
    const chunks = splitTextIntoChunks(text, 5000);
    console.log(`Worker: Split text into ${chunks.length} chunks for audiobook ${audiobookId}`);

    // Update progress to 20%
    await job.progress(20);
    await setJobProgress(audiobookId, 20);
    console.log(`Worker: Updated progress for ${audiobookId} to 20%`);

    // Generate audio for each chunk in parallel
    // Check for cancellation before dispatching requests
    if (await checkIfCancelled(audiobookId)) {
      console.log(`Worker: Audiobook ${audiobookId} was cancelled before starting parallel audio generation`);
      throw new Error('Processing was cancelled by the user');
    }

    // Helper to process chunks with limited concurrency
    async function processChunksWithLimit<T>(inputs: T[], limit: number, processFn: (input: T, i: number) => Promise<any>) {
      const results: any[] = new Array(inputs.length);
      let inFlight = 0;
      let current = 0;
      let completed = 0;
      return new Promise<any[]>((resolve, reject) => {
        const launchNext = () => {
          while (inFlight < limit && current < inputs.length) {
            const idx = current;
            inFlight++;
            current++;
            processFn(inputs[idx], idx)
              .then((result) => {
                results[idx] = result;
                completed++;
                // Progress: scale from 20% to 85%
                const progress = Math.floor(20 + (completed / inputs.length) * 65);
                job.progress(progress).catch(() => {});
                setJobProgress(audiobookId, progress).catch(() => {});
                launchNext();
              })
              .catch((err) => reject(err))
              .finally(() => {
                inFlight--;
              });
          }
          if (completed === inputs.length) {
            resolve(results);
          }
        };
        launchNext();
      });
    }

    // Define the TTS chunk processing function
    async function processChunk(chunk: string, i: number) {
      const synthesisInput = { text: chunk };
      const voice = {
        languageCode: "en-US",
        name: "en-US-Neural2-D",
      };
      const audioConfig = {
        audioEncoding: "MP3" as const,
        effectsProfileId: ["small-bluetooth-speaker-class-device"],
        pitch: 0.0,
        speakingRate: 1.0,
      };
      try {
        const [response] = await ttsClient.synthesizeSpeech({
          input: synthesisInput,
          voice,
          audioConfig,
        });
        if (!response.audioContent) {
          throw new Error(`No audio content received for chunk ${i + 1}`);
        }
        const audioBuffer = typeof response.audioContent === 'string'
          ? Buffer.from(response.audioContent, 'base64')
          : Buffer.from(response.audioContent);
        console.log(`Worker: Successfully generated audio for chunk ${i + 1}/${chunks.length} for audiobook ${audiobookId}`);
        return { index: i, buffer: audioBuffer };
      } catch (ttsError) {
        console.error(`Worker: Error generating audio for chunk ${i + 1}:`, ttsError);
        throw ttsError;
      }
    }

    // Await all chunk requests with concurrency limit 5
    let audioChunks: Buffer[] = [];
    try {
      const chunkResults = await processChunksWithLimit(chunks, 5, processChunk);
      // Sort results by original chunk order (should already be in order)
      chunkResults.sort((a, b) => a.index - b.index);
      audioChunks = chunkResults.map(res => res.buffer);
    } catch (error) {
      console.error(`Worker: Error in limited-concurrency TTS generation:`, error);
      throw error;
    }

    // Check for cancellation after all requests
    if (await checkIfCancelled(audiobookId)) {
      console.log(`Worker: Audiobook ${audiobookId} was cancelled after parallel audio generation`);
      throw new Error('Processing was cancelled by the user');
    }

    // Update progress to 85% after TTS (since 90% is after writing the file)
    await job.progress(85);
    await setJobProgress(audiobookId, 85);
    console.log(`Worker: Updated progress for ${audiobookId} to 85% after TTS generation`);



    // Concatenate all audio chunks
    const concatenatedAudio = Buffer.concat(audioChunks);
    console.log(`Worker: Combined ${audioChunks.length} audio chunks into a single file for audiobook ${audiobookId}`);

    // Save the final audio file
    let audioPath: string;
    let mp3Buffer = concatenatedAudio;

    if (isProduction && process.env.BLOB_READ_WRITE_TOKEN && vercelBlob.put) {
      try {
        // Use Vercel Blob Storage in production
        const mp3Filename = `${outputFileName}.mp3`;
        const blob = await vercelBlob.put(mp3Filename, mp3Buffer, {
          access: 'public',
          contentType: 'audio/mpeg',
        });

        audioPath = blob.url;
        console.log(`Worker: Uploaded audio file to Blob Storage: ${audioPath} for audiobook ${audiobookId}`);
      } catch (error) {
        console.error(`Worker: Error uploading to Blob Storage, falling back to local: ${error.message}`);
        // Fall back to local filesystem
        const outputDir = path.join(process.cwd(), "public/audio");
        await fs.mkdir(outputDir, { recursive: true });

        audioPath = `/audio/${outputFileName}.mp3`;
        const localAudioPath = path.join(outputDir, `${outputFileName}.mp3`);
        await fs.writeFile(localAudioPath, concatenatedAudio);
        console.log(`Worker: Saved audio file to local filesystem: ${localAudioPath} for audiobook ${audiobookId}`);
      }
    } else {
      // Use local filesystem in development
      const outputDir = path.join(process.cwd(), "public/audio");
      await fs.mkdir(outputDir, { recursive: true });

      audioPath = `/audio/${outputFileName}.mp3`;
      const localAudioPath = path.join(outputDir, `${outputFileName}.mp3`);
      await fs.writeFile(localAudioPath, concatenatedAudio);
      console.log(`Worker: Saved audio file to ${localAudioPath} for audiobook ${audiobookId}`);
    }

    // Update progress to 90%
    await job.progress(90);
    await setJobProgress(audiobookId, 90);
    console.log(`Worker: Updated progress for ${audiobookId} to 90%`);

    // Return the path to the audio file
    return audioPath;
  } catch (error: any) {
    console.error(`Worker: Error generating audio with Google TTS for audiobook ${audiobookId}:`, error);
    throw new Error(`Failed to generate audio: ${error.message}`);
  }
}

// Function to get audio duration
async function getAudioDuration(audioPath: string, audiobookId: string, text: string): Promise<number> {
  console.log(`Worker: Getting audio duration for ${audioPath}`);

  // Get approximate duration - estimate 150 words per minute
  const wordCount = text.split(/\s+/).length;
  const estimatedDuration = Math.ceil(wordCount / 150 * 60); // Duration in seconds
  console.log(`Worker: Estimated duration: ${estimatedDuration} seconds (${wordCount} words) for audiobook ${audiobookId}`);

  try {
    let actualDuration = estimatedDuration; // Fallback to estimated duration

    if (isProduction && (audioPath.startsWith('http://') || audioPath.startsWith('https://'))) {
      // For Blob Storage URLs, we can only estimate duration in production
      console.log(`Worker: Using estimated duration for Blob Storage: ${estimatedDuration} seconds`);
      return estimatedDuration;
    } else {
      // In development, try to get more accurate duration from MP3 file
      const audioFilePath = audioPath.startsWith('/')
        ? path.join(process.cwd(), "public", audioPath.slice(1))
        : path.join(process.cwd(), "public", audioPath);

      // Get the total file size
      const stats = await fs.stat(audioFilePath);
      const fileSize = stats.size; // in bytes

      // Read first 100 bytes to analyze MP3 header
      const fd = await fs.open(audioFilePath, 'r');
      const buffer = Buffer.alloc(100);
      await fd.read(buffer, 0, 100, 0);
      await fd.close();

      // Check for MP3 header (starts with ID3 or with 0xFF 0xFB)
      let bitRate = 0;
      if (buffer.slice(0, 3).toString() === 'ID3') {
        // ID3v2 tag found, now try to find the audio frame
        // Skip the ID3 header which is 10 bytes + extended header size
        const headerSize = 10;
        const extendedSize = buffer[6] & 0x80 ?
          ((buffer[10] & 0x7f) << 21) | ((buffer[11] & 0x7f) << 14) | ((buffer[12] & 0x7f) << 7) | (buffer[13] & 0x7f) : 0;

        // Assuming 128kbps for most Google TTS MP3s
        bitRate = 128 * 1000;
      } else if ((buffer[0] === 0xFF) && ((buffer[1] & 0xE0) === 0xE0)) {
        // Found MP3 frame header
        const bitrateIndex = (buffer[2] & 0xF0) >> 4;
        // Standard bitrates for MPEG1 Layer 3
        const bitRates = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320];
        bitRate = bitRates[bitrateIndex] * 1000;
      } else {
        // If we can't identify the header, use a reasonable default
        bitRate = 128 * 1000; // Assume 128kbps for Google TTS
      }

      if (bitRate > 0) {
        // Calculate duration: fileSize (bytes) / (bitRate (bits/sec) / 8 bits per byte)
        // We need to account for file headers, so this is approximate
        const audioSize = fileSize * 0.95; // Reduce size slightly to account for headers
        const durationInSeconds = audioSize / (bitRate / 8);
        actualDuration = Math.ceil(durationInSeconds);
        console.log(`Worker: Calculated audio duration: ${actualDuration} seconds (bitrate: ${bitRate/1000}kbps, size: ${fileSize} bytes) for audiobook ${audiobookId}`);
      } else {
        console.log(`Worker: Could not determine bitrate, using estimated duration: ${estimatedDuration} seconds for audiobook ${audiobookId}`);
      }

      return actualDuration;
    }
  } catch (error) {
    console.error(`Worker: Error calculating audio duration, using estimate:`, error);
    return estimatedDuration;
  }
}

// Initialize the worker to process jobs from the queue
console.log('Worker: Setting up job processor');

audiobookQueue.process(async (job: any) => {
  try {
    console.log(`Worker: Starting job ${job.id} for audiobook processing`);
    const { pdfId, userId, audiobookId } = job.data as AudiobookJobData;

    console.log(`Worker: Processing audiobook ${audiobookId} for PDF ${pdfId}`);

    // Check if the job was cancelled before starting
    if (await checkIfCancelled(audiobookId)) {
      console.log(`Worker: Audiobook ${audiobookId} was cancelled before processing`);
      return { status: 'cancelled' };
    }

    // This was previously setting progress to 10%, but now we're setting it to 5% in the 'active' event handler
    // No need to update progress here as it's already been set to 5% when the job became active
    console.log(`Worker: Job processor started for audiobook ${audiobookId}`);

    // Notify that we're actively working on this job
    console.log(`Worker: PROCESSING AUDIOBOOK ${audiobookId} ACTIVELY - JOB ${job.id}`);

    // Get the PDF info from the database
    console.log(`Worker: Fetching PDF info for ${pdfId}`);
    const pdf = await db.query.pdfs.findFirst({
      where: and(
        eq(pdfs.id, pdfId),
        eq(pdfs.userId, userId)
      )
    });

    if (!pdf) {
      console.error(`Worker: PDF ${pdfId} not found in database`);
      throw new Error(`PDF ${pdfId} not found`);
    }

    console.log(`Worker: Found PDF: ${pdf.fileName}, path: ${pdf.filePath}`);

    // Check if the job was cancelled
    if (await checkIfCancelled(audiobookId)) {
      console.log(`Worker: Audiobook ${audiobookId} was cancelled during PDF lookup`);
      return { status: 'cancelled' };
    }

    // Update progress to 15% - Starting text extraction
    await job.progress(15);
    await setJobProgress(audiobookId, 15);
    console.log(`Worker: Progress set to 15% - Starting text extraction for audiobook ${audiobookId}`);

    // Extract text from PDF
    const text = await extractTextFromPDF(pdf.filePath, pdf.originalPath);
    console.log(`Worker: Text extracted successfully, length: ${text.length} characters for audiobook ${audiobookId}`);

    // Check if the job was cancelled
    if (await checkIfCancelled(audiobookId)) {
      console.log(`Worker: Audiobook ${audiobookId} was cancelled after text extraction`);
      return { status: 'cancelled' };
    }

    // Generate a unique filename for the audiobook
    const outputFileName = `audiobook-${audiobookId}`;

    // Generate audio using Google TTS
    const audioPath = await generateAudioWithGoogleTTS(text, outputFileName, audiobookId, job);
    console.log(`Worker: Audio generation completed, path: ${audioPath} for audiobook ${audiobookId}`);

    // Check if the job was cancelled
    if (await checkIfCancelled(audiobookId)) {
      console.log(`Worker: Audiobook ${audiobookId} was cancelled after audio generation`);
      return { status: 'cancelled' };
    }

    // Get audio duration
    const actualDuration = await getAudioDuration(audioPath, audiobookId, text);

    // Update the audiobook as completed
    console.log(`Worker: Updating audiobook ${audiobookId} status to completed`);
    await db
      .update(audiobooks)
      .set({
        processingStatus: "completed",
        audioPath: audioPath,
        duration: actualDuration
      })
      .where(
        and(
          eq(audiobooks.id, audiobookId),
          eq(audiobooks.userId, userId)
        )
      );

    // Update progress to 100% - Done
    await job.progress(100);
    await setJobProgress(audiobookId, 100);
    console.log(`Worker: Progress set to 100% - Processing completed for audiobook ${audiobookId}`);

    return { status: 'success', audioPath, duration: actualDuration };
  } catch (error: any) {
    console.error('Worker: Error in audiobook worker:', error);

    try {
      // Update the audiobook status to failed with error details
      const { audiobookId, userId } = job.data as AudiobookJobData;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      console.log(`Worker: Updating audiobook ${audiobookId} status to failed: ${errorMessage}`);
      await db
        .update(audiobooks)
        .set({
          processingStatus: "failed",
          errorDetails: errorMessage
        })
        .where(
          and(
            eq(audiobooks.id, audiobookId),
            eq(audiobooks.userId, userId)
          )
        );
    } catch (dbError) {
      console.error(`Worker: Error updating audiobook status to failed:`, dbError);
    }

    throw error;
  }
});

// Listen for worker events
audiobookQueue.on('completed', (job, result) => {
  console.log(`Worker: Job ${job.id} completed with result:`, result);
});

audiobookQueue.on('failed', (job, error) => {
  console.error(`Worker: Job ${job.id} failed with error:`, error);
});

audiobookQueue.on('active', async (job) => {
  console.log(`Worker: Job ${job.id} has started processing`);

  try {
    // When a job becomes active, update the audiobook status to "processing" and set progress
    const { audiobookId, userId } = job.data as AudiobookJobData;

    // Update the database record to "processing"
    await db
      .update(audiobooks)
      .set({
        processingStatus: "processing",
        errorDetails: null,
      })
      .where(
        eq(audiobooks.id, audiobookId)
      );

    console.log(`Worker: Updated audiobook ${audiobookId} status to processing`);

    // Update progress to 5%
    await job.progress(5);
    await setJobProgress(audiobookId, 5);
    console.log(`Worker: Set initial progress for activated job ${job.id} (audiobook ${audiobookId}) to 5%`);
  } catch (error) {
    console.error(`Worker: Error updating initial progress for job ${job.id}:`, error);
  }
});

audiobookQueue.on('progress', (job, progress) => {
  console.log(`Worker: Job ${job.id} reported progress: ${progress}%`);
});

console.log('Worker: Audiobook worker initialized and ready to process jobs.');

// Scan for any stale processing jobs in database and resume them
async function recoverStaleJobs() {
  try {
    console.log('Worker: Checking for stale processing jobs');

    // Get queue information
    const [activeJobs, waitingJobs, delayedJobs] = await Promise.all([
      audiobookQueue.getActive(),
      audiobookQueue.getWaiting(),
      audiobookQueue.getDelayed()
    ]);

    console.log(`Worker: Found ${activeJobs.length} active, ${waitingJobs.length} waiting, and ${delayedJobs.length} delayed jobs`);

    // Check if there are any jobs in processing state
    const processingAudiobooks = await db.query.audiobooks.findMany({
      where: (fields, { eq }) => eq(fields.processingStatus, "processing")
    });

    if (processingAudiobooks.length > 0) {
      console.log(`Worker: Found ${processingAudiobooks.length} audiobooks in processing state`);

      // Check for any that don't have active jobs and create jobs for them
      const activeJobIds = new Set(activeJobs.map(job => (job.data as AudiobookJobData).audiobookId));
      const waitingJobIds = new Set(waitingJobs.map(job => (job.data as AudiobookJobData).audiobookId));
      const delayedJobIds = new Set(delayedJobs.map(job => (job.data as AudiobookJobData).audiobookId));

      const allJobIds = new Set([...activeJobIds, ...waitingJobIds, ...delayedJobIds]);

      for (const book of processingAudiobooks) {
        if (!allJobIds.has(book.id)) {
          console.log(`Worker: Creating job for audiobook ${book.id} that's in processing state but has no job`);

          try {
            // Get the PDF info
            const pdf = await db.query.pdfs.findFirst({
              where: eq(pdfs.id, book.pdfId)
            });

            if (pdf) {
              // Add job to queue
              await addAudiobookJob({
                pdfId: book.pdfId,
                userId: book.userId,
                audiobookId: book.id
              });
              console.log(`Worker: Successfully created job for audiobook ${book.id}`);
            } else {
              console.error(`Worker: Could not find PDF ${book.pdfId} for audiobook ${book.id}`);
            }
          } catch (error) {
            console.error(`Worker: Error creating job for audiobook ${book.id}:`, error);
          }
        }
      }
    }
  } catch (error) {
    console.error('Worker: Error during stale job recovery:', error);
  }
}

// Run initial recovery
setTimeout(recoverStaleJobs, 3000); // Wait 3 seconds after initialization to check

// Schedule periodic recovery every 5 minutes
setInterval(recoverStaleJobs, 5 * 60 * 1000);