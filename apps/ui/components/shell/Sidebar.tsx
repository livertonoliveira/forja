'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
// lucide-react v0.x ships a single barrel (dist/esm/lucide-react.js) with no
// per-icon subpath exports declared in package.json and no per-icon .d.ts files.
// Individual subpath imports (e.g. lucide-react/dist/esm/icons/play) are not
// resolvable by TypeScript and would break the build. Tree-shaking is handled
// by the bundler (Next.js / webpack) via the named exports below.
// Revisit if lucide-react adds a proper `exports` map in a future major version.
import {
  Play,
  AlertCircle,
  DollarSign,
  Map,
  Layers,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const STORAGE_KEY = 'forja-sidebar-collapsed';

type NavItem = {
  href: string;
  label: string;
  icon: React.ElementType;
};

const pipelineItems: NavItem[] = [
  { href: '/runs', label: 'Runs', icon: Play },
  { href: '/issues', label: 'Issues', icon: AlertCircle },
  { href: '/cost', label: 'Cost', icon: DollarSign },
];

const observabilityItems: NavItem[] = [
  { href: '/heatmap', label: 'Heatmap', icon: Map },
  { href: '/dlq', label: 'DLQ', icon: Layers },
];

function NavGroup({
  items,
  label,
  collapsed,
  pathname,
}: {
  items: NavItem[];
  label: string;
  collapsed: boolean;
  pathname: string;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      {!collapsed && (
        <span className="px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-forja-text-muted font-medium">
          {label}
        </span>
      )}
      {items.map(({ href, label: itemLabel, icon: Icon }) => {
        const active = pathname === href || pathname.startsWith(href + '/');
        return (
          <Link
            key={href}
            href={href}
            title={collapsed ? itemLabel : undefined}
            className={cn(
              'flex items-center gap-3 px-3 py-2 text-sm transition-colors relative',
              'hover:bg-forja-bg-overlay hover:text-forja-text-primary',
              active
                ? 'bg-forja-bg-overlay text-forja-text-primary border-l-2 border-forja-border-gold'
                : 'text-forja-text-secondary border-l-2 border-transparent',
            )}
          >
            <Icon
              size={16}
              className={cn(
                'shrink-0',
                active ? 'text-forja-text-gold' : 'text-forja-text-secondary',
              )}
            />
            {!collapsed && <span className="truncate">{itemLabel}</span>}
          </Link>
        );
      })}
    </div>
  );
}

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(
    () => typeof window !== 'undefined' && localStorage.getItem(STORAGE_KEY) === 'true',
  );
  const pathname = usePathname();

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, String(collapsed));
  }, [collapsed]);

  function toggle() {
    setCollapsed((prev) => !prev);
  }

  return (
    <aside
      className={cn(
        'sticky top-0 h-screen shrink-0 flex flex-col bg-forja-bg-surface border-r border-forja-border-subtle z-30',
        'transition-[width] duration-250 ease-out',
        collapsed ? 'w-16' : 'w-60',
      )}
    >
      <div className="flex items-center px-4 h-14 shrink-0">
        {collapsed ? (
          <span className="font-display text-lg text-forja-text-gold tracking-tight select-none">
            F
          </span>
        ) : (
          <span className="font-display text-lg text-forja-text-gold tracking-tight [font-feature-settings:'smcp'] select-none">
            Forja
          </span>
        )}
      </div>

      <div className="h-px bg-forja-border-gold/20 mx-3 shrink-0" />

      <nav className="flex-1 overflow-y-auto overflow-x-hidden py-3 flex flex-col gap-4">
        <NavGroup
          items={pipelineItems}
          label="Pipeline"
          collapsed={collapsed}
          pathname={pathname}
        />
        <div className="h-px bg-forja-border-subtle mx-3" />
        <NavGroup
          items={observabilityItems}
          label="Observabilidade"
          collapsed={collapsed}
          pathname={pathname}
        />
      </nav>

      <div className="h-px bg-forja-border-subtle mx-3 shrink-0" />
      <div className="flex items-center justify-end p-3 shrink-0">
        <button
          onClick={toggle}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className="flex items-center justify-center w-7 h-7 rounded-md text-forja-text-secondary hover:bg-forja-bg-overlay hover:text-forja-text-primary transition-colors"
        >
          {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        </button>
      </div>
    </aside>
  );
}
