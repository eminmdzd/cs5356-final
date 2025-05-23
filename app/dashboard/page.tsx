import { headers } from "next/headers"
import Link from "next/link"
import { Suspense } from "react"
import { auth } from "@/lib/auth"
import { db } from "@/database/db"
import { audiobooks as audiobooksTable } from "@/database/schema"
import { desc, eq } from "drizzle-orm"
import { Button } from "@/components/ui/button"
import { AudiobookProgress } from "@/components/audiobook-progress"
import DashboardLoading from "./loading"

async function getAudiobooks(userId: string) {
  return db.query.audiobooks.findMany({
    where: eq(audiobooksTable.userId, userId),
    orderBy: [desc(audiobooksTable.createdAt)],
    limit: 6,
    with: {
      pdf: true
    }
  });
}

async function getAllAudiobooks(userId: string) {
  return db.query.audiobooks.findMany({
    where: eq(audiobooksTable.userId, userId),
  });
}

async function DashboardContent() {
  const session = await auth.api.getSession({
    headers: await headers()
  });

  if (!session || !session.user) {
    return null; // Middleware will handle redirect
  }

  const [audiobooks, allAudiobooks] = await Promise.all([
    getAudiobooks(session.user.id),
    getAllAudiobooks(session.user.id)
  ]);

  const stats = {
    total: allAudiobooks.length,
    completed: allAudiobooks.filter(book => book.processingStatus === "completed").length,
    processing: allAudiobooks.filter(book => ["pending", "processing"].includes(book.processingStatus)).length,
    failed: allAudiobooks.filter(book => book.processingStatus === "failed").length
  };

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <StatCard title="Total Audiobooks" value={stats.total} />
        <StatCard title="Completed" value={stats.completed} />
        <StatCard title="Processing" value={stats.processing} />
        <StatCard title="Failed" value={stats.failed} />
      </div>

      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-semibold">Recent Audiobooks</h2>
        <Link href="/audiobooks">
          <Button variant="outline">View All</Button>
        </Link>
      </div>

      {audiobooks.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {audiobooks.map((book) => (
            <div key={book.id} className="border rounded-lg overflow-hidden bg-card flex flex-col">
              <div className="p-4 flex-1">
                <h3 className="text-xl font-medium truncate">{book.title}</h3>
                <p className="text-muted-foreground text-sm truncate mb-2">
                  {book.pdf.fileName}
                </p>
                <StatusBadge status={book.processingStatus} />
                {book.processingStatus === "completed" && book.duration && (
                  <p className="text-sm mt-2">
                    Duration: {formatDuration(book.duration)}
                  </p>
                )}
                {(book.processingStatus === "processing" || book.processingStatus === "pending") && (
                  <div className="mt-3">
                    <AudiobookProgress
                      audiobookId={book.id}
                      showCancelButton={true}
                    />
                  </div>
                )}
              </div>
              <div className="p-4 pt-0">
                <Link href={`/audiobooks/${book.id}`}>
                  <Button size="sm" variant="outline" className="w-full">
                    View Details
                  </Button>
                </Link>
              </div>
            </div>
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

export default async function DashboardPage() {
  return (
    <main className="container self-center p-8">
      <h1 className="text-3xl font-bold mb-6">Dashboard</h1>
      <Suspense fallback={<DashboardLoading />}>
        <DashboardContent />
      </Suspense>
    </main>
  );
}

function StatCard({ title, value }: { title: string; value: number }) {
  return (
    <div className="border rounded-lg p-6 bg-card">
      <h3 className="text-sm font-medium text-muted-foreground mb-2">{title}</h3>
      <p className="text-2xl font-bold">{value}</p>
    </div>
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