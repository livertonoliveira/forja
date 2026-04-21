// Correct: route handler with explicit revalidate config.
export const revalidate = 3600;

export async function GET() {
  const res = await fetch('https://api.example.com/products', {
    next: { revalidate: 3600 },
  });
  const data = await res.json();
  return Response.json(data);
}
