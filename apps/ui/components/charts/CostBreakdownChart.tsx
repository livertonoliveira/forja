'use client';

import { useMemo } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import type { BreakdownRow } from '@/lib/forja-store';

const COLORS = {
  Input: '#C9A84C',
  Output: '#E2C97E',
  Cache: '#8B6914',
} as const;

interface TooltipEntry {
  name?: string;
  value?: number;
  color?: string;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: TooltipEntry[];
  label?: string;
}

function CustomTooltip({ active, payload, label }: CustomTooltipProps) {
  if (!active || !payload?.length) return null;
  const total = payload.reduce((s, p) => s + (p.value ?? 0), 0);
  return (
    <div
      style={{
        background: 'rgba(248,248,248,0.97)',
        border: '1px solid #C9A84C',
        borderRadius: 8,
        padding: '10px 14px',
        boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
      }}
    >
      <p style={{ margin: '0 0 6px', fontWeight: 600, color: '#0A0A0A', fontSize: 13 }}>{label}</p>
      {payload.map((p) => (
        <div
          key={p.name}
          style={{ display: 'flex', justifyContent: 'space-between', gap: 16, fontSize: 12, color: '#555', marginBottom: 2 }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: p.color, display: 'inline-block' }} />
            {p.name}
          </span>
          <span style={{ fontFamily: 'monospace', color: '#0A0A0A' }}>${(p.value ?? 0).toFixed(4)}</span>
        </div>
      ))}
      <div
        style={{
          borderTop: '1px solid #E8E8E8',
          marginTop: 6,
          paddingTop: 4,
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: 12,
        }}
      >
        <span style={{ color: '#888' }}>Total</span>
        <span style={{ fontFamily: 'monospace', color: '#A67C21', fontWeight: 600 }}>${total.toFixed(4)}</span>
      </div>
    </div>
  );
}

interface CostBreakdownChartProps {
  data: BreakdownRow[];
}

export function CostBreakdownChart({ data }: CostBreakdownChartProps) {
  const chartData = useMemo(
    () =>
      data.slice(0, 10).map((r) => {
        const hasBreakdown = r.inputCost > 0 || r.outputCost > 0 || r.cacheCost > 0;
        return {
          project: r.project.length > 14 ? r.project.slice(0, 14) + '…' : r.project,
          Input: hasBreakdown ? r.inputCost : r.totalCost,
          Output: hasBreakdown ? r.outputCost : 0,
          Cache: hasBreakdown ? r.cacheCost : 0,
        };
      }),
    [data]
  );

  if (data.length === 0) return null;

  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid stroke="#E8E8E8" strokeDasharray="3 3" />
        <XAxis dataKey="project" tick={{ fill: '#888888', fontSize: 11 }} />
        <YAxis
          tick={{ fill: '#888888', fontSize: 11 }}
          tickFormatter={(v: number) => `$${v.toFixed(3)}`}
        />
        <Tooltip content={<CustomTooltip />} />
        <Legend
          wrapperStyle={{ fontSize: 12, color: '#555555' }}
          formatter={(value: string) => <span style={{ color: '#555555' }}>{value}</span>}
        />
        <Bar dataKey="Input" stackId="a" fill={COLORS.Input} name="Input" />
        <Bar dataKey="Output" stackId="a" fill={COLORS.Output} name="Output" />
        <Bar dataKey="Cache" stackId="a" fill={COLORS.Cache} name="Cache" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
