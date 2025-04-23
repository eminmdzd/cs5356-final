"use client"

import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"

interface AudioPlayerProps {
  audioPath: string
  audiobookId: string
  storedDuration: number
}

export default function AudioPlayer({ audioPath, audiobookId, storedDuration }: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const [hasLoadedMetadata, setHasLoadedMetadata] = useState(false)
  const [hasUpdatedDuration, setHasUpdatedDuration] = useState(false)
  
  // This effect handles updating the audiobook duration if it doesn't match
  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    const handleMetadataLoaded = async () => {
      setHasLoadedMetadata(true)
      
      // Get the actual duration from the audio element
      const actualDuration = Math.ceil(audio.duration)
      
      // If the actual duration is significantly different from the stored duration, update it
      const durationDifference = Math.abs(actualDuration - storedDuration)
      const thresholdPercent = 0.1 // 10% difference threshold
      
      if (durationDifference > storedDuration * thresholdPercent && !hasUpdatedDuration) {
        console.log(`Updating duration: stored=${storedDuration}s, actual=${actualDuration}s`)
        
        try {
          // Create a request to update the duration
          const response = await fetch(`/api/audiobook-progress/${audiobookId}/update-duration`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ duration: actualDuration }),
          })
          
          if (response.ok) {
            console.log('Duration updated successfully')
            setHasUpdatedDuration(true)
          } else {
            console.error('Failed to update duration:', await response.text())
          }
        } catch (error) {
          console.error('Error updating duration:', error)
        }
      }
    }

    audio.addEventListener('loadedmetadata', handleMetadataLoaded)
    
    return () => {
      audio.removeEventListener('loadedmetadata', handleMetadataLoaded)
    }
  }, [audiobookId, storedDuration, hasUpdatedDuration])

  return (
    <audio
      ref={audioRef}
      controls
      className="w-full"
      src={audioPath}
    >
      Your browser does not support the audio element.
    </audio>
  )
}