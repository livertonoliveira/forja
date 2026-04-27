// Antipattern: route handler with no explicit cache configuration.
// Next.js defaults are ambiguous across versions — always be explicit.

export async function GET() {
  const res = await fetch('https://api.example.com/products');
  const data = await res.json();
  return Response.json(data);
}

export async function POST(request: Request) {
  const body = await request.json();
  const res = await fetch('https://api.example.com/products', {
    method: 'POST',
    body: JSON.stringify(body),
  });
  return Response.json(await res.json());
}
