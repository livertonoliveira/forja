'use client';

import { Badge } from "@/components/ui/badge"
import { useTranslations } from 'next-intl';

export default function RegressionBadge() {
  const t = useTranslations('regression');
  return (
    <Badge variant="fail" title={t('title')}>
      {t('label')}
    </Badge>
  )
}
