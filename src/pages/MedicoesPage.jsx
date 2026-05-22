import React, { useEffect, useState, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api/client.js'
import { useAuth } from '../App.jsx'
import { resolvePhotoSrc } from '../utils/photos.js'
import { useBadges } from '../components/Layout.jsx'

// ── Tipos de serviço (igual ao PWA medidor) ───────────────────────────────────
const SERVICE_TYPES = [
  { key: 'trinca',     label: 'Trincas',              unit: 'm'   },
  { key: 'juntaFria',  label: 'Juntas Frias',         unit: 'm'   },
  { key: 'ralo',       label: 'Ralos',                unit: 'unid'},
  { key: 'juntaDilat', label: 'Juntas de Dilatação',  unit: 'm'   },
  { key: 'ferragem',   label: 'Tratam. de Ferragens', unit: 'm'   },
  { key: 'cortina',    label: 'Cortinas',             unit: 'm²'  },
]

function novoLocal() {
  return {
    nome: '', andar: '', fotos: [],
    trincaDetalhe: [''], juntaFriaDetalhe: [''], raloDetalhe: [''],
    juntaDilatDetalhe: [''], ferragemDetalhe: [''],
    cortinaSegmentos: [{ largura: '', altura: '' }],
  }
}

function sumDetalhe(arr) {
  return (arr || ['']).reduce((s, v) => s + (parseFloat(v) || 0), 0)
}

function sumCortina(segs) {
  return (segs || []).reduce((s, seg) => s + (parseFloat(seg.largura) || 0) * (parseFloat(seg.altura) || 0), 0)
}

// Comprime imagem para base64 (máx 900px, qualidade 0.7)
function compressImage(file) {
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = (ev) => {
      const img = new Image()
      img.onload = () => {
        let w = img.width, h = img.height
        const MAX = 900
        if (w > MAX || h > MAX) {
          if (w > h) { h = Math.round(h * MAX / w); w = MAX }
          else { w = Math.round(w * MAX / h); h = MAX }
        }
        const canvas = document.createElement('canvas')
        canvas.width = w; canvas.height = h
        canvas.getContext('2d').drawImage(img, 0, 0, w, h)
        resolve(canvas.toDataURL('image/jpeg', 0.7))
      }
      img.onerror = () => resolve(ev.target.result)
      img.src = ev.target.result
    }
    reader.readAsDataURL(file)
  })
}

