import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="container-edge pt-6" aria-busy="true" aria-label="Loading table">
      <div className="mb-6 flex items-center justify-between border-b border-hairline pb-5"><Skeleton className="h-9 w-48" /><Skeleton className="h-9 w-32" /></div>
      <div className="grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)_320px] lg:gap-8">
        <div className="hidden space-y-3 lg:block"><Skeleton className="h-6 w-full" /><Skeleton className="h-24 w-full" /><Skeleton className="h-40 w-full" /></div>
        <div className="flex flex-col items-center gap-6"><Skeleton className="aspect-square w-full max-w-[520px] rounded-full" /><Skeleton className="h-48 w-full" /></div>
        <Skeleton className="h-80 w-full rounded-2xl" />
      </div>
    </div>
  );
}
