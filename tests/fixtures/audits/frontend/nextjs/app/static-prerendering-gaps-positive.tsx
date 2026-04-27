// Antipattern: data fetch without any explicit cache configuration.
// Next.js App Router (v14+) treats unconfigured fetches in dynamic contexts as SSR.

export default async function Page() {
  const res = await fetch('https://api.example.com/catalog');
  const catalog = await res.json();

  return (
    <main>
      <h1>Product Catalog</h1>
      <ul>
        {catalog.items.map((item: { id: string; name: string }) => (
          <li key={item.id}>{item.name}</li>
        ))}
      </ul>
    </main>
  );
}
