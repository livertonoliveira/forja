'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { cn } from '@/lib/utils';
import { toast } from '@/lib/toast';

interface CreateIssueModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  findingId: string;
  runId: string;
  defaultTitle: string;
  defaultDescription: string;
}

type Provider = 'linear' | 'jira' | 'gitlab';

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
  const t = useTranslations('findings');

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

    try {
      const res = await fetch('/api/issues/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, title, description, findingId }),
      });

      if (!res.ok) {
        toast.error(t('error_title', { status: res.status }), { description: t('error_desc') });
        return;
      }

      const data = (await res.json()) as { url?: string; issueUrl?: string };
      const issueUrl = data.url ?? data.issueUrl ?? '';
      toast.success(t('issue_created'), {
        action: isSafeUrl(issueUrl)
          ? { label: t('view'), onClick: () => window.open(issueUrl, '_blank') }
          : undefined,
      });
      onOpenChange(false);
    } catch {
      toast.error(t('error_title', { status: 0 }), { description: t('error_desc') });
    } finally {
      setLoading(false);
    }
  }

  function handleClose() {
    onOpenChange(false);
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
            {t('create_issue')}
          </DialogPrimitive.Title>

          <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs text-forja-text-muted" htmlFor="issue-title">
                  {t('issue_title_label')}
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
                  {t('issue_desc_label')}
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
                  {t('provider_label')}
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

              <div className="flex items-center gap-3 pt-1">
                <button
                  onClick={handleCreate}
                  disabled={loading}
                  className="flex-1 bg-gold-gradient text-forja-bg-base font-semibold text-sm rounded-md h-10 px-4 hover:shadow-gold-glow-strong transition-all duration-200 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none"
                >
                  {loading ? t('creating') : t('create')}
                </button>
                <button
                  onClick={handleClose}
                  disabled={loading}
                  className="flex-1 rounded-md border border-forja-border-subtle bg-transparent text-forja-text-secondary text-sm h-10 px-4 hover:border-forja-border-gold hover:text-forja-text-gold transition-colors disabled:opacity-50 disabled:pointer-events-none"
                >
                  {t('cancel')}
                </button>
              </div>
            </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
