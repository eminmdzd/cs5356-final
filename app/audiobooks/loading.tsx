import { Skeleton } from "@/components/ui/skeleton"

export default function AudiobooksLoading() {
  return (
    <>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">My Audiobooks</h1>
        <Skeleton className="h-10 w-32" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="border rounded-lg overflow-hidden bg-card flex flex-col">
            <div className="p-4 flex-1">
              <div className="flex justify-between items-start mb-2">
                <Skeleton className="h-6 w-48" />
                <Skeleton className="h-8 w-8 rounded-full" />
              </div>
              <Skeleton className="h-4 w-32 mb-2" />
              <Skeleton className="h-5 w-20 mb-2" />
              <Skeleton className="h-4 w-24" />
            </div>
            <div className="p-4 pt-0 space-y-2">
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-full" />
            </div>
          </div>
        ))}
      </div>
    </>
  )
} 