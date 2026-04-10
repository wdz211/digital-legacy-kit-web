// app/api/import/route.ts — POST /api/import
import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '../../_shared/db'
import { getCurrentUser } from '../../_shared/auth'
import * as XLSX from 'xlsx'
import crypto from 'crypto'

function uuid() { return crypto.randomUUID() }
function sha256(text: string) { return crypto.createHash('sha256').update(text).digest('hex') }

function parseXlsx(buffer: Buffer) {
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true })
  const ws = wb.Sheets[wb.SheetNames[0]]
  const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1 })
  if (!rows?.length) throw new Error('文件为空')

  // Find header row
  let headerIdx = 0
  for (let i = 0; i < Math.min(10, rows.length); i++) {
    const r = rows[i]
    if (r?.some(c => String(c||'').toLowerCase().includes('time') && r.some(c => String(c||'').toLowerCase().includes('content'))) {
      headerIdx = i; break
    }
  }
  const headers = rows[headerIdx].map(String)
  const colTime = headers.findIndex(h => /time|时间|日期/.test(h))
  const colSpeaker = headers.findIndex(h => /speaker|发送者|昵称|nick/.test(h))
  const colContent = headers.findIndex(h => /content|内容|消息/.test(h))
  const cTime = colTime >= 0 ? colTime : 0
  const cSpeaker = colSpeaker >= 0 ? colSpeaker : 1
  const cContent = colContent >= 0 ? colContent : 2

  const messages: any[] = []
  const otherSpeakers = new Set<string>()

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i]
    if (!row || row.every(c => !c)) continue
    const content = row[cContent]
    if (!content || !String(content).trim()) continue
    const contentStr = String(content).trim()
    if (['以上是聊天记录', '%%emoji', '图片', '[图片]', '语音', '[语音]'].some(k => contentStr.includes(k))) continue
    const speaker = String(row[cSpeaker] || '未知')
    if (!['我', 'me', 'Me', 'ME', '自己'].includes(speaker)) otherSpeakers.add(speaker)
    messages.push({ speaker, content: contentStr, time: String(row[cTime] || '') })
  }

  let contactName = '未知联系人'
  if (otherSpeakers.size > 0) {
    const counts: Record<string, number> = {}
    for (const m of messages) {
      if (!['我', 'me', 'Me', 'ME', '自己'].includes(m.speaker)) {
        counts[m.speaker] = (counts[m.speaker] || 0) + 1
      }
    }
    contactName = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || '未知联系人'
  }

  return { contactName, messages, messageCount: messages.length }
}

function sampleMessages(messages: any[], maxCount = 500) {
  if (messages.length <= maxCount) return messages
  const head = messages.slice(0, 50)
  const tail = messages.slice(-50)
  const step = messages.length / maxCount
  const body = messages.slice(50, -50).filter((_, i) => i % Math.ceil(step) < 1)
  return [...head, ...body, ...tail]
}

async function callLLMExtract(
  messagesText: string,
  contactName: string,
  apiType: string,
  apiKey: string,
  model: string
) {
  const systemPrompt = `你是一个聊天记录分析专家。从给定的微信聊天记录中提取人物特征。
分析这个人的语言风格、性格特征、常用表达和话题偏好。
输出严格 JSON 格式，不要包含任何其他文字：
{
  "name": "人物称呼",
  "description": "一段简洁的人物简介（50字以内）",
  "language_style": "语言风格描述（30字以内）",
  "personality_traits": ["trait1", "trait2", "trait3"],
  "common_phrases": ["口头禅1", "口头禅2"],
  "topics": ["topic1", "topic2", "topic3"]
}`
  const userPrompt = `以下是微信聊天记录（共 contact: ${contactName}）：\n\n${messagesText}\n\n请提取这个人物的特征信息。`

  const url = apiType === 'claude'
    ? 'https://api.anthropic.com/v1/messages'
    : apiType === 'dashscope'
    ? 'https://dashscope.aliyuncs.com/api/v1/services/aigc/text-generation/generation'
    : 'https://api.openai.com/v1/chat/completions'

  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  let body: any

  if (apiType === 'claude') {
    headers['x-api-key'] = apiKey
    headers['anthropic-version'] = '2023-06-01'
    body = { model, max_tokens: 1024, system: systemPrompt, messages: [{ role: 'user', content: userPrompt }] }
  } else if (apiType === 'dashscope') {
    headers['Authorization'] = `Bearer ${apiKey}`
    body = { model, input: { messages: [{ role: 'user', content: `${systemPrompt}\n\n${userPrompt}` }], parameters: { result_format: 'message' } }
  } else {
    headers['Authorization'] = `Bearer ${apiKey}`
    body = { model, messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }], temperature: 0.7 }
  }

  const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) })
  if (!res.ok) throw new Error(`LLM API error: ${res.status} ${await res.text()}`)
  const data = await res.json()

  let text: string
  if (apiType === 'claude') text = data.content?.[0]?.text
  else if (apiType === 'dashscope') text = data.output?.choices?.[0]?.message?.content
  else text = data.choices?.[0]?.message?.content

  const cleaned = text.replace(/^```json\s*/, '').replace(/\s*```$/, '').trim()
  return JSON.parse(cleaned)
}

