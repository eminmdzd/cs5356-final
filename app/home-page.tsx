"use client"

import Link from "next/link"
import { Button } from "@/components/ui/button"
import { useSession } from "@/lib/use-session"

export function HomePage() {
  const { session, loading } = useSession();

  return (
    <main className="flex flex-col items-center justify-center min-h-screen p-6 text-center">
      <h1 className="text-5xl font-bold tracking-tight mb-6">
        Convert PDFs to Audiobooks
      </h1>
      <p className="text-xl mb-8 max-w-2xl mx-auto text-muted-foreground">
        Upload your PDF documents and convert them to audiobooks using advanced text-to-speech technology.
      </p>
      <div className="flex gap-4">
        {loading ? (
          <div className="h-12 w-52 animate-pulse rounded-md bg-muted"></div>
        ) : session ? (
          <>
            <Link href="/dashboard">
              <Button size="lg">Go to Dashboard</Button>
            </Link>
            <Link href="/upload">
              <Button size="lg" variant="outline">Upload PDF</Button>
            </Link>
          </>
        ) : (
          <>
            <Link href="/auth/sign-in">
              <Button size="lg">Sign In</Button>
            </Link>
            <Link href="/auth/sign-up">
              <Button size="lg" variant="outline">Sign Up</Button>
            </Link>
          </>
        )}
      </div>
      <div className="mt-16 grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto">
        <FeatureCard 
          title="Easy Upload" 
          description="Simply upload your PDF files through our intuitive interface."
        />
        <FeatureCard 
          title="High-Quality Audio" 
          description="Experience natural-sounding voice with proper intonation and pronunciation."
        />
        <FeatureCard 
          title="Listen Anywhere" 
          description="Download your audiobooks or stream them directly from our platform."
        />
      </div>
    </main>
  )
}

function FeatureCard({ title, description }: { title: string; description: string }) {
  return (
    <div className="p-6 border rounded-lg bg-card">
      <h3 className="text-xl font-semibold mb-3">{title}</h3>
      <p className="text-muted-foreground">{description}</p>
    </div>
  )
}