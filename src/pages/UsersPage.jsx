import React, { useEffect, useState } from 'react'
import { api } from '../api/client.js'

const ROLE_LABELS = { admin: 'Admin', medidor: 'Medidor', operador: 'Operador' }

const DEFAULT_SETORES = ['Administrativo', 'Financeiro', 'Orçamentos', 'Comercial', 'Adm. de Obras', 'Operacional de Obras']

const emptyForm = { email: '', name: '', role: 'operador', setores: [], podeAgendar: false, agendaPara: [], podeGerirEquipes: false }

export default function UsersPage() {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [editingEmail, setEditingEmail] = useState(null)
  const [saving, setSaving] = useState(false)
  const [deletingEmail, setDeletingEmail] = useState(null)
  const [setoresDisponiveis, setSetoresDisponiveis] = useState(DEFAULT_SETORES)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const [data, precos] = await Promise.all([api.getUsuarios(), api.getPrecos()])
      setUsers(Array.isArray(data) ? data : [])
      if (precos?.setores?.length) setSetoresDisponiveis(precos.setores)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  function openNew() {
    setForm(emptyForm)
    setEditingEmail(null)
    setShowForm(true)
  }

  function openEdit(user) {
    setForm({
      email: user.email,
      name: user.name || '',
      role: user.role || 'medidor',
      setores: user.setores || [],
      podeAgendar: !!user.podeAgendar,
      agendaPara: user.agendaPara || [],
      podeGerirEquipes: !!user.podeGerirEquipes,
    })
    setEditingEmail(user.email)
    setShowForm(true)
  }

  function cancelForm() {
    setShowForm(false)
    setEditingEmail(null)
    setForm(emptyForm)
  }

  function toggleSetor(setor) {
    setForm(f => ({
      ...f,
      setores: f.setores.includes(setor)
        ? f.setores.filter(s => s !== setor)
        : [...f.setores, setor]
    }))
  }

  async function handleSave(e) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      // Só envia podeAgendar/agendaPara/podeGerirEquipes quando o papel é medidor (irrelevante pros outros)
      const extras = form.role === 'medidor'
        ? { podeAgendar: !!form.podeAgendar, agendaPara: form.agendaPara || [], podeGerirEquipes: !!form.podeGerirEquipes }
        : { podeAgendar: false, agendaPara: [], podeGerirEquipes: false }
      if (editingEmail) {
        await api.updateUsuario(editingEmail, { name: form.name, role: form.role, setores: form.setores, ...extras })
      } else {
        await api.createUsuario({ email: form.email, name: form.name, role: form.role, setores: form.setores, ...extras })
      }
      cancelForm()
      await load()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(email) {
    if (!window.confirm(`Remover usuário ${email}?`)) return
    setDeletingEmail(email)
    setError(null)
    try {
      await api.deleteUsuario(email)
      await load()
    } catch (err) {
      setError(err.message)
    } finally {
      setDeletingEmail(null)
    }
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Usuários</h1>
          <p className="text-sm text-gray-500 mt-0.5">Gerenciar acesso ao painel</p>
        </div>
        <button
          onClick={openNew}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
          style={{ backgroundColor: '#1a5c9a' }}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Novo Usuário
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
          {error}
        </div>
      )}

      {/* Inline Form */}
      {showForm && (
        <div className="mb-6 bg-white rounded-xl shadow-sm border border-gray-200 p-5">
          <h2 className="text-base font-semibold text-gray-700 mb-4">
            {editingEmail ? 'Editar Usuário' : 'Novo Usuário'}
          </h2>
          <form onSubmit={handleSave} className="flex flex-col gap-4">
            <div className="flex flex-col sm:flex-row gap-3 items-end">
              <div className="flex-1 min-w-0">
                <label className="block text-xs font-medium text-gray-600 mb-1">Email (Gmail)</label>
                <input
                  type="email"
                  required
                  disabled={!!editingEmail}
                  value={form.email}
                  onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  placeholder="usuario@gmail.com"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 disabled:bg-gray-100"
                />
              </div>
              <div className="flex-1 min-w-0">
                <label className="block text-xs font-medium text-gray-600 mb-1">Nome</label>
                <input
                  type="text"
                  required
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="Nome completo"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                />
              </div>
              <div className="w-36">
                <label className="block text-xs font-medium text-gray-600 mb-1">Papel</label>
                <select
                  value={form.role}
                  onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                >
                  <option value="operador">Operador</option>
                  <option value="medidor">Medidor</option>
                  <option value="admin">Admin</option>
                </select>
                {form.role === 'operador' && !editingEmail && (
                  <p className="text-xs text-amber-600 mt-1">Senha temporária: <strong>123456</strong>. O usuário deverá trocá-la no primeiro acesso.</p>
                )}
              </div>
            </div>

            {/* Setores */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-2">Setores</label>
              <div className="flex flex-wrap gap-2 max-h-28 overflow-y-auto">
                {setoresDisponiveis.map(setor => (
                  <label key={setor} className="flex items-center gap-1.5 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={form.setores.includes(setor)}
                      onChange={() => toggleSetor(setor)}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-300"
                    />
                    <span className="text-sm text-gray-700">{setor}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Permissão de agendamento (só medidor) */}
            {form.role === 'medidor' && (
              <div className="rounded-lg border-2 border-orange-200 bg-orange-50 p-4 space-y-3">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={!!form.podeAgendar}
                    onChange={e => setForm(f => ({ ...f, podeAgendar: e.target.checked }))}
                    className="rounded border-orange-300 text-orange-600 focus:ring-orange-300"
                  />
                  <span className="text-sm font-semibold text-orange-900">
                    📅 Pode agendar visitas pelo app
                  </span>
                </label>
                <p className="text-xs text-orange-800 -mt-1 ml-6">
                  Mostra o botão <strong>"FAZER AGENDAMENTO"</strong> na home do PWA Medidor.
                  Visitas criadas por ele já nascem confirmadas.
                </p>

                {form.podeAgendar && (
                  <div className="ml-6">
                    <label className="block text-xs font-medium text-orange-900 mb-1.5">
                      Pode agendar para outros medidores além de si:
                    </label>
                    <div className="flex flex-wrap gap-2 bg-white rounded p-2 border border-orange-200">
                      {users.filter(u => u.role === 'medidor' && u.email !== form.email).length === 0 ? (
                        <span className="text-xs text-gray-400 italic">Nenhum outro medidor cadastrado</span>
                      ) : (
                        users
                          .filter(u => u.role === 'medidor' && u.email !== form.email)
                          .map(u => (
                            <label key={u.email} className="flex items-center gap-1.5 cursor-pointer select-none px-2 py-1 rounded hover:bg-orange-50">
                              <input
                                type="checkbox"
                                checked={(form.agendaPara || []).includes(u.email)}
                                onChange={() => setForm(f => ({
                                  ...f,
                                  agendaPara: (f.agendaPara || []).includes(u.email)
                                    ? f.agendaPara.filter(e => e !== u.email)
                                    : [...(f.agendaPara || []), u.email]
                                }))}
                                className="rounded border-orange-300 text-orange-600 focus:ring-orange-300"
                              />
                              <span className="text-sm text-gray-800">{u.name || u.email}</span>
                            </label>
                          ))
                      )}
                    </div>
                    <p className="text-xs text-orange-700 mt-1">
                      Visitas criadas por ele para outros medidores também nascem confirmadas e vão direto pra agenda do colega.
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Permissão de gestão de equipes (encarregado) */}
            {form.role === 'medidor' && (
              <div className="rounded-lg border-2 border-green-200 bg-green-50 p-4 space-y-2">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={!!form.podeGerirEquipes}
                    onChange={e => setForm(f => ({ ...f, podeGerirEquipes: e.target.checked }))}
                    className="rounded border-green-300 text-green-600 focus:ring-green-300"
                  />
                  <span className="text-sm font-semibold text-green-900">
                    🛠️ Pode gerir equipes (encarregado)
                  </span>
                </label>
                <p className="text-xs text-green-800 ml-6">
                  Mostra o botão <strong>"GESTÃO DE EQUIPES"</strong> na home do PWA Medidor.
                  Permite lançar entregas de produto/injetores pras equipes, ver previsão da semana e agenda das equipes.
                </p>
              </div>
            )}

            <div className="flex gap-2">
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-60"
                style={{ backgroundColor: '#1a5c9a' }}
              >
                {saving ? 'Salvando…' : 'Salvar'}
              </button>
              <button
                type="button"
                onClick={cancelForm}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200 transition-colors"
              >
                Cancelar
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-gray-400 text-sm">
            Carregando…
          </div>
        ) : users.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400">
            <svg className="w-10 h-10 mb-3 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M17 20h5v-2a4 4 0 00-4-4h-1M9 20H4v-2a4 4 0 014-4h1m4-4a4 4 0 100-8 4 4 0 000 8z" />
            </svg>
            <p className="text-sm">Nenhum usuário cadastrado</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-4 py-3 font-medium text-gray-600">Nome</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Email</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Papel</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Setores</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {users.map((u, idx) => (
                <tr
                  key={u.email}
                  className={`border-b border-gray-50 last:border-0 ${idx % 2 === 0 ? '' : 'bg-gray-50/40'}`}
                >
                  <td className="px-4 py-3 font-medium text-gray-800">
                    <div className="flex items-center gap-2">
                      {u.picture ? (
                        <img src={u.picture} alt="" className="w-7 h-7 rounded-full object-cover" />
                      ) : (
                        <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center text-xs font-bold text-blue-600">
                          {(u.name || u.email || '?').charAt(0).toUpperCase()}
                        </div>
                      )}
                      {u.name || <span className="text-gray-400 italic">sem nome</span>}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{u.email}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-1">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                        u.role === 'admin'
                          ? 'bg-blue-100 text-blue-700'
                          : u.role === 'operador'
                          ? 'bg-orange-100 text-orange-700'
                          : 'bg-gray-100 text-gray-600'
                      }`}>
                        {ROLE_LABELS[u.role] || u.role}
                      </span>
                      {u.role === 'medidor' && u.podeAgendar && (
                        <span
                          className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-700"
                          title={`Pode agendar pra ${[u.email, ...(u.agendaPara || [])].length} medidor(es)`}
                        >
                          📅 Agenda
                        </span>
                      )}
                      {u.role === 'medidor' && u.podeGerirEquipes && (
                        <span
                          className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700"
                          title="Pode gerir equipes (lançar entregas, ver previsão)"
                        >
                          🛠️ Gestor
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {(u.setores || []).length === 0 ? (
                        <span className="text-gray-400 text-xs italic">Nenhum</span>
                      ) : (
                        (u.setores || []).map(s => (
                          <span key={s} className="inline-flex items-center px-1.5 py-0.5 rounded text-xs bg-gray-100 text-gray-600">
                            {s}
                          </span>
                        ))
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => openEdit(u)}
                        className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                        title="Editar"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                            d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>
                      <button
                        onClick={() => handleDelete(u.email)}
                        disabled={deletingEmail === u.email}
                        className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-40"
                        title="Excluir"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
