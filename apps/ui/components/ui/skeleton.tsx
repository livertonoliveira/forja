import * as React from "react"
import { cn } from "@/lib/utils"

function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-busy="true"
      className={cn(
        "rounded-md bg-forja-bg-elevated animate-shimmer",
        "bg-[length:200%_100%]",
        "bg-[linear-gradient(90deg,transparent_25%,rgba(201,168,76,0.08)_50%,transparent_75%)]",
        className
      )}
      {...props}
    />
  )
}

function SkeletonRow({ delay = 0, columns = 6 }: { delay?: number; columns?: number }) {
  return (
    <tr
      aria-hidden="true"
      className="animate-fade-in-up border-b border-forja-border-subtle"
      style={{ animationDelay: `${delay}ms`, animationFillMode: 'both' }}
    >
      {Array.from({ length: columns }).map((_, i) => (
        <td key={i} className="py-3 pr-6">
          <Skeleton
            className="h-4 w-full"
            style={{ animationDelay: `${delay + i * 100}ms` }}
          />
        </td>
      ))}
    </tr>
  );
}

function SkeletonCard({ delay = 0, className }: { delay?: number; className?: string }) {
  return (
    <div
      className={cn(
        'bg-forja-bg-surface border border-forja-border-subtle rounded-lg p-4 space-y-3 animate-fade-in-up',
        className
      )}
      style={{ animationDelay: `${delay}ms`, animationFillMode: 'both' }}
      aria-hidden="true"
    >
      <Skeleton className="h-5 w-1/3" style={{ animationDelay: `${delay}ms` }} />
      <Skeleton className="h-4 w-2/3" style={{ animationDelay: `${delay + 100}ms` }} />
      <Skeleton className="h-4 w-1/2" style={{ animationDelay: `${delay + 200}ms` }} />
    </div>
  );
}

function SkeletonChart({ delay = 0, height = 240, className }: { delay?: number; height?: number; className?: string }) {
  return (
    <div
      className={cn(
        'bg-forja-bg-surface border border-forja-border-subtle rounded-lg p-4 animate-fade-in-up',
        className
      )}
      style={{ animationDelay: `${delay}ms`, animationFillMode: 'both' }}
      aria-hidden="true"
    >
      <Skeleton className="h-5 w-1/4 mb-4" style={{ animationDelay: `${delay}ms` }} />
      <Skeleton
        className="w-full"
        style={{ height: `${height}px`, animationDelay: `${delay + 100}ms` }}
      />
    </div>
  );
}

export { Skeleton, SkeletonRow, SkeletonCard, SkeletonChart }
