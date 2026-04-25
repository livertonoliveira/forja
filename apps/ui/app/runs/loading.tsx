import { Skeleton, SkeletonChart, SkeletonRow } from '@/components/ui/skeleton';

export default function Loading() {
  return (
    <div>
      <Skeleton className="h-7 w-32 mb-6" />

      <section className="mb-8">
        <Skeleton className="h-4 w-24 mb-4" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <SkeletonChart delay={0} height={268} />
          <SkeletonChart delay={100} height={268} />
        </div>
      </section>

      <Skeleton className="h-10 w-full mb-4 rounded-lg" />

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-forja-border-default">
              {Array.from({ length: 8 }).map((_, i) => (
                <th key={i} className="pb-3 pr-6 text-left">
                  <Skeleton className="h-4 w-16" />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 8 }).map((_, i) => (
              <SkeletonRow key={i} delay={i * 100} columns={8} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
