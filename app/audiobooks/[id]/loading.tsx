import { Skeleton } from "@/components/ui/skeleton"

export default function AudiobookDetailsLoading() {
  return (
    <main className="container self-center p-8">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center gap-4 mb-6">
          <Skeleton className="h-10 w-32" />
          <Skeleton className="h-8 w-64" />
        </div>

        <div className="border rounded-lg p-6 bg-card space-y-6">
          <div>
            <h2 className="text-xl font-semibold mb-2">Details</h2>
            <div className="space-y-2">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-4 w-36" />
            </div>
          </div>

          <div>
            <h2 className="text-xl font-semibold mb-4">PDF Document</h2>
            <Skeleton className="h-[600px] w-full" />
          </div>

          <div>
            <h2 className="text-xl font-semibold mb-4">Audio</h2>
            <Skeleton className="h-16 w-full" />
          </div>
        </div>
      </div>
    </main>
  )
} 