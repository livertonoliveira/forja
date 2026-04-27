'use client'

import React, { useState } from 'react'
import { toast } from 'sonner'
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { useI18n } from '@/lib/i18n-context'
import { DLQEventRow } from './DLQEventRow'
import type { DLQEvent } from './PayloadModal'

interface DLQClientProps {
  initialEvents: DLQEvent[]
  totalCount: number
  currentStatus?: string
  currentHookType?: string
}

export function DLQClient({
  initialEvents,
  totalCount,
  currentStatus,
  currentHookType,
}: DLQClientProps) {
  const { t } = useI18n()
  const [events, setEvents] = useState<DLQEvent[]>(initialEvents)
  const [loading, setLoading] = useState(false)
  const offset = events.length
  const hasMore = offset < totalCount

  function handleStatusChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const val = e.target.value
    const params = new URLSearchParams(window.location.search)
    if (val) {
      params.set('status', val)
    } else {
      params.delete('status')
    }
    window.location.href = `${window.location.pathname}?${params.toString()}`
  }

  function handleHookTypeChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const val = e.target.value
    const params = new URLSearchParams(window.location.search)
    if (val) {
      params.set('hookType', val)
    } else {
      params.delete('hookType')
    }
    window.location.href = `${window.location.pathname}?${params.toString()}`
  }

  function handleUpdate(id: string, status: DLQEvent['status']) {
    setEvents((prev) =>
      prev.map((ev) => (ev.id === id ? { ...ev, status } : ev))
    )
  }

  async function loadMore() {
    if (loading) return
    setLoading(true)
    try {
      const params = new URLSearchParams()
      params.set('limit', '50')
      params.set('offset', String(offset))
      if (currentStatus) params.set('status', currentStatus)
      if (currentHookType) params.set('hookType', currentHookType)

      const res = await fetch(`/api/dlq?${params.toString()}`)
      if (!res.ok) throw new Error(t.dlq.load_error)
      const data: { events: DLQEvent[] } = await res.json()
      setEvents((prev) => [...prev, ...data.events])
    } catch {
      toast.error(t.dlq.load_error)
    } finally {
      setLoading(false)
    }
  }

  const hookTypes = Array.from(new Set(events.map((e) => e.hookType))).sort()

  if (events.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <p className="text-forja-text-primary font-medium">{t.dlq.no_events}</p>
        <p className="text-forja-text-muted text-sm mt-1">{t.dlq.no_events_desc}</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <select
          aria-label={t.dlq.filters.all_statuses}
          value={currentStatus ?? ''}
          onChange={handleStatusChange}
          className="h-8 rounded-md border border-forja-border-default bg-forja-bg-surface text-forja-text-primary text-sm px-3 focus:outline-none focus:ring-1 focus:ring-forja-border-gold"
        >
          <option value="">{t.dlq.filters.all_statuses}</option>
          <option value="dead">{t.dlq.status.dead}</option>
          <option value="reprocessed">{t.dlq.status.reprocessed}</option>
          <option value="ignored">{t.dlq.status.ignored}</option>
        </select>

        <select
          aria-label={t.dlq.filters.all_types}
          value={currentHookType ?? ''}
          onChange={handleHookTypeChange}
          className="h-8 rounded-md border border-forja-border-default bg-forja-bg-surface text-forja-text-primary text-sm px-3 focus:outline-none focus:ring-1 focus:ring-forja-border-gold"
        >
          <option value="">{t.dlq.filters.all_types}</option>
          {hookTypes.map((ht) => (
            <option key={ht} value={ht}>
              {ht}
            </option>
          ))}
        </select>
      </div>

      <Table>
        <TableHeader>
          <TableRow className="border-b border-forja-border-default hover:bg-transparent">
            <TableHead>{t.dlq.columns.type}</TableHead>
            <TableHead>{t.dlq.columns.status}</TableHead>
            <TableHead>{t.dlq.columns.attempts}</TableHead>
            <TableHead>{t.dlq.columns.last_error}</TableHead>
            <TableHead>{t.dlq.columns.date}</TableHead>
            <TableHead>{t.dlq.columns.actions}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {events.map((event) => (
            <DLQEventRow key={event.id} event={event} onUpdate={handleUpdate} />
          ))}
        </TableBody>
      </Table>

      {hasMore && (
        <div className="flex justify-center pt-2">
          <Button
            variant="ghost"
            size="sm"
            disabled={loading}
            onClick={loadMore}
          >
            {loading ? `${t.dlq.load_more}…` : t.dlq.load_more}
          </Button>
        </div>
      )}
    </div>
  )
}
