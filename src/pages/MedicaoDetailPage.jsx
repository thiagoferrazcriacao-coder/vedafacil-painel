import React, { useEffect, useState, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { api } from '../api/client.js'
import { resolvePhotoSrc } from '../utils/photos.js'
import { useAuth } from '../App.jsx'

// Comprime imagem para base64 (máx 800px, qualidade 0.65)
function compressImage(file) {
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = (ev) => {
      const img = new Image()
      img.onload = () => {
        const MAX = 800
        let w = img.width, h = img.height
        if (w > MAX || h > MAX) {
          if (w > h) { h = Math.round(h * MAX / w); w = MAX }
          else       { w = Math.round(w * MAX / h); h = MAX }
        }
        const canvas = document.createElement('canvas')
        canvas.width = w; canvas.height = h
        canvas.getContext('2d').drawImage(img, 0, 0, w, h)
        resolve(canvas.toDataURL('image/jpeg', 0.65))
      }
      img.onerror = () => resolve(ev.target.result)
      img.src = ev.target.result
    }
    reader.readAsDataURL(file)
  })
}

const CAMPOS_MEDIDAS = ['trinca', 'juntaFria', 'ralo', 'juntaDilat', 'ferragem', 'cortina', 'juntaGerber']
const LABELS_MEDIDAS = {
  trinca: 'Trincas (m)', juntaFria: 'Juntas Frias (m)', ralo: 'Ralos (unid)',
  juntaDilat: 'Juntas Dilatação (m)', ferragem: 'Trat. Ferragens (m)', cortina: 'Cortina (m²)',
  juntaGerber: 'Juntas Gerber (m)'
}

function initNewLocal() {
  return { nome: '', andar: '', trinca: 0, juntaFria: 0, ralo: 0, juntaDilat: 0, ferragem: 0, cortina: 0, juntaGerber: 0, fotos: [] }
}

