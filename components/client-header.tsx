"use client"

import Link from "next/link"
import { Button } from "@/components/ui/button"
import { UserButton } from "@daveyplate/better-auth-ui"
import { useSession } from "@/lib/use-session"

export function ClientHeader() {
  const { session, loading } = useSession()

  return (
    <header className="sticky top-0 z-50 px-4 py-3 border-b bg-background/60 backdrop-blur">
      <div className="container mx-auto flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/" className="flex items-center gap-2 font-bold text-lg">
            Audiobook Generator
          </Link>
          {session && (
            <nav className="flex items-center gap-2">
              <Link href="/dashboard">
                <Button variant="ghost">Dashboard</Button>
              </Link>
              <Link href="/upload">
                <Button variant="ghost">Upload PDF</Button>
              </Link>
              <Link href="/audiobooks">
                <Button variant="ghost">My Audiobooks</Button>
              </Link>
              {session.user?.role === "admin" && (
                <Link href="/admin">
                  <Button variant="ghost">Admin</Button>
                </Link>
              )}
            </nav>
          )}
        </div>

        <UserButton size="full" />
      </div>
    </header>
  )
}