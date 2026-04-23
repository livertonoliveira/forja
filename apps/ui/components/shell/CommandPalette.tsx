'use client';

import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Command } from 'cmdk';
import {
  Play,
  DollarSign,
  LayoutGrid,
  AlertCircle,
  Inbox,
  Copy,
  Sun,
  Keyboard,
  BookOpen,
  Bug,
  AlertTriangle,
  type LucideIcon,
} from 'lucide-react';
import { useI18n } from '@/lib/i18n-context';
import type { Run, Finding } from '@/lib/types';

type CommandPaletteProps = {
  open: boolean;
  onClose: () => void;
};

type NavItem = {
  id: string;
  icon: LucideIcon;
  label: string;
  description: string;
  href: string;
  shortcut?: string;
};

type ActionItem = {
  id: string;
  icon: LucideIcon;
  label: string;
  action: () => void;
};

type HelpItem = {
  id: string;
  icon: LucideIcon;
  label: string;
  description?: string;
};

const GROUP_HEADING_CLASS =
  '[&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-[0.2em] [&_[cmdk-group-heading]]:text-forja-text-gold [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5';

const ITEM_CLASS =
  'flex items-center gap-3 px-3 py-2 cursor-pointer rounded-sm mx-1 data-[selected=true]:bg-forja-bg-overlay data-[selected=true]:border-l-2 data-[selected=true]:border-forja-border-gold';

const NAV_ITEMS: NavItem[] = [
  { id: 'nav-runs', icon: Play, label: 'Runs', description: 'Execuções recentes', href: '/runs', shortcut: 'G R' },
  { id: 'nav-cost', icon: DollarSign, label: 'Cost', description: 'Análise de custo', href: '/cost', shortcut: 'G C' },
  { id: 'nav-heatmap', icon: LayoutGrid, label: 'Heatmap', description: 'Mapa de achados', href: '/heatmap', shortcut: 'G H' },
  { id: 'nav-issues', icon: AlertCircle, label: 'Issues', description: 'Tarefas e issues', href: '/issues' },
  { id: 'nav-dlq', icon: Inbox, label: 'DLQ', description: 'Dead Letter Queue', href: '/dlq' },
];

const HELP_ITEMS: HelpItem[] = [
  { id: 'help-shortcuts', icon: Keyboard, label: 'Ver atalhos', description: '⌘K, G+R, G+C, G+H' },
  { id: 'help-docs', icon: BookOpen, label: 'Documentação' },
  { id: 'help-bug', icon: Bug, label: 'Reportar bug' },
];

function ShortcutBadge({ shortcut }: { shortcut: string }) {
  return (
    <span className="flex items-center gap-0.5 shrink-0">
      {shortcut.split(' ').map((key, i) => (
        <kbd
          key={i}
          className="px-1.5 py-0.5 text-[10px] font-mono bg-forja-bg-overlay text-forja-text-gold border border-forja-border-gold/40 rounded"
        >
          {key}
        </kbd>
      ))}
    </span>
  );
}

