import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { auth } from '@/lib/auth';
import { getJobProgress, setJobProgress } from '@/lib/queue';
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

  // Get the id from params
  const { id } = await params;

  // Verify the audiobook belongs to the user
  const audiobook = await db.query.audiobooks.findFirst({
    where: and(
      eq(audiobooks.id, id),
      eq(audiobooks.userId, session.user.id)
    ),
  });

  if (!audiobook) {
    return NextResponse.json({ error: 'Audiobook not found' }, { status: 404 });
  }

  // Get the latest progress from Redis
  const progress = await getJobProgress(id);
  
  // Handle case where DB status is processing but progress is 0
  let progressToSend = progress;
  
  if (audiobook.processingStatus === 'processing' && progress === 0) {
    console.log(`Progress API: Audiobook ${id} status is processing but progress is 0, setting to 5%`);
    progressToSend = 5;
    // Update the progress value in Redis
    await setJobProgress(id, 5);
  }

  // If status is completed but progress is low, always set to 100%
  if (audiobook.processingStatus === 'completed' && progress < 100) {
    console.log(`Progress API: Audiobook ${id} status is completed but progress is ${progress}%, setting to 100%`);
    progressToSend = 100;
    // Update the progress value in Redis
    await setJobProgress(id, 100);
  }

  // Prepare data to send to client
  const data = {
    progress: progressToSend,
    status: audiobook.processingStatus,
    audioPath: audiobook.audioPath,
    errorDetails: audiobook.errorDetails
  };

  console.log(`Progress API: Sending update for ${id}: ${progressToSend}% ${audiobook.processingStatus} (original progress: ${progress}%)`);

  return NextResponse.json(data);
}
