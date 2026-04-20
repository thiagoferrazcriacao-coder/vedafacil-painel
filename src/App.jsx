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
                </Routes>
              </Layout>
            </ProtectedRoute>
          }
        />
      </Routes>
    </AuthProvider>
  )
}
