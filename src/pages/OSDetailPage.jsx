import React, { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { api } from '../api/client.js'
import { useAuth } from '../App.jsx'

const STATUS_OPTIONS = [
  { value: 'agendada',              label: 'Agendada',              color: 'bg-blue-100 text-blue-700' },
  { value: 'em_andamento',          label: 'Em Andamento',          color: 'bg-yellow-100 text-yellow-700' },
  { value: 'aguardando_assinatura', label: 'Aguard. Assinatura',    color: 'bg-amber-100 text-amber-800' },
  { value: 'concluida',             label: 'Concluída',             color: 'bg-green-100 text-green-700' },
  { value: 'cancelada',             label: 'Cancelada',             color: 'bg-red-100 text-red-700' },
]

const LABELS_QTDE = {
  trinca: 'Trincas (m)', juntaFria: 'Juntas Frias (m)', ralo: 'Ralos (un)',
  juntaDilat: 'Juntas Dilatação (m)', ferragem: 'Ferragens (m)',
  cortina: 'Cortina (m²)',
}

function LocalCard({ ponto, idx }) {
  const [expanded, setExpanded] = useState(false)

  const subPontos = ponto.subPontos || []
  const totalSubs = subPontos.length
  const feitosSubs = subPontos.filter(sp => sp.feito).length
  const antesCount = ponto.fotosAntes?.length || 0
  const depoisCount = ponto.fotosDepois?.length || 0
  const statusLocal = ponto.statusLocal || ponto.status || 'pendente'

  const statusColor = statusLocal === 'concluido'
    ? 'bg-green-100 text-green-700 border-green-200'
    : statusLocal === 'em_andamento'
    ? 'bg-yellow-100 text-yellow-700 border-yellow-200'
    : 'bg-gray-100 text-gray-600 border-gray-200'

  const statusLabel = statusLocal === 'concluido' ? '✓ Concluído'
    : statusLocal === 'em_andamento' ? '⏳ Em andamento'
    : '⏸ Pendente'

  return (
    <div className={`border rounded-lg overflow-hidden ${statusLocal === 'concluido' ? 'border-green-200 bg-green-50' : 'border-gray-200 bg-white'}`}>
      <div
        className="flex items-center gap-3 p-3 cursor-pointer hover:bg-gray-50 transition-colors"
        onClick={() => setExpanded(e => !e)}
      >
        <div className="flex-1 min-w-0">
          <div className="font-medium text-gray-800 text-sm">{ponto.nome || ponto.local || `Local ${idx + 1}`}</div>
          <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
            {totalSubs > 0 && (
              <span className={`font-medium ${feitosSubs === totalSubs ? 'text-green-600' : 'text-orange-600'}`}>
                📋 {feitosSubs}/{totalSubs} sub-pontos
              </span>
            )}
            {antesCount > 0 && <span>📷 {antesCount} antes</span>}
            {depoisCount > 0 && <span>📸 {depoisCount} depois</span>}
          </div>
        </div>
        <span className={`text-xs px-2 py-0.5 rounded-full border ${statusColor}`}>{statusLabel}</span>
        <span className="text-gray-400 text-xs">{expanded ? '▲' : '▼'}</span>
      </div>

      {expanded && (
        <div className="border-t border-gray-100 p-3 space-y-3">
          {/* Fotos de referência / medição */}
          {(() => {
            const fotosRef = [...(ponto.fotosMedicao || []), ...(ponto.fotosRef || []), ...(ponto.fotos || [])]
            if (!fotosRef.length) return null
            return (
              <div>
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">📌 Fotos de Referência ({fotosRef.length})</div>
                <div className="grid grid-cols-3 gap-1">
                  {fotosRef.slice(0, 6).map((f, fi) => {
                    const src = typeof f === 'object' && f !== null ? (f.thumb || f.full || f.data || '') : (typeof f === 'string' ? f : '')
                    if (!src) return null
                    return (
                      <a key={fi} href={src} target="_blank" rel="noreferrer">
                        <img src={src} alt={`ref ${fi + 1}`} className="w-full aspect-square object-cover rounded border border-gray-200 hover:opacity-80 transition-opacity" />
                      </a>
                    )
                  })}
                  {fotosRef.length > 6 && (
                    <div className="w-full aspect-square bg-gray-100 rounded border border-gray-200 flex items-center justify-center text-xs text-gray-500 font-medium">
                      +{fotosRef.length - 6}
                    </div>
                  )}
                </div>
              </div>
            )
          })()}

          {/* Medições do local */}
          <div>
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Medições</div>
            <div className="flex flex-wrap gap-2">
              {Object.entries(LABELS_QTDE).map(([campo, label]) => {
                const v = ponto[campo]
                if (!v || v === 0) return null
                const qt = Array.isArray(v) ? v.reduce((a, b) => a + parseFloat(b || 0), 0) : parseFloat(v)
                if (!qt) return null
                return (
                  <span key={campo} className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded">
                    {label}: {qt}
                  </span>
                )
              })}
            </div>
          </div>

          {/* Sub-pontos com rastreio de equipe/membro */}
          {subPontos.length > 0 && (
            <div>
              <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                Itens Executados ({feitosSubs}/{totalSubs})
              </div>
              <div className="space-y-1">
                {subPontos.map((sp, si) => (
                  <div key={si} className={`flex items-start gap-2 text-xs px-2 py-1.5 rounded ${sp.feito ? 'bg-green-50 text-green-700' : 'bg-gray-50 text-gray-500'}`}>
                    <span className="flex-shrink-0 mt-0.5">{sp.feito ? '✅' : '⬜'}</span>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium">{sp.desc}</div>
                      {sp.feito && sp.executadoEm && (
                        <div className="text-[10px] text-gray-400 mt-0.5 flex flex-wrap gap-1">
                          <span>📅 {new Date(sp.executadoEm + 'T12:00:00').toLocaleDateString('pt-BR')}</span>
                          {sp.executadoPorEquipeNome && <span>· 👷 {sp.executadoPorEquipeNome}</span>}
                          {sp.executadoPorMembro && <span>({sp.executadoPorMembro})</span>}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Fotos */}
          <div className="grid grid-cols-2 gap-3">
            {antesCount > 0 && (
              <div>
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                  Fotos Antes ({antesCount})
                </div>
                <div className="flex flex-wrap gap-1">
                  {(ponto.fotosAntes || []).slice(0, 4).map((f, fi) => {
                    const srcThumb = typeof f === 'object' && f !== null ? (f.thumb || f.full || f.data || '') : (typeof f === 'string' ? f : '')
                    const srcFull  = typeof f === 'object' && f !== null ? (f.full  || f.thumb || f.data || '') : (typeof f === 'string' ? f : '')
                    if (!srcThumb) return (
                      <div key={fi} className="w-14 h-14 bg-gray-100 rounded border border-gray-200 flex items-center justify-center text-xs text-gray-400">📷</div>
                    )
                    return (
                      <img
                        key={fi}
                        src={srcThumb}
                        alt={`antes ${fi + 1}`}
                        className="w-14 h-14 object-cover rounded border border-gray-200 cursor-pointer"
                        onClick={() => window.open(srcFull, '_blank')}
                        onError={e => { e.target.style.display='none'; e.target.nextSibling && (e.target.nextSibling.style.display='flex') }}
                      />
                    )
                  })}
                  {antesCount > 4 && (
                    <div className="w-14 h-14 bg-gray-100 rounded border border-gray-200 flex items-center justify-center text-xs text-gray-500">
                      +{antesCount - 4}
                    </div>
                  )}
                </div>
              </div>
            )}
            {depoisCount > 0 && (
              <div>
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                  Fotos Depois ({depoisCount})
                </div>
                <div className="flex flex-wrap gap-1">
                  {(ponto.fotosDepois || []).slice(0, 4).map((f, fi) => {
                    const srcThumb = typeof f === 'object' && f !== null ? (f.thumb || f.full || f.data || '') : (typeof f === 'string' ? f : '')
                    const srcFull  = typeof f === 'object' && f !== null ? (f.full  || f.thumb || f.data || '') : (typeof f === 'string' ? f : '')
                    if (!srcThumb) return (
                      <div key={fi} className="w-14 h-14 bg-gray-100 rounded border border-gray-200 flex items-center justify-center text-xs text-gray-400">📸</div>
                    )
                    return (
                      <img
                        key={fi}
                        src={srcThumb}
                        alt={`depois ${fi + 1}`}
                        className="w-14 h-14 object-cover rounded border border-gray-200 cursor-pointer"
                        onClick={() => window.open(srcFull, '_blank')}
                        onError={e => { e.target.style.display='none'; e.target.nextSibling && (e.target.nextSibling.style.display='flex') }}
                      />
                    )
                  })}
                  {depoisCount > 4 && (
                    <div className="w-14 h-14 bg-gray-100 rounded border border-gray-200 flex items-center justify-center text-xs text-gray-500">
                      +{depoisCount - 4}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default function OSDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [os, setOs] = useState(null)
  const [equipes, setEquipes] = useState([])
  const [tecnicos, setTecnicos] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editData, setEditData] = useState(null)
  const [error, setError] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [redirecionarModal, setRedirecionarModal] = useState(false)
  const [novaEquipeId, setNovaEquipeId] = useState('')
  const [redirecionando, setRedirecionando] = useState(false)
  const [compartilharModal, setCompartilharModal] = useState(false)
  const [compEquipeId, setCompEquipeId] = useState('')
  const [compPontos, setCompPontos] = useState([])
  const [compartilhando, setCompartilhando] = useState(false)
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'

  useEffect(() => {
    Promise.all([api.getOrdemServico(id), api.getEquipes(), api.getPrecos()])
      .then(([o, e, p]) => { setOs(o); setEditData(o); setEquipes(e); setTecnicos(p?.tecnicos || ['Alan', 'Fernando', 'Thiago', 'Daniel']) })
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

  const handleRedirecionar = async () => {
    if (!novaEquipeId) { setError('Selecione uma equipe'); return }
    setRedirecionando(true)
    setError('')
    try {
      const updated = await api.redirecionarEquipe(id, novaEquipeId)
      setOs(updated)
      setEditData(updated)
      setRedirecionarModal(false)
    } catch (err) {
      setError(err.message)
    } finally {
      setRedirecionando(false)
    }
  }

  const handleCompartilhar = async () => {
    if (!compEquipeId) { setError('Selecione uma equipe'); return }
    if (compPontos.length === 0) { setError('Selecione ao menos um local'); return }
    setCompartilhando(true)
    setError('')
    try {
      const eq = equipes.find(x => (x.id || x._id) === compEquipeId)
      await api.compartilharOS(id, { equipeId: compEquipeId, equipeNome: eq?.nome || '', pontos: compPontos })
      const updated = await api.getOrdemServico(id)
      setOs(updated)
      setEditData(updated)
      setCompartilharModal(false)
      setCompEquipeId('')
      setCompPontos([])
    } catch (err) {
      setError(err.message)
    } finally {
      setCompartilhando(false)
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
  const pontos = os.pontos || []
  const concluidos = pontos.filter(p => (p.statusLocal || p.status) === 'concluido').length
  const totalFotosAntes = pontos.reduce((s, p) => s + (p.fotosAntes?.length || 0), 0)
  const totalFotosDepois = pontos.reduce((s, p) => s + (p.fotosDepois?.length || 0), 0)

  // Progresso calculado por sub-pontos (ticados pelo aplicador)
  let totalSubs = 0, feitosSubs = 0
  pontos.forEach(p => {
    const subs = p.subPontos || []
    if (subs.length > 0) {
      totalSubs += subs.length
      feitosSubs += subs.filter(sp => sp.feito).length
    } else {
      totalSubs += 1
      feitosSubs += (p.statusLocal || p.status) === 'concluido' ? 1 : 0
    }
  })
  const progressoCalculado = totalSubs > 0 ? Math.round(feitosSubs / totalSubs * 100) : (os.progresso || 0)
  const temSubPontos = totalSubs > 0

  // ── Cálculos de consumo GVF (fora do JSX) ────────────────────────────────
  const allSubPontos = []
  pontos.forEach(p => {
    ;(p.subPontos || []).forEach(sp => allSubPontos.push({ ...sp, pontoNome: p.nome }))
  })
  const totalSubPontosOS = allSubPontos.length
  const gvfPorSub = totalSubPontosOS > 0 ? (os.consumoProduto || 0) / totalSubPontosOS : 0

  const datasAtividade = new Set([
    ...(os.fechamentosDia || []).map(f => f.data).filter(Boolean),
    ...allSubPontos.filter(sp => sp.feito && sp.executadoEm).map(sp => sp.executadoEm),
  ])
  const diasConsumo = [...datasAtividade].filter(Boolean).sort().map(data => {
    const subsDia  = allSubPontos.filter(sp => sp.feito && sp.executadoEm === data)
    const estimDia = parseFloat((subsDia.length * gvfPorSub).toFixed(1))
    const fech     = (os.fechamentosDia || []).find(f => f.data === data)
    const realDia  = fech?.litros || 0
    const difDia   = parseFloat((realDia - estimDia).toFixed(1))
    return { data, subsDia, estimDia, realDia, difDia, membro: fech?.membro || '', temFechamento: !!fech }
  })
  const totalConsumoEstim = os.consumoProduto  || 0
  const totalConsumoReal  = os.totalConsumoReal || 0
  const totalConsumoDif   = parseFloat((totalConsumoReal - totalConsumoEstim).toFixed(1))
  const showConsumo = totalConsumoEstim > 0 || (os.consumosDiarios?.length > 0) || (os.fechamentosDia?.length > 0)

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6 flex-wrap">
        <button onClick={() => navigate('/ordens-servico')} className="btn-secondary">Voltar</button>
        <h1 className="text-xl font-bold text-gray-800">OS #{String(os.numero || '').padStart(3, '0')}</h1>
        <span className={`text-sm px-3 py-1 rounded-full ${statusCfg.color}`}>{statusCfg.label}</span>
        <div className="ml-auto flex gap-2 flex-wrap">
          {os.status === 'concluida' && (
            <>
              <a
                href={api.getOSPdfUrl(id)}
                target="_blank"
                rel="noopener noreferrer"
                className="bg-blue-600 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-blue-700 transition-colors"
              >
                📄 PDF da OS
              </a>
              <button
                onClick={() => { window.open(api.getGarantiaOSUrl(id), '_blank'); navigate('/garantias'); }}
                className="bg-green-600 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-green-700 transition-colors"
              >
                🏅 Garantia
              </button>
              <button
                onClick={() => navigate('/reparos', { state: { osOriginalId: id, osCliente: os.cliente, osPontos: os.pontos } })}
                className="bg-amber-600 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-amber-700 transition-colors"
              >
                🔧 Assistência Técnica
              </button>
            </>
          )}
          {!editing && (
            <>
              <button onClick={() => { setNovaEquipeId(os.equipeId || ''); setRedirecionarModal(true) }}
                className="bg-orange-50 text-orange-700 border border-orange-200 rounded-lg px-4 py-2 text-sm hover:bg-orange-100 transition-colors">
                🔀 Redirecionar Equipe
              </button>
              {/* Compartilhar Pontos movido para o PWA Aplicador */}
              <button onClick={() => { setEditData({ ...os }); setEditing(true) }} className="btn-secondary">✏️ Editar</button>
              {isAdmin && (
                <button onClick={() => setConfirmDelete(true)} className="bg-red-50 text-red-600 border border-red-200 rounded-lg px-4 py-2 text-sm hover:bg-red-100 transition-colors">🗑️ Excluir</button>
              )}
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
                <label className="label">Técnico Responsável</label>
                <select className="input" value={editData.tecnicoResponsavel || ''} onChange={e => setEditData(p => ({ ...p, tecnicoResponsavel: e.target.value }))}>
                  <option value="">Não designado</option>
                  {tecnicos.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
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
                ['Técnico', os.tecnicoResponsavel || null],
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
              {/* Histórico de equipes (quando OS foi redirecionada) */}
              {(os.historicoEquipes || []).length > 0 && (
                <div className="mt-3 pt-3 border-t border-gray-100">
                  <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                    🔀 Histórico de Equipes ({(os.historicoEquipes || []).length + 1} equipe{(os.historicoEquipes || []).length > 0 ? 's' : ''})
                  </div>
                  <div className="space-y-1">
                    {(os.historicoEquipes || []).map((h, i) => {
                      const de  = h.de  ? new Date(h.de ).toLocaleDateString('pt-BR') : '—'
                      const ate = h.ate ? new Date(h.ate).toLocaleDateString('pt-BR') : 'atual'
                      return (
                        <div key={i} className="flex items-center gap-2 text-xs">
                          <span className="w-5 h-5 rounded-full bg-gray-200 text-gray-600 flex items-center justify-center font-bold flex-shrink-0">{i+1}</span>
                          <span className="font-semibold text-gray-700">{h.equipeNome || h.equipeId}</span>
                          <span className="text-gray-400">{de} → {ate}</span>
                          {!h.ate && <span className="bg-green-100 text-green-700 px-1.5 rounded-full font-medium">atual</span>}
                        </div>
                      )
                    })}
                    {/* Equipe atual (se não estiver no histórico como entrada aberta) */}
                    {os.equipeNome && !(os.historicoEquipes || []).some(h => h.equipeId === os.equipeId && !h.ate) && (
                      <div className="flex items-center gap-2 text-xs">
                        <span className="w-5 h-5 rounded-full bg-orange-200 text-orange-700 flex items-center justify-center font-bold flex-shrink-0">
                          {(os.historicoEquipes || []).length + 1}
                        </span>
                        <span className="font-semibold text-gray-700">{os.equipeNome}</span>
                        <span className="bg-orange-100 text-orange-700 px-1.5 rounded-full font-medium">atual</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Equipes compartilhadas */}
              {(os.equipesAtribuidas || []).length > 0 && (
                <div className="mt-2">
                  <dt className="font-medium text-gray-500 text-xs mb-1">🤝 Pontos compartilhados:</dt>
                  {(os.equipesAtribuidas || []).map((ea, i) => (
                    <div key={i} className="text-xs bg-purple-50 text-purple-800 px-2 py-1 rounded mb-1">
                      <strong>{ea.equipeNome}</strong>: {(ea.pontos || []).map(pi => pontos[pi]?.nome || `Local ${pi+1}`).join(', ')}
                    </div>
                  ))}
                </div>
              )}
              {/* OS de reparo: referência à original */}
              {os.osOriginalId && (
                <div className="mt-2 p-2 bg-orange-50 rounded text-xs text-orange-700">
                  🔧 Reparo da OS #{os.osOriginalId.slice(-6)}
                  {os.tipoReparo && ` — ${os.tipoReparo}`}
                </div>
              )}
            </dl>
          )}

          {/* Fotos do Reparo */}
          {(os.fotosReparo || []).length > 0 && (
            <div className="mt-4">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">📷 Fotos do Problema</h3>
              <div className="grid grid-cols-3 gap-2">
                {(os.fotosReparo || []).map((f, i) => (
                  <a key={i} href={f.data || f} target="_blank" rel="noopener noreferrer">
                    <img src={f.data || f} alt={`Foto ${i+1}`}
                      className="w-full aspect-square object-cover rounded-lg border border-gray-200 hover:opacity-80 transition-opacity" />
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Progresso */}
        <div className="card md:col-span-2">
          <h2 className="font-semibold mb-3 text-primary">Progresso da Obra</h2>
          {temSubPontos ? (
            <div className="mb-3">
              <div className="flex items-center gap-4 mb-2">
                <div className="flex-1">
                  <div className="w-full bg-gray-200 rounded-full h-4 overflow-hidden">
                    <div
                      className="h-4 rounded-full transition-all duration-500"
                      style={{
                        width: `${progressoCalculado}%`,
                        background: progressoCalculado === 100 ? '#16a34a' : progressoCalculado >= 50 ? '#1a5c9a' : '#f59e0b'
                      }}
                    />
                  </div>
                  <div className="flex justify-between text-xs text-gray-400 mt-1">
                    <span>0%</span><span>25%</span><span>50%</span><span>75%</span><span>100%</span>
                  </div>
                </div>
                <div className="text-3xl font-bold text-primary w-16 text-center">{progressoCalculado}%</div>
              </div>
              <p className="text-xs text-gray-500">{feitosSubs} de {totalSubs} pontos executados pelo aplicador</p>
            </div>
          ) : (
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
          )}
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

        {/* Resumo de Fotos */}
        {pontos.length > 0 && (totalFotosAntes > 0 || totalFotosDepois > 0) && (
          <div className="card">
            <h2 className="font-semibold mb-3 text-primary">Registros Fotográficos</h2>
            <div className="grid grid-cols-2 gap-3">
              <div className="text-center p-3 bg-blue-50 rounded-lg">
                <div className="text-2xl font-bold text-blue-700">{totalFotosAntes}</div>
                <div className="text-xs text-blue-600 mt-1">Fotos Antes</div>
              </div>
              <div className="text-center p-3 bg-green-50 rounded-lg">
                <div className="text-2xl font-bold text-green-700">{totalFotosDepois}</div>
                <div className="text-xs text-green-600 mt-1">Fotos Depois</div>
              </div>
            </div>
          </div>
        )}

        {/* Consumo de Produto — TOTAL + DIÁRIO */}
        {showConsumo && (
          <div className="card md:col-span-2">
            <h2 className="font-semibold mb-3 text-primary">🧪 Consumo de GVF Seal</h2>

            {/* TOTAL DA OBRA */}
            <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Total da Obra</div>
            <div className="grid grid-cols-3 gap-3 mb-4">
              <div className="text-center p-3 bg-blue-50 rounded-lg">
                <div className="text-xl font-bold text-blue-700">{totalConsumoEstim.toLocaleString('pt-BR', { minimumFractionDigits: 1 })}L</div>
                <div className="text-xs text-blue-600 mt-1">Estimativa</div>
              </div>
              <div className="text-center p-3 bg-orange-50 rounded-lg">
                <div className="text-xl font-bold text-orange-700">{totalConsumoReal.toLocaleString('pt-BR', { minimumFractionDigits: 1 })}L</div>
                <div className="text-xs text-orange-600 mt-1">Realizado</div>
              </div>
              <div className={`text-center p-3 rounded-lg ${totalConsumoDif > 0 ? 'bg-red-50' : totalConsumoDif < 0 ? 'bg-green-50' : 'bg-gray-50'}`}>
                <div className={`text-xl font-bold ${totalConsumoDif > 0 ? 'text-red-700' : totalConsumoDif < 0 ? 'text-green-700' : 'text-gray-500'}`}>
                  {totalConsumoDif > 0 ? '+' : ''}{totalConsumoDif.toLocaleString('pt-BR', { minimumFractionDigits: 1 })}L
                </div>
                <div className={`text-xs mt-1 ${totalConsumoDif > 0 ? 'text-red-600' : totalConsumoDif < 0 ? 'text-green-600' : 'text-gray-400'}`}>
                  {totalConsumoDif > 0 ? 'Acima do previsto' : totalConsumoDif < 0 ? 'Abaixo do previsto' : 'No previsto'}
                </div>
              </div>
            </div>

            {/* CONSUMO POR DIA DE TRABALHO */}
            {diasConsumo.length > 0 && (
              <>
                <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Por Dia de Trabalho</div>
                <div className="border rounded-lg overflow-hidden mb-3">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="text-left px-3 py-2 text-gray-500 font-medium text-xs">Data</th>
                        <th className="text-left px-3 py-2 text-gray-500 font-medium text-xs">Membro</th>
                        <th className="text-right px-3 py-2 text-gray-500 font-medium text-xs">Estimativa</th>
                        <th className="text-right px-3 py-2 text-gray-500 font-medium text-xs">Realizado</th>
                        <th className="text-right px-3 py-2 text-gray-500 font-medium text-xs">Dif.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {diasConsumo.map((d, i) => (
                        <tr key={i} className="border-t border-gray-100">
                          <td className="px-3 py-2 text-gray-700 text-xs">
                            {new Date(d.data + 'T12:00:00').toLocaleDateString('pt-BR')}
                            {d.subsDia.length > 0 && (
                              <div className="text-[10px] text-gray-400">{d.subsDia.length} item(ns) executado(s)</div>
                            )}
                          </td>
                          <td className="px-3 py-2 text-xs text-gray-600">
                            {d.membro || '—'}
                            {!d.temFechamento && (
                              <span className="ml-1 text-amber-500 text-[10px]">⚠️ sem fechamento</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right text-xs text-blue-700 font-medium">{d.estimDia.toFixed(1)}L</td>
                          <td className="px-3 py-2 text-right text-xs font-medium text-orange-700">
                            {d.realDia > 0 ? `${d.realDia.toFixed(1)}L` : '—'}
                          </td>
                          <td className={`px-3 py-2 text-right text-xs font-medium ${d.difDia > 0.5 ? 'text-red-600' : d.difDia < -0.5 ? 'text-green-600' : 'text-gray-500'}`}>
                            {d.realDia > 0 ? `${d.difDia > 0 ? '+' : ''}${d.difDia.toFixed(1)}L` : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {/* LOG DE ENCERRAMENTOS */}
            {(os.fechamentosDia || []).length > 0 && (
              <>
                <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Encerramentos de Dia</div>
                <div className="space-y-1">
                  {[...(os.fechamentosDia || [])].sort((a, b) => (b.data > a.data ? 1 : -1)).map((f, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs bg-green-50 border border-green-100 rounded px-3 py-1.5">
                      <span className="text-green-600">✅</span>
                      <span className="font-medium text-gray-700">{new Date(f.data + 'T12:00:00').toLocaleDateString('pt-BR')}</span>
                      <span className="text-gray-400">·</span>
                      <span className="text-gray-600">{f.membro || 'Equipe'} encerrou o dia</span>
                      <span className="ml-auto font-semibold text-orange-700">{f.litros}L</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* Responsável pela Conclusão */}
        {os.status === 'concluida' && (os.nomeResponsavel || os.assinaturaResponsavel) && (
          <div className="card md:col-span-2">
            <h2 className="font-semibold mb-3 text-primary">✍️ Responsável pela Conclusão</h2>
            <div className="flex flex-col sm:flex-row gap-4 items-start">
              <div className="flex-1 space-y-2 text-sm">
                {os.nomeResponsavel && (
                  <div className="flex gap-2">
                    <span className="font-medium text-gray-500 w-20 flex-shrink-0">Nome:</span>
                    <span className="text-gray-800 font-semibold">{os.nomeResponsavel}</span>
                  </div>
                )}
                {os.cargoResponsavel && (
                  <div className="flex gap-2">
                    <span className="font-medium text-gray-500 w-20 flex-shrink-0">Cargo:</span>
                    <span className="text-gray-800">{os.cargoResponsavel}</span>
                  </div>
                )}
                {os.concluidaEm && (
                  <div className="flex gap-2">
                    <span className="font-medium text-gray-500 w-20 flex-shrink-0">Em:</span>
                    <span className="text-gray-800">{new Date(os.concluidaEm).toLocaleString('pt-BR')}</span>
                  </div>
                )}
              </div>
              {os.assinaturaResponsavel && (
                <div className="border border-gray-200 rounded-lg p-2 bg-gray-50">
                  <div className="text-xs text-gray-400 mb-1 text-center">Assinatura</div>
                  <img
                    src={os.assinaturaResponsavel}
                    alt="Assinatura do responsável"
                    className="h-20 object-contain bg-white rounded border border-gray-100"
                    style={{ minWidth: 160 }}
                  />
                </div>
              )}
            </div>
          </div>
        )}

        {/* Locais de Serviço com sub-pontos e fotos */}
        {pontos.length > 0 && (
          <div className="card md:col-span-2">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-primary">
                Locais de Serviço ({concluidos}/{pontos.length} concluídos)
              </h2>
              {temSubPontos ? (
                <div className="text-xs text-gray-500">
                  {feitosSubs}/{totalSubs} pontos executados ({progressoCalculado}%)
                </div>
              ) : concluidos > 0 ? (
                <div className="text-xs text-gray-500">
                  {Math.round((concluidos / pontos.length) * 100)}% executado
                </div>
              ) : null}
            </div>
            {/* Progress bar por sub-pontos */}
            {pontos.length > 0 && (
              <div className="mb-3">
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-green-500 h-2 rounded-full transition-all"
                    style={{ width: `${temSubPontos ? progressoCalculado : Math.round((concluidos / pontos.length) * 100)}%` }}
                  />
                </div>
              </div>
            )}
            <div className="space-y-2">
              {pontos.map((p, i) => (
                <LocalCard key={i} ponto={p} idx={i} />
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

      {/* Compartilhar Pontos Modal */}
      {compartilharModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 max-h-[90vh] flex flex-col">
            <h3 className="font-bold text-gray-800 mb-1 text-lg">🤝 Compartilhar Pontos</h3>
            <p className="text-gray-500 text-sm mb-4">Atribua locais específicos a outra equipe</p>
            <div className="overflow-auto flex-1 space-y-4">
              <div>
                <label className="label">Equipe destinatária</label>
                <select className="input" value={compEquipeId} onChange={e => setCompEquipeId(e.target.value)}>
                  <option value="">Selecione uma equipe</option>
                  {equipes.filter(e => e.ativa !== false && (e.id || e._id) !== os.equipeId).map(eq => (
                    <option key={eq.id || eq._id} value={eq.id || eq._id}>{eq.nome}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Locais a compartilhar</label>
                <div className="space-y-1 max-h-48 overflow-y-auto border rounded-lg p-2">
                  {pontos.map((p, i) => (
                    <label key={i} className={`flex items-center gap-2 p-2 rounded cursor-pointer ${compPontos.includes(i) ? 'bg-purple-50' : 'hover:bg-gray-50'}`}>
                      <input type="checkbox" className="accent-purple-600"
                        checked={compPontos.includes(i)}
                        onChange={e => setCompPontos(prev => e.target.checked ? [...prev, i] : prev.filter(x => x !== i))} />
                      <span className="text-sm">{p.nome || `Local ${i + 1}`}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Já atribuídos */}
              {(os.equipesAtribuidas || []).length > 0 && (
                <div>
                  <label className="label text-xs text-gray-500">Já compartilhados com:</label>
                  <div className="space-y-1">
                    {(os.equipesAtribuidas || []).map((ea, i) => (
                      <div key={i} className="text-xs bg-purple-50 text-purple-800 px-3 py-1.5 rounded flex justify-between">
                        <span>👷 {ea.equipeNome}</span>
                        <span>{(ea.pontos || []).map(pi => pontos[pi]?.nome || `L${pi+1}`).join(', ')}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {error && <div className="text-red-600 text-sm">{error}</div>}
            </div>
            <div className="flex gap-3 mt-4">
              <button onClick={() => setCompartilharModal(false)} className="flex-1 btn-secondary" disabled={compartilhando}>Cancelar</button>
              <button onClick={handleCompartilhar} className="flex-1 bg-purple-600 text-white rounded-lg py-2 font-medium hover:bg-purple-700 transition-colors" disabled={compartilhando}>
                {compartilhando ? 'Compartilhando...' : '🤝 Compartilhar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Redirecionar Equipe Modal */}
      {redirecionarModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-6">
            <h3 className="font-bold text-gray-800 mb-1 text-lg">🔀 Redirecionar Equipe</h3>
            <p className="text-gray-500 text-sm mb-4">
              Equipe atual: <strong>{os.equipeNome || 'Não atribuída'}</strong>
            </p>
            <label className="label">Nova equipe</label>
            <select
              className="input mb-4"
              value={novaEquipeId}
              onChange={e => setNovaEquipeId(e.target.value)}
            >
              <option value="">Sem equipe</option>
              {equipes.filter(e => e.ativa !== false).map(eq => (
                <option key={eq.id || eq._id} value={eq.id || eq._id}>{eq.nome}</option>
              ))}
            </select>
            {error && <div className="text-red-600 text-sm mb-3">{error}</div>}
            <div className="flex gap-3">
              <button onClick={() => setRedirecionarModal(false)} className="flex-1 btn-secondary" disabled={redirecionando}>Cancelar</button>
              <button onClick={handleRedirecionar} className="flex-1 bg-orange-600 text-white rounded-lg py-2 font-medium hover:bg-orange-700 transition-colors" disabled={redirecionando}>
                {redirecionando ? 'Salvando...' : '✅ Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
