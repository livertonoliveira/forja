import { DLQClient } from '@/components/dlq/DLQClient'
import type { DLQEvent } from '@/components/dlq/PayloadModal'

export const dynamic = 'force-dynamic'

const VALID_STATUSES = new Set(['dead', 'reprocessed', 'ignored'])

interface DLQPageProps {
  searchParams: { status?: string; hookType?: string }
}

async function getDLQEvents(
  status?: string,
  hookType?: string
): Promise<{ events: DLQEvent[]; total: number }> {
  try {
    const base = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:4242'
    const params = new URLSearchParams()
    params.set('limit', '50')
    if (status && VALID_STATUSES.has(status)) params.set('status', status)
    if (hookType) params.set('hookType', hookType)

    const res = await fetch(`${base}/api/dlq?${params.toString()}`, {
      cache: 'no-store',
    })
    if (!res.ok) return { events: [], total: 0 }
    const data: { events: DLQEvent[]; total: number } = await res.json()
    return data
  } catch {
    return { events: [], total: 0 }
  }
}

export default async function DLQPage({ searchParams }: DLQPageProps) {
  const status = searchParams.status && VALID_STATUSES.has(searchParams.status)
    ? searchParams.status
    : undefined
  const hookType = searchParams.hookType || undefined

  const { events, total } = await getDLQEvents(status, hookType)

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-forja-text-primary">
          Dead Letter Queue
        </h1>
        <p className="text-forja-text-secondary text-sm mt-1">
          Dead webhook events &mdash; {total} total
        </p>
      </div>

      <DLQClient
        initialEvents={events}
        totalCount={total}
        currentStatus={status}
        currentHookType={hookType}
      />
    </div>
  )
}
