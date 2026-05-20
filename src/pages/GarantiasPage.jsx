import React, { useEffect, useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api/client.js'

const fmt = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0)
const fmtDate = (ts) => {
  if (!ts) return '—'
  return new Date(ts).toLocaleDateString('pt-BR')
}

// ─── Modal de Edição ──────────────────────────────────────────────────────────
function EditModal({ item, onClose, onSaved }) {
  const isContrato = item.source === 'contrato'
  const [form, setForm] = useState({
    razaoSocial: item.razaoSocial || item.cliente || '',
    cnpj:        item.cnpj || item.cnpjCliente || '',
    endereco:    item.endereco || '',
    bairro:      item.bairro || '',
    cidade:      item.cidade || '',
    cep:         item.cep || '',
    garantia:    item.garantia || 15,
    totalLiquido: item.totalLiquido || 0,
    dataInicio:  item.dataInicio ? new Date(item.dataInicio).toISOString().slice(0, 10) : '',
    dataTermino: item.dataTermino ? new Date(item.dataTermino).toISOString().slice(0, 10) : '',
    obsGarantia: item.obsGarantia || '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const upd = (field) => (e) => setForm(prev => ({ ...prev, [field]: e.target.value }))

  const handleSave = async () => {
    setSaving(true)
    setError('')
    try {
      let updated
      if (isContrato) {
        updated = await api.updateContrato(item.id, form)
        updated = { ...updated, source: 'contrato' }
      } else {
        updated = await api.updateGarantia(item.id, form)
        updated = { ...updated, source: 'garantia' }
      }
      onSaved(updated)
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
          <h2 className="font-bold text-gray-800">
            Editar Garantia
            {item.numero ? ` #${String(item.numero).padStart(4, '0')}` : ''}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>
        <div className="p-4 space-y-3">
          {error && <div className="p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">{error}</div>}
          <div>
            <label className="label">Razão Social / Cliente</label>
            <input className="input" value={form.razaoSocial} onChange={upd('razaoSocial')} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">CNPJ/CPF</label>
              <input className="input" value={form.cnpj} onChange={upd('cnpj')} />
            </div>
            <div>
              <label className="label">CEP</label>
              <input className="input" value={form.cep} onChange={upd('cep')} />
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
              <label className="label">Garantia (anos)</label>
              <select className="input" value={form.garantia} onChange={upd('garantia')}>
                <option value={7}>7 anos</option>
                <option value={15}>15 anos</option>
              </select>
            </div>
            <div>
              <label className="label">Valor Total (R$)</label>
              <input className="input" type="number" min="0" step="0.01" value={form.totalLiquido} onChange={upd('totalLiquido')} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Data Início</label>
              <input className="input" type="date" value={form.dataInicio} onChange={upd('dataInicio')} />
            </div>
            <div>
              <label className="label">Data Término</label>
              <input className="input" type="date" value={form.dataTermino} onChange={upd('dataTermino')} />
            </div>
          </div>
          <div>
            <label className="label">Observações (Garantia)</label>
            <textarea className="input min-h-[60px] resize-y" value={form.obsGarantia} onChange={upd('obsGarantia')} placeholder="Observações adicionais para o certificado..." />
          </div>
        </div>
        <div className="flex justify-end gap-3 p-4 border-t">
          <button onClick={onClose} className="btn-secondary" disabled={saving}>Cancelar</button>
          <button onClick={handleSave} className="btn-primary" disabled={saving}>
            {saving ? 'Salvando...' : '💾 Salvar'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Modal: Incluir Nova Garantia ─────────────────────────────────────────────
function NovaGarantiaModal({ onClose, onCreated }) {
  const [ordensServico, setOrdensServico] = useState([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(new Set())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    api.getOrdensServico()
      .then(data => {
        // Filtra apenas OSes concluídas (não reparos)
        const concluidas = (data || []).filter(os =>
          os.status === 'concluida' && os.tipo !== 'reparo'
        )
        setOrdensServico(concluidas)
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  const toggleSelect = (id) => {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const handleCriar = async () => {
    if (selected.size === 0) return
    setSaving(true)
    setError('')
    try {
      const created = await api.createGarantiasFromOS([...selected])
      onCreated(created)
      onClose()
    } catch (e) {
      setError(e.message)
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b flex-shrink-0">
          <div>
            <h2 className="font-bold text-gray-800">Incluir Nova Garantia</h2>
            <p className="text-sm text-gray-500 mt-0.5">Selecione OSes concluídas para gerar certificados</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {error && <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">{error}</div>}
          {loading ? (
            <div className="flex items-center justify-center h-32">
              <div className="animate-spin w-6 h-6 border-4 border-primary border-t-transparent rounded-full" />
            </div>
          ) : ordensServico.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <p className="font-medium">Nenhuma OS concluída disponível</p>
              <p className="text-sm mt-1">Conclua OSes para poder gerar certificados</p>
            </div>
          ) : (
            <div className="space-y-2">
              {/* Select all */}
              <div className="flex items-center gap-2 pb-2 border-b border-gray-100">
                <input
                  type="checkbox"
                  id="selectAll"
                  checked={selected.size === ordensServico.length && ordensServico.length > 0}
                  onChange={() => {
                    if (selected.size === ordensServico.length) setSelected(new Set())
                    else setSelected(new Set(ordensServico.map(os => os.id)))
                  }}
                  className="rounded"
                />
                <label htmlFor="selectAll" className="text-sm font-medium text-gray-600 cursor-pointer">
                  Selecionar todas ({ordensServico.length})
                </label>
              </div>

              {ordensServico.map(os => (
                <div
                  key={os.id}
                  onClick={() => toggleSelect(os.id)}
                  className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                    selected.has(os.id)
                      ? 'border-primary bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selected.has(os.id)}
                    onChange={() => toggleSelect(os.id)}
                    onClick={e => e.stopPropagation()}
                    className="rounded flex-shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-gray-800 text-sm">{os.cliente || '—'}</span>
                      {os.numOS && (
                        <span className="text-xs text-gray-400 font-mono">OS #{String(os.numOS).padStart(4, '0')}</span>
                      )}
                      <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">
                        {os.garantia || 15} anos
                      </span>
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5 truncate">
                      {[os.endereco, os.cidade].filter(Boolean).join(' · ') || '—'}
                    </div>
                    <div className="text-xs text-gray-400 mt-0.5">
                      Concluída em {fmtDate(os.updatedAt || os.dataTermino)}
                      {os.equipeNome ? ` · ${os.equipeNome}` : ''}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 p-4 border-t flex-shrink-0 bg-gray-50">
          <span className="text-sm text-gray-500">
            {selected.size > 0 ? `${selected.size} OS(es) selecionada(s)` : 'Nenhuma selecionada'}
          </span>
          <div className="flex gap-2">
            <button onClick={onClose} className="btn-secondary" disabled={saving}>Cancelar</button>
            <button
              onClick={handleCriar}
              disabled={saving || selected.size === 0}
              className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? 'Criando...' : `✅ Criar ${selected.size > 0 ? selected.size : ''} Certificado(s)`}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Página Principal ─────────────────────────────────────────────────────────
export default function GarantiasPage() {
  const navigate = useNavigate()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [marking, setMarking] = useState(null)
  const [editingItem, setEditingItem] = useState(null)
  const [showNovaModal, setShowNovaModal] = useState(false)

  const loadData = () => {
    setLoading(true)
    api.getGarantias()
      .then(data => setItems(data || []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  useEffect(() => { loadData() }, [])

  const handleMarcarEnviada = async (item) => {
    setMarking(item.id)
    try {
      let updated
      if (item.source === 'contrato') {
        updated = await api.marcarGarantiaEnviada(item.id)
        updated = { ...updated, source: 'contrato' }
      } else {
        updated = await api.marcarGarantiaEnviadaNew(item.id)
      }
      setItems(prev => prev.map(i => i.id === item.id ? { ...i, garantiaEnviadaEm: updated.garantiaEnviadaEm } : i))
    } catch {
    } finally {
      setMarking(null)
    }
  }

  const handleSaved = (updated) => {
    setItems(prev => prev.map(i => i.id === updated.id ? { ...i, ...updated } : i))
  }

  const handleCreated = (created) => {
    setItems(prev => [...created, ...prev])
  }

  const getPdfUrl = (item) => {
    if (item.source === 'contrato') return api.getGarantiaPdfUrl(item.id)
    return api.getGarantiaNewPdfUrl(item.id)
  }

  const filtered = useMemo(() => items.filter(c => {
    const q = search.toLowerCase()
    return !q ||
      (c.cliente || '').toLowerCase().includes(q) ||
      (c.razaoSocial || '').toLowerCase().includes(q) ||
      String(c.numero || '').includes(q)
  }), [items, search])

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
    </div>
  )

  return (
    <div className="p-4 md:p-6">
      {editingItem && (
        <EditModal item={editingItem} onClose={() => setEditingItem(null)} onSaved={handleSaved} />
      )}
      {showNovaModal && (
        <NovaGarantiaModal onClose={() => setShowNovaModal(false)} onCreated={handleCreated} />
      )}

      <div className="flex flex-wrap items-center gap-3 mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-800">Certificados de Garantia</h1>
          <p className="text-sm text-gray-500 mt-0.5">{filtered.length} certificado(s) disponível(eis)</p>
        </div>
        <div className="ml-auto">
          <button
            onClick={() => setShowNovaModal(true)}
            className="bg-primary text-white rounded-lg px-4 py-2 text-sm font-semibold hover:bg-blue-800 transition-colors flex items-center gap-2"
          >
            ➕ Incluir Nova Garantia
          </button>
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
          <p className="text-sm mt-1">Use "Incluir Nova Garantia" para criar certificados a partir de OSes concluídas</p>
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
                  <th className="text-center py-3 px-4 text-xs font-semibold text-gray-600">Origem</th>
                  <th className="text-center py-3 px-4 text-xs font-semibold text-gray-600">Status</th>
                  <th className="text-center py-3 px-4 text-xs font-semibold text-gray-600">Enviada em</th>
                  <th className="text-right py-3 px-4 text-xs font-semibold text-gray-600">Ações</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(item => (
                  <tr key={item.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                    <td className="py-3 px-4 font-mono text-gray-600">
                      {item.numero ? `#${String(item.numero).padStart(4, '0')}` : '—'}
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-medium text-gray-800">{item.razaoSocial || item.cliente || '—'}</div>
                      {item.cidade && <div className="text-xs text-gray-400">{item.bairro ? `${item.bairro} · ` : ''}{item.cidade}</div>}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800">
                        {item.garantia || 15} anos
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center text-gray-700 font-medium">
                      {fmt(item.totalLiquido)}
                    </td>
                    <td className="py-3 px-4 text-center">
                      {item.source === 'contrato' ? (
                        <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">Contrato</span>
                      ) : (
                        <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">OS</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-center">
                      {item.garantiaEnviadaEm ? (
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
                      {item.garantiaEnviadaEm ? fmtDate(item.garantiaEnviadaEm) : '—'}
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex gap-1.5 justify-end flex-wrap">
                        <button
                          onClick={() => window.open(getPdfUrl(item), '_blank')}
                          className="text-xs px-2 py-1 rounded bg-blue-100 text-blue-700 hover:bg-blue-200 font-medium"
                        >
                          📄 PDF
                        </button>
                        <button
                          onClick={() => setEditingItem(item)}
                          className="text-xs px-2 py-1 rounded bg-gray-100 text-gray-600 hover:bg-gray-200"
                        >
                          ✏️ Editar
                        </button>
                        {item.source === 'contrato' ? (
                          <button
                            onClick={() => navigate(`/contratos/${item.id}`)}
                            className="text-xs px-2 py-1 rounded bg-gray-100 text-gray-600 hover:bg-gray-200"
                          >
                            Contrato
                          </button>
                        ) : item.osId ? (
                          <button
                            onClick={() => navigate(`/ordens-servico/${item.osId}`)}
                            className="text-xs px-2 py-1 rounded bg-gray-100 text-gray-600 hover:bg-gray-200"
                          >
                            Ver OS
                          </button>
                        ) : null}
                        {!item.garantiaEnviadaEm && (
                          <button
                            onClick={() => handleMarcarEnviada(item)}
                            disabled={marking === item.id}
                            className="text-xs px-2 py-1 rounded bg-green-100 text-green-700 hover:bg-green-200 font-semibold disabled:opacity-40"
                          >
                            {marking === item.id ? '...' : '✓ Enviada'}
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
