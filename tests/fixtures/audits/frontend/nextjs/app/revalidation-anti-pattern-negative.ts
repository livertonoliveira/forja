// Correct: revalidate set to a reasonable interval matching data freshness needs.
export const revalidate = 3600;

export default async function Page() {
  const res = await fetch('https://api.example.com/news', {
    next: { revalidate: 3600 },
  });
  const data = await res.json();
  return <main>{data.title}</main>;
}
