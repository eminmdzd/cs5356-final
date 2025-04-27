"use client"

import Link from "next/link"
import { Button } from "@/components/ui/button"
import { AudiobookProgress } from "@/components/audiobook-progress"
import { deleteAudiobook, generateAudiobook, updateAudiobookTitle } from "@/actions/audiobook"
import { Trash2, RefreshCw, Pencil } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useState } from "react"
import { toast } from "sonner"
import { Audiobook, Pdf } from "@/database/schema"

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

  const isAnimated = status === "processing" || status === "pending";

  return (
    <span className={`inline-block px-2 py-1 text-xs rounded-full ${colorClass} ${isAnimated ? 'animate-pulse' : ''}`}>
      {label}
    </span>
  );
}

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${remainingSeconds.toString().padStart(2, "0")}`;
  } else {
    return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
  }
}

export function AudiobookCard({ audiobook }: { audiobook: Audiobook & { pdf: Pdf } }) {
  const [isEditing, setIsEditing] = useState(false)
  const [title, setTitle] = useState(audiobook.title)
  const [isDeleting, setIsDeleting] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)

  const handleTitleSave = async () => {
    if (title === audiobook.title) {
      setIsEditing(false)
      return
    }

    try {
      const formData = new FormData()
      formData.append("id", audiobook.id)
      formData.append("title", title)

      const result = await updateAudiobookTitle(formData)

      if (result === "success") {
        toast.success("Title updated successfully")
      } else {
        toast.error(result)
        // Reset to original title
        setTitle(audiobook.title)
      }
    } catch (error) {
      console.error("Error updating title:", error)
      toast.error("Failed to update title")
      // Reset to original title
      setTitle(audiobook.title)
    } finally {
      setIsEditing(false)
    }
  }

  const handleDeleteClick = () => {
    setShowDeleteModal(true)
  }

  const handleCancelDelete = () => {
    setShowDeleteModal(false)
  }

  const handleConfirmDelete = async () => {
    setIsDeleting(true)

    try {
      const formData = new FormData()
      formData.append("id", audiobook.id)

      const result = await deleteAudiobook(formData)

      if (result === "success") {
        toast.success("Audiobook deleted successfully")
        setShowDeleteModal(false)
      } else {
        toast.error(result)
        setIsDeleting(false)
        setShowDeleteModal(false)
      }
    } catch (error) {
      console.error("Error deleting audiobook:", error)
      toast.error("Failed to delete audiobook")
      setIsDeleting(false)
      setShowDeleteModal(false)
    }
  }

  return (
    <div className="border rounded-lg overflow-hidden bg-card flex flex-col relative">
      {!isEditing && (<div className="absolute top-2 right-2 flex gap-1">
        <Button 
          size="icon" 
          variant="ghost" 
          className="h-8 w-8 text-muted-foreground hover:text-primary"
          onClick={() => setIsEditing(true)}
        >
          <Pencil className="h-4 w-4" />
        </Button>
        {audiobook.processingStatus !== "completed" && 
         audiobook.processingStatus !== "processing" && 
         audiobook.processingStatus !== "pending" && (
          <form 
            action={async () => {
              const formData = new FormData();
              formData.append("pdfId", audiobook.pdfId);
              formData.append("audiobookId", audiobook.id);
              await generateAudiobook(formData);
            }}
          >
            <Button 
              size="icon" 
              variant="ghost" 
              className="h-8 w-8 text-muted-foreground hover:text-primary"
              type="submit"
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
          </form>
        )}
        <Button 
          size="icon" 
          variant="ghost" 
          className="h-8 w-8 text-muted-foreground hover:text-destructive"
          onClick={handleDeleteClick}
          disabled={isDeleting}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>)}
      <div className="p-3 sm:p-4 flex-1">
        {isEditing ? (
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 mb-2">
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="h-8 w-full"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  handleTitleSave()
                } else if (e.key === "Escape") {
                  setTitle(audiobook.title)
                  setIsEditing(false)
                }
              }}
            />
            <div className="flex gap-2 mt-2 sm:mt-0">
              <Button size="sm" onClick={handleTitleSave}>Save</Button>
              <Button 
                size="sm" 
                variant="ghost" 
                onClick={() => {
                  setTitle(audiobook.title)
                  setIsEditing(false)
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <div 
            className="cursor-pointer"
            onClick={() => setIsEditing(true)}
          >
            <h3 className="text-lg sm:text-xl font-medium truncate pr-12 sm:pr-16">{audiobook.title}</h3>
          </div>
        )}
        <p className="text-muted-foreground text-xs sm:text-sm truncate mb-2">
          {audiobook.pdf.fileName}
        </p>
        <StatusBadge status={audiobook.processingStatus} />
        {audiobook.processingStatus === "completed" && audiobook.duration && (
          <p className="text-xs sm:text-sm mt-2">
            Duration: {formatDuration(audiobook.duration)}
          </p>
        )}
        {(audiobook.processingStatus === "processing" || audiobook.processingStatus === "pending") && (
          <div className="mt-2 sm:mt-3">
            <AudiobookProgress
              audiobookId={audiobook.id}
              showCancelButton={true}
            />
          </div>
        )}
      </div>
      <div className="p-3 sm:p-4 pt-0">
        <Link href={`/audiobooks/${audiobook.id}`}>
          <Button size="sm" variant="outline" className="w-full">
            View Details
          </Button>
        </Link>
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-card p-4 sm:p-6 rounded-lg max-w-md w-full shadow-xl">
            <h3 className="text-base sm:text-lg font-semibold mb-2 sm:mb-4">Confirm Deletion</h3>
            <p className="mb-4 sm:mb-6 text-sm sm:text-base overflow-hidden text-ellipsis">Are you sure you want to delete "{audiobook.title}"? This action cannot be undone.</p>
            <div className="flex justify-end gap-2">
              <Button 
                variant="outline" 
                size="sm"
                onClick={handleCancelDelete}
                disabled={isDeleting}
              >
                Cancel
              </Button>
              <Button 
                variant="destructive" 
                size="sm"
                onClick={handleConfirmDelete}
                disabled={isDeleting}
              >
                {isDeleting ? "Deleting..." : "Delete"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
} 