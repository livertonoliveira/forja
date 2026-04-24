'use client';

import type { CompareResult } from '@/lib/forja-store';
import { Button } from '@/components/ui/button';

export function ExportJsonButton({ data }: { data: CompareResult }) {
  function handleExport() {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'forja-diff.json';
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Button variant="outline" size="sm" onClick={handleExport}>
      Exportar JSON
    </Button>
  );
}
