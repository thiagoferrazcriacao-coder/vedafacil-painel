import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api/client.js'

const fmt = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0)
const fmtDate = (ts) => {
  if (!ts) return '—'
  return new Date(ts).toLocaleDateString('pt-BR')
}

function EditModal({ contrato, onClose, onSaved }) {
  const [form, setForm] = useState({
    razaoSocial: contrato.razaoSocial || contrato.cliente || '',
    cnpj: contrato.cnpj || '',
    endereco: contrato.endereco || '',
    bairro: contrato.bairro || '',
    cidade: contrato.cidade || '',
    cep: contrato.cep || '',
    garantia: contrato.garantia || 15,
    totalLiquido: contrato.totalLiquido || 0,
    dataInicio: contrato.dataInicio ? new Date(contrato.dataInicio).toISOString().slice(0, 10) : '',
    dataTermino: contrato.dataTermino ? new Date(contrato.dataTermino).toISOString().slice(0, 10) : '',
    obsGarantia: contrato.obsGarantia || '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const upd = (field) => (e) => setForm(prev => ({ ...prev, [field]: e.target.value }))

  const handleSave = async () => {
    setSaving(true)
    setError('')
    try {
      const updated = await api.updateContrato(contrato.id, form)
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
          <h2 className="font-bold text-gray-800">Editar Garantia #{String(contrato.numero || 0).padStart(4, '0')}</h2>
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

export default function GarantiasPage() {
  const navigate = useNavigate()
  const [contratos, setContratos] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [marking, setMarking] = useState(null)
  const [editingContrato, setEditingContrato] = useState(null)

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

  const handleSaved = (updated) => {
    setContratos(prev => prev.map(c => c.id === updated.id ? { ...c, ...updated } : c))
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
      {editingContrato && (
        <EditModal
          contrato={editingContrato}
          onClose={() => setEditingContrato(null)}
          onSaved={handleSaved}
        />
      )}

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
                      {c.cidade && <div className="text-xs text-gray-400">{c.bairro ? `${c.bairro} · ` : ''}{c.cidade}</div>}
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
                      <div className="flex gap-1.5 justify-end flex-wrap">
                        <button
                          onClick={() => window.open(api.getGarantiaPdfUrl(c.id), '_blank')}
                          className="text-xs px-2 py-1 rounded bg-blue-100 text-blue-700 hover:bg-blue-200 font-medium"
                        >
                          📄 PDF
                        </button>
                        <button
                          onClick={() => setEditingContrato(c)}
                          className="text-xs px-2 py-1 rounded bg-gray-100 text-gray-600 hover:bg-gray-200"
                        >
                          ✏️ Editar
                        </button>
                        <button
                          onClick={() => navigate(`/contratos/${c.id}`)}
                          className="text-xs px-2 py-1 rounded bg-gray-100 text-gray-600 hover:bg-gray-200"
                        >
                          Contrato
                        </button>
                        {!c.garantiaEnviadaEm && (
                          <button
                            onClick={() => handleMarcarEnviada(c.id)}
                            disabled={marking === c.id}
                            className="text-xs px-2 py-1 rounded bg-green-100 text-green-700 hover:bg-green-200 font-semibold disabled:opacity-40"
                          >
                            {marking === c.id ? '...' : '✓ Enviada'}
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
