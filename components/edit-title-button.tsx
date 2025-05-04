"use client"

import { useState, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { updateAudiobookTitle } from "@/actions/audiobook"
import { useRouter } from "next/navigation"
import { Pencil, X, Check } from "lucide-react"
import { toast } from "sonner"

interface EditTitleButtonProps {
  id: string
  currentTitle: string
  inline?: boolean
  onTitleChange?: (newTitle: string) => void
}

export function EditTitleButton({ id, currentTitle, inline = false, onTitleChange }: EditTitleButtonProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [isUpdating, setIsUpdating] = useState(false)
  const [title, setTitle] = useState(currentTitle)
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus()
    }
  }, [isEditing])

  const handleEditStart = () => {
    setTitle(currentTitle)
    setIsEditing(true)
  }

  const handleCancel = () => {
    setTitle(currentTitle)
    setIsEditing(false)
  }

  const handleSubmit = async () => {
    if (title === currentTitle) {
      setIsEditing(false)
      return
    }
    
    if (!title.trim()) {
      toast.error("Title cannot be empty")
      return
    }

    setIsUpdating(true)
    
    // Apply optimistic update if callback provided
    if (onTitleChange) {
      onTitleChange(title)
    }

    try {
      const formData = new FormData()
      formData.append('id', id)
      formData.append('title', title)

      const result = await updateAudiobookTitle(formData)

      if (result === 'success') {
        // Only notify if not using optimistic update
        if (!onTitleChange) {
          toast.success("Title updated successfully")
        }
        
        // Trigger revalidation of the audiobooks page
        if ((window as any).__refreshAudiobooks) {
          (window as any).__refreshAudiobooks();
        } else {
          // Fallback to dispatching the event
          window.dispatchEvent(new CustomEvent('revalidate-audiobooks'));
        }
        
        // Also refresh the current page using router
        router.refresh();
      } else {
        toast.error(`Failed to update title: ${result}`)
        // Revert optimistic update
        if (onTitleChange) {
          onTitleChange(currentTitle)
        }
      }
    } catch (error) {
      console.error('Error updating title:', error)
      toast.error("Failed to update title")
      // Revert optimistic update
      if (onTitleChange) {
        onTitleChange(currentTitle)
      }
    } finally {
      setIsUpdating(false)
      setIsEditing(false)
    }
  }

  if (inline) {
    if (isEditing) {
      return (
        <div className="flex items-center gap-2">
          <Input
            ref={inputRef}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="h-9"
            disabled={isUpdating}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                handleSubmit()
              } else if (e.key === "Escape") {
                handleCancel()
              }
            }}
          />
          <div className="flex gap-1">
            <Button 
              type="button" 
              variant="ghost" 
              size="icon" 
              onClick={handleSubmit} 
              disabled={isUpdating}
              className="h-9 w-9"
            >
              <Check className="h-4 w-4" />
            </Button>
            <Button 
              type="button" 
              variant="ghost" 
              size="icon" 
              onClick={handleCancel} 
              disabled={isUpdating}
              className="h-9 w-9"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )
    }
    
    return (
      <div className="flex items-center gap-2">
        <span 
          className="text-3xl font-bold truncate cursor-pointer hover:text-primary"
          onClick={handleEditStart}
        >
          {currentTitle}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="text-muted-foreground hover:text-primary h-8 w-8 border border-dashed border-muted hover:border-primary"
          onClick={handleEditStart}
          disabled={isUpdating}
        >
          <Pencil className="h-4 w-4" />
        </Button>
      </div>
    )
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="text-muted-foreground hover:text-primary h-8 w-8 border border-dashed border-muted hover:border-primary"
      onClick={handleEditStart}
      disabled={isUpdating}
    >
      <span className="sr-only">Edit title</span>
      <Pencil className="h-4 w-4" />
    </Button>
  )
}