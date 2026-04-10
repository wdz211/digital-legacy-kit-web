// app/api/personas/route.ts — GET/POST /api/personas
import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '../../_shared/db'
import { getCurrentUser } from '../../_shared/auth'
import crypto from 'crypto'

function uuid() {
  return crypto.randomUUID()
}

export async function GET(request: NextRequest) {
  try {
    const user = getCurrentUser(request.headers.get('authorization'))
    const db = getDb()
    const rows = db.prepare(
      'SELECT persona_id, name, description, message_count, created_at FROM personas WHERE user_id=? ORDER BY created_at DESC'
    ).all(user.user_id) as any[]
    return NextResponse.json({ personas: rows })
  } catch (e: any) {
    const status = e.message?.includes('Token') ? 401 : 500
    return NextResponse.json({ error: e.message }, { status })
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = getCurrentUser(request.headers.get('authorization'))
    const body = await request.json()
    const { name, description, extracted_persona, chat_data } = body as any
    if (!name?.trim()) {
      return NextResponse.json({ error: 'name 必填' }, { status: 400 })
    }
    const personaId = uuid()
    const db = getDb()
    db.prepare(
      `INSERT INTO personas (user_id, persona_id, name, description, extracted_persona, chat_data, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(
      user.user_id,
      personaId,
      name.trim(),
      description || '',
      JSON.stringify(extracted_persona || {}),
      JSON.stringify(chat_data || {}),
      new Date().toISOString()
    )
    return NextResponse.json({ persona_id: personaId, name: name.trim() }, { status: 201 })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
