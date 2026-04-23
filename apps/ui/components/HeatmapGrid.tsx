'use client';

import { useState, Fragment } from 'react';
import type { Finding } from '@/lib/types';

const SEVERITIES = ['critical', 'high', 'medium', 'low'] as const;
type Severity = (typeof SEVERITIES)[number];

const SEVERITY_COLORS: Record<Severity, string> = {
  critical: '239,68,68',
  high: '249,115,22',
  medium: '234,179,8',
  low: '59,130,246',
};

const SEVERITY_LABELS: Record<Severity, string> = {
  critical: 'Critical',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
};

interface HeatmapGridProps {
  findings: Finding[];
}

export default function HeatmapGrid({ findings }: HeatmapGridProps) {
  const [selected, setSelected] = useState<{ severity: Severity; category: string } | null>(null);

  const categories = Array.from(new Set(findings.map((f) => f.category))).sort();

  const matrix: Record<Severity, Record<string, Finding[]>> = {
    critical: {},
    high: {},
    medium: {},
    low: {},
  };
  for (const sev of SEVERITIES) {
    for (const cat of categories) {
      matrix[sev][cat] = [];
    }
  }
  for (const f of findings) {
    if (matrix[f.severity]?.[f.category] !== undefined) {
      matrix[f.severity][f.category].push(f);
    }
  }

  const maxCount = Math.max(
    1,
    ...SEVERITIES.flatMap((sev) => categories.map((cat) => matrix[sev][cat].length))
  );

  const selectedFindings = selected
    ? (matrix[selected.severity]?.[selected.category] ?? [])
    : [];

  if (categories.length === 0) {
    return <p className="text-gray-500 text-sm">Nenhum achado para exibir.</p>;
  }

  return (
    <div>
      <div className="overflow-x-auto">
        <div
          className="grid gap-1"
          style={{ gridTemplateColumns: `120px repeat(${categories.length}, minmax(80px, 1fr))` }}
        >
          <div />
          {categories.map((cat) => (
            <div
              key={cat}
              className="text-xs text-gray-400 font-medium text-center pb-2 truncate px-1"
              title={cat}
            >
              {cat}
            </div>
          ))}

          {SEVERITIES.map((sev) => (
            <Fragment key={sev}>
              <div className="text-xs font-medium text-gray-300 flex items-center pr-3 h-12">
                {SEVERITY_LABELS[sev]}
              </div>
              {categories.map((cat) => {
                const cellFindings = matrix[sev][cat];
                const count = cellFindings.length;
                const isSelected = selected?.severity === sev && selected?.category === cat;
                const opacity = count > 0 ? 0.2 + (count / maxCount) * 0.8 : 0;
                const bg = count > 0
                  ? `rgba(${SEVERITY_COLORS[sev]}, ${opacity})`
                  : undefined;

                return (
                  <button
                    key={`${sev}-${cat}`}
                    onClick={() =>
                      count > 0
                        ? setSelected(isSelected ? null : { severity: sev, category: cat })
                        : undefined
                    }
                    className={[
                      'rounded h-12 flex items-center justify-center text-sm font-semibold transition-all',
                      count === 0
                        ? 'bg-gray-900 cursor-default'
                        : 'cursor-pointer hover:ring-2 hover:ring-white/20',
                      isSelected ? 'ring-2 ring-white/40' : '',
                    ].join(' ')}
                    style={bg ? { backgroundColor: bg } : undefined}
                  >
                    {count > 0 ? (
                      <span className="text-white">{count}</span>
                    ) : (
                      <span className="text-gray-700">—</span>
                    )}
                  </button>
                );
              })}
            </Fragment>
          ))}
        </div>
      </div>

      {selected && selectedFindings.length > 0 && (
        <div className="mt-6 border-t border-gray-800 pt-6">
          <h3 className="text-sm font-semibold text-gray-300 mb-3">
            {SEVERITY_LABELS[selected.severity]} / {selected.category}
            <span className="ml-2 text-gray-500 font-normal">
              {selectedFindings.length} finding{selectedFindings.length !== 1 ? 's' : ''}
            </span>
          </h3>
          <div className="space-y-2">
            {selectedFindings.map((f) => (
              <div key={f.id} className="bg-gray-900 rounded-md px-4 py-3 text-sm">
                <p className="text-gray-100">{f.message}</p>
                <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
                  {f.file && <span className="font-mono truncate">{f.file}</span>}
                  <span>
                    Run: <span className="font-mono">{f.runId}</span>
                  </span>
                  {f.phase && <span>Phase: {f.phase}</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
