export function formatMs(ms: number): string {
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

export function formatDuration(startedAt: string, finishedAt: string | null, fallback = '—'): string {
  if (!finishedAt) return fallback;
  return formatMs(new Date(finishedAt).getTime() - new Date(startedAt).getTime());
}
