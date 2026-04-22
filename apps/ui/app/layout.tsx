import type { Metadata } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import Link from 'next/link';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
});

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
    <html lang="en" className={`dark ${inter.variable} ${jetbrainsMono.variable}`}>
      <body className="flex min-h-screen bg-forja-bg-base text-forja-text-primary">
        <nav className="w-48 shrink-0 border-r border-forja-border-subtle px-4 py-6 flex flex-col gap-1">
          <span className="text-xs font-semibold text-forja-text-muted uppercase tracking-widest mb-4">
            Forja
          </span>
          {navLinks.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className="px-3 py-2 rounded-md text-sm text-forja-text-secondary hover:bg-forja-bg-elevated hover:text-forja-text-primary transition-colors"
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
