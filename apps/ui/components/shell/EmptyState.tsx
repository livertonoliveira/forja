'use client';

import React from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface EmptyStateAction {
  label: string;
  onClick?: () => void;
  href?: string;
}

interface EmptyStateProps {
  title: string;
  description?: string;
  action?: EmptyStateAction;
  icon?: React.ReactNode;
  className?: string;
}

export function EmptyState({ title, description, action, icon, className }: EmptyStateProps) {
  return (
    <div className={cn('relative flex flex-col items-center justify-center py-20 px-8 text-center overflow-hidden', className)}>
      <span
        className="absolute inset-0 flex items-center justify-center font-display leading-none select-none pointer-events-none text-forja-text-gold"
        style={{ fontSize: '20rem', opacity: 0.04 }}
        aria-hidden="true"
      >
        F
      </span>

      <div className="relative z-10 flex flex-col items-center gap-3 max-w-sm">
        {icon && <div className="text-forja-text-muted mb-1">{icon}</div>}
        <h2 className="font-display text-2xl text-forja-text-gold">{title}</h2>
        {description && (
          <p className="font-sans text-forja-text-secondary text-sm max-w-[280px] leading-relaxed">
            {description}
          </p>
        )}
        {action && (
          action.href ? (
            <Link href={action.href} className="mt-2">
              <Button variant="default" size="sm">{action.label}</Button>
            </Link>
          ) : (
            <Button variant="default" size="sm" onClick={action.onClick} className="mt-2">
              {action.label}
            </Button>
          )
        )}
      </div>
    </div>
  );
}

export function EmptyRuns({ onRun }: { onRun?: () => void } = {}) {
  const t = useTranslations('runs');
  return (
    <EmptyState
      title={t('empty')}
      description={t('start_prompt')}
      action={onRun ? { label: t('run_action'), onClick: onRun } : undefined}
    />
  );
}

export function EmptyFilters({ onClear, clearHref }: { onClear?: () => void; clearHref?: string } = {}) {
  const t = useTranslations('runs');
  return (
    <EmptyState
      title={t('no_results')}
      description={t('no_results_desc')}
      action={{ label: t('clear_filters'), onClick: onClear, href: clearHref }}
    />
  );
}

export function EmptyDLQ() {
  const t = useTranslations('dlq');
  return (
    <EmptyState
      title={t('no_events')}
      description={t('no_events_desc')}
    />
  );
}

export function EmptyComparison() {
  const t = useTranslations('runs.compare');
  return (
    <EmptyState
      title={t('select_to_compare')}
      description={t('select_desc')}
    />
  );
}

export function EmptySearch({ query }: { query: string }) {
  const safeQuery = query.replace(/[<>"'&]/g, '');
  return (
    <EmptyState
      title={`Nenhum resultado para "${safeQuery}"`}
      description="Tente outros termos ou remova os filtros ativos."
    />
  );
}
