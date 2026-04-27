'use client';

// Antipattern: 'use client' on a layout/wrapper with no interactivity.
// No hooks or event handlers — this component should be a Server Component.
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="layout-wrapper">
      <header className="site-header">
        <nav>Navigation</nav>
      </header>
      <main>{children}</main>
      <footer>Footer</footer>
    </div>
  );
}
