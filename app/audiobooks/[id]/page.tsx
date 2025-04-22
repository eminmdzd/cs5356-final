import { headers } from "next/headers"
import Link from "next/link"
import { auth } from "@/lib/auth"
import { db } from "@/database/db"
import { audiobooks as audiobooksTable } from "@/database/schema"
import { and, eq } from "drizzle-orm"
import { Button } from "@/components/ui/button"
import { notFound } from "next/navigation"

export const metadata = {
  title: "Audiobook Details - Audiobook Generator",
  description: "View audiobook details"
}

export default async function AudiobookDetailsPage({
  params
}: {
  params: { id: string }
}) {
  const session = await auth.api.getSession({
    headers: await headers()
  });

  if (!session || !session.user) {
    return null; // Middleware will handle redirect
  }

  // Get the audiobook
  const audiobook = await db.query.audiobooks.findFirst({
    where: and(
      eq(audiobooksTable.id, params.id),
      eq(audiobooksTable.userId, session.user.id)
    ),
    with: {
      pdf: true
    }
  });

  if (!audiobook) {
    notFound();
  }

  const formatDuration = (seconds: number | null): string => {
    if (!seconds) return "Unknown";
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
  };

  return (
    <main className="container py-8 px-4">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center gap-4 mb-6">
          <Link href="/audiobooks">
            <Button variant="outline" size="sm">
              ← Back to Audiobooks
            </Button>
          </Link>
          <h1 className="text-3xl font-bold">{audiobook.title}</h1>
        </div>

        <div className="border rounded-lg p-6 bg-card space-y-6">
          <div>
            <h2 className="text-xl font-semibold mb-2">Details</h2>
            <div className="space-y-2">
              <p>
                <span className="font-medium">Original PDF:</span>{" "}
                {audiobook.pdf.fileName}
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
            </div>
          </div>

          {audiobook.processingStatus === "completed" && audiobook.audioPath && (
            <div>
              <h2 className="text-xl font-semibold mb-4">Audio Player</h2>
              <audio
                controls
                className="w-full"
                src={audiobook.audioPath}
              >
                Your browser does not support the audio element.
              </audio>
            </div>
          )}
        </div>
      </div>
    </main>
  );
} 