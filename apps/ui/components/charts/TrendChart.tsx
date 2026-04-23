'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { Skeleton } from '@/components/ui/skeleton';
import type { TrendMetric, TrendGranularity, TrendBucket } from '@/lib/forja-store';
import { formatBucket, GranularityToggle } from './chart-utils';

export interface LineConfig {
  dataKey: string;
  stroke: string;
  name: string;
}

interface TrendChartProps {
  metric: TrendMetric;
  lines: LineConfig[];
  title: string;
  className?: string;
}

function csvEscape(value: unknown): string {
  const str = value == null ? '' : String(value);
  if (/[",\n\r]/.test(str) || /^[=+\-@\t\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function exportCSV(data: TrendBucket[], lines: LineConfig[], granularity: TrendGranularity) {
  const keys = ['bucket', ...lines.map((l) => l.dataKey)];
  const headers = keys.map(csvEscape).join(',');
  const rows = data
    .map((d) => keys.map((k) => csvEscape((d as Record<string, unknown>)[k])).join(','))
    .join('\n');
  const blob = new Blob([headers + '\n' + rows], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `trend-${granularity}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 100);
}

interface TooltipEntry {
  dataKey?: string;
  value?: number | null;
  color?: string;
  name?: string;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: TooltipEntry[];
  label?: string;
  data: TrendBucket[];
  lines: LineConfig[];
  granularity: TrendGranularity;
  labelIndexMap: Map<string, number>;
}

function CustomTooltip({ active, payload, label, data, lines, labelIndexMap }: CustomTooltipProps) {
  if (!active || !payload || !payload.length) return null;

  const currentIndex = label != null ? (labelIndexMap.get(label) ?? -1) : -1;

  return (
    <div
      style={{
        background: 'rgba(240,240,240,0.9)',
        backdropFilter: 'blur(8px)',
        border: '1px solid #C9A84C',
        borderRadius: 8,
        padding: 12,
      }}
    >
      <p style={{ margin: '0 0 8px', fontWeight: 600, color: '#222' }}>{label}</p>
      {payload.map((entry: TooltipEntry) => {
        const lineConfig = lines.find((l) => l.dataKey === entry.dataKey);
        const name = lineConfig?.name ?? entry.dataKey ?? '';
        const currentValue = entry.value;

        let variation = '—';
        if (currentIndex > 0 && currentValue != null) {
          for (let i = currentIndex - 1; i >= 0; i--) {
            const prevValue = (data[i] as Record<string, unknown>)[entry.dataKey as string];
            if (prevValue != null && typeof prevValue === 'number' && prevValue !== 0) {
              const pct = (((currentValue - prevValue) / prevValue) * 100).toFixed(1);
              variation = Number(pct) >= 0 ? `+${pct}%` : `${pct}%`;
              break;
            }
          }
        }

        const variationColor = variation === '—'
          ? '#888'
          : variation.startsWith('+') ? '#4CAF50' : '#F44336';

        return (
          <div key={entry.dataKey} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: entry.color, display: 'inline-block' }} />
            <span style={{ color: '#333', fontSize: 12 }}>
              {name}: <strong>{currentValue ?? '—'}</strong>
            </span>
            <span style={{ color: variationColor, fontSize: 11 }}>{variation}</span>
          </div>
        );
      })}
    </div>
  );
}

export function TrendChart({ metric, lines, title, className }: TrendChartProps) {
  const [granularity, setGranularity] = useState<TrendGranularity>('day');
  const [data, setData] = useState<TrendBucket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(false);

    fetch(`/api/trend?metric=${metric}&granularity=${granularity}`, { signal: controller.signal })
      .then((res) => res.json())
      .then((json: TrendBucket[]) => {
        setData(json);
        setLoading(false);
      })
      .catch((err) => {
        if (err.name !== 'AbortError') {
          setError(true);
          setLoading(false);
        }
      });

    return () => controller.abort();
  }, [metric, granularity]);

  const formattedData = useMemo(
    () => data.map((d) => ({
      ...d,
      _label: formatBucket((d as Record<string, unknown>)['bucket'] as string, granularity),
    })),
    [data, granularity]
  );

  const labelIndexMap = useMemo(
    () => new Map(formattedData.map((d, i) => [d._label, i])),
    [formattedData]
  );

  const renderTooltip = useCallback(
    (props: object) => (
      <CustomTooltip
        {...(props as CustomTooltipProps)}
        data={data}
        lines={lines}
        granularity={granularity}
        labelIndexMap={labelIndexMap}
      />
    ),
    [data, lines, granularity, labelIndexMap]
  );

  return (
    <div className={`flex flex-col gap-3 ${className ?? ''}`}>
      <div className="flex items-center justify-between">
        <span className="text-forja-text-primary font-semibold text-sm">{title}</span>
        <div className="flex items-center gap-2">
          <GranularityToggle value={granularity} onChange={setGranularity} />
          <button
            onClick={() => exportCSV(data, lines, granularity)}
            className="px-2.5 py-1 text-xs border border-forja-border-subtle text-forja-text-muted rounded hover:border-forja-border-gold transition-colors"
          >
            Exportar CSV
          </button>
        </div>
      </div>

      {loading ? (
        <Skeleton className="h-[300px] w-full" />
      ) : error ? (
        <div className="h-[300px] flex items-center justify-center text-forja-text-muted text-sm">
          Falha ao carregar dados.
        </div>
      ) : formattedData.length === 0 ? (
        <div className="h-[300px] flex items-center justify-center text-forja-text-muted text-sm">
          Sem dados para o período selecionado.
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={formattedData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="#2A2A2A" strokeDasharray="3 3" />
            <XAxis dataKey="_label" tick={{ fill: '#A0A0A0', fontSize: 11 }} />
            <YAxis tick={{ fill: '#A0A0A0', fontSize: 11 }} />
            <Tooltip content={renderTooltip} />
            <Legend wrapperStyle={{ fontSize: 12, color: '#A0A0A0' }} />
            {lines.map((line) => (
              <Line
                key={line.dataKey}
                type="monotone"
                dataKey={line.dataKey}
                stroke={line.stroke}
                strokeWidth={2}
                name={line.name}
                connectNulls={false}
                dot={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
