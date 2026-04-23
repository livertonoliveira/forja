import HeatmapGrid from '@/components/HeatmapGrid';

export const dynamic = 'force-dynamic';

export default function HeatmapPage() {
  return (
    <div>
      <h1 className="text-xl font-semibold text-forja-text-primary mb-2">Heatmap de Atividade</h1>
      <p className="text-sm text-forja-text-secondary mb-6">
        Intensidade de atividade por dia e hora — últimos 365 dias
      </p>
      <HeatmapGrid />
    </div>
  );
}
