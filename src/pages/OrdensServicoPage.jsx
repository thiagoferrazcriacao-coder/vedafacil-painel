import React, { useEffect, useState, useMemo } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { api } from '../api/client.js'
import { useAuth } from '../App.jsx'

const STATUS_CONFIG = {
  agendada:              { label: 'Agendada',          color: 'bg-blue-100 text-blue-700' },
  em_andamento:          { label: 'Em Andamento',      color: 'bg-yellow-100 text-yellow-700' },
  aguardando_assinatura: { label: '✍️ Aguard. Assin.', color: 'bg-amber-100 text-amber-800' },
  concluida:             { label: 'Concluída',         color: 'bg-green-100 text-green-700' },
  cancelada:             { label: 'Cancelada',         color: 'bg-red-100 text-red-700' },
}

function NovaOSModal({ onClose, onSave, contratoIdInicial, tipoInicial }) {
  const [contratos, setContratos] = useState([])
  const [equipes, setEquipes] = useState([])
  const [tecnicos, setTecnicos] = useState([])
  const [form, setForm] = useState({
    contratoId: contratoIdInicial || '', equipeId: '', dataInicio: '', dataTermino: '', obs: '', tecnicoResponsavel: ''
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    Promise.all([api.getContratos(), api.getEquipes(), api.getPrecos()])
      .then(([c, e, p]) => { setContratos(c); setEquipes(e); setTecnicos(p?.tecnicos || ['Alan', 'Fernando', 'Thiago', 'Daniel']) })
      .catch(console.error)
  }, [])

  const contratoSel = contratos.find(c => (c.id || c._id) === form.contratoId)

  // Pré-preenche datas do contrato quando selecionado
  useEffect(() => {
    if (!contratoSel) return
    const toDateInput = (d) => {
      if (!d) return ''
      const s = String(d)
      // já está em YYYY-MM-DD
      if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
      const dt = new Date(s)
      if (isNaN(dt.getTime())) return ''
      return dt.toISOString().slice(0, 10)
    }
    setForm(f => ({
      ...f,
      dataInicio:  f.dataInicio  || toDateInput(contratoSel.dataInicio),
      dataTermino: f.dataTermino || toDateInput(contratoSel.dataTermino),
    }))
  }, [form.contratoId]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleSubmit = async () => {
    if (!form.contratoId) { setError('Selecione um contrato'); return }
    if (!form.dataInicio) { setError('Informe a data de início'); return }
    setSaving(true)
    setError('')
    try {
      const c = contratoSel
      const payload = {
        ...form,
        cliente: c?.cliente || '',
        endereco: c?.endereco || '',
        cidade: c?.cidade || '',
        celular: c?.celular || '',
        orcamentoId: c?.orcamentoId || '',
        diasTrabalho: c?.diasTrabalho || 0,
        consumoProduto: c?.consumoProduto || 0,
        qtdInjetores: c?.qtdInjetores || 0,
        pontos: c?.locais || [],
        itens: c?.itens || [],
      }
      await onSave(payload)
      onClose()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[90vh] flex flex-col">
        <div className="p-5 border-b">
          <h2 className="text-lg font-bold text-gray-800">{tipoInicial === 'reparo' ? 'Nova OS de Reparo' : 'Nova Ordem de Serviço'}</h2>
        </div>
        <div className="p-5 overflow-auto flex-1 space-y-4">
          {error && <div className="bg-red-50 text-red-700 border border-red-200 rounded p-3 text-sm">{error}</div>}

          <div>
            <label className="label">Contrato *</label>
            <select className="input" value={form.contratoId} onChange={e => setForm(f => ({ ...f, contratoId: e.target.value }))}>
              <option value="">Selecione um contrato...</option>
              {contratos.map(c => (
                <option key={c.id || c._id} value={c.id || c._id}>
                  #{String(c.numero || '').padStart(4, '0')} — {c.cliente}
                </option>
              ))}
            </select>
          </div>

          {contratoSel && (
            <div className="bg-blue-50 rounded-lg p-3 text-sm">
              <p className="font-medium text-blue-800">{contratoSel.cliente}</p>
              <p className="text-blue-600">{contratoSel.endereco}{contratoSel.cidade ? ` — ${contratoSel.cidade}` : ''}</p>
              {(contratoSel.locais || []).length > 0 && (
                <p className="text-blue-500 mt-1">{contratoSel.locais.length} local(is) · {contratoSel.prazoExecucao || contratoSel.diasTrabalho || 0} dia(s) úteis</p>
              )}
              {(contratoSel.dataInicio || contratoSel.dataTermino) && (
                <p className="text-blue-400 mt-1 text-xs">
                  📅 Datas do contrato: {contratoSel.dataInicio || '—'} → {contratoSel.dataTermino || '—'}
                </p>
              )}
            </div>
          )}

          <div>
            <label className="label">Equipe</label>
            <select className="input" value={form.equipeId} onChange={e => setForm(f => ({ ...f, equipeId: e.target.value }))}>
              <option value="">Sem equipe atribuída</option>
              {equipes.filter(e => e.ativa !== false).map(eq => (
                <option key={eq.id || eq._id} value={eq.id || eq._id}>{eq.nome}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Data de Início *</label>
              <input type="date" className="input" value={form.dataInicio} onChange={e => setForm(f => ({ ...f, dataInicio: e.target.value }))} />
            </div>
            <div>
              <label className="label">Data Prevista de Término</label>
              <input type="date" className="input" value={form.dataTermino} onChange={e => setForm(f => ({ ...f, dataTermino: e.target.value }))} />
            </div>
          </div>

          <div>
            <label className="label">Técnico Responsável</label>
            <select className="input" value={form.tecnicoResponsavel} onChange={e => setForm(f => ({ ...f, tecnicoResponsavel: e.target.value }))}>
              <option value="">Sem técnico designado</option>
              {tecnicos.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>

          <div>
            <label className="label">Observações</label>
            <textarea className="input resize-none" rows={3} value={form.obs} onChange={e => setForm(f => ({ ...f, obs: e.target.value }))} placeholder="Instruções especiais, acesso, portaria..." />
          </div>
        </div>
        <div className="p-5 border-t flex gap-3 justify-end">
          <button onClick={onClose} className="btn-secondary" disabled={saving}>Cancelar</button>
          <button onClick={handleSubmit} className="btn-primary" disabled={saving}>
            {saving ? 'Criando...' : '✅ Criar OS'}
          </button>
        </div>
      </div>
    </div>
  )
}

function todayStr() {
  return new Date().toISOString().slice(0, 10)
}
function weekRange() {
  const now = new Date()
  const dow = now.getDay()
  const mon = new Date(now); mon.setDate(now.getDate() - (dow === 0 ? 6 : dow - 1))
  const sun = new Date(mon); sun.setDate(mon.getDate() + 6)
  return [mon.toISOString().slice(0, 10), sun.toISOString().slice(0, 10)]
}
function monthRange(offset = 0) {
  const now = new Date()
  const y = now.getFullYear(), m = now.getMonth() + offset
  const start = new Date(y, m, 1)
  const end = new Date(y, m + 1, 0)
  return [start.toISOString().slice(0, 10), end.toISOString().slice(0, 10)]
}

export default function OrdensServicoPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'
  const [ordens, setOrdens] = useState([])
  const [equipes, setEquipes] = useState([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [contratoIdParam, setContratoIdParam] = useState(null)
  const [tipoParam, setTipoParam] = useState(null)
  const [selecionados, setSelecionados] = useState([])
  const [deletandoLote, setDeletandoLote] = useState(false)

  // Filtros
  const [filtroStatus, setFiltroStatus] = useState('todos')
  const [filtroTipo, setFiltroTipo] = useState('todos')
  const [filtroEquipe, setFiltroEquipe] = useState('')
  const [filtroPeriodo, setFiltroPeriodo] = useState('')
  const [filtroInicio, setFiltroInicio] = useState('')
  const [filtroFim, setFiltroFim] = useState('')
  const [showFiltros, setShowFiltros] = useState(false)

  const setPeriodo = (periodo) => {
    setFiltroPeriodo(periodo)
    if (periodo === 'hoje') { setFiltroInicio(todayStr()); setFiltroFim(todayStr()) }
    else if (periodo === 'semana') { const [s, e] = weekRange(); setFiltroInicio(s); setFiltroFim(e) }
    else if (periodo === 'mes') { const [s, e] = monthRange(0); setFiltroInicio(s); setFiltroFim(e) }
    else if (periodo === 'mes_passado') { const [s, e] = monthRange(-1); setFiltroInicio(s); setFiltroFim(e) }
    else if (periodo === 'proximo_mes') { const [s, e] = monthRange(1); setFiltroInicio(s); setFiltroFim(e) }
    else if (periodo === 'personalizado') { /* manter datas */ }
    else { setFiltroInicio(''); setFiltroFim('') }
  }

  const load = () => {
    setLoading(true)
    Promise.all([api.getOrdensServico(), api.getEquipes()])
      .then(([os, eq]) => { setOrdens(os); setEquipes(eq) })
      .catch(console.error)
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
    const params = new URLSearchParams(location.search)
    const cid = params.get('contratoId')
    const tipo = params.get('tipo') || 'normal'
    if (cid) { setContratoIdParam(cid); setTipoParam(tipo); setModalOpen(true) }
  }, [])

  const handleSave = async (data) => {
    const created = await api.createOrdemServico({ ...data, tipo: tipoParam || 'normal' })
    setOrdens(prev => [created, ...prev])
  }

  const handleDelete = async (e, id, numero) => {
    e.stopPropagation()
    if (!confirm(`Excluir OS #${String(numero || '').padStart(3, '0')}? Esta ação não pode ser desfeita.`)) return
    try {
      await api.deleteOrdemServico(id)
      setOrdens(prev => prev.filter(o => (o.id || o._id) !== id))
    } catch (err) {
      alert('Erro ao excluir: ' + err.message)
    }
  }

  const ordensFiltradas = useMemo(() => {
    return ordens.filter(os => {
      if (filtroStatus !== 'todos' && os.status !== filtroStatus) return false
      if (filtroTipo !== 'todos' && (os.tipo || 'normal') !== filtroTipo) return false
      if (filtroEquipe && (os.equipeId || os.equipe) !== filtroEquipe) return false
      if (filtroInicio) {
        const d = os.dataInicio || os.createdAt?.slice(0, 10) || ''
        if (d < filtroInicio) return false
      }
      if (filtroFim) {
        const d = os.dataInicio || os.createdAt?.slice(0, 10) || ''
        if (d > filtroFim) return false
      }
      return true
    })
  }, [ordens, filtroStatus, filtroTipo, filtroEquipe, filtroInicio, filtroFim])

  const contadores = Object.keys(STATUS_CONFIG).reduce((acc, s) => {
    acc[s] = ordens.filter(o => o.status === s).length
    return acc
  }, {})
  const totalReparos = ordens.filter(o => (o.tipo || 'normal') === 'reparo').length

  const toggleSel = (e, id) => {
    e.stopPropagation()
    setSelecionados(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }
  const toggleTodos = () => {
    const ids = ordensFiltradas.map(o => o.id || o._id)
    setSelecionados(prev => prev.length === ids.length ? [] : ids)
  }
  const handleDeleteLote = async () => {
    if (!confirm(`Excluir ${selecionados.length} OS selecionada(s)? Esta ação não pode ser desfeita.`)) return
    setDeletandoLote(true)
    try {
      await Promise.all(selecionados.map(id => api.deleteOrdemServico(id)))
      setOrdens(prev => prev.filter(o => !selecionados.includes(o.id || o._id)))
      setSelecionados([])
    } catch (err) { alert('Erro ao excluir: ' + err.message) }
    setDeletandoLote(false)
  }

  const temFiltroAtivo = filtroStatus !== 'todos' || filtroTipo !== 'todos' || filtroEquipe || filtroInicio || filtroFim

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
    </div>
  )

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Ordens de Serviço</h1>
          <p className="text-gray-500 text-sm mt-1">{ordensFiltradas.length} de {ordens.length} OS</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowFiltros(f => !f)}
            className={`btn-secondary flex items-center gap-2 ${temFiltroAtivo ? 'ring-2 ring-primary text-primary' : ''}`}
          >
            🔍 Filtros {temFiltroAtivo && <span className="bg-primary text-white text-xs rounded-full w-4 h-4 flex items-center justify-center">!</span>}
          </button>
          <button onClick={() => setModalOpen(true)} className="btn-primary">
            + Nova OS
          </button>
        </div>
      </div>

      {/* Filtros avançados */}
      {showFiltros && (
        <div className="card mb-4 space-y-3">
          {/* Período rápido */}
          <div>
            <label className="label mb-1">Período</label>
            <div className="flex flex-wrap gap-2">
              {[
                { key: '', label: 'Todos' },
                { key: 'hoje', label: 'Hoje' },
                { key: 'semana', label: 'Semana' },
                { key: 'mes', label: 'Este mês' },
                { key: 'mes_passado', label: 'Mês passado' },
                { key: 'proximo_mes', label: 'Próximo mês' },
                { key: 'personalizado', label: 'Personalizado' },
              ].map(p => (
                <button key={p.key}
                  onClick={() => setPeriodo(p.key)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                    filtroPeriodo === p.key ? 'bg-primary text-white border-primary' : 'bg-white text-gray-600 border-gray-300 hover:border-primary'
                  }`}
                >{p.label}</button>
              ))}
            </div>
          </div>
          {(filtroPeriodo === 'personalizado' || (filtroInicio || filtroFim)) && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Data início</label>
                <input type="date" className="input" value={filtroInicio}
                  onChange={e => { setFiltroInicio(e.target.value); setFiltroPeriodo('personalizado') }} />
              </div>
              <div>
                <label className="label">Data fim</label>
                <input type="date" className="input" value={filtroFim}
                  onChange={e => { setFiltroFim(e.target.value); setFiltroPeriodo('personalizado') }} />
              </div>
            </div>
          )}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <div>
              <label className="label">Tipo</label>
              <select className="input" value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)}>
                <option value="todos">Todos</option>
                <option value="normal">Obra</option>
                <option value="reparo">Reparo</option>
              </select>
            </div>
            <div>
              <label className="label">Equipe</label>
              <select className="input" value={filtroEquipe} onChange={e => setFiltroEquipe(e.target.value)}>
                <option value="">Todas as equipes</option>
                {equipes.map(eq => (
                  <option key={eq.id || eq._id} value={eq.id || eq._id}>{eq.nome}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Status</label>
              <select className="input" value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)}>
                <option value="todos">Todos</option>
                {Object.entries(STATUS_CONFIG).map(([k, v]) => (
                  <option key={k} value={k}>{v.label}</option>
                ))}
              </select>
            </div>
          </div>
          {temFiltroAtivo && (
            <button onClick={() => {
              setFiltroStatus('todos'); setFiltroTipo('todos'); setFiltroEquipe('')
              setFiltroPeriodo(''); setFiltroInicio(''); setFiltroFim('')
            }} className="text-sm text-red-500 hover:underline">
              ✕ Limpar filtros
            </button>
          )}
        </div>
      )}

      {/* Contadores — cards grandes */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3 mb-6">
        {[
          { key: 'agendada',              icon: '📅', bg: 'bg-blue-50',   border: 'border-blue-200',   num: 'text-blue-700',   badge: 'bg-blue-100 text-blue-700',    label: 'Agendada',    count: contadores['agendada'] || 0 },
          { key: 'em_andamento',          icon: '⚡', bg: 'bg-yellow-50', border: 'border-yellow-200', num: 'text-yellow-700', badge: 'bg-yellow-100 text-yellow-700', label: 'Em Andamento',count: contadores['em_andamento'] || 0 },
          { key: 'aguardando_assinatura', icon: '✍️', bg: 'bg-amber-50',  border: 'border-amber-200',  num: 'text-amber-700',  badge: 'bg-amber-100 text-amber-700',  label: 'Aguard. Assin.',count: contadores['aguardando_assinatura'] || 0 },
          { key: 'concluida',             icon: '✅', bg: 'bg-green-50',  border: 'border-green-200',  num: 'text-green-700',  badge: 'bg-green-100 text-green-700',  label: 'Concluída',   count: contadores['concluida'] || 0 },
          { key: 'cancelada',             icon: '🚫', bg: 'bg-gray-50',   border: 'border-gray-200',   num: 'text-gray-600',   badge: 'bg-gray-100 text-gray-600',    label: 'Cancelada',   count: contadores['cancelada'] || 0 },
          { key: '_reparo',               icon: '🔧', bg: 'bg-red-50',    border: 'border-red-300',    num: 'text-red-700',    badge: 'bg-red-100 text-red-700',      label: 'Reparo',      count: totalReparos },
        ].map(({ key, icon, bg, border, num, badge, label, count }) => (
          <button key={key}
            onClick={() => key === '_reparo' ? setFiltroTipo(filtroTipo === 'reparo' ? 'todos' : 'reparo') : setFiltroStatus(filtroStatus === key ? 'todos' : key)}
            className={`${bg} border ${border} rounded-xl py-5 px-3 flex flex-col items-center gap-1 cursor-pointer transition-all hover:shadow-md hover:scale-[1.02] active:scale-[0.98] ${(key === '_reparo' ? filtroTipo === 'reparo' : filtroStatus === key) ? 'ring-2 ring-primary shadow-md scale-[1.02]' : ''}`}>
            <span className="text-3xl">{icon}</span>
            <span className={`text-3xl font-extrabold ${num}`}>{count}</span>
            <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${badge}`}>{label}</span>
          </button>
        ))}
      </div>

      {/* Barra de seleção múltipla */}
      {isAdmin && ordensFiltradas.length > 0 && (
        <div className="flex items-center gap-3 mb-3">
          <input type="checkbox"
            checked={selecionados.length === ordensFiltradas.length && ordensFiltradas.length > 0}
            onChange={toggleTodos}
            className="w-4 h-4 accent-primary cursor-pointer"
            title="Selecionar todos"
          />
          <span className="text-sm text-gray-500">Selecionar todos ({ordensFiltradas.length})</span>
          {selecionados.length > 0 && (
            <button
              onClick={handleDeleteLote}
              disabled={deletandoLote}
              className="ml-auto bg-red-600 hover:bg-red-700 text-white text-sm px-4 py-1.5 rounded-lg font-semibold disabled:opacity-50"
            >
              🗑️ {deletandoLote ? 'Excluindo...' : `Excluir ${selecionados.length} selecionado(s)`}
            </button>
          )}
        </div>
      )}

      {/* Lista */}
      {ordensFiltradas.length === 0 ? (
        <div className="card text-center py-12">
          <div className="text-5xl mb-4">🔧</div>
          <h3 className="text-lg font-semibold text-gray-700 mb-2">
            {ordens.length === 0 ? 'Nenhuma OS criada ainda' : 'Nenhuma OS neste filtro'}
          </h3>
          <p className="text-gray-500 text-sm mb-4">
            {ordens.length === 0 ? 'Crie uma OS a partir de um contrato assinado' : 'Tente ajustar os filtros'}
          </p>
          {ordens.length === 0 && (
            <button onClick={() => setModalOpen(true)} className="btn-primary">
              + Criar primeira OS
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {ordensFiltradas.map(os => {
            const id = os.id || os._id
            const cfg = STATUS_CONFIG[os.status] || STATUS_CONFIG.agendada
            const isReparo = (os.tipo || 'normal') === 'reparo'
            const isSel = selecionados.includes(id)
            return (
              <div key={id}
                className={`card hover:shadow-md transition-shadow cursor-pointer ${
                  isReparo
                    ? 'bg-red-50 border-red-300 border-l-4 border-l-red-600'
                    : isSel ? 'ring-2 ring-primary' : ''
                }`}
                onClick={() => navigate(`/ordens-servico/${id}`)}>
                <div className="flex items-start gap-3">
                  {isAdmin && (
                    <input type="checkbox"
                      checked={isSel}
                      onChange={e => toggleSel(e, id)}
                      onClick={e => e.stopPropagation()}
                      className="w-4 h-4 mt-1 accent-primary cursor-pointer flex-shrink-0"
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="font-bold text-primary">OS #{String(os.numero || '').padStart(3, '0')}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${cfg.color}`}>{cfg.label}</span>
                      {isReparo && (
                        <span className="text-xs bg-red-600 text-white px-2 py-0.5 rounded-full font-bold">🔧 REPARO</span>
                      )}
                      {os.equipeNome && (
                        <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">👷 {os.equipeNome}</span>
                      )}
                      {os.tecnicoResponsavel && (
                        <span className="text-xs bg-orange-50 text-orange-700 px-2 py-0.5 rounded-full">🔧 {os.tecnicoResponsavel}</span>
                      )}
                    </div>
                    <p className="font-medium text-gray-800 truncate">{os.cliente}</p>
                    {os.endereco && <p className="text-sm text-gray-500 truncate">{os.endereco}{os.cidade ? ` — ${os.cidade}` : ''}</p>}
                    <div className="flex gap-3 mt-2 flex-wrap">
                      {os.dataInicio && (
                        <span className="text-xs text-gray-500">
                          📅 {new Date(os.dataInicio + 'T12:00:00').toLocaleDateString('pt-BR')}
                          {os.dataTermino && ` → ${new Date(os.dataTermino + 'T12:00:00').toLocaleDateString('pt-BR')}`}
                        </span>
                      )}
                      {(os.pontos || []).length > 0 && (
                        <span className="text-xs text-gray-500">📍 {os.pontos.length} local(is)</span>
                      )}
                      {os.diasTrabalho > 0 && (
                        <span className="text-xs text-gray-500">⏱️ {os.diasTrabalho} dia(s)</span>
                      )}
                    </div>
                  </div>

                  {/* Progresso + Excluir (admin) */}
                  <div className="text-right flex-shrink-0 flex flex-col items-end gap-2">
                    <div>
                      <div className="text-lg font-bold text-gray-700">{os.progresso || 0}%</div>
                      <div className="w-16 h-2 bg-gray-200 rounded-full mt-1">
                        <div className="h-2 bg-primary rounded-full transition-all"
                          style={{ width: `${os.progresso || 0}%` }} />
                      </div>
                    </div>
                    {isAdmin && (
                      <button
                        onClick={e => handleDelete(e, id, os.numero)}
                        className="text-xs text-red-400 hover:text-red-600 hover:underline transition-colors"
                        title="Excluir OS"
                      >
                        🗑️ Excluir
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {modalOpen && (
        <NovaOSModal
          onClose={() => { setModalOpen(false); setContratoIdParam(null); setTipoParam(null) }}
          onSave={handleSave}
          contratoIdInicial={contratoIdParam}
          tipoInicial={tipoParam}
        />
      )}
    </div>
  )
}
