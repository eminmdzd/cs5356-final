"use client"
 
import { AuthCard } from "@daveyplate/better-auth-ui"
import { useRouter } from "next/navigation"
import { useEffect } from "react"
import { PasswordEnhancer } from "./password-enhancer"
 
export function AuthView({
    pathname
}: {
    pathname: string
}) {
    const router = useRouter()
 
    useEffect(() => {
        // Clear router cache (protected routes)
        router.refresh()
    }, [router])
 
    return (
        <main className="flex flex-col grow p-4 items-center justify-center">
            {/* Password enhancer injects the eye icon into password fields */}
            <PasswordEnhancer />
            
            <AuthCard
              pathname={pathname}
              classNames={{
                settings: {
                  card: {
                    base: "p-4 rounded-md",
                    cell: "rounded-md justify-start",
                    button: "ml-auto justify-self-end" 
                  },
                  tabs: {
                    list: "gap-2",
                  }
                },
                inputs: {
                  // Use custom styling for password inputs 
                  password: "pr-10 relative"
                }
              }}
            />
        </main>
    )
}