import { Skeleton, SkeletonCard, SkeletonRow } from '@/components/ui/skeleton';

export default function Loading() {
  return (
    <div className="space-y-10">
      <div>
        <Skeleton className="h-7 w-20 mb-2" />
        <Skeleton className="h-4 w-64" />
      </div>

      <SkeletonCard delay={0} className="max-w-[200px]" />

      <div>
        <Skeleton className="h-5 w-56 mb-4" />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-forja-border-default">
                {Array.from({ length: 5 }).map((_, i) => (
                  <th key={i} className="pb-3 pr-6 text-left">
                    <Skeleton className="h-4 w-16" />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 5 }).map((_, i) => (
                <SkeletonRow key={i} delay={i * 100} columns={5} />
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <Skeleton className="h-5 w-36 mb-4" />
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-3 animate-fade-in-up"
              style={{ animationDelay: `${i * 100}ms`, animationFillMode: 'both' }}
            >
              <Skeleton className="h-5 w-32 shrink-0" />
              <Skeleton className="h-5 flex-1" />
              <Skeleton className="h-5 w-24 shrink-0" />
            </div>
          ))}
        </div>
      </div>

      <div>
        <Skeleton className="h-5 w-32 mb-4" />
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-3 animate-fade-in-up"
              style={{ animationDelay: `${(i + 4) * 100}ms`, animationFillMode: 'both' }}
            >
              <Skeleton className="h-5 w-32 shrink-0" />
              <Skeleton className="h-5 flex-1" />
              <Skeleton className="h-5 w-24 shrink-0" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