export function CommandPalette({ open, onClose }: CommandPaletteProps) {
  const { t } = useI18n();
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [mounted, setMounted] = useState(false);
  const [runs, setRuns] = useState<Run[]>([]);
  const [findings, setFindings] = useState<Finding[]>([]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestIdRef = useRef(0);

  // Animation mount
  useEffect(() => {
    if (open) {
      const id = requestAnimationFrame(() => setMounted(true));
      return () => cancelAnimationFrame(id);
    } else {
      setMounted(false);
      setQuery('');
      setRuns([]);
      setFindings([]);
    }
  }, [open]);

  const fetchResults = useCallback(async (q: string) => {
    if (q.length < 1) {
      setRuns([]);
      setFindings([]);
      return;
    }
    const requestId = ++requestIdRef.current;
    try {
      const [runsRes, findingsRes] = await Promise.allSettled([
        fetch(`/api/runs?q=${encodeURIComponent(q)}&limit=5`).then(r => r.ok ? r.json() : []),
        fetch(`/api/findings?q=${encodeURIComponent(q)}&limit=5`).then(r => r.ok ? r.json() : []),
      ]);
      if (requestId !== requestIdRef.current) return;
      if (runsRes.status === 'fulfilled') {
        const data: unknown = runsRes.value;
        setRuns(Array.isArray(data) ? (data as Run[]) : []);
      }
      if (findingsRes.status === 'fulfilled') {
        const data: unknown = findingsRes.value;
        setFindings(Array.isArray(data) ? (data as Finding[]) : []);
      }
    } catch {
      // silent
    }
  }, []);

  // Debounced search
  useEffect(() => {
    if (!open) return;
    if (debounceRef.current !== null) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void fetchResults(query);
    }, 150);
    return () => {
      if (debounceRef.current !== null) clearTimeout(debounceRef.current);
    };
  }, [query, open, fetchResults]);

  const navigate = useCallback(
    (href: string) => {
      router.push(href);
      onClose();
    },
    [router, onClose],
  );

  const ACTION_ITEMS = useMemo((): ActionItem[] => [
    {
      id: 'action-copy-link',
      icon: Copy,
      label: 'Copiar link da página',
      action: () => {
        void navigator.clipboard.writeText(window.location.href);
        onClose();
      },
    },
    {
      id: 'action-toggle-theme',
      icon: Sun,
      label: 'Toggle tema',
      action: () => {
        document.documentElement.classList.toggle('dark');
        onClose();
      },
    },
  ], [onClose]);

  if (!open) return null;

  const cp = t.commandPalette;

  return (
    <div
      role="dialog"
      aria-label="command palette"
      aria-modal="true"
      className={`fixed inset-0 z-50 bg-black/70 backdrop-blur-md transition-opacity duration-200 ${
        mounted ? 'opacity-100' : 'opacity-0'
      }`}
      onClick={onClose}
    >
      {/* Panel */}
      <div className="flex items-start justify-center pt-[15vh] px-4">
        <div
          className={`w-full max-w-[640px] bg-forja-bg-elevated border border-forja-border-gold rounded-xl shadow-gold-glow overflow-hidden transition-[transform,opacity] duration-200 ease-out ${
            mounted ? 'opacity-100 scale-100' : 'opacity-0 scale-95'
          }`}
          onClick={e => e.stopPropagation()}
        >
          <Command
            className="flex flex-col"
            label="command palette"
            shouldFilter={runs.length === 0 && findings.length === 0}
          >
            {/* Input */}
            <div className="flex items-center border-b border-forja-border-subtle px-3">
              <Command.Input
                value={query}
                onValueChange={setQuery}
                placeholder={cp.placeholder}
                autoFocus
                className="flex-1 py-3 bg-transparent text-sm text-forja-text-primary placeholder:text-forja-text-muted outline-none font-sans"
              />
            </div>

            {/* Results list */}
            <Command.List className="max-h-[400px] overflow-y-auto py-1.5">
              <Command.Empty className="px-4 py-6 text-center text-sm text-forja-text-muted">
                {cp.noResults} &ldquo;{query}&rdquo;
                <p className="mt-1 text-xs text-forja-text-muted/60">{cp.tryDifferentTerm}</p>
              </Command.Empty>

              {/* Navigation */}
              <Command.Group heading={cp.groups.navigation} className={GROUP_HEADING_CLASS}>
                {NAV_ITEMS.map(item => (
                  <Command.Item
                    key={item.id}
                    value={`${item.label} ${item.description}`}
                    onSelect={() => navigate(item.href)}
                    className={ITEM_CLASS}
                  >
                    <item.icon size={15} className="text-forja-text-secondary shrink-0" />
                    <span className="text-sm text-forja-text-primary flex-1">{item.label}</span>
                    {item.description && (
                      <span className="text-xs text-forja-text-muted truncate max-w-[180px]">
                        {item.description}
                      </span>
                    )}
                    {item.shortcut && <ShortcutBadge shortcut={item.shortcut} />}
                  </Command.Item>
                ))}
              </Command.Group>

              {/* Recent Runs */}
              {runs.length > 0 && (
                <Command.Group heading={cp.groups.recentRuns} className={GROUP_HEADING_CLASS}>
                  {runs.map(run => (
                    <Command.Item
                      key={run.id}
                      value={`run ${run.id} ${run.issueId}`}
                      onSelect={() => navigate(`/runs/${run.id}`)}
                      className={ITEM_CLASS}
                    >
                      <Play size={15} className="text-forja-text-secondary shrink-0" />
                      <span className="text-sm text-forja-text-primary flex-1 font-mono">
                        {run.id.slice(0, 8)}
                      </span>
                      <span className="text-xs text-forja-text-muted truncate max-w-[180px]">
                        {run.issueId}
                      </span>
                      <span className="text-xs text-forja-text-muted capitalize shrink-0">
                        {run.status}
                      </span>
                    </Command.Item>
                  ))}
                </Command.Group>
              )}

              {/* Findings */}
              {findings.length > 0 && (
                <Command.Group heading={cp.groups.findings} className={GROUP_HEADING_CLASS}>
                  {findings.map(finding => (
                    <Command.Item
                      key={finding.id}
                      value={`finding ${finding.message} ${finding.file ?? ''}`}
                      onSelect={() => navigate(`/runs/${finding.runId}`)}
                      className={ITEM_CLASS}
                    >
                      <AlertTriangle size={15} className="text-forja-text-secondary shrink-0" />
                      <span className="text-sm text-forja-text-primary flex-1 truncate">
                        {finding.message}
                      </span>
                      {finding.file && (
                        <span className="text-xs text-forja-text-muted truncate max-w-[180px]">
                          {finding.file}
                        </span>
                      )}
                      <span className="text-xs text-forja-text-muted capitalize shrink-0">
                        {finding.severity}
                      </span>
                    </Command.Item>
                  ))}
                </Command.Group>
              )}

              {/* Actions */}
              <Command.Group heading={cp.groups.actions} className={GROUP_HEADING_CLASS}>
                {ACTION_ITEMS.map(item => (
                  <Command.Item
                    key={item.id}
                    value={item.label}
                    onSelect={item.action}
                    className={ITEM_CLASS}
                  >
                    <item.icon size={15} className="text-forja-text-secondary shrink-0" />
                    <span className="text-sm text-forja-text-primary flex-1">{item.label}</span>
                  </Command.Item>
                ))}
              </Command.Group>

              {/* Help */}
              <Command.Group heading={cp.groups.help} className={GROUP_HEADING_CLASS}>
                {HELP_ITEMS.map(item => (
                  <Command.Item
                    key={item.id}
                    value={`help ${item.label} ${item.description ?? ''}`}
                    onSelect={onClose}
                    className={ITEM_CLASS}
                  >
                    <item.icon size={15} className="text-forja-text-secondary shrink-0" />
                    <span className="text-sm text-forja-text-primary flex-1">{item.label}</span>
                    {item.description && (
                      <span className="text-xs text-forja-text-muted truncate max-w-[180px]">
                        {item.description}
                      </span>
                    )}
                  </Command.Item>
                ))}
              </Command.Group>
            </Command.List>

            {/* Footer */}
            <div className="border-t border-forja-border-subtle px-3 py-1.5 flex items-center justify-between">
              <span className="font-display text-[10px] text-forja-text-gold/30">Forja</span>
              <span className="text-[10px] text-forja-text-muted/60">
                ↑↓ {cp.footer.navigate} · ↵ {cp.footer.select} · Esc {cp.footer.close}
              </span>
            </div>
          </Command>
        </div>
      </div>
    </div>
  );
}
