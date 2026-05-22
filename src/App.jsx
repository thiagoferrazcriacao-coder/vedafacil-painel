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
import GarantiasPage from './pages/GarantiasPage.jsx'
import EquipesPage from './pages/EquipesPage.jsx'
import OrdensServicoPage from './pages/OrdensServicoPage.jsx'
import OSDetailPage from './pages/OSDetailPage.jsx'
import ReparosPage from './pages/ReparosPage.jsx'
import LixeiraPage from './pages/LixeiraPage.jsx'
import CroquiPage from './pages/CroquiPage.jsx'
import ConfigPage from './pages/ConfigPage.jsx'
import UsersPage from './pages/UsersPage.jsx'
import AgendaPage from './pages/AgendaPage.jsx'
import PerfilPage from './pages/PerfilPage.jsx'
import ProdutosPage from './pages/ProdutosPage.jsx'

// ─── Push Notification Setup ──────────────────────────────────────────────────
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)));
}

async function setupPush(token) {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
  try {
    const keyRes = await fetch('/api/push/vapid-public-key');
    const { key } = await keyRes.json();
    if (!key) return;
    const reg = await navigator.serviceWorker.register('/sw-push.js');
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return;
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(key)
    });
    await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ subscription: sub })
    });
  } catch (e) { console.warn('Push setup failed:', e.message); }
}

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
        setupPush(googleToken)
        window.history.replaceState({}, '', window.location.pathname)
      } catch (e) { console.error('Google token parse error', e) }
    }
  }, [])

  const login = (newToken, newUser) => {
    localStorage.setItem('veda_token', newToken)
    localStorage.setItem('veda_user', JSON.stringify(newUser))
    setToken(newToken)
    setUser(newUser)
    setupPush(newToken)
  }

  const logout = () => {
    localStorage.removeItem('veda_token')
    localStorage.removeItem('veda_user')
    setToken(null)
    setUser(null)
  }

  const isAuthenticated = !!token
  const isAdmin = user?.role === 'admin'

  return (
    <AuthContext.Provider value={{ token, user, login, logout, isAuthenticated, isAdmin, mustChangePassword: user?.mustChangePassword === true }}>
      {children}
    </AuthContext.Provider>
  )
}

// ─── Protected Route ──────────────────────────────────────────────────────────
function ProtectedRoute({ children, adminOnly = false }) {
  const { isAuthenticated, isAdmin, mustChangePassword } = useAuth()
  if (!isAuthenticated) return <Navigate to="/login" replace />
  if (mustChangePassword && window.location.pathname !== '/perfil') return <Navigate to="/perfil" replace />
  if (adminOnly && !isAdmin) return <Navigate to="/medicoes" replace />
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
                  <Route path="/garantias" element={<GarantiasPage />} />
                  <Route path="/equipes" element={<EquipesPage />} />
                  <Route path="/ordens-servico" element={<OrdensServicoPage />} />
                  <Route path="/ordens-servico/:id" element={<OSDetailPage />} />
                  <Route path="/agenda" element={<AgendaPage />} />
                  <Route path="/reparos" element={<ReparosPage />} />
                  <Route path="/lixeira" element={<ProtectedRoute adminOnly><LixeiraPage /></ProtectedRoute>} />
                  <Route path="/croqui" element={<CroquiPage />} />
                  <Route path="/produtos" element={<ProdutosPage />} />
                  <Route path="/config" element={<ProtectedRoute adminOnly><ConfigPage /></ProtectedRoute>} />
                  <Route path="/usuarios" element={<ProtectedRoute adminOnly><UsersPage /></ProtectedRoute>} />
                  <Route path="/perfil" element={<PerfilPage />} />
                </Routes>
              </Layout>
            </ProtectedRoute>
          }
        />
      </Routes>
    </AuthProvider>
  )
}
