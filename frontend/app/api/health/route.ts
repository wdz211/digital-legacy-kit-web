// app/api/health/route.ts — GET /api/health
import { NextResponse } from 'next/server'
import { getDb } from '../../_shared/db'

export async function GET() {
  try {
    getDb() // init if needed
    return NextResponse.json({ status: 'ok', version: '2.0.0-ts' })
  } catch (e: any) {
    return NextResponse.json({ status: 'error', message: e.message }, { status: 500 })
  }
}
