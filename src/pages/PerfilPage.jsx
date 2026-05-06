import React, { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../App.jsx'
import { api } from '../api/client.js'

/** Redimensiona uma imagem File para max 240×240 px como JPEG base64 */
function resizeImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = e => {
      const img = new Image()
      img.onload = () => {
        const MAX = 240
        let w = img.naturalWidth, h = img.naturalHeight
        if (w > MAX || h > MAX) {
          const ratio = Math.min(MAX / w, MAX / h)
          w = Math.round(w * ratio)
          h = Math.round(h * ratio)
        }
        const canvas = document.createElement('canvas')
        canvas.width = w; canvas.height = h
        const ctx = canvas.getContext('2d')
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, w, h)
        ctx.drawImage(img, 0, 0, w, h)
        resolve(canvas.toDataURL('image/jpeg', 0.88))
      }
      img.onerror = reject
      img.src = e.target.result
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

/** Iniciais a partir do nome ou email */
function getInitials(name, email) {
  const src = name || email || '?'
  const parts = src.trim().split(/\s+/)
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  return src.slice(0, 2).toUpperCase()
}

export default function PerfilPage() {
  const { user, login, mustChangePassword } = useAuth()
  const navigate = useNavigate()
  const fileRef = useRef(null)

  const [senhaAtual,   setSenhaAtual]   = useState('')
  const [novaSenha,    setNovaSenha]    = useState('')
  const [confirmar,    setConfirmar]    = useState('')
  const [saving,       setSaving]       = useState(false)
  const [error,        setError]        = useState('')
  const [success,      setSuccess]      = useState('')

  const [uploadingPic, setUploadingPic] = useState(false)
  const [picError,     setPicError]     = useState('')
  const [picSuccess,   setPicSuccess]   = useState('')

  async function handleChangeSenha(e) {
    e.preventDefault()
    setError(''); setSuccess('')
    if (novaSenha !== confirmar) { setError('As senhas não coincidem'); return }
    if (novaSenha.length < 4)   { setError('Nova senha precisa ter ao menos 4 caracteres'); return }
    setSaving(true)
    try {
      const data = await api.changePassword({ senhaAtual, novaSenha })
      if (data.token && data.user) login(data.token, data.user)
      setSuccess('Senha alterada com sucesso!')
      setSenhaAtual(''); setNovaSenha(''); setConfirmar('')
      if (mustChangePassword) setTimeout(() => navigate('/medicoes'), 1200)
    } catch (err) {
      setError(err.message || 'Erro ao alterar senha')
    } finally {
      setSaving(false)
    }
  }

  async function handleFotoSelect(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setPicError(''); setPicSuccess('')
    if (!file.type.startsWith('image/')) { setPicError('Selecione uma imagem válida'); return }
    setUploadingPic(true)
    try {
      const base64 = await resizeImage(file)
      const data = await api.updateProfilePicture(base64)
      if (data.token && data.user) login(data.token, data.user)
      setPicSuccess('Foto atualizada!')
    } catch (err) {
      setPicError(err.message || 'Erro ao salvar foto')
    } finally {
      setUploadingPic(false)
      // Limpa o input para permitir selecionar o mesmo arquivo novamente
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const picture  = user?.picture || null
  const initials = getInitials(user?.username || user?.name, user?.email)
  const roleLabelMap = { admin: 'Admin', operador: 'Operador', medidor: 'Medidor' }
  const roleLabel = roleLabelMap[user?.role] || user?.role || 'Operador'
  const roleColor = user?.role === 'admin'
    ? 'bg-red-100 text-red-700'
    : user?.role === 'operador'
      ? 'bg-orange-100 text-orange-700'
      : 'bg-blue-100 text-blue-700'

  return (
    <div className="p-6 max-w-lg mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-800">👤 Meu Perfil</h1>
        <p className="text-sm text-gray-500 mt-0.5">Informações da sua conta</p>
      </div>

      {/* Forçar troca de senha */}
      {mustChangePassword && (
        <div className="mb-5 px-4 py-3 bg-amber-50 border border-amber-300 text-amber-800 rounded-lg text-sm font-medium">
          ⚠️ Por segurança, você precisa <strong>trocar sua senha temporária</strong> antes de continuar.
        </div>
      )}

      {/* Card de Informações + Avatar */}
      <div className="card mb-5">
        {/* Avatar */}
        <div className="flex items-start gap-5 mb-4">
          <div className="relative shrink-0">
            <div className="w-20 h-20 rounded-full overflow-hidden border-2 border-gray-200 bg-gradient-to-br from-orange-400 to-orange-600 flex items-center justify-center shadow">
              {picture ? (
                <img
                  src={picture}
                  alt="Foto de perfil"
                  className="w-full h-full object-cover"
                  onError={e => { e.currentTarget.style.display = 'none' }}
                />
              ) : (
                <span className="text-white font-bold text-2xl select-none">{initials}</span>
              )}
            </div>
            {/* Botão de câmera sobreposto */}
            {!uploadingPic && (
              <button
                onClick={() => fileRef.current?.click()}
                title="Trocar foto de perfil"
                className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-white border border-gray-200 shadow flex items-center justify-center hover:bg-gray-50 transition-colors text-sm"
              >
                📷
              </button>
            )}
            {uploadingPic && (
              <div className="absolute inset-0 rounded-full bg-black/40 flex items-center justify-center">
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              </div>
            )}
          </div>

          {/* Info ao lado do avatar */}
          <div className="flex-1 min-w-0 pt-1">
            <div className="font-semibold text-gray-800 text-base truncate">{user?.username || user?.name || '—'}</div>
            <div className="text-sm text-gray-500 truncate mt-0.5">{user?.email || '—'}</div>
            <span className={`inline-flex items-center mt-2 px-2.5 py-0.5 rounded-full text-xs font-medium ${roleColor}`}>
              {roleLabel}
            </span>
          </div>
        </div>

        {/* Mensagens de foto */}
        {picError   && <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2 mb-2">{picError}</div>}
        {picSuccess && <div className="text-xs text-green-700 bg-green-50 border border-green-200 rounded px-3 py-2 mb-2">✅ {picSuccess}</div>}

        {/* Botão de upload de foto */}
        <button
          onClick={() => fileRef.current?.click()}
          disabled={uploadingPic}
          className="w-full text-sm border border-dashed border-gray-300 rounded-lg py-2 text-gray-500 hover:border-orange-400 hover:text-orange-500 hover:bg-orange-50 transition-colors disabled:opacity-50"
        >
          {uploadingPic ? '⏳ Enviando foto…' : picture ? '📷 Trocar foto de perfil' : '📷 Adicionar foto de perfil'}
        </button>

        {/* Input oculto */}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFotoSelect}
        />

        {picture && !uploadingPic && (
          <p className="text-xs text-gray-400 mt-1.5 text-center">
            Foto atual salva • clique para substituir
          </p>
        )}
      </div>

      {/* Trocar senha — só para operadores (medidores e Google users não têm senha) */}
      {(user?.role === 'operador' || mustChangePassword) && (
        <div className="card">
          <h2 className="font-semibold text-gray-700 mb-4">🔑 Trocar Senha</h2>
          {error   && <div className="mb-3 px-3 py-2 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">{error}</div>}
          {success && <div className="mb-3 px-3 py-2 bg-green-50 border border-green-200 text-green-700 rounded-lg text-sm">{success}</div>}
          <form onSubmit={handleChangeSenha} className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Senha atual {mustChangePassword && <span className="text-amber-600">(temporária: 123456)</span>}
              </label>
              <input type="password" required value={senhaAtual} onChange={e => setSenhaAtual(e.target.value)}
                placeholder="Senha atual"
                className="input text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Nova senha</label>
              <input type="password" required value={novaSenha} onChange={e => setNovaSenha(e.target.value)}
                placeholder="Mínimo 4 caracteres"
                className="input text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Confirmar nova senha</label>
              <input type="password" required value={confirmar} onChange={e => setConfirmar(e.target.value)}
                placeholder="Repita a nova senha"
                className="input text-sm" />
            </div>
            <button type="submit" disabled={saving}
              className="btn-primary w-full text-sm disabled:opacity-60">
              {saving ? 'Salvando…' : mustChangePassword ? 'Definir senha e entrar' : 'Alterar senha'}
            </button>
          </form>
        </div>
      )}
    </div>
  )
}
