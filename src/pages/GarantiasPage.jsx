import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api/client.js'

const fmt = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0)
const fmtDate = (ts) => {
  if (!ts) return '—'
  return new Date(ts).toLocaleDateString('pt-BR')
}

export default function GarantiasPage() {
  const navigate = useNavigate()
  const [contratos, setContratos] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [marking, setMarking] = useState(null)

  useEffect(() => {
    api.getContratos()
      .then(data => setContratos(data || []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const handleMarcarEnviada = async (id) => {
    setMarking(id)
    try {
      const updated = await api.marcarGarantiaEnviada(id)
      setContratos(prev => prev.map(c => c.id === id ? { ...c, garantiaEnviadaEm: updated.garantiaEnviadaEm } : c))
    } catch {
    } finally {
      setMarking(null)
    }
  }

  const filtered = contratos.filter(c => {
    const q = search.toLowerCase()
    return !q || (c.cliente || '').toLowerCase().includes(q) || (c.razaoSocial || '').toLowerCase().includes(q) || String(c.numero || '').includes(q)
  })

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
    </div>
  )

  return (
    <div className="p-4 md:p-6">
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-800">Certificados de Garantia</h1>
          <p className="text-sm text-gray-500 mt-0.5">{filtered.length} certificado(s) disponível(eis)</p>
        </div>
      </div>

      {/* Search */}
      <div className="mb-4">
        <input
          type="text"
          className="input max-w-xs"
          placeholder="Buscar por cliente ou nº..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <svg className="w-12 h-12 mx-auto mb-3 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
          <p>Nenhum certificado encontrado</p>
          <p className="text-sm mt-1">Gere contratos para ter certificados disponíveis</p>
        </div>
      ) : (
        <div className="card overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b-2 border-primary bg-gray-50">
                  <th className="text-left py-3 px-4 text-xs font-semibold text-gray-600">Nº</th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-gray-600">Cliente</th>
                  <th className="text-center py-3 px-4 text-xs font-semibold text-gray-600">Garantia</th>
                  <th className="text-center py-3 px-4 text-xs font-semibold text-gray-600">Valor</th>
                  <th className="text-center py-3 px-4 text-xs font-semibold text-gray-600">Status</th>
                  <th className="text-center py-3 px-4 text-xs font-semibold text-gray-600">Enviada em</th>
                  <th className="text-right py-3 px-4 text-xs font-semibold text-gray-600">Ações</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(c => (
                  <tr key={c.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                    <td className="py-3 px-4 font-mono text-gray-600">
                      #{String(c.numero || 0).padStart(4, '0')}
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-medium text-gray-800">{c.razaoSocial || c.cliente || '—'}</div>
                      {c.cidade && <div className="text-xs text-gray-400">{c.cidade}</div>}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800">
                        {c.garantia || 15} anos
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center text-gray-700 font-medium">
                      {fmt(c.totalLiquido)}
                    </td>
                    <td className="py-3 px-4 text-center">
                      {c.garantiaEnviadaEm ? (
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                          ✓ Enviada
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                          Pendente
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-center text-gray-500 text-xs">
                      {c.garantiaEnviadaEm ? fmtDate(c.garantiaEnviadaEm) : '—'}
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex gap-2 justify-end flex-wrap">
                        <button
                          onClick={() => window.open(api.getGarantiaPdfUrl(c.id), '_blank')}
                          className="btn-secondary text-xs py-1 px-2"
                        >
                          Ver PDF
                        </button>
                        <button
                          onClick={() => navigate(`/contratos/${c.id}`)}
                          className="btn-secondary text-xs py-1 px-2"
                        >
                          Contrato
                        </button>
                        {!c.garantiaEnviadaEm && (
                          <button
                            onClick={() => handleMarcarEnviada(c.id)}
                            disabled={marking === c.id}
                            className="btn-success text-xs py-1 px-2"
                          >
                            {marking === c.id ? '...' : 'Marcar Enviada'}
                          </button>
                        )}
                      </div>
                    </td>
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
