'use client';

import type { ComparedFinding } from '@/lib/forja-store';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { useTranslations } from 'next-intl';

type Variant = 'new' | 'resolved' | 'persistent';

const ROW_BG: Record<Variant, string> = {
  new: '!bg-forja-gate-fail-bg/20',
  resolved: '!bg-forja-gate-pass-bg/20',
  persistent: '',
};

const SEVERITY_VARIANT: Record<string, 'fail' | 'warn' | 'pass' | 'unknown'> = {
  critical: 'fail',
  high: 'fail',
  medium: 'warn',
  low: 'pass',
};

interface FindingDiffTableProps {
  findings: ComparedFinding[];
  variant: Variant;
}

export function FindingDiffTable({ findings, variant }: FindingDiffTableProps) {
  const t = useTranslations('findings');

  if (findings.length === 0) {
    return (
      <p className="text-sm text-forja-text-muted py-4 px-1">
        {t('diff_empty')}
      </p>
    );
  }

  const rowBg = ROW_BG[variant];

  return (
    <div className="rounded-lg border border-forja-border-subtle overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent border-b border-forja-border-default">
            <TableHead>{t('columns.severity')}</TableHead>
            <TableHead>{t('columns.message')}</TableHead>
            <TableHead>{t('columns.file')}</TableHead>
            <TableHead>{t('columns.line')}</TableHead>
            <TableHead>{t('columns.fingerprint')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody className="[&_tr]:bg-transparent">
          {findings.map((f) => (
            <TableRow key={f.fingerprint} className={rowBg}>
              <TableCell>
                <Badge variant={SEVERITY_VARIANT[f.severity] ?? 'unknown'}>
                  {f.severity}
                </Badge>
              </TableCell>
              <TableCell className="max-w-xs truncate text-forja-text-primary">
                {f.title}
              </TableCell>
              <TableCell className="font-mono text-xs text-forja-text-secondary">
                {f.filePath ?? '—'}
              </TableCell>
              <TableCell className="text-forja-text-muted">
                {f.line ?? '—'}
              </TableCell>
              <TableCell className="font-mono text-xs text-forja-text-muted">
                {f.fingerprint.slice(0, 12)}…
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
