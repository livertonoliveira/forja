'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import type { RunPhase } from '@/lib/types';
import { formatMs } from '@/lib/format';
import { gateDarkBgColors } from '@/lib/ui-constants';

interface Props {
  phases: RunPhase[];
  runStart: string;
  runEnd: string | null;
}

interface PhaseWithMs extends RunPhase {
  startMs: number;
  endMs: number;
}

function packIntervals(phases: RunPhase[]): PhaseWithMs[][] {
  const withMs: PhaseWithMs[] = phases.map((p) => {
    const s = new Date(p.startedAt).getTime();
    return { ...p, startMs: s, endMs: p.finishedAt ? new Date(p.finishedAt).getTime() : s + 1 };
  });
  const sorted = withMs.sort((a, b) => a.startMs - b.startMs);
  const rows: PhaseWithMs[][] = [];
  for (const phase of sorted) {
    let placed = false;
    for (const row of rows) {
      const ok = row.every((x) => phase.endMs <= x.startMs || phase.startMs >= x.endMs);
      if (ok) {
        row.push(phase);
        placed = true;
        break;
      }
    }
    if (!placed) rows.push([phase]);
  }
  return rows;
}

function formatRelMs(ms: number): string {
  if (ms < 60_000) return `+${Math.round(ms / 1000)}s`;
  const m = Math.floor(ms / 60_000);
  const s = Math.round((ms % 60_000) / 1000);
  return s > 0 ? `+${m}m ${s}s` : `+${m}m`;
}

