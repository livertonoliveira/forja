import HeatmapGrid from '@/components/HeatmapGrid';
import { listAllFindings } from '@/lib/forja-store';

export default async function HeatmapPage() {
  const findings = await listAllFindings();

  return (
    <div>
      <h1 className="text-xl font-semibold text-gray-100 mb-2">Findings Heatmap</h1>
      <p className="text-sm text-gray-500 mb-6">
        Severity × category — {findings.length} total finding{findings.length !== 1 ? 's' : ''}
      </p>
      <HeatmapGrid findings={findings} />
    </div>
  );
}
