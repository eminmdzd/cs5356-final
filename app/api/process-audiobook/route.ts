import { NextRequest, NextResponse } from 'next/server';
import { processAudiobookJob } from '@/lib/audiobook-processing';
import { db } from '@/database/db'
import { audiobooks, pdfs } from '@/database/schema/audiobooks';
import { eq } from 'drizzle-orm';

// Set longer timeout and larger body limit for this API route
export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb', // Increased limit for payload
    },
    responseLimit: false,
  },
};

// POST /api/process-audiobook
export async function POST(req: NextRequest) {
  try {
    const { audiobookId, resumeFrom, existingAudioUrl } = await req.json();
    if (!audiobookId) {
      return NextResponse.json({ error: 'audiobookId is required' }, { status: 400 });
    }

    // Get audiobook and PDF info
    const audiobook = await db.query.audiobooks.findFirst({ where: eq(audiobooks.id, audiobookId) });
    if (!audiobook) {
      return NextResponse.json({ error: 'Audiobook not found' }, { status: 404 });
    }
    const pdf = await db.query.pdfs.findFirst({ where: eq(pdfs.id, audiobook.pdfId) });
    if (!pdf) {
      return NextResponse.json({ error: 'PDF not found' }, { status: 404 });
    }

    // Check if this is a resumption request
    if (resumeFrom !== undefined && resumeFrom > 0) {
      console.log(`Resuming processing for audiobook ${audiobookId} from chunk ${resumeFrom} with existing audio URL: ${existingAudioUrl}`);
      
      // Get additional context from metadata if available
      let metadata: any = {};
      if (audiobook.metadata) {
        try {
          metadata = JSON.parse(audiobook.metadata);
        } catch (e) {
          console.warn(`Could not parse metadata for audiobook ${audiobookId}:`, e);
        }
      }
      
      // Verify the resumption is valid
      if (!metadata.totalChunks || resumeFrom >= metadata.totalChunks) {
        return NextResponse.json({ error: 'Invalid resumption point' }, { status: 400 });
      }
      
      // Get the existing audio URL from metadata if not provided directly
      const audioUrl = existingAudioUrl || (metadata.tempAudioUrl || null);
      
      // Kick off the resumed processing
      await processAudiobookJob({
        audiobookId: audiobook.id,
        pdfPath: pdf.filePath,
        startChunkIndex: resumeFrom,
        existingAudioBlobUrl: audioUrl,
      });
      
      return NextResponse.json({ success: true, resumed: true, fromChunk: resumeFrom });
    }
    
    // This is a new processing request (not resuming)
    await processAudiobookJob({
      audiobookId: audiobook.id,
      pdfPath: pdf.filePath,
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error in /api/process-audiobook:', error);
    return NextResponse.json({ error: error.message || 'Failed to process audiobook' }, { status: 500 });
  }
}