export default function RunGantt({ phases, runStart, runEnd }: Props) {
  const [hovered, setHovered] = useState<string | null>(null);
  const [scale, setScale] = useState(1);
  const t = useTranslations('gantt');

  const runStartMs = useMemo(() => new Date(runStart).getTime(), [runStart]);

  const totalMs = useMemo(() => {
    if (runEnd) return Math.max(new Date(runEnd).getTime() - runStartMs, 1);
    const latest = phases.reduce((max, p) => {
      const t = p.finishedAt
        ? new Date(p.finishedAt).getTime()
        : new Date(p.startedAt).getTime();
      return Math.max(max, t);
    }, runStartMs);
    return Math.max(latest - runStartMs, 1);
  }, [runEnd, runStartMs, phases]);

  const rows = useMemo(() => packIntervals(phases), [phases]);

  const ticks = useMemo(() => {
    const count = 6;
    return Array.from({ length: count + 1 }, (_, i) => ({
      ms: (totalMs / count) * i,
    }));
  }, [totalMs]);

  if (phases.length === 0) {
    return <p className="text-forja-text-muted text-sm">{t('no_phases')}</p>;
  }

  return (
    <div className="rounded-lg border border-forja-border-subtle bg-[#0A0A0A] p-4">
      <div className="flex items-center justify-end gap-2 mb-4">
        <span className="text-[10px] text-forja-text-muted">{t('zoom')}</span>
        <button
          onClick={() => setScale((s) => Math.min(s * 1.5, 8))}
          className="w-6 h-6 flex items-center justify-center border border-forja-border-default rounded text-xs text-forja-text-secondary hover:border-forja-border-gold hover:text-forja-text-gold transition-colors"
        >
          +
        </button>
        <span className="text-[10px] text-forja-text-muted w-8 text-center font-mono">
          {scale.toFixed(1)}×
        </span>
        <button
          onClick={() => setScale((s) => Math.max(s / 1.5, 0.25))}
          className="w-6 h-6 flex items-center justify-center border border-forja-border-default rounded text-xs text-forja-text-secondary hover:border-forja-border-gold hover:text-forja-text-gold transition-colors"
        >
          −
        </button>
        <button
          onClick={() => setScale(1)}
          className="px-2 h-6 border border-forja-border-default rounded text-[10px] text-forja-text-muted hover:text-forja-text-secondary transition-colors"
        >
          {t('reset')}
        </button>
      </div>

      <div className="overflow-x-auto" style={{ paddingBottom: '120px' }}>
        <div style={{ width: `${Math.max(scale * 100, 100)}%`, minWidth: 400 }}>
          {/* X-axis */}
          <div className="relative h-7 mb-1">
            <div className="absolute bottom-0 left-0 right-0 h-px bg-forja-border-subtle" />
            {ticks.map((tick, i) => {
              const left = (tick.ms / totalMs) * 100;
              return (
                <div
                  key={i}
                  className="absolute top-0 flex flex-col items-center"
                  style={{ left: `${left}%` }}
                >
                  <div className="h-2 w-px bg-forja-border-subtle" />
                  <span className="text-[9px] font-mono text-forja-text-muted -translate-x-1/2 mt-0.5 whitespace-nowrap">
                    {formatRelMs(tick.ms)}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Phase rows */}
          {rows.map((row, rowIdx) => (
            <div key={rowIdx} className="relative h-11">
              {row.map((phase) => {
                const startOffMs = phase.startMs - runStartMs;
                const endOffMs = phase.finishedAt ? phase.endMs - runStartMs : totalMs;
                const durMs = Math.max(endOffMs - startOffMs, 0);

                const leftPct = (startOffMs / totalMs) * 100;
                const widthPct = (durMs / totalMs) * 100;
                const gateColor = phase.gate ? gateDarkBgColors[phase.gate] : undefined;
                const isHov = hovered === phase.phase;
                const tooltipRight = leftPct > 60;

                return (
                  <div
                    key={phase.phase}
                    className="absolute top-1.5"
                    style={{ left: `${leftPct}%` }}
                  >
                    <div
                      className="relative h-8 rounded-sm cursor-pointer flex items-center select-none bg-gold-gradient"
                      style={{
                        width: `${widthPct}%`,
                        minWidth: '8px',
                        opacity: isHov ? 0.8 : 1,
                        boxShadow: isHov ? '0 0 12px rgba(201,168,76,0.5)' : undefined,
                        transition: 'opacity 0.1s, box-shadow 0.1s',
                      }}
                      onMouseEnter={() => setHovered(phase.phase)}
                      onMouseLeave={() => setHovered(null)}
                    >
                      {widthPct >= 1 && (
                        <span className="px-2 text-[10px] font-medium text-[#0A0A0A] truncate leading-none flex-1">
                          {phase.phase}
                        </span>
                      )}
                      {gateColor && (
                        <div
                          className="absolute right-1 w-3 h-3 rounded-[2px] shrink-0"
                          style={{
                            backgroundColor: gateColor,
                            top: '50%',
                            transform: 'translateY(-50%)',
                          }}
                        />
                      )}
                    </div>

                    {isHov && (
                      <div
                        className="absolute top-10 z-30 w-52 bg-[#111111] border border-forja-border-default rounded-lg p-3 shadow-2xl text-xs pointer-events-none"
                        style={tooltipRight ? { right: 0 } : { left: 0 }}
                      >
                        <p className="font-semibold text-forja-text-primary mb-2 truncate">
                          {phase.phase}
                        </p>
                        <dl className="space-y-1">
                          <div className="flex justify-between gap-4">
                            <dt className="text-forja-text-muted">{t('start')}</dt>
                            <dd className="text-forja-text-secondary font-mono">
                              {formatRelMs(startOffMs)}
                            </dd>
                          </div>
                          <div className="flex justify-between gap-4">
                            <dt className="text-forja-text-muted">{t('end')}</dt>
                            <dd className="text-forja-text-secondary font-mono">
                              {formatRelMs(endOffMs)}
                            </dd>
                          </div>
                          <div className="flex justify-between gap-4">
                            <dt className="text-forja-text-muted">{t('duration')}</dt>
                            <dd className="text-forja-text-secondary font-mono">
                              {formatMs(durMs)}
                            </dd>
                          </div>
                          {gateColor && phase.gate && (
                            <div className="flex justify-between gap-4">
                              <dt className="text-forja-text-muted">{t('gate')}</dt>
                              <dd className="font-semibold" style={{ color: gateColor }}>
                                {phase.gate}
                              </dd>
                            </div>
                          )}
                        </dl>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
