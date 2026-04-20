import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api/client.js'

const STATUS_COLORS = {
  pendente: 'bg-yellow-100 text-yellow-800',
  em_andamento: 'bg-blue-100 text-blue-800',
  concluido: 'bg-green-100 text-green-800',
  cancelado: 'bg-red-100 text-red-800'
}

const STATUS_LABELS = {
  pendente: 'Pendente',
  em_andamento: 'Em Andamento',
  concluido: 'Concluído',
  cancelado: 'Cancelado'
}

export default function MedicoesPage() {
  const navigate = useNavigate()
  const [medicoes, setMedicoes] = useState([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(null)
  const [filters, setFilters] = useState({ medidor: '', status: '', dateFrom: '', dateTo: '', search: '' })

  useEffect(() => {
    api.getMedicoes()
      .then(setMedicoes)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  const filtered = medicoes.filter(m => {
    if (filters.medidor && m.medidor !== filters.medidor) return false
    if (filters.status && m.status !== filters.status) return false
    if (filters.search) {
      const q = filters.search.toLowerCase()
      const match = [m.cliente, m.nomeCliente, m.cidade, m.medidor]
        .filter(Boolean).some(v => v.toLowerCase().includes(q))
      if (!match) return false
    }
    if (filters.dateFrom) {
      if (new Date(m.receivedAt) < new Date(filters.dateFrom)) return false
    }
    if (filters.dateTo) {
      if (new Date(m.receivedAt) > new Date(filters.dateTo + 'T23:59:59')) return false
    }
    return true
  })

  const medidores = [...new Set(medicoes.map(m => m.medidor).filter(Boolean))]

  return (
    <div className="flex h-full">
      {/* Main List */}
      <div className="flex-1 p-6 overflow-auto min-w-0">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">Medições</h1>
            <p className="text-gray-500 text-sm mt-0.5">{filtered.length} registros</p>
          </div>
        </div>

        {/* Filters */}
        <div className="card mb-4">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <input
              className="input col-span-2 md:col-span-1"
              placeholder="Buscar cliente, cidade..."
              value={filters.search}
              onChange={e => setFilters(f => ({ ...f, search: e.target.value }))}
            />
            <select
              className="input"
              value={filters.medidor}
              onChange={e => setFilters(f => ({ ...f, medidor: e.target.value }))}
            >
              <option value="">Todos os medidores</option>
              {medidores.map(m => <option key={m} value={m}>{m}</option>)}
              <option value="Edson">Edson</option>
              <option value="Fernando">Fernando</option>
              <option value="Alan">Alan</option>
            </select>
            <select
              className="input"
              value={filters.status}
              onChange={e => setFilters(f => ({ ...f, status: e.target.value }))}
            >
              <option value="">Todos status</option>
              <option value="pendente">Pendente</option>
              <option value="em_andamento">Em Andamento</option>
              <option value="concluido">Concluído</option>
            </select>
            <input
              type="date"
              className="input"
              value={filters.dateFrom}
              onChange={e => setFilters(f => ({ ...f, dateFrom: e.target.value }))}
            />
            <input
              type="date"
              className="input"
              value={filters.dateTo}
              onChange={e => setFilters(f => ({ ...f, dateTo: e.target.value }))}
            />
          </div>
        </div>

        {/* Table */}
        {loading ? (
          <div className="flex items-center justify-center h-48">
            <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="card text-center py-16 text-gray-400">
            <svg className="w-12 h-12 mx-auto mb-3 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            <p className="font-medium">Nenhuma medição encontrada</p>
            <p className="text-sm mt-1">As medições chegam via aplicativo do medidor</p>
          </div>
        ) : (
          <div className="card p-0 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Nº</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Data/Hora</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Cliente</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Cidade</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Medidor</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Locais</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Status</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filtered.map(m => (
                    <tr
                      key={m.id}
                      className={`hover:bg-gray-50 cursor-pointer transition-colors ${selected?.id === m.id ? 'bg-blue-50' : ''}`}
                      onClick={() => setSelected(selected?.id === m.id ? null : m)}
                    >
                      <td className="px-4 py-3 font-mono text-xs text-gray-500">
                        #{String(m.numeroMedicao || '').padStart(3, '0')}
                      </td>
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                        {new Date(m.receivedAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td className="px-4 py-3 font-medium text-gray-800">
                        {m.cliente || m.nomeCliente || '—'}
                      </td>
                      <td className="px-4 py-3 text-gray-600">{m.cidade || '—'}</td>
                      <td className="px-4 py-3 text-gray-600">{m.medidor || '—'}</td>
                      <td className="px-4 py-3 text-gray-600">
                        {Array.isArray(m.locais) ? m.locais.length : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`badge ${STATUS_COLORS[m.status] || 'bg-gray-100 text-gray-700'}`}>
                          {STATUS_LABELS[m.status] || m.status || 'Pendente'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <button
                          className="btn-primary text-xs py-1 px-3"
                          onClick={(e) => { e.stopPropagation(); navigate(`/orcamentos/novo/${m.id}`) }}
                        >
                          Gerar Orçamento
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Side Panel */}
      {selected && (
        <div className="w-80 xl:w-96 border-l border-gray-200 bg-white overflow-auto flex-shrink-0">
          <MedicaoPanel
            medicao={selected}
            onClose={() => setSelected(null)}
            onGenerateOrcamento={() => navigate(`/orcamentos/novo/${selected.id}`)}
          />
        </div>
      )}
    </div>
  )
}

function MedicaoPanel({ medicao: m, onClose, onGenerateOrcamento }) {
  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold text-gray-800">Detalhes da Medição</h2>
        <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded">
          <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="space-y-4">
        {/* Client */}
        <div>
          <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2">Cliente</h3>
          <div className="space-y-1 text-sm">
            <div><span className="text-gray-500">Nome:</span> <span className="font-medium">{m.cliente || m.nomeCliente || '—'}</span></div>
            <div><span className="text-gray-500">AC:</span> {m.ac || '—'}</div>
            <div><span className="text-gray-500">Endereço:</span> {m.endereco || '—'}</div>
            <div><span className="text-gray-500">Cidade:</span> {m.cidade || '—'}</div>
            <div><span className="text-gray-500">Celular:</span> {m.celular || m.telefone || '—'}</div>
          </div>
        </div>

        {/* Info */}
        <div>
          <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2">Informações</h3>
          <div className="space-y-1 text-sm">
            <div><span className="text-gray-500">Medidor:</span> {m.medidor || '—'}</div>
            <div><span className="text-gray-500">Data:</span> {new Date(m.receivedAt).toLocaleString('pt-BR')}</div>
            <div><span className="text-gray-500">Nº Medição:</span> #{String(m.numeroMedicao || '').padStart(3, '0')}</div>
          </div>
        </div>

        {/* Locais */}
        {Array.isArray(m.locais) && m.locais.length > 0 && (
          <div>
            <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2">
              Locais ({m.locais.length})
            </h3>
            <div className="space-y-2">
              {m.locais.map((local, i) => (
                <div key={i} className="bg-gray-50 rounded-lg p-2 text-sm">
                  <div className="font-medium text-gray-700">{local.nome || local.local || `Local ${i + 1}`}</div>
                  {local.descricao && <div className="text-gray-500 text-xs mt-0.5">{local.descricao}</div>}
                  {local.trinca > 0 && <div className="text-xs text-gray-500">Trincas: {local.trinca}m</div>}
                  {local.ralo > 0 && <div className="text-xs text-gray-500">Ralos: {local.ralo}</div>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Photos */}
        {Array.isArray(m.fotos) && m.fotos.length > 0 && (
          <div>
            <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2">
              Fotos ({m.fotos.length})
            </h3>
            <div className="grid grid-cols-3 gap-1">
              {m.fotos.slice(0, 6).map((foto, i) => (
                <img
                  key={i}
                  src={foto.url || foto}
                  alt={`Foto ${i + 1}`}
                  className="w-full aspect-square object-cover rounded"
                />
              ))}
            </div>
          </div>
        )}

        {/* Observacoes */}
        {m.observacoes && (
          <div>
            <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2">Observações</h3>
            <p className="text-sm text-gray-600 bg-gray-50 rounded-lg p-2">{m.observacoes}</p>
          </div>
        )}
      </div>

      <div className="mt-6 space-y-2">
        <button className="btn-primary w-full" onClick={onGenerateOrcamento}>
          Gerar Orçamento
        </button>
      </div>
    </div>
  )
}
