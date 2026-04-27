'use client';

import { Button } from '@/components/ui/button';
import { toast } from '@/lib/toast';
import { useTranslations } from 'next-intl';

export function CopyLinkButton() {
  const t = useTranslations('common_actions');

  async function handleCopy() {
    await navigator.clipboard.writeText(window.location.href);
    toast.success(t('copy_link_success'));
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleCopy}
    >
      {t('copy_link')}
    </Button>
  );
}
