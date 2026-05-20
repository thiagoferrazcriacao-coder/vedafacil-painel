import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api/client.js'
import { useAuth } from '../App.jsx'

const fmt = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0)

const STATUS = {
  rascunho: { label: 'Redigido', color: 'bg-gray-100 text-gray-700' },
  enviado: { label: 'Enviado', color: 'bg-blue-100 text-blue-800' },
  aprovado: { label: 'Aprovado', color: 'bg-green-100 text-green-800' }
}

export default function OrcamentosPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'
  const [orcamentos, setOrcamentos] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [checked, setChecked] = useState(new Set())
  const [deleting, setDeleting] = useState(false)
  const [duplicating, setDuplicating] = useState(null)
  const [aprovando, setAprovando] = useState(null)
  const [desfazendo, setDesfazendo] = useState(null)
  const [togglingEnviado, setTogglingEnviado] = useState(null)

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
    else setChecked(new Set(filtered.map(o => o.id)))
  }
  const handleDeleteSelected = async () => {
    if (!confirm(`Excluir ${checked.size} orçamento(s)?`)) return
    setDeleting(true)
    for (const id of checked) {
      await api.deleteOrcamento(id).catch(() => {})
    }
    setOrcamentos(prev => prev.filter(o => !checked.has(o.id)))
    setChecked(new Set())
    setDeleting(false)
  }

  useEffect(() => {
    api.getOrcamentos()
      .then(setOrcamentos)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  const filtered = orcamentos.filter(o => {
    if (statusFilter && o.status !== statusFilter) return false
    if (search) {
      const q = search.toLowerCase()
      return [o.cliente, o.cidade, String(o.numero)].filter(Boolean).some(v => v.toLowerCase().includes(q))
    }
    return true
  })

  const handleDelete = async (e, id) => {
    e.stopPropagation()
    if (!confirm('Excluir este orçamento?')) return
    await api.deleteOrcamento(id)
    setOrcamentos(prev => prev.filter(o => o.id !== id))
  }

  const handleDuplicar = async (e, id) => {
    e.stopPropagation()
    setDuplicating(id)
    try {
      const novo = await api.duplicarOrcamento(id)
      navigate(`/orcamentos/${novo.id || novo._id}`)
    } catch (err) {
      alert('Erro ao duplicar: ' + err.message)
    } finally {
      setDuplicating(null)
    }
  }

  const handleAprovarContrato = async (e, id) => {
    e.stopPropagation()
    if (!confirm('Aprovar este orçamento e gerar contrato?')) return
    setAprovando(id)
    try {
      await api.approveOrcamento(id)
      const contrato = await api.createContrato({ orcamentoId: id })
      navigate(`/contratos/${contrato.id || contrato._id}`)
    } catch (err) {
      alert('Erro: ' + err.message)
    } finally {
      setAprovando(null)
    }
  }

  const handleDesfazerAprovacao = async (e, id) => {
    e.stopPropagation()
    if (!confirm('Desfazer aprovação?\n\nO contrato gerado (se ainda não assinado e sem OS criada) será movido para a lixeira e o orçamento voltará ao status "Enviado".')) return
    setDesfazendo(id)
    try {
      const res = await api.desfazerAprovacao(id)
      setOrcamentos(prev => prev.map(o => o.id === id ? { ...o, status: res.orcamento?.status || 'enviado' } : o))
    } catch (err) {
      alert('Não foi possível desfazer:\n' + err.message)
    } finally {
      setDesfazendo(null)
    }
  }

  const handleToggleEnviado = async (e, id) => {
    e.stopPropagation()
    setTogglingEnviado(id)
    try {
      const res = await api.toggleEnviadoCliente(id)
      setOrcamentos(prev => prev.map(o => o.id === id ? { ...o, enviadoParaCliente: res.enviadoParaCliente } : o))
    } catch (err) {
      alert('Erro: ' + err.message)
    } finally {
      setTogglingEnviado(null)
    }
  }

  const handleNovoManual = async () => {
    try {
      const novo = await api.createOrcamento({ medicaoId: null })
      navigate(`/orcamentos/${novo.id || novo._id}`)
    } catch (err) {
      alert('Erro ao criar orçamento: ' + err.message)
    }
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Orçamentos</h1>
          <p className="text-gray-500 text-sm mt-0.5">{filtered.length} registros</p>
          {isAdmin && checked.size > 0 && (
            <button onClick={handleDeleteSelected} disabled={deleting} className="btn-danger text-sm ml-4">
              {deleting ? 'Excluindo...' : `Excluir ${checked.size} selecionado(s)`}
            </button>
          )}
        </div>
        <button
          onClick={handleNovoManual}
          className="bg-primary text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-blue-800 transition-colors flex items-center gap-2"
        >
          ✏️ Novo Orçamento Manual
        </button>
      </div>

      {/* Filters */}
      <div className="card mb-4 flex gap-3 flex-wrap">
        <input
          className="input flex-1 min-w-40"
          placeholder="Buscar cliente, número..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <select className="input w-40" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="">Todos status</option>
          <option value="rascunho">Redigido</option>
          <option value="enviado">Enviado</option>
          <option value="aprovado">Aprovado</option>
        </select>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48">
          <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="card text-center py-16 text-gray-400">
          <svg className="w-12 h-12 mx-auto mb-3 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <p className="font-medium">Nenhum orçamento encontrado</p>
          <p className="text-sm mt-1">Crie orçamentos a partir das medições</p>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Header */}
          <div className="hidden md:flex items-center gap-3 px-4 py-2 text-xs font-medium text-gray-500 uppercase tracking-wide">
            {isAdmin && <div className="w-5 flex-shrink-0"></div>}
            <div className="w-14 flex-shrink-0">Nº</div>
            <div className="w-24 flex-shrink-0">Data</div>
            <div className="flex-1 min-w-0">Cliente</div>
            <div className="w-28 flex-shrink-0 hidden lg:block">Cidade</div>
            <div className="w-24 flex-shrink-0 hidden xl:block">Dt. Medição</div>
            <div className="w-20 flex-shrink-0 hidden xl:block">Medidor</div>
            <div className="w-28 text-right flex-shrink-0">Total</div>
            <div className="w-24 text-center flex-shrink-0">Status</div>
            <div className="w-16 text-center flex-shrink-0">Medição</div>
          </div>

          {filtered.map(o => {
            const st = STATUS[o.status] || STATUS.rascunho
            return (
              <div
                key={o.id}
                className="bg-white border border-gray-200 rounded-xl shadow-sm hover:shadow-md transition-shadow overflow-hidden"
              >
                {/* Info row */}
                <div
                  className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50 transition-colors"
                  onClick={() => navigate(`/orcamentos/${o.id}`)}
                >
                  {isAdmin && (
                    <div className="flex-shrink-0" onClick={e => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={checked.has(o.id)}
                        onChange={e => toggleCheck(o.id, e)}
                        className="rounded"
                      />
                    </div>
                  )}
                  <span className="font-mono text-xs text-gray-400 w-14 flex-shrink-0">
                    #{String(o.numero || '').padStart(4, '0')}
                  </span>
                  <span className="text-xs text-gray-500 w-24 flex-shrink-0 whitespace-nowrap">
                    {new Date(o.createdAt).toLocaleDateString('pt-BR')}
                  </span>
                  <span className="font-semibold text-gray-800 flex-1 min-w-0 truncate">
                    {o.cliente || '—'}
                  </span>
                  <span className="text-sm text-gray-500 w-28 flex-shrink-0 truncate hidden lg:block">
                    {o.cidade || '—'}
                  </span>
                  <span className="text-xs text-gray-500 w-24 flex-shrink-0 hidden xl:block">
                    {o.dataOrcamento
                      ? (() => {
                          const [y, m, d] = o.dataOrcamento.split('-')
                          return d && m && y ? `${d}/${m}/${y}` : o.dataOrcamento
                        })()
                      : '—'}
                  </span>
                  <span className="text-xs text-gray-600 w-20 flex-shrink-0 hidden xl:block truncate">
                    {o.avaliadoPor || '—'}
                  </span>
                  <span className="font-semibold text-gray-800 w-28 text-right flex-shrink-0">
                    {fmt(o.totalLiquido)}
                  </span>
                  <div className="flex flex-col gap-1 w-24 flex-shrink-0 items-center">
                    <span className={`badge ${st.color} w-full text-center`}>
                      {st.label}
                    </span>
                    {o.enviadoParaCliente && (
                      <span className="badge bg-emerald-100 text-emerald-700 w-full text-center text-xs font-bold">
                        ✉️ CLIENTE
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-gray-400 w-16 text-center flex-shrink-0">
                    {o.medicaoId ? (
                      <span
                        className="cursor-pointer hover:text-primary font-mono"
                        onClick={e => { e.stopPropagation(); navigate('/medicoes/' + o.medicaoId) }}
                        title="Ver medição"
                      >
                        #{String(o.numeroMedicao || '').padStart(4, '0')}
                      </span>
                    ) : '—'}
                  </span>
                </div>

                {/* Actions row */}
                <div className="flex items-center gap-2 px-4 py-2.5 bg-gray-50 border-t border-gray-100 flex-wrap">
                  <button
                    className="text-xs px-3 py-1.5 rounded-lg bg-blue-100 text-blue-700 hover:bg-blue-200 font-medium flex items-center gap-1 transition-colors"
                    onClick={e => { e.stopPropagation(); window.open(api.getOrcamentoPdfUrl(o.id), '_blank') }}
                  >
                    📄 PDF
                  </button>
                  <button
                    className="text-xs px-3 py-1.5 rounded-lg bg-gray-200 text-gray-600 hover:bg-gray-300 font-medium disabled:opacity-40 flex items-center gap-1 transition-colors"
                    disabled={duplicating === o.id}
                    onClick={e => handleDuplicar(e, o.id)}
                  >
                    {duplicating === o.id ? '...' : '📋 Duplicar'}
                  </button>
                  {/* Toggle ENVIADO PARA CLIENTE */}
                  <button
                    title={o.enviadoParaCliente ? 'Clique para desmarcar enviado' : 'Marcar como enviado para o cliente'}
                    disabled={togglingEnviado === o.id}
                    onClick={e => handleToggleEnviado(e, o.id)}
                    className={`text-xs px-3 py-1.5 rounded-lg font-semibold flex items-center gap-1.5 transition-all disabled:opacity-40 ${
                      o.enviadoParaCliente
                        ? 'bg-emerald-500 text-white hover:bg-emerald-600 shadow-sm'
                        : 'bg-white text-gray-500 border border-gray-300 hover:border-emerald-400 hover:text-emerald-600'
                    }`}
                  >
                    {togglingEnviado === o.id ? '...' : (
                      o.enviadoParaCliente ? '✉️ Enviado ao Cliente' : '✉️ Enviado ao Cliente?'
                    )}
                  </button>
                  {o.status !== 'aprovado' ? (
                    <button
                      className="text-xs px-3 py-1.5 rounded-lg bg-green-100 text-green-700 hover:bg-green-200 font-semibold disabled:opacity-40 flex items-center gap-1 transition-colors"
                      disabled={aprovando === o.id}
                      onClick={e => handleAprovarContrato(e, o.id)}
                    >
                      {aprovando === o.id ? '...' : '✅ Aprovar → Contrato'}
                    </button>
                  ) : (
                    <button
                      className="text-xs px-3 py-1.5 rounded-lg bg-amber-100 text-amber-700 hover:bg-amber-200 font-semibold disabled:opacity-40 flex items-center gap-1 transition-colors"
                      disabled={desfazendo === o.id}
                      onClick={e => handleDesfazerAprovacao(e, o.id)}
                      title="Desfaz a aprovação e move o contrato para a lixeira (apenas se não assinado e sem OS)"
                    >
                      {desfazendo === o.id ? '...' : '↩ Desfazer Aprovação'}
                    </button>
                  )}
                  {isAdmin && (
                    <>
                      <div className="w-px h-5 bg-gray-300 mx-0.5" />
                      <button
                        className="text-xs px-3 py-1.5 rounded-lg bg-red-100 text-red-600 hover:bg-red-200 font-medium flex items-center gap-1 transition-colors"
                        onClick={e => handleDelete(e, o.id)}
                      >
                        🗑️ Excluir
                      </button>
                    </>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
