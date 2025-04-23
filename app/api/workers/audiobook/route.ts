import { NextRequest, NextResponse } from 'next/server';
import { audiobookQueue, AudiobookJobData } from '@/lib/queue';

// This endpoint can be used to manually trigger job processing
// instead of relying on cron
export const runtime = 'nodejs';
export const maxDuration = 300; // 5 minutes

// POST handler to manually process jobs if needed
export async function POST(request: NextRequest) {
  try {
    // Check if we have Upstash Redis
    const hasUpstashRedis = process.env.REDIS_URL && process.env.REDIS_URL.includes('upstash');
    console.log(`Worker API: Using ${hasUpstashRedis ? 'Upstash Redis' : 'local Redis'}`);
    
    // Import the worker module dynamically to ensure it's initialized
    // This will only be needed if the worker isn't already running
    const worker = await import('@/workers/audiobook-worker');
    
    // We don't need to explicitly get the next job anymore since
    // the worker processes jobs automatically
    
    // Return response immediately
    return NextResponse.json({ status: 'success', message: 'Worker initialized' });
  } catch (error) {
    console.error('API Worker: Error initializing worker:', error);
    return NextResponse.json(
      { 
        status: 'error', 
        message: error instanceof Error ? error.message : 'Unknown error' 
      }, 
      { status: 500 }
    );
  }
}

// GET handler to check queue status
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