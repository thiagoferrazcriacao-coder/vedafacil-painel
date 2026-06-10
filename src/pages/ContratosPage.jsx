import React, { useEffect, useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api/client.js'
import { useAuth } from '../App.jsx'
import ContratoEditorModal from '../components/ContratoEditorModal.jsx'

const fmt = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0)

const STATUS = {
  rascunho: { label: 'Rascunho', color: 'bg-gray-100 text-gray-700' },
  pendente_assinatura: { label: 'Pend. Assinatura', color: 'bg-orange-100 text-orange-800' },
  assinado: { label: 'Assinado', color: 'bg-green-100 text-green-800' },
}

const PERIODS = [
  { key: 'hoje', label: 'Hoje' },
  { key: 'semana', label: 'Semana' },
  { key: 'mes', label: 'Mês' },
  { key: 'mes_passado', label: 'Mês passado' },
  { key: 'proximo_mes', label: 'Próximo mês' },
  { key: 'personalizado', label: 'Personalizado' },
]

function getPeriodRange(period) {
  const now = new Date()
  const y = now.getFullYear()
  const m = now.getMonth()
  const d = now.getDate()

  if (period === 'hoje') {
    const start = new Date(y, m, d, 0, 0, 0, 0)
    const end = new Date(y, m, d, 23, 59, 59, 999)
    return [start, end]
  }
  if (period === 'semana') {
    const day = now.getDay()
    const diffToMon = (day === 0 ? -6 : 1 - day)
    const mon = new Date(y, m, d + diffToMon, 0, 0, 0, 0)
    const sun = new Date(mon)
    sun.setDate(mon.getDate() + 6)
    sun.setHours(23, 59, 59, 999)
    return [mon, sun]
  }
  if (period === 'mes') {
    const start = new Date(y, m, 1, 0, 0, 0, 0)
    const end = new Date(y, m + 1, 0, 23, 59, 59, 999)
    return [start, end]
  }
  if (period === 'mes_passado') {
    const start = new Date(y, m - 1, 1, 0, 0, 0, 0)
    const end = new Date(y, m, 0, 23, 59, 59, 999)
    return [start, end]
  }
  if (period === 'proximo_mes') {
    const start = new Date(y, m + 1, 1, 0, 0, 0, 0)
    const end = new Date(y, m + 2, 0, 23, 59, 59, 999)
    return [start, end]
  }
  return null
}

