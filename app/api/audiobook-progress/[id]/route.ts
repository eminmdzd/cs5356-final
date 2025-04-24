import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { auth } from '@/lib/auth';
import { db } from '@/database/db';
import { audiobooks } from '@/database/schema';
import { and, eq } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  // Verify user is authenticated
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { id } = await params;
    const audiobook = await db.query.audiobooks.findFirst({
      where: eq(audiobooks.id, id)
    });
    if (!audiobook) {
      return NextResponse.json({ status: 'error', message: 'Audiobook not found' }, { status: 404 });
    }
    return NextResponse.json({
      status: 'success',
      progress: audiobook.progress,
      processingStatus: audiobook.processingStatus,
      errorDetails: audiobook.errorDetails ?? null
    });
  } catch (error) {
    console.error('API: Error getting audiobook progress:', error);
    return NextResponse.json(
      { status: 'error', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
