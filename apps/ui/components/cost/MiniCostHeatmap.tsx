'use client';

import { useState, useMemo } from 'react';
import type { HeatmapCell } from '@/lib/forja-store';

const DAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const CELL_W = 22;
const CELL_H = 9;
const CELL_GAP = 1;
const LABEL_COL_W = 28;
const LABEL_ROW_H = 18;

function interpolate(t: number): string {
  // black (#0A0A0A) → gold (#C9A84C)
  const r = Math.round(10 + (201 - 10) * t);
  const g = Math.round(10 + (168 - 10) * t);
  const b = Math.round(10 + (76 - 10) * t);
  return `rgb(${r},${g},${b})`;
}

interface TooltipState {
  x: number;
  y: number;
  dow: number;
  hour: number;
  avgCost: number;
  count: number;
}

interface MiniCostHeatmapProps {
  data: HeatmapCell[];
}

export function MiniCostHeatmap({ data }: MiniCostHeatmapProps) {
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);

  const cellMap = useMemo(() => {
    const map = new Map<string, HeatmapCell>();
    for (const c of data) map.set(`${c.dow}-${c.hour}`, c);
    return map;
  }, [data]);

  const maxCost = useMemo(
    () => data.reduce((max, c) => (c.avgCost > max ? c.avgCost : max), 0.000001),
    [data]
  );

  const totalW = LABEL_COL_W + 7 * (CELL_W + CELL_GAP) - CELL_GAP;
  const totalH = LABEL_ROW_H + 24 * (CELL_H + CELL_GAP) - CELL_GAP;

  return (
    <div className="relative inline-block">
      <svg
        width={totalW}
        height={totalH}
        style={{ overflow: 'visible' }}
        onMouseLeave={() => setTooltip(null)}
      >
        {/* Day column labels */}
        {DAYS.map((day, d) => (
          <text
            key={d}
            x={LABEL_COL_W + d * (CELL_W + CELL_GAP) + CELL_W / 2}
            y={LABEL_ROW_H - 4}
            textAnchor="middle"
            fill="#888888"
            fontSize={9}
          >
            {day}
          </text>
        ))}

        {/* Hour rows */}
        {Array.from({ length: 24 }, (_, h) => {
          const y = LABEL_ROW_H + h * (CELL_H + CELL_GAP);
          return (
            <g key={h}>
              {h % 6 === 0 && (
                <text
                  x={LABEL_COL_W - 4}
                  y={y + CELL_H / 2 + 3}
                  textAnchor="end"
                  fill="#888888"
                  fontSize={8}
                >
                  {h.toString().padStart(2, '0')}h
                </text>
              )}
              {DAYS.map((_, d) => {
                const cell = cellMap.get(`${d}-${h}`);
                const t = cell ? Math.min(cell.avgCost / maxCost, 1) : 0;
                return (
                  <rect
                    key={d}
                    x={LABEL_COL_W + d * (CELL_W + CELL_GAP)}
                    y={y}
                    width={CELL_W}
                    height={CELL_H}
                    rx={1}
                    fill={t > 0 ? interpolate(t) : '#0A0A0A'}
                    opacity={t > 0 ? 1 : 0.15}
                    style={{ cursor: cell ? 'crosshair' : 'default' }}
                    onMouseEnter={(e) => {
                      if (cell) {
                        setTooltip({
                          x: e.clientX,
                          y: e.clientY,
                          dow: d,
                          hour: h,
                          avgCost: cell.avgCost,
                          count: cell.count,
                        });
                      } else {
                        setTooltip(null);
                      }
                    }}
                  />
                );
              })}
            </g>
          );
        })}
      </svg>

      {tooltip && (
        <div
          className="fixed z-50 pointer-events-none px-3 py-2 rounded text-xs"
          style={{
            left: tooltip.x + 14,
            top: tooltip.y - 10,
            background: 'rgba(248,248,248,0.97)',
            border: '1px solid #C9A84C',
            boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
            color: '#0A0A0A',
          }}
        >
          <div className="font-semibold mb-1" style={{ color: '#A67C21' }}>
            {DAYS[tooltip.dow]} {tooltip.hour.toString().padStart(2, '0')}:00
          </div>
          <div className="font-mono">avg ${tooltip.avgCost.toFixed(4)}</div>
          <div style={{ color: '#888' }}>
            {tooltip.count} evento{tooltip.count !== 1 ? 's' : ''}
          </div>
        </div>
      )}
    </div>
  );
}
