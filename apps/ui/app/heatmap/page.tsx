import { getTranslations } from 'next-intl/server';
import HeatmapGrid from '@/components/HeatmapGrid';

export const dynamic = 'force-dynamic';

export default async function HeatmapPage() {
  const t = await getTranslations('heatmap');

  return (
    <div>
      <h1 className="text-xl font-semibold text-forja-text-primary mb-2">{t('title')}</h1>
      <p className="text-sm text-forja-text-secondary mb-6">
        {t('desc')}
      </p>
      <HeatmapGrid />
    </div>
  );
}
