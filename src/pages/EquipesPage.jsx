import React, { useEffect, useState } from 'react'
import { api } from '../api/client.js'

const CORES = ['#1a5c9a', '#e87722', '#16a34a', '#dc2626', '#7c3aed', '#0891b2', '#d97706']

function EquipeModal({ equipe, onClose, onSave }) {
  const [form, setForm] = useState(
    equipe || { nome: '', emailGmail: '', membros: [], cor: '#1a5c9a', ativa: true }
  )
  const [novoMembro, setNovoMembro] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const addMembro = () => {
    const m = novoMembro.trim()
    if (!m) return
    setForm(f => ({ ...f, membros: [...(f.membros || []), m] }))
    setNovoMembro('')
  }

  const removeMembro = (idx) => {
    setForm(f => ({ ...f, membros: f.membros.filter((_, i) => i !== idx) }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.nome.trim()) { setError('Nome obrigatório'); return }
    setSaving(true)
    setError('')
    try {
      await onSave(form)
      onClose()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full max-h-[90vh] flex flex-col">
        <div className="p-5 border-b">
          <h2 className="text-lg font-bold text-gray-800">{equipe ? 'Editar Equipe' : 'Nova Equipe'}</h2>
        </div>
        <form onSubmit={handleSubmit} className="p-5 overflow-auto flex-1 space-y-4">
          {error && <div className="bg-red-50 text-red-700 border border-red-200 rounded p-3 text-sm">{error}</div>}

          <div>
            <label className="label">Nome da Equipe *</label>
            <input className="input" value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} placeholder="Ex: Equipe A" />
          </div>

          <div>
            <label className="label">E-mail Gmail da Equipe</label>
            <input className="input" type="email" value={form.emailGmail || ''} onChange={e => setForm(f => ({ ...f, emailGmail: e.target.value }))} placeholder="equipeavedafacil@gmail.com" />
          </div>

          <div>
            <label className="label">Cor</label>
            <div className="flex gap-2 mt-1">
              {CORES.map(cor => (
                <button key={cor} type="button"
                  onClick={() => setForm(f => ({ ...f, cor }))}
                  className={`w-7 h-7 rounded-full border-2 transition-all ${form.cor === cor ? 'border-gray-800 scale-110' : 'border-transparent'}`}
                  style={{ backgroundColor: cor }}
                />
              ))}
            </div>
          </div>

          <div>
            <label className="label">Membros</label>
            <div className="flex gap-2 mb-2">
              <input className="input flex-1" value={novoMembro} onChange={e => setNovoMembro(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addMembro())}
                placeholder="Nome do membro" />
              <button type="button" onClick={addMembro} className="btn-secondary px-3">+</button>
            </div>
            {(form.membros || []).length > 0 && (
              <div className="flex flex-wrap gap-2">
                {(form.membros || []).map((m, i) => (
                  <span key={i} className="flex items-center gap-1 bg-blue-50 text-blue-700 text-sm px-2 py-1 rounded-full border border-blue-200">
                    {m}
                    <button type="button" onClick={() => removeMembro(i)} className="text-blue-400 hover:text-red-500 ml-1">×</button>
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            <input type="checkbox" id="ativa" checked={form.ativa !== false}
              onChange={e => setForm(f => ({ ...f, ativa: e.target.checked }))} className="accent-primary" />
            <label htmlFor="ativa" className="text-sm text-gray-700">Equipe ativa</label>
          </div>
        </form>
        <div className="p-5 border-t flex gap-3 justify-end">
          <button onClick={onClose} className="btn-secondary" disabled={saving}>Cancelar</button>
          <button onClick={handleSubmit} className="btn-primary" disabled={saving}>
            {saving ? 'Salvando...' : equipe ? 'Salvar' : 'Criar Equipe'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function EquipesPage() {
  const [equipes, setEquipes] = useState([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editando, setEditando] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(null)

  const load = () => {
    setLoading(true)
    api.getEquipes()
      .then(setEquipes)
      .catch(console.error)
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const handleSave = async (form) => {
    if (editando) {
      const updated = await api.updateEquipe(editando.id || editando._id, form)
      setEquipes(prev => prev.map(e => (e.id || e._id) === (editando.id || editando._id) ? updated : e))
    } else {
      const created = await api.createEquipe(form)
      setEquipes(prev => [created, ...prev])
    }
  }

  const handleDelete = async (id) => {
    await api.deleteEquipe(id)
    setEquipes(prev => prev.filter(e => (e.id || e._id) !== id))
    setConfirmDelete(null)
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
    </div>
  )

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Equipes</h1>
          <p className="text-gray-500 text-sm mt-1">Gerencie as equipes de execução</p>
        </div>
        <button onClick={() => { setEditando(null); setModalOpen(true) }} className="btn-primary">
          + Nova Equipe
        </button>
      </div>

      {equipes.length === 0 ? (
        <div className="card text-center py-12">
          <div className="text-5xl mb-4">👷</div>
          <h3 className="text-lg font-semibold text-gray-700 mb-2">Nenhuma equipe cadastrada</h3>
          <p className="text-gray-500 text-sm mb-4">Crie equipes para atribuir às ordens de serviço</p>
          <button onClick={() => { setEditando(null); setModalOpen(true) }} className="btn-primary">
            + Criar primeira equipe
          </button>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {equipes.map(eq => {
            const id = eq.id || eq._id
            return (
              <div key={id} className={`card border-l-4 ${!eq.ativa ? 'opacity-60' : ''}`}
                style={{ borderLeftColor: eq.cor || '#1a5c9a' }}>
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="font-bold text-gray-800">{eq.nome}</h3>
                    {eq.emailGmail && (
                      <p className="text-xs text-gray-500 mt-0.5">{eq.emailGmail}</p>
                    )}
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${eq.ativa !== false ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                    {eq.ativa !== false ? 'Ativa' : 'Inativa'}
                  </span>
                </div>

                {(eq.membros || []).length > 0 && (
                  <div className="mb-3">
                    <p className="text-xs text-gray-500 mb-1.5">Membros ({eq.membros.length}):</p>
                    <div className="flex flex-wrap gap-1">
                      {eq.membros.map((m, i) => (
                        <span key={i} className="text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded-full">{m}</span>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex gap-2 mt-3 pt-3 border-t">
                  <button onClick={() => { setEditando(eq); setModalOpen(true) }}
                    className="flex-1 text-xs btn-secondary py-1.5">
                    ✏️ Editar
                  </button>
                  <button onClick={() => setConfirmDelete(id)}
                    className="flex-1 text-xs bg-red-50 text-red-600 border border-red-200 rounded-lg py-1.5 hover:bg-red-100 transition-colors">
                    🗑️ Excluir
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {modalOpen && (
        <EquipeModal
          equipe={editando}
          onClose={() => { setModalOpen(false); setEditando(null) }}
          onSave={handleSave}
        />
      )}

      {confirmDelete && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-6">
            <h3 className="font-bold text-gray-800 mb-2">Excluir equipe?</h3>
            <p className="text-gray-600 text-sm mb-5">Esta ação não pode ser desfeita.</p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmDelete(null)} className="flex-1 btn-secondary">Cancelar</button>
              <button onClick={() => handleDelete(confirmDelete)} className="flex-1 bg-red-600 text-white rounded-lg py-2 font-medium hover:bg-red-700 transition-colors">Excluir</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
