import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api/client.js'
import { useAuth } from '../App.jsx'

function NovaMedicaoModal({ onClose, onCreated }) {
  const EMPTY = { cliente: '', ac: '', celular: '', endereco: '', bairro: '', cidade: '', cep: '', garantia: 15, andaime: 'nao', obs: '', locais: [] }
  const [form, setForm] = useState(EMPTY)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const upd = (field) => (e) => setForm(prev => ({ ...prev, [field]: e.target.value }))

  const handleSubmit = async () => {
    if (!form.cliente.trim()) { setError('Informe o cliente.'); return }
    setSaving(true)
    setError('')
    try {
      const result = await api.createMedicaoManual(form)
      onCreated(result)
      onClose()
    } catch (err) {
      setError(err.message)
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="font-bold text-gray-800">Nova Medição Manual</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>
        <div className="p-4 space-y-3">
          {error && <div className="p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">{error}</div>}
          <div>
            <label className="label">Cliente *</label>
            <input className="input" value={form.cliente} onChange={upd('cliente')} placeholder="Nome do condomínio/empresa" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Responsável (AC)</label>
              <input className="input" value={form.ac} onChange={upd('ac')} placeholder="Síndico / zelador" />
            </div>
            <div>
              <label className="label">Celular</label>
              <input className="input" value={form.celular} onChange={upd('celular')} placeholder="(00) 00000-0000" />
            </div>
          </div>
          <div>
            <label className="label">Endereço</label>
            <input className="input" value={form.endereco} onChange={upd('endereco')} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Bairro</label>
              <input className="input" value={form.bairro} onChange={upd('bairro')} />
            </div>
            <div>
              <label className="label">Cidade</label>
              <input className="input" value={form.cidade} onChange={upd('cidade')} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">CEP</label>
              <input className="input" value={form.cep} onChange={upd('cep')} placeholder="00000-000" />
            </div>
            <div>
              <label className="label">Garantia</label>
              <select className="input" value={form.garantia} onChange={upd('garantia')}>
                <option value={15}>15 anos</option>
                <option value={7}>7 anos</option>
              </select>
            </div>
          </div>
          <div>
            <label className="label">Andaime necessário?</label>
            <div className="flex gap-4 mt-1">
              {[['nao','Não'],['sim','Sim']].map(([v,l]) => (
                <label key={v} className="flex items-center gap-2 cursor-pointer text-sm">
                  <input type="radio" name="andaime_manual" value={v} checked={form.andaime===v} onChange={() => setForm(prev=>({...prev,andaime:v}))} className="accent-primary" />
                  {l}
                </label>
              ))}
            </div>
          </div>
          <div>
            <label className="label">Observações</label>
            <textarea className="input min-h-[60px] resize-y" value={form.obs} onChange={upd('obs')} placeholder="Observações adicionais..." />
          </div>
          <p className="text-xs text-gray-400">Após criar, acesse a medição para adicionar locais e quantidades.</p>
        </div>
        <div className="flex justify-end gap-3 p-4 border-t">
          <button onClick={onClose} className="btn-secondary" disabled={saving}>Cancelar</button>
          <button onClick={handleSubmit} className="btn-primary" disabled={saving}>
            {saving ? 'Criando...' : '+ Criar Medição'}
          </button>
        </div>
      </div>
    </div>
  )
}

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
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'
  const [medicoes, setMedicoes] = useState([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(null)
  const [checked, setChecked] = useState(new Set())
  const [deleting, setDeleting] = useState(false)
  const [filters, setFilters] = useState({ medidor: '', status: '', dateFrom: '', dateTo: '', search: '', bairro: '' })
  const [showManual, setShowManual] = useState(false)

  useEffect(() => {
    api.getMedicoes()
      .then(setMedicoes)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  const filtered = medicoes.filter(m => {
    if (filters.medidor && (m.user || m.medidor) !== filters.medidor) return false
    if (filters.status && m.status !== filters.status) return false
    if (filters.bairro && (m.bairro || '') !== filters.bairro) return false
    if (filters.search) {
      const q = filters.search.toLowerCase()
      const match = [m.cliente, m.nomeCliente, m.cidade, m.bairro, m.user, m.medidor]
        .filter(Boolean).some(v => v.toLowerCase().includes(q))
      if (!match) return false
    }
    const ts = m.createdAt || m.receivedAt
    if (filters.dateFrom && ts) {
      if (new Date(ts) < new Date(filters.dateFrom)) return false
    }
    if (filters.dateTo && ts) {
      if (new Date(ts) > new Date(filters.dateTo + 'T23:59:59')) return false
    }
    return true
  })

  const medidores = [...new Set(medicoes.map(m => m.user || m.medidor).filter(Boolean))]
  const bairros = [...new Set(medicoes.map(m => m.bairro).filter(Boolean))].sort()

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
    else setChecked(new Set(filtered.map(m => m.id)))
  }
  const handleDeleteSelected = async () => {
    if (!confirm(`Excluir ${checked.size} medição(ões)?`)) return
    setDeleting(true)
    for (const id of checked) {
      await api.deleteMedicao(id).catch(() => {})
    }
    setMedicoes(prev => prev.filter(m => !checked.has(m.id)))
    setChecked(new Set())
    setDeleting(false)
  }

  const handleManualCreated = (newMedicao) => {
    setMedicoes(prev => [{ ...newMedicao, id: newMedicao.id || newMedicao._id }, ...prev])
  }

  return (
    <div className="flex h-full">
      {showManual && (
        <NovaMedicaoModal
          onClose={() => setShowManual(false)}
          onCreated={handleManualCreated}
        />
      )}
      {/* Main List */}
      <div className="flex-1 p-6 overflow-auto min-w-0">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">Medições</h1>
            <p className="text-gray-500 text-sm mt-0.5">{filtered.length} registros</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowManual(true)}
              className="btn-primary text-sm"
            >
              + Nova Manual
            </button>
            {isAdmin && checked.size > 0 && (
              <button
                onClick={handleDeleteSelected}
                disabled={deleting}
                className="btn-danger text-sm"
              >
                {deleting ? 'Excluindo...' : `Excluir ${checked.size}`}
              </button>
            )}
          </div>
        </div>

        {/* Filters */}
        <div className="card mb-4">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-3">
            <input
              className="input col-span-2 md:col-span-1"
              placeholder="Buscar cliente, bairro, cidade..."
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
              <option value="reaberta">Reaberta</option>
            </select>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <select
              className="input"
              value={filters.bairro}
              onChange={e => setFilters(f => ({ ...f, bairro: e.target.value }))}
            >
              <option value="">Todos os bairros</option>
              {bairros.map(b => <option key={b} value={b}>{b}</option>)}
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
                    {isAdmin && <th className="px-4 py-3 w-10">
                      <input type="checkbox" checked={checked.size === filtered.length && filtered.length > 0} onChange={toggleAll} className="rounded" />
                    </th>}
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Nº</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Data/Hora</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Cliente</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Bairro / Cidade</th>
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
                      {isAdmin && <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                        <input type="checkbox" checked={checked.has(m.id)} onChange={e => toggleCheck(m.id, e)} className="rounded" />
                      </td>}
                      <td className="px-4 py-3 font-mono text-xs text-gray-500">
                        #{String(m.numeroMedicao || '').padStart(3, '0')}
                      </td>
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                        {new Date(m.createdAt || m.receivedAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td className="px-4 py-3 font-medium text-gray-800">
                        {m.cliente || m.nomeCliente || '—'}
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {m.bairro && <div className="text-xs font-medium text-gray-700">{m.bairro}</div>}
                        <div className="text-xs">{m.cidade || '—'}</div>
                      </td>
                      <td className="px-4 py-3 text-gray-600">{m.user || m.medidor || '—'}</td>
                      <td className="px-4 py-3 text-gray-600">
                        {Array.isArray(m.locais) ? m.locais.length : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-1">
                          <span className={`badge ${STATUS_COLORS[m.status] || 'bg-gray-100 text-gray-700'}`}>
                            {STATUS_LABELS[m.status] || m.status || 'Pendente'}
                          </span>
                          {m.temOrcamento && (
                            <span
                              onClick={(e) => { e.stopPropagation(); navigate('/orcamentos/' + m.orcamentoId) }}
                              className="text-xs bg-orange-100 text-orange-700 border border-orange-200 px-2 py-0.5 rounded-full cursor-pointer hover:bg-orange-200 font-medium w-fit"
                            >
                              📋 Orçamento #{String(m.numeroOrcamento || '').padStart(4, '0')}
                            </span>
                          )}
                        </div>
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
            onViewDetail={() => navigate(`/medicoes/${selected.id}`)}
          />
        </div>
      )}
    </div>
  )
}

function MedicaoPanel({ medicao: m, onClose, onGenerateOrcamento, onViewDetail }) {
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
            <div><span className="text-gray-500">Medidor:</span> {m.user || m.medidor || '—'}</div>
            <div><span className="text-gray-500">Data:</span> {new Date(m.createdAt || m.receivedAt).toLocaleString('pt-BR')}</div>
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
                  {local.juntaFria > 0 && <div className="text-xs text-gray-500">Juntas Frias: {local.juntaFria}m</div>}
                  {local.ralo > 0 && <div className="text-xs text-gray-500">Ralos: {local.ralo}</div>}
                  {local.juntaDilat > 0 && <div className="text-xs text-gray-500">Jta. Dilat: {local.juntaDilat}m</div>}
                  {local.ferragem > 0 && <div className="text-xs text-gray-500">Ferragens: {local.ferragem}m</div>}
                  {local.cortina > 0 && <div className="text-xs text-gray-500">Cortinas: {local.cortina}m²</div>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Photos */}
        {(() => {
          const todasFotos = (m.locais || []).flatMap(l => (l.fotos || []).map(f => ({ ...f, local: l.nome })))
          if (todasFotos.length === 0) return null
          return (
            <div>
              <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2">
                Fotos ({todasFotos.length})
              </h3>
              <div className="grid grid-cols-3 gap-1">
                {todasFotos.slice(0, 9).map((foto, i) => (
                  <div key={i} className="relative">
                    <img src={foto.data || foto.url || foto} alt={`Foto ${i+1}`} className="w-full aspect-square object-cover rounded" />
                    {foto.local && <div className="text-xs text-gray-400 text-center truncate">{foto.local}</div>}
                  </div>
                ))}
              </div>
            </div>
          )
        })()}

        {/* Observacoes */}
        {(m.obs || m.observacoes) && (
          <div>
            <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2">Observações</h3>
            <p className="text-sm text-gray-600 bg-gray-50 rounded-lg p-2">{m.obs || m.observacoes}</p>
          </div>
        )}
      </div>

      <div className="mt-6 space-y-2">
        <button className="btn-primary w-full" onClick={onGenerateOrcamento}>
          Gerar Orçamento
        </button>
        <button className="btn-secondary w-full text-sm" onClick={() => onViewDetail && onViewDetail()}>
          Ver detalhes completos
        </button>
      </div>
    </div>
  )
}
