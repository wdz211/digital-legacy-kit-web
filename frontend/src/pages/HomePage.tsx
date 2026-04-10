// -*- coding: utf-8 -*-
import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { NavBar, PullToRefresh, Empty, Dialog, Toast } from 'antd-mobile'
import { usePersonaStore, useAuthStore } from '../stores'

export default function HomePage() {
  const { personas, loadPersonas, deletePersona } = usePersonaStore()
  const logout = useAuthStore((s) => s.logout)
  const navigate = useNavigate()

  useEffect(() => {
    loadPersonas()
  }, [])

  const handleDelete = (persona_id: string, name: string) => {
    Dialog.confirm({
      title: '删除克隆体',
      content: `确定要删除"${name}"吗？删除后无法恢复。`,
      onConfirm: async () => {
        try {
          await deletePersona(persona_id)
          Toast.show('已删除')
        } catch (e: any) {
          Toast.show(e.message)
        }
      },
    })
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f5f5f5' }}>
      <NavBar
        left={<span style={{ fontSize: '13px', color: '#999' }}>我的克隆体</span>}
        right={<span onClick={() => navigate('/settings')} style={{ fontSize: '14px', color: '#1677ff' }}>设置</span>}
        style={{ background: '#fff' }}
      >
        <span onClick={logout} style={{ fontSize: '13px', color: '#666' }}>退出</span>
      </NavBar>

      <PullToRefresh
        onRefresh={loadPersonas}
      >
        {personas.length === 0 ? (
          <div style={{ padding: '80px 24px', textAlign: 'center' }}>
            <Empty description="还没有克隆体" />
            <p style={{ color: '#999', fontSize: '14px', marginTop: '12px' }}>
              上传微信聊天记录，创建你的第一个克隆体
            </p>
          </div>
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, 1fr)',
            gap: '12px',
            padding: '16px',
          }}>
            {personas.map((p) => (
              <div
                key={p.persona_id}
                onClick={() => navigate(`/chat/${p.persona_id}`)}
                style={{
                  background: '#fff', borderRadius: '12px', padding: '20px 16px',
                  boxShadow: '0 1px 4px rgba(0,0,0,0.06)', cursor: 'pointer',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px',
                }}
              >
                <div style={{
                  width: '52px', height: '52px', borderRadius: '50%',
                  background: 'linear-gradient(135deg, #1677ff, #73d13d)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '20px', fontWeight: 700, color: '#fff',
                }}>
                  {p.name[0]?.toUpperCase() || '?'}
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontWeight: 600, fontSize: '15px', marginBottom: '4px' }}>{p.name}</div>
                  <div style={{ color: '#999', fontSize: '12px' }}>{p.message_count || 0} 条对话</div>
                </div>
                <div
                  onClick={(e) => { e.stopPropagation(); handleDelete(p.persona_id, p.name) }}
                  style={{ fontSize: '12px', color: '#ff4d4f', cursor: 'pointer' }}
                >
                  删除
                </div>
              </div>
            ))}

            {/* Add button */}
            <div
              onClick={() => navigate('/import')}
              style={{
                background: '#f5f5f5', borderRadius: '12px', padding: '20px 16px',
                border: '2px dashed #d9d9d9', cursor: 'pointer',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px',
                minHeight: '140px', justifyContent: 'center',
              }}
            >
              <div style={{ fontSize: '28px', color: '#999', lineHeight: 1 }}>+</div>
              <div style={{ color: '#999', fontSize: '13px' }}>创建克隆体</div>
            </div>
          </div>
        )}
      </PullToRefresh>
    </div>
  )
}
