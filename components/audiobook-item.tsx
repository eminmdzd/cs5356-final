"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"

type AudiobookItemProps = {
  audiobook: any // Using any since we're passing the full audiobook with pdf relation
  deleteAction: (formData: FormData) => Promise<string>
  generateAction: (formData: FormData) => Promise<string>
}

export function AudiobookItem({ audiobook, deleteAction, generateAction }: AudiobookItemProps) {
  const [isProcessing, setIsProcessing] = useState(audiobook.processingStatus === "processing")
  const [isDeleting, setIsDeleting] = useState(false)
  const [status, setStatus] = useState(audiobook.processingStatus)

  const handleGenerate = async () => {
    setIsProcessing(true)
    
    try {
      const formData = new FormData()
      formData.append("pdfId", audiobook.pdfId)
      
      const result = await generateAction(formData)
      
      if (result === "success") {
        toast.success("Audiobook generation started")
        setStatus("processing")
      } else {
        toast.error(result)
        setIsProcessing(false)
      }
    } catch (error) {
      console.error("Error generating audiobook:", error)
      toast.error("Failed to generate audiobook")
      setIsProcessing(false)
    }
  }

  const handleDelete = async () => {
    if (!confirm("Are you sure you want to delete this audiobook?")) {
      return
    }
    
    setIsDeleting(true)
    
    try {
      const formData = new FormData()
      formData.append("id", audiobook.id)
      
      const result = await deleteAction(formData)
      
      if (result === "success") {
        toast.success("Audiobook deleted successfully")
      } else {
        toast.error(result)
        setIsDeleting(false)
      }
    } catch (error) {
      console.error("Error deleting audiobook:", error)
      toast.error("Failed to delete audiobook")
      setIsDeleting(false)
    }
  }

  const formatDuration = (seconds: number | null): string => {
    if (!seconds) return "Unknown";
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
  }

  return (
    <div className="border rounded-lg p-4 bg-card">
      <div className="flex flex-col md:flex-row justify-between gap-4">
        <div>
          <h2 className="text-xl font-medium">{audiobook.title}</h2>
          <p className="text-sm text-muted-foreground">
            Original PDF: {audiobook.pdf.fileName}
          </p>
          <div className="mt-2 flex items-center gap-2">
            <StatusBadge status={status} />
            {status === "completed" && audiobook.duration && (
              <span className="text-sm text-muted-foreground">
                Duration: {formatDuration(audiobook.duration)}
              </span>
            )}
          </div>
        </div>
        
        <div className="flex flex-col sm:flex-row gap-2 self-end md:self-center">
          {status === "completed" && audiobook.audioPath ? (
            <audio 
              controls
              className="max-w-full w-[300px]"
              src={audiobook.audioPath}
            >
              Your browser does not support the audio element.
            </audio>
          ) : status === "failed" ? (
            <Button
              onClick={handleGenerate}
              disabled={isProcessing || isDeleting}
            >
              {isProcessing ? "Processing..." : "Retry Generation"}
            </Button>
          ) : status === "pending" ? (
            <Button
              onClick={handleGenerate}
              disabled={isProcessing || isDeleting}
            >
              {isProcessing ? "Processing..." : "Generate Audiobook"}
            </Button>
          ) : null}
          
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={isProcessing || isDeleting}
          >
            {isDeleting ? "Deleting..." : "Delete"}
          </Button>
        </div>
      </div>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const colors = {
    pending: "bg-yellow-100 text-yellow-800 dark:bg-yellow-500/20 dark:text-yellow-400",
    processing: "bg-blue-100 text-blue-800 dark:bg-blue-500/20 dark:text-blue-400",
    completed: "bg-green-100 text-green-800 dark:bg-green-500/20 dark:text-green-400",
    failed: "bg-red-100 text-red-800 dark:bg-red-500/20 dark:text-red-400"
  };

  const labels = {
    pending: "Pending",
    processing: "Processing",
    completed: "Completed",
    failed: "Failed"
  };

  // @ts-ignore
  const colorClass = colors[status] || colors.pending;
  // @ts-ignore
  const label = labels[status] || "Unknown";

  return (
    <span className={`inline-block px-2 py-1 text-xs rounded-full ${colorClass}`}>
      {label}
    </span>
  );
}