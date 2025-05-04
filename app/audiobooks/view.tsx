"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { AudiobookCard } from "@/components/audiobook-card"
import { Audiobook } from "@/database/schema"
import { Pdf } from "@/database/schema"

interface PaginationResponse {
  audiobooks: (Audiobook & { pdf: Pdf })[]
  pagination: {
    page: number
    limit: number
    totalCount: number
    totalPages: number
    hasNextPage: boolean
    hasPrevPage: boolean
  }
}

export function AudiobooksContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<PaginationResponse | null>(null)
  
  const currentPage = parseInt(searchParams.get("page") || "1", 10)
  
  // Function to handle optimistic refreshes
  const refreshData = async () => {
    try {
      const response = await fetch(`/api/audiobooks?page=${currentPage}&limit=10`)
      if (!response.ok) throw new Error("Failed to fetch audiobooks")
      const newData = await response.json()
      setData(newData)
    } catch (error) {
      console.error("Error refreshing audiobooks:", error)
    }
  }
  
  // Handle optimistic title updates
  const handleOptimisticTitleUpdate = (event: CustomEvent) => {
    if (!data) return
    
    const { id, title } = event.detail
    
    // Update the title in the local data
    const updatedAudiobooks = data.audiobooks.map(book => 
      book.id === id ? { ...book, title } : book
    )
    
    setData({
      ...data,
      audiobooks: updatedAudiobooks
    })
  }
  
  // Handle optimistic deletion
  const handleOptimisticDelete = (event: CustomEvent) => {
    if (!data) return
    
    const { id } = event.detail
    
    // Filter out the deleted audiobook
    const updatedAudiobooks = data.audiobooks.filter(book => book.id !== id)
    
    // Update pagination counts
    const updatedPagination = {
      ...data.pagination,
      totalCount: data.pagination.totalCount - 1,
      // Recalculate total pages
      totalPages: Math.ceil((data.pagination.totalCount - 1) / data.pagination.limit),
      // Update hasNextPage if needed
      hasNextPage: currentPage < Math.ceil((data.pagination.totalCount - 1) / data.pagination.limit)
    }
    
    setData({
      audiobooks: updatedAudiobooks,
      pagination: updatedPagination
    })
    
    // If we've deleted all items on this page and it's not the first page, go to previous page
    if (updatedAudiobooks.length === 0 && currentPage > 1) {
      router.push(`/audiobooks?page=${currentPage - 1}`)
    }
  }
  
  // Set up event listeners for optimistic updates
  useEffect(() => {
    // Set up global custom refresh method
    (window as any).__refreshAudiobooks = refreshData
    
    // Listen for optimistic update events
    window.addEventListener('optimistic-title-update', handleOptimisticTitleUpdate as EventListener)
    window.addEventListener('optimistic-delete', handleOptimisticDelete as EventListener)
    window.addEventListener('revalidate-audiobooks', refreshData as EventListener)
    
    return () => {
      // Clean up event listeners
      delete (window as any).__refreshAudiobooks
      window.removeEventListener('optimistic-title-update', handleOptimisticTitleUpdate as EventListener)
      window.removeEventListener('optimistic-delete', handleOptimisticDelete as EventListener)
      window.removeEventListener('revalidate-audiobooks', refreshData as EventListener)
    }
  }, [data, currentPage])
  
  // Fetch initial data
  useEffect(() => {
    async function fetchAudiobooks() {
      setLoading(true)
      try {
        const response = await fetch(`/api/audiobooks?page=${currentPage}&limit=10`)
        if (!response.ok) throw new Error("Failed to fetch audiobooks")
        const data = await response.json()
        setData(data)
      } catch (error) {
        console.error("Error fetching audiobooks:", error)
      } finally {
        setLoading(false)
      }
    }
    
    fetchAudiobooks()
  }, [currentPage])
  
  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold">My Audiobooks</h1>
          <Link href="/upload">
            <Button>Upload New PDF</Button>
          </Link>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="bg-card rounded-lg p-4 border shadow-sm animate-pulse">
              <div className="h-5 w-2/3 bg-muted rounded mb-3"></div>
              <div className="h-4 w-1/2 bg-muted rounded mb-6"></div>
              <div className="flex justify-between items-center">
                <div className="h-4 w-1/4 bg-muted rounded"></div>
                <div className="h-8 w-24 bg-muted rounded"></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }
  
  const audiobooks = data?.audiobooks || []
  const pagination = data?.pagination
  
  function handleChangePage(newPage: number) {
    router.push(`/audiobooks?page=${newPage}`)
  }
  
  return (
    <>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">My Audiobooks</h1>
        <Link href="/upload">
          <Button>Upload New PDF</Button>
        </Link>
      </div>

      {audiobooks.length > 0 ? (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
            {audiobooks.map((book) => (
              <AudiobookCard key={book.id} audiobook={book} />
            ))}
          </div>
          
          {pagination && pagination.totalPages > 1 && (
            <div className="flex justify-center items-center space-x-2 mt-8">
              <Button 
                variant="outline" 
                disabled={!pagination.hasPrevPage}
                onClick={() => handleChangePage(pagination.page - 1)}
              >
                Previous
              </Button>
              
              <div className="text-sm">
                Page {pagination.page} of {pagination.totalPages}
              </div>
              
              <Button 
                variant="outline" 
                disabled={!pagination.hasNextPage}
                onClick={() => handleChangePage(pagination.page + 1)}
              >
                Next
              </Button>
            </div>
          )}
        </>
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