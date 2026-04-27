import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center rounded px-2 py-0.5 font-mono text-xs font-semibold",
  {
    variants: {
      variant: {
        pass: "bg-forja-gate-pass-bg text-forja-gate-pass-text border border-forja-gate-pass-border",
        warn: "bg-forja-gate-warn-bg text-forja-gate-warn-text border border-forja-gate-warn-border",
        fail: "bg-forja-gate-fail-bg text-forja-gate-fail-text border border-forja-gate-fail-border",
        unknown: "bg-forja-gate-unknown-bg text-forja-gate-unknown-text border border-forja-gate-unknown-border",
        default: "bg-forja-bg-surface text-forja-text-secondary border border-forja-border-subtle",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

const GATE_VARIANTS = new Set(["pass", "warn", "fail", "unknown"])

const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, variant = "default", "aria-label": ariaLabel, ...props }, ref) => {
    const resolvedAriaLabel =
      ariaLabel ?? (variant && GATE_VARIANTS.has(variant) ? `gate: ${variant}` : undefined)

    const isGateVariant = variant && GATE_VARIANTS.has(variant)

    return (
      <span
        ref={ref}
        {...(isGateVariant ? { role: "status" } : {})}
        aria-label={resolvedAriaLabel}
        className={cn(badgeVariants({ variant }), className)}
        {...props}
      />
    )
  }
)
Badge.displayName = "Badge"

export { Badge, badgeVariants }
