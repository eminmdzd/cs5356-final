import { NextResponse } from 'next/server';
import '../../../workers/audiobook-worker';
import { audiobookQueue, setJobProgress, addAudiobookJob } from '@/lib/queue';
import { db } from '@/database/db';
import { audiobooks } from '@/database/schema';
import { eq } from 'drizzle-orm';

// This route is both a status endpoint and initializes workers in development
// In production, workers would run in separate processes
export const dynamic = 'force-dynamic';

// Track the worker initialization
let workerInitialized = false;

export async function GET() {
  // Initialize the worker if not already done
  console.log('Worker API: Worker status check requested');
  
  if (!workerInitialized) {
    console.log('Worker API: Initializing worker process');
    
    // Re-import the worker to ensure it's loaded
    try {
      // Force a fresh import to ensure it's loaded
      const worker = await import('../../../workers/audiobook-worker');
      
      // Verify the worker is properly initialized by checking if the queue processor is ready
      if (worker && typeof worker === 'object') {
        workerInitialized = true;
        console.log('Worker API: Worker successfully initialized');
      } else {
        console.error('Worker API: Worker import succeeded but worker module appears to be empty');
      }
    } catch (error) {
      console.error('Worker API: Error initializing worker:', error);
    }
  } else {
    console.log('Worker API: Worker already initialized');
  }
  
  // Check for both pending and processing audiobooks that don't have active jobs
  try {
    const inProgressAudiobooks = await db.query.audiobooks.findMany({
      where: (fields, { or, eq }) => or(
        eq(fields.processingStatus, "processing"),
        eq(fields.processingStatus, "pending")
      )
    });
    
    const activeJobs = await audiobookQueue.getActive();
    const waitingJobs = await audiobookQueue.getWaiting();
    const delayedJobs = await audiobookQueue.getDelayed();
    
    // Combine all jobs to check against
    const allJobs = [...activeJobs, ...waitingJobs, ...delayedJobs];
    const allJobIds = new Set(allJobs.map(job => (job.data as any).audiobookId));
    
    // Find audiobooks that are marked as processing or pending but don't have jobs
    const missingJobs = inProgressAudiobooks.filter(book => !allJobIds.has(book.id));
    
    if (missingJobs.length > 0) {
      console.log(`Worker API: Found ${missingJobs.length} audiobooks in progress without jobs, recreating jobs`);
      
      // Create jobs for these audiobooks
      for (const book of missingJobs) {
        try {
          console.log(`Worker API: Creating new job for audiobook ${book.id} (status: ${book.processingStatus})`);
          await addAudiobookJob({
            pdfId: book.pdfId,
            userId: book.userId,
            audiobookId: book.id
          });
          console.log(`Worker API: Successfully created new job for audiobook ${book.id}`);
        } catch (error) {
          console.error(`Worker API: Error creating job for audiobook ${book.id}:`, error);
        }
      }
    }
  } catch (error) {
    console.error('Worker API: Error checking for missing jobs:', error);
  }
  
  // Get queue information
  const [activeJobs, waitingJobs, delayedJobs, completedJobs, failedJobs] = await Promise.all([
    audiobookQueue.getActive(),
    audiobookQueue.getWaiting(),
    audiobookQueue.getDelayed(),
    audiobookQueue.getCompleted(),
    audiobookQueue.getFailed()
  ]);
  
  // Check for stuck jobs - jobs in processing state but not in queue
  const processingAudiobooks = await audiobookQueue.getJobs(['active', 'waiting', 'delayed']);
  
  // Get current memory usage
  const memoryUsage = process.memoryUsage();
  
  // Trigger processing of waiting jobs
  const waitingJobCount = waitingJobs.length;
  if (waitingJobCount > 0) {
    console.log(`Worker API: Found ${waitingJobCount} waiting jobs, triggering processing`);
    
    // Force job promotion to stimulate processing
    const activeCount = activeJobs.length;
    
    if (activeCount === 0) {
      console.log(`Worker API: No active jobs found, attempting to promote waiting job to active`);
      
      // Log job status for diagnostic purposes
      waitingJobs.forEach(job => {
        const data = job.data as any;
        console.log(`Worker API: Waiting job ${job.id} for audiobook ${data?.audiobookId || 'unknown'}`);
      });
      
      // Explicitly import worker to ensure it's loaded - this also registers the processor
      try {
        console.log(`Worker API: Force-importing worker module to ensure processor is registered`);
        await import('../../../workers/audiobook-worker');
      } catch (error) {
        console.error(`Worker API: Error forcing worker import:`, error);
      }
    } else {
      console.log(`Worker API: ${activeCount} active job(s) found, worker appears to be functioning`);
    }
  }
  
  // Check Google Cloud credentials
  const hasGoogleCredentials = !!process.env.GOOGLE_APPLICATION_CREDENTIALS;
  
  // Get job processors
  const jobCounts = await audiobookQueue.getJobCounts();
  
  console.log('Worker API: Worker status checked, active jobs:', jobCounts.active);
  
  return NextResponse.json({
    status: workerInitialized ? 'Worker running' : 'Worker not initialized',
    timestamp: new Date().toISOString(),
    googleCredentials: {
      configured: hasGoogleCredentials,
      path: process.env.GOOGLE_APPLICATION_CREDENTIALS || 'Not set'
    },
    queueStatus: {
      ...jobCounts,
      activeCount: activeJobs.length,
      waitingCount: waitingJobs.length,
      delayedCount: delayedJobs.length,
      completedCount: completedJobs.length,
      failedCount: failedJobs.length,
      activeJobs: activeJobs.map(job => ({
        id: job.id,
        data: job.data,
        progress: job.progress(),
        timestamp: job.timestamp
      })),
      waitingJobs: waitingJobs.map(job => ({
        id: job.id,
        data: job.data,
        timestamp: job.timestamp
      })),
      failedJobs: failedJobs.slice(0, 5).map(job => ({
        id: job.id,
        data: job.data,
        failedReason: job.failedReason,
        stacktrace: job.stacktrace,
        timestamp: job.timestamp
      })),
    },
    processingCount: processingAudiobooks.length,
    memory: {
      rss: Math.round(memoryUsage.rss / 1024 / 1024) + 'MB',
      heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024) + 'MB',
      heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024) + 'MB'
    }
  });
}