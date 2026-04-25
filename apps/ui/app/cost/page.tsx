import { getCostBreakdownByProject, getCostHeatmapByDowHour } from '@/lib/forja-store';
import { CostClient } from '@/components/cost/CostClient';

export const dynamic = 'force-dynamic';

export default async function CostPage() {
  const [breakdown, heatmap] = await Promise.all([
    getCostBreakdownByProject({ limit: 10 }),
    getCostHeatmapByDowHour(),
  ]);

  const now = new Date();
  const from = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const period = `${from.toLocaleDateString('pt-BR')} – ${now.toLocaleDateString('pt-BR')}`;

  return <CostClient breakdown={breakdown} heatmap={heatmap} period={period} />;
}
