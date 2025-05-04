"use client"

import Link from "next/link"
import { Button } from "@/components/ui/button"
import { UserButton } from "@daveyplate/better-auth-ui"
import { authClient } from "@/lib/auth-client"
import { useState } from "react"
import { Menu, X } from "lucide-react"
import { usePathname } from "next/navigation"

export function Header() {
  const { data: session, isPending } = authClient.useSession()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const pathname = usePathname()

  const isActive = (path: string) => {
    // Check if current path exactly matches or starts with the given path
    // (but avoid matching root path with others)
    if (path === "/") {
      return pathname === "/"
    }
    return pathname === path || pathname.startsWith(`${path}/`)
  }

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
                <Button 
                  variant={isActive("/dashboard") ? "default" : "ghost"}
                  className={isActive("/dashboard") ? "bg-primary/10 text-primary hover:bg-primary/20" : ""}
                >
                  Dashboard
                </Button>
              </Link>
              <Link href="/upload">
                <Button 
                  variant={isActive("/upload") ? "default" : "ghost"}
                  className={isActive("/upload") ? "bg-primary/10 text-primary hover:bg-primary/20" : ""}
                >
                  Upload PDF
                </Button>
              </Link>
              <Link href="/audiobooks">
                <Button 
                  variant={isActive("/audiobooks") ? "default" : "ghost"} 
                  className={isActive("/audiobooks") ? "bg-primary/10 text-primary hover:bg-primary/20" : ""}
                >
                  My Audiobooks
                </Button>
              </Link>
              {session?.user?.role === "admin" && (
                <Link href="/admin">
                  <Button 
                    variant={isActive("/admin") ? "default" : "ghost"}
                    className={isActive("/admin") ? "bg-primary/10 text-primary hover:bg-primary/20" : ""}
                  >
                    Admin
                  </Button>
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
                  <Button 
                    variant={isActive("/dashboard") ? "default" : "ghost"} 
                    className={`w-full justify-start ${isActive("/dashboard") ? "bg-primary/10 text-primary hover:bg-primary/20" : ""}`}
                  >
                    Dashboard
                  </Button>
                </Link>
                <Link href="/upload" onClick={() => setMobileMenuOpen(false)}>
                  <Button 
                    variant={isActive("/upload") ? "default" : "ghost"} 
                    className={`w-full justify-start ${isActive("/upload") ? "bg-primary/10 text-primary hover:bg-primary/20" : ""}`}
                  >
                    Upload PDF
                  </Button>
                </Link>
                <Link href="/audiobooks" onClick={() => setMobileMenuOpen(false)}>
                  <Button 
                    variant={isActive("/audiobooks") ? "default" : "ghost"} 
                    className={`w-full justify-start ${isActive("/audiobooks") ? "bg-primary/10 text-primary hover:bg-primary/20" : ""}`}
                  >
                    My Audiobooks
                  </Button>
                </Link>
                {session?.user?.role === "admin" && (
                  <Link href="/admin" onClick={() => setMobileMenuOpen(false)}>
                    <Button 
                      variant={isActive("/admin") ? "default" : "ghost"} 
                      className={`w-full justify-start ${isActive("/admin") ? "bg-primary/10 text-primary hover:bg-primary/20" : ""}`}
                    >
                      Admin
                    </Button>
                  </Link>
                )}
              </>
            ) : (
              <>
                <Link href="/auth/sign-in" onClick={() => setMobileMenuOpen(false)}>
                  <Button 
                    variant={isActive("/auth/sign-in") ? "default" : "ghost"} 
                    className={`w-full justify-start ${isActive("/auth/sign-in") ? "bg-primary/10 text-primary hover:bg-primary/20" : ""}`}
                  >
                    Sign In
                  </Button>
                </Link>
                <Link href="/auth/sign-up" onClick={() => setMobileMenuOpen(false)}>
                  <Button 
                    variant={isActive("/auth/sign-up") ? "default" : "ghost"} 
                    className={`w-full justify-start ${isActive("/auth/sign-up") ? "bg-primary/10 text-primary hover:bg-primary/20" : ""}`}
                  >
                    Sign Up
                  </Button>
                </Link>
              </>
            )}
          </nav>
        </div>
      )}
    </header>
  )
}