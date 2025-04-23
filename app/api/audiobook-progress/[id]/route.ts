import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { auth } from '@/lib/auth';
import { getJobProgress, setJobProgress } from '@/lib/queue';
import { db } from '@/database/db';
import { audiobooks } from '@/database/schema';
import { and, eq } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  // Verify user is authenticated
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Need to await params before using
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

  // Set up SSE headers
  const responseHeaders = {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  };

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      // Send the initial progress
      const initialProgress = await getJobProgress(id);
      const initialStatus = audiobook.processingStatus;
      
      // Debug log to trace progress value
      console.log(`Progress API: Initial progress for ${id}: ${initialProgress}%, status: ${initialStatus}`);
      
      // Handle case where DB status is processing but progress is 0
      // This is likely a stalled or improperly initialized job
      let progressToSend = initialProgress;
      if (initialStatus === 'processing' && initialProgress === 0) {
        console.log(`Progress API: Audiobook ${id} status is processing but progress is 0, setting to 5%`);
        progressToSend = 5;
        // Update the progress value in Redis
        await setJobProgress(id, 5);
      }
      
      // If status is completed but progress is low, always set to 100%
      if (initialStatus === 'completed' && initialProgress < 100) {
        console.log(`Progress API: Audiobook ${id} status is completed but progress is ${initialProgress}%, setting to 100%`);
        progressToSend = 100;
        // Update the progress value in Redis
        await setJobProgress(id, 100);
      }
      
      const data = JSON.stringify({ progress: progressToSend, status: initialStatus });
      controller.enqueue(encoder.encode(`data: ${data}\n\n`));

      // Set up an interval to check for progress updates
      // Track whether the controller is closed
      let isControllerClosed = false;
      
      const interval = setInterval(async () => {
        // Skip if controller is already closed
        if (isControllerClosed) {
          clearInterval(interval);
          return;
        }
        
        try {
          // Get the latest progress from Redis
          const progress = await getJobProgress(id);
          
          // Get the latest status from the database
          const updatedAudiobook = await db.query.audiobooks.findFirst({
            where: and(
              eq(audiobooks.id, id),
              eq(audiobooks.userId, session.user.id)
            ),
          });
  
          if (!updatedAudiobook) {
            console.log(`Progress API: Audiobook ${id} not found, closing stream`);
            clearInterval(interval);
            isControllerClosed = true;
            controller.close();
            return;
          }
          
          // Handle case where DB status is processing but progress is 0
          let progressToSend = progress;
          
          if (updatedAudiobook.processingStatus === 'processing' && progress === 0) {
            console.log(`Progress API: Audiobook ${id} status is processing but progress is 0, setting to 5%`);
            progressToSend = 5;
            // Update the progress value in Redis
            await setJobProgress(id, 5);
          }
          
          // If status is completed but progress is low, always set to 100%
          if (updatedAudiobook.processingStatus === 'completed' && progress < 100) {
            console.log(`Progress API: Audiobook ${id} status is completed but progress is ${progress}%, setting to 100%`);
            progressToSend = 100;
            // Update the progress value in Redis
            await setJobProgress(id, 100);
          }
  
          // Prepare data to send to client
          const data = JSON.stringify({
            progress: progressToSend,
            status: updatedAudiobook.processingStatus,
            audioPath: updatedAudiobook.audioPath,
          });
  
          console.log(`Progress API: Sending update for ${id}: ${progressToSend}% ${updatedAudiobook.processingStatus} (original progress: ${progress}%)`);
          
          // If there was an error, include it in logs
          if (updatedAudiobook.errorDetails) {
            console.log(`Progress API: Audiobook ${id} has error: ${updatedAudiobook.errorDetails}`);
          }
          
          // Only enqueue if controller is still open
          if (!isControllerClosed) {
            controller.enqueue(encoder.encode(`data: ${data}\n\n`));
          }
  
          // If processing is complete or failed, end the stream
          if (
            updatedAudiobook.processingStatus === 'completed' ||
            updatedAudiobook.processingStatus === 'failed'
          ) {
            console.log(`Progress API: Audiobook ${id} is ${updatedAudiobook.processingStatus}, closing stream`);
            clearInterval(interval);
            isControllerClosed = true;
            controller.close();
          }
        } catch (error) {
          console.error(`Progress API: Error updating progress for ${id}:`, error);
        }
      }, 3000);

      // Clean up on client disconnect
      req.signal.addEventListener('abort', () => {
        clearInterval(interval);
        isControllerClosed = true;
        controller.close();
      });
    },
  });

  return new Response(stream, { headers: responseHeaders });
}
