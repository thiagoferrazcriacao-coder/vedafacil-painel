import React, { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { api } from '../api/client.js'

const STATUS_OPTIONS = [
  { value: 'agendada',     label: 'Agendada',      color: 'bg-blue-100 text-blue-700' },
  { value: 'em_andamento', label: 'Em Andamento',  color: 'bg-yellow-100 text-yellow-700' },
  { value: 'concluida',    label: 'Concluída',      color: 'bg-green-100 text-green-700' },
  { value: 'cancelada',    label: 'Cancelada',      color: 'bg-red-100 text-red-700' },
]

const LABELS_QTDE = {
  trinca: 'Trincas (m)', juntaFria: 'Juntas Frias (m)', ralo: 'Ralos (unid)',
  juntaDilat: 'Juntas Dilatação (m)', ferragem: 'Trat. Ferragens (m)',
  cortina: 'Cortina (m²)', juntaGerber: 'Juntas Gerber (m)'
}

export default function OSDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [os, setOs] = useState(null)
  const [equipes, setEquipes] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editData, setEditData] = useState(null)
  const [error, setError] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)

  useEffect(() => {
    Promise.all([api.getOrdemServico(id), api.getEquipes()])
      .then(([o, e]) => { setOs(o); setEditData(o); setEquipes(e) })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [id])

  const handleSave = async () => {
    setSaving(true)
    setError('')
    try {
      const updated = await api.updateOrdemServico(id, editData)
      setOs(updated)
      setEditData(updated)
      setEditing(false)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const handleStatusChange = async (newStatus) => {
    try {
      const updated = await api.updateOSStatus(id, newStatus, os.progresso)
      setOs(updated)
      setEditData(updated)
    } catch (err) {
      setError(err.message)
    }
  }

  const handleProgressoChange = async (val) => {
    const progresso = Math.min(100, Math.max(0, Number(val)))
    const newStatus = progresso === 100 ? 'concluida' : progresso > 0 ? 'em_andamento' : os.status
    try {
      const updated = await api.updateOSStatus(id, newStatus, progresso)
      setOs(updated)
      setEditData(updated)
    } catch (err) {
      setError(err.message)
    }
  }

  const handleDelete = async () => {
    try {
      await api.deleteOrdemServico(id)
      navigate('/ordens-servico')
    } catch (err) {
      setError(err.message)
    }
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
    </div>
  )
  if (!os) return <div className="p-6 text-center text-gray-500">OS não encontrada</div>

  const statusCfg = STATUS_OPTIONS.find(s => s.value === os.status) || STATUS_OPTIONS[0]
  const d = editing ? editData : os

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6 flex-wrap">
        <button onClick={() => navigate('/ordens-servico')} className="btn-secondary">Voltar</button>
        <h1 className="text-xl font-bold text-gray-800">OS #{String(os.numero || '').padStart(3, '0')}</h1>
        <span className={`text-sm px-3 py-1 rounded-full ${statusCfg.color}`}>{statusCfg.label}</span>
        <div className="ml-auto flex gap-2 flex-wrap">
          {!editing && (
            <>
              <button onClick={() => { setEditData({ ...os }); setEditing(true) }} className="btn-secondary">✏️ Editar</button>
              <button onClick={() => setConfirmDelete(true)} className="bg-red-50 text-red-600 border border-red-200 rounded-lg px-4 py-2 text-sm hover:bg-red-100 transition-colors">🗑️ Excluir</button>
            </>
          )}
          {editing && (
            <>
              <button onClick={() => { setEditData({ ...os }); setEditing(false) }} className="btn-secondary" disabled={saving}>Cancelar</button>
              <button onClick={handleSave} className="btn-primary" disabled={saving}>{saving ? 'Salvando...' : '💾 Salvar'}</button>
            </>
          )}
        </div>
      </div>

      {error && <div className="bg-red-50 text-red-700 border border-red-200 rounded-lg p-3 mb-4 text-sm">{error}</div>}

      <div className="grid md:grid-cols-2 gap-4">

        {/* Cliente */}
        <div className="card">
          <h2 className="font-semibold mb-3 text-primary">Cliente</h2>
          {editing ? (
            <div className="space-y-2">
              {[['cliente','Cliente'],['endereco','Endereço'],['cidade','Cidade'],['celular','Celular']].map(([f,l]) => (
                <div key={f}>
                  <label className="label">{l}</label>
                  <input className="input" value={editData[f] || ''} onChange={e => setEditData(p => ({ ...p, [f]: e.target.value }))} />
                </div>
              ))}
            </div>
          ) : (
            <dl className="space-y-2 text-sm">
              {[['Cliente', os.cliente],['Endereço', os.endereco],['Cidade', os.cidade],['Celular', os.celular]].map(([k,v]) => v ? (
                <div key={k} className="flex gap-2">
                  <dt className="font-medium text-gray-500 w-20 flex-shrink-0">{k}:</dt>
                  <dd className="text-gray-800">{v}</dd>
                </div>
              ) : null)}
            </dl>
          )}
        </div>

        {/* Execução */}
        <div className="card">
          <h2 className="font-semibold mb-3 text-primary">Execução</h2>
          {editing ? (
            <div className="space-y-2">
              <div>
                <label className="label">Equipe</label>
                <select className="input" value={editData.equipeId || ''} onChange={e => {
                  const eq = equipes.find(x => (x.id || x._id) === e.target.value)
                  setEditData(p => ({ ...p, equipeId: e.target.value, equipeNome: eq?.nome || '' }))
                }}>
                  <option value="">Sem equipe</option>
                  {equipes.filter(e => e.ativa !== false).map(eq => (
                    <option key={eq.id || eq._id} value={eq.id || eq._id}>{eq.nome}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="label">Início</label>
                  <input type="date" className="input" value={editData.dataInicio || ''} onChange={e => setEditData(p => ({ ...p, dataInicio: e.target.value }))} />
                </div>
                <div>
                  <label className="label">Término</label>
                  <input type="date" className="input" value={editData.dataTermino || ''} onChange={e => setEditData(p => ({ ...p, dataTermino: e.target.value }))} />
                </div>
              </div>
              <div>
                <label className="label">Status</label>
                <select className="input" value={editData.status || 'agendada'} onChange={e => setEditData(p => ({ ...p, status: e.target.value }))}>
                  {STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Observações</label>
                <textarea className="input resize-none" rows={3} value={editData.obs || ''} onChange={e => setEditData(p => ({ ...p, obs: e.target.value }))} />
              </div>
            </div>
          ) : (
            <dl className="space-y-2 text-sm">
              {[
                ['Equipe', os.equipeNome || 'Não atribuída'],
                ['Início', os.dataInicio ? new Date(os.dataInicio + 'T12:00:00').toLocaleDateString('pt-BR') : null],
                ['Término', os.dataTermino ? new Date(os.dataTermino + 'T12:00:00').toLocaleDateString('pt-BR') : null],
                ['Dias Obra', os.diasTrabalho ? `${os.diasTrabalho} dia(s)` : null],
              ].map(([k,v]) => v ? (
                <div key={k} className="flex gap-2">
                  <dt className="font-medium text-gray-500 w-20 flex-shrink-0">{k}:</dt>
                  <dd className="text-gray-800">{v}</dd>
                </div>
              ) : null)}
              {os.obs && (
                <div className="mt-2 p-2 bg-yellow-50 rounded text-gray-700">{os.obs}</div>
              )}
            </dl>
          )}
        </div>

        {/* Progresso */}
        <div className="card md:col-span-2">
          <h2 className="font-semibold mb-3 text-primary">Progresso da Obra</h2>
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <input
                type="range" min="0" max="100" step="5"
                value={os.progresso || 0}
                onChange={e => handleProgressoChange(e.target.value)}
                className="w-full accent-primary"
              />
              <div className="flex justify-between text-xs text-gray-400 mt-1">
                <span>0%</span><span>25%</span><span>50%</span><span>75%</span><span>100%</span>
              </div>
            </div>
            <div className="text-3xl font-bold text-primary w-16 text-center">{os.progresso || 0}%</div>
          </div>
          <div className="flex gap-2 mt-3 flex-wrap">
            {STATUS_OPTIONS.map(s => (
              <button key={s.value}
                onClick={() => handleStatusChange(s.value)}
                className={`text-xs px-3 py-1.5 rounded-full border transition-all ${os.status === s.value ? s.color + ' border-transparent' : 'border-gray-200 text-gray-600 hover:border-gray-300'}`}>
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {/* Dados Técnicos */}
        {(os.consumoProduto > 0 || os.qtdInjetores > 0 || os.diasTrabalho > 0) && (
          <div className="card">
            <h2 className="font-semibold mb-3 text-primary">Dados Técnicos</h2>
            <div className="grid grid-cols-3 gap-3">
              {os.diasTrabalho > 0 && (
                <div className="text-center p-3 bg-blue-50 rounded-lg">
                  <div className="text-2xl font-bold text-blue-700">{os.diasTrabalho}</div>
                  <div className="text-xs text-blue-600 mt-1">Dias de Obra</div>
                </div>
              )}
              {os.consumoProduto > 0 && (
                <div className="text-center p-3 bg-orange-50 rounded-lg">
                  <div className="text-2xl font-bold text-orange-700">{os.consumoProduto}L</div>
                  <div className="text-xs text-orange-600 mt-1">GVF Seal</div>
                </div>
              )}
              {os.qtdInjetores > 0 && (
                <div className="text-center p-3 bg-green-50 rounded-lg">
                  <div className="text-2xl font-bold text-green-700">{os.qtdInjetores}</div>
                  <div className="text-xs text-green-600 mt-1">Injetores</div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Pontos de Serviço */}
        {(os.pontos || []).length > 0 && (
          <div className="card md:col-span-2">
            <h2 className="font-semibold mb-3 text-primary">Pontos de Serviço ({os.pontos.length})</h2>
            <div className="grid sm:grid-cols-2 gap-3">
              {os.pontos.map((p, i) => (
                <div key={i} className="bg-gray-50 rounded-lg p-3 text-sm">
                  <div className="font-medium text-gray-700 mb-1">{p.nome || p.local || `Local ${i+1}`}</div>
                  {Object.entries(LABELS_QTDE).map(([campo, label]) => {
                    const v = p[campo]
                    if (!v || v === 0) return null
                    const qt = Array.isArray(v) ? v.reduce((a, b) => a + parseFloat(b || 0), 0) : parseFloat(v)
                    if (!qt) return null
                    return (
                      <div key={campo} className="text-gray-600">
                        <span className="font-medium">{label}:</span> {qt}
                      </div>
                    )
                  })}
                </div>
              ))}
            </div>
          </div>
        )}

      </div>

      {/* Confirm Delete */}
      {confirmDelete && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-6">
            <h3 className="font-bold text-gray-800 mb-2">Excluir OS #{String(os.numero || '').padStart(3, '0')}?</h3>
            <p className="text-gray-600 text-sm mb-5">Esta ação não pode ser desfeita.</p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmDelete(false)} className="flex-1 btn-secondary">Cancelar</button>
              <button onClick={handleDelete} className="flex-1 bg-red-600 text-white rounded-lg py-2 font-medium hover:bg-red-700 transition-colors">Excluir</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
