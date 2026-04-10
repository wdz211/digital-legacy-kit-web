// -*- coding: utf-8 -*-
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

const API_BASE = (import.meta as any).env?.VITE_API_BASE || '/api/v1'

// ── Types ───────────────────────────────────────────────────────────────────

export interface User {
  user_id: number
  phone: string
}

export interface Persona {
  persona_id: string
  name: string
  description: string
  message_count: number
  created_at: string
  chat_data?: any
  extracted_persona?: ExtractedPersona
}

export interface ExtractedPersona {
  name: string
  description: string
  language_style: string
  personality_traits: string[]
  common_phrases: string[]
  topics: string[]
}

export interface Message {
  id: number
  role: 'user' | 'assistant'
  content: string
  created_at: string
}

export interface ApiKey {
  type: 'openai' | 'claude' | 'dashscope'
  key: string
  model: string
}

// ── Auth Store ────────────────────────────────────────────────────────────────

interface AuthState {
  token: string | null
  user: User | null
  isLoading: boolean
  error: string | null
  login: (phone: string, code: string) => Promise<void>
  loginPassword: (phone: string, password: string) => Promise<void>
  sendCode: (phone: string) => Promise<void>
  logout: () => void
  clearError: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      isLoading: false,
      error: null,

      sendCode: async (phone: string) => {
        const res = await fetch(`${API_BASE}/auth/send_code`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.detail || '发送失败')
        return
      },

      login: async (phone: string, code: string) => {
        set({ isLoading: true, error: null })
        try {
          const res = await fetch(`${API_BASE}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone, code }),
          })
          const data = await res.json()
          if (!res.ok) throw new Error(data.detail || '登录失败')
          set({ token: data.token, user: { user_id: data.user_id, phone } })
        } catch (e: any) {
          set({ error: e.message })
          throw e
        } finally {
          set({ isLoading: false })
        }
      },

      loginPassword: async (phone: string, password: string) => {
        set({ isLoading: true, error: null })
        try {
          const res = await fetch(`${API_BASE}/auth/login_password`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone, password }),
          })
          const data = await res.json()
          if (!res.ok) throw new Error(data.detail || '登录失败')
          set({ token: data.token, user: { user_id: data.user_id, phone } })
        } catch (e: any) {
          set({ error: e.message })
          throw e
        } finally {
          set({ isLoading: false })
        }
      },

      logout: () => {
        set({ token: null, user: null })
      },

      clearError: () => set({ error: null }),
    }),
    { name: 'dlk_auth' }
  )
)

// ── Persona Store ─────────────────────────────────────────────────────────────

interface PersonaState {
  personas: Persona[]
  isLoading: boolean
  error: string | null
  loadPersonas: () => Promise<void>
  createPersona: (data: {
    name: string
    description?: string
    extracted_persona?: ExtractedPersona
    chat_data?: any
  }) => Promise<Persona>
  deletePersona: (persona_id: string) => Promise<void>
  patchPersona: (persona_id: string, data: Partial<Persona>) => Promise<void>
}

export const usePersonaStore = create<PersonaState>((set, get) => ({
  personas: [],
  isLoading: false,
  error: null,

  loadPersonas: async () => {
    const token = useAuthStore.getState().token
    if (!token) return
    set({ isLoading: true })
    try {
      const res = await fetch(`${API_BASE}/personas`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail)
      set({ personas: data.personas || [] })
    } catch (e: any) {
      set({ error: e.message })
    } finally {
      set({ isLoading: false })
    }
  },

  createPersona: async (data) => {
    const token = useAuthStore.getState().token!
    const res = await fetch(`${API_BASE}/personas`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(data),
    })
    const json = await res.json()
    if (!res.ok) throw new Error(json.detail || '创建失败')
    await get().loadPersonas()
    return json
  },

  deletePersona: async (persona_id: string) => {
    const token = useAuthStore.getState().token!
    const res = await fetch(`${API_BASE}/personas/${persona_id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) {
      const json = await res.json()
      throw new Error(json.detail || '删除失败')
    }
    await get().loadPersonas()
  },

  patchPersona: async (persona_id: string, data: Partial<Persona>) => {
    const token = useAuthStore.getState().token!
    const res = await fetch(`${API_BASE}/personas/${persona_id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(data),
    })
    if (!res.ok) {
      const json = await res.json()
      throw new Error(json.detail || '更新失败')
    }
    await get().loadPersonas()
  },
}))

// ── Chat Store ────────────────────────────────────────────────────────────────

interface ChatState {
  messages: Message[]
  isStreaming: boolean
  error: string | null
  loadHistory: (persona_id: string) => Promise<void>
  sendMessage: (persona_id: string, content: string, apiKey: ApiKey) => Promise<string>
  clearHistory: (persona_id: string) => Promise<void>
}

export const useChatStore = create<ChatState>((set) => ({
  messages: [],
  isStreaming: false,
  error: null,

  loadHistory: async (persona_id: string) => {
    const token = useAuthStore.getState().token!
    const res = await fetch(`${API_BASE}/chat/history/${persona_id}?limit=100`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.detail)
    set({ messages: data.messages || [] })
  },

  sendMessage: async (persona_id: string, content: string, apiKey: ApiKey) => {
    const token = useAuthStore.getState().token!
    set((s) => ({
      messages: [...s.messages, { id: Date.now(), role: 'user', content, created_at: new Date().toISOString() }],
      isStreaming: true,
      error: null,
    }))

    try {
      const res = await fetchWithStream(`${API_BASE}/chat/stream`, {
        persona_id,
        user_input: content,
        api_type: apiKey.type,
        api_key: apiKey.key,
        model: apiKey.model,
      }, token, (chunk) => {
        set((s) => {
          const msgs = [...s.messages]
          const last = msgs[msgs.length - 1]
          if (last?.role === 'user') {
            msgs.push({ id: Date.now() + 1, role: 'assistant', content: chunk, created_at: new Date().toISOString() })
          } else {
            msgs[msgs.length - 1] = { ...last, content: last.content + chunk }
          }
          return { messages: msgs }
        })
      })
      return res
    } catch (e: any) {
      set({ error: e.message })
      throw e
    } finally {
      set({ isStreaming: false })
    }
  },

  clearHistory: async (persona_id: string) => {
    const token = useAuthStore.getState().token!
    await fetch(`${API_BASE}/chat/history/${persona_id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    })
    set({ messages: [] })
  },
}))

