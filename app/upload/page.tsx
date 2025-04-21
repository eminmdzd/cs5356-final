import { PdfUploadForm } from "@/components/pdf-upload-form"
import { headers } from "next/headers"
import { auth } from "@/lib/auth"

export const metadata = {
  title: "Upload PDF - Audiobook Generator",
  description: "Upload PDF files to convert to audiobooks"
}

export default async function UploadPage() {
  const session = await auth.api.getSession({
    headers: await headers()
  });

  if (!session || !session.user) {
    return null; // Middleware will handle redirect
  }

  return (
    <div className="container max-w-3xl py-10">
      <h1 className="text-3xl font-bold mb-6">Upload PDF</h1>
      <p className="text-muted-foreground mb-6">
        Upload a PDF file to convert it to an audiobook. The file will be processed and converted to audio using text-to-speech technology.
      </p>
      
      <div className="border rounded-lg p-6 bg-card">
        <PdfUploadForm />
      </div>
      
      <div className="mt-8">
        <h2 className="text-xl font-semibold mb-4">File Requirements</h2>
        <ul className="list-disc pl-5 space-y-2 text-muted-foreground">
          <li>File must be in PDF format</li>
          <li>Maximum file size: 10MB</li>
          <li>Text must be selectable (not a scanned image)</li>
          <li>Support for English text</li>
        </ul>
      </div>
    </div>
  )
}