import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';

export const metadata: Metadata = {
  title: 'Forja UI',
  description: 'Forja Harness Engine',
};

const navLinks = [
  { href: '/', label: 'Home' },
  { href: '/runs', label: 'Runs' },
  { href: '/issues', label: 'Issues' },
  { href: '/cost', label: 'Cost' },
  { href: '/heatmap', label: 'Heatmap' },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="flex min-h-screen bg-gray-950 text-gray-100">
        <nav className="w-48 shrink-0 border-r border-gray-800 px-4 py-6 flex flex-col gap-1">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-4">
            Forja
          </span>
          {navLinks.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className="px-3 py-2 rounded-md text-sm text-gray-300 hover:bg-gray-800 hover:text-white transition-colors"
            >
              {label}
            </Link>
          ))}
        </nav>
        <main className="flex-1 p-8 min-w-0">{children}</main>
      </body>
    </html>
  );
}
