"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { AudiobookCard } from "@/components/audiobook-card";
import { Audiobook, Pdf } from "@/database/schema";

interface PaginatedAudiobooks {
  audiobooks: (Audiobook & { pdf: Pdf })[];
  pagination: {
    page: number;
    limit: number;
    totalCount: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
  };
}

export default function AudiobooksPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<PaginatedAudiobooks | null>(null);
  
  const currentPageParam = searchParams.get("page");
  let currentPage = currentPageParam ? parseInt(currentPageParam, 10) : 1;
  // Ensure page is at least 1
  if (currentPage < 1) currentPage = 1;
  
  useEffect(() => {
    async function fetchAudiobooks() {
      setLoading(true);
      try {
        const response = await fetch(`/api/audiobooks?page=${currentPage}&limit=10`);
        if (!response.ok) {
          throw new Error("Failed to fetch audiobooks");
        }
        const data = await response.json();
        setData(data);
      } catch (error) {
        console.error("Error fetching audiobooks:", error);
      } finally {
        setLoading(false);
      }
    }
    
    fetchAudiobooks();
  }, [currentPage]);
  
  function navigateToPage(page: number) {
    router.push(`/audiobooks?page=${page}`);
  }
  
  if (loading) {
    return (
      <main className="container self-center p-8">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold">My Audiobooks</h1>
          <Link href="/upload">
            <Button>Upload New PDF</Button>
          </Link>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {Array.from({ length: 6 }).map((_, i) => (
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
      </main>
    );
  }
  
  const audiobooks = data?.audiobooks || [];
  const pagination = data?.pagination;
  
  return (
    <main className="container self-center p-8">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold">My Audiobooks</h1>
        <Link href="/upload">
          <Button>Upload New PDF</Button>
        </Link>
      </div>

      {audiobooks.length > 0 ? (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {audiobooks.map((book) => (
              <AudiobookCard key={book.id} audiobook={book} />
            ))}
          </div>
          
          {pagination && pagination.totalPages > 1 && (
            <div className="flex justify-center items-center space-x-2 mt-10">
              <Button 
                variant="outline" 
                disabled={!pagination.hasPrevPage}
                onClick={() => navigateToPage(pagination.page - 1)}
              >
                Previous
              </Button>
              
              <div className="text-sm px-4">
                Page {pagination.page} of {pagination.totalPages}
              </div>
              
              <Button 
                variant="outline" 
                disabled={!pagination.hasNextPage}
                onClick={() => navigateToPage(pagination.page + 1)}
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
    </main>
  );
}