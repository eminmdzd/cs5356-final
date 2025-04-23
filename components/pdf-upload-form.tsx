"use client"

import { useState, useRef } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { uploadPdf } from "@/actions/pdf"
import { toast } from "sonner"

export function PdfUploadForm() {
  const router = useRouter()
  const [file, setFile] = useState<File | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0])
      setError(null)
    }
  }

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()

    if (!file) {
      setError("Please select a file")
      return
    }

    setIsUploading(true)
    setError(null)

    try {
      const formData = new FormData()
      formData.append("file", file)

      // Store the original file path if available (browsers may not provide this for security reasons)
      if ('path' in file) {
        // @ts-ignore - some File objects from certain environments may have a path property
        formData.append("originalPath", file.path)
      }

      const result = await uploadPdf(formData)

      if (result === "success") {
        toast.success("PDF uploaded successfully!")
        router.push("/dashboard")
        router.refresh()
      } else {
        setError(result)
        toast.error(result)
      }
    } catch (error) {
      console.error("Error uploading PDF:", error)
      setError("An unexpected error occurred. Please try again.")
      toast.error("Failed to upload PDF")
    } finally {
      setIsUploading(false)
    }
  }

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
  }

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      setFile(e.dataTransfer.files[0])
      setError(null)
    }
  }

  const handleReset = () => {
    setFile(null)
    setError(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ""
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:bg-accent/50 transition-colors"
        onClick={() => fileInputRef.current?.click()}
      >
        {file ? (
          <div className="space-y-2">
            <p className="font-medium">{file.name}</p>
            <p className="text-sm text-muted-foreground">
              {(file.size / 1024 / 1024).toFixed(2)} MB
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={(e) => {
                e.stopPropagation()
                handleReset()
              }}
            >
              Choose Another File
            </Button>
          </div>
        ) : (
          <>
            <p className="text-lg font-medium mb-2">Drag and drop your PDF here</p>
            <p className="text-muted-foreground mb-4">or click to browse</p>
            <Button type="button" variant="outline">
              Select PDF
            </Button>
          </>
        )}
        <Input
          ref={fileInputRef}
          type="file"
          accept=".pdf"
          onChange={handleFileChange}
          className="hidden"
        />
      </div>

      {error && <p className="text-red-500 text-sm">{error}</p>}

      <div className="flex justify-end">
        <Button
          type="submit"
          disabled={!file || isUploading}
          className="w-full sm:w-auto"
        >
          {isUploading ? "Uploading..." : "Upload and Convert to Audiobook"}
        </Button>
      </div>
    </form>
  )
}