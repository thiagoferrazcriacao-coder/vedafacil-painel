import React, { useState, useEffect } from 'react'
import { api } from '../api/client.js'

const CAMPO_VAZIO = {
  nomeCondominio:      '',
  data:                '', // YYYY-MM-DD
  horaInicio:          '', // HH:mm
  horaFim:             '', // HH:mm
  cep:                 '',
  endereco:            '',
  bairro:              '',
  cidade:              '',
  estado:              '',
  nomeResponsavel:     '',
  telefone:            '',
  observacao:          '',
  fotosCliente:        [], // array de base64
  medidorEmail:        '',
  medidorNome:         '',
  tecnicoResponsavel:  '',
  status:              'reservado',
  acompanhamento:      false,
  repetirTipo:         'semana', // 'semana' | 'mes'
  repetirAte:          '',       // YYYY-MM-DD — só usado quando acompanhamento=true
}

// Gera datas recorrentes entre inicio e fim (inclusive), a cada semana ou mês
function gerarDatasRecorrentes(inicio, fim, tipo) {
  const datas = []
  const end = new Date(fim + 'T00:00:00')
  let cur = new Date(inicio + 'T00:00:00')
  while (cur <= end) {
    datas.push(cur.toISOString().slice(0, 10))
    if (tipo === 'semana') {
      cur = new Date(cur.getTime() + 7 * 24 * 60 * 60 * 1000)
    } else {
      cur = new Date(cur)
      cur.setMonth(cur.getMonth() + 1)
    }
  }
  return datas
}

// Comprime imagens enviadas pelo operador (1200px max, JPEG 72%)
function compressImage(file, maxDim = 1200, quality = 0.72) {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) { reject(new Error('Não é imagem')); return }
    const reader = new FileReader()
    reader.onerror = reject
    reader.onload = e => {
      const img = new Image()
      img.onerror = reject
      img.onload = () => {
        let { width, height } = img
        if (width > maxDim || height > maxDim) {
          const r = Math.min(maxDim / width, maxDim / height)
          width = Math.round(width * r); height = Math.round(height * r)
        }
        const canvas = document.createElement('canvas')
        canvas.width = width; canvas.height = height
        const ctx = canvas.getContext('2d')
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, width, height)
        ctx.drawImage(img, 0, 0, width, height)
        resolve(canvas.toDataURL('image/jpeg', quality))
      }
      img.src = e.target.result
    }
    reader.readAsDataURL(file)
  })
}

function Field({ label, required, children }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  )
}

