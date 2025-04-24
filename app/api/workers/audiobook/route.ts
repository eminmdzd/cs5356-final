import { NextRequest, NextResponse } from 'next/server';

// This endpoint is obsolete. Audiobook processing is now handled directly in server actions and progress is tracked in the database.
export const runtime = 'nodejs';
export const maxDuration = 55;

export async function POST(request: NextRequest) {
  return NextResponse.json({ status: 'obsolete', message: 'Audiobook worker endpoint is obsolete. Processing is handled directly in server actions.' }, { status: 410 });
}

export async function GET(request: NextRequest) {
  return NextResponse.json({ status: 'obsolete', message: 'Audiobook worker endpoint is obsolete. Progress is tracked in the database.' }, { status: 410 });
}
export async function GET(request: NextRequest) {
  try {
    // Get queue information
    const [activeCount, waitingCount, delayedCount, completedCount, failedCount] = await Promise.all([
      audiobookQueue.getActiveCount(),
      audiobookQueue.getWaitingCount(),
      audiobookQueue.getDelayedCount(),
      audiobookQueue.getCompletedCount(),
      audiobookQueue.getFailedCount()
    ]);
    
    return NextResponse.json({
      status: 'success',
      queue: {
        active: activeCount,
        waiting: waitingCount,
        delayed: delayedCount,
        completed: completedCount,
        failed: failedCount
      },
      redis: {
        upstash: process.env.REDIS_URL?.includes('upstash') || false,
        kv_rest: Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN)
      }
    });
  } catch (error) {
    console.error('API Worker: Error getting queue status:', error);
    return NextResponse.json(
      { 
        status: 'error', 
        message: error instanceof Error ? error.message : 'Unknown error' 
      }, 
      { status: 500 }
    );
  }
}