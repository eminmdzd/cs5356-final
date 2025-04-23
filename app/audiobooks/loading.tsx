import { Skeleton } from "@/components/ui/skeleton"

export default function AudiobooksLoading() {
  return (
    <>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">My Audiobooks</h1>
        <Skeleton className="h-10 w-32" />
      </div>

      <div className="space-y-4">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="border rounded-lg p-4 bg-card">
            <div className="flex flex-col md:flex-row justify-between gap-4">
              <div>
                <Skeleton className="h-6 w-48 mb-2" />
                <Skeleton className="h-4 w-64 mb-2" />
                <Skeleton className="h-4 w-32" />
              </div>
              <div className="flex flex-col sm:flex-row gap-4 self-end md:self-center">
                <Skeleton className="h-10 w-[300px]" />
                <Skeleton className="h-10 w-24" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  )
} 