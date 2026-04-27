'use client';

import { Button } from '@/components/ui/button';
import { toast } from '@/lib/toast';

export function CopyLinkButton() {
  async function handleCopy() {
    await navigator.clipboard.writeText(window.location.href);
    toast.success('Link copiado!');
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleCopy}
    >
      Copiar link
    </Button>
  );
}
