import Queue from 'bull';
import { Redis } from 'ioredis';

// Use Redis URL from environment or localhost with default port
const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

// Create Redis client for Bull
const client = new Redis(redisUrl);

// Create and export the audiobook processing queue
export const audiobookQueue = new Queue('audiobook-processing', {
  redis: {
    port: client.options.port || 6379,
    host: client.options.host || 'localhost',
    password: client.options.password,
  },
  limiter: {
    // Limit to 5 jobs per minute to avoid rate limiting in Google TTS API
    max: 5,
    duration: 60000,
  },
});

// Auto-initialize worker in the same process
// This is important for Next.js development mode where we don't have separate worker processes
if (typeof window === 'undefined') { // Only run in server context
  console.log('Queue: Auto-initializing worker process');

  // Import worker dynamically to prevent circular dependencies
  import('../workers/audiobook-worker')
    .then(() => {
      console.log('Queue: Worker auto-initialization successful');
    })
    .catch((error) => {
      console.error('Queue: Worker auto-initialization failed:', error);
    });
}

// Typed job data interface
export interface AudiobookJobData {
  pdfId: string;
  userId: string;
  audiobookId: string;
}

// Method to add job to the queue
export function addAudiobookJob(data: AudiobookJobData): Promise<any> {
  return audiobookQueue.add(data, {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 10000, // 10 seconds initial delay
    },
    removeOnComplete: true, // Clean up completed jobs
    removeOnFail: false, // Keep failed jobs for debugging
  });
}

// Method to cancel a specific audiobook job
export async function cancelAudiobookJob(audiobookId: string): Promise<boolean> {
  try {
    // Check all possible job states: active, waiting, delayed
    const [activeJobs, waitingJobs, delayedJobs] = await Promise.all([
      audiobookQueue.getActive(),
      audiobookQueue.getWaiting(),
      audiobookQueue.getDelayed()
    ]);

    // Combine all jobs to search through
    const allJobs = [...activeJobs, ...waitingJobs, ...delayedJobs];

    // Find job for this audiobook
    const job = allJobs.find(job => {
      const data = job.data as AudiobookJobData;
      return data.audiobookId === audiobookId;
    });

    if (job) {
      console.log(`Found job ${job.id} for audiobook ${audiobookId}, removing...`);

      // Remove the job
      await job.remove();

      // Reset progress tracking
      setJobProgress(audiobookId, 0);

      return true;
    }

    console.log(`No job found for audiobook ${audiobookId}`);
    return false;
  } catch (error) {
    console.error('Error cancelling audiobook job:', error);
    return false;
  }
}

// Job progress status tracker - use Redis for persistence across requests
// This is important because Next.js may restart the server between requests
// Using Redis ensures progress values persist

// Method to set job progress using Redis
export async function setJobProgress(audiobookId: string, progress: number): Promise<void> {
  console.log(`Setting progress for audiobook ${audiobookId} to ${progress}%`);

  try {
    // Make sure progress is a number between 0 and 100
    const validProgress = Math.max(0, Math.min(100, progress));

    // Get current progress from Redis
    const currentProgressStr = await client.get(`progress:${audiobookId}`);
    const currentProgress = currentProgressStr ? parseInt(currentProgressStr, 10) : 0;

    // Only update if the new progress is higher than the current progress
    if (validProgress >= currentProgress) {
      await client.set(`progress:${audiobookId}`, validProgress.toString());
      console.log(`Updated progress in Redis for ${audiobookId}: ${validProgress}%`);
    } else {
      console.log(`Ignoring lower progress value for ${audiobookId}: current=${currentProgress}, new=${validProgress}`);
    }
  } catch (error) {
    console.error(`Error setting progress for audiobook ${audiobookId}:`, error);
    // Fallback to in-memory tracking if Redis fails
    jobProgressFallback.set(audiobookId, progress);
  }
}

// Fallback in-memory tracker if Redis fails
const jobProgressFallback = new Map<string, number>();

// Method to get job progress from Redis
export async function getJobProgress(audiobookId: string): Promise<number> {
  try {
    const progressStr = await client.get(`progress:${audiobookId}`);
    const progress = progressStr ? parseInt(progressStr, 10) : 0;
    console.log(`Retrieved progress from Redis for audiobook ${audiobookId}: ${progress}%`);
    return progress;
  } catch (error) {
    console.error(`Error getting progress for audiobook ${audiobookId}:`, error);
    // Fallback to in-memory tracking if Redis fails
    const fallbackProgress = jobProgressFallback.get(audiobookId) || 0;
    console.log(`Fallback progress for audiobook ${audiobookId}: ${fallbackProgress}%`);
    return fallbackProgress;
  }
}

// Legacy synchronous version for backward compatibility
// This is used in places where we can't easily make async calls
export function getJobProgressSync(audiobookId: string): number {
  try {
    // Try to get from fallback map first
    const progress = jobProgressFallback.get(audiobookId) || 0;
    console.log(`Retrieving sync progress for audiobook ${audiobookId}: ${progress}%`);
    return progress;
  } catch (error) {
    console.error(`Error in getJobProgressSync for ${audiobookId}:`, error);
    return 0;
  }
}
