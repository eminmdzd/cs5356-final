"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

interface AudiobookProgressProps {
  audiobookId: string;
  showCompleteMessage?: boolean;
  showCancelButton?: boolean;
}

export function AudiobookProgress({
  audiobookId,
  showCompleteMessage = true,
  showCancelButton = false
}: AudiobookProgressProps) {
  const [progress, setProgress] = useState<number>(0);
  const [status, setStatus] = useState<string>("");
  const [isCancelling, setIsCancelling] = useState(false);
  const [hasShownNotification, setHasShownNotification] = useState(false);
  const router = useRouter();

  useEffect(() => {
    if (!audiobookId) return;

    let isMounted = true;
    let lastProgress = 0; // Track the last progress value we've seen
    let errorCount = 0; // Track consecutive errors for backoff

    // Add counter for stuck on 100% detection
    let stuckAt100Count = 0;
    
    // Function to fetch progress
    const fetchProgress = async () => {
      try {
        // Add cache-busting parameter to prevent browser caching
        const response = await fetch(`/api/audiobook-progress/${audiobookId}?_=${Date.now()}`);

        if (!response.ok) {
          throw new Error(`API error: ${response.status}`);
        }

        const data = await response.json();
        const newProgress = data.progress || 0;
        
        // Detect when stuck at 100% in processing state
        if (newProgress === 100 && data.status === "processing") {
          stuckAt100Count++;
          console.log(`Detected 100% progress but still processing (count: ${stuckAt100Count})`);
          
          // After 3 consecutive detections of being stuck at 100%, force a refresh
          if (stuckAt100Count >= 3) {
            console.log("Audiobook seems to be completed but UI is stuck, forcing refresh");
            
            // Force reload the page to get the latest status
            if (window.location.pathname.includes(`/audiobooks/${audiobookId}`)) {
              window.location.reload();
            } else {
              router.refresh();
            }
          }
        } else {
          stuckAt100Count = 0; // Reset counter if anything changes
        }

        // Only update if component is still mounted
        if (!isMounted) return;

        // Only update progress if it's going up or if status changes
        if (newProgress >= lastProgress || data.status !== status) {
          lastProgress = newProgress;
          setProgress(newProgress);
          setStatus(data.status || "");

          // Reset error count on successful fetch
          errorCount = 0;

          // If processing is complete and the toast notification is enabled
          if (data.status === "completed") {
            if (showCompleteMessage && !hasShownNotification) {
              setHasShownNotification(true);
              toast.success("Audiobook generation complete!", {
                action: {
                  label: "View Audiobook",
                  onClick: () => router.push(`/audiobooks/${audiobookId}`),
                },
              });
            }
            
            // Always trigger revalidation to update the UI when completed
            // This helps fix the "stuck on finalizing" issue
            router.refresh();
            
            // Force a reload of the page if we're already on the audiobook detail page
            // to prevent "stuck on finalizing" issue
            if (window.location.pathname.includes(`/audiobooks/${audiobookId}`)) {
              setTimeout(() => {
                window.location.reload();
              }, 1000);
            }
          }

          // If processing failed
          if (data.status === "failed" && !hasShownNotification) {
            setHasShownNotification(true);
            toast.error(data.errorDetails || "Audiobook generation failed");
            // Also refresh on failure to update the UI
            router.refresh();
          }
        } else {
          console.log(`Progress update ignored: current=${lastProgress}, received=${newProgress}`);
        }
      } catch (error) {
        console.error("Error fetching progress:", error);
        errorCount++;
      }

      // Schedule next poll if still mounted and not complete/failed
      if (isMounted && status !== "completed" && status !== "failed") {
        // Use exponential backoff for errors (max 30 seconds)
        const delay = errorCount > 0 ? Math.min(5000 * Math.pow(1.5, errorCount - 1), 30000) : 5000;
        setTimeout(fetchProgress, delay);
      }
    };

    // Start polling
    fetchProgress();

    // Cleanup function
    return () => {
      isMounted = false;
    };
  }, [audiobookId, router, showCompleteMessage, status, hasShownNotification]);

  // Function to handle cancellation
  const handleCancel = useCallback(async () => {
    try {
      setIsCancelling(true);

      const formData = new FormData();
      formData.append('audiobookId', audiobookId);

      // Use dynamic import to get the server action
      const { cancelAudiobookGeneration } = await import('@/actions/cancel-audiobook');
      const result = await cancelAudiobookGeneration(formData);

      if (result === 'success') {
        toast.success('Processing cancelled');
        // Force a refresh to update UI
        router.refresh();
      } else {
        toast.error(result || 'Failed to cancel');
        setIsCancelling(false);
      }
    } catch (error: any) {
      console.error('Error cancelling audiobook:', error);
      toast.error(error.message || 'Failed to cancel audiobook');
      setIsCancelling(false);
    }
  }, [audiobookId, router]);

  if (!audiobookId) return null;

  // Determine label text based on status and progress
  let statusLabel = "";
  // Treat 'success' as 'processing' for label purposes
  const normalizedStatus = status === "success" ? "processing" : status;
  switch (normalizedStatus) {
    case "pending":
      statusLabel = "Pending";
      break;
    case "processing":
      if (progress === 0) statusLabel = "Initializing...";
      else if (progress === 5) statusLabel = "Working on it...";
      else if (progress <= 15) statusLabel = "Starting text extraction...";
      else if (progress <= 20) statusLabel = "Extracting text...";
      else if (progress <= 40) statusLabel = "Preparing audio generation...";
      else if (progress <= 90) statusLabel = "Generating audio...";
      else statusLabel = "Finalizing...";
      break;
    case "completed":
      statusLabel = "Completed";
      break;
    case "failed":
      statusLabel = "Failed";
      break;
    default:
      statusLabel = status || "Unknown";
  }

  return (
    <div className="w-full space-y-2">
      <div className="flex justify-between items-center">
        <span className="text-sm font-medium">{statusLabel}</span>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">{progress}%</span>
          {showCancelButton && (status === "processing" || status === "pending") && (
            <button
              onClick={handleCancel}
              disabled={isCancelling}
              className="text-xs text-red-500 hover:text-red-700 font-medium"
            >
              {isCancelling ? "Cancelling..." : "Cancel"}
            </button>
          )}
        </div>
      </div>
      <div className="relative w-full h-2 bg-muted rounded-full overflow-hidden">
        <div
          className={`absolute top-0 left-0 h-full rounded-full transition-all duration-300 ${status === "failed" ? "bg-red-500" : "bg-primary"}`}
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}