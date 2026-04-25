import { Skeleton, SkeletonRow } from '@/components/ui/skeleton';

export default function Loading() {
  return (
    <div>
      <div className="mb-6">
        <Skeleton className="h-7 w-28 mb-2" />
        <Skeleton className="h-4 w-48" />
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-forja-border-default">
              {Array.from({ length: 7 }).map((_, i) => (
                <th key={i} className="pb-3 pr-6 text-left">
                  <Skeleton className="h-4 w-16" />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 5 }).map((_, i) => (
              <SkeletonRow key={i} delay={i * 100} columns={7} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
