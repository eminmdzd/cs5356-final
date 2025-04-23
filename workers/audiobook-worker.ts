import { audiobookQueue, AudiobookJobData, setJobProgress, addAudiobookJob } from '@/lib/queue';
import { db } from '@/database/db';
import { audiobooks, pdfs } from '@/database/schema';
import { and, eq } from 'drizzle-orm';
import { TextToSpeechClient } from '@google-cloud/text-to-speech';
import * as fs from 'fs/promises';
import * as path from 'path';
import pdfParse from 'pdf-parse';

// Initialize Google Cloud TTS client
let ttsClient: TextToSpeechClient;

try {
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    ttsClient = new TextToSpeechClient({
      keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS
    });
    console.log("Worker: Google TTS client initialized successfully");
  } else {
    throw new Error("Worker: No Google credentials found")
  }
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

// Function to extract text from a PDF file
async function extractTextFromPDF(filePath: string, originalPath?: string | null): Promise<string> {
  try {
    let dataBuffer: Buffer;
    console.log(`Worker: Starting PDF extraction. File path: ${filePath}, Original path: ${originalPath || 'not provided'}`);

    // Check if the file path is valid
    if (!filePath) {
      throw new Error("No file path provided for PDF extraction");
    }

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

    console.log("Worker: Successfully read PDF file, size:", dataBuffer.length);

    try {
      const data = await pdfParse(dataBuffer);
      console.log("Worker: Successfully parsed PDF, text length:", data.text.length);
      return data.text;
    } catch (parseError) {
      console.error("Worker: Error parsing PDF content:", parseError);
      throw parseError;
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
  job: any
): Promise<string> {
  try {
    // Split text into chunks of approximately 5000 bytes
    const chunks = splitTextIntoChunks(text, 5000);
    console.log(`Worker: Split text into ${chunks.length} chunks for audiobook ${audiobookId}`);

    // Update progress to 20%
    await job.progress(20);
    await setJobProgress(audiobookId, 20);
    console.log(`Worker: Updated progress for ${audiobookId} to 20%`);

    // Create the output directory if it doesn't exist
    const outputDir = path.join(process.cwd(), "public/audio");
    await fs.mkdir(outputDir, { recursive: true });

    // Generate audio for each chunk
    const audioChunks: Buffer[] = [];

    for (let i = 0; i < chunks.length; i++) {
      // Check for cancellation
      if (await checkIfCancelled(audiobookId)) {
        console.log(`Worker: Audiobook ${audiobookId} was cancelled during audio generation`);
        throw new Error('Processing was cancelled by the user');
      }

      // Calculate and update progress - scale from 20% to 90% based on chunk processing
      const progress = Math.floor(20 + (i / chunks.length * 70));
      await job.progress(progress);
      await setJobProgress(audiobookId, progress);
      console.log(`Worker: Processing chunk ${i + 1}/${chunks.length}, progress: ${progress}% for audiobook ${audiobookId}`);

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
        console.log(`Worker: Successfully generated audio for chunk ${i + 1}/${chunks.length} for audiobook ${audiobookId}`);
      } catch (ttsError) {
        console.error(`Worker: Error generating audio for chunk ${i + 1}:`, ttsError);
        throw ttsError;
      }
    }

    // Concatenate all audio chunks
    const concatenatedAudio = Buffer.concat(audioChunks);
    console.log(`Worker: Combined ${audioChunks.length} audio chunks into a single file for audiobook ${audiobookId}`);

    // Save the final audio file
    const audioPath = path.join(outputDir, `${outputFileName}.mp3`);
    await fs.writeFile(audioPath, concatenatedAudio);
    console.log(`Worker: Saved audio file to ${audioPath} for audiobook ${audiobookId}`);

    // Update progress to 90%
    await job.progress(90);
    await setJobProgress(audiobookId, 90);
    console.log(`Worker: Updated progress for ${audiobookId} to 90%`);

    // Return the public path to the audio file
    return `/audio/${outputFileName}.mp3`;
  } catch (error: any) {
    console.error(`Worker: Error generating audio with Google TTS for audiobook ${audiobookId}:`, error);
    throw new Error(`Failed to generate audio: ${error.message}`);
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

    // Get approximate duration - estimate 150 words per minute
    const wordCount = text.split(/\s+/).length;
    const estimatedDuration = Math.ceil(wordCount / 150 * 60); // Duration in seconds
    console.log(`Worker: Estimated duration: ${estimatedDuration} seconds (${wordCount} words) for audiobook ${audiobookId}`);

    // Get the actual audio duration using ffprobe
    let actualDuration = estimatedDuration; // Fallback to estimated duration
    try {
      // We're using the child_process exec to get the audio duration
      const { exec } = await import('child_process');
      const util = await import('util');
      const execPromise = util.promisify(exec);
      
      const audioPath = path.join(process.cwd(), "public", `audio/${outputFileName}.mp3`);
      // Use ffprobe to get the actual duration
      const { stdout } = await execPromise(`ffprobe -v quiet -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${audioPath}"`);
      
      // Parse the duration (ffprobe returns duration in seconds)
      const durationInSeconds = parseFloat(stdout.trim());
      if (!isNaN(durationInSeconds)) {
        actualDuration = Math.ceil(durationInSeconds);
        console.log(`Worker: Actual audio duration: ${actualDuration} seconds for audiobook ${audiobookId}`);
      } else {
        console.log(`Worker: Could not parse actual duration, using estimate: ${estimatedDuration} seconds for audiobook ${audiobookId}`);
      }
    } catch (error) {
      console.error(`Worker: Error getting actual audio duration, using estimate:`, error);
    }

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

    return { status: 'success', audioPath, duration: estimatedDuration };
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

// Perform initial queue check to pick up any jobs
setTimeout(async () => {
  try {
    console.log('Worker: Performing initial queue check');

    // Get queue information
    const [activeJobs, waitingJobs, delayedJobs] = await Promise.all([
      audiobookQueue.getActive(),
      audiobookQueue.getWaiting(),
      audiobookQueue.getDelayed()
    ]);

    console.log(`Worker: Initial queue check - Found ${activeJobs.length} active, ${waitingJobs.length} waiting, and ${delayedJobs.length} delayed jobs`);

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

    // If there are waiting jobs and no active jobs, force job processing
    if (waitingJobs.length > 0 && activeJobs.length === 0) {
      console.log(`Worker: Initial queue check - Processing pending job ${waitingJobs[0].id}`);
      // No need to do anything, the queue processor will automatically pick it up
    }
  } catch (error) {
    console.error('Worker: Error during initial queue check:', error);
  }
}, 3000); // Wait 3 seconds after initialization to check