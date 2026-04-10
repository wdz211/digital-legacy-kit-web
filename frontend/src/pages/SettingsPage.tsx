// -*- coding: utf-8 -*-
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { NavBar, Input, Button, Toast, Dialog } from 'antd-mobile'
import { useAuthStore, useSettingsStore } from '../stores'
import type { ApiKey } from '../stores'

const API_CONFIGS: Record<string, { placeholder: string; models: string[] }> = {
  openai: {
    placeholder: 'sk-...',
    models: ['gpt-4o-mini', 'gpt-4o', 'gpt-4-turbo'],
  },
  claude: {
    placeholder: 'sk-ant-...',
    models: ['claude-haiku-20250729', 'claude-3-5-haiku-20241022', 'claude-3-5-sonnet-20241022'],
  },
  dashscope: {
    placeholder: 'sk-...',
    models: ['qwen-turbo', 'qwen-plus', 'qwen-max'],
  },
}

export default function SettingsPage() {
  const navigate = useNavigate()
  const { user, logout } = useAuthStore()
  const { apiKeys, saveApiKey, removeApiKey } = useSettingsStore()

  const [activeType, setActiveType] = useState<string | null>(null)
  const [inputKey, setInputKey] = useState('')
  const [selectedModel, setSelectedModel] = useState('')

  const handleSave = () => {
    if (!inputKey.trim() || !activeType) return
    saveApiKey({
      type: activeType as ApiKey['type'],
      key: inputKey.trim(),
      model: selectedModel || API_CONFIGS[activeType]?.models[0] || '',
    })
    setInputKey('')
    setActiveType(null)
    Toast.show('已保存')
  }

  const handleRemove = (type: string) => {
    Dialog.confirm({
      title: '删除 API Key',
      content: '确定删除该 Key？',
      onConfirm: () => {
        removeApiKey(type)
        Toast.show('已删除')
      },
    })
  }

  const maskedKey = (key: string) => {
    if (key.length < 8) return '***'
    return key.slice(0, 6) + '...' + key.slice(-4)
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f5f5f5' }}>
      <NavBar onBack={() => navigate('/')} style={{ background: '#fff' }}>设置</NavBar>

      <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {/* Account */}
        <div style={{ background: '#fff', borderRadius: '10px', padding: '14px 16px' }}>
          <div style={{ fontSize: '13px', color: '#999', marginBottom: '8px' }}>账号</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '15px' }}>{user?.phone?.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2')}</span>
            <span
              onClick={() => {
                Dialog.alert({ title: '提示', content: '密码修改功能开发中' })
              }}
              style={{ fontSize: '13px', color: '#1677ff', cursor: 'pointer' }}
            >
              修改密码
            </span>
          </div>
        </div>

        {/* API Keys */}
        <div style={{ background: '#fff', borderRadius: '10px', padding: '14px 16px' }}>
          <div style={{ fontSize: '13px', color: '#999', marginBottom: '12px' }}>API Keys（浏览器本地存储）</div>

          {/* Existing keys */}
          {apiKeys.map((k) => (
            <div key={k.type} style={{ marginBottom: '12px', padding: '10px', background: '#f9f9f9', borderRadius: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                <span style={{ fontWeight: 600, fontSize: '14px', textTransform: 'uppercase' }}>{k.type}</span>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <span
                    onClick={() => { setActiveType(k.type); setInputKey(k.key); setSelectedModel(k.model) }}
                    style={{ fontSize: '12px', color: '#1677ff', cursor: 'pointer' }}
                  >
                    编辑
                  </span>
                  <span
                    onClick={() => handleRemove(k.type)}
                    style={{ fontSize: '12px', color: '#ff4d4f', cursor: 'pointer' }}
                  >
                    删除
                  </span>
                </div>
              </div>
              <div style={{ fontSize: '12px', color: '#666' }}>{maskedKey(k.key)}</div>
              <div style={{ fontSize: '12px', color: '#999', marginTop: '2px' }}>{k.model}</div>
            </div>
          ))}

          {/* Add new */}
          {activeType ? (
            <div style={{ padding: '12px', border: '1px solid #e8e8e8', borderRadius: '8px' }}>
              <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '10px', textTransform: 'uppercase' }}>{activeType}</div>
              <Input
                placeholder={API_CONFIGS[activeType]?.placeholder || 'API Key'}
                value={inputKey}
                onChange={setInputKey}
                style={{ marginBottom: '10px', '--font-size': '14px' } as any}
              />
              <div style={{ fontSize: '12px', color: '#999', marginBottom: '6px' }}>模型</div>
              <select
                value={selectedModel || API_CONFIGS[activeType]?.models[0] || ''}
                onChange={(e) => setSelectedModel(e.target.value)}
                style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #e8e8e8', fontSize: '14px', marginBottom: '10px' }}
              >
                {(API_CONFIGS[activeType]?.models || []).map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
              <div style={{ display: 'flex', gap: '8px' }}>
                <Button size="small" onClick={() => { setActiveType(null); setInputKey('') }}>取消</Button>
                <Button size="small" color="primary" onClick={handleSave}>保存</Button>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {['openai', 'claude', 'dashscope'].map((type) => (
                <div
                  key={type}
                  onClick={() => setActiveType(type)}
                  style={{
                    padding: '10px 12px', border: '1px dashed #d9d9d9', borderRadius: '8px',
                    textAlign: 'center', cursor: 'pointer', color: '#999', fontSize: '14px', textTransform: 'uppercase',
                  }}
                >
                  + 添加 {type}
                </div>
              ))}
            </div>
          )}

          <div style={{ marginTop: '10px', fontSize: '12px', color: '#ccc', lineHeight: 1.6 }}>
            API Key 仅存储在本地浏览器，不会上传至服务器。请勿在公共设备保存。
          </div>
        </div>

        {/* Help */}
        <div
          onClick={() => {
            Dialog.alert({
              title: '使用帮助',
              content: '1. 添加 API Key（OpenAI/Claude/阿里通义）\n2. 导出微信聊天记录为 xlsx\n3. 上传 xlsx 创建克隆体\n4. 开始对话',
            })
          }}
          style={{ background: '#fff', borderRadius: '10px', padding: '14px 16px', cursor: 'pointer' }}
        >
          <div style={{ fontSize: '14px', color: '#666', display: 'flex', justifyContent: 'space-between' }}>
            使用帮助 <span style={{ color: '#ccc' }}>&gt;</span>
          </div>
        </div>

        {/* Version */}
        <div style={{ textAlign: 'center', padding: '16px', fontSize: '12px', color: '#ccc' }}>
          Digital Legacy Kit Web v1.0.0
        </div>

        {/* Logout */}
        <Button
          block
          color="danger"
          size="small"
          onClick={() => {
            Dialog.confirm({
              title: '退出登录',
              content: '确定退出？',
              onConfirm: () => { logout(); navigate('/auth', { replace: true }) },
            })
          }}
        >
          退出登录
        </Button>
      </div>
    </div>
  )
}
