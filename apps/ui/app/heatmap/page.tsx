import HeatmapGrid from '@/components/HeatmapGrid';
import { listAllFindings } from '@/lib/forja-store';

export const dynamic = 'force-dynamic';

export default async function HeatmapPage() {
  const findings = await listAllFindings();

  return (
    <div>
      <h1 className="text-xl font-semibold text-forja-text-primary mb-2">Mapa de Achados</h1>
      <p className="text-sm text-forja-text-secondary mb-6">
        Severity × category — {findings.length} total finding{findings.length !== 1 ? 's' : ''}
      </p>
      <HeatmapGrid findings={findings} />
    </div>
  );
}
