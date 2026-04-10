// -*- coding: utf-8 -*-
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './stores'
import AuthPage from './pages/AuthPage'
import HomePage from './pages/HomePage'
import ImportPage from './pages/ImportPage'
import ImportConfirmPage from './pages/ImportConfirmPage'
import ChatPage from './pages/ChatPage'
import SettingsPage from './pages/SettingsPage'

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const token = useAuthStore((s) => s.token)
  return token ? <>{children}</> : <Navigate to="/auth" replace />
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/auth" element={<AuthPage />} />
        <Route path="/" element={<PrivateRoute><HomePage /></PrivateRoute>} />
        <Route path="/import" element={<PrivateRoute><ImportPage /></PrivateRoute>} />
        <Route path="/import/:job_id" element={<PrivateRoute><ImportConfirmPage /></PrivateRoute>} />
        <Route path="/chat/:persona_id" element={<PrivateRoute><ChatPage /></PrivateRoute>} />
        <Route path="/settings" element={<PrivateRoute><SettingsPage /></PrivateRoute>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
