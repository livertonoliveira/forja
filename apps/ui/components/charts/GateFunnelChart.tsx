'use client';

import { useState, useEffect } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { Skeleton } from '@/components/ui/skeleton';
import type { TrendGranularity, GateBucket } from '@/lib/forja-store';
import { formatBucket, GranularityToggle } from './chart-utils';

interface GateFunnelChartProps {
  title?: string;
  className?: string;
}

export function GateFunnelChart({ title, className }: GateFunnelChartProps) {
  const [granularity, setGranularity] = useState<TrendGranularity>('day');
  const [data, setData] = useState<GateBucket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(false);

    fetch(`/api/trend?metric=gate_fail_rate&granularity=${granularity}`, { signal: controller.signal })
      .then((res) => res.json())
      .then((buckets: GateBucket[]) => {
        setData(buckets);
        setLoading(false);
      })
      .catch((err) => {
        if (err.name !== 'AbortError') {
          setError(true);
          setLoading(false);
        }
      });

    return () => controller.abort();
  }, [granularity]);

  const formatted = data.map((b) => ({
    ...b,
    bucket: formatBucket(b.bucket, granularity),
    pass: b.pass ?? 0,
    warn: b.warn ?? 0,
    fail: b.fail ?? 0,
  }));

  return (
    <div className={className}>
      <div className="flex items-center justify-between mb-3">
        {title && <span className="text-sm font-medium text-forja-text-primary">{title}</span>}
        <div className="ml-auto">
          <GranularityToggle value={granularity} onChange={setGranularity} />
        </div>
      </div>

      {loading ? (
        <Skeleton className="h-[300px] w-full" />
      ) : error ? (
        <div className="h-[300px] flex items-center justify-center text-forja-text-muted text-sm">
          Falha ao carregar dados.
        </div>
      ) : formatted.length === 0 ? (
        <div className="h-[300px] flex items-center justify-center text-forja-text-muted text-sm">
          Sem dados para o período selecionado.
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={formatted} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="#2A2A2A" strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="bucket" tick={{ fill: '#A0A0A0', fontSize: 11 }} />
            <YAxis tick={{ fill: '#A0A0A0', fontSize: 11 }} />
            <Tooltip
              contentStyle={{
                background: 'rgba(240,240,240,0.9)',
                backdropFilter: 'blur(8px)',
                border: '1px solid #C9A84C',
                borderRadius: 8,
              }}
            />
            <Legend />
            <Bar dataKey="pass" stackId="gate" fill="#16a34a" name="Pass" />
            <Bar dataKey="warn" stackId="gate" fill="#d97706" name="Warn" />
            <Bar dataKey="fail" stackId="gate" fill="#dc2626" name="Fail" />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
