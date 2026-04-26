import { NextRequest, NextResponse } from 'next/server'

export function middleware(_request: NextRequest): NextResponse {
  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
}
