import { Skeleton, SkeletonRow } from '@/components/ui/skeleton';

export default function Loading() {
  return (
    <div>
      <Skeleton className="h-7 w-48 mb-6" />
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-forja-border-default">
              {Array.from({ length: 6 }, (_, i) => i).map((col) => (
                <th key={col} className="pb-3 pr-6 text-left">
                  <Skeleton className="h-4 w-16" />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 6 }).map((_, i) => (
              <SkeletonRow key={i} delay={i * 100} columns={6} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
