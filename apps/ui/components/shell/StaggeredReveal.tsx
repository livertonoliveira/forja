'use client';

import React from 'react';
import { cn } from '@/lib/utils';

interface StaggeredRevealProps {
  children: React.ReactNode;
  staggerMs?: number;
  className?: string;
}

export function StaggeredReveal({ children, staggerMs = 50, className }: StaggeredRevealProps) {
  const items = React.Children.toArray(children).filter(Boolean);
  return (
    <>
      {items.map((child, i) => (
        <div
          key={i}
          className={cn('animate-fade-in-up', className)}
          style={{ animationDelay: `${i * staggerMs}ms`, animationFillMode: 'both' }}
        >
          {child}
        </div>
      ))}
    </>
  );
}
