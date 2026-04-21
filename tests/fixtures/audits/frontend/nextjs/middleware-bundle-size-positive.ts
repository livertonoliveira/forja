import { NextRequest, NextResponse } from 'next/server';
import _ from 'lodash';
import moment from 'moment';

// Antipattern: heavy libraries imported in middleware running on every Edge request.
export function middleware(request: NextRequest) {
  const pathname = _.trim(request.nextUrl.pathname, '/');
  const timestamp = moment().format('YYYY-MM-DD HH:mm:ss');
  console.log(`[${timestamp}] Request to: ${pathname}`);
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
