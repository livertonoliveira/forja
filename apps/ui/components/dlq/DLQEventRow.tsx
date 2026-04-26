'use client'

import React, { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { TableRow, TableCell } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useI18n } from '@/lib/i18n-context'
import { PayloadModal } from './PayloadModal'
import { statusVariant } from './utils'
import type { DLQEvent } from './PayloadModal'

export type { DLQEvent }

interface DLQEventRowProps {
  event: DLQEvent
  onUpdate: (id: string, status: DLQEvent['status']) => void
}

export function DLQEventRow({ event, onUpdate }: DLQEventRowProps) {
  const { t } = useI18n()
  const [reprocessing, setReprocessing] = useState(false)
  const [ignoring, setIgnoring] = useState(false)

  const actionTaken = event.status !== 'dead'

  async function handleReprocess(e: React.MouseEvent) {
    e.stopPropagation()
    setReprocessing(true)
    const prev = event.status
    onUpdate(event.id, 'dead')
    try {
      const res = await fetch(`/api/dlq/${event.id}/reprocess`, { method: 'POST' })
      if (!res.ok) throw new Error('failed')
    } catch {
      onUpdate(event.id, prev)
    } finally {
      setReprocessing(false)
    }
  }

  async function handleIgnore(e: React.MouseEvent) {
    e.stopPropagation()
    setIgnoring(true)
    const prev = event.status
    onUpdate(event.id, 'ignored')
    try {
      const res = await fetch(`/api/dlq/${event.id}/ignore`, { method: 'POST' })
      if (!res.ok) throw new Error('failed')
    } catch {
      onUpdate(event.id, prev)
    } finally {
      setIgnoring(false)
    }
  }

  const truncatedError = event.errorMessage
    ? event.errorMessage.length > 60
      ? event.errorMessage.slice(0, 60) + '…'
      : event.errorMessage
    : '—'

  const formattedDate = new Date(event.createdAt).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })

  return (
    <PayloadModal event={event}>
      <TableRow className="cursor-pointer">
        <TableCell className="font-mono text-forja-text-primary text-xs">
          {event.hookType}
        </TableCell>
        <TableCell>
          <Badge variant={statusVariant(event.status)}>{event.status}</Badge>
        </TableCell>
        <TableCell className="text-forja-text-secondary tabular-nums">
          {event.attempts}
        </TableCell>
        <TableCell className="text-forja-text-muted text-xs max-w-[200px] truncate">
          {truncatedError}
        </TableCell>
        <TableCell className="text-forja-text-muted text-xs whitespace-nowrap">
          {formattedDate}
        </TableCell>
        <TableCell>
          {!actionTaken && (
            <div
              className="flex items-center gap-2"
              onClick={(e) => e.stopPropagation()}
            >
              <Button
                variant="outline"
                size="sm"
                disabled={reprocessing || ignoring}
                onClick={handleReprocess}
              >
                {reprocessing ? (
                  <>
                    <Loader2 className="h-3 w-3 animate-spin mr-1.5" />
                    {t.dlq.actions.reprocessing}
                  </>
                ) : (
                  t.dlq.actions.reprocess
                )}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={reprocessing || ignoring}
                onClick={handleIgnore}
              >
                {ignoring ? (
                  <>
                    <Loader2 className="h-3 w-3 animate-spin mr-1.5" />
                    {t.dlq.actions.ignoring}
                  </>
                ) : (
                  t.dlq.actions.ignore
                )}
              </Button>
            </div>
          )}
        </TableCell>
      </TableRow>
    </PayloadModal>
  )
}
