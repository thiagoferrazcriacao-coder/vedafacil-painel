import React, { useEffect, useState, useCallback } from 'react'
import { api } from '../api/client.js'

const CORES = ['#1a5c9a', '#e87722', '#16a34a', '#dc2626', '#7c3aed', '#0891b2', '#d97706']

/* ────────────────────────── helpers ──────────────────────────────────────── */
function fmtDate(ts) {
  if (!ts) return '—'
  return new Date(ts).toLocaleDateString('pt-BR')
}
function fmtNum(n, dec = 1) {
  return (Math.round(n * Math.pow(10, dec)) / Math.pow(10, dec)).toLocaleString('pt-BR', { minimumFractionDigits: dec })
}
function getPeriodDates(period, customStart, customEnd) {
  const hoje = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  const fmt = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  if (period === 'hoje') return { start: fmt(hoje), end: fmt(hoje) }
  if (period === 'semana') {
    const dow = hoje.getDay()
    const seg = new Date(hoje); seg.setDate(hoje.getDate() - (dow === 0 ? 6 : dow - 1))
    return { start: fmt(seg), end: fmt(hoje) }
  }
  if (period === '15d') {
    const inicio = new Date(hoje); inicio.setDate(hoje.getDate() - 14)
    return { start: fmt(inicio), end: fmt(hoje) }
  }
  if (period === '30d') {
    const inicio = new Date(hoje); inicio.setDate(hoje.getDate() - 29)
    return { start: fmt(inicio), end: fmt(hoje) }
  }
  if (period === 'mes') {
    return { start: `${hoje.getFullYear()}-${pad(hoje.getMonth() + 1)}-01`, end: fmt(hoje) }
  }
  if (period === 'personalizado') return { start: customStart || fmt(hoje), end: customEnd || fmt(hoje) }
  // default: semana
  const dow = hoje.getDay()
  const seg = new Date(hoje); seg.setDate(hoje.getDate() - (dow === 0 ? 6 : dow - 1))
  return { start: fmt(seg), end: fmt(hoje) }
}

