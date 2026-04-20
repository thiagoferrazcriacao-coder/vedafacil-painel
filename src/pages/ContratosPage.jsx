import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api/client.js'

const fmt = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0)

const STATUS = {
  aguardando_assinatura: { label: 'Aguardando Assinatura', color: 'bg-orange-100 text-orange-800' },
  assinado: { label: 'Assinado', color: 'bg-green-100 text-green-800' }
}

export default function ContratosPage() {
  const navigate = useNavigate()
  const [contratos, setContratos] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')

  useEffect(() => {
    api.getContratos()
      .then(setContratos)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  const filtered = contratos.filter(c => {
    if (statusFilter && c.status !== statusFilter) return false
    if (search) {
      const q = search.toLowerCase()
      return [c.cliente, c.cidade, String(c.numero)].filter(Boolean).some(v => v.toLowerCase().includes(q))
    }
    return true
  })

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Contratos</h1>
          <p className="text-gray-500 text-sm mt-0.5">{filtered.length} registros</p>
        </div>
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
          <option value="aguardando_assinatura">Aguardando Assinatura</option>
          <option value="assinado">Assinado</option>
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
              d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2" />
          </svg>
          <p className="font-medium">Nenhum contrato encontrado</p>
          <p className="text-sm mt-1">Contratos são gerados ao aprovar orçamentos</p>
        </div>
      ) : (
        <div className="card p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Nº</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Data</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Cliente</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Cidade</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Valor</th>
                  <th className="text-center px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">ZapSign</th>
                  <th className="text-center px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Status</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map(c => {
                  const st = STATUS[c.status] || STATUS.aguardando_assinatura
                  return (
                    <tr
                      key={c.id}
                      className="hover:bg-gray-50 cursor-pointer transition-colors"
                      onClick={() => navigate(`/contratos/${c.id}`)}
                    >
                      <td className="px-4 py-3 font-mono text-xs text-gray-500">
                        #{String(c.numero || '').padStart(4, '0')}
                      </td>
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                        {new Date(c.createdAt).toLocaleDateString('pt-BR')}
                      </td>
                      <td className="px-4 py-3 font-medium text-gray-800">{c.cliente || '—'}</td>
                      <td className="px-4 py-3 text-gray-600">{c.cidade || '—'}</td>
                      <td className="px-4 py-3 text-right font-medium text-gray-800">{fmt(c.totalLiquido)}</td>
                      <td className="px-4 py-3 text-center">
                        {c.zapsignDocId ? (
                          <span className="badge bg-purple-100 text-purple-800">Enviado</span>
                        ) : (
                          <span className="text-gray-300 text-xs">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`badge ${st.color}`}>{st.label}</span>
                      </td>
                      <td className="px-4 py-3">
                        <button
                          className="text-xs text-primary hover:underline"
                          onClick={e => { e.stopPropagation(); window.open(api.getContratoPdfUrl(c.id), '_blank') }}
                        >
                          PDF
                        </button>
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
