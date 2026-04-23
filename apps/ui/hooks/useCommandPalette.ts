'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';

type UseCommandPaletteReturn = {
  open: boolean;
  setOpen: (open: boolean) => void;
  openPalette: () => void;
  closePalette: () => void;
};

export function useCommandPalette(): UseCommandPaletteReturn {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const chordKeyRef = useRef<string | null>(null);
  const chordTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const openPalette = useCallback(() => setOpen(true), []);
  const closePalette = useCallback(() => setOpen(false), []);

  useEffect(() => {
    function clearChord() {
      chordKeyRef.current = null;
      if (chordTimerRef.current !== null) {
        clearTimeout(chordTimerRef.current);
        chordTimerRef.current = null;
      }
    }

    function isInputFocused(): boolean {
      const el = document.activeElement;
      if (!el) return false;
      const tag = el.tagName.toUpperCase();
      return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
    }

    function handleKeyDown(e: KeyboardEvent) {
      // ⌘K / Ctrl+K — open palette
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen(true);
        clearChord();
        return;
      }

      // ⌘/ (Meta+slash) — open palette
      if (e.metaKey && e.key === '/') {
        e.preventDefault();
        setOpen(true);
        clearChord();
        return;
      }

      // Escape — close palette when open
      if (e.key === 'Escape' && open) {
        setOpen(false);
        clearChord();
        return;
      }

      // Chord shortcuts — skip if input is focused or palette is open
      if (open || isInputFocused()) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      const key = e.key.toLowerCase();

      if (chordKeyRef.current === 'g') {
        clearChord();
        if (key === 'r') {
          e.preventDefault();
          router.push('/runs');
          return;
        }
        if (key === 'c') {
          e.preventDefault();
          router.push('/cost');
          return;
        }
        if (key === 'h') {
          e.preventDefault();
          router.push('/heatmap');
          return;
        }
        // unrecognized second key — fall through
        return;
      }

      if (key === 'g') {
        chordKeyRef.current = 'g';
        chordTimerRef.current = setTimeout(clearChord, 1000);
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      clearChord();
    };
  }, [open, router]);

  return { open, setOpen, openPalette, closePalette };
}