export default function MedicaoDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [medicao, setMedicao] = useState(null)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [editData, setEditData] = useState(null)
  const [saving, setSaving] = useState(false)
  const [savingFotos, setSavingFotos] = useState(false)
  const [showPartialModal, setShowPartialModal] = useState(false)
  const [selectedLocais, setSelectedLocais] = useState([])
  const [error, setError] = useState('')
  const [processandoAlteracao, setProcessandoAlteracao] = useState(false)
  const [lightbox, setLightbox] = useState(null) // { src, list, idx }
  const fileInputRefs = useRef({})

  // ── Adicionar local ──────────────────────────────────────────────────────────
  const [addingNewLocal, setAddingNewLocal] = useState(false)
  const [newLocal, setNewLocal] = useState(null)
  const [savingNewLocal, setSavingNewLocal] = useState(false)
  const newLocalFileRef = useRef(null)

  useEffect(() => {
    api.getMedicao(id)
      .then(data => { setMedicao(data); setEditData(data) })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [id])

  const handleEdit = () => {
    setEditData(JSON.parse(JSON.stringify(medicao))) // deep copy with fotos
    setEditing(true)
    setError('')
  }

  const handleCancelEdit = () => {
    setEditData(JSON.parse(JSON.stringify(medicao)))
    setEditing(false)
    setError('')
    setAddingNewLocal(false)
    setNewLocal(null)
  }

  const handleSave = async () => {
    setSaving(true)
    setError('')
    try {
      // Save photos separately (no orcamento restriction)
      await api.updateMedicaoFotos(id, editData.locais || [])
      // Save other data (will fail gracefully if orcamento already generated)
      try {
        const updated = await api.updateMedicao(id, editData)
        setMedicao(updated)
        setEditData(updated)
      } catch (putErr) {
        // If blocked by orcamento, still show success for photo update
        if (putErr.message?.includes('orçamento')) {
          const refetched = await api.getMedicao(id)
          setMedicao(refetched)
          setEditData(refetched)
        } else {
          throw putErr
        }
      }
      setEditing(false)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const updateField = (field, value) => {
    setEditData(prev => ({ ...prev, [field]: value }))
  }

  const updateLocal = (idx, field, value) => {
    const locais = [...(editData.locais || [])]
    locais[idx] = { ...locais[idx], [field]: value }
    setEditData(prev => ({ ...prev, locais }))
  }

  // ── Gerenciamento de fotos ───────────────────────────────────────────────
  const handleAddFotos = async (locIdx, files) => {
    if (!files || files.length === 0) return
    setSavingFotos(true)
    try {
      const compressed = await Promise.all(Array.from(files).map(f => compressImage(f)))
      const novas = compressed.map(data => ({ id: Date.now() + Math.random(), data }))
      setEditData(prev => {
        const locais = [...(prev.locais || [])]
        locais[locIdx] = {
          ...locais[locIdx],
          fotos: [...(locais[locIdx].fotos || []), ...novas]
        }
        return { ...prev, locais }
      })
    } finally {
      setSavingFotos(false)
    }
  }

  const handleRemoveFoto = (locIdx, fotoIdx) => {
    setEditData(prev => {
      const locais = [...(prev.locais || [])]
      const fotos = [...(locais[locIdx].fotos || [])]
      fotos.splice(fotoIdx, 1)
      locais[locIdx] = { ...locais[locIdx], fotos }
      return { ...prev, locais }
    })
  }

  // ── Adicionar Local ──────────────────────────────────────────────────────
  const handleOpenAddLocal = () => {
    setNewLocal(initNewLocal())
    setAddingNewLocal(true)
  }

  const handleNewLocalFotos = async (files) => {
    if (!files || files.length === 0) return
    const compressed = await Promise.all(Array.from(files).map(f => compressImage(f)))
    const novas = compressed.map(data => ({ id: Date.now() + Math.random(), data }))
    setNewLocal(prev => ({ ...prev, fotos: [...(prev.fotos || []), ...novas] }))
  }

  const handleRemoveNewLocalFoto = (idx) => {
    setNewLocal(prev => ({ ...prev, fotos: prev.fotos.filter((_, i) => i !== idx) }))
  }

  const handleSaveNewLocal = async () => {
    if (!newLocal.nome.trim()) { alert('Informe o nome do local.'); return }
    setSavingNewLocal(true)
    try {
      const updated = await api.adicionarLocalMedicao(id, newLocal)
      setMedicao(updated)
      setEditData(JSON.parse(JSON.stringify(updated)))
      setAddingNewLocal(false)
      setNewLocal(null)
    } catch (err) {
      alert('Erro ao adicionar local: ' + err.message)
    } finally {
      setSavingNewLocal(false)
    }
  }

  // ── Orçamento ────────────────────────────────────────────────────────────
  const handleIntegral = () => navigate(`/orcamentos/novo/${medicao.id}`)

  const handleReabrir = async () => {
    if (!confirm('Reabrir esta medição para que o medidor possa corrigir e reenviar?')) return
    try {
      await api.updateMedicaoStatus(medicao._id || medicao.id, 'reaberta')
      setMedicao(prev => ({ ...prev, status: 'reaberta' }))
    } catch (err) {
      alert('Erro ao reabrir: ' + err.message)
    }
  }

  const handleAceitarAlteracao = async () => {
    if (!confirm('Aceitar as alterações? Os dados da medição e do orçamento vinculado serão atualizados.')) return
    setProcessandoAlteracao(true)
    setError('')
    try {
      const res = await api.aceitarAlteracaoMedicao(medicao._id || medicao.id)
      if (res.ok) {
        setMedicao(prev => ({ ...prev, ...res.medicao, dadosAlterados: null, status: 'recebida' }))
        setEditData(prev => ({ ...prev, ...res.medicao, dadosAlterados: null, status: 'recebida' }))
        alert(res.orcamentoAtualizado
          ? '✅ Alterações aceitas! Medição e orçamento foram atualizados.'
          : '✅ Alterações aceitas! Medição atualizada.')
      }
    } catch (err) {
      if (err.message?.includes('bloqueado') || err.message?.includes('409')) {
        alert('⚠️ O orçamento desta medição já foi marcado como "Enviado ao Cliente". Não é possível aceitar alterações automaticamente.\n\nGere um novo orçamento com os dados atualizados.')
      } else {
        // tenta extrair o json do erro
        try {
          const parsed = JSON.parse(err.message)
          if (parsed?.bloqueado) {
            alert('⚠️ ' + parsed.error)
            return
          }
        } catch {}
        setError(err.message)
      }
    } finally {
      setProcessandoAlteracao(false)
    }
  }

  // fetch melhorado para capturar erros 409 com body
  const handleAceitarAlteracaoSafe = async () => {
    if (!confirm('Aceitar as alterações? Os dados da medição e do orçamento vinculado serão atualizados.')) return
    setProcessandoAlteracao(true)
    setError('')
    try {
      const token = localStorage.getItem('veda_token')
      const r = await fetch(`/api/medicoes/${medicao._id || medicao.id}/aceitar-alteracao`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }
      })
      const data = await r.json()
      if (!r.ok) {
        if (data.bloqueado) {
          alert('⚠️ ' + data.error)
        } else {
          setError(data.error || 'Erro ao aceitar alteração.')
        }
        return
      }
      setMedicao(prev => ({ ...prev, ...data.medicao, dadosAlterados: null, status: 'recebida' }))
      setEditData(prev => ({ ...prev, ...data.medicao, dadosAlterados: null, status: 'recebida' }))
      alert(data.orcamentoAtualizado
        ? '✅ Alterações aceitas! Medição e orçamento foram atualizados.'
        : '✅ Alterações aceitas! Medição atualizada.')
    } catch (err) {
      setError(err.message)
    } finally {
      setProcessandoAlteracao(false)
    }
  }

  const handleRecusarAlteracao = async () => {
    if (!confirm('Recusar as alterações? As mudanças enviadas pelo medidor serão descartadas e a medição voltará ao estado anterior.')) return
    setProcessandoAlteracao(true)
    setError('')
    try {
      const res = await api.recusarAlteracaoMedicao(medicao._id || medicao.id)
      if (res.ok) {
        setMedicao(prev => ({ ...prev, dadosAlterados: null, status: 'recebida' }))
        setEditData(prev => ({ ...prev, dadosAlterados: null, status: 'recebida' }))
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setProcessandoAlteracao(false)
    }
  }

  const handleParcial = () => {
    setSelectedLocais((medicao.locais || []).map((_, i) => i))
    setShowPartialModal(true)
  }

  const toggleLocalSelection = (idx) => {
    setSelectedLocais(prev =>
      prev.includes(idx) ? prev.filter(i => i !== idx) : [...prev, idx]
    )
  }

  const confirmarParcial = () => {
    if (selectedLocais.length === 0) { alert('Selecione pelo menos um local'); return }
    navigate(`/orcamentos/novo/${medicao.id}?locais=${selectedLocais.join(',')}`)
    setShowPartialModal(false)
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
    </div>
  )

  if (!medicao) return (
    <div className="p-6 text-center text-gray-500">Medição não encontrada</div>
  )

  const m = editing ? editData : medicao
  const CAMPOS_IGNORAR = ['nome', 'local', 'fotos', 'trinca', 'juntaFria', 'ralo', 'juntaDilat', 'ferragem', 'cortina', 'juntaGerber', 'mobilizacao', 'andar', 'adicionadoPor']
  const CAMPOS_QUANTIDADES = ['trinca', 'juntaFria', 'ralo', 'juntaDilat', 'ferragem', 'cortina', 'juntaGerber']
  const LABELS_QTDE = {
    trinca: 'Trincas (m)', juntaFria: 'Juntas Frias (m)', ralo: 'Ralos (unid)',
    juntaDilat: 'Juntas Dilatação (m)', ferragem: 'Trat. Ferragens (m)',
    cortina: 'Cortina (m²)', juntaGerber: 'Juntas Gerber (m)'
  }

  // Calcula diff para medições no status 'alterada'
  const dadosAlterados = medicao.dadosAlterados
  const diffLocais = (() => {
    if (!dadosAlterados?.locais) return []
    const orig = medicao.locais || []
    const novo = dadosAlterados.locais || []
    const linhas = []
    const maxLen = Math.max(orig.length, novo.length)
    for (let i = 0; i < maxLen; i++) {
      const a = orig[i]
      const b = novo[i]
      if (!a && b) { linhas.push({ tipo: 'novo', nome: b.nome || `Local ${i+1}`, campos: [] }); continue }
      if (a && !b) { linhas.push({ tipo: 'removido', nome: a.nome || `Local ${i+1}`, campos: [] }); continue }
      const campos = []
      CAMPOS_QUANTIDADES.forEach(c => {
        const va = Array.isArray(a[c]) ? a[c].reduce((s,x)=>s+parseFloat(x||0),0) : parseFloat(a[c]||0)
        const vb = Array.isArray(b[c]) ? b[c].reduce((s,x)=>s+parseFloat(x||0),0) : parseFloat(b[c]||0)
        if (va !== vb) campos.push({ campo: LABELS_QTDE[c] || c, de: va, para: vb })
      })
      if (campos.length > 0) linhas.push({ tipo: 'mudou', nome: a.nome || b.nome || `Local ${i+1}`, campos })
    }
    return linhas
  })()

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6 flex-wrap">
        <button onClick={() => navigate('/medicoes')} className="btn-secondary">
          Voltar
        </button>
        <h1 className="text-xl font-bold text-gray-800">
          Medição #{String(medicao.numeroMedicao || '').padStart(3, '0')}
        </h1>
        <div className="ml-auto flex gap-2 flex-wrap">
          {!editing && (
            <>
              {medicao.status === 'recebida' && (
                <button onClick={handleReabrir} className="btn-secondary text-amber-700 border-amber-300 hover:bg-amber-50">
                  🔓 Reabrir
                </button>
              )}
              <button onClick={handleEdit} className="btn-secondary">
                ✏️ Editar
              </button>
              <button onClick={handleParcial} className="btn-secondary">
                📋 Usar Parcial
              </button>
              <button onClick={handleIntegral} className="btn-primary">
                ✅ Usar Integral
              </button>
            </>
          )}
          {editing && (
            <>
              <button onClick={handleCancelEdit} className="btn-secondary" disabled={saving}>
                Cancelar
              </button>
              <button onClick={handleSave} className="btn-primary" disabled={saving || savingFotos}>
                {saving ? 'Salvando...' : '💾 Salvar'}
              </button>
            </>
          )}
        </div>
      </div>

      {error && (
        <div className="bg-red-50 text-red-700 border border-red-200 rounded-lg p-3 mb-4 text-sm">{error}</div>
      )}

      {/* ── Banner de medição ALTERADA ─────────────────────────────────────────── */}
      {medicao.status === 'alterada' && dadosAlterados && (
        <div className="mb-5 border-2 border-red-400 rounded-xl overflow-hidden shadow-md">
          {/* Header */}
          <div className="bg-red-600 text-white px-5 py-3 flex items-center gap-3">
            <span className="text-xl">⚠️</span>
            <div className="flex-1">
              <div className="font-bold text-base">Medição Alterada — Aguarda Revisão</div>
              <div className="text-red-100 text-xs mt-0.5">
                O medidor <strong>{dadosAlterados.user || medicao.user || 'Medidor'}</strong> reenviou esta medição com alterações. Confira abaixo e decida.
              </div>
            </div>
          </div>

          {/* Diff */}
          <div className="bg-red-50 px-5 py-4">
            {diffLocais.length === 0 ? (
              <p className="text-sm text-gray-600 italic">Sem alterações detectadas nos locais. Verifique os detalhes.</p>
            ) : (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Alterações detectadas:</p>
                {diffLocais.map((d, i) => (
                  <div key={i} className={`rounded-lg px-4 py-2.5 text-sm border ${
                    d.tipo === 'novo' ? 'bg-green-50 border-green-200 text-green-800' :
                    d.tipo === 'removido' ? 'bg-red-100 border-red-200 text-red-800' :
                    'bg-amber-50 border-amber-200 text-amber-900'
                  }`}>
                    <span className="font-semibold">{d.tipo === 'novo' ? '➕' : d.tipo === 'removido' ? '➖' : '✏️'} {d.nome}</span>
                    {d.tipo === 'mudou' && d.campos.length > 0 && (
                      <ul className="mt-1 ml-4 space-y-0.5">
                        {d.campos.map((c, j) => (
                          <li key={j} className="text-xs">
                            {c.campo}: <span className="line-through text-gray-500">{c.de}</span> → <span className="font-bold text-amber-700">{c.para}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                    {d.tipo === 'novo' && <span className="text-xs ml-2">(local novo)</span>}
                    {d.tipo === 'removido' && <span className="text-xs ml-2">(local removido)</span>}
                  </div>
                ))}
              </div>
            )}

            {/* Campos de texto alterados */}
            {(() => {
              const CAMPOS_TEXTO = [
                ['cliente', 'Cliente'], ['endereco', 'Endereço'], ['bairro', 'Bairro'],
                ['cidade', 'Cidade'], ['cep', 'CEP'], ['celular', 'Celular'],
                ['ac', 'AC'], ['obs', 'Observação'], ['garantia', 'Garantia'],
                ['andaime', 'Andaime'],
              ]
              const diffs = CAMPOS_TEXTO.filter(([k]) => {
                const a = String(medicao[k] || '')
                const b = String(dadosAlterados[k] || '')
                return a !== b && (a || b)
              })
              if (!diffs.length) return null
              return (
                <div className="mt-3">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Dados do cliente/identificação:</p>
                  <div className="grid sm:grid-cols-2 gap-1.5">
                    {diffs.map(([k, label]) => (
                      <div key={k} className="bg-white rounded px-3 py-1.5 text-xs border border-amber-200">
                        <span className="font-medium text-gray-600">{label}:</span>{' '}
                        <span className="line-through text-gray-400">{medicao[k] || '—'}</span>
                        {' → '}
                        <span className="font-bold text-amber-700">{dadosAlterados[k] || '—'}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })()}
          </div>

          {/* Botões de ação */}
          <div className="bg-white border-t border-red-200 px-5 py-3 flex gap-3 items-center flex-wrap">
            <button
              disabled={processandoAlteracao}
              onClick={handleAceitarAlteracaoSafe}
              className="flex items-center gap-2 bg-green-600 text-white rounded-lg px-5 py-2 font-bold text-sm hover:bg-green-700 disabled:opacity-50 transition-colors"
            >
              {processandoAlteracao ? '⏳ Processando...' : '✅ ACEITAR ALTERAÇÃO'}
            </button>
            <button
              disabled={processandoAlteracao}
              onClick={handleRecusarAlteracao}
              className="flex items-center gap-2 bg-red-600 text-white rounded-lg px-5 py-2 font-bold text-sm hover:bg-red-700 disabled:opacity-50 transition-colors"
            >
              {processandoAlteracao ? '...' : '❌ RECUSAR ALTERAÇÃO'}
            </button>
            <p className="text-xs text-gray-500 italic flex-1">
              Se aceitar e houver orçamento marcado como "Enviado ao Cliente", o sistema irá bloquear e sugerir um novo orçamento.
            </p>
          </div>
        </div>
      )}

      {editing && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4 text-sm text-blue-700">
          ✏️ Modo de edição — altere dados, adicione ou remova fotos, e clique em Salvar
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-4">
        {/* Dados do Cliente */}
        <div className="card">
          <h2 className="font-semibold mb-3 text-primary">Cliente</h2>
          {editing ? (
            <div className="space-y-3">
              {[
                ['cliente', 'Nome / Condomínio'],
                ['ac', 'AC (Responsável)'],
                ['endereco', 'Endereço'],
                ['bairro', 'Bairro'],
                ['cidade', 'Cidade'],
                ['cep', 'CEP'],
                ['celular', 'Celular'],
              ].map(([field, label]) => (
                <div key={field}>
                  <label className="label">{label}</label>
                  <input
                    className="input"
                    value={editData[field] || editData[field === 'cliente' ? 'nomeCliente' : field === 'celular' ? 'telefone' : field] || ''}
                    onChange={e => updateField(field, e.target.value)}
                  />
                </div>
              ))}
              <div>
                <label className="label">Garantia</label>
                <div className="flex gap-4 mt-1">
                  {[['15', '15 anos'], ['7', '7 anos']].map(([val, lbl]) => (
                    <label key={val} className="flex items-center gap-2 cursor-pointer">
                      <input type="radio" name="edit-garantia" value={val}
                        checked={String(editData.garantia || '15') === val}
                        onChange={() => updateField('garantia', val)}
                        className="accent-primary" />
                      <span className="text-sm">{lbl}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <label className="label">Andaime necessário?</label>
                <div className="flex gap-4 mt-1">
                  {[['nao', 'Não'], ['sim', 'Sim']].map(([val, lbl]) => (
                    <label key={val} className="flex items-center gap-2 cursor-pointer">
                      <input type="radio" name="edit-andaime" value={val}
                        checked={(editData.andaime || 'nao') === val}
                        onChange={() => updateField('andaime', val)}
                        className="accent-primary" />
                      <span className="text-sm">{lbl}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <label className="label">Observações</label>
                <textarea
                  className="input min-h-[60px] resize-y"
                  value={editData.obs || ''}
                  onChange={e => updateField('obs', e.target.value)}
                />
              </div>
            </div>
          ) : (
            <dl className="space-y-2 text-sm">
              {[
                ['Nome', m.cliente || m.nomeCliente],
                ['AC', m.ac],
                ['Endereço', m.endereco],
                ['Bairro', m.bairro],
                ['Cidade', m.cidade],
                ['CEP', m.cep],
                ['Celular', m.celular || m.telefone],
                ['Garantia', m.garantia ? `${m.garantia} anos` : null],
                ['Andaime', m.andaime === 'sim' ? `Sim${m.andaimeMetros > 0 ? ` — ${m.andaimeMetros}m` : ''}` : null],
                ['Obs', m.obs]
              ].map(([k, v]) => v ? (
                <div key={k} className="flex gap-2">
                  <dt className="font-medium text-gray-500 w-24 flex-shrink-0">{k}:</dt>
                  <dd className="text-gray-800">{v}</dd>
                </div>
              ) : null)}
            </dl>
          )}
        </div>

        {/* Informações */}
        <div className="card">
          <h2 className="font-semibold mb-3 text-primary">Informações</h2>
          <dl className="space-y-2 text-sm">
            {[
              ['Medidor', medicao.user || medicao.medidor],
              ['Data', (medicao.createdAt || medicao.receivedAt) ? new Date(medicao.createdAt || medicao.receivedAt).toLocaleString('pt-BR') : null],
              ['Status', medicao.status],
              ['Locais', Array.isArray(medicao.locais) ? `${medicao.locais.length} locais` : null],
              ['Fotos', (() => { const n = (medicao.locais||[]).reduce((a,l) => a + (l.fotos||[]).length, 0); return n > 0 ? `${n} fotos` : null })()]
            ].map(([k, v]) => v ? (
              <div key={k} className="flex gap-2">
                <dt className="font-medium text-gray-500 w-24 flex-shrink-0">{k}:</dt>
                <dd className="text-gray-800 capitalize">{v}</dd>
              </div>
            ) : null)}
          </dl>
        </div>

        {/* Locais */}
        {(Array.isArray(m.locais) && m.locais.length > 0 || editing) && (
          <div className="card md:col-span-2">
            <h2 className="font-semibold mb-3 text-primary">Locais Medidos</h2>
            <div className="grid sm:grid-cols-2 gap-3">
              {(m.locais || []).map((local, i) => (
                <div key={i} className="bg-gray-50 rounded-lg p-3 text-sm">
                  {editing ? (
                    <div className="mb-2 space-y-2">
                      <div>
                        <label className="text-xs text-gray-500 font-medium uppercase tracking-wide">Nome do Local</label>
                        <input
                          className="input py-1 text-sm font-medium mt-0.5"
                          value={local.nome || local.local || ''}
                          onChange={e => updateLocal(i, 'nome', e.target.value)}
                          placeholder={`Local ${i + 1}`}
                        />
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 font-medium uppercase tracking-wide">Andar</label>
                        <input
                          className="input py-1 text-sm mt-0.5"
                          value={local.andar || ''}
                          onChange={e => updateLocal(i, 'andar', e.target.value)}
                          placeholder="ex: Subsolo 1, Térreo, 5º Andar…"
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="font-medium mb-2 text-gray-700">
                      {local.andar && <div className="text-xs text-gray-400 font-normal">🏢 {local.andar}</div>}
                      <div className="flex items-center gap-2 flex-wrap">
                        <span>{local.nome || local.local || `Local ${i + 1}`}</span>
                        {local.adicionadoPor && (
                          <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">
                            ✏️ adicionado por {local.adicionadoPor}
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                  {CAMPOS_QUANTIDADES.map(campo => {
                    const val = local[campo]
                    if (!editing && (!val || val === 0)) return null
                    if (!editing) return (
                      <div key={campo} className="text-gray-600">
                        <span className="font-medium">{LABELS_QTDE[campo]}:</span>{' '}
                        {Array.isArray(val) ? val.join(' + ') + ` = ${val.reduce((a,b)=>a+parseFloat(b||0),0)}` : val}
                      </div>
                    )
                    return (
                      <div key={campo} className="mb-1">
                        <label className="text-xs text-gray-500">{LABELS_QTDE[campo]}</label>
                        <input
                          type="number"
                          className="input py-1 text-sm"
                          value={Array.isArray(local[campo]) ? local[campo].reduce((a,b)=>a+parseFloat(b||0),0) : (local[campo] || 0)}
                          onChange={e => updateLocal(i, campo, parseFloat(e.target.value) || 0)}
                        />
                      </div>
                    )
                  })}
                  {!editing && Object.entries(local)
                    .filter(([k]) => !CAMPOS_IGNORAR.includes(k))
                    .map(([k, v]) => (
                      <div key={k} className="text-gray-500">
                        <span className="font-medium">{k}:</span> {String(v)}
                      </div>
                    ))
                  }
                </div>
              ))}
            </div>

            {/* ── Adicionar novo local (inline, só no modo edição) ─────────── */}
            {editing && (
              <div className="mt-4 border-t pt-4">
                {!addingNewLocal ? (
                  <button
                    type="button"
                    onClick={handleOpenAddLocal}
                    className="w-full border-2 border-dashed border-green-300 rounded-lg py-3 text-green-700 hover:border-green-400 hover:bg-green-50 text-sm font-medium transition-colors flex items-center justify-center gap-2"
                  >
                    ➕ Adicionar novo local
                  </button>
                ) : (
                  <div className="bg-green-50 border-2 border-green-200 rounded-xl p-4 space-y-3">
                    <h3 className="text-sm font-bold text-green-800 mb-1">Novo Local</h3>

                    {/* Nome e Andar */}
                    <div className="grid sm:grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs text-gray-500 font-medium uppercase tracking-wide">Nome do Local *</label>
                        <input className="input py-1 text-sm mt-0.5" placeholder="Ex: Garagem subsolo 2"
                          value={newLocal?.nome || ''}
                          onChange={e => setNewLocal(p => ({ ...p, nome: e.target.value }))} />
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 font-medium uppercase tracking-wide">Andar</label>
                        <input className="input py-1 text-sm mt-0.5" placeholder="ex: Subsolo 1, Térreo, 5º Andar…"
                          value={newLocal?.andar || ''}
                          onChange={e => setNewLocal(p => ({ ...p, andar: e.target.value }))} />
                      </div>
                    </div>

                    {/* Medidas */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {CAMPOS_MEDIDAS.map(campo => (
                        <div key={campo}>
                          <label className="text-xs text-gray-500">{LABELS_MEDIDAS[campo]}</label>
                          <input type="number" min="0" step="0.01" className="input py-1 text-sm"
                            value={newLocal?.[campo] || 0}
                            onChange={e => setNewLocal(p => ({ ...p, [campo]: parseFloat(e.target.value) || 0 }))} />
                        </div>
                      ))}
                    </div>

                    {/* Fotos */}
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-gray-500 font-medium uppercase tracking-wide">
                          Fotos ({(newLocal?.fotos || []).length})
                        </span>
                        <div>
                          <input type="file" accept="image/*" multiple capture="environment" style={{ display: 'none' }}
                            ref={newLocalFileRef}
                            onChange={e => { handleNewLocalFotos(e.target.files); e.target.value = '' }} />
                          <button type="button" onClick={() => newLocalFileRef.current?.click()}
                            className="text-xs bg-white text-indigo-700 border border-indigo-200 rounded-lg px-3 py-1 hover:bg-indigo-50 font-medium">
                            📷 + Adicionar Fotos
                          </button>
                        </div>
                      </div>
                      {(newLocal?.fotos || []).length > 0 && (
                        <div className="grid grid-cols-4 sm:grid-cols-6 gap-1.5 mt-1">
                          {newLocal.fotos.map((foto, fi) => (
                            <div key={fi} className="relative group">
                              <img src={resolvePhotoSrc(foto.data || foto)} alt={`Foto ${fi+1}`}
                                className="w-full aspect-square object-cover rounded" />
                              <button type="button" onClick={() => handleRemoveNewLocalFoto(fi)}
                                className="absolute top-0.5 right-0.5 w-4 h-4 bg-red-500 text-white rounded-full text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity leading-none">
                                ×
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Botões */}
                    <div className="flex gap-2 pt-1">
                      <button type="button"
                        onClick={() => { setAddingNewLocal(false); setNewLocal(null) }}
                        className="btn-secondary text-sm py-1.5 px-3" disabled={savingNewLocal}>
                        Cancelar
                      </button>
                      <button type="button"
                        onClick={handleSaveNewLocal}
                        disabled={savingNewLocal || !newLocal?.nome?.trim()}
                        className="btn-primary text-sm py-1.5 px-4 disabled:opacity-50">
                        {savingNewLocal ? '⏳ Salvando...' : '✅ Adicionar Local'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── Fotos ─────────────────────────────────────────────────────────── */}
        {editing ? (
          /* Modo edição: fotos editáveis por local */
          <div className="card md:col-span-2">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-primary">📷 Fotos por Local</h2>
              <span className="text-xs text-gray-400">Clique × para remover · botão + para adicionar</span>
            </div>
            {(editData?.locais || []).map((local, li) => (
              <div key={li} className="mb-5">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-semibold text-gray-700">
                    {local.nome || `Local ${li + 1}`}
                    <span className="font-normal text-gray-400 ml-1">({(local.fotos || []).length} foto{(local.fotos||[]).length !== 1 ? 's' : ''})</span>
                  </h3>
                  {/* Input file oculto */}
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    style={{ display: 'none' }}
                    ref={el => fileInputRefs.current[li] = el}
                    onChange={e => { handleAddFotos(li, e.target.files); e.target.value = '' }}
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRefs.current[li]?.click()}
                    disabled={savingFotos}
                    className="flex items-center gap-1.5 text-xs bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-lg px-3 py-1.5 hover:bg-indigo-100 transition-colors font-medium"
                  >
                    {savingFotos ? '⏳' : '📷'} + Adicionar Fotos
                  </button>
                </div>

                {(local.fotos || []).length === 0 ? (
                  <div className="border-2 border-dashed border-gray-200 rounded-lg py-6 text-center text-gray-400 text-xs">
                    Nenhuma foto — clique em "+ Adicionar Fotos" para incluir
                  </div>
                ) : (
                  <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
                    {(local.fotos || []).map((foto, fi) => (
                      <div key={fi} className="relative group">
                        <img
                          src={resolvePhotoSrc(foto.data || foto.url || foto)}
                          alt={`Foto ${fi + 1}`}
                          className="w-full aspect-square object-cover rounded-lg"
                        />
                        <button
                          type="button"
                          onClick={() => handleRemoveFoto(li, fi)}
                          className="absolute top-1 right-1 w-5 h-5 bg-red-500 text-white rounded-full text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600 leading-none"
                          title="Remover foto"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          /* Modo visualização: fotos estáticas */
          (medicao.locais || []).some(l => l.fotos && l.fotos.length > 0) && (
            <div className="card md:col-span-2">
              <h2 className="font-semibold mb-3 text-primary">Fotos por Local</h2>
              {(medicao.locais || []).filter(l => l.fotos && l.fotos.length > 0).map((local, li) => (
                <div key={li} className="mb-4">
                  <h3 className="text-sm font-medium text-gray-600 mb-2">
                    {local.nome || `Local ${li+1}`} ({local.fotos.length} fotos)
                  </h3>
                  <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
                    {local.fotos.map((foto, i) => {
                      const src = resolvePhotoSrc(foto.data || foto.url || foto)
                      const list = local.fotos.map(f => resolvePhotoSrc(f.data || f.url || f))
                      return (
                        <img key={i} src={src} alt={`Foto ${i+1}`}
                          className="w-full aspect-square object-cover rounded-lg cursor-pointer hover:opacity-90 transition-opacity"
                          onClick={() => setLightbox({ src, list, idx: i })} />
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          )
        )}
      </div>

      {/* Lightbox de fotos */}
      {lightbox && (
        <div
          className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center"
          onClick={() => setLightbox(null)}
          onKeyDown={e => {
            if (e.key === 'Escape') setLightbox(null)
            if (e.key === 'ArrowRight') setLightbox(lb => lb.idx < lb.list.length - 1 ? { ...lb, idx: lb.idx + 1, src: lb.list[lb.idx + 1] } : lb)
            if (e.key === 'ArrowLeft') setLightbox(lb => lb.idx > 0 ? { ...lb, idx: lb.idx - 1, src: lb.list[lb.idx - 1] } : lb)
          }}
          tabIndex={0}
          style={{ outline: 'none' }}
          ref={el => el && el.focus()}
        >
          {/* Fechar */}
          <button
            className="absolute top-4 right-4 text-white/80 hover:text-white bg-black/40 rounded-full w-10 h-10 flex items-center justify-center text-2xl z-10"
            onClick={() => setLightbox(null)}
          >×</button>

          {/* Anterior */}
          {lightbox.idx > 0 && (
            <button
              className="absolute left-4 top-1/2 -translate-y-1/2 text-white/80 hover:text-white bg-black/40 rounded-full w-10 h-10 flex items-center justify-center text-2xl z-10"
              onClick={e => { e.stopPropagation(); setLightbox(lb => ({ ...lb, idx: lb.idx - 1, src: lb.list[lb.idx - 1] })) }}
            >‹</button>
          )}

          {/* Próximo */}
          {lightbox.idx < lightbox.list.length - 1 && (
            <button
              className="absolute right-4 top-1/2 -translate-y-1/2 text-white/80 hover:text-white bg-black/40 rounded-full w-10 h-10 flex items-center justify-center text-2xl z-10"
              onClick={e => { e.stopPropagation(); setLightbox(lb => ({ ...lb, idx: lb.idx + 1, src: lb.list[lb.idx + 1] })) }}
            >›</button>
          )}

          {/* Imagem */}
          <img
            src={lightbox.src}
            alt={`Foto ${lightbox.idx + 1}`}
            className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg shadow-2xl"
            onClick={e => e.stopPropagation()}
          />

          {/* Contador */}
          {lightbox.list.length > 1 && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/50 text-white text-sm px-3 py-1 rounded-full">
              {lightbox.idx + 1} / {lightbox.list.length}
            </div>
          )}
        </div>
      )}

      {/* Modal Seleção Parcial */}
      {showPartialModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full max-h-[80vh] flex flex-col">
            <div className="p-5 border-b">
              <h2 className="text-lg font-bold text-gray-800">Seleção Parcial de Locais</h2>
              <p className="text-sm text-gray-500 mt-1">
                Selecione os locais que farão parte do orçamento
              </p>
            </div>

            <div className="p-5 overflow-auto flex-1">
              <div className="flex justify-between mb-3">
                <button
                  className="text-xs text-primary underline"
                  onClick={() => setSelectedLocais((medicao.locais||[]).map((_,i)=>i))}
                >
                  Selecionar todos
                </button>
                <button
                  className="text-xs text-gray-500 underline"
                  onClick={() => setSelectedLocais([])}
                >
                  Limpar seleção
                </button>
              </div>
              <div className="space-y-2">
                {(medicao.locais || []).map((local, i) => {
                  const isSelected = selectedLocais.includes(i)
                  const CAMPOS_QT = ['trinca','juntaFria','ralo','juntaDilat','ferragem','cortina','juntaGerber']
                  const totais = CAMPOS_QT.filter(c => local[c] && local[c] !== 0)
                    .map(c => {
                      const v = local[c]
                      const qt = Array.isArray(v) ? v.reduce((a,b)=>a+parseFloat(b||0),0) : parseFloat(v||0)
                      return `${qt} ${LABELS_QTDE[c]?.match(/\((.*?)\)/)?.[1] || ''}`
                    })
                  return (
                    <label key={i}
                      className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                        isSelected ? 'border-primary bg-blue-50' : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <input
                        type="checkbox"
                        className="mt-0.5 accent-primary"
                        checked={isSelected}
                        onChange={() => toggleLocalSelection(i)}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-gray-800 text-sm">
                          {local.nome || local.local || `Local ${i + 1}`}
                        </div>
                        {totais.length > 0 && (
                          <div className="text-xs text-gray-500 mt-0.5">{totais.join(' · ')}</div>
                        )}
                      </div>
                    </label>
                  )
                })}
              </div>
            </div>

            <div className="p-5 border-t flex gap-3 justify-end">
              <button onClick={() => setShowPartialModal(false)} className="btn-secondary">
                Cancelar
              </button>
              <button onClick={confirmarParcial} className="btn-primary">
                Gerar Orçamento ({selectedLocais.length} locais)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
