'use client';

import type { TrendGranularity } from '@/lib/forja-store';
import { useTranslations } from 'next-intl';

export const GRANULARITIES: TrendGranularity[] = ['hour', 'day', 'week', 'month'];

/** Static English labels — kept for backward compatibility with tests and non-i18n contexts. */
export const GRANULARITY_LABELS: Record<TrendGranularity, string> = {
  hour: 'hour',
  day: 'day',
  week: 'week',
  month: 'month',
};

export function formatBucket(bucket: string, granularity: TrendGranularity): string {
  const d = new Date(bucket);
  if (granularity === 'hour') {
    return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

interface GranularityToggleProps {
  value: TrendGranularity;
  onChange: (g: TrendGranularity) => void;
}

export function GranularityToggle({ value, onChange }: GranularityToggleProps) {
  const t = useTranslations('gantt.granularity');
  return (
    <div className="flex gap-1">
      {GRANULARITIES.map((g) => (
        <button
          key={g}
          onClick={() => onChange(g)}
          className={[
            'px-2.5 py-1 text-xs rounded border transition-colors',
            g === value
              ? 'border-forja-border-gold text-forja-text-gold bg-forja-bg-elevated'
              : 'border-forja-border-subtle text-forja-text-muted hover:border-forja-border-gold',
          ].join(' ')}
        >
          {t(g)}
        </button>
      ))}
    </div>
  );
}
