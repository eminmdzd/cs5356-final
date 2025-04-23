"use client"

import { useState, useEffect } from 'react'
import { authClient } from './auth-client'

// Define a common interface for session response type
interface SessionResponse {
  session: { 
    id: string;
    createdAt: Date;
    updatedAt: Date;
    userId: string;
    expiresAt: Date;
    token: string;
    ipAddress?: string | null;
    userAgent?: string | null;
  };
  user: {
    id: string;
    name?: string;
    email?: string;
    role?: string;
  };
}

// Define a type that works with the session structure your app expects
type SessionData = {
  session?: SessionResponse['session'] | null;
  user?: SessionResponse['user'] | null;
} | null;

export function useSession() {
  const [session, setSession] = useState<SessionData>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true

    const loadSession = async () => {
      try {
        const currentSession = await authClient.getSession()
        if (mounted) {
          // Make sure we're storing the data in the right format and handle possible Error objects
          if (currentSession && 
              typeof currentSession === 'object' &&
              'session' in currentSession && 
              'user' in currentSession) {
            
            // Use type assertion
            const typedSession = currentSession as SessionResponse;
            
            setSession({ 
              session: typedSession.session,
              user: typedSession.user
            })
          } else {
            setSession(null)
          }
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
        // Make sure we're storing the data in the right format and handle possible Error objects
        if (newSession && 
            typeof newSession === 'object' &&
            'session' in newSession && 
            'user' in newSession) {
            
          // Use type assertion
          const typedSession = newSession as SessionResponse;
            
          setSession({ 
            session: typedSession.session,
            user: typedSession.user
          })
        } else {
          setSession(null)
        }
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