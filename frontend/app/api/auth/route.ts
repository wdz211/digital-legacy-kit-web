// app/api/auth/route.ts — POST /api/auth
import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '../../_shared/db'
import { createToken } from '../../_shared/auth'
import { SignJWT } from 'jose'
import crypto from 'crypto'

function sha256(text: string): string {
  return crypto.createHash('sha256').update(text).digest('hex')
}

function makeCode() {
  return Math.floor(100000 + Math.random() * 900000).toString()
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { action, phone, code, password } = body as {
      action: string
      phone?: string
      code?: string
      password?: string
    }

    const db = getDb()

    if (action === 'send_code') {
      if (!phone || !/^1[3-9]\d{9}$/.test(phone)) {
        return NextResponse.json({ error: '手机号格式错误' }, { status: 400 })
      }
      const verificationCode = makeCode()
      const now = new Date()
      const expires = new Date(now.getTime() + 5 * 60 * 1000)
      db.prepare('DELETE FROM verification_codes WHERE phone=?').run(phone)
      db.prepare(
        'INSERT INTO verification_codes (phone, code, created_at, expires_at) VALUES (?, ?, ?, ?)'
      ).run(phone, verificationCode, now.toISOString(), expires.toISOString())
      console.log(`[DEV] Verification code for ${phone}: ${verificationCode}`)
      return NextResponse.json({ success: true, dev_code: verificationCode })
    }

    if (action === 'login') {
      if (!phone || !code) {
        return NextResponse.json({ error: '手机号和验证码必填' }, { status: 400 })
      }
      const row = db.prepare(
        'SELECT * FROM verification_codes WHERE phone=? AND used=0 ORDER BY created_at DESC LIMIT 1'
      ).get(phone) as any
      if (!row) return NextResponse.json({ error: '未找到有效验证码' }, { status: 400 })
      if (new Date() > new Date(row.expires_at)) {
        return NextResponse.json({ error: '验证码已过期，请重新获取' }, { status: 400 })
      }
      if (row.code !== code) {
        return NextResponse.json({ error: '验证码错误' }, { status: 400 })
      }
      db.prepare('UPDATE verification_codes SET used=1 WHERE id=?').run(row.id)
      let user = db.prepare('SELECT id FROM users WHERE phone=?').get(phone) as any
      let userId: number
      if (!user) {
        const result = db.prepare('INSERT INTO users (phone, created_at) VALUES (?, ?)').run(phone, new Date().toISOString())
        userId = result.lastInsertRowid as number
      } else {
        userId = user.id
      }
      const token = await createToken(userId, phone)
      return NextResponse.json({ token, user_id: userId })
    }

    if (action === 'login_password') {
      if (!phone || !password) {
        return NextResponse.json({ error: '手机号和密码必填' }, { status: 400 })
      }
      const pwHash = sha256(password)
      const user = db.prepare('SELECT id FROM users WHERE phone=? AND password_hash=?').get(phone, pwHash) as any
      if (!user) return NextResponse.json({ error: '手机号或密码错误' }, { status: 401 })
      const token = await createToken(user.id, phone)
      return NextResponse.json({ token, user_id: user.id })
    }

    if (action === 'register_password') {
      if (!phone || !/^1[3-9]\d{9}$/.test(phone)) {
        return NextResponse.json({ error: '手机号格式错误' }, { status: 400 })
      }
      if (!password || password.length < 6) {
        return NextResponse.json({ error: '密码至少6位' }, { status: 400 })
      }
      const existing = db.prepare('SELECT id FROM users WHERE phone=?').get(phone)
      if (existing) {
        return NextResponse.json({ error: '该手机号已注册，请直接登录' }, { status: 409 })
      }
      const pwHash = sha256(password)
      const result = db.prepare(
        'INSERT INTO users (phone, password_hash, created_at) VALUES (?, ?, ?)'
      ).run(phone, pwHash, new Date().toISOString())
      const userId = result.lastInsertRowid as number
      const token = await createToken(userId, phone)
      return NextResponse.json({ token, user_id: userId }, { status: 201 })
    }

    return NextResponse.json({ error: 'unknown action' }, { status: 400 })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'server error' }, { status: 500 })
  }
}
