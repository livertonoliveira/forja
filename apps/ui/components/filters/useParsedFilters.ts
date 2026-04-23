'use client'

import { useQueryState, parseAsString, parseAsIsoDate, parseAsArrayOf } from 'nuqs'

export function useParsedFilters() {
  const [q, setQ] = useQueryState('q', parseAsString.withDefault(''))
  const [from, setFrom] = useQueryState('from', parseAsIsoDate)
  const [to, setTo] = useQueryState('to', parseAsIsoDate)
  const [gate, setGate] = useQueryState('gate', parseAsArrayOf(parseAsString).withDefault([]))

  return { q, setQ, from, setFrom, to, setTo, gate, setGate }
}
