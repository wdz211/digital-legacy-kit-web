// -*- coding: utf-8 -*-
import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { NavBar, Dialog, Toast } from 'antd-mobile'
import { useChatStore, usePersonaStore, useSettingsStore } from '../stores'

function formatTime(iso: string) {
  const d = new Date(iso)
  const now = new Date()
  const diff = (now.getTime() - d.getTime()) / 1000
  if (diff < 60) return '刚刚'
  if (diff < 3600) return `${Math.floor(diff / 60)}分钟前`
  if (diff < 86400) return `${Math.floor(diff / 3600)}小时前`
  return d.toLocaleDateString('zh-CN')
}

export default function ChatPage() {
  const { persona_id } = useParams<{ persona_id: string }>()
  const navigate = useNavigate()
  const bottomRef = useRef<HTMLDivElement>(null)
  const [input, setInput] = useState('')
  const [showMenu, setShowMenu] = useState(false)

  const { messages, sendMessage, clearMessages, isStreaming } = useChatStore()
  const { personas, deletePersona } = usePersonaStore()
  const { getDefaultKey } = useSettingsStore()

  const persona = personas.find((p) => p.persona_id === persona_id)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSend = async () => {
    if (!input.trim() || isStreaming) return
    const apiKey = getDefaultKey()
    if (!apiKey) {
      Toast.show('请先在设置中配置 API Key')
      navigate('/settings')
      return
    }
    const text = input.trim()
    setInput('')
    try {
      await sendMessage(persona_id!, text, apiKey)
    } catch (e: any) {
      Toast.show(e.message)
    }
  }

  const handleClear = () => {
    Dialog.confirm({
      title: '清空对话',
      content: '确定清空所有对话记录？',
      onConfirm: async () => {
        await clearMessages()
        Toast.show('已清空')
      },
    })
  }

  const handleDelete = () => {
    Dialog.confirm({
      title: '删除克隆体',
      content: '删除后无法恢复，确定删除？',
      onConfirm: async () => {
        await deletePersona(persona_id!)
        navigate('/', { replace: true })
      },
    })
  }

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: '#fff' }}>
      {/* Header */}
      <NavBar
        left={<span onClick={() => navigate('/')} style={{ fontSize: '13px' }}>返回</span>}
        right={<span onClick={() => setShowMenu(true)} style={{ fontSize: '20px' }}>⋮</span>}
        style={{ background: '#fff', borderBottom: '1px solid #f0f0f0', flexShrink: 0 }}
      >
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontWeight: 600, fontSize: '16px' }}>{persona?.name || '克隆体'}</div>
          <div style={{ fontSize: '11px', color: '#999' }}>
            {persona?.extracted_persona?.name || ''} · {persona?.extracted_persona ? '已导入' : '未导入'}
          </div>
        </div>
      </NavBar>

      {/* Menu dropdown */}
      {showMenu && (
        <div
          style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.4)', zIndex: 100,
            display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-end', padding: '50px 16px 0',
          }}
          onClick={() => setShowMenu(false)}
        >
          <div
            style={{
              background: '#fff', borderRadius: '8px', width: '160px',
              boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {[
              { label: '清空对话', action: handleClear, color: '#666' },
              { label: '删除克隆体', action: handleDelete, color: '#ff4d4f' },
            ].map((item) => (
              <div
                key={item.label}
                onClick={() => { setShowMenu(false); item.action() }}
                style={{ padding: '14px 16px', fontSize: '15px', color: item.color, cursor: 'pointer', borderBottom: '1px solid #f5f5f5' }}
              >
                {item.label}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {messages.length === 0 && (
          <div style={{ textAlign: 'center', color: '#bbb', fontSize: '14px', marginTop: '60px' }}>
            发送消息，开始对话
          </div>
        )}

        {messages.map((msg) => (
          <div key={msg.id} style={{ display: 'flex', flexDirection: 'column', alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
            <div style={{
              maxWidth: '75%',
              padding: '10px 14px',
              borderRadius: msg.role === 'user'
                ? '16px 16px 4px 16px'
                : '16px 16px 16px 4px',
              background: msg.role === 'user' ? '#1677ff' : '#f5f5f5',
              color: msg.role === 'user' ? '#fff' : '#333',
              fontSize: '15px',
              lineHeight: 1.6,
              wordBreak: 'break-word',
            }}>
              {msg.content}
            </div>
            <div style={{ fontSize: '11px', color: '#ccc', marginTop: '3px', paddingLeft: '4px', paddingRight: '4px' }}>
              {formatTime(msg.created_at)}
            </div>
          </div>
        ))}

        {isStreaming && (
          <div style={{ display: 'flex', alignItems: 'flex-start' }}>
            <div style={{ padding: '10px 14px', borderRadius: '16px 16px 16px 4px', background: '#f5f5f5', fontSize: '15px', color: '#999' }}>
              <span style={{ animation: 'blink 1s infinite' }}>...</span>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input area */}
      <div style={{
        borderTop: '1px solid #f0f0f0',
        padding: '10px 16px',
        paddingBottom: 'max(10px, env(safe-area-inset-bottom))',
        display: 'flex',
        gap: '10px',
        alignItems: 'flex-end',
        flexShrink: 0,
      }}>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              handleSend()
            }
          }}
          placeholder="输入消息..."
          rows={1}
          style={{
            flex: 1,
            resize: 'none',
            border: '1px solid #e8e8e8',
            borderRadius: '20px',
            padding: '10px 14px',
            fontSize: '15px',
            lineHeight: 1.5,
            maxHeight: '120px',
            outline: 'none',
            fontFamily: 'inherit',
            overflowY: 'auto',
          }}
        />
        <button
          onClick={handleSend}
          disabled={!input.trim() || isStreaming}
          style={{
            width: '44px', height: '44px', borderRadius: '22px', border: 'none',
            background: input.trim() && !isStreaming ? '#1677ff' : '#ccc',
            color: '#fff', fontSize: '18px', cursor: 'pointer', flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          ↑
        </button>
      </div>
    </div>
  )
}
