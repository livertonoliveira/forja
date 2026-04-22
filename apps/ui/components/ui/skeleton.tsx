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

export { Skeleton }