export async function POST(request: NextRequest) {
  try {
    const user = getCurrentUser(request.headers.get('authorization'))
    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const apiType = (formData.get('api_type') as string) || 'dashscope'
    const apiKey = formData.get('api_key') as string
    const model = (formData.get('model') as string) || 'qwen-plus'

    if (!apiKey) return NextResponse.json({ error: 'api_key 必填' }, { status: 400 })

    let contactName: string
    let messageCount: number
    let extracted: any
    let messages: any[]
    let fileHash: string

    if (file) {
      // Parse xlsx
      const buffer = Buffer.from(await file.arrayBuffer())
      fileHash = sha256(buffer.toString('base64'))
      const { contactName: cn, messages: msgs, messageCount: mc } = parseXlsx(buffer)
      contactName = cn; messages = msgs; messageCount = mc

      // Check dedup
      const db = getDb()
      const existing = db.prepare(
        'SELECT id, contact_name FROM import_records WHERE user_id=? AND file_hash=?'
      ).get(user.user_id, fileHash) as any
      if (existing) {
        return NextResponse.json({
          error: 'duplicate',
          message: `该文件已导入（联系人：${existing.contact_name}）`
        }, { status: 409 })
      }

      // Call LLM
      const sampled = sampleMessages(messages)
      const text = sampled.map((m: any) =>
        `${['我', 'me', 'Me', 'ME', '自己'].includes(m.speaker) ? '我' : '对方'}: ${m.content}`
      ).join('\n')
      try {
        extracted = await callLLMExtract(text, contactName, apiType, apiKey, model)
      } catch (e: any) {
        return NextResponse.json({ error: 'extraction_failed', message: e.message }, { status: 422 })
      }
    } else {
      // JSON mode
      const body = await request.json()
      const { messages: msgsJson, contact_name, extracted_persona } = body as any
      if (!msgsJson || !Array.isArray(msgsJson)) {
        return NextResponse.json({ error: 'messages 必填' }, { status: 400 })
      }
      messages = msgsJson; contactName = contact_name || '未知联系人'; messageCount = messages.length
      fileHash = sha256(JSON.stringify(messages))
      extracted = extracted_persona || {}
    }

    const personaId = uuid()
    const now = new Date().toISOString()
    const db = getDb()
    db.prepare(
      'INSERT INTO import_records (user_id, file_hash, file_name, contact_name, message_count, created_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(user.user_id, fileHash, 'upload.xlsx', contactName, messageCount, now)
    db.prepare(
      `INSERT INTO personas (user_id, persona_id, name, description, chat_data, extracted_persona, message_count, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      user.user_id, personaId,
      extracted.name || contactName,
      extracted.description || '',
      JSON.stringify({ messages: messages.slice(0, 100) }),
      JSON.stringify(extracted),
      messageCount, now
    )

    return NextResponse.json({
      success: true,
      persona_id: personaId,
      contact_name: contactName,
      message_count: messageCount,
      extracted_persona: extracted
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
