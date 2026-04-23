import * as React from 'react'
import { cn } from '@/lib/utils'
import { Skeleton } from './skeleton'

export interface DataPoint {
  label: string
  value: number
}

export interface TrendChartProps {
  data?: DataPoint[]
  loading?: boolean
  className?: string
}

const TrendChart = React.forwardRef<HTMLDivElement, TrendChartProps>(
  ({ data, loading, className }, ref) => {
    if (loading) {
      return (
        <Skeleton
          className={cn('h-40 w-full rounded-lg', className)}
          aria-label="Loading chart"
        />
      )
    }

    if (!data || data.length === 0) {
      return (
        <div
          ref={ref}
          className={cn(
            'h-40 w-full rounded-lg bg-forja-bg-surface border border-forja-border-subtle',
            'flex items-center justify-center',
            className
          )}
        >
          <p className="text-forja-text-muted text-sm">No data available</p>
        </div>
      )
    }

    const max = data.reduce((m, d) => (d.value > m ? d.value : m), 1)

    return (
      <div
        ref={ref}
        className={cn(
          'h-40 w-full rounded-lg bg-forja-bg-surface border border-forja-border-subtle p-4',
          className
        )}
      >
        <div className="flex items-end h-full gap-1">
          {data.map((point) => {
            const heightPct = (point.value / max) * 100
            const isGap = point.value === 0

            return (
              <div
                key={point.label}
                className="flex flex-col items-center flex-1 gap-1 h-full justify-end"
              >
                {isGap ? (
                  <div
                    className="w-full border-t border-dashed border-forja-border-default"
                    style={{ marginBottom: '2px' }}
                  />
                ) : (
                  <div
                    className="w-full rounded-sm bg-gold-gradient transition-all duration-300 min-h-[2px]"
                    style={{ height: `${heightPct}%` }}
                    title={`${point.label}: ${point.value}`}
                  />
                )}
                <span className="text-[9px] text-forja-text-muted truncate w-full text-center leading-none">
                  {point.label}
                </span>
              </div>
            )
          })}
        </div>
      </div>
    )
  }
)
TrendChart.displayName = 'TrendChart'

export { TrendChart }
