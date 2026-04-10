// -*- coding: utf-8 -*-
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Input, Toast } from 'antd-mobile'
import { useAuthStore } from '../stores'

export default function AuthPage() {
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [mode, setMode] = useState<'code' | 'password'>('code')
  const [countdown, setCountdown] = useState(0)

  const { login, loginPassword, sendCode, isLoading, error } = useAuthStore()
  const navigate = useNavigate()

  const handleSendCode = async () => {
    if (!phone || phone.length < 11) {
      Toast.show('请输入有效手机号')
      return
    }
    try {
      await sendCode(phone)
      setCountdown(60)
      const t = setInterval(() => {
        setCountdown((c) => {
          if (c <= 1) { clearInterval(t); return 0 }
          return c - 1
        })
      }, 1000)
      Toast.show('验证码已发送')
    } catch (e: any) {
      Toast.show(e.message)
    }
  }

  const handleLogin = async () => {
    try {
      if (mode === 'code') {
        if (!code) { Toast.show('请输入验证码'); return }
        await login(phone, code)
      } else {
        if (!password) { Toast.show('请输入密码'); return }
        await loginPassword(phone, password)
      }
      navigate('/', { replace: true })
    } catch (e: any) {
      Toast.show(e.message)
    }
  }

  return (
    <div style={{ padding: '48px 24px', minHeight: '100vh', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Logo area */}
      <div style={{ textAlign: 'center', marginBottom: '16px' }}>
        <div style={{
          width: '64px', height: '64px', borderRadius: '16px',
          background: 'linear-gradient(135deg, #1677ff, #4096ff)',
          margin: '0 auto 16px',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '28px', fontWeight: 700, color: '#fff',
        }}>DL</div>
        <h1 style={{ margin: 0, fontSize: '22px', fontWeight: 600 }}>Digital Legacy Kit</h1>
        <p style={{ margin: '4px 0 0', color: '#999', fontSize: '14px' }}>创建你的数字克隆体</p>
      </div>

      {/* Tab switch */}
      <div style={{ display: 'flex', gap: '8px', background: '#f5f5f5', borderRadius: '8px', padding: '4px' }}>
        {(['code', 'password'] as const).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            style={{
              flex: 1, border: 'none', borderRadius: '6px', padding: '8px',
              background: mode === m ? '#fff' : 'transparent',
              boxShadow: mode === m ? '0 1px 4px rgba(0,0,0,0.1)' : 'none',
              cursor: 'pointer', fontSize: '14px', fontWeight: 500,
              color: mode === m ? '#1677ff' : '#666',
            }}
          >{m === 'code' ? '验证码登录' : '密码登录'}</button>
        ))}
      </div>

      {/* Form */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <Input
          placeholder="手机号"
          type="tel"
          value={phone}
          onChange={setPhone}
          maxLength={11}
          style={{ '--font-size': '16px' } as any}
        />

        {mode === 'code' && (
          <div style={{ display: 'flex', gap: '8px' }}>
            <Input
              placeholder="验证码"
              value={code}
              onChange={setCode}
              maxLength={6}
              style={{ flex: 1, '--font-size': '16px' } as any}
            />
            <Button
              size="small"
              disabled={countdown > 0}
              onClick={handleSendCode}
              style={{ whiteSpace: 'nowrap' }}
            >
              {countdown > 0 ? `${countdown}s` : '获取验证码'}
            </Button>
          </div>
        )}

        {mode === 'password' && (
          <Input
            placeholder="密码"
            type="password"
            value={password}
            onChange={setPassword}
            style={{ '--font-size': '16px' } as any}
          />
        )}
      </div>

      {error && (
        <div style={{ color: '#ff4d4f', fontSize: '13px', textAlign: 'center' }}>{error}</div>
      )}

      <Button
        block
        color="primary"
        size="large"
        loading={isLoading}
        onClick={handleLogin}
        style={{ marginTop: '8px' }}
      >
        登录
      </Button>
    </div>
  )
}
