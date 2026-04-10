// -*- coding: utf-8 -*-
import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { NavBar, Button, Input, Toast, Tag } from 'antd-mobile'
import { useImportStore, usePersonaStore, useSettingsStore } from '../stores'
import type { Persona, ExtractedPersona } from '../stores'

export default function ImportConfirmPage() {
  const { persona_id } = useParams<{ persona_id: string }>()
  const navigate = useNavigate()
  const { preview, reset } = useImportStore()
  const { fetchPersonaById, patchPersona } = usePersonaStore()
  const { getDefaultKey, saveApiKey } = useSettingsStore()

  const [name, setName] = useState(preview?.contact_name || '')
  const [description, setDescription] = useState('')
  const [isCreating, setIsCreating] = useState(false)
  const [apiKeyInput, setApiKeyInput] = useState('')
  const [extracted, setExtracted] = useState<ExtractedPersona | null>(null)
  const [messageCount, setMessageCount] = useState(0)
  const apiKey = getDefaultKey()

  // Load persona data when navigating directly to this page
  useEffect(() => {
    if (!preview && persona_id) {
      fetchPersonaById(persona_id)
        .then((p: Persona) => {
          setName(p.name)
          setDescription(p.description || '')
          setExtracted(p.extracted_persona || null)
          setMessageCount(p.message_count || 0)
        })
        .catch(() => Toast.show('加载失败，请重试'))
    } else if (preview) {
      setExtracted(preview.extracted_persona)
      setMessageCount(preview.message_count)
    }
  }, [persona_id])

  if (!preview && !persona_id) {
    return (
      <div style={{ minHeight: '100vh', background: '#f5f5f5' }}>
        <NavBar onBack={() => { reset(); navigate('/import') }}>导入结果</NavBar>
        <div style={{ padding: '32px 24px', textAlign: 'center', color: '#999' }}>
          未找到导入记录，请重新上传
        </div>
      </div>
    )
  }

  const handleConfirm = async () => {
    if (!name.trim()) {
      Toast.show('请输入克隆体名称')
      return
    }
    if (!apiKey && !apiKeyInput) {
      Toast.show('请配置 API Key')
      return
    }
    if (apiKeyInput && !apiKey) {
      const [type, ...rest] = apiKeyInput.split(':')
      if (rest.length > 0) {
        saveApiKey({ type: type as any, key: rest.join(':'), model: 'gpt-4o-mini' })
      }
    }
    setIsCreating(true)
    try {
      const targetId = persona_id || useImportStore.getState().personaId
      await patchPersona(targetId!, {
        name: name.trim(),
        description: description || extracted?.description || '',
      })
      reset()
      navigate(`/chat/${targetId}`, { replace: true })
    } catch (e: any) {
      Toast.show(e.message)
    } finally {
      setIsCreating(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f5f5f5' }}>
      <NavBar onBack={() => navigate('/import')}>确认克隆体信息</NavBar>

      <div style={{ padding: '20px 16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {/* Name */}
        <div style={{ background: '#fff', borderRadius: '10px', padding: '14px 16px' }}>
          <div style={{ fontSize: '13px', color: '#999', marginBottom: '6px' }}>名称</div>
          <Input
            value={name}
            onChange={setName}
            placeholder="克隆体名称"
            style={{ '--font-size': '16px' } as any}
          />
        </div>

        {/* Description */}
        <div style={{ background: '#fff', borderRadius: '10px', padding: '14px 16px' }}>
          <div style={{ fontSize: '13px', color: '#999', marginBottom: '6px' }}>简介</div>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={extracted?.description || '描述这个克隆体...'}
            rows={3}
            style={{
              width: '100%', border: 'none', resize: 'none', outline: 'none',
              fontSize: '15px', lineHeight: 1.6, fontFamily: 'inherit',
            }}
          />
        </div>

        {/* Extracted info */}
        {extracted && (
          <div style={{ background: '#fff', borderRadius: '10px', padding: '14px 16px' }}>
            <div style={{ fontSize: '13px', color: '#999', marginBottom: '10px' }}>LLM 提取结果</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '14px' }}>
              <div>
                <span style={{ color: '#666' }}>语言风格：</span>
                <span>{extracted.language_style || '-'}</span>
              </div>
              <div>
                <span style={{ color: '#666' }}>性格特征：</span>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '4px' }}>
                  {(extracted.personality_traits || []).map((t, i) => (
                    <Tag key={i} color="primary">{t}</Tag>
                  ))}
                </div>
              </div>
              <div>
                <span style={{ color: '#666' }}>常用口头禅：</span>
                <span>{(extracted.common_phrases || []).join('、')}</span>
              </div>
              <div>
                <span style={{ color: '#666' }}>话题偏好：</span>
                <span>{(extracted.topics || []).join('、')}</span>
              </div>
              <div>
                <span style={{ color: '#666' }}>消息数量：</span>
                <span>{messageCount.toLocaleString()} 条</span>
              </div>
            </div>
          </div>
        )}

        {/* API Key */}
        <div style={{ background: '#fff', borderRadius: '10px', padding: '14px 16px' }}>
          <div style={{ fontSize: '13px', color: '#999', marginBottom: '8px' }}>API Key</div>
          {apiKey ? (
            <div style={{ fontSize: '14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>{apiKey.type.toUpperCase()} · {apiKey.model}</span>
              <span onClick={() => navigate('/settings')} style={{ color: '#1677ff', fontSize: '13px', cursor: 'pointer' }}>更换</span>
            </div>
          ) : (
            <Input
              placeholder="sk-... (手动输入 Key)"
              value={apiKeyInput}
              onChange={setApiKeyInput}
              style={{ '--font-size': '14px' } as any}
            />
          )}
        </div>

        <Button
          block
          color="primary"
          size="large"
          loading={isCreating}
          onClick={handleConfirm}
        >
          确认创建克隆体
        </Button>
      </div>
    </div>
  )
}
