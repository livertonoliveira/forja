import { NextRequest, NextResponse } from 'next/server'

export function middleware(request: NextRequest): NextResponse {
  if (request.nextUrl.pathname.startsWith('/dlq')) {
    const role = request.cookies.get('forja-role')?.value
    if (role !== 'admin') {
      return NextResponse.json(
        { error: 'Forbidden. Admin role required.' },
        { status: 403 }
      )
    }
  }
  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
}
