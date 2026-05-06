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
  const [duplicating, setDuplicating] = useState(null) // id sendo duplicado
  const [aprovando, setAprovando] = useState(null) // id sendo aprovado

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
        <div className="card p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  {isAdmin && <th className="px-4 py-3 w-10">
                    <input type="checkbox" checked={checked.size === filtered.length && filtered.length > 0} onChange={toggleAll} className="rounded" />
                  </th>}
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Nº</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Data</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Cliente</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Cidade</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Data Medição</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Medido por</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Total</th>
                  <th className="text-center px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Status</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Medição</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map(o => {
                  const st = STATUS[o.status] || STATUS.rascunho
                  return (
                    <tr
                      key={o.id}
                      className="hover:bg-gray-50 cursor-pointer transition-colors"
                      onClick={() => navigate(`/orcamentos/${o.id}`)}
                    >
                      {isAdmin && <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                        <input type="checkbox" checked={checked.has(o.id)} onChange={e => toggleCheck(o.id, e)} className="rounded" />
                      </td>}
                      <td className="px-4 py-3 font-mono text-xs text-gray-500">
                        #{String(o.numero || '').padStart(4, '0')}
                      </td>
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                        {new Date(o.createdAt).toLocaleDateString('pt-BR')}
                      </td>
                      <td className="px-4 py-3 font-medium text-gray-800">
                        {o.cliente || '—'}
                      </td>
                      <td className="px-4 py-3 text-gray-600">{o.cidade || '—'}</td>
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap text-xs">
                        {o.dataOrcamento
                          ? (() => {
                              const [y, m, d] = o.dataOrcamento.split('-')
                              return d && m && y ? `${d}/${m}/${y}` : o.dataOrcamento
                            })()
                          : '—'}
                      </td>
                      <td className="px-4 py-3 text-gray-700 text-xs whitespace-nowrap">
                        {o.avaliadoPor || '—'}
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-gray-800">
                        {fmt(o.totalLiquido)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`badge ${st.color}`}>{st.label}</span>
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs">
                        {o.medicaoId ? (
                          <span
                            className="cursor-pointer hover:text-primary font-mono"
                            onClick={e => { e.stopPropagation(); navigate('/medicoes/' + o.medicaoId) }}
                            title="Ver medição"
                          >
                            #{String(o.numeroMedicao || '').padStart(4, '0')}
                          </span>
                        ) : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5 justify-end flex-wrap">
                          <button
                            className="text-xs px-2 py-1 rounded bg-blue-100 text-blue-700 hover:bg-blue-200 font-medium"
                            onClick={e => { e.stopPropagation(); window.open(api.getOrcamentoPdfUrl(o.id), '_blank'); }}
                            title="Gerar PDF"
                          >
                            📄 PDF
                          </button>
                          <button
                            className="text-xs px-2 py-1 rounded bg-gray-100 text-gray-600 hover:bg-gray-200 disabled:opacity-40"
                            disabled={duplicating === o.id}
                            onClick={e => handleDuplicar(e, o.id)}
                            title="Duplicar este orçamento com novo número"
                          >
                            {duplicating === o.id ? '...' : '📋 Duplicar'}
                          </button>
                          {o.status !== 'aprovado' && (
                            <button
                              className="text-xs px-2 py-1 rounded bg-green-100 text-green-700 hover:bg-green-200 font-semibold disabled:opacity-40"
                              disabled={aprovando === o.id}
                              onClick={e => handleAprovarContrato(e, o.id)}
                              title="Aprovar e gerar contrato"
                            >
                              {aprovando === o.id ? '...' : '✅ Aprovar → Contrato'}
                            </button>
                          )}
                          {isAdmin && (
                            <button
                              className="text-xs px-2 py-1 rounded bg-red-100 text-red-600 hover:bg-red-200"
                              onClick={e => handleDelete(e, o.id)}
                              title="Excluir orçamento"
                            >
                              🗑️ Excluir
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
