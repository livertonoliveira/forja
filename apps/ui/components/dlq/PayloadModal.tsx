'use client'

import React, { useState, useMemo } from 'react'
import { toast } from 'sonner'
import { Copy, X } from 'lucide-react'
import {
  Sheet,
  SheetTrigger,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetClose,
} from '@/components/ui/sheet'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useI18n } from '@/lib/i18n-context'
import { statusVariant } from './utils'

export interface DLQEvent {
  id: string
  hookType: string
  payload: unknown
  errorMessage: string | null
  attempts: number
  lastAttemptAt: string | null
  createdAt: string
  status: 'dead' | 'reprocessed' | 'ignored'
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function syntaxHighlight(json: unknown): string {
  const str = JSON.stringify(json, null, 2)
  const escaped = escapeHtml(str)

  return escaped.replace(
    /(&quot;)(.*?)(&quot;)(\s*:)?|(\b\d+\.?\d*\b)|(\btrue\b|\bfalse\b)|(\bnull\b)/g,
    (match, q1, key, q3, colon, number, bool, nullVal) => {
      if (colon) {
        return `<span class="text-[#fcd34d]">${q1}${key}${q3}</span>${colon}`
      }
      if (q1) {
        return `<span class="text-[#86efac]">${q1}${key}${q3}</span>`
      }
      if (number !== undefined) {
        return `<span class="text-[#67e8f9]">${number}</span>`
      }
      if (bool !== undefined) {
        return `<span class="text-[#93c5fd]">${bool}</span>`
      }
      if (nullVal !== undefined) {
        return `<span class="text-forja-text-muted">${nullVal}</span>`
      }
      return match
    }
  )
}

interface PayloadModalProps {
  event: DLQEvent
  children: React.ReactNode
}

export function PayloadModal({ event, children }: PayloadModalProps) {
  const { t } = useI18n()
  const [copyLabel, setCopyLabel] = useState<string>(t.dlq.actions.copy)

  const jsonString = useMemo(
    () => JSON.stringify(event.payload, null, 2),
    [event.payload]
  )
  const highlighted = useMemo(
    () => syntaxHighlight(event.payload),
    [event.payload]
  )

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(jsonString)
      setCopyLabel(t.dlq.actions.copied)
      toast.success(t.dlq.actions.copied, { duration: 1500 })
      setTimeout(() => setCopyLabel(t.dlq.actions.copy), 1500)
    } catch {
      // Clipboard API not available — silently ignore
    }
  }

  return (
    <Sheet>
      <SheetTrigger asChild>{children}</SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{t.dlq.modal.title}</SheetTitle>
          <div className="flex items-center gap-2 mt-1">
            <span className="font-mono text-xs text-forja-text-secondary">{event.hookType}</span>
            <Badge variant={statusVariant(event.status)}>{event.status}</Badge>
          </div>
        </SheetHeader>

        <div className="flex flex-col gap-4 h-[calc(100%-120px)]">
          <pre
            className="font-mono text-xs bg-forja-bg-base rounded p-4 overflow-auto max-h-[60vh] leading-relaxed"
            dangerouslySetInnerHTML={{ __html: highlighted }}
          />

          <div className="flex items-center justify-between mt-auto pt-4 border-t border-forja-border-subtle">
            <Button variant="outline" size="sm" onClick={handleCopy}>
              <Copy className="h-3.5 w-3.5 mr-1.5" />
              {copyLabel}
            </Button>
            <SheetClose asChild>
              <Button variant="ghost" size="sm">
                <X className="h-3.5 w-3.5 mr-1.5" />
                {t.dlq.actions.close}
              </Button>
            </SheetClose>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