export default function NovaVisitaModal({ visita, onSalvar, onFechar, onExcluir }) {
  const isEdit = !!visita
  // Extrai data e hora de dataHora/dataHoraFim ao carregar visita existente
  const splitDataHora = (str) => {
    if (!str) return { data: '', hora: '' }
    const s = String(str).slice(0, 16) // YYYY-MM-DDTHH:mm
    const [data, hora] = s.split('T')
    return { data: data || '', hora: hora || '' }
  }
  const [form, setForm] = useState(() => {
    if (!visita) return { ...CAMPO_VAZIO }
    const ini = splitDataHora(visita.dataHora)
    const fim = splitDataHora(visita.dataHoraFim)
    return {
      ...CAMPO_VAZIO,
      ...visita,
      data:       ini.data,
      horaInicio: ini.hora,
      horaFim:    fim.hora,
      fotosCliente: Array.isArray(visita.fotosCliente) ? visita.fotosCliente : [],
    }
  })
  const [medidores, setMedidores] = useState([])
  const [tecnicos, setTecnicos] = useState([])
  const [cepLoading, setCepLoading] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [uploadingFotos, setUploadingFotos] = useState(false)
  const [erro, setErro] = useState('')
  // Almoço do medidor selecionado (HH:mm)
  const [almocoInicio, setAlmocoInicio] = useState('12:00')
  const [almocoFim,    setAlmocoFim]    = useState('13:30')
  const [editandoAlmoco, setEditandoAlmoco] = useState(false)
  const [salvandoAlmoco, setSalvandoAlmoco] = useState(false)

  // Carrega medidores e técnicos ao abrir o modal
  useEffect(() => {
    // Medidores: endpoint público (auth) /api/usuarios/medidores — funciona para
    // operador e admin. NÃO usar getUsuarios() aqui pois exige adminOnly e cai
    // silenciosamente no catch quando o usuário logado é operador.
    api.getMedidores().then(lista => {
      const meds = (Array.isArray(lista) ? lista : [])
        .map(u => ({ email: u.email || u.id, nome: u.name || u.email }))
      setMedidores(meds)
    }).catch(err => {
      // Loga no console para diagnóstico (era silencioso antes)
      console.warn('Falha ao carregar medidores:', err?.message || err)
    })

    // Técnicos: lista configurada na ConfigPage (Alan, Fernando, Thiago, Daniel…)
    api.getPrecos().then(p => {
      setTecnicos(p?.tecnicos || ['Alan', 'Fernando', 'Thiago', 'Daniel'])
    }).catch(() => setTecnicos(['Alan', 'Fernando', 'Thiago', 'Daniel']))
  }, [])

  // Carrega horário de almoço sempre que o medidor selecionado mudar
  useEffect(() => {
    if (!form.medidorEmail) { setAlmocoInicio('12:00'); setAlmocoFim('13:30'); return }
    api.getAlmocoMedidor(form.medidorEmail).then(data => {
      setAlmocoInicio(data?.almocoInicio || '12:00')
      setAlmocoFim(data?.almocoFim || '13:30')
    }).catch(() => { setAlmocoInicio('12:00'); setAlmocoFim('13:30') })
  }, [form.medidorEmail])

  // Helpers: HH:mm <-> minutos
  const hhmmToMin = (s) => { if (!/^\d{2}:\d{2}$/.test(s||'')) return null; const [h,m] = s.split(':').map(Number); return h*60+m }
  const minToHhmm = (min) => { const h = Math.floor(min/60), m = min%60; return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}` }

  // Verifica se o intervalo da visita (horaInicio→horaFim) conflita com o almoço
  const conflitaComAlmoco = () => {
    if (!form.horaInicio) return false
    const visIni = hhmmToMin(form.horaInicio)
    // Se não tem horaFim, assume 1h de duração
    const visFim = form.horaFim ? hhmmToMin(form.horaFim) : (visIni + 60)
    const almIni = hhmmToMin(almocoInicio)
    const almFim = hhmmToMin(almocoFim)
    if (visIni == null || almIni == null) return false
    return visIni < almFim && visFim > almIni
  }
  const visitaConflita = conflitaComAlmoco()

  // Salva novo horário de almoço (sempre 1h30 de duração)
  const salvarAlmoco = async () => {
    setSalvandoAlmoco(true)
    try {
      const d = await api.setAlmocoMedidor(form.medidorEmail, almocoInicio)
      setAlmocoInicio(d.almocoInicio); setAlmocoFim(d.almocoFim)
      setEditandoAlmoco(false)
    } catch (e) { alert('Erro ao salvar almoço: ' + e.message) }
    finally { setSalvandoAlmoco(false) }
  }

  const upd = (campo, valor) => setForm(prev => ({ ...prev, [campo]: valor }))

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
            endereco: d.logradouro ? d.logradouro : prev.endereco,
            bairro:   d.bairro    || prev.bairro,
            cidade:   d.localidade|| prev.cidade,
            estado:   d.uf        || prev.estado,
          }))
        }
      } catch {}
      setCepLoading(false)
    }
  }

  // Upload de fotos do cliente — comprime e converte pra base64 antes de adicionar
  const handleFotosCliente = async (e) => {
    const arquivos = Array.from(e.target.files || [])
    if (!arquivos.length) return
    setUploadingFotos(true)
    try {
      const novas = []
      for (const f of arquivos) {
        try { novas.push(await compressImage(f)) } catch {}
      }
      if (novas.length) setForm(prev => ({ ...prev, fotosCliente: [...(prev.fotosCliente || []), ...novas] }))
    } finally { setUploadingFotos(false); e.target.value = '' }
  }
  const removerFotoCliente = (idx) => {
    setForm(prev => ({ ...prev, fotosCliente: (prev.fotosCliente || []).filter((_, i) => i !== idx) }))
  }

  const handleSubmit = async (statusFinal) => {
    if (!form.nomeCondominio.trim()) { setErro('Nome do condomínio é obrigatório.'); return }
    if (!form.data) { setErro('A data é obrigatória.'); return }
    if (!form.horaInicio) { setErro('A hora de início é obrigatória.'); return }
    if (form.medidorEmail && conflitaComAlmoco()) {
      setErro(`⚠️ Horário conflita com o almoço do medidor (${almocoInicio} – ${almocoFim}). Ajuste o horário da visita OU altere o horário de almoço logo acima.`)
      return
    }
    setErro(''); setSalvando(true)
    try {
      // remove campos auxiliares que não vão pro backend
      const { data: _d, horaInicio: _hi, horaFim: _hf, repetirTipo: _rt, repetirAte: _ra, ...resto } = form
      const dataHora    = `${form.data}T${form.horaInicio}`
      const dataHoraFim = form.horaFim ? `${form.data}T${form.horaFim}` : ''

      // Acompanhamento recorrente: cria uma visita por data gerada
      if (!isEdit && form.acompanhamento && form.repetirAte) {
        const datas = gerarDatasRecorrentes(form.data, form.repetirAte, form.repetirTipo)
        if (!datas.length) { setErro('Nenhuma data gerada. Verifique as datas.'); return }
        for (const d of datas) {
          const dh  = `${d}T${form.horaInicio}`
          const dhf = form.horaFim ? `${d}T${form.horaFim}` : ''
          await api.createVisita({ ...resto, dataHora: dh, dataHoraFim: dhf, status: statusFinal, acompanhamento: true })
        }
        await onSalvar(null, false, datas.length) // sinaliza multi-create com contagem
        return
      }

      await onSalvar({ ...resto, dataHora, dataHoraFim, status: statusFinal }, isEdit)
    } catch (e) { setErro(e.message) }
    finally { setSalvando(false) }
  }

  // Fechar com ESC
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onFechar() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onFechar])

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onFechar}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between rounded-t-xl z-10">
          <h2 className="text-lg font-bold text-gray-800">
            {isEdit ? '✏️ Editar Visita' : '📅 Nova Visita'}
          </h2>
          <button onClick={onFechar} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
        </div>

        {/* Corpo */}
        <div className="px-6 py-5 space-y-4">
          {erro && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{erro}</div>}

          {/* Acompanhamento de Equipes — só aparece em novas visitas, posicionado no topo */}
          {!isEdit && (
            <div className={`rounded-lg border-2 p-4 transition-colors ${form.acompanhamento ? 'bg-teal-50 border-teal-300' : 'bg-gray-50 border-gray-200'}`}>
              <label className="flex items-start gap-3 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={form.acompanhamento}
                  onChange={e => upd('acompanhamento', e.target.checked)}
                  className="mt-0.5 w-5 h-5 cursor-pointer accent-teal-600 flex-shrink-0" />
                <div>
                  <div className={`text-sm font-bold ${form.acompanhamento ? 'text-teal-800' : 'text-gray-700'}`}>
                    🔁 Acompanhamento de Equipes
                  </div>
                  <div className={`text-xs mt-0.5 ${form.acompanhamento ? 'text-teal-600' : 'text-gray-500'}`}>
                    Visitas periódicas para acompanhar equipes em campo — aparece em azul-esverdeado na agenda
                  </div>
                </div>
              </label>

              {form.acompanhamento && (
                <div className="mt-4 space-y-3 pl-8">
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="text-xs font-semibold text-teal-800 whitespace-nowrap">Repetir:</span>
                    <div className="flex gap-2">
                      {[
                        { v: 'semana', l: 'Toda semana' },
                        { v: 'mes',    l: 'Todo mês' },
                      ].map(op => (
                        <button key={op.v} type="button"
                          onClick={() => upd('repetirTipo', op.v)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${form.repetirTipo === op.v ? 'bg-teal-600 text-white shadow-sm' : 'bg-white border border-teal-300 text-teal-700 hover:bg-teal-100'}`}>
                          {op.l}
                        </button>
                      ))}
                    </div>
                  </div>

                  <Field label="Repetir até (inclusive)">
                    <input type="date" value={form.repetirAte}
                      min={form.data || undefined}
                      onChange={e => upd('repetirAte', e.target.value)}
                      className="w-full border border-teal-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-300 focus:border-teal-400 bg-white" />
                  </Field>

                  {form.data && form.repetirAte && form.repetirAte >= form.data && (
                    <div className="text-xs text-teal-700 bg-teal-100 rounded-lg p-2.5 border border-teal-200">
                      {(() => {
                        const datas = gerarDatasRecorrentes(form.data, form.repetirAte, form.repetirTipo)
                        const exibe = datas.slice(0, 3).map(d => {
                          const [y, m, dia] = d.split('-')
                          return `${dia}/${m}`
                        })
                        return `📅 ${datas.length} visita(s): ${exibe.join(', ')}${datas.length > 3 ? ` … e mais ${datas.length - 3}` : ''}`
                      })()}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Data + Hora início + Hora término — campos separados */}
          <div className="grid grid-cols-3 gap-3">
            <Field label="Data" required>
              <input type="date" value={form.data}
                onChange={e => upd('data', e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" />
            </Field>
            <Field label="Hora de início" required>
              <input type="time" value={form.horaInicio}
                onChange={e => upd('horaInicio', e.target.value)}
                className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 ${visitaConflita ? 'border-red-400 bg-red-50' : 'border-gray-300 focus:border-primary'}`} />
            </Field>
            <Field label="Hora de término">
              <input type="time" value={form.horaFim}
                onChange={e => upd('horaFim', e.target.value)}
                className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 ${visitaConflita ? 'border-red-400 bg-red-50' : 'border-gray-300 focus:border-primary'}`} />
            </Field>
          </div>

          {/* Almoço do medidor — só aparece quando um medidor está selecionado */}
          {form.medidorEmail && (
            <div className={`rounded-lg p-3 border-2 ${visitaConflita ? 'bg-red-50 border-red-300' : 'bg-amber-50 border-amber-200'}`}>
              <div className="flex items-start justify-between gap-2 flex-wrap">
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-bold text-amber-800 mb-0.5">
                    🍽️ Almoço do medidor (1h30 — não agendar nesse horário)
                  </div>
                  {!editandoAlmoco ? (
                    <div className="text-sm font-semibold text-amber-900">
                      {almocoInicio} – {almocoFim}
                      <button type="button" onClick={() => setEditandoAlmoco(true)}
                        className="ml-2 text-xs px-2 py-0.5 rounded bg-amber-200 hover:bg-amber-300 text-amber-900 font-semibold">
                        ✏️ Alterar
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 flex-wrap mt-1">
                      <span className="text-xs text-amber-800">Início:</span>
                      <input type="time" value={almocoInicio}
                        onChange={e => {
                          const ini = e.target.value
                          setAlmocoInicio(ini)
                          // Fim sempre 1h30 depois
                          const m = hhmmToMin(ini)
                          if (m != null) setAlmocoFim(minToHhmm(m + 90))
                        }}
                        className="border border-amber-300 rounded px-2 py-1 text-sm bg-white" />
                      <span className="text-xs text-amber-800">até <strong>{almocoFim}</strong></span>
                      <button type="button" onClick={salvarAlmoco} disabled={salvandoAlmoco}
                        className="text-xs px-2.5 py-1 rounded bg-amber-600 text-white font-bold hover:bg-amber-700 disabled:opacity-50">
                        {salvandoAlmoco ? '...' : '💾 Salvar'}
                      </button>
                      <button type="button" onClick={() => { setEditandoAlmoco(false); /* recarrega */ api.getAlmocoMedidor(form.medidorEmail).then(d => { setAlmocoInicio(d.almocoInicio); setAlmocoFim(d.almocoFim) }) }}
                        className="text-xs px-2 py-1 rounded bg-gray-200 hover:bg-gray-300 text-gray-700">
                        Cancelar
                      </button>
                    </div>
                  )}
                </div>
                {visitaConflita && (
                  <div className="text-xs font-bold text-red-700 bg-red-100 px-2.5 py-1 rounded-full whitespace-nowrap">
                    ⚠️ Conflito!
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Nome do Condomínio */}
          <Field label="Nome do Condomínio" required>
            <input type="text" value={form.nomeCondominio}
              onChange={e => upd('nomeCondominio', e.target.value)}
              placeholder="Ex: Condomínio Residencial Solar"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" />
          </Field>

          {/* Medidor + Técnico Responsável — campos separados */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Medidor que vai ao local" required>
              <select
                value={form.medidorEmail}
                onChange={e => {
                  const sel = medidores.find(m => m.email === e.target.value)
                  upd('medidorEmail', e.target.value)
                  upd('medidorNome', sel?.nome || '')
                }}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary bg-white">
                <option value="">— Selecione —</option>
                {medidores.map(m => (
                  <option key={m.email} value={m.email}>{m.nome}</option>
                ))}
              </select>
            </Field>

            <Field label="Técnico Responsável">
              <select
                value={form.tecnicoResponsavel}
                onChange={e => upd('tecnicoResponsavel', e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary bg-white">
                <option value="">— Selecione —</option>
                {tecnicos.map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </Field>
          </div>

          {/* CEP */}
          <div className="grid grid-cols-3 gap-3">
            <Field label="CEP">
              <div className="relative">
                <input type="text" value={form.cep}
                  onChange={handleCep}
                  placeholder="00000-000" maxLength={9}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" />
                {cepLoading && <div className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />}
              </div>
            </Field>
            <div className="col-span-2">
              <Field label="Endereço">
                <input type="text" value={form.endereco}
                  onChange={e => upd('endereco', e.target.value)}
                  placeholder="Rua, número"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" />
              </Field>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <Field label="Bairro">
              <input type="text" value={form.bairro}
                onChange={e => upd('bairro', e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" />
            </Field>
            <Field label="Cidade">
              <input type="text" value={form.cidade}
                onChange={e => upd('cidade', e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" />
            </Field>
            <Field label="Estado">
              <input type="text" value={form.estado}
                onChange={e => upd('estado', e.target.value)}
                maxLength={2} placeholder="SP"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" />
            </Field>
          </div>

          {/* Responsável */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Nome do Responsável">
              <input type="text" value={form.nomeResponsavel}
                onChange={e => upd('nomeResponsavel', e.target.value)}
                placeholder="Síndico / zelador"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" />
            </Field>
            <Field label="Telefone">
              <input type="tel" value={form.telefone}
                onChange={e => upd('telefone', e.target.value)}
                placeholder="(00) 00000-0000"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" />
            </Field>
          </div>

          {/* Observação + Fotos do cliente */}
          <Field label="Observação">
            <textarea value={form.observacao}
              onChange={e => upd('observacao', e.target.value)}
              rows={3} placeholder="Observações, instruções de acesso, etc."
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary resize-none" />
            {/* Botão anexar fotos do cliente */}
            <div className="mt-2">
              <label className="inline-flex items-center gap-2 text-xs font-semibold px-3 py-2 rounded-lg bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 cursor-pointer transition-colors">
                <span>📎</span>
                <span>{uploadingFotos ? 'Anexando...' : 'Anexar fotos do cliente'}</span>
                <input type="file" accept="image/*" multiple className="hidden"
                  onChange={handleFotosCliente} disabled={uploadingFotos} />
              </label>
              <span className="ml-2 text-xs text-gray-500">
                {(form.fotosCliente || []).length > 0 ? `${form.fotosCliente.length} foto(s) anexada(s)` : 'Visíveis pro medidor no PWA'}
              </span>
            </div>
            {(form.fotosCliente || []).length > 0 && (
              <div className="mt-2 grid grid-cols-4 gap-2">
                {form.fotosCliente.map((src, i) => (
                  <div key={i} className="relative group">
                    <img src={src} alt={`Foto cliente ${i+1}`}
                      className="w-full aspect-square object-cover rounded border border-gray-200" />
                    <button type="button" onClick={() => removerFotoCliente(i)}
                      className="absolute top-1 right-1 bg-red-600 text-white text-xs w-5 h-5 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">×</button>
                  </div>
                ))}
              </div>
            )}
          </Field>

        </div>

        {/* Footer com botões */}
        <div className="sticky bottom-0 bg-white border-t border-gray-200 px-6 py-4 rounded-b-xl">
          {isEdit ? (
            <div className="space-y-2">
              {form.status === 'reservado' && (
                <p className="text-xs text-gray-500 text-center">
                  ⚠️ <strong>Reservado</strong> não aparece pro medidor. Clique em <strong>Confirmar</strong> para liberar.
                </p>
              )}
              {onExcluir && (
                <button type="button" onClick={onExcluir}
                  className="w-full py-2 rounded-lg bg-red-50 border border-red-200 text-red-600 text-sm font-semibold hover:bg-red-100 transition-colors">
                  🗑️ Excluir esta visita
                </button>
              )}
              <div className="flex gap-2">
                <button onClick={onFechar}
                  className="flex-1 py-2.5 rounded-lg border border-gray-300 text-gray-600 text-sm font-semibold hover:bg-gray-50 transition-colors">
                  Cancelar
                </button>
                <button onClick={() => handleSubmit(form.status)}
                  disabled={salvando}
                  className="flex-1 py-2.5 rounded-lg bg-primary text-white text-sm font-bold hover:bg-primary/90 transition-colors disabled:opacity-50">
                  {salvando ? '...' : '💾 Salvar'}
                </button>
                {form.status === 'reservado' && (
                  <button onClick={() => handleSubmit('confirmado')}
                    disabled={salvando}
                    className="flex-1 py-2.5 rounded-lg bg-green-600 text-white text-sm font-bold hover:bg-green-700 transition-colors disabled:opacity-50">
                    {salvando ? '...' : '✅ Confirmar'}
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-gray-500 text-center mb-2">
                <strong>Reservado</strong> = só o painel vê. <strong>Confirmado</strong> = aparece para o medidor.
              </p>
              <div className="flex gap-2">
                <button onClick={() => handleSubmit('reservado')}
                  disabled={salvando}
                  className="flex-1 py-2.5 rounded-lg bg-orange-500 text-white text-sm font-bold hover:bg-orange-600 transition-colors disabled:opacity-50">
                  {salvando ? '...' : '🔒 Reservar Horário'}
                </button>
                <button onClick={() => handleSubmit('confirmado')}
                  disabled={salvando}
                  className="flex-1 py-2.5 rounded-lg bg-green-600 text-white text-sm font-bold hover:bg-green-700 transition-colors disabled:opacity-50">
                  {salvando ? '...' : '✅ Confirmar Visita'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
