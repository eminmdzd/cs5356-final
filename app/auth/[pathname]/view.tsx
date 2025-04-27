"use client"

import { AuthCard } from "@daveyplate/better-auth-ui"
import { useRouter } from "next/navigation"
import { useEffect } from "react"

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

      <AuthCard
        pathname={pathname}
        classNames={{
          base: "py-4 w-1/2",
          settings: {
            card: {
              base: "p-4 rounded-md",
              cell: "rounded-md justify-start",
              button: "ml-auto justify-self-end",
              footer: "bg-card",
            },
            tabs: {
              list: "flex gap-2",
            }
          },
        }}
      />
    </main>
  )
}