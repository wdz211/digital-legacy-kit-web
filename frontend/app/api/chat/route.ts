// app/api/chat/route.ts — POST /api/chat
import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '../../_shared/db'
import { getCurrentUser } from '../../_shared/auth'

function buildSystemPrompt(extracted: any) {
  const traits = (extracted.personality_traits || []).join(' / ')
  const phrases = (extracted.common_phrases || []).join(' / ')
  const topics = (extracted.topics || []).join(' / ')
  return `你是一个名为「${extracted.name || '某人}」的数字克隆体，基于该人物的微信聊天记录训练而成。
你的任务是延续这个角色的性格、语气、表达习惯，与用户进行自然的对话。

人物简介：${extracted.description || ''}
语言风格：${extracted.language_style || ''}
性格特征：${traits}
常用口头禅：${phrases}
话题偏好：${topics}

请以「${extracted.name}」的身份，用符合上述特征的方式回复。`
}

async function callLLM(
  apiType: string, apiKey: string, model: string,
  systemPrompt: string, userInput: string
): Promise<string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  let url: string
  let body: any

  if (apiType === 'claude') {
    url = 'https://api.anthropic.com/v1/messages'
    headers['x-api-key'] = apiKey
    headers['anthropic-version'] = '2023-06-01'
    body = { model, max_tokens: 1024, system: systemPrompt, messages: [{ role: 'user', content: userInput }] }
  } else if (apiType === 'dashscope') {
    url = 'https://dashscope.aliyuncs.com/api/v1/services/aigc/text-generation/generation'
    headers['Authorization'] = `Bearer ${apiKey}`
    body = { model, input: { messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userInput }], parameters: { result_format: 'message' } }
  } else {
    url = 'https://api.openai.com/v1/chat/completions'
    headers['Authorization'] = `Bearer ${apiKey}`
    body = { model, messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userInput }], temperature: 0.7 }
  }

  const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) })
  if (!res.ok) throw new Error(`LLM API error: ${res.status} ${await res.text()}`)
  const data = await res.json()

  if (apiType === 'claude') return data.content?.[0]?.text || ''
  if (apiType === 'dashscope') return data.output?.choices?.[0]?.message?.content || ''
  return data.choices?.[0]?.message?.content || ''
}

export async function POST(request: NextRequest) {
  try {
    const user = getCurrentUser(request.headers.get('authorization'))
    const body = await request.json()
    const { persona_id, user_input, api_type, api_key, model } = body

    if (!persona_id || !user_input) {
      return NextResponse.json({ error: 'persona_id 和 user_input 必填' }, { status: 400 })
    }
    if (!api_type || !api_key || !model) {
      return NextResponse.json({ error: 'api_type, api_key, model 必填' }, { status: 400 })
    }

    const db = getDb()
    const persona = db.prepare(
      'SELECT * FROM personas WHERE persona_id=? AND user_id=?'
    ).get(persona_id, user.user_id) as any
    if (!persona) return NextResponse.json({ error: 'persona 不存在' }, { status: 404 })

    const extracted = JSON.parse(persona.extracted_persona || '{}')
    if (!extracted?.name) {
      return NextResponse.json({ error: 'persona 未完成导入，无法对话' }, { status: 422 })
    }

    const systemPrompt = buildSystemPrompt(extracted)
    const now = new Date().toISOString()
    db.prepare(
      'INSERT INTO chat_history (persona_id, role, content, created_at) VALUES (?, ?, ?, ?)'
    ).run(persona_id, 'user', user_input, now)

    let reply = ''
    try {
      reply = await callLLM(api_type, api_key, model, systemPrompt, user_input)
    } catch (e: any) {
      return NextResponse.json({ error: `LLM 调用失败: ${e.message}` }, { status: 502 })
    }

    db.prepare(
      'INSERT INTO chat_history (persona_id, role, content, created_at) VALUES (?, ?, ?, ?)'
    ).run(persona_id, 'assistant', reply, new Date().toISOString())

    return NextResponse.json({ content: reply })
  } catch (e: any) {
    const status = e.message?.includes('Token') ? 401 : 500
    return NextResponse.json({ error: e.message }, { status })
  }
}
