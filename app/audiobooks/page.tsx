import { headers } from "next/headers"
import Link from "next/link"
import { Suspense } from "react"
import { auth } from "@/lib/auth"
import { db } from "@/database/db"
import { audiobooks as audiobooksTable } from "@/database/schema"
import { desc, eq } from "drizzle-orm"
import { Button } from "@/components/ui/button"
import AudiobooksLoading from "./loading"
import { AudiobookCard } from "@/components/audiobook-card"

export const metadata = {
  title: "My Audiobooks - Audiobook Generator",
  description: "Manage your audiobooks"
}

async function getAudiobooks(userId: string) {
  return db.query.audiobooks.findMany({
    where: eq(audiobooksTable.userId, userId),
    orderBy: [desc(audiobooksTable.createdAt)],
    with: {
      pdf: true
    }
  });
}

async function AudiobooksContent() {
  const session = await auth.api.getSession({
    headers: await headers()
  });

  if (!session || !session.user) {
    return null; // Middleware will handle redirect
  }

  const audiobooks = await getAudiobooks(session.user.id);

  return (
    <>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">My Audiobooks</h1>
        <Link href="/upload">
          <Button>Upload New PDF</Button>
        </Link>
      </div>

      {audiobooks.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {audiobooks.map((book) => (
            <AudiobookCard key={book.id} audiobook={book} />
          ))}
        </div>
      ) : (
        <div className="text-center py-16 border rounded-lg bg-card">
          <h3 className="font-medium text-xl mb-2">No audiobooks yet</h3>
          <p className="text-muted-foreground mb-6">
            Upload a PDF to get started with your first audiobook
          </p>
          <Link href="/upload">
            <Button>Upload PDF</Button>
          </Link>
        </div>
      )}
    </>
  );
}

export default async function AudiobooksPage() {
  return (
    <main className="container self-center py-8">
      <Suspense fallback={<AudiobooksLoading />}>
        <AudiobooksContent />
      </Suspense>
    </main>
  );
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

  const isAnimated = status === "processing" || status === "pending";

  return (
    <span className={`inline-block px-2 py-1 text-xs rounded-full ${colorClass} ${isAnimated ? 'animate-pulse' : ''}`}>
      {label}
    </span>
  );
}
