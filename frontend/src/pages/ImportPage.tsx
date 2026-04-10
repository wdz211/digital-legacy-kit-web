// -*- coding: utf-8 -*-
import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { NavBar, Button, Toast, Loading } from 'antd-mobile'
import { useImportStore, useSettingsStore } from '../stores'

export default function ImportPage() {
  const inputRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [fileName, setFileName] = useState('')
  const { importFile, isLoading, progress, error } = useImportStore()
  const { getDefaultKey } = useSettingsStore()
  const navigate = useNavigate()

  const apiKey = getDefaultKey()
  if (!apiKey) {
    return (
      <div style={{ minHeight: '100vh', background: '#f5f5f5' }}>
        <NavBar onBack={() => navigate('/')}>创建克隆体</NavBar>
        <div style={{ padding: '32px 24px', textAlign: 'center' }}>
          <p style={{ color: '#666', marginBottom: '16px' }}>请先在设置中配置 API Key</p>
          <Button color="primary" onClick={() => navigate('/settings')}>去设置</Button>
        </div>
      </div>
    )
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f) return
    if (!f.name.endsWith('.xlsx')) {
      Toast.show('请上传 xlsx 文件')
      return
    }
    setFile(f)
    setFileName(f.name)
  }

  const handleUpload = async () => {
    if (!file) {
      Toast.show('请先选择文件')
      return
    }
    try {
      await importFile(file, apiKey)
      if (useImportStore.getState().jobId) {
        navigate(`/import/${useImportStore.getState().jobId}`, { replace: true })
      }
    } catch (e: any) {
      Toast.show(e.message)
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f5f5f5' }}>
      <NavBar onBack={() => navigate('/')}>创建克隆体</NavBar>

      <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
        {/* Info */}
        <div style={{ background: '#e6f4ff', borderRadius: '10px', padding: '14px 16px', fontSize: '13px', color: '#1677ff', lineHeight: 1.6 }}>
          请使用 Windows 版微信导出的聊天记录文件（.xlsx 格式）。在微信中点击「...」→「聊天记录」→「导出」即可。
        </div>

        {/* API Key info */}
        <div style={{ background: '#f9f9f9', borderRadius: '10px', padding: '12px 16px', fontSize: '13px', color: '#666' }}>
          将使用 <span style={{ color: '#1677ff', fontWeight: 600 }}>{apiKey.type.toUpperCase()}</span> · {apiKey.model}
        </div>

        {/* Upload area */}
        <div
          onClick={() => inputRef.current?.click()}
          style={{
            border: '2px dashed #d9d9d9', borderRadius: '12px',
            padding: '48px 24px', textAlign: 'center', cursor: 'pointer',
            background: '#fff', transition: 'border-color 0.2s',
          }}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx"
            onChange={handleFileChange}
            style={{ display: 'none' }}
          />
          <div style={{ fontSize: '40px', marginBottom: '12px', color: '#d9d9d9' }}>^</div>
          {fileName ? (
            <div>
              <div style={{ fontWeight: 600, marginBottom: '4px' }}>{fileName}</div>
              <div style={{ fontSize: '13px', color: '#999' }}>点击更换文件</div>
            </div>
          ) : (
            <div>
              <div style={{ fontWeight: 600, marginBottom: '4px' }}>点击或拖拽上传</div>
              <div style={{ fontSize: '13px', color: '#999' }}>微信导出的 .xlsx 文件，最大 100MB</div>
            </div>
          )}
        </div>

        {/* Loading state */}
        {isLoading && (
          <div style={{ textAlign: 'center', padding: '24px' }}>
            <Loading />
            <div style={{ marginTop: '12px', color: '#666', fontSize: '14px' }}>{progress}</div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div style={{ color: '#ff4d4f', fontSize: '14px', textAlign: 'center', padding: '12px', background: '#fff2f0', borderRadius: '8px' }}>
            {error}
          </div>
        )}

        <Button
          block
          color="primary"
          size="large"
          disabled={!file || isLoading}
          onClick={handleUpload}
        >
          {isLoading ? '处理中...' : '开始导入'}
        </Button>
      </div>
    </div>
  )
}
