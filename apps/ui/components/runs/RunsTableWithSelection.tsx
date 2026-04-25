'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { RunSummary } from '@/lib/forja-store';
import { statusColors, gateDisplay } from '@/lib/ui-constants';
import { formatDuration } from '@/lib/format';
import { Button } from '@/components/ui/button';

const MAX_SELECTION = 5;

export function RunsTableWithSelection({ runs }: { runs: RunSummary[] }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const router = useRouter();

  function toggle(id: string) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else if (next.size < MAX_SELECTION) {
        next.add(id);
      }
      return next;
    });
  }

  function handleCompare() {
    router.push(`/runs/compare?ids=${Array.from(selected).join(',')}`);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4 min-h-[36px]">
        <span className="text-sm text-forja-text-muted">
          {selected.size > 0
            ? `${selected.size} de ${MAX_SELECTION} selecionados`
            : 'Selecione até 5 runs para comparar'}
        </span>
        {selected.size >= 2 && (
          <Button size="sm" onClick={handleCompare}>
            Comparar ({selected.size})
          </Button>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-forja-text-secondary border-b border-forja-border-default">
              <th className="pb-3 pr-4 font-medium w-10">
                <span className="sr-only">Selecionar</span>
              </th>
              <th className="pb-3 pr-6 font-medium">Run ID</th>
              <th className="pb-3 pr-6 font-medium">Tarefa</th>
              <th className="pb-3 pr-6 font-medium">Status</th>
              <th className="pb-3 pr-6 font-medium">Início</th>
              <th className="pb-3 pr-6 font-medium">Duração</th>
              <th className="pb-3 pr-6 font-medium">Custo</th>
              <th className="pb-3 font-medium">Gate</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((run, index) => {
              const gd = run.gate ? gateDisplay[run.gate] : null;
              const isSelected = selected.has(run.id);
              const isDisabled = !isSelected && selected.size >= MAX_SELECTION;
              return (
                <tr
                  key={run.id}
                  className={`border-b border-forja-border-subtle transition-colors animate-fade-in-up ${
                    isSelected ? 'bg-forja-bg-overlay' : 'hover:bg-forja-bg-surface'
                  }`}
                  style={{ animationDelay: `${index * 50}ms`, animationFillMode: 'both' }}
                >
                  <td className="py-3 pr-4">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      disabled={isDisabled}
                      onChange={() => toggle(run.id)}
                      aria-label={`Selecionar run ${run.id.slice(0, 8)}`}
                      className="w-4 h-4 cursor-pointer disabled:opacity-40"
                    />
                  </td>
                  <td className="py-3 pr-6">
                    <Link
                      href={`/runs/${run.id}`}
                      className="font-mono text-forja-text-gold hover:text-forja-text-gold/80 text-xs transition-colors"
                    >
                      {run.id.slice(0, 8)}…
                    </Link>
                  </td>
                  <td className="py-3 pr-6 font-mono text-forja-text-primary">{run.issueId || '—'}</td>
                  <td className="py-3 pr-6">
                    <span
                      className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${statusColors[run.status] ?? 'bg-gray-100 text-gray-600'}`}
                    >
                      {run.status}
                    </span>
                  </td>
                  <td className="py-3 pr-6 text-forja-text-muted text-xs">
                    {new Date(run.startedAt).toLocaleString('pt-BR')}
                  </td>
                  <td className="py-3 pr-6 text-forja-text-secondary">
                    {formatDuration(run.startedAt, run.finishedAt)}
                  </td>
                  <td className="py-3 pr-6 text-forja-text-secondary">${run.totalCost}</td>
                  <td className={`py-3 font-medium ${gd ? gd.cls : 'text-forja-text-muted'}`}>
                    {gd ? gd.label : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
