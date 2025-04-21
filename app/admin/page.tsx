import { headers } from "next/headers"
import { auth } from "@/lib/auth"
import { db } from "@/database/db"
import { audiobooks as audiobooksTable, users } from "@/database/schema"
import { desc } from "drizzle-orm"

export const metadata = {
  title: "Admin Dashboard - Audiobook Generator",
  description: "Admin dashboard for the Audiobook Generator"
}

export default async function AdminPage() {
  const session = await auth.api.getSession({
    headers: await headers()
  });

  if (!session || !session.user || session.user.role !== "admin") {
    return null; // Middleware will handle redirect
  }

  // Get all audiobooks with user information
  const audiobooks = await db.query.audiobooks.findMany({
    orderBy: [desc(audiobooksTable.createdAt)],
    with: {
      pdf: true,
      user: true
    }
  });

  // Get user statistics
  const allUsers = await db.query.users.findMany();
  
  const stats = {
    totalUsers: allUsers.length,
    totalAudiobooks: audiobooks.length,
    completedAudiobooks: audiobooks.filter(book => book.processingStatus === "completed").length,
    pendingAudiobooks: audiobooks.filter(book => book.processingStatus === "pending").length,
    processingAudiobooks: audiobooks.filter(book => book.processingStatus === "processing").length,
    failedAudiobooks: audiobooks.filter(book => book.processingStatus === "failed").length,
  };

  return (
    <main className="container py-8 px-4">
      <h1 className="text-3xl font-bold mb-6">Admin Dashboard</h1>
      
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
        <StatCard title="Total Users" value={stats.totalUsers} />
        <StatCard title="Total Audiobooks" value={stats.totalAudiobooks} />
        <StatCard title="Completed" value={stats.completedAudiobooks} />
        <StatCard title="Pending" value={stats.pendingAudiobooks} />
        <StatCard title="Processing" value={stats.processingAudiobooks} />
        <StatCard title="Failed" value={stats.failedAudiobooks} />
      </div>
      
      <h2 className="text-2xl font-semibold mb-4">All Audiobooks</h2>
      
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-muted">
              <th className="p-2 text-left">Title</th>
              <th className="p-2 text-left">User</th>
              <th className="p-2 text-left">Status</th>
              <th className="p-2 text-left">Created</th>
              <th className="p-2 text-left">PDF</th>
              <th className="p-2 text-left">Duration</th>
            </tr>
          </thead>
          <tbody>
            {audiobooks.map((book) => (
              <tr key={book.id} className="border-b hover:bg-muted/50">
                <td className="p-2">{book.title}</td>
                <td className="p-2">{book.user.email}</td>
                <td className="p-2">
                  <StatusBadge status={book.processingStatus} />
                </td>
                <td className="p-2">{formatDate(book.createdAt)}</td>
                <td className="p-2">{book.pdf.fileName}</td>
                <td className="p-2">
                  {book.duration ? formatDuration(book.duration) : "N/A"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}

function StatCard({ title, value }: { title: string; value: number }) {
  return (
    <div className="p-4 border rounded-lg bg-card">
      <h3 className="text-sm font-medium text-muted-foreground">{title}</h3>
      <p className="text-3xl font-bold">{value}</p>
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

  return (
    <span className={`inline-block px-2 py-1 text-xs rounded-full ${colorClass}`}>
      {label}
    </span>
  );
}

function formatDate(date: Date | null): string {
  if (!date) return "Unknown";
  return new Date(date).toLocaleDateString();
}

function formatDuration(seconds: number | null): string {
  if (!seconds) return "Unknown";
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
}