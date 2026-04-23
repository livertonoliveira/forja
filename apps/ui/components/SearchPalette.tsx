'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Search, X } from 'lucide-react';
import { useI18n } from '@/lib/i18n-context';
import type { Run } from '@/lib/types';

type IssueEntry = {
  issueId: string;
  runCount: number;
  lastGate: 'pass' | 'warn' | 'fail' | null;
  lastRun: string;
};

type SearchPaletteProps = {
  open: boolean;
  onClose: () => void;
};

export function SearchPalette({ open, onClose }: SearchPaletteProps) {
  const { t } = useI18n();
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [runs, setRuns] = useState<Run[]>([]);
  const [issues, setIssues] = useState<IssueEntry[]>([]);
  const [loading, setLoading] = useState(false);

  // Fetch data when palette opens
  useEffect(() => {
    if (!open) return;
    setLoading(true);
    Promise.all([
      fetch('/api/runs').then(r => r.ok ? r.json() : []),
      fetch('/api/issues').then(r => r.ok ? r.json() : []),
    ])
      .then(([runsData, issuesData]) => {
        setRuns(Array.isArray(runsData) ? runsData : []);
        setIssues(Array.isArray(issuesData) ? issuesData : []);
      })
      .catch(() => {
        setRuns([]);
        setIssues([]);
      })
      .finally(() => setLoading(false));
  }, [open]);

  // Focus input when opened
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      setQuery('');
    }
  }, [open]);

  // Close on Escape
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    if (open) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [open, onClose]);

  const q = query.trim().toLowerCase();

  const filteredRuns = q
    ? runs.filter(r =>
        r.id.toLowerCase().includes(q) ||
        r.issueId.toLowerCase().includes(q) ||
        r.status.toLowerCase().includes(q),
      )
    : runs.slice(0, 5);

  const filteredIssues = q
    ? issues.filter(i =>
        i.issueId.toLowerCase().includes(q),
      )
    : issues.slice(0, 5);

  const handleRunClick = useCallback(
    (runId: string) => {
      router.push(`/runs/${runId}`);
      onClose();
    },
    [router, onClose],
  );

  const handleIssueClick = useCallback(
    (issueId: string) => {
      router.push(`/issues/${issueId}`);
      onClose();
    },
    [router, onClose],
  );

  if (!open) return null;

  const hasResults = filteredRuns.length > 0 || filteredIssues.length > 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]"
      role="dialog"
      aria-modal="true"
      aria-label="Search palette"
    >
      {/* Overlay */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div className="relative w-full max-w-xl mx-4 rounded-xl bg-forja-bg-surface border border-forja-border-subtle shadow-2xl overflow-hidden">
        {/* Input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-forja-border-subtle">
          <Search size={16} className="shrink-0 text-forja-text-secondary" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder={t.search.placeholder}
            className="flex-1 bg-transparent text-sm text-forja-text-primary placeholder:text-forja-text-muted outline-none"
          />
          <button
            onClick={onClose}
            aria-label="Close search"
            className="shrink-0 text-forja-text-secondary hover:text-forja-text-primary transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Results */}
        <div className="max-h-[400px] overflow-y-auto py-2">
          {loading && (
            <p className="px-4 py-3 text-sm text-forja-text-muted">
              Carregando…
            </p>
          )}

          {!loading && !hasResults && (
            <p className="px-4 py-3 text-sm text-forja-text-muted">
              {t.search.noResults}
            </p>
          )}

          {!loading && filteredRuns.length > 0 && (
            <section>
              <p className="px-4 py-1.5 text-[10px] uppercase tracking-[0.2em] text-forja-text-muted font-medium">
                {t.search.runs}
              </p>
              {filteredRuns.map(run => (
                <button
                  key={run.id}
                  onClick={() => handleRunClick(run.id)}
                  className="w-full flex items-center gap-3 px-4 py-2 text-sm text-left hover:bg-forja-bg-overlay transition-colors"
                >
                  <span className="font-mono text-forja-text-gold text-xs shrink-0">
                    {run.id.slice(0, 8)}
                  </span>
                  <span className="flex-1 truncate text-forja-text-primary">
                    {run.issueId}
                  </span>
                  <span className="shrink-0 text-forja-text-secondary text-xs capitalize">
                    {run.status}
                  </span>
                </button>
              ))}
            </section>
          )}

          {!loading && filteredIssues.length > 0 && (
            <section>
              <p className="px-4 py-1.5 text-[10px] uppercase tracking-[0.2em] text-forja-text-muted font-medium">
                {t.search.issues}
              </p>
              {filteredIssues.map((issue) => (
                <button
                  key={issue.issueId}
                  onClick={() => handleIssueClick(issue.issueId)}
                  className="w-full flex items-center gap-3 px-4 py-2 text-sm text-left hover:bg-forja-bg-overlay transition-colors"
                >
                  <span className="flex-1 truncate text-forja-text-primary">
                    {issue.issueId}
                  </span>
                  <span className="shrink-0 text-forja-text-secondary text-xs">
                    {issue.runCount} run{issue.runCount !== 1 ? 's' : ''}
                  </span>
                </button>
              ))}
            </section>
          )}
        </div>

        {/* Footer hint */}
        <div className="flex items-center gap-4 px-4 py-2 border-t border-forja-border-subtle">
          <span className="text-[10px] text-forja-text-muted">
            <kbd className="font-mono">↵</kbd> selecionar
          </span>
          <span className="text-[10px] text-forja-text-muted">
            <kbd className="font-mono">Esc</kbd> fechar
          </span>
        </div>
      </div>
    </div>
  );
}
