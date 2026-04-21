// Antipattern: revalidate = 0 effectively disables ISR (behaves like SSR).
export const revalidate = 0;

export default async function Page() {
  const res = await fetch('https://api.example.com/news');
  const data = await res.json();
  return <main>{data.title}</main>;
}
