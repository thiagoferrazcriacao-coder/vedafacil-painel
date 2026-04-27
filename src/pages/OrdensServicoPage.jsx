import React, { useEffect, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { api } from '../api/client.js'

const STATUS_CONFIG = {
  agendada:     { label: 'Agendada',     color: 'bg-blue-100 text-blue-700' },
  em_andamento: { label: 'Em Andamento', color: 'bg-yellow-100 text-yellow-700' },
  concluida:    { label: 'Concluída',    color: 'bg-green-100 text-green-700' },
  cancelada:    { label: 'Cancelada',    color: 'bg-red-100 text-red-700' },
}

function NovaOSModal({ onClose, onSave, contratoIdInicial }) {
  const [contratos, setContratos] = useState([])
  const [equipes, setEquipes] = useState([])
  const [form, setForm] = useState({
    contratoId: contratoIdInicial || '', equipeId: '', dataInicio: '', dataTermino: '', obs: ''
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    Promise.all([api.getContratos(), api.getEquipes()])
      .then(([c, e]) => { setContratos(c); setEquipes(e) })
      .catch(console.error)
  }, [])

  const contratoSel = contratos.find(c => (c.id || c._id) === form.contratoId)

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
          <h2 className="text-lg font-bold text-gray-800">Nova Ordem de Serviço</h2>
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
                <p className="text-blue-500 mt-1">{contratoSel.locais.length} local(is) · {contratoSel.diasTrabalho || 0} dia(s) de obra</p>
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

export default function OrdensServicoPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const [ordens, setOrdens] = useState([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [filtroStatus, setFiltroStatus] = useState('todos')
  const [contratoIdParam, setContratoIdParam] = useState(null)

  const load = () => {
    setLoading(true)
    api.getOrdensServico()
      .then(setOrdens)
      .catch(console.error)
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
    const params = new URLSearchParams(location.search)
    const cid = params.get('contratoId')
    if (cid) { setContratoIdParam(cid); setModalOpen(true) }
  }, [])

  const handleSave = async (data) => {
    const created = await api.createOrdemServico(data)
    setOrdens(prev => [created, ...prev])
  }

  const ordensFiltradas = filtroStatus === 'todos'
    ? ordens
    : ordens.filter(o => o.status === filtroStatus)

  const contadores = Object.keys(STATUS_CONFIG).reduce((acc, s) => {
    acc[s] = ordens.filter(o => o.status === s).length
    return acc
  }, {})

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
    </div>
  )

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Ordens de Serviço</h1>
          <p className="text-gray-500 text-sm mt-1">Acompanhe a execução das obras</p>
        </div>
        <button onClick={() => setModalOpen(true)} className="btn-primary">
          + Nova OS
        </button>
      </div>

      {/* Contadores */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
          <button key={key}
            onClick={() => setFiltroStatus(filtroStatus === key ? 'todos' : key)}
            className={`card text-center cursor-pointer transition-all hover:shadow-md ${filtroStatus === key ? 'ring-2 ring-primary' : ''}`}>
            <div className="text-2xl font-bold text-gray-800">{contadores[key] || 0}</div>
            <div className={`text-xs px-2 py-0.5 rounded-full inline-block mt-1 ${cfg.color}`}>{cfg.label}</div>
          </button>
        ))}
      </div>

      {/* Lista */}
      {ordensFiltradas.length === 0 ? (
        <div className="card text-center py-12">
          <div className="text-5xl mb-4">🔧</div>
          <h3 className="text-lg font-semibold text-gray-700 mb-2">
            {ordens.length === 0 ? 'Nenhuma OS criada ainda' : 'Nenhuma OS neste status'}
          </h3>
          <p className="text-gray-500 text-sm mb-4">
            {ordens.length === 0 ? 'Crie uma OS a partir de um contrato assinado' : 'Tente outro filtro'}
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
            return (
              <div key={id}
                className="card hover:shadow-md transition-shadow cursor-pointer"
                onClick={() => navigate(`/ordens-servico/${id}`)}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="font-bold text-primary">OS #{String(os.numero || '').padStart(3, '0')}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${cfg.color}`}>{cfg.label}</span>
                      {os.equipeNome && (
                        <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">👷 {os.equipeNome}</span>
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

                  {/* Progresso */}
                  <div className="text-right flex-shrink-0">
                    <div className="text-lg font-bold text-gray-700">{os.progresso || 0}%</div>
                    <div className="w-16 h-2 bg-gray-200 rounded-full mt-1">
                      <div className="h-2 bg-primary rounded-full transition-all"
                        style={{ width: `${os.progresso || 0}%` }} />
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {modalOpen && (
        <NovaOSModal
          onClose={() => { setModalOpen(false); setContratoIdParam(null) }}
          onSave={handleSave}
          contratoIdInicial={contratoIdParam}
        />
      )}
    </div>
  )
}
