import type { DLQEvent } from './PayloadModal'

export function statusVariant(status: DLQEvent['status']): 'fail' | 'pass' | 'unknown' {
  if (status === 'dead') return 'fail'
  if (status === 'reprocessed') return 'pass'
  return 'unknown'
}
