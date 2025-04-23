import { NextRequest, NextResponse } from 'next/server';
import { audiobookQueue, AudiobookJobData } from '@/lib/queue';

// This is a serverless function that will be triggered by Vercel cron
// It processes audiobook jobs from the queue
export const runtime = 'nodejs';
export const maxDuration = 300; // 5 minutes

// POST handler to process jobs
export async function POST(request: NextRequest) {
  try {
    // Check if we have Upstash Redis
    const hasUpstashRedis = process.env.REDIS_URL && process.env.REDIS_URL.includes('upstash');
    console.log(`Worker API: Using ${hasUpstashRedis ? 'Upstash Redis' : 'local Redis'}`);
    
    // Process a single job from the queue
    const job = await audiobookQueue.getNextJob();
    
    if (!job) {
      return NextResponse.json({ status: 'no-jobs' });
    }
    
    // Process the job
    console.log(`API Worker: Processing job ${job.id}`);
    
    // Import the worker module dynamically to avoid circular dependencies
    const worker = await import('@/workers/audiobook-worker');
    
    // Return response immediately, processing continues in background
    return NextResponse.json({ status: 'processing', jobId: job.id });
  } catch (error) {
    console.error('API Worker: Error processing job:', error);
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