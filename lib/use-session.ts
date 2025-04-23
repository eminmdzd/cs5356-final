"use client"

import { useState, useEffect } from 'react'
import { authClient } from './auth-client'
import type { Session } from '@daveyplate/auth-base'

export function useSession() {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true

    const loadSession = async () => {
      try {
        const currentSession = await authClient.getSession()
        if (mounted) {
          setSession(currentSession)
          setLoading(false)
        }
      } catch (error) {
        console.error('Error fetching session:', error)
        if (mounted) {
          setSession(null)
          setLoading(false)
        }
      }
    }

    loadSession()

    // Subscribe to session changes
    const unsubscribe = authClient.onSessionChange((newSession) => {
      if (mounted) {
        setSession(newSession)
        setLoading(false)
      }
    })

    return () => {
      mounted = false
      unsubscribe()
    }
  }, [])

  return { session, loading }
}