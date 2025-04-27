"use client"

import Link from "next/link"
import { Button } from "@/components/ui/button"
import { UserButton } from "@daveyplate/better-auth-ui"
import { authClient } from "@/lib/auth-client"
import { useState } from "react"
import { Menu, X } from "lucide-react"

export function Header() {
  const { data: session, isPending } = authClient.useSession()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  const toggleMenu = () => {
    setMobileMenuOpen(!mobileMenuOpen)
  }

  return (
    <header className="sticky top-0 z-50 px-4 py-3 border-b bg-background/60 backdrop-blur">
      <div className="container mx-auto flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/" className="flex items-center gap-2 font-bold text-lg">
            Audiobook Generator
          </Link>
          
          {/* Desktop Navigation */}
          {session?.user && !isPending && (
            <nav className="hidden md:flex items-center gap-2">
              <Link href="/dashboard">
                <Button variant="ghost">Dashboard</Button>
              </Link>
              <Link href="/upload">
                <Button variant="ghost">Upload PDF</Button>
              </Link>
              <Link href="/audiobooks">
                <Button variant="ghost">My Audiobooks</Button>
              </Link>
              {session?.user?.role === "admin" && (
                <Link href="/admin">
                  <Button variant="ghost">Admin</Button>
                </Link>
              )}
            </nav>
          )}
        </div>

        {/* Right side: auth buttons or user button */}
        <div className="flex items-center gap-2">
          {isPending ? (
            <div className="h-9 w-24 animate-pulse rounded-md bg-muted"></div>
          ) : session?.user ? (
            <>
              <UserButton size="full" />
              {/* Mobile menu button - only on smaller screens */}
              <Button 
                variant="ghost" 
                size="icon" 
                className="md:hidden"
                onClick={toggleMenu}
              >
                {mobileMenuOpen ? (
                  <X className="h-5 w-5" />
                ) : (
                  <Menu className="h-5 w-5" />
                )}
              </Button>
            </>
          ) : (
            <>
              {/* Auth buttons for medium screens and up */}
              <div className="flex items-center gap-2">
                {/* Full buttons on medium screens and up */}
                <div className="hidden md:flex items-center gap-2">
                  <Link href="/auth/sign-in">
                    <Button variant="outline">Sign In</Button>
                  </Link>
                  <Link href="/auth/sign-up">
                    <Button>Sign Up</Button>
                  </Link>
                </div>
                
                {/* Hamburger menu on smaller screens */}
                <Button 
                  variant="ghost" 
                  size="icon"
                  className="md:hidden"
                  onClick={toggleMenu}
                >
                  {mobileMenuOpen ? (
                    <X className="h-5 w-5" />
                  ) : (
                    <Menu className="h-5 w-5" />
                  )}
                </Button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Mobile Navigation Dropdown */}
      {mobileMenuOpen && (
        <div className="md:hidden container mx-auto mt-2 pb-2 border-t pt-2">
          <nav className="flex flex-col space-y-2">
            {session?.user ? (
              <>
                <Link href="/dashboard" onClick={() => setMobileMenuOpen(false)}>
                  <Button variant="ghost" className="w-full justify-start">Dashboard</Button>
                </Link>
                <Link href="/upload" onClick={() => setMobileMenuOpen(false)}>
                  <Button variant="ghost" className="w-full justify-start">Upload PDF</Button>
                </Link>
                <Link href="/audiobooks" onClick={() => setMobileMenuOpen(false)}>
                  <Button variant="ghost" className="w-full justify-start">My Audiobooks</Button>
                </Link>
                {session?.user?.role === "admin" && (
                  <Link href="/admin" onClick={() => setMobileMenuOpen(false)}>
                    <Button variant="ghost" className="w-full justify-start">Admin</Button>
                  </Link>
                )}
              </>
            ) : (
              <>
                <Link href="/auth/sign-in" onClick={() => setMobileMenuOpen(false)}>
                  <Button variant="ghost" className="w-full justify-start">Sign In</Button>
                </Link>
                <Link href="/auth/sign-up" onClick={() => setMobileMenuOpen(false)}>
                  <Button variant="ghost" className="w-full justify-start">Sign Up</Button>
                </Link>
              </>
            )}
          </nav>
        </div>
      )}
    </header>
  )
}