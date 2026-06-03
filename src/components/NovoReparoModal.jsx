import React, { useEffect, useState } from 'react'
import { api } from '../api/client.js'

const STATUS_CONFIG = {
  agendada:              { label: 'Agendada',           color: 'bg-blue-100 text-blue-700' },
  em_andamento:          { label: 'Em Andamento',       color: 'bg-yellow-100 text-yellow-700' },
  aguardando_assinatura: { label: 'Aguard. Assinatura', color: 'bg-orange-100 text-orange-700' },
  concluida:             { label: 'Concluída',          color: 'bg-green-100 text-green-700' },
  cancelada:             { label: 'Cancelada',          color: 'bg-red-100 text-red-700' },
}

// Modal completo de Novo Reparo — Step 1 (selecionar OS + locais + sub-itens executados)
// e Step 2 (descrever problema + foto do cliente + equipe).
// Usado tanto em ReparosPage quanto em OrdensServicoPage (quando ?tipo=reparo).
export default function NovoReparoModal({ onClose, onCreated, preloadOS }) {
  const [step, setStep] = useState(1)
  const [busca, setBusca] = useState('')
  const [osList, setOsList] = useState([])
  const [loadingOS, setLoadingOS] = useState(false)
  const [osSelecionada, setOSSelecionada] = useState(preloadOS || null)
  const [pontosIdx, setPontosIdx] = useState([])
  const [itensSelecionados, setItensSelecionados] = useState({})
  const [pontosExpandidos, setPontosExpandidos] = useState(new Set())
  const [equipes, setEquipes] = useState([])
  const [form, setForm] = useState({
    tipoReparo: '',
    equipeId: '',
    dataInicio: '',
    obs: '',
  })
  const [fotos, setFotos] = useState([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handleFotoAdd = (e) => {
    const files = Array.from(e.target.files)
    files.forEach(file => {
      const reader = new FileReader()
      reader.onload = ev => setFotos(prev => [...prev, { data: ev.target.result, name: file.name }])
      reader.readAsDataURL(file)
    })
    e.target.value = ''
  }

  const removeFoto = (idx) => setFotos(prev => prev.filter((_, i) => i !== idx))

  useEffect(() => {
    setLoadingOS(true)
    Promise.all([
      api.getOrdensServico(),
      api.getEquipes(),
    ]).then(([oss, eqs]) => {
      setOsList(oss.filter(o => ['concluida', 'em_andamento'].includes(o.status)))
      setEquipes(eqs)
    }).catch(console.error)
      .finally(() => setLoadingOS(false))
  }, [])

  const osFiltradas = busca.trim()
    ? osList.filter(o =>
        (o.cliente  || '').toLowerCase().includes(busca.toLowerCase()) ||
        (o.endereco || '').toLowerCase().includes(busca.toLowerCase()) ||
        String(o.numero || '').includes(busca)
      )
    : osList

  const pontos = osSelecionada?.pontos || []

  const handleSubmit = async () => {
    if (!osSelecionada) return
    if (!form.tipoReparo.trim()) { setError('Descreva o tipo de reparo'); return }
    if (pontos.length > 0 && pontosIdx.length === 0) {
      setError('Selecione ao menos um local para o reparo')
      return
    }
    setSaving(true); setError('')
    try {
      const itensSelecionadosPayload = pontosIdx.length > 0
        ? pontosIdx
            .filter(i => itensSelecionados[i]?.length > 0)
            .map(i => ({ pontoIdx: i, subPontosIdx: itensSelecionados[i] }))
        : []
      const payload = {
        osOriginalId: osSelecionada.id || osSelecionada._id,
        pontosIdx: pontosIdx.length > 0 ? pontosIdx : undefined,
        itensSelecionados: itensSelecionadosPayload.length > 0 ? itensSelecionadosPayload : undefined,
        tipoReparo: form.tipoReparo,
        equipeId: form.equipeId || undefined,
        dataInicio: form.dataInicio || undefined,
        obs: form.obs || undefined,
        fotosReparo: fotos.map(f => f.data),
      }
      const novaOS = await api.createReparoFromOS(payload)
      if (onCreated) onCreated(novaOS)
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
        <div className="p-5 border-b flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-800">🔧 Novo Reparo / Assistência Técnica</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
        </div>

        <div className="overflow-auto flex-1 p-5 space-y-4">
          {error && <div className="bg-red-50 text-red-700 border border-red-200 rounded p-3 text-sm">{error}</div>}

          {/* Step 1: Selecionar OS + Locais + Sub-itens */}
          {step === 1 && (
            <>
              <div>
                <label className="label">Buscar OS de origem</label>
                <input className="input" value={busca} onChange={e => setBusca(e.target.value)}
                  placeholder="Cliente, endereço ou número..." />
              </div>

              {loadingOS ? (
                <div className="text-center py-4 text-gray-500 text-sm">Carregando...</div>
              ) : osFiltradas.length === 0 ? (
                <div className="text-center py-4 text-gray-500 text-sm">Nenhuma OS encontrada</div>
              ) : (
                <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                  {osFiltradas.map(os => {
                    const id = os.id || os._id
                    const selecionada = (osSelecionada?.id || osSelecionada?._id) === id
                    return (
                      <div key={id}
                        onClick={() => { setOSSelecionada(os); setPontosIdx([]) }}
                        className={`p-3 rounded-lg border cursor-pointer transition-all ${selecionada ? 'border-primary bg-blue-50' : 'border-gray-200 hover:border-gray-400'}`}>
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="font-medium text-sm text-gray-800">
                              OS #{String(os.numero || '').padStart(3, '0')} — {os.cliente}
                            </div>
                            {os.endereco && <div className="text-xs text-gray-500 mt-0.5">{os.endereco}{os.cidade ? `, ${os.cidade}` : ''}</div>}
                          </div>
                          <span className={`text-xs px-2 py-0.5 rounded-full ml-2 flex-shrink-0 ${STATUS_CONFIG[os.status]?.color || 'bg-gray-100 text-gray-600'}`}>
                            {STATUS_CONFIG[os.status]?.label || os.status}
                          </span>
                        </div>
                        {selecionada && (
                          <div className="text-xs text-primary mt-1 font-medium">✓ Selecionada</div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}

              {osSelecionada && pontos.length > 0 && (
                <div className="mt-2">
                  <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-2">
                    <p className="text-xs font-semibold text-amber-800">⚠️ Selecione obrigatoriamente os locais com problema</p>
                    <p className="text-xs text-amber-700 mt-0.5">Apenas os locais marcados aparecerão para a equipe no aplicador</p>
                  </div>
                  <p className="text-sm font-medium text-gray-700 mb-2">Locais e itens do reparo:</p>
                  <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
                    {pontos.map((p, i) => {
                      const checked = pontosIdx.includes(i)
                      const expanded = pontosExpandidos.has(i)
                      const subPontos = p.subPontos || []
                      const tiposSelecionados = itensSelecionados[i] || []
                      const fotosRef = [...(p.fotosMedicao || []), ...(p.fotosRef || []), ...(p.fotos || [])].slice(0, 3)

                      const togglePonto = (e) => {
                        e.stopPropagation()
                        setPontosIdx(prev => prev.includes(i) ? prev.filter(x => x !== i) : [...prev, i])
                        if (!checked && subPontos.length > 0) {
                          setPontosExpandidos(prev => { const n = new Set(prev); n.add(i); return n })
                        }
                      }
                      const toggleExpand = (e) => {
                        e.stopPropagation()
                        setPontosExpandidos(prev => { const n = new Set(prev); n.has(i) ? n.delete(i) : n.add(i); return n })
                      }
                      const toggleTipo = (si, e) => {
                        e.stopPropagation()
                        setItensSelecionados(prev => {
                          const atual = prev[i] || []
                          return { ...prev, [i]: atual.includes(si) ? atual.filter(t => t !== si) : [...atual, si] }
                        })
                      }

                      return (
                        <div key={i} className={`rounded-lg border transition-all ${checked ? 'border-primary bg-blue-50' : 'border-gray-200 bg-white'}`}>
                          <div className="flex gap-2 p-2.5 cursor-pointer" onClick={togglePonto}>
                            <input type="checkbox" checked={checked} onChange={() => {}} className="accent-primary mt-0.5 flex-shrink-0" />
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium text-gray-800">{p.nome || `Local ${i + 1}`}</div>
                              {tiposSelecionados.length > 0 && (
                                <div className="text-[10px] text-primary font-medium mt-0.5">
                                  Itens: {tiposSelecionados.map(si => subPontos[si]?.desc || `#${si}`).join(', ')}
                                </div>
                              )}
                              {fotosRef.length > 0 && (
                                <div className="flex gap-1 mt-1">
                                  {fotosRef.map((f, fi) => {
                                    const src = typeof f === 'object' ? (f.thumb || f.full || f.data || '') : (f || '')
                                    if (!src) return null
                                    return <img key={fi} src={src} alt="" className="w-9 h-9 object-cover rounded border border-gray-200" />
                                  })}
                                </div>
                              )}
                            </div>
                            {subPontos.length > 0 && (
                              <button
                                className="text-xs text-gray-400 hover:text-gray-600 flex-shrink-0 px-1"
                                onClick={toggleExpand}>
                                {expanded ? '▲' : '▼'} {subPontos.length} itens
                              </button>
                            )}
                          </div>

                          {expanded && checked && subPontos.length > 0 && (
                            <div className="border-t border-blue-100 px-3 py-2 space-y-1 bg-blue-50/50">
                              <p className="text-[10px] text-gray-500 mb-1">Selecione os itens com problema (deixe tudo desmarcado = todos):</p>
                              {subPontos.map((sp, si) => {
                                const tipoChecked = tiposSelecionados.includes(si)
                                return (
                                  <label key={si}
                                    className={`flex items-center gap-2 px-2 py-1 rounded cursor-pointer text-xs transition-colors ${tipoChecked ? 'bg-orange-100 text-orange-800' : 'hover:bg-white text-gray-600'}`}
                                    onClick={e => toggleTipo(si, e)}>
                                    <input type="checkbox" checked={tipoChecked} onChange={() => {}} className="accent-primary" />
                                    <span className="flex-1">{sp.desc}</span>
                                    {sp.feito && <span className="text-green-600 font-bold">✓</span>}
                                  </label>
                                )
                              })}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                  {pontosIdx.length > 0 ? (
                    <p className="text-xs text-primary font-medium mt-1.5">✓ {pontosIdx.length} local(is) selecionado(s)</p>
                  ) : (
                    <p className="text-xs text-red-500 font-medium mt-1.5">⚠ Selecione ao menos um local para continuar</p>
                  )}
                </div>
              )}

              <div className="flex justify-end gap-3 pt-2">
                <button onClick={onClose} className="btn-secondary">Cancelar</button>
                <button
                  onClick={() => { if (!osSelecionada) return; if (pontos.length > 0 && pontosIdx.length === 0) { setError('Selecione ao menos um local para o reparo'); return; } setError(''); setStep(2) }}
                  disabled={!osSelecionada}
                  className="btn-primary disabled:opacity-50">
                  Próximo →
                </button>
              </div>
            </>
          )}

          {/* Step 2: Detalhes do reparo */}
          {step === 2 && (
            <>
              <div className="bg-blue-50 rounded-lg p-3 text-sm text-blue-800">
                <div className="font-medium">OS de origem:</div>
                <div>OS #{String(osSelecionada.numero || '').padStart(3, '0')} — {osSelecionada.cliente}</div>
                {pontosIdx.length > 0
                  ? <div className="text-xs mt-1">Locais: {pontosIdx.map(i => pontos[i]?.nome || `Local ${i + 1}`).join(', ')}</div>
                  : <div className="text-xs mt-1 text-blue-600">Todos os locais incluídos</div>
                }
              </div>

              <div>
                <label className="label">Tipo de reparo / problema *</label>
                <input className="input" value={form.tipoReparo}
                  onChange={e => setForm(f => ({ ...f, tipoReparo: e.target.value }))}
                  placeholder="Ex: Trinca reabriu no corredor, Ralo com vazamento..." />
              </div>

              <div>
                <label className="label">Equipe responsável</label>
                <select className="input" value={form.equipeId} onChange={e => setForm(f => ({ ...f, equipeId: e.target.value }))}>
                  <option value="">— Selecionar equipe —</option>
                  {equipes.map(eq => (
                    <option key={eq.id || eq._id} value={eq.id || eq._id}>{eq.nome}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="label">Data de início</label>
                <input type="date" className="input" value={form.dataInicio}
                  onChange={e => setForm(f => ({ ...f, dataInicio: e.target.value }))} />
              </div>

              <div>
                <label className="label">Observações</label>
                <textarea className="input" rows={3} value={form.obs}
                  onChange={e => setForm(f => ({ ...f, obs: e.target.value }))}
                  placeholder="Informações adicionais sobre o reparo..." />
              </div>

              <div>
                <label className="label">Fotos do problema <span className="text-gray-400 font-normal">(envio do cliente)</span></label>
                <div className="grid grid-cols-3 gap-2 mb-2">
                  {fotos.map((f, i) => (
                    <div key={i} className="relative aspect-square">
                      <img src={f.data} alt="" className="w-full h-full object-cover rounded-lg border border-gray-200" />
                      <button
                        type="button"
                        onClick={() => removeFoto(i)}
                        className="absolute top-0.5 right-0.5 bg-red-500 text-white rounded-full w-5 h-5 text-xs flex items-center justify-center hover:bg-red-600">
                        ×
                      </button>
                    </div>
                  ))}
                  <label className="aspect-square flex flex-col items-center justify-center border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-primary hover:bg-orange-50 transition-colors">
                    <span className="text-2xl mb-1">📷</span>
                    <span className="text-xs text-gray-500">Adicionar</span>
                    <input type="file" accept="image/*,video/*" multiple className="hidden" onChange={handleFotoAdd} />
                  </label>
                </div>
                <p className="text-xs text-gray-400">Aceita fotos e vídeos. As mídias ficarão registradas na OS de reparo.</p>
              </div>

              <div className="flex justify-between gap-3 pt-2">
                <button onClick={() => setStep(1)} className="btn-secondary">← Voltar</button>
                <button onClick={handleSubmit} disabled={saving} className="btn-primary disabled:opacity-50">
                  {saving ? 'Criando...' : '🔧 Criar OS de Reparo'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