/* ────────────────────────── mini components ──────────────────────────────── */
function ScoreBadge({ score }) {
  const color = score >= 50 ? 'bg-green-100 text-green-700' : score >= 20 ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-100 text-gray-500'
  return <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${color}`}>⭐ {score} pts</span>
}

function StatBox({ label, value, sub, color = 'text-gray-800' }) {
  return (
    <div className="bg-white border rounded-lg p-3 text-center">
      <div className={`text-xl font-bold ${color}`}>{value}</div>
      <div className="text-xs text-gray-500 mt-0.5">{label}</div>
      {sub && <div className="text-[10px] text-gray-400 mt-0.5">{sub}</div>}
    </div>
  )
}

/* ────────────────────────── EquipeModal ──────────────────────────────────── */
function EquipeModal({ equipe, onClose, onSave }) {
  const [form, setForm] = useState(
    equipe ? { ...equipe } : { nome: '', emailGmail: '', membros: [], cor: '#1a5c9a', ativa: true }
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
    if (e) e.preventDefault()
    if (!form.nome.trim()) { setError('Nome obrigatório'); return }
    setSaving(true); setError('')
    try { await onSave(form); onClose() }
    catch (err) { setError(err.message) }
    finally { setSaving(false) }
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

/* ────────────────────────── DesempenhoPanel ──────────────────────────────── */
function DesempenhoPanel({ equipe, periodo }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!equipe) return
    setLoading(true)
    const { start, end } = periodo
    api.getEquipeDesempenho(equipe.id || equipe._id, start, end)
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [equipe, periodo])

  if (!equipe) return null
  if (loading) return <div className="py-6 text-center text-gray-500 text-sm">Carregando desempenho...</div>
  if (!data) return null

  const varConsumo = data.consumoEstim > 0 ? ((data.consumoReal - data.consumoEstim) / data.consumoEstim * 100) : 0
  const varColor = Math.abs(varConsumo) < 10 ? 'text-green-600' : Math.abs(varConsumo) < 20 ? 'text-yellow-600' : 'text-red-600'

  return (
    <div className="mt-4 space-y-4">
      {/* Stats grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatBox label="OS executadas" value={data.totalOS} color="text-blue-700" />
        <StatBox label="Sub-itens concluídos" value={data.totalFeitos} sub={`de ${data.totalSubPontos} total`} color="text-green-700" />
        <StatBox label="Metragem" value={`${fmtNum(data.totalMetragem)} m`} color="text-purple-700" />
        <StatBox label="Reparos" value={data.totalReparos} color={data.totalReparos > 0 ? 'text-red-600' : 'text-gray-500'} />
      </div>

      {/* Consumo GVF */}
      {(data.consumoEstim > 0 || data.consumoReal > 0) && (
        <div className="bg-gray-50 rounded-lg p-4">
          <h4 className="text-sm font-semibold text-gray-700 mb-3">🛢 Consumo GVF Seal</h4>
          <div className="grid grid-cols-3 gap-3">
            <div className="text-center">
              <div className="text-lg font-bold text-blue-700">{fmtNum(data.consumoEstim)} L</div>
              <div className="text-xs text-gray-500">Estimativa</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-bold text-gray-800">{fmtNum(data.consumoReal)} L</div>
              <div className="text-xs text-gray-500">Realizado</div>
            </div>
            <div className="text-center">
              <div className={`text-lg font-bold ${varColor}`}>{varConsumo > 0 ? '+' : ''}{fmtNum(varConsumo)}%</div>
              <div className="text-xs text-gray-500">Variação</div>
            </div>
          </div>
        </div>
      )}

      {/* OS detalhadas */}
      {data.detalhes && data.detalhes.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold text-gray-700 mb-2">Ordens de Serviço no período</h4>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-gray-100 text-gray-600">
                  <th className="text-left py-2 px-3 rounded-l">OS</th>
                  <th className="text-left py-2 px-3">Cliente</th>
                  <th className="text-center py-2 px-3">Status</th>
                  <th className="text-center py-2 px-3">Itens</th>
                  <th className="text-center py-2 px-3">Metragem</th>
                  <th className="text-center py-2 px-3 rounded-r">Conclução</th>
                </tr>
              </thead>
              <tbody>
                {data.detalhes.map((os, i) => (
                  <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                    <td className="py-2 px-3 font-mono">#{String(os.numero || '').padStart(3, '0')}</td>
                    <td className="py-2 px-3">{os.cliente || '—'}</td>
                    <td className="py-2 px-3 text-center">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] ${os.status === 'concluida' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                        {os.status === 'concluida' ? 'Concluída' : 'Em andamento'}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-center">{os.subFeitos}/{os.subTotal}</td>
                    <td className="py-2 px-3 text-center">{fmtNum(os.metragem)} m</td>
                    <td className="py-2 px-3 text-center">{os.concluidaEm ? fmtDate(os.concluidaEm) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

/* ────────────────────────── RankingPanel ─────────────────────────────────── */
function RankingPanel({ periodo }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    setLoading(true)
    const { start, end } = periodo
    api.getEquipesRanking(start, end)
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [periodo])

  if (loading) return <div className="py-8 text-center text-gray-500 text-sm animate-pulse">Carregando ranking...</div>
  if (!data || !data.ranking || data.ranking.length === 0) {
    return <div className="py-8 text-center text-gray-500 text-sm">Nenhum dado de ranking para o período.</div>
  }

  const medalhas = ['🥇', '🥈', '🥉']

  return (
    <div className="space-y-3">
      {data.ranking.map((eq, i) => (
        <div key={eq.equipeId} className={`bg-white rounded-xl border p-4 ${i === 0 ? 'border-yellow-300 shadow-md' : ''}`}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <span className="text-2xl">{medalhas[i] || `#${i + 1}`}</span>
              <div>
                <div className="font-bold text-gray-800 flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full inline-block" style={{ backgroundColor: eq.cor || '#1a5c9a' }} />
                  {eq.equipeNome}
                </div>
              </div>
            </div>
            <ScoreBadge score={eq.score} />
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 text-center">
            <div>
              <div className="text-sm font-bold text-green-700">{eq.obrasExecutadas ?? eq.totalOS}</div>
              <div className="text-[10px] text-gray-500">Obras Exec.</div>
            </div>
            <div>
              <div className="text-sm font-bold text-blue-700">{eq.totalOS}</div>
              <div className="text-[10px] text-gray-500">OS Total</div>
            </div>
            <div>
              <div className="text-sm font-bold text-green-700">{eq.subFeitos}</div>
              <div className="text-[10px] text-gray-500">Sub-itens</div>
            </div>
            <div>
              <div className="text-sm font-bold text-purple-700">{fmtNum(eq.metragem)} m</div>
              <div className="text-[10px] text-gray-500">Metragem</div>
            </div>
            <div>
              <div className={`text-sm font-bold ${eq.reparosCausados > 0 ? 'text-red-600' : 'text-gray-400'}`}>
                {eq.reparosCausados || 0}
                {eq.reparosProprios > 0 && <span className="text-[9px] text-amber-600 ml-0.5">+{eq.reparosProprios}✔</span>}
              </div>
              <div className="text-[10px] text-gray-500">Reparos</div>
              {eq.reparosProprios > 0 && <div className="text-[9px] text-amber-600 font-semibold">PRÓPRIOS</div>}
            </div>
            <div>
              <div className="text-sm font-bold text-gray-600">
                {eq.consumoEstim > 0 ? `${fmtNum(eq.consumoReal)}/${fmtNum(eq.consumoEstim)} L` : '—'}
              </div>
              <div className="text-[10px] text-gray-500">GVF real/est.</div>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

/* ────────────────────────── EquipesPage (main) ───────────────────────────── */
export default function EquipesPage() {
  const [equipes, setEquipes] = useState([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editando, setEditando] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [activeTab, setActiveTab] = useState('equipes') // 'equipes' | 'ranking' | 'desempenho'
  const [equipeSelecionada, setEquipeSelecionada] = useState(null)
  const [period, setPeriod] = useState('mes')
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')
  const [localizacao, setLocalizacao] = useState([]) // [{ equipeId, obraAtual, membros }]

  const periodo = getPeriodDates(period, customStart, customEnd)

  const load = () => {
    setLoading(true)
    api.getEquipes()
      .then(data => { setEquipes(data); if (data.length > 0 && !equipeSelecionada) setEquipeSelecionada(data[0]) })
      .catch(console.error)
      .finally(() => setLoading(false))
    api.getEquipesLocalizacao().then(setLocalizacao).catch(() => {})
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
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">👷 Equipes</h1>
          <p className="text-gray-500 text-sm mt-1">Gerencie equipes e acompanhe o desempenho</p>
        </div>
        <button onClick={() => { setEditando(null); setModalOpen(true) }} className="btn-primary">
          + Nova Equipe
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-lg p-1 mb-6 w-fit">
        {[
          { key: 'equipes', label: '📋 Equipes' },
          { key: 'ranking', label: '🏆 Ranking' },
          { key: 'desempenho', label: '📊 Desempenho' },
        ].map(t => (
          <button key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${activeTab === t.key ? 'bg-white shadow text-primary' : 'text-gray-600 hover:text-gray-800'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Period selector (ranking + desempenho) */}
      {(activeTab === 'ranking' || activeTab === 'desempenho') && (
        <div className="flex flex-wrap items-center gap-2 mb-5">
          {[
            { key: 'hoje', label: 'Hoje' },
            { key: 'semana', label: 'Esta semana' },
            { key: 'mes', label: 'Este mês' },
            { key: '30d', label: '30 dias' },
            { key: 'personalizado', label: 'Personalizado' },
          ].map(p => (
            <button key={p.key} onClick={() => setPeriod(p.key)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-all ${period === p.key ? 'bg-primary text-white border-primary' : 'bg-white text-gray-600 border-gray-200 hover:border-primary'}`}>
              {p.label}
            </button>
          ))}
          {period === 'personalizado' && (
            <div className="flex items-center gap-2 ml-1">
              <input type="date" className="input py-1 text-sm" value={customStart} onChange={e => setCustomStart(e.target.value)} />
              <span className="text-gray-400">até</span>
              <input type="date" className="input py-1 text-sm" value={customEnd} onChange={e => setCustomEnd(e.target.value)} />
            </div>
          )}
        </div>
      )}

      {/* Tab: Equipes */}
      {activeTab === 'equipes' && (
        <>
          {equipes.length === 0 ? (
            <div className="card text-center py-12">
              <div className="text-5xl mb-4">👷</div>
              <h3 className="text-lg font-semibold text-gray-700 mb-2">Nenhuma equipe cadastrada</h3>
              <p className="text-gray-500 text-sm mb-4">Crie equipes para atribuir às ordens de serviço</p>
              <button onClick={() => { setEditando(null); setModalOpen(true) }} className="btn-primary">+ Criar primeira equipe</button>
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {equipes.map(eq => {
                const id = eq.id || eq._id
                const loc = localizacao.find(l => l.equipeId === String(id))
                const obra = loc?.obraAtual
                return (
                  <div key={id} className={`card border-l-4 ${!eq.ativa ? 'opacity-60' : ''}`}
                    style={{ borderLeftColor: eq.cor || '#1a5c9a' }}>
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <h3 className="font-bold text-gray-800">{eq.nome}</h3>
                        {eq.emailGmail && <p className="text-xs text-gray-500 mt-0.5">{eq.emailGmail}</p>}
                      </div>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${eq.ativa !== false ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                        {eq.ativa !== false ? 'Ativa' : 'Inativa'}
                      </span>
                    </div>

                    {/* Obra atual */}
                    {obra ? (
                      <div className="mb-3 p-2.5 bg-yellow-50 border border-yellow-200 rounded-lg">
                        <div className="flex items-center gap-1.5 mb-1">
                          <span className="w-2 h-2 bg-yellow-400 rounded-full animate-pulse" />
                          <span className="text-xs font-semibold text-yellow-800">Em andamento</span>
                        </div>
                        <div className="text-xs font-medium text-gray-800 truncate">
                          OS #{String(obra.numero || '').padStart(3,'0')} — {obra.cliente}
                        </div>
                        {obra.endereco && (
                          <div className="text-xs text-gray-500 truncate mt-0.5">📍 {obra.endereco}{obra.cidade ? `, ${obra.cidade}` : ''}</div>
                        )}
                      </div>
                    ) : (
                      <div className="mb-3 p-2 bg-gray-50 border border-gray-100 rounded-lg text-xs text-gray-400 text-center">
                        Sem obra em andamento
                      </div>
                    )}

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
                        className="flex-1 text-xs btn-secondary py-1.5">✏️ Editar</button>
                      <button onClick={() => { setEquipeSelecionada(eq); setActiveTab('desempenho') }}
                        className="flex-1 text-xs bg-blue-50 text-blue-600 border border-blue-200 rounded-lg py-1.5 hover:bg-blue-100 transition-colors">
                        📊 Desempenho
                      </button>
                      <button onClick={() => setConfirmDelete(id)}
                        className="text-xs bg-red-50 text-red-600 border border-red-200 rounded-lg py-1.5 px-3 hover:bg-red-100 transition-colors">
                        🗑️
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}

      {/* Tab: Ranking */}
      {activeTab === 'ranking' && <RankingPanel periodo={periodo} />}

      {/* Tab: Desempenho */}
      {activeTab === 'desempenho' && (
        <div>
          {/* Seletor de equipe */}
          {equipes.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-5">
              {equipes.map(eq => (
                <button key={eq.id || eq._id}
                  onClick={() => setEquipeSelecionada(eq)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium border transition-all ${(equipeSelecionada?.id || equipeSelecionada?._id) === (eq.id || eq._id) ? 'text-white border-transparent shadow' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'}`}
                  style={(equipeSelecionada?.id || equipeSelecionada?._id) === (eq.id || eq._id) ? { backgroundColor: eq.cor || '#1a5c9a', borderColor: eq.cor || '#1a5c9a' } : {}}>
                  <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: eq.cor || '#1a5c9a' }} />
                  {eq.nome}
                </button>
              ))}
            </div>
          )}

          {equipeSelecionada ? (
            <DesempenhoPanel equipe={equipeSelecionada} periodo={periodo} />
          ) : (
            <div className="py-12 text-center text-gray-500">Selecione uma equipe para ver o desempenho</div>
          )}
        </div>
      )}

      {/* Modals */}
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
