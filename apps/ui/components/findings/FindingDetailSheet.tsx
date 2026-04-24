'use client';

import { useState, useEffect, useRef } from 'react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetClose,
} from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import type { FindingDetail, FindingHistoryEntry } from '@/lib/forja-store';
import { CreateIssueModal } from './CreateIssueModal';
import { SEVERITY_VARIANT, formatHistoryDate } from '@/lib/finding-utils';

interface FindingDetailSheetProps {
  findingId: string | null;
  runId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const GATE_BORDER: Record<string, string> = {
  pass: 'border-forja-gate-pass-border',
  warn: 'border-forja-gate-warn-border',
  fail: 'border-forja-gate-fail-border',
};

function gateVariant(gate: string | null): 'pass' | 'warn' | 'fail' | 'unknown' {
  if (gate === 'pass' || gate === 'warn' || gate === 'fail') return gate;
  return 'unknown';
}

export function FindingDetailSkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-6 w-3/4" />
        <Skeleton className="h-5 w-16" />
      </div>
      <div className="space-y-3">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-16 w-full" />
        <div className="grid grid-cols-2 gap-4">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
        </div>
        <Skeleton className="h-8 w-full" />
      </div>
      <div className="space-y-3">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
      </div>
      <div className="space-y-3">
        <Skeleton className="h-4 w-28" />
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-14 w-full" />
        ))}
      </div>
    </div>
  );
}

