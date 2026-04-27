'use client';

import { Search, Settings } from 'lucide-react';
import { Breadcrumbs } from './Breadcrumbs';
import { useI18n } from '@/lib/i18n-context';

type TopBarProps = {
  onSearchOpen?: () => void;
};

export function TopBar({ onSearchOpen }: TopBarProps) {
  const { t, toggle } = useI18n();

  return (
    <header className="sticky top-0 z-20 flex items-center justify-between px-4 gap-4 h-14 bg-forja-bg-surface border-b border-forja-border-subtle shrink-0">
      <div className="shrink-0">
        <Breadcrumbs />
      </div>

      <div className="flex items-center gap-2 flex-1 max-w-sm mx-auto">
        <button
          onClick={onSearchOpen}
          className="flex items-center gap-2 w-full px-3 py-1.5 rounded-md bg-forja-bg-elevated border border-forja-border-subtle text-forja-text-secondary hover:border-forja-border-default hover:text-forja-text-primary transition-colors text-sm"
          aria-label="Open command palette"
        >
          <Search size={14} className="shrink-0" />
          <span className="flex-1 text-left truncate">
            {t.search.placeholder}
          </span>
          <kbd className="shrink-0 hidden sm:inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-mono bg-forja-bg-overlay text-forja-text-gold border border-forja-border-gold/30">
            ⌘K
          </kbd>
        </button>
      </div>

      <div className="shrink-0 flex items-center gap-2">
        <button
          onClick={toggle}
          aria-label={t.common.langFull}
          title={t.common.langFull}
          className="flex items-center justify-center h-8 px-2 rounded-md bg-forja-bg-overlay text-forja-text-secondary hover:text-forja-text-primary hover:bg-forja-bg-elevated transition-colors text-xs font-mono font-medium tracking-wide"
        >
          {t.common.lang}
        </button>
        <button
          aria-label={t.common.settings}
          className="flex items-center justify-center w-8 h-8 rounded-full bg-forja-bg-overlay text-forja-text-secondary hover:text-forja-text-primary hover:bg-forja-bg-elevated transition-colors"
        >
          <Settings size={16} />
        </button>
      </div>
    </header>
  );
}
