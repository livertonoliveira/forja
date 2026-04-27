'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useTranslations } from 'next-intl';

type Metric = 'runs' | 'critical_findings' | 'cost';

interface HeatmapCell {
  date: string;
  hour: number;
  value: number;
}

interface ApiResponse {
  cells: HeatmapCell[];
  max: number;
}

interface TooltipState {
  date: string;
  hour: number;
  value: number | null;
  clientX: number;
  clientY: number;
}

const CELL_SIZE = 12;
const CELL_GAP = 1;
const CELL_STEP = CELL_SIZE + CELL_GAP;

const COLOR_EMPTY = '#0A0A0A';
const COLOR_MAX_R = 226; // #E2C97E
const COLOR_MAX_G = 201;
const COLOR_MAX_B = 126;

function intensityToColor(value: number, max: number): string {
  if (max === 0) return COLOR_EMPTY;
  const t = Math.min(value / max, 1);
  const r = Math.round(10 + (COLOR_MAX_R - 10) * t);
  const g = Math.round(10 + (COLOR_MAX_G - 10) * t);
  const b = Math.round(10 + (COLOR_MAX_B - 10) * t);
  return `rgb(${r},${g},${b})`;
}

function getLast365Dates(): string[] {
  const dates: string[] = [];
  const today = new Date();
  for (let i = 364; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    dates.push(d.toISOString().split('T')[0]);
  }
  return dates;
}

function bucketEnd(date: string, hour: number): string {
  const d = new Date(`${date}T${String(hour).padStart(2, '0')}:00:00Z`);
  d.setUTCHours(d.getUTCHours() + 1);
  return d.toISOString().replace('.000Z', 'Z');
}

