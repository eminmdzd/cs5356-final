import { NextRequest, NextResponse } from 'next/server';
import { processAudiobookJob } from '@/lib/audiobook-processing';
import { db } from '@/database/db'
import { audiobooks, pdfs } from '@/database/schema/audiobooks';
import { eq } from 'drizzle-orm';

// POST /api/process-audiobook
export async function POST(req: NextRequest) {
  try {
    const { audiobookId } = await req.json();
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

    // Kick off processing (awaited, but the client can fire-and-forget this call)
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
