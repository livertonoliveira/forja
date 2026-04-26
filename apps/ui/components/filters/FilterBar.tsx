'use client'

import * as React from 'react'
import { useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useParsedFilters } from './useParsedFilters'

type GateVariant = 'pass' | 'warn' | 'fail'

const GATE_OPTIONS: { value: GateVariant; label: string }[] = [
  { value: 'pass', label: 'Pass' },
  { value: 'warn', label: 'Warn' },
  { value: 'fail', label: 'Fail' },
]

function toDateInputValue(date: Date | null): string {
  if (!date) return ''
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function fromDateInputValue(value: string): Date | null {
  if (!value) return null
  const [y, m, d] = value.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

export function FilterBar() {
  const { q, setQ, from, setFrom, to, setTo, gate, setGate } = useParsedFilters()
  const t = useTranslations('filters')

  const [localQ, setLocalQ] = React.useState(q)
  const debounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)

  React.useEffect(() => {
    setLocalQ(q)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [q])

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setLocalQ(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setQ(value || null)
    }, 300)
  }

  const applyToday = () => {
    const now = new Date()
    setFrom(startOfDay(now))
    setTo(startOfDay(now))
  }

  const applyLast7Days = () => {
    const now = new Date()
    const past = new Date(now)
    past.setDate(past.getDate() - 6)
    setFrom(startOfDay(past))
    setTo(startOfDay(now))
  }

  const applyLast30Days = () => {
    const now = new Date()
    const past = new Date(now)
    past.setDate(past.getDate() - 29)
    setFrom(startOfDay(past))
    setTo(startOfDay(now))
  }

  const handleFromChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFrom(fromDateInputValue(e.target.value))
  }

  const handleToChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setTo(fromDateInputValue(e.target.value))
  }

  const toggleGate = (value: GateVariant) => {
    const next = gate.includes(value)
      ? gate.filter((g) => g !== value)
      : [...gate, value]
    setGate(next.length > 0 ? next : null)
  }

  const hasAnyFilter =
    (q !== '') || from !== null || to !== null || gate.length > 0

  const resetAll = () => {
    setLocalQ('')
    setQ(null)
    setFrom(null)
    setTo(null)
    setGate(null)
  }

  const inputBase =
    'h-8 rounded-md border border-forja-border-subtle bg-forja-bg-surface px-3 text-xs text-forja-text-primary placeholder:text-forja-text-muted focus:outline-none focus:border-forja-border-default'

  const presetBase =
    'h-8 rounded-md border border-forja-border-subtle bg-forja-bg-surface px-3 text-xs text-forja-text-secondary hover:border-forja-border-default hover:text-forja-text-primary transition-colors'

  return (
    <div className="flex flex-col gap-3 mb-6">
      <div className="flex items-center gap-2 flex-wrap">
        <input
          type="text"
          placeholder={t('search_placeholder')}
          value={localQ}
          onChange={handleSearchChange}
          className={cn(inputBase, 'w-64')}
        />

        <button onClick={applyToday} className={presetBase}>
          {t('today')}
        </button>
        <button onClick={applyLast7Days} className={presetBase}>
          7d
        </button>
        <button onClick={applyLast30Days} className={presetBase}>
          30d
        </button>

        <input
          type="date"
          value={toDateInputValue(from)}
          onChange={handleFromChange}
          className={inputBase}
        />
        <input
          type="date"
          value={toDateInputValue(to)}
          onChange={handleToChange}
          className={inputBase}
        />
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        {GATE_OPTIONS.map(({ value, label }) => {
          const isActive = gate.includes(value)
          return (
            <button
              key={value}
              onClick={() => toggleGate(value)}
              aria-pressed={isActive}
              className={cn(
                'flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-all',
                isActive
                  ? 'bg-forja-bg-overlay border-forja-border-gold text-forja-text-gold'
                  : 'bg-forja-bg-surface border-forja-border-subtle text-forja-text-secondary hover:border-forja-border-default hover:text-forja-text-primary'
              )}
            >
              <Badge variant={value} className="px-1 py-0 text-[10px] leading-none">
                {value[0].toUpperCase()}
              </Badge>
              {label}
            </button>
          )
        })}

        {hasAnyFilter && (
          <Button variant="ghost" size="sm" onClick={resetAll}>
            {t('reset')}
          </Button>
        )}
      </div>
    </div>
  )
}
