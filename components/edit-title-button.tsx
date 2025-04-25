"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { updateAudiobookTitle } from "@/actions/audiobook"

interface EditTitleButtonProps {
  id: string
  currentTitle: string
}

export function EditTitleButton({ id, currentTitle }: EditTitleButtonProps) {
  const [isUpdating, setIsUpdating] = useState(false)

  const handleEditClick = async () => {
    const newTitle = prompt('Enter new title:', currentTitle)

    if (newTitle && newTitle !== currentTitle) {
      setIsUpdating(true)

      try {
        const formData = new FormData()
        formData.append('id', id)
        formData.append('title', newTitle)

        const result = await updateAudiobookTitle(formData)

        if (result === 'success') {
          window.location.reload()
        } else {
          alert(`Failed to update title: ${result}`)
          setIsUpdating(false)
        }
      } catch (error) {
        console.error('Error updating title:', error)
        alert('Failed to update title')
        setIsUpdating(false)
      }
    }
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="text-muted-foreground hover:text-primary h-8 w-8 border border-dashed border-muted hover:border-primary"
      onClick={handleEditClick}
      disabled={isUpdating}
    >
      <span className="sr-only">Edit title</span>
      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"></path></svg>
    </Button>
  )
}