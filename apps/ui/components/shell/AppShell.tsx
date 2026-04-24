'use client';

import type { ReactNode } from 'react';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { CommandPalette } from './CommandPalette';
import { useCommandPalette } from '@/hooks/useCommandPalette';
import { Toaster } from 'sonner';

export function AppShell({ children }: { children: ReactNode }) {
  const { open, openPalette, closePalette } = useCommandPalette();

  return (
    <>
      <Sidebar />
      <div className="flex flex-col flex-1 min-w-0 min-h-screen">
        <TopBar onSearchOpen={openPalette} />
        <main className="flex-1 p-8 min-w-0 relative overflow-x-hidden">
          {children}
          <span
            aria-hidden="true"
            className="pointer-events-none select-none absolute bottom-6 right-8 font-display text-[7rem] leading-none text-forja-text-gold/[0.03] font-semibold tracking-tight [font-feature-settings:'smcp']"
          >
            Forja
          </span>
        </main>
      </div>
      <CommandPalette open={open} onClose={closePalette} />
      <Toaster position="top-right" closeButton duration={4000} />
    </>
  );
}
