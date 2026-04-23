import React, { createContext, useContext, useState, useEffect } from 'react'
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import Layout from './components/Layout.jsx'
import LoginPage from './pages/LoginPage.jsx'
import DashboardPage from './pages/DashboardPage.jsx'
import MedicoesPage from './pages/MedicoesPage.jsx'
import MedicaoDetailPage from './pages/MedicaoDetailPage.jsx'
import OrcamentosPage from './pages/OrcamentosPage.jsx'
import OrcamentoFormPage from './pages/OrcamentoFormPage.jsx'
import ContratosPage from './pages/ContratosPage.jsx'
import ContratoFormPage from './pages/ContratoFormPage.jsx'
import ConfigPage from './pages/ConfigPage.jsx'
import UsersPage from './pages/UsersPage.jsx'

// ─── Auth Context ─────────────────────────────────────────────────────────────
export const AuthContext = createContext(null)

export function useAuth() {
  return useContext(AuthContext)
}

function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem('veda_token'))
  const [user, setUser] = useState(() => {
    const u = localStorage.getItem('veda_user')
    return u ? JSON.parse(u) : null
  })

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const googleToken = params.get('google_token')
    if (googleToken) {
      try {
        const b64 = googleToken.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
        const payload = JSON.parse(atob(b64.padEnd(b64.length + (4 - b64.length % 4) % 4, '=')))
        const newUser = { username: payload.name, email: payload.email, picture: payload.picture, role: payload.role }
        localStorage.setItem('veda_token', googleToken)
        localStorage.setItem('veda_user', JSON.stringify(newUser))
        setToken(googleToken)
        setUser(newUser)
        window.history.replaceState({}, '', window.location.pathname)
      } catch (e) { console.error('Google token parse error', e) }
    }
  }, [])

  const login = (newToken, newUser) => {
    localStorage.setItem('veda_token', newToken)
    localStorage.setItem('veda_user', JSON.stringify(newUser))
    setToken(newToken)
    setUser(newUser)
  }

  const logout = () => {
    localStorage.removeItem('veda_token')
    localStorage.removeItem('veda_user')
    setToken(null)
    setUser(null)
  }

  const isAuthenticated = !!token

  return (
    <AuthContext.Provider value={{ token, user, login, logout, isAuthenticated }}>
      {children}
    </AuthContext.Provider>
  )
}

// ─── Protected Route ──────────────────────────────────────────────────────────
function ProtectedRoute({ children }) {
  const { isAuthenticated } = useAuth()
  if (!isAuthenticated) return <Navigate to="/login" replace />
  return children
}

// ─── App ──────────────────────────────────────────────────────────────────────
export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <Navigate to="/medicoes" replace />
            </ProtectedRoute>
          }
        />
        <Route
          path="/*"
          element={
            <ProtectedRoute>
              <Layout>
                <Routes>
                  <Route path="/dashboard" element={<DashboardPage />} />
                  <Route path="/medicoes" element={<MedicoesPage />} />
                  <Route path="/medicoes/:id" element={<MedicaoDetailPage />} />
                  <Route path="/orcamentos" element={<OrcamentosPage />} />
                  <Route path="/orcamentos/novo/:medicaoId" element={<OrcamentoFormPage />} />
                  <Route path="/orcamentos/:id" element={<OrcamentoFormPage />} />
                  <Route path="/contratos" element={<ContratosPage />} />
                  <Route path="/contratos/:id" element={<ContratoFormPage />} />
                  <Route path="/config" element={<ConfigPage />} />
                  <Route path="/usuarios" element={<UsersPage />} />
                </Routes>
              </Layout>
            </ProtectedRoute>
          }
        />
      </Routes>
    </AuthProvider>
  )
}
