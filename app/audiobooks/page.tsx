import { headers } from "next/headers"
import Link from "next/link"
import { Suspense } from "react"
import { auth } from "@/lib/auth"
import { db } from "@/database/db"
import { audiobooks as audiobooksTable } from "@/database/schema"
import { desc, eq } from "drizzle-orm"
import { Button } from "@/components/ui/button"
import { deleteAudiobook, generateAudiobook, updateAudiobookTitle } from "@/actions/audiobook"
import { AudiobookItem } from "@/components/audiobook-item"
import AudiobooksLoading from "./loading"

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
        <div className="space-y-4">
          {audiobooks.map((book) => (
            <AudiobookItem
              key={book.id}
              audiobook={book}
              deleteAction={deleteAudiobook}
              generateAction={generateAudiobook}
              updateTitleAction={updateAudiobookTitle}
            />
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