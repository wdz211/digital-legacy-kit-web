// app/api/persona/[id]/route.ts — GET/PATCH/DELETE /api/persona/{id}
import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '../../../_shared/db'
import { getCurrentUser } from '../../../_shared/auth'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const user = getCurrentUser(request.headers.get('authorization'))
    const db = getDb()
    const row = db.prepare(
      'SELECT * FROM personas WHERE persona_id=? AND user_id=?'
    ).get(id, user.user_id) as any
    if (!row) return NextResponse.json({ error: '不存在' }, { status: 404 })
    return NextResponse.json({
      ...row,
      extracted_persona: JSON.parse(row.extracted_persona || '{}'),
      chat_data: JSON.parse(row.chat_data || '{}')
    })
  } catch (e: any) {
    const status = e.message?.includes('Token') ? 401 : 500
    return NextResponse.json({ error: e.message }, { status })
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const user = getCurrentUser(request.headers.get('authorization'))
    const body = await request.json()
    const db = getDb()
    const fields: string[] = []
    const vs: any[] = []
    for (const [k, v] of Object.entries(body)) {
      if (['name', 'description', 'extracted_persona'].includes(k)) {
        fields.push(`${k}=?`)
        vs.push(k === 'extracted_persona' ? JSON.stringify(v) : v)
      }
    }
    if (!fields.length) return NextResponse.json({ error: '没有要更新的字段' }, { status: 400 })
    vs.push(id, user.user_id)
    const result = db.prepare(
      `UPDATE personas SET ${fields.join(',')} WHERE persona_id=? AND user_id=?`
    ).run(...vs)
    if (result.changes === 0) return NextResponse.json({ error: '不存在' }, { status: 404 })
    return NextResponse.json({ success: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const user = getCurrentUser(request.headers.get('authorization'))
    const db = getDb()
    const result = db.prepare(
      'DELETE FROM personas WHERE persona_id=? AND user_id=?'
    ).run(id, user.user_id)
    if (result.changes === 0) return NextResponse.json({ error: '不存在' }, { status: 404 })
    db.prepare('DELETE FROM chat_history WHERE persona_id=?').run(id)
    return NextResponse.json({ success: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
