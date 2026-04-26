'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type { Finding } from '@/lib/types';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { FindingDetailSheet } from '@/components/findings/FindingDetailSheet';
import { UUID_RE } from '@/lib/validation';
import { SEVERITY_VARIANT } from '@/lib/finding-utils';

interface FindingsRunSectionProps {
  findings: Finding[];
  runId: string;
  initialFindingId?: string;
}

export function FindingsRunSection({ findings, runId, initialFindingId }: FindingsRunSectionProps) {
  const router = useRouter();
  const [selectedFindingId, setSelectedFindingId] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const t = useTranslations('findings');

  useEffect(() => {
    if (initialFindingId && UUID_RE.test(initialFindingId)) {
      setSelectedFindingId(initialFindingId);
      setSheetOpen(true);
    }
  }, [initialFindingId]);

  const handleRowClick = useCallback((finding: Finding) => {
    setSelectedFindingId(finding.id);
    setSheetOpen(true);
    if (UUID_RE.test(finding.id)) {
      router.push(`/runs/${runId}/findings/${finding.id}`, { scroll: false });
    }
  }, [runId, router]);

  const handleSheetOpenChange = useCallback((open: boolean) => {
    setSheetOpen(open);
    if (!open) {
      router.push(`/runs/${runId}`, { scroll: false });
    }
  }, [runId, router]);

  if (findings.length === 0) {
    return (
      <p className="text-sm text-forja-text-muted py-4">{t('none')}</p>
    );
  }

  return (
    <>
      <h2 className="text-base font-semibold text-forja-text-primary mb-4">
        {t('title', { count: findings.length })}
      </h2>
      <div className="rounded-lg border border-forja-border-subtle overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent border-b border-forja-border-default">
              <TableHead>{t('columns.severity')}</TableHead>
              <TableHead>{t('columns.category')}</TableHead>
              <TableHead>{t('columns.message')}</TableHead>
              <TableHead>{t('columns.file')}</TableHead>
              <TableHead>{t('columns.phase')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {findings.map((finding) => (
              <TableRow
                key={finding.id}
                className={`cursor-pointer hover:bg-[#222222] ${sheetOpen && selectedFindingId === finding.id ? 'bg-forja-bg-elevated' : ''}`}
                onClick={() => handleRowClick(finding)}
              >
                <TableCell>
                  <Badge variant={SEVERITY_VARIANT[finding.severity] ?? 'pass'}>
                    {finding.severity}
                  </Badge>
                </TableCell>
                <TableCell className="text-forja-text-secondary">{finding.category}</TableCell>
                <TableCell className="max-w-xs truncate text-forja-text-primary">
                  {finding.message}
                </TableCell>
                <TableCell className="font-mono text-xs text-forja-text-secondary">
                  {finding.file
                    ? finding.file.length > 30
                      ? `${finding.file.slice(0, 30)}…`
                      : finding.file
                    : '—'}
                </TableCell>
                <TableCell className="text-forja-text-muted">{finding.phase ?? '—'}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <FindingDetailSheet
        findingId={selectedFindingId}
        runId={runId}
        open={sheetOpen}
        onOpenChange={handleSheetOpenChange}
      />
    </>
  );
}
