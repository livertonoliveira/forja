import { NextResponse } from 'next/server'
import { readActiveLocale } from '@/lib/active-locale'

export const revalidate = 60

export async function GET(): Promise<NextResponse> {
  try {
    const locale = await readActiveLocale()
    return NextResponse.json({ locale })
  } catch {
    return NextResponse.json({ locale: 'en' })
  }
}
