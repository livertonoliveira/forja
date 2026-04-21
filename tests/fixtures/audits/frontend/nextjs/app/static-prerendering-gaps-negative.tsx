// Correct: explicit revalidation config aligns caching intent with data freshness.
export const revalidate = 3600;

export default async function Page() {
  const res = await fetch('https://api.example.com/catalog', {
    next: { revalidate: 3600 },
  });
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
