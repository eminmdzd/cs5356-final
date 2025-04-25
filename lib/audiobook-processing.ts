import { db } from '@/database/db';
import { audiobooks } from '@/database/schema';
import { eq } from 'drizzle-orm';
import { TextToSpeechClient } from '@google-cloud/text-to-speech';
import * as fs from 'fs/promises';
import * as path from 'path';
import { PDFExtract } from 'pdf.js-extract';
import { GlobalWorkerOptions } from 'pdfjs-dist';

GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString()

// Add any other imports needed from the old worker

const pdfExtract = new PDFExtract();
const isProduction = process.env.NODE_ENV === 'production';

async function extractTextWithPdfJsExtract(dataBuffer: Buffer): Promise<string> {
  // Use pdf.js-extract to extract text
  return new Promise((resolve, reject) => {
    pdfExtract.extractBuffer(dataBuffer, {}, (err, data) => {
      if (err) return reject(err);
      const text = data?.pages?.map((page) => page.content.map((c) => c.str).join(' ')).join('\n') || '';
      resolve(text);
    });
  });
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
    const text = await extractTextWithPdfJsExtract(dataBuffer);
    await db.update(audiobooks).set({ progress: 30 }).where(eq(audiobooks.id, audiobookId));

    // 2. Split text into chunks
    const chunks = splitTextIntoChunks(text, 5000);
    await db.update(audiobooks).set({ progress: 40 }).where(eq(audiobooks.id, audiobookId));

    // 3. Generate audio for each chunk (max 5 concurrent)
    const audioBuffers: Buffer[] = new Array(chunks.length);
    const concurrency = 5;
    let completed = 0;
    async function synthesizeChunk(i: number) {
      const synthesisInput = { text: chunks[i] };
      const voice = {
        languageCode: 'en-US',
        name: 'en-US-Neural2-D',
      };
      const audioConfig = {
        audioEncoding: 'MP3' as const,
        effectsProfileId: ['small-bluetooth-speaker-class-device'],
        pitch: 0.0,
        speakingRate: 1.0,
      };
      const [response] = await ttsClient.synthesizeSpeech({ input: synthesisInput, voice, audioConfig });
      if (!response.audioContent) throw new Error(`No audio content for chunk ${i}`);
      const buffer = Buffer.isBuffer(response.audioContent)
        ? response.audioContent
        : Buffer.from(response.audioContent as string, 'base64');
      audioBuffers[i] = buffer;
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

    // 4. Concatenate and save audio
    const concatenatedAudio = Buffer.concat(audioBuffers);
    const outputDir = path.join(process.cwd(), 'public/audio');
    await fs.mkdir(outputDir, { recursive: true });
    const audioFileName = `${audiobookId}.mp3`;
    const audioPath = `/audio/${audioFileName}`;
    const localAudioPath = path.join(outputDir, audioFileName);
    await fs.writeFile(localAudioPath, concatenatedAudio);
    await db.update(audiobooks).set({ progress: 100, processingStatus: 'completed', audioPath }).where(eq(audiobooks.id, audiobookId));
  } catch (error: any) {
    await db.update(audiobooks).set({ processingStatus: 'failed', errorDetails: error.message }).where(eq(audiobooks.id, audiobookId));
    throw error;
  }
}
