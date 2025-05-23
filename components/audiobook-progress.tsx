"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

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
  const [showCancelModal, setShowCancelModal] = useState(false);
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

            // Immediately trigger revalidation to update the UI when completed
            router.refresh();

            // Force a reload of the page if we're already on the audiobook detail page
            // to prevent "stuck on finalizing" issue
            if (window.location.pathname.includes(`/audiobooks/${audiobookId}`)) {
              console.log("On audiobook detail page, forcing immediate reload for completed status");
              setTimeout(() => {
                window.location.reload();
              }, 500); // Reduced from 1000ms to 500ms for faster refresh
            }
          }
          
          // Also force refresh when we hit 100% progress, regardless of status
          // This ensures UI updates immediately when processing is complete
          if (newProgress === 100) {
            console.log(`100% progress detected with status "${data.status}", forcing immediate refresh`);
            
            // Force an immediate router refresh
            router.refresh();
            
            // If on the audiobook detail page, force a full page reload
            if (window.location.pathname.includes(`/audiobooks/${audiobookId}`)) {
              console.log("On detail page at 100% - forcing page reload");
              window.location.reload();
            }
            
            // If not on detail page but at 100%, do a hard navigation to force refresh
            else if (data.status === "processing") {
              console.log("Not on detail page but at 100% - forcing hard refresh");
              // Schedule a delayed refresh to catch the completed status
              setTimeout(() => {
                router.refresh();
                // Optionally add a query param to bypass any caching
                if (typeof window !== 'undefined') {
                  window.location.href = window.location.href.split('?')[0] + '?refresh=' + Date.now();
                }
              }, 500);
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
        // Determine polling delay based on progress and error state
        let delay = 5000; // Default 5 seconds
        
        if (errorCount > 0) {
          // Use exponential backoff for errors (max 30 seconds)
          delay = Math.min(5000 * Math.pow(1.5, errorCount - 1), 30000);
        } else if (progress >= 90) {
          // Poll more frequently when we're close to completion (every 1 second)
          delay = 1000;
        } else if (progress >= 80) {
          // Poll more frequently in the final stages (every 2 seconds)
          delay = 2000;
        }
        
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

  // Function to handle cancel click
  const handleCancelClick = useCallback(() => {
    setShowCancelModal(true);
  }, []);

  // Function to handle cancel confirmation
  const handleConfirmCancel = useCallback(async () => {
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
    } finally {
      setShowCancelModal(false);
    }
  }, [audiobookId, router]);

  // Function to handle cancel modal dismissal
  const handleCancelModalClose = useCallback(() => {
    if (!isCancelling) {
      setShowCancelModal(false);
    }
  }, [isCancelling]);

  if (!audiobookId) return null;

  // Determine label text based on status and progress
  let statusLabel = "";
  // Treat 'success' as 'processing' for label purposes
  const normalizedStatus = status === "success" ? "processing" : status;
  
  // Debug log for status and showCancelButton
  console.log(`AudiobookProgress: status=${status}, showCancelButton=${showCancelButton}, normalizedStatus=${normalizedStatus}`);
  
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
    <>
      <div className="w-full space-y-2">
        <div className="flex justify-between items-center">
          <span className="text-sm font-medium">{statusLabel}</span>
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground">{progress}%</span>
            {showCancelButton && (normalizedStatus === "processing" || normalizedStatus === "pending") && (
              <button
                onClick={handleCancelClick}
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
            className={`absolute top-0 left-0 h-full rounded-full transition-all duration-300 ${normalizedStatus === "failed" ? "bg-red-500" : "bg-primary"}`}
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Cancel Confirmation Modal */}
      {showCancelModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-card p-6 rounded-lg max-w-md w-full shadow-xl">
            <h3 className="text-lg font-semibold mb-4">Confirm Cancellation</h3>
            <p className="mb-6">
              Are you sure you want to cancel this audiobook generation? 
              This will stop the process, remove any partially generated audio,
              and cannot be undone.
            </p>
            <div className="flex justify-end gap-2">
              <Button 
                variant="outline" 
                onClick={handleCancelModalClose}
                disabled={isCancelling}
              >
                Keep Processing
              </Button>
              <Button 
                variant="destructive" 
                onClick={handleConfirmCancel}
                disabled={isCancelling}
              >
                {isCancelling ? "Cancelling..." : "Cancel Generation"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}