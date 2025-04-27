import { headers } from "next/headers"
import Link from "next/link"
import { Suspense } from "react"
import { auth } from "@/lib/auth"
import { db } from "@/database/db"
import { audiobooks as audiobooksTable } from "@/database/schema"
import { and, eq } from "drizzle-orm"
import { Button } from "@/components/ui/button"
import { AudiobookProgress } from "@/components/audiobook-progress"
import { PdfViewer } from "@/components/pdf-viewer"
import AudioPlayer from "@/components/audio-player"
import { notFound } from "next/navigation"
import AudiobookDetailsLoading from "./loading"
import { EditTitleButton } from "@/components/edit-title-button"
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";

export const metadata = {
  title: "Audiobook Details - Audiobook Generator",
  description: "View audiobook details"
}

async function getAudiobook(id: string, userId: string) {
  return db.query.audiobooks.findFirst({
    where: and(
      eq(audiobooksTable.id, id),
      eq(audiobooksTable.userId, userId)
    ),
    with: {
      pdf: true
    }
  });
}

async function AudiobookContent({ id }: { id: string }) {
  const session = await auth.api.getSession({
    headers: await headers()
  });

  if (!session || !session.user) {
    return null; // Middleware will handle redirect
  }

  const audiobook = await getAudiobook(id, session.user.id);

  if (!audiobook) {
    notFound();
  }

  const formatDuration = (seconds: number | null): string => {
    if (!seconds) return "Unknown";

    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = seconds % 60;

    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, "0")}:${remainingSeconds.toString().padStart(2, "0")}`;
    } else {
      return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
    }
  };

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex-col items-center mb-8">
        <Link href="/audiobooks">
          <Button variant="outline" size="sm">
            ← Back to Audiobooks
          </Button>
        </Link>
        <div className="flex items-center gap-2 mt-4">
          <h1 className="text-3xl font-bold truncate">{audiobook.title}</h1>
          <EditTitleButton id={id} currentTitle={audiobook.title} />
        </div>
      </div>

      <div className="border rounded-lg px-6 py-6 bg-card">
        <div className="mb-8">
          <Accordion type="single" defaultValue="details" collapsible>
            <AccordionItem value="details">
              <AccordionTrigger className="text-xl font-semibold mb-2">Details</AccordionTrigger>
              <AccordionContent>
                <div className="space-y-3">
                  <p>
                    <span className="block font-medium truncate">Original PDF: {audiobook.pdf.fileName}</span>
                  </p>
                  <p>
                    <span className="font-medium">Status:</span>{" "}
                    <span className={`inline-block px-2 py-1 text-xs rounded-full ${
                      audiobook.processingStatus === "completed"
                        ? "bg-green-100 text-green-800 dark:bg-green-500/20 dark:text-green-400"
                        : audiobook.processingStatus === "processing"
                        ? "bg-blue-100 text-blue-800 dark:bg-blue-500/20 dark:text-blue-400"
                        : audiobook.processingStatus === "failed"
                        ? "bg-red-100 text-red-800 dark:bg-red-500/20 dark:text-red-400"
                        : "bg-yellow-100 text-yellow-800 dark:bg-yellow-500/20 dark:text-yellow-400"
                    }`}>
                      {audiobook.processingStatus.charAt(0).toUpperCase() +
                        audiobook.processingStatus.slice(1)}
                    </span>
                  </p>
                  {audiobook.duration && (
                    <p>
                      <span className="font-medium">Duration:</span>{" "}
                      {formatDuration(audiobook.duration)}
                    </p>
                  )}
                  <p>
                    <span className="font-medium">Created:</span>{" "}
                    {new Date(audiobook.createdAt).toLocaleDateString()}
                  </p>

                  {(audiobook.processingStatus === "processing" || audiobook.processingStatus === "pending") && (
                    <div className="mt-8">
                      <h3 className="font-medium mb-3">Progress</h3>
                      <div className="audiobook-progress-container" data-audiobook-id={audiobook.id}>
                        <AudiobookProgress
                          audiobookId={audiobook.id}
                          showCancelButton={true}
                        />
                      </div>
                    </div>
                  )}
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>

        {/* View PDF Section */}
        <div className="mb-10">
          <h2 className="text-xl font-semibold mb-6">PDF Document</h2>
          <PdfViewer
            pdfUrl={audiobook.pdf.filePath}
            fileName={audiobook.pdf.fileName}
          />
        </div>

        {/* Audio Player Section */}
        {audiobook.processingStatus === "completed" && audiobook.audioPath && (
          <div className="mt-10 mb-6">
            <h2 className="text-xl font-semibold mb-6">Audio</h2>
            <AudioPlayer
              audioPath={audiobook.audioPath}
              audiobookId={audiobook.id}
              storedDuration={audiobook.duration || 0}
            />
          </div>
        )}

        {/* Error Details Section */}
        {audiobook.processingStatus === "failed" && audiobook.errorDetails && (
          <div className="mt-10">
            <h2 className="text-xl font-semibold mb-4 text-red-500">Error Details</h2>
            <div className="p-4 bg-red-50 border border-red-200 rounded text-red-700 dark:bg-red-950 dark:border-red-900 dark:text-red-300">
              {audiobook.errorDetails}
            </div>
            <div className="mt-6">
              <form action={async (formData: FormData) => {
                'use server';
                // Import the server action
                const { generateAudiobook } = await import('@/actions/audiobook');

                // Add the audiobook ID to the form data
                formData.append('audiobookId', id);
                formData.append('pdfId', audiobook.pdfId);
                
                // Only regenerate audiobooks that have failed
                // This is where the "Retry Processing" button is shown
                if (audiobook.processingStatus === "failed") {
                  formData.append('force', 'true');
                }

                // Call the server action
                const result = await generateAudiobook(formData);
                return result;
              }}>
                <Button type="submit" variant="outline">
                  Retry Processing
                </Button>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default async function AudiobookDetailsPage({
  params
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params;

  return (
    <main className="container self-center p-8">
      <Suspense fallback={<AudiobookDetailsLoading />}>
        <AudiobookContent id={id} />
      </Suspense>
    </main>
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