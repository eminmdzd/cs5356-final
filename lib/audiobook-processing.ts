import { db } from '@/database/db';
import { audiobooks } from '@/database/schema';
import { eq } from 'drizzle-orm';
import { TextToSpeechClient } from '@google-cloud/text-to-speech';
import * as fs from 'fs/promises';
import * as path from 'path';
import { PDFExtract } from 'pdf.js-extract';

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
    if (pdfPath.startsWith('http://') || pdfPath.startsWith('https://')) {
      // For production, fetch from URL (implement fetch logic if needed)
      throw new Error('Remote PDF fetch not implemented in this stub');
    } else {
      // Local file system
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

    // 3. Generate audio for each chunk
    const audioBuffers: Buffer[] = [];
    for (let i = 0; i < chunks.length; i++) {
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
      audioBuffers.push(buffer);
      // Progress: 40 + (i+1)/chunks.length*50
      const progress = 40 + Math.floor(((i + 1) / chunks.length) * 50);
      await db.update(audiobooks).set({ progress }).where(eq(audiobooks.id, audiobookId));
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
