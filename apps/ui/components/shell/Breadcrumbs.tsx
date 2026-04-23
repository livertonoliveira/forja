'use client';

import { useSelectedLayoutSegments } from 'next/navigation';
import Link from 'next/link';

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function Breadcrumbs() {
  const segments = useSelectedLayoutSegments();

  if (segments.length === 0) {
    return (
      <span className="text-sm text-forja-text-primary font-medium">Home</span>
    );
  }

  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-sm">
      <Link href="/" className="text-forja-text-secondary hover:text-forja-text-primary transition-colors">
        Home
      </Link>
      {segments.map((segment, index) => {
        const href = '/' + segments.slice(0, index + 1).join('/');
        const isLast = index === segments.length - 1;
        return (
          <span key={href} className="flex items-center gap-1.5">
            <span className="text-forja-text-gold/70 select-none">›</span>
            {isLast ? (
              <span className="text-forja-text-primary font-medium">
                {capitalize(segment)}
              </span>
            ) : (
              <Link
                href={href}
                className="text-forja-text-secondary hover:text-forja-text-primary transition-colors"
              >
                {capitalize(segment)}
              </Link>
            )}
          </span>
        );
      })}
    </nav>
  );
}