export function FindingDetailSheet({ findingId, runId, open, onOpenChange }: FindingDetailSheetProps) {
  const [finding, setFinding] = useState<FindingDetail | null>(null);
  const [history, setHistory] = useState<FindingHistoryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedFingerprint, setCopiedFingerprint] = useState(false);
  const [createIssueOpen, setCreateIssueOpen] = useState(false);
  const cacheRef = useRef<Map<string, { finding: FindingDetail | null; history: FindingHistoryEntry[] }>>(new Map());

  useEffect(() => {
    if (!open || !findingId) return;

    const cached = cacheRef.current.get(findingId);
    if (cached) {
      setFinding(cached.finding);
      setHistory(cached.history);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(false);
    setFinding(null);
    setHistory([]);

    Promise.all([
      fetch(`/api/findings/${findingId}`).then((r) => r.ok ? (r.json() as Promise<FindingDetail>) : null),
      fetch(`/api/findings/${findingId}/history`).then((r) => r.ok ? (r.json() as Promise<FindingHistoryEntry[]>) : []),
    ])
      .then(([detail, hist]) => {
        setFinding(detail);
        setHistory(Array.isArray(hist) ? hist : []);
        cacheRef.current.set(findingId, { finding: detail, history: Array.isArray(hist) ? hist : [] });
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [open, findingId]);

  function handleCopyLink() {
    if (!findingId) return;
    navigator.clipboard.writeText(
      `${window.location.origin}/runs/${runId}/findings/${findingId}`
    ).then(() => {
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    });
  }

  function handleCopyFingerprint() {
    if (!finding?.fingerprint) return;
    navigator.clipboard.writeText(finding.fingerprint).then(() => {
      setCopiedFingerprint(true);
      setTimeout(() => setCopiedFingerprint(false), 2000);
    });
  }

  const isNotFound = !loading && !error && finding === null && findingId !== null;

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent>
          <SheetHeader>
            <div className="flex items-start justify-between gap-4">
              <div className="flex flex-col gap-2 min-w-0">
                {loading ? (
                  <>
                    <Skeleton className="h-6 w-64" />
                    <Skeleton className="h-5 w-16" />
                  </>
                ) : (
                  <>
                    <SheetTitle className="leading-tight">
                      {finding?.title ?? (error || isNotFound ? 'Finding' : '')}
                    </SheetTitle>
                    {finding && (
                      <Badge variant={SEVERITY_VARIANT[finding.severity] ?? 'unknown'}>
                        {finding.severity}
                      </Badge>
                    )}
                  </>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={handleCopyLink}
                  className="text-xs text-forja-text-secondary hover:text-forja-text-gold border border-forja-border-subtle hover:border-forja-border-gold rounded px-2 py-1 transition-colors"
                >
                  <span aria-live="polite">{copiedLink ? 'Copiado!' : 'Copiar link'}</span>
                </button>
                <SheetClose className="text-forja-text-muted hover:text-forja-text-primary transition-colors">
                  <span className="sr-only">Fechar</span>
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                    <path d="M12 4L4 12M4 4l8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                </SheetClose>
              </div>
            </div>
          </SheetHeader>

          <div className="overflow-y-auto h-[calc(100vh-180px)] space-y-6">
            {loading && <FindingDetailSkeleton />}

            {(error || isNotFound) && !loading && (
              <p className="text-sm text-forja-text-muted">
                Finding não encontrado ou banco de dados indisponível.
              </p>
            )}

            {!loading && finding && (
              <>
                <section className="space-y-3">
                  <h3 className="text-xs font-semibold uppercase tracking-[0.2em] text-forja-text-muted">
                    Detalhe
                  </h3>
                  <p className="text-sm text-forja-text-primary leading-relaxed">
                    {finding.message}
                  </p>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <span className="text-xs text-forja-text-muted">Categoria</span>
                      <p className="text-sm text-forja-text-secondary font-mono">{finding.category}</p>
                    </div>
                    <div className="space-y-1">
                      <span className="text-xs text-forja-text-muted">Arquivo</span>
                      <p className="text-sm text-forja-text-secondary font-mono truncate">
                        {finding.filePath
                          ? `${finding.filePath}${finding.line != null ? `:${finding.line}` : ''}`
                          : '—'}
                      </p>
                    </div>
                  </div>
                  {finding.fingerprint && (
                    <div className="space-y-1">
                      <span className="text-xs text-forja-text-muted">Fingerprint</span>
                      <button
                        onClick={handleCopyFingerprint}
                        className="block w-full text-left font-mono text-xs text-forja-text-secondary bg-forja-bg-surface border border-forja-border-subtle rounded px-3 py-2 hover:border-forja-border-gold hover:text-forja-text-gold transition-colors truncate"
                      >
                        <span aria-live="polite">{copiedFingerprint ? 'Copiado!' : finding.fingerprint}</span>
                      </button>
                    </div>
                  )}
                </section>

                <section className="space-y-3">
                  <h3 className="text-xs font-semibold uppercase tracking-[0.2em] text-forja-text-muted">
                    Origem
                  </h3>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-forja-text-muted w-20 shrink-0">Run</span>
                      <a
                        href={`/runs/${finding.runId}`}
                        className="text-sm text-forja-text-gold hover:underline font-mono"
                      >
                        {finding.run.issueId}
                      </a>
                    </div>
                    {finding.run.gitSha && (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-forja-text-muted w-20 shrink-0">Commit</span>
                        <a
                          href={`https://github.com/org/repo/commit/${finding.run.gitSha}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-forja-text-gold hover:underline font-mono"
                        >
                          {finding.run.gitSha.slice(0, 7)}
                        </a>
                      </div>
                    )}
                    {finding.run.gitBranch && (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-forja-text-muted w-20 shrink-0">Branch</span>
                        <span className="text-sm text-forja-text-secondary font-mono">
                          {finding.run.gitBranch}
                        </span>
                      </div>
                    )}
                  </div>
                </section>

                <section className="space-y-3">
                  <h3 className="text-xs font-semibold uppercase tracking-[0.2em] text-forja-text-muted">
                    Histórico
                    <span className="ml-2 font-mono normal-case tracking-normal text-forja-text-primary">
                      ({history.length})
                    </span>
                  </h3>
                  {history.length === 0 ? (
                    <p className="text-sm text-forja-text-muted">Nenhuma ocorrência anterior.</p>
                  ) : (
                    <ul className="space-y-2">
                      {history.map((entry) => (
                        <li
                          key={entry.runId}
                          className={cn(
                            'border-l-2 pl-3 py-2 rounded-r bg-forja-bg-surface',
                            entry.gateDecision
                              ? GATE_BORDER[entry.gateDecision]
                              : 'border-forja-border-subtle'
                          )}
                        >
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <span className="text-xs text-forja-text-muted">
                              {formatHistoryDate(entry.createdAt)}
                            </span>
                            <a
                              href={`/runs/${entry.runId}`}
                              className="text-xs text-forja-text-gold hover:underline font-mono"
                            >
                              {entry.issueId}
                            </a>
                          </div>
                          <div className="flex items-center gap-2 mt-1">
                            <Badge variant={gateVariant(entry.gateDecision)}>
                              {entry.gateDecision ?? 'unknown'}
                            </Badge>
                            <Badge variant={SEVERITY_VARIANT[entry.severity] ?? 'unknown'}>
                              {entry.severity}
                            </Badge>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>

                <section className="pt-2">
                  <button
                    onClick={() => setCreateIssueOpen(true)}
                    className="w-full bg-gold-gradient text-forja-bg-base font-semibold text-sm rounded-md h-10 px-4 hover:shadow-gold-glow-strong transition-all duration-200 active:scale-[0.98]"
                  >
                    Criar Issue
                  </button>
                </section>
              </>
            )}
          </div>
        </SheetContent>
      </Sheet>

      {finding && (
        <CreateIssueModal
          open={createIssueOpen}
          onOpenChange={setCreateIssueOpen}
          findingId={finding.id}
          runId={finding.runId}
          defaultTitle={`[${finding.severity.toUpperCase()}] ${finding.title}`}
          defaultDescription={`**Finding:** ${finding.title}\n**Categoria:** ${finding.category}\n**Severidade:** ${finding.severity}\n**Arquivo:** ${finding.filePath ?? 'N/A'}${finding.line != null ? `:${finding.line}` : ''}\n**Run:** ${finding.run.issueId}\n\n${finding.message}`}
        />
      )}
    </>
  );
}
