// app/api/_shared/auth.ts — JWT utilities using jose
import { SignJWT, jwtVerify } from 'jose'

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'dev-secret-change-in-production'
)
const ALGORITHM = 'HS256'

export interface TokenPayload {
  sub: string  // user_id
  phone: string
}

export async function createToken(userId: number, phone: string): Promise<string> {
  return new SignJWT({ phone })
    .setProtectedHeader({ alg: ALGORITHM })
    .setSubject(String(userId))
    .setExpirationTime('30d')
    .sign(JWT_SECRET)
}

export async function verifyToken(authHeader: string): Promise<TokenPayload> {
  if (!authHeader.startsWith('Bearer ')) throw new Error('无效的认证格式')
  const token = authHeader.slice(7)
  const { payload } = await jwtVerify(token, JWT_SECRET, { algorithms: [ALGORITHM] })
  if (!payload.sub || !payload.phone) throw new Error('Token 无效')
  return { sub: payload.sub, phone: payload.phone as string }
}

export function getCurrentUser(authHeader: string | null): { user_id: number; phone: string } {
  if (!authHeader) throw new Error('未提供认证信息')
  try {
    const payload = await verifyToken(authHeader)
    return { user_id: parseInt(payload.sub), phone: payload.phone }
  } catch (e: any) {
    throw new Error(e.message || 'Token 无效或已过期')
  }
}
