'use client';

import { useMemo, useState } from 'react';
import type { RunPhase } from '@/lib/types';
import { gateBgColors } from '@/lib/ui-constants';
import { formatMs } from '@/lib/format';

interface Props {
  phases: RunPhase[];
}

export default function RunGantt({ phases }: Props) {
  const [hovered, setHovered] = useState<string | null>(null);

  const augmented = useMemo(
    () =>
      phases.map((p) => ({
        ...p,
        durationMs: p.finishedAt
          ? new Date(p.finishedAt).getTime() - new Date(p.startedAt).getTime()
          : 0,
      })),
    [phases],
  );

  const total = useMemo(
    () => augmented.reduce((s, p) => s + p.durationMs, 0),
    [augmented],
  );

  if (phases.length === 0) {
    return <p className="text-gray-500 text-sm">Sem fases registradas.</p>;
  }

  return (
    <div className="space-y-3">
      {augmented.map((p) => {
        const pct = total > 0 ? (p.durationMs / total) * 100 : 100 / phases.length;
        const color = gateBgColors[p.gate ?? ''] ?? '#4b5563';
        const isActive = hovered === p.phase;

        return (
          <div key={p.phase} className="relative flex items-center gap-3">
            <span className="w-24 text-right text-xs text-gray-400 shrink-0 truncate" title={p.phase}>
              {p.phase}
            </span>
            <div className="flex-1 h-6 bg-gray-800 rounded">
              <div
                className="h-full rounded cursor-pointer transition-opacity"
                style={{
                  width: `${Math.max(pct, 0.5)}%`,
                  backgroundColor: color,
                  opacity: isActive ? 0.7 : 1,
                }}
                onMouseEnter={() => setHovered(p.phase)}
                onMouseLeave={() => setHovered(null)}
              />
            </div>
            <span className="w-16 text-xs text-gray-500 shrink-0">{formatMs(p.durationMs)}</span>
            {isActive && (
              <div className="absolute left-28 top-8 z-20 min-w-[200px] bg-gray-900 border border-gray-700 rounded-lg p-3 shadow-2xl text-xs text-gray-300 pointer-events-none">
                <p className="font-semibold text-white mb-2">{p.phase}</p>
                <dl className="space-y-1">
                  <div className="flex justify-between gap-6">
                    <dt className="text-gray-500">Duração</dt>
                    <dd>{formatMs(p.durationMs)}</dd>
                  </div>
                  <div className="flex justify-between gap-6">
                    <dt className="text-gray-500">Tokens in</dt>
                    <dd>{p.tokensIn.toLocaleString('pt-BR')}</dd>
                  </div>
                  <div className="flex justify-between gap-6">
                    <dt className="text-gray-500">Tokens out</dt>
                    <dd>{p.tokensOut.toLocaleString('pt-BR')}</dd>
                  </div>
                  <div className="flex justify-between gap-6">
                    <dt className="text-gray-500">Custo</dt>
                    <dd>${p.costUsd}</dd>
                  </div>
                  <div className="flex justify-between gap-6">
                    <dt className="text-gray-500">Gate</dt>
                    <dd style={{ color: gateBgColors[p.gate ?? ''] ?? '#6b7280' }}>{p.gate ?? '—'}</dd>
                  </div>
                </dl>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