// ── Import Store ─────────────────────────────────────────────────────────────

interface ImportPreview {
  contact_name: string
  message_count: number
  extracted_persona: ExtractedPersona
}

interface ImportState {
  preview: ImportPreview | null
  jobId: string | null
  isLoading: boolean
  progress: string
  error: string | null
  importFile: (file: File, apiKey: ApiKey) => Promise<void>
  reset: () => void
}

export const useImportStore = create<ImportState>((set) => ({
  preview: null,
  jobId: null,
  isLoading: false,
  progress: '',
  error: null,

  importFile: async (file: File, apiKey: ApiKey) => {
    const token = useAuthStore.getState().token!
    set({ isLoading: true, progress: '上传文件中...', error: null })

    const formData = new FormData()
    formData.append('file', file)
    formData.append('api_type', apiKey.type)
    formData.append('api_key', apiKey.key)
    formData.append('model', apiKey.model)

    set({ progress: '解析聊天记录...' })

    const res = await fetch(`${API_BASE}/import`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    })

    const data = await res.json()
    if (!res.ok) throw new Error(data.detail || '导入失败')

    set({
      preview: data.preview,
      jobId: data.job_id,
      progress: '提取完成',
    })
  },

  reset: () => set({ preview: null, jobId: null, isLoading: false, progress: '', error: null }),
}))

// ── Settings Store (API Keys in localStorage) ─────────────────────────────────

interface SettingsState {
  apiKeys: ApiKey[]
  defaultKey: string | null
  getDefaultKey: () => ApiKey | null
  saveApiKey: (key: ApiKey) => void
  removeApiKey: (type: string) => void
  setDefault: (type: string) => void
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      apiKeys: [],
      defaultKey: null,

      getDefaultKey: () => {
        const { apiKeys, defaultKey } = get()
        if (defaultKey) {
          const found = apiKeys.find((k) => k.type === defaultKey)
          if (found) return found
        }
        return apiKeys[0] || null
      },

      saveApiKey: (key: ApiKey) => {
        set((s) => {
          const filtered = s.apiKeys.filter((k) => k.type !== key.type)
          return { apiKeys: [...filtered, key], defaultKey: key.type }
        })
      },

      removeApiKey: (type: string) => {
        set((s) => ({
          apiKeys: s.apiKeys.filter((k) => k.type !== type),
          defaultKey: s.defaultKey === type ? null : s.defaultKey,
        }))
      },

      setDefault: (type: string) => set({ defaultKey: type }),
    }),
    { name: 'dlk_settings' }
  )
)

// ── SSE Stream Helper ─────────────────────────────────────────────────────────

async function fetchWithStream(
  url: string,
  body: Record<string, string>,
  token: string,
  onChunk: (chunk: string) => void
): Promise<string> {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: '请求失败' }))
    throw new Error(err.detail)
  }

  const reader = res.body!.getReader()
  const decoder = new TextDecoder()
  let full = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    const text = decoder.decode(value, { stream: true })
    const lines = text.split('\n')

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      const data = line.slice(6).trim()
      if (data === '') continue

      try {
        const parsed = JSON.parse(data)
        if (parsed.error) throw new Error(parsed.error)
        if (parsed.content) {
          full += parsed.content
          onChunk(parsed.content)
        }
      } catch (e) {
        if (e instanceof Error && e.message) throw e
      }
    }
  }

  return full
}
