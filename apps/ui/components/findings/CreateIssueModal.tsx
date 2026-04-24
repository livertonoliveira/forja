'use client';

import { useState, useEffect, useRef } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { cn } from '@/lib/utils';

interface CreateIssueModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  findingId: string;
  runId: string;
  defaultTitle: string;
  defaultDescription: string;
}

type Provider = 'linear' | 'jira' | 'gitlab';

interface SuccessState {
  issueUrl: string;
}

export function CreateIssueModal({
  open,
  onOpenChange,
  findingId,
  defaultTitle,
  defaultDescription,
}: CreateIssueModalProps) {
  const [title, setTitle] = useState(defaultTitle);
  const [description, setDescription] = useState(defaultDescription);
  const [provider, setProvider] = useState<Provider>('linear');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState<SuccessState | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    };
  }, []);

  function isSafeUrl(url: string): boolean {
    try {
      const { protocol } = new URL(url);
      return protocol === 'https:' || protocol === 'http:';
    } catch {
      return false;
    }
  }

  async function handleCreate() {
    setLoading(true);
    setErrorMsg(null);

    try {
      const res = await fetch('/api/issues/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, title, description, findingId }),
      });

      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? `Erro ${res.status}`);
      }

      const data = (await res.json()) as { url?: string; issueUrl?: string };
      setSuccess({ issueUrl: data.url ?? data.issueUrl ?? '' });
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Erro desconhecido');
    } finally {
      setLoading(false);
    }
  }

  function handleClose() {
    onOpenChange(false);
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    closeTimerRef.current = setTimeout(() => {
      setSuccess(null);
      setErrorMsg(null);
    }, 200);
  }

  const inputClass = cn(
    'w-full rounded-md border bg-forja-bg-surface border-forja-border-subtle text-forja-text-primary text-sm px-3 py-2',
    'focus:outline-none focus:border-forja-border-gold transition-colors placeholder:text-forja-text-muted'
  );

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[55] bg-black/70 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          className={cn(
            'fixed left-1/2 top-1/2 z-[60] -translate-x-1/2 -translate-y-1/2',
            'w-full max-w-lg rounded-xl border border-forja-border-gold bg-forja-bg-elevated p-6 shadow-xl',
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
            'data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
            'data-[state=closed]:slide-out-to-left-1/2 data-[state=open]:slide-in-from-left-1/2',
            'data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-top-[48%]',
            'duration-200'
          )}
        >
          <DialogPrimitive.Title className="text-base font-semibold text-forja-text-gold mb-5">
            Criar Issue
          </DialogPrimitive.Title>

          {success ? (
            <div className="space-y-4">
              <p className="text-sm text-forja-text-primary">Issue criada com sucesso.</p>
              {success.issueUrl && isSafeUrl(success.issueUrl) && (
                <a
                  href={success.issueUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block text-sm text-forja-text-gold hover:underline break-all"
                >
                  {success.issueUrl}
                </a>
              )}
              {success.issueUrl && !isSafeUrl(success.issueUrl) && (
                <p className="text-sm font-mono text-forja-text-secondary break-all">{success.issueUrl}</p>
              )}
              <button
                onClick={handleClose}
                className="mt-2 w-full rounded-md border border-forja-border-subtle bg-transparent text-forja-text-secondary text-sm h-9 px-4 hover:border-forja-border-gold hover:text-forja-text-gold transition-colors"
              >
                Fechar
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs text-forja-text-muted" htmlFor="issue-title">
                  Título
                </label>
                <input
                  id="issue-title"
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className={inputClass}
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs text-forja-text-muted" htmlFor="issue-description">
                  Descrição
                </label>
                <textarea
                  id="issue-description"
                  rows={5}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className={cn(inputClass, 'font-mono resize-none')}
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs text-forja-text-muted" htmlFor="issue-provider">
                  Provider
                </label>
                <select
                  id="issue-provider"
                  value={provider}
                  onChange={(e) => setProvider(e.target.value as Provider)}
                  className={inputClass}
                >
                  <option value="linear">Linear</option>
                  <option value="jira">Jira</option>
                  <option value="gitlab">GitLab</option>
                </select>
              </div>

              {errorMsg && (
                <p className="text-sm text-red-400">{errorMsg}</p>
              )}

              <div className="flex items-center gap-3 pt-1">
                <button
                  onClick={handleCreate}
                  disabled={loading}
                  className="flex-1 bg-gold-gradient text-forja-bg-base font-semibold text-sm rounded-md h-10 px-4 hover:shadow-gold-glow-strong transition-all duration-200 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none"
                >
                  {loading ? 'Criando…' : 'Criar'}
                </button>
                <button
                  onClick={handleClose}
                  disabled={loading}
                  className="flex-1 rounded-md border border-forja-border-subtle bg-transparent text-forja-text-secondary text-sm h-10 px-4 hover:border-forja-border-gold hover:text-forja-text-gold transition-colors disabled:opacity-50 disabled:pointer-events-none"
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