export default function ContratosPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'
  const [contratos, setContratos] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [checked, setChecked] = useState(new Set())
  const [deleting, setDeleting] = useState(false)
  const [updatingStatus, setUpdatingStatus] = useState(null)
  const [editorContratoId, setEditorContratoId] = useState(null)

  const [period, setPeriod] = useState('')
  const [dataInicio, setDataInicio] = useState('')
  const [dataFim, setDataFim] = useState('')

  const toggleCheck = (id, e) => {
    e.stopPropagation()
    setChecked(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }
  const toggleAll = () => {
    if (checked.size === filtered.length) setChecked(new Set())
    else setChecked(new Set(filtered.map(c => c.id)))
  }
  const handleDeleteSelected = async () => {
    if (!confirm(`Excluir ${checked.size} contrato(s)?`)) return
    setDeleting(true)
    for (const id of checked) {
      await api.deleteContrato(id).catch(() => {})
    }
    setContratos(prev => prev.filter(c => !checked.has(c.id)))
    setChecked(new Set())
    setDeleting(false)
  }

  const handleChangeStatus = async (e, id, newStatus) => {
    e.stopPropagation()
    setUpdatingStatus(id)
    try {
      await api.updateContratoStatus(id, newStatus)
      setContratos(prev => prev.map(c => c.id === id ? { ...c, status: newStatus } : c))
    } catch (err) {
      alert('Erro ao atualizar status: ' + err.message)
    } finally {
      setUpdatingStatus(null)
    }
  }

  // Admin: alterar o número de um contrato (uso para correção/integração)
  const handleAlterarNumero = async (e, c) => {
    e.stopPropagation()
    const atual = c.numero || ''
    const entrada = window.prompt(
      `Alterar número do contrato\n\nCliente: ${c.cliente || '—'}\nNúmero atual: ${atual}\n\nDigite o novo número:`,
      String(atual)
    )
    if (entrada === null) return // cancelou
    const novo = parseInt(String(entrada).trim(), 10)
    if (!Number.isFinite(novo) || novo <= 0) {
      alert('Número inválido. Use um número inteiro positivo.')
      return
    }
    if (novo === c.numero) return // sem mudança
    // Verifica duplicidade na lista local
    const dup = contratos.find(x => (x.id || x._id) !== (c.id || c._id) && x.numero === novo)
    if (dup) {
      const ok = window.confirm(`⚠️ Já existe outro contrato com o número ${novo} (cliente: ${dup.cliente}).\n\nDeseja continuar mesmo assim?`)
      if (!ok) return
    }
    try {
      await api.updateContrato(c.id || c._id, { numero: novo })
      setContratos(prev => prev.map(x => (x.id || x._id) === (c.id || c._id) ? { ...x, numero: novo } : x))
    } catch (err) {
      alert('Erro ao alterar número: ' + err.message)
    }
  }

  useEffect(() => {
    api.getContratos()
      .then(setContratos)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  const filtered = useMemo(() => {
    return contratos.filter(c => {
      if (statusFilter && c.status !== statusFilter) return false

      if (period && period !== 'personalizado') {
        const range = getPeriodRange(period)
        if (range) {
          const ts = c.createdAt ? new Date(c.createdAt) : null
          if (!ts || ts < range[0] || ts > range[1]) return false
        }
      }
      if (period === 'personalizado') {
        const ts = c.createdAt ? new Date(c.createdAt) : null
        if (dataInicio) {
          const start = new Date(dataInicio + 'T00:00:00')
          if (!ts || ts < start) return false
        }
        if (dataFim) {
          const end = new Date(dataFim + 'T23:59:59')
          if (!ts || ts > end) return false
        }
      }

      if (search) {
        const q = search.toLowerCase()
        return [c.cliente, c.cidade, String(c.numero)].filter(Boolean).some(v => v.toLowerCase().includes(q))
      }
      return true
    })
  }, [contratos, statusFilter, period, dataInicio, dataFim, search])

  const summary = useMemo(() => {
    const result = {
      rascunho: { count: 0, total: 0 },
      pendente_assinatura: { count: 0, total: 0 },
      assinado: { count: 0, total: 0 },
    }
    for (const c of filtered) {
      const key = c.status && result[c.status] !== undefined ? c.status : 'rascunho'
      result[key].count += 1
      result[key].total += c.totalLiquido || 0
    }
    return result
  }, [filtered])

  const summaryCards = [
    {
      key: 'rascunho',
      label: 'Rascunho',
      iconColor: 'text-gray-400',
      borderColor: 'border-gray-200',
      bgColor: 'bg-gray-50',
      badgeColor: 'bg-gray-100 text-gray-700',
    },
    {
      key: 'pendente_assinatura',
      label: 'Pend. Assinatura',
      iconColor: 'text-orange-400',
      borderColor: 'border-orange-200',
      bgColor: 'bg-orange-50',
      badgeColor: 'bg-orange-100 text-orange-800',
    },
    {
      key: 'assinado',
      label: 'Assinado',
      iconColor: 'text-green-400',
      borderColor: 'border-green-200',
      bgColor: 'bg-green-50',
      badgeColor: 'bg-green-100 text-green-800',
    },
  ]

  const handlePeriodClick = (key) => {
    if (period === key) setPeriod('')
    else setPeriod(key)
  }

  return (
    <div className="p-3 sm:p-6 max-w-6xl mx-auto">
      {editorContratoId && (
        <ContratoEditorModal
          contratoId={editorContratoId}
          onClose={() => setEditorContratoId(null)}
          onSaved={() => {
            setEditorContratoId(null)
            api.getContratos().then(setContratos).catch(console.error)
          }}
        />
      )}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-5 gap-3">
        <div className="flex items-center gap-4 flex-wrap">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-gray-800">Contratos</h1>
            <p className="text-gray-500 text-xs sm:text-sm mt-0.5">{filtered.length} registros</p>
          </div>
          {isAdmin && checked.size > 0 && (
            <button onClick={handleDeleteSelected} disabled={deleting} className="btn-danger text-sm">
              {deleting ? 'Excluindo...' : `Excluir ${checked.size} selecionado(s)`}
            </button>
          )}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
        {summaryCards.map(card => (
          <div
            key={card.key}
            className={`rounded-lg border ${card.borderColor} ${card.bgColor} px-4 py-3 flex items-center gap-3`}
          >
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">{card.label}</p>
              <p className="text-2xl font-bold text-gray-800 leading-none">{summary[card.key].count}</p>
              <p className="text-xs text-gray-500 mt-1">{fmt(summary[card.key].total)}</p>
            </div>
            <span className={`text-xs font-semibold px-2 py-1 rounded-full ${card.badgeColor} whitespace-nowrap`}>
              {summary[card.key].count === 1 ? '1 contrato' : `${summary[card.key].count} contratos`}
            </span>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="card mb-4 flex gap-3 flex-wrap">
        <input
          className="input flex-1 min-w-40"
          placeholder="Buscar cliente, número..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <select className="input w-52" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="">Todos status</option>
          <option value="rascunho">Rascunho</option>
          <option value="pendente_assinatura">Pend. Assinatura</option>
          <option value="assinado">Assinado</option>
        </select>
      </div>

      {/* Period Filter */}
      <div className="card mb-4">
        <div className="flex gap-2 flex-wrap items-center">
          <span className="text-xs text-gray-500 font-medium mr-1">Período:</span>
          {PERIODS.map(p => (
            <button
              key={p.key}
              onClick={() => handlePeriodClick(p.key)}
              className={`text-xs px-3 py-1.5 rounded-full border transition-colors font-medium ${
                period === p.key
                  ? 'bg-primary text-white border-primary'
                  : 'bg-white text-gray-600 border-gray-300 hover:border-primary hover:text-primary'
              }`}
            >
              {p.label}
            </button>
          ))}
          {period && (
            <button
              onClick={() => { setPeriod(''); setDataInicio(''); setDataFim('') }}
              className="text-xs px-2 py-1.5 text-gray-400 hover:text-gray-600 transition-colors"
            >
              ✕ Limpar
            </button>
          )}
        </div>

        {period === 'personalizado' && (
          <div className="flex gap-3 mt-3 flex-wrap items-center">
            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-500 font-medium whitespace-nowrap">De:</label>
              <input type="date" className="input text-sm" value={dataInicio} onChange={e => setDataInicio(e.target.value)} />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-500 font-medium whitespace-nowrap">Até:</label>
              <input type="date" className="input text-sm" value={dataFim} onChange={e => setDataFim(e.target.value)} />
            </div>
          </div>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48">
          <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="card text-center py-16 text-gray-400">
          <svg className="w-12 h-12 mx-auto mb-3 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2" />
          </svg>
          <p className="font-medium">Nenhum contrato encontrado</p>
          <p className="text-sm mt-1">Contratos são gerados ao aprovar orçamentos</p>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Header row */}
          <div className="hidden md:flex items-center gap-3 px-4 py-2 text-xs font-medium text-gray-500 uppercase tracking-wide">
            {isAdmin && <div className="w-5 flex-shrink-0"></div>}
            <div className="w-14 flex-shrink-0">Nº</div>
            <div className="w-24 flex-shrink-0">Data</div>
            <div className="flex-1 min-w-0">Cliente</div>
            <div className="w-32 flex-shrink-0">Cidade</div>
            <div className="w-28 text-right flex-shrink-0">Valor</div>
            <div className="w-32 text-center flex-shrink-0">Status</div>
            <div className="w-24 text-right flex-shrink-0">Últ. status</div>
          </div>

          {filtered.map(c => {
            const st = STATUS[c.status] || STATUS.rascunho
            const hist = c.statusHistorico || []
            const ultima = hist[hist.length - 1]
            const ultimaData = ultima?.data ? new Date(ultima.data).toLocaleDateString('pt-BR') : '—'

            return (
              <div
                key={c.id}
                className="bg-white border border-gray-200 rounded-xl shadow-sm hover:shadow-md transition-shadow overflow-hidden"
              >
                {/* Info row — clicável para editar */}
                <div
                  className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50 transition-colors"
                  onClick={() => navigate(`/contratos/${c.id}`)}
                >
                  {isAdmin && (
                    <div className="flex-shrink-0" onClick={e => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={checked.has(c.id)}
                        onChange={e => toggleCheck(c.id, e)}
                        className="rounded"
                      />
                    </div>
                  )}
                  {isAdmin ? (
                    <button
                      onClick={e => handleAlterarNumero(e, c)}
                      title="Clique para alterar o número do contrato"
                      className="font-mono text-xs text-gray-400 w-14 flex-shrink-0 hover:text-orange-600 hover:bg-orange-50 rounded px-1 py-0.5 transition-colors text-left"
                    >
                      #{String(c.numero || '').padStart(4, '0')}
                    </button>
                  ) : (
                    <span className="font-mono text-xs text-gray-400 w-14 flex-shrink-0">
                      #{String(c.numero || '').padStart(4, '0')}
                    </span>
                  )}
                  <span className="text-xs text-gray-500 w-24 flex-shrink-0 whitespace-nowrap">
                    {new Date(c.createdAt).toLocaleDateString('pt-BR')}
                  </span>
                  <span className="font-semibold text-gray-800 flex-1 min-w-0 truncate">
                    {c.cliente || '—'}
                  </span>
                  <span className="text-sm text-gray-500 w-32 flex-shrink-0 truncate hidden md:block">
                    {c.cidade || '—'}
                  </span>
                  <span className="font-semibold text-gray-800 w-28 text-right flex-shrink-0">
                    {fmt(c.totalLiquido)}
                  </span>
                  <div className="flex flex-col gap-1 w-32 flex-shrink-0 items-center">
                    <span className={`badge ${st.color} w-full text-center`}>
                      {st.label}
                    </span>
                    {c.origem === 'integracao' && (
                      <span className="badge bg-orange-500 text-white w-full text-center text-xs font-bold">
                        🔗 INTEG.
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-gray-400 w-24 text-right flex-shrink-0 hidden lg:block">
                    {ultimaData}
                  </span>
                </div>

                {/* Actions row */}
                <div className="flex items-center gap-2 px-4 py-2.5 bg-gray-50 border-t border-gray-100 flex-wrap">
                  <button
                    className="text-xs px-3 py-1.5 rounded-lg bg-blue-100 text-blue-700 hover:bg-blue-200 font-medium flex items-center gap-1 transition-colors"
                    onClick={e => { e.stopPropagation(); window.open(api.getContratoPdfUrl(c.id), '_blank') }}
                  >
                    📄 PDF
                  </button>
                  <button
                    className={`text-xs px-3 py-1.5 rounded-lg font-medium flex items-center gap-1 transition-colors ${c.textoPersonalizado ? 'bg-amber-100 text-amber-700 hover:bg-amber-200' : 'bg-purple-100 text-purple-700 hover:bg-purple-200'}`}
                    onClick={e => { e.stopPropagation(); setEditorContratoId(c.id) }}
                    title="Editar texto do contrato antes de gerar PDF"
                  >
                    ✏️ {c.textoPersonalizado ? 'Editar no PDF *' : 'Editar no PDF'}
                  </button>
                  {c.status !== 'pendente_assinatura' && (
                    <button
                      className="text-xs px-3 py-1.5 rounded-lg bg-orange-100 text-orange-700 hover:bg-orange-200 font-medium disabled:opacity-40 flex items-center gap-1 transition-colors"
                      disabled={updatingStatus === c.id}
                      onClick={e => handleChangeStatus(e, c.id, 'pendente_assinatura')}
                    >
                      {updatingStatus === c.id ? '...' : '📝 Pend. Assinatura'}
                    </button>
                  )}
                  {c.status !== 'assinado' && (
                    <button
                      className="text-xs px-3 py-1.5 rounded-lg bg-green-100 text-green-700 hover:bg-green-200 font-medium disabled:opacity-40 flex items-center gap-1 transition-colors"
                      disabled={updatingStatus === c.id}
                      onClick={e => handleChangeStatus(e, c.id, 'assinado')}
                    >
                      {updatingStatus === c.id ? '...' : '✅ Marcar Assinado'}
                    </button>
                  )}
                  <button
                    className="text-xs px-3 py-1.5 rounded-lg bg-gray-200 text-gray-600 hover:bg-gray-300 font-medium flex items-center gap-1 transition-colors"
                    onClick={e => { e.stopPropagation(); navigate(`/ordens-servico?contratoId=${c.id}`) }}
                  >
                    📋 Criar OS
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
