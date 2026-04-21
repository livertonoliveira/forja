import { NextRequest, NextResponse } from 'next/server';

// Correct: middleware uses only Edge-compatible, lightweight imports.
export function middleware(request: NextRequest) {
  const token = request.cookies.get('auth-token');
  if (!token) {
    return NextResponse.redirect(new URL('/login', request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/dashboard/:path*', '/settings/:path*'],
};