// ── Componente: card de um local ──────────────────────────────────────────────
function LocalCard({ local, idx, onChange, onRemove }) {
  const updField = (field, val) => onChange(idx, { ...local, [field]: val })

  const updDetalhe = (stKey, rowIdx, val) => {
    const arr = [...(local[stKey + 'Detalhe'] || [''])]
    arr[rowIdx] = val
    onChange(idx, { ...local, [stKey + 'Detalhe']: arr })
  }
  const addDetalhe = (stKey) => {
    const arr = [...(local[stKey + 'Detalhe'] || ['']), '']
    onChange(idx, { ...local, [stKey + 'Detalhe']: arr })
  }
  const removeDetalhe = (stKey, rowIdx) => {
    const arr = [...(local[stKey + 'Detalhe'] || [''])]
    arr.splice(rowIdx, 1)
    onChange(idx, { ...local, [stKey + 'Detalhe']: arr })
  }

  const updCortina = (segIdx, field, val) => {
    const segs = (local.cortinaSegmentos || [{ largura: '', altura: '' }]).map((s, i) =>
      i === segIdx ? { ...s, [field]: val } : s)
    onChange(idx, { ...local, cortinaSegmentos: segs })
  }
  const addCortina = () => onChange(idx, { ...local, cortinaSegmentos: [...(local.cortinaSegmentos || []), { largura: '', altura: '' }] })
  const removeCortina = (segIdx) => {
    const segs = (local.cortinaSegmentos || []).filter((_, i) => i !== segIdx)
    onChange(idx, { ...local, cortinaSegmentos: segs.length ? segs : [{ largura: '', altura: '' }] })
  }

  const photoInputRef = useRef()
  const handlePhotos = async (e) => {
    const files = Array.from(e.target.files)
    if (!files.length) return
    const compressed = await Promise.all(files.map(compressImage))
    onChange(idx, { ...local, fotos: [...(local.fotos || []), ...compressed] })
    e.target.value = ''
  }
  const removePhoto = (fi) => {
    const fotos = [...(local.fotos || [])]
    fotos.splice(fi, 1)
    onChange(idx, { ...local, fotos })
  }

  const totalFotos = (local.fotos || []).length

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden mb-3">
      {/* Andar */}
      <div className="flex items-center gap-2 bg-gray-50 border-b px-3 py-2">
        <span className="text-base">🏢</span>
        <input
          className="flex-1 text-xs bg-transparent border-none outline-none text-gray-600 placeholder-gray-400"
          placeholder="Andar (ex: Subsolo 1, Térreo, 5º Andar…)"
          value={local.andar || ''}
          onChange={e => updField('andar', e.target.value)}
        />
      </div>

      {/* Header do local */}
      <div className="flex items-center gap-2 bg-primary/10 px-3 py-2 border-b">
        <div className="w-6 h-6 rounded-full bg-primary text-white text-xs font-bold flex items-center justify-center flex-shrink-0">
          {idx + 1}
        </div>
        <input
          className="flex-1 text-sm font-semibold bg-transparent border-none outline-none placeholder-gray-400 text-gray-800"
          placeholder={['Ex: Vaga 301','Ex: Telhado bloco A','Ex: Subsolo nível -1','Ex: Fachada norte'][idx % 4]}
          value={local.nome || ''}
          onChange={e => updField('nome', e.target.value)}
        />
        <button onClick={() => onRemove(idx)} className="text-red-400 hover:text-red-600 text-lg leading-none ml-1" title="Remover local">✕</button>
      </div>

      {/* Serviços */}
      <div className="p-3 space-y-3">
        <div className="grid grid-cols-2 gap-3">
          {SERVICE_TYPES.filter(st => st.key !== 'cortina').map(st => {
            const detail = local[st.key + 'Detalhe'] || ['']
            const total = sumDetalhe(detail)
            return (
              <div key={st.key} className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-gray-600">{st.label} <span className="text-gray-400">({st.unit})</span></span>
                  {total > 0 && <span className="text-xs font-bold text-primary">= {total % 1 === 0 ? total : total.toFixed(2)}{st.unit}</span>}
                </div>
                {detail.map((v, ri) => (
                  <div key={ri} className="flex items-center gap-1">
                    <input
                      type="number" min="0" step="0.01"
                      className="input py-1 text-sm flex-1"
                      placeholder="0"
                      value={v}
                      onChange={e => updDetalhe(st.key, ri, e.target.value)}
                    />
                    {detail.length > 1 && (
                      <button onClick={() => removeDetalhe(st.key, ri)} className="text-red-400 hover:text-red-600 text-base leading-none w-5 flex-shrink-0">×</button>
                    )}
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => addDetalhe(st.key)}
                  className="text-xs text-primary hover:text-primary/80 font-medium"
                >+ adicionar</button>
              </div>
            )
          })}
        </div>

        {/* Cortinas */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-medium text-gray-600">Cortinas <span className="text-gray-400">(m²)</span></span>
            {sumCortina(local.cortinaSegmentos) > 0 && (
              <span className="text-xs font-bold text-primary">= {sumCortina(local.cortinaSegmentos).toFixed(2).replace(/\.?0+$/, '')}m²</span>
            )}
          </div>
          {(local.cortinaSegmentos || [{ largura: '', altura: '' }]).map((seg, si) => (
            <div key={si} className="flex items-center gap-1 mb-1">
              <input
                type="number" min="0" step="0.01"
                className="input py-1 text-sm flex-1"
                placeholder="Larg."
                value={seg.largura}
                onChange={e => updCortina(si, 'largura', e.target.value)}
              />
              <span className="text-gray-400 text-xs">×</span>
              <input
                type="number" min="0" step="0.01"
                className="input py-1 text-sm flex-1"
                placeholder="Alt."
                value={seg.altura}
                onChange={e => updCortina(si, 'altura', e.target.value)}
              />
              {(local.cortinaSegmentos || []).length > 1 && (
                <button onClick={() => removeCortina(si)} className="text-red-400 hover:text-red-600 text-base leading-none w-5">×</button>
              )}
            </div>
          ))}
          <button type="button" onClick={addCortina} className="text-xs text-primary hover:text-primary/80 font-medium">+ segmento</button>
        </div>

        {/* Fotos */}
        <div>
          <div className="text-xs font-medium text-gray-600 mb-2">📷 Fotos deste local</div>
          <input ref={photoInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handlePhotos} />
          <button
            type="button"
            onClick={() => photoInputRef.current?.click()}
            className="w-full border-2 border-dashed border-gray-300 hover:border-primary rounded-lg py-2 text-sm text-gray-500 hover:text-primary transition-colors"
          >
            + Adicionar foto{totalFotos > 0 ? ` (${totalFotos})` : ''}
          </button>
          {totalFotos > 0 && (
            <div className="grid grid-cols-4 gap-1 mt-2">
              {(local.fotos || []).map((foto, fi) => (
                <div key={fi} className="relative group">
                  <img
                    src={resolvePhotoSrc(foto.data || foto)}
                    alt=""
                    className="w-full aspect-square object-cover rounded"
                  />
                  <button
                    type="button"
                    onClick={() => removePhoto(fi)}
                    className="absolute top-0.5 right-0.5 w-4 h-4 bg-red-500 text-white rounded-full text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity leading-none"
                  >×</button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Modal principal — 3 etapas ────────────────────────────────────────────────
function NovaMedicaoModal({ onClose, onCreated }) {
  const todayIso = () => new Date().toISOString().slice(0, 10)
  const EMPTY_FORM = {
    dataMedicao: todayIso(),
    cliente: '', ac: '', celular: '', endereco: '', bairro: '', cidade: '', cep: '',
    garantia: '15',
    andaime: 'nao', andaimeMetros: '', andaimeRodinhas: false, andaimeBases: false, andaimeLargura: '1m',
    obs: '',
    locais: [novoLocal()],
  }
  const [step, setStep] = useState(1)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [cepLoading, setCepLoading] = useState(false)

  const upd = (field, val) => setForm(prev => ({ ...prev, [field]: val !== undefined ? val : prev[field] }))
  const updE = (field) => (e) => upd(field, e.target.value)

  // CEP auto-fill
  const handleCep = async (e) => {
    const cep = e.target.value.replace(/\D/g, '')
    upd('cep', e.target.value)
    if (cep.length === 8) {
      setCepLoading(true)
      try {
        const r = await fetch(`https://viacep.com.br/ws/${cep}/json/`)
        const d = await r.json()
        if (!d.erro) {
          setForm(prev => ({
            ...prev,
            endereco: d.logradouro ? `${d.logradouro}` : prev.endereco,
            bairro: d.bairro || prev.bairro,
            cidade: d.localidade || prev.cidade,
          }))
        }
      } catch {}
      setCepLoading(false)
    }
  }

  // Locais
  const updateLocal = (idx, updated) => setForm(prev => ({
    ...prev, locais: prev.locais.map((l, i) => i === idx ? updated : l)
  }))
  const addLocal = () => setForm(prev => ({ ...prev, locais: [...prev.locais, novoLocal()] }))
  const removeLocal = (idx) => setForm(prev => ({
    ...prev, locais: prev.locais.length > 1 ? prev.locais.filter((_, i) => i !== idx) : prev.locais
  }))

  // Validação etapa 1
  const validateStep1 = () => {
    if (!form.cliente.trim()) { setError('Informe o nome do cliente.'); return false }
    setError(''); return true
  }

  const handleSubmit = async () => {
    if (!form.cliente.trim()) { setError('Informe o nome do cliente.'); return }
    setSaving(true); setError('')
    try {
      // Montar locais no mesmo formato do PWA
      const locais = form.locais.map(l => ({
        nome: l.nome, andar: l.andar || '',
        trinca: sumDetalhe(l.trincaDetalhe), trincaDetalhe: l.trincaDetalhe,
        juntaFria: sumDetalhe(l.juntaFriaDetalhe), juntaFriaDetalhe: l.juntaFriaDetalhe,
        ralo: sumDetalhe(l.raloDetalhe), raloDetalhe: l.raloDetalhe,
        juntaDilat: sumDetalhe(l.juntaDilatDetalhe), juntaDilatDetalhe: l.juntaDilatDetalhe,
        ferragem: sumDetalhe(l.ferragemDetalhe), ferragemDetalhe: l.ferragemDetalhe,
        cortina: sumCortina(l.cortinaSegmentos), cortinaSegmentos: l.cortinaSegmentos,
        fotos: l.fotos || [],
      }))
      const payload = {
        ...form,
        locais,
        garantia: String(form.garantia),
        andaimeMetros: parseFloat(form.andaimeMetros) || 0,
        dataMedicao: form.dataMedicao || todayIso(),
      }
      const result = await api.createMedicaoManual(payload)
      onCreated(result)
      onClose()
    } catch (err) {
      setError(err.message)
      setSaving(false)
    }
  }

  // Resumo do passo 3
  const totalFotos = form.locais.reduce((s, l) => s + (l.fotos || []).length, 0)
  const totalLocais = form.locais.length
  const totais = SERVICE_TYPES.map(st => {
    const total = st.key === 'cortina'
      ? form.locais.reduce((s, l) => s + sumCortina(l.cortinaSegmentos), 0)
      : form.locais.reduce((s, l) => s + sumDetalhe(l[st.key + 'Detalhe']), 0)
    return { ...st, total }
  }).filter(st => st.total > 0)

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-3">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[95vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b flex-shrink-0">
          <div>
            <h2 className="font-bold text-gray-800">Nova Medição Manual</h2>
            <div className="flex gap-1 mt-1">
              {['Dados', 'Locais', 'Resumo'].map((label, i) => (
                <div key={i} className={`flex items-center gap-1 text-xs ${i < step - 1 ? 'text-green-600' : i === step - 1 ? 'text-primary font-semibold' : 'text-gray-400'}`}>
                  <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${i < step - 1 ? 'bg-green-100 text-green-600' : i === step - 1 ? 'bg-primary text-white' : 'bg-gray-100 text-gray-400'}`}>
                    {i < step - 1 ? '✓' : i + 1}
                  </span>
                  {label}
                  {i < 2 && <span className="text-gray-300 mx-1">›</span>}
                </div>
              ))}
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
        </div>

        {/* Conteúdo */}
        <div className="flex-1 overflow-y-auto p-4">
          {error && <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">{error}</div>}

          {/* ── Etapa 1: Dados do cliente ── */}
          {step === 1 && (
            <div className="space-y-3">
              {/* Data da medição */}
              <div className="bg-primary/5 border border-primary/20 rounded-xl p-3">
                <label className="label text-primary font-semibold">📅 Data da Medição</label>
                <div className="flex items-center gap-2 mt-1.5">
                  <button
                    type="button"
                    onClick={() => upd('dataMedicao', todayIso())}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold border-2 transition-colors ${form.dataMedicao === todayIso() ? 'bg-primary text-white border-primary' : 'bg-white text-gray-500 border-gray-300 hover:border-primary hover:text-primary'}`}
                  >
                    Hoje
                  </button>
                  <input
                    type="date"
                    className="input py-1.5 text-sm flex-1"
                    value={form.dataMedicao}
                    onChange={updE('dataMedicao')}
                    max={todayIso()}
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 mb-1">
                <div className="w-1 h-5 bg-primary rounded-full" />
                <h3 className="font-semibold text-gray-700 text-sm">Dados do Cliente</h3>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <label className="label">CEP</label>
                  <div className="relative">
                    <input className="input pr-8" value={form.cep} onChange={handleCep} placeholder="00000-000" maxLength={9} />
                    {cepLoading && <span className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 text-xs">⟳</span>}
                  </div>
                </div>
                <div />
              </div>

              <div>
                <label className="label">Cliente / Condomínio *</label>
                <input className="input" value={form.cliente} onChange={updE('cliente')} placeholder="Ex: Condomínio Solar" autoFocus />
              </div>
              <div>
                <label className="label">Endereço</label>
                <input className="input" value={form.endereco} onChange={updE('endereco')} placeholder="Rua, número" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Bairro</label>
                  <input className="input" value={form.bairro} onChange={updE('bairro')} />
                </div>
                <div>
                  <label className="label">Cidade</label>
                  <input className="input" value={form.cidade} onChange={updE('cidade')} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Responsável (síndico/zelador)</label>
                  <input className="input" value={form.ac} onChange={updE('ac')} placeholder="Nome do responsável" />
                </div>
                <div>
                  <label className="label">Celular do Responsável</label>
                  <input className="input" value={form.celular} onChange={updE('celular')} placeholder="(00) 00000-0000" />
                </div>
              </div>

              {/* Garantia */}
              <div>
                <label className="label">Garantia</label>
                <div className="flex gap-3 mt-1">
                  {[['15','🛡️ 15 anos'],['7','🛡️ 7 anos']].map(([v,l]) => (
                    <label key={v} className={`flex items-center gap-2 cursor-pointer text-sm px-3 py-2 rounded-lg border-2 transition-colors ${form.garantia===v ? 'border-primary bg-primary/5 text-primary font-semibold' : 'border-gray-200 text-gray-600'}`}>
                      <input type="radio" className="hidden" checked={form.garantia===v} onChange={() => upd('garantia', v)} />
                      {l}
                    </label>
                  ))}
                </div>
              </div>

              {/* Andaime */}
              <div>
                <label className="label">Precisa de andaime?</label>
                <div className="flex gap-3 mt-1">
                  {[['nao','✅ Não'],['sim','🏗️ Sim']].map(([v,l]) => (
                    <label key={v} className={`flex items-center gap-2 cursor-pointer text-sm px-3 py-2 rounded-lg border-2 transition-colors ${form.andaime===v ? 'border-primary bg-primary/5 text-primary font-semibold' : 'border-gray-200 text-gray-600'}`}>
                      <input type="radio" className="hidden" checked={form.andaime===v} onChange={() => upd('andaime', v)} />
                      {l}
                    </label>
                  ))}
                </div>
              </div>

              {/* Detalhes andaime */}
              {form.andaime === 'sim' && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-3">
                  <div>
                    <label className="label text-amber-800">Metros de andaime</label>
                    <input type="number" min="0" step="0.5" className="input" value={form.andaimeMetros} onChange={updE('andaimeMetros')} placeholder="Ex: 30" />
                  </div>
                  <div className="flex gap-4">
                    <label className="flex items-center gap-2 cursor-pointer text-sm text-amber-800">
                      <input type="checkbox" checked={form.andaimeRodinhas} onChange={e => upd('andaimeRodinhas', e.target.checked)} className="accent-primary" />
                      Rodinhas
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer text-sm text-amber-800">
                      <input type="checkbox" checked={form.andaimeBases} onChange={e => upd('andaimeBases', e.target.checked)} className="accent-primary" />
                      Bases Ajustáveis
                    </label>
                  </div>
                  <div>
                    <label className="label text-amber-800">Largura do andaime</label>
                    <div className="flex gap-3 mt-1">
                      {[['1m','1m'],['1.5m','1,5m']].map(([v,l]) => (
                        <label key={v} className={`flex items-center gap-2 cursor-pointer text-sm px-3 py-1.5 rounded-lg border-2 transition-colors ${form.andaimeLargura===v ? 'border-amber-500 bg-amber-100 font-semibold' : 'border-gray-200 text-gray-600'}`}>
                          <input type="radio" className="hidden" checked={form.andaimeLargura===v} onChange={() => upd('andaimeLargura', v)} />
                          {l}
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Etapa 2: Locais ── */}
          {step === 2 && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-1 h-5 bg-primary rounded-full" />
                  <h3 className="font-semibold text-gray-700 text-sm">Levantamento por Local ({form.locais.length})</h3>
                </div>
                <button
                  type="button"
                  onClick={addLocal}
                  className="flex items-center gap-1 px-3 py-1.5 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90"
                >
                  + Novo Local
                </button>
              </div>

              {form.locais.map((local, idx) => (
                <LocalCard
                  key={idx}
                  local={local}
                  idx={idx}
                  onChange={updateLocal}
                  onRemove={removeLocal}
                />
              ))}

              <button
                type="button"
                onClick={addLocal}
                className="w-full border-2 border-dashed border-primary/40 rounded-xl py-3 text-primary font-medium text-sm hover:bg-primary/5 transition-colors mt-1"
              >
                + Adicionar outro local
              </button>
            </div>
          )}

          {/* ── Etapa 3: Resumo ── */}
          {step === 3 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 mb-1">
                <div className="w-1 h-5 bg-primary rounded-full" />
                <h3 className="font-semibold text-gray-700 text-sm">Resumo da Medição</h3>
              </div>

              <div className="bg-gray-50 rounded-xl p-4 space-y-2 text-sm">
                <div className="font-semibold text-gray-800 text-base">{form.cliente}</div>
                {form.endereco && <div className="text-gray-600">{form.endereco}{form.bairro ? `, ${form.bairro}` : ''}{form.cidade ? ` — ${form.cidade}` : ''}</div>}
                {form.ac && <div className="text-gray-600">👤 {form.ac}{form.celular ? ` · ${form.celular}` : ''}</div>}
                <div className="flex gap-3 pt-1">
                  <span className="px-2 py-0.5 bg-primary/10 text-primary rounded text-xs font-medium">🛡️ Garantia {form.garantia} anos</span>
                  {form.andaime === 'sim' && <span className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded text-xs font-medium">🏗️ Andaime {form.andaimeMetros || '?'}m</span>}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="bg-blue-50 rounded-xl p-3 text-center">
                  <div className="text-2xl font-bold text-blue-700">{totalLocais}</div>
                  <div className="text-blue-600 text-xs">local{totalLocais !== 1 ? 'is' : ''}</div>
                </div>
                <div className="bg-green-50 rounded-xl p-3 text-center">
                  <div className="text-2xl font-bold text-green-700">{totalFotos}</div>
                  <div className="text-green-600 text-xs">foto{totalFotos !== 1 ? 's' : ''}</div>
                </div>
              </div>

              {totais.length > 0 && (
                <div className="bg-gray-50 rounded-xl p-3">
                  <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Quantidades</div>
                  <div className="space-y-1.5">
                    {totais.map(st => (
                      <div key={st.key} className="flex justify-between text-sm">
                        <span className="text-gray-600">{st.label}</span>
                        <span className="font-semibold text-gray-800">{st.total % 1 === 0 ? st.total : st.total.toFixed(2)}{st.unit}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Locais sem nome */}
              {form.locais.some(l => !l.nome.trim()) && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-700 text-sm">
                  ⚠️ {form.locais.filter(l => !l.nome.trim()).length} local(is) sem nome — serão salvos como "Local N"
                </div>
              )}

              <div>
                <label className="label">Observações</label>
                <textarea
                  className="input min-h-[80px] resize-y"
                  value={form.obs}
                  onChange={updE('obs')}
                  placeholder="Observações adicionais sobre a vistoria..."
                />
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-between gap-3 p-4 border-t flex-shrink-0">
          <button
            onClick={step === 1 ? onClose : () => { setError(''); setStep(s => s - 1) }}
            className="btn-secondary"
            disabled={saving}
          >
            {step === 1 ? 'Cancelar' : '← Voltar'}
          </button>
          <div className="flex gap-2">
            {step < 3 && (
              <button
                onClick={() => {
                  if (step === 1 && !validateStep1()) return
                  setError(''); setStep(s => s + 1)
                }}
                className="btn-primary"
              >
                Próximo →
              </button>
            )}
            {step === 3 && (
              <button onClick={handleSubmit} className="btn-primary" disabled={saving}>
                {saving ? '⟳ Criando...' : '✓ Criar Medição'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

const STATUS_COLORS = {
  recebida:  'bg-green-100 text-green-800',
  reaberta:  'bg-amber-100 text-amber-800',
  alterada:  'bg-red-100 text-red-700 font-bold animate-pulse',
  pendente:  'bg-yellow-100 text-yellow-800',
  em_andamento: 'bg-blue-100 text-blue-800',
  concluido: 'bg-green-100 text-green-800',
  cancelado: 'bg-red-100 text-red-800'
}

const STATUS_LABELS = {
  recebida:  'Recebida',
  reaberta:  'Reaberta',
  alterada:  '⚠️ Alterada',
  pendente:  'Pendente',
  em_andamento: 'Em Andamento',
  concluido: 'Concluído',
  cancelado: 'Cancelado'
}

export default function MedicoesPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { refreshBadges } = useBadges()
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
                        {m.status === 'alterada' ? (
                          <button
                            className="text-xs py-1 px-3 rounded-lg bg-red-600 text-white font-bold hover:bg-red-700 animate-pulse"
                            onClick={(e) => { e.stopPropagation(); navigate(`/medicoes/${m.id}`) }}
                          >
                            ⚠️ Ver Alterações
                          </button>
                        ) : !m.temOrcamento ? (
                          <button
                            className="btn-primary text-xs py-1 px-3"
                            onClick={(e) => { e.stopPropagation(); refreshBadges(); navigate(`/orcamentos/novo/${m.id}`) }}
                          >
                            Gerar Orçamento
                          </button>
                        ) : null}
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
            onGenerateOrcamento={() => { refreshBadges(); navigate(`/orcamentos/novo/${selected.id}`) }}
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
        {!m.temOrcamento && (
          <button className="btn-primary w-full" onClick={onGenerateOrcamento}>
            Gerar Orçamento
          </button>
        )}
        <button className="btn-secondary w-full text-sm" onClick={() => onViewDetail && onViewDetail()}>
          Ver detalhes completos
        </button>
      </div>
    </div>
  )
}