export default function HeatmapGrid() {
  const [metric, setMetric] = useState<Metric>('runs');
  const [project, _setProject] = useState('');
  const [data, setData] = useState<ApiResponse>({ cells: [], max: 0 });
  const [loading, setLoading] = useState(true);
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const t = useTranslations('heatmap');

  const METRIC_LABELS = useMemo((): Record<Metric, string> => ({
    runs: t('metrics.runs'),
    critical_findings: t('metrics.critical_findings'),
    cost: t('metrics.cost_usd'),
  }), [t]);

  const MONTH_ABBR = useMemo(() => [
    t('months.jan'), t('months.feb'), t('months.mar'), t('months.apr'),
    t('months.may'), t('months.jun'), t('months.jul'), t('months.aug'),
    t('months.sep'), t('months.oct'), t('months.nov'), t('months.dec'),
  ], [t]);

  useEffect(() => {
    setLoading(true);
    const controller = new AbortController();
    const params = new URLSearchParams({ metric });
    if (project) params.set('project', project);
    fetch(`/api/heatmap?${params.toString()}`, { signal: controller.signal })
      .then((r) => r.json())
      .then((d: ApiResponse) => setData(d))
      .catch((err) => { if (err.name !== 'AbortError') setData({ cells: [], max: 0 }); })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [metric, project]);

  const dates = useMemo(() => getLast365Dates(), []);

  const cellMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const cell of data.cells) {
      map.set(`${cell.date}:${cell.hour}`, cell.value);
    }
    return map;
  }, [data.cells]);

  const cells = useMemo(() => {
    const items: JSX.Element[] = [];
    for (let h = 0; h < 24; h++) {
      for (let col = 0; col < dates.length; col++) {
        const value = cellMap.get(`${dates[col]}:${h}`);
        const color = value != null ? intensityToColor(value, data.max) : COLOR_EMPTY;
        items.push(
          <div
            key={`${col}-${h}`}
            style={{ backgroundColor: color, width: CELL_SIZE, height: CELL_SIZE }}
          />
        );
      }
    }
    return items;
  }, [cellMap, data.max, dates]);

  const monthLabels = useMemo(() => {
    const labels: { label: string; colIndex: number }[] = [];
    let lastMonth = -1;
    for (let i = 0; i < dates.length; i++) {
      const month = new Date(dates[i]).getUTCMonth();
      if (month !== lastMonth) {
        labels.push({ label: MONTH_ABBR[month], colIndex: i });
        lastMonth = month;
      }
    }
    return labels;
  }, [dates, MONTH_ABBR]);

  const handleGridMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const col = Math.floor((e.clientX - rect.left) / CELL_STEP);
      const row = Math.floor((e.clientY - rect.top) / CELL_STEP);
      if (col >= 0 && col < dates.length && row >= 0 && row < 24) {
        const value = cellMap.get(`${dates[col]}:${row}`) ?? null;
        setTooltip({ date: dates[col], hour: row, value, clientX: e.clientX, clientY: e.clientY });
      } else {
        setTooltip(null);
      }
    },
    [dates, cellMap]
  );

  const handleGridMouseLeave = useCallback(() => setTooltip(null), []);

  const exportPNG = useCallback(() => {
    const Y_OFFSET = 36;
    const X_OFFSET = 20;
    const canvas = document.createElement('canvas');
    canvas.width = Y_OFFSET + dates.length * CELL_STEP;
    canvas.height = X_OFFSET + 24 * CELL_STEP;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = '#111111';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = '#888888';
    ctx.font = '10px monospace';
    for (const { label, colIndex } of monthLabels) {
      ctx.fillText(label, Y_OFFSET + colIndex * CELL_STEP, 14);
    }

    ctx.fillStyle = '#666666';
    ctx.font = '9px monospace';
    for (let h = 0; h < 24; h++) {
      if (h % 6 === 0) ctx.fillText(`${h}h`, 0, X_OFFSET + h * CELL_STEP + CELL_SIZE);
    }

    for (let col = 0; col < dates.length; col++) {
      for (let h = 0; h < 24; h++) {
        const value = cellMap.get(`${dates[col]}:${h}`) ?? null;
        ctx.fillStyle = value != null ? intensityToColor(value, data.max) : COLOR_EMPTY;
        ctx.fillRect(Y_OFFSET + col * CELL_STEP, X_OFFSET + h * CELL_STEP, CELL_SIZE, CELL_SIZE);
      }
    }

    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `heatmap-${metric}-${new Date().toISOString().split('T')[0]}.png`;
      a.click();
      URL.revokeObjectURL(url);
    });
  }, [dates, cellMap, data.max, metric, monthLabels]);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex gap-2">
          {(['runs', 'critical_findings', 'cost'] as Metric[]).map((m) => (
            <button
              key={m}
              onClick={() => setMetric(m)}
              className={
                metric === m
                  ? 'px-3 py-1.5 rounded text-sm bg-[#C9A84C] text-black font-semibold'
                  : 'px-3 py-1.5 rounded text-sm bg-gray-800 text-gray-400'
              }
            >
              {METRIC_LABELS[m]}
            </button>
          ))}
        </div>
        <button
          onClick={exportPNG}
          className="px-3 py-1.5 rounded text-sm bg-gray-800 text-gray-400 hover:text-gray-200"
        >
          {t('export_png')}
        </button>
      </div>

      {loading ? (
        <div className="text-sm text-gray-500 py-8 text-center">{t('loading')}</div>
      ) : (
        <div className="overflow-x-auto">
          <div className="ml-10 mb-1 relative h-4">
            {monthLabels.map(({ label, colIndex }) => (
              <span
                key={`${label}-${colIndex}`}
                className="absolute text-[10px] text-gray-500"
                style={{ left: colIndex * CELL_STEP }}
              >
                {label}
              </span>
            ))}
          </div>

          <div className="flex flex-row">
            <div
              className="w-8 grid"
              style={{ gridTemplateRows: `repeat(24, ${CELL_SIZE}px)`, gap: '1px' }}
            >
              {Array.from({ length: 24 }, (_, h) => (
                <div key={h} className="flex items-center justify-end pr-1">
                  {h % 6 === 0 && (
                    <span className="text-[9px] text-gray-600">{h}h</span>
                  )}
                </div>
              ))}
            </div>

            <div
              className="grid"
              style={{
                gridTemplateColumns: `repeat(${dates.length}, ${CELL_SIZE}px)`,
                gridAutoRows: `${CELL_SIZE}px`,
                gap: '1px',
              }}
              onMouseMove={handleGridMouseMove}
              onMouseLeave={handleGridMouseLeave}
            >
              {cells}
            </div>
          </div>
        </div>
      )}

      {tooltip && (
        <div
          className="fixed z-50 pointer-events-none bg-gray-900 border border-gray-700 rounded px-3 py-2 text-xs shadow-lg"
          style={{ left: tooltip.clientX, top: tooltip.clientY - 8, transform: 'translate(-50%, -100%)' }}
        >
          <div className="text-gray-300 font-medium">
            {tooltip.date} — {tooltip.hour}h
          </div>
          {tooltip.value != null ? (
            <>
              <div className="text-[#E2C97E]">
                {METRIC_LABELS[metric]}: {tooltip.value}
              </div>
              <a
                href={`/runs?from=${tooltip.date}T${String(tooltip.hour).padStart(2, '0')}:00:00Z&to=${bucketEnd(tooltip.date, tooltip.hour)}`}
                className="text-gray-500 hover:text-gray-300 underline"
                target="_blank"
                rel="noreferrer"
              >
                {t('view_runs')}
              </a>
            </>
          ) : (
            <div className="text-gray-600">{t('no_activity')}</div>
          )}
        </div>
      )}
    </div>
  );
}
