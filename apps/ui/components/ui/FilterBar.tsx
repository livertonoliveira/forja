import * as React from 'react'
import { cn } from '@/lib/utils'
import { Badge } from './badge'
import { Button } from './button'

type GateVariant = 'pass' | 'warn' | 'fail' | 'unknown'

export interface FilterOption {
  label: string
  value: string
  variant?: GateVariant
}

export interface FilterBarProps {
  filters?: FilterOption[]
  activeFilters?: string[]
  onFilterChange?: (filters: string[]) => void
  onReset?: () => void
  className?: string
}

const FilterBar = React.forwardRef<HTMLDivElement, FilterBarProps>(
  (
    { filters = [], activeFilters = [], onFilterChange, onReset, className },
    ref
  ) => {
    const hasActive = activeFilters.length > 0
    const activeSet = new Set(activeFilters)

    const toggle = (value: string) => {
      const next = activeSet.has(value)
        ? activeFilters.filter((v) => v !== value)
        : [...activeFilters, value]
      onFilterChange?.(next)
    }

    return (
      <div ref={ref} className={cn('flex items-center gap-2 flex-wrap', className)}>
        {filters.map((filter) => {
          const isActive = activeSet.has(filter.value)
          return (
            <button
              key={filter.value}
              onClick={() => toggle(filter.value)}
              className={cn(
                'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all border',
                isActive
                  ? 'bg-forja-bg-overlay border-forja-border-gold text-forja-text-gold'
                  : 'bg-forja-bg-surface border-forja-border-subtle text-forja-text-secondary hover:border-forja-border-default hover:text-forja-text-primary'
              )}
              aria-pressed={isActive}
            >
              {filter.variant && (
                <Badge variant={filter.variant} className="px-1 py-0 text-[10px] leading-none">
                  {filter.variant[0]}
                </Badge>
              )}
              {filter.label}
            </button>
          )
        })}
        {hasActive && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onReset}
            className="text-xs h-7 px-2 text-forja-text-muted"
          >
            Reset
          </Button>
        )}
      </div>
    )
  }
)
FilterBar.displayName = 'FilterBar'

export { FilterBar }
