import React, { useEffect, useState, useMemo, useCallback } from 'react'
import { api } from '../api/client.js'
import { useAuth } from '../App.jsx'
import NovaVisitaModal from '../components/NovaVisitaModal.jsx'

// ── Helpers de data ───────────────────────────────────────────────────────────
function parseLocal(str) {
  if (!str) return null
  return new Date(str + (str.length === 10 ? 'T00:00' : ''))
}
function toStr(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}
function sameDay(a, b) {
  return a && b && a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}
function fmtHora(str) {
  if (!str) return ''
  const d = new Date(str)
  return isNaN(d) ? '' : d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}
function fmtData(str) {
  if (!str) return ''
  const d = parseLocal(str)
  return d ? d.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' }) : ''
}

const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']
const DIAS_SEMANA = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb']

const STATUS_CONFIG = {
  reservado:  { label: '🔒 Reservado',  bg: 'bg-orange-100',  text: 'text-orange-800',  border: '#fb923c', chip: 'bg-orange-500' },
  confirmado: { label: '✅ Confirmado', bg: 'bg-green-100',   text: 'text-green-800',   border: '#22c55e', chip: 'bg-green-600'  },
  concluido:  { label: '✔ Concluído',  bg: 'bg-gray-100',    text: 'text-gray-600',    border: '#9ca3af', chip: 'bg-gray-500'   },
  cancelado:  { label: '✖ Cancelado',  bg: 'bg-red-100',     text: 'text-red-700',     border: '#ef4444', chip: 'bg-red-500'    },
}

// Paleta de cores dos medidores — gerada por hash do email pra ficar consistente entre sessões
const PALETA_MEDIDORES = [
  '#2563eb', // azul
  '#16a34a', // verde
  '#dc2626', // vermelho
  '#9333ea', // roxo
  '#0891b2', // ciano
  '#d97706', // âmbar
  '#db2777', // rosa
  '#4f46e5', // índigo
]
function corDoMedidor(email) {
  // Sem medidor atribuído → cor neutra mas com bom contraste (escura, não cinza opaco).
  // Mantém legibilidade do texto branco e visual consistente com os outros cards.
  if (!email) return '#64748b' // slate-500
  let hash = 0
  for (let i = 0; i < email.length; i++) hash = (hash * 31 + email.charCodeAt(i)) & 0xffffffff
  return PALETA_MEDIDORES[Math.abs(hash) % PALETA_MEDIDORES.length]
}
// Versão clara da cor (para fundos / chips)
function corClaraMedidor(email) {
  const cor = corDoMedidor(email)
  return cor + '22' // 13% alpha
}

// Componente de Card padronizado para a agenda (vista mês e semana).
// Garante que TODA visita mostre: hora · bairro · condomínio · medidor — mesmo
// quando algum campo está faltando (usa placeholders sutis em vez de sumir).
function VisitaCardCompacto({ v, onClick, modo = 'semana' }) {
  const sc = STATUS_CONFIG[v.status] || STATUS_CONFIG.reservado
  const corMed = v.acompanhamento ? '#0d9488' : corDoMedidor(v.medidorEmail) // teal-600 para acompanhamento
  const bgCor = v.status === 'cancelado' ? '#9ca3af'
              : v.status === 'concluido' ? corMed + 'bb'
              : corMed
  const hora = fmtHora(v.dataHora)
  const ehGoogle = v.fonte === 'google'

  if (modo === 'mes') {
    // Modo mês: muito compacto — usa só uma linha (hora · condomínio)
    return (
      <div onClick={onClick}
        className="cursor-pointer rounded text-xs overflow-hidden mb-0.5 hover:brightness-90 transition-all"
        style={{ background: bgCor }}
        title={`${v.nomeCondominio || '(sem nome)'} — ${hora || 'sem hora'} — ${sc.label}${v.bairro ? ' — ' + v.bairro : ''}${v.medidorNome ? ' — Medidor: ' + v.medidorNome : ''}`}>
        <div style={{ height: 2, background: ehGoogle ? '#3b82f6' : sc.border, opacity: 0.9 }} />
        <div className="px-1.5 py-0.5 text-white font-semibold truncate leading-tight">
          {ehGoogle && <span title="Google Calendar" className="opacity-80 mr-0.5">📅</span>}
          {hora && <span className="opacity-80 mr-1">{hora}</span>}
          {v.nomeCondominio || '(sem nome)'}
        </div>
      </div>
    )
  }

  // Modo semana: mais espaço — 4 linhas no padrão roxo (hora · bairro / condomínio / medidor)
  return (
    <div onClick={onClick}
      className="cursor-pointer rounded mb-1 overflow-hidden hover:brightness-90 transition-all shadow-sm"
      style={{ background: bgCor }}
      title={`${v.nomeCondominio || '(sem nome)'} — ${hora || 'sem hora'} — ${sc.label}${v.medidorNome ? ' — ' + v.medidorNome : ''}`}>
      <div style={{ height: 3, background: ehGoogle ? '#3b82f6' : sc.border, opacity: 0.9 }} />
      <div className="px-2 py-1.5 text-white">
        {/* Linha 1: hora amarela + bairro */}
        <div className="text-[11px] font-bold mb-0.5 flex items-center gap-1.5 flex-wrap leading-tight">
          {ehGoogle && <span title="Google Calendar">📅</span>}
          <span style={{ color: '#fef08a' }}>{hora || '—'}</span>
          {v.bairro && <span className="opacity-95">· {v.bairro}</span>}
        </div>
        {/* Linha 2: condomínio (destaque) */}
        <div className="text-xs font-semibold leading-tight" style={{ wordBreak: 'break-word' }}>
          {v.nomeCondominio || <span className="opacity-60 italic font-normal">(sem nome)</span>}
        </div>
        {/* Linha 3: medidor + badge acompanhamento */}
        <div className="text-[10px] opacity-95 mt-1 font-medium leading-tight flex items-center gap-1.5 flex-wrap">
          {v.acompanhamento && <span title="Acompanhamento de Equipes" className="bg-white/25 rounded px-1 py-0.5 font-bold">🔁 Acomp.</span>}
          {v.medidorNome
            ? <>📐 {v.medidorNome}</>
            : <span className="opacity-70 italic">📐 sem medidor</span>}
        </div>
      </div>
    </div>
  )
}

// ── Componente principal ──────────────────────────────────────────────────────
export default function AgendaVisitasView() {
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'
  // Pode ver todas as agendas: admin ou operador com Comercial/Orçamentos nos setores
  const podeVerTodos = isAdmin || (
    user?.role === 'operador' &&
    (user?.setores || []).some(s => ['Comercial', 'Orçamentos'].includes(s))
  )
  const isMedidor = user?.role === 'medidor'
  const today = useMemo(() => { const d = new Date(); d.setHours(0,0,0,0); return d }, [])

  const [visitas, setVisitas] = useState([])
  const [medidores, setMedidores] = useState([]) // lista de usuários medidores
  const [filtroMedidor, setFiltroMedidor] = useState('todos') // 'todos' | email do medidor
  const [loading, setLoading] = useState(true)
  const [agendaMode, setAgendaMode] = useState('google')
  const [viewMode, setViewMode] = useState('mes') // 'mes' | 'semana'
  const [monthDate, setMonthDate] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1))
  const [weekStart, setWeekStart] = useState(() => {
    const d = new Date(today)
    const dow = d.getDay() // 0=dom
    d.setDate(d.getDate() - dow)
    return d
  })
  const [modalAberto, setModalAberto] = useState(false)
  const [visitaEditando, setVisitaEditando] = useState(null)
  const [confirmandoId, setConfirmandoId] = useState(null)
  const [showModoModal, setShowModoModal] = useState(false)
  const [mudandoModo, setMudandoModo] = useState(false)
  const [erro, setErro] = useState('')
  const [sucesso, setSucesso] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      // Monta params: medidor vê só as suas (backend já filtra), admin/comercial pode filtrar
      const params = {}
      if (podeVerTodos && filtroMedidor !== 'todos') params.medidorEmail = filtroMedidor

      const [vis, cfg] = await Promise.all([
        api.getVisitas(params),
        api.getAgendaMode(),
      ])
      setVisitas(Array.isArray(vis) ? vis : [])
      setAgendaMode(cfg?.agendaMode || 'google')
    } catch (e) { setErro(e.message) }
    finally { setLoading(false) }
  }, [filtroMedidor, podeVerTodos])

  // Carrega lista de medidores (só para quem pode ver todos)
  useEffect(() => {
    if (!podeVerTodos) return
    api.getUsuarios?.().then(lista => {
      const meds = (Array.isArray(lista) ? lista : [])
        .filter(u => u.role === 'medidor')
        .map(u => ({ email: u.email || u.id, nome: u.name || u.email }))
      setMedidores(meds)
    }).catch(() => {})
  }, [podeVerTodos])

  useEffect(() => { load() }, [load, filtroMedidor])

  // ── Calendário (grade 7×6) ────────────────────────────────────────────────
  const calDays = useMemo(() => {
    const primeiro = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1)
    const start = new Date(primeiro)
    start.setDate(start.getDate() - primeiro.getDay())
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(start); d.setDate(d.getDate() + i)
      return { date: d, thisMonth: d.getMonth() === monthDate.getMonth() }
    })
  }, [monthDate])

  const visitasPorDia = useMemo(() => {
    const mapa = {}
    visitas.forEach(v => {
      if (!v.dataHora) return
      const key = v.dataHora.slice(0, 10)
      if (!mapa[key]) mapa[key] = []
      mapa[key].push(v)
    })
    return mapa
  }, [visitas])

  // ── Ações ─────────────────────────────────────────────────────────────────
  const abrirNova = () => { setVisitaEditando(null); setModalAberto(true) }
  const abrirEditar = (v) => {
    if (v.fonte === 'google' || v.readOnly) {
      // Eventos do Google Calendar são só visualização
      alert(`📅 Evento do Google Calendar\n\n${v.nomeCondominio}\n${v.endereco || ''}\n\nEste evento veio da agenda Google e não pode ser editado pelo painel.`)
      return
    }
    setVisitaEditando(v); setModalAberto(true)
  }

  const onSalvar = async (dados, isEdit, multiCount) => {
    try {
      if (multiCount) {
        // Criação múltipla de acompanhamento — visitas já foram criadas no modal
        setSucesso(`🔁 ${multiCount} visita(s) de acompanhamento criadas!`)
      } else if (isEdit) {
        await api.updateVisita(visitaEditando._id, dados)
        setSucesso('Visita atualizada!')
      } else {
        await api.createVisita(dados)
        setSucesso('Visita criada!')
      }
      setModalAberto(false)
      await load()
      setTimeout(() => setSucesso(''), 4000)
    } catch (e) { setErro(e.message) }
  }

  const confirmar = async (id, novoStatus) => {
    setConfirmandoId(id)
    try {
      await api.confirmarVisita(id, novoStatus)
      setSucesso(novoStatus === 'confirmado' ? 'Visita confirmada! Aparecerá para os medidores.' : 'Status atualizado.')
      await load()
      setTimeout(() => setSucesso(''), 3000)
    } catch (e) { setErro(e.message) }
    finally { setConfirmandoId(null) }
  }

  const excluir = async (id) => {
    if (!confirm('Excluir esta visita? Ela irá para a lixeira.')) return
    try {
      await api.deleteVisita(id)
      setSucesso('Visita excluída.')
      await load()
      setTimeout(() => setSucesso(''), 3000)
    } catch (e) { setErro(e.message) }
  }

  const mudarModo = async (modo) => {
    const msgs = {
      google:  'Voltar para apenas Google Calendar. Visitas da agenda própria não aparecerão para os medidores.',
      misto:   'Modo misto: medidores verão eventos do Google Calendar E visitas da agenda própria (com badge de fonte).',
      proprio: '⚠️ Modo próprio: Google Calendar será DESATIVADO no medidor. Apenas visitas desta agenda aparecerão. Confirmar?',
    }
    if (!confirm(msgs[modo])) return
    setMudandoModo(true)
    try {
      await api.setAgendaMode(modo)
      setAgendaMode(modo)
      setShowModoModal(false)
      setSucesso(`Modo da agenda alterado para "${modo}".`)
      setTimeout(() => setSucesso(''), 4000)
    } catch (e) { setErro(e.message) }
    finally { setMudandoModo(false) }
  }

  const [filtroTexto, setFiltroTexto] = useState('')

  // ── Visitas do período visível (semana ou mês) — acompanha o toggle de cima ──
  const visitasMes = useMemo(() => {
    let ini, fim
    if (viewMode === 'semana') {
      ini = toStr(weekStart)
      const fimSem = new Date(weekStart); fimSem.setDate(fimSem.getDate() + 6)
      fim = toStr(fimSem)
    } else {
      ini = toStr(monthDate)
      fim = toStr(new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0))
    }
    const txt = filtroTexto.trim().toLowerCase()
    return visitas
      .filter(v => {
        if (!v.dataHora) return false
        if (v.dataHora.slice(0,10) < ini || v.dataHora.slice(0,10) > fim) return false
        if (!txt) return true
        return [v.nomeCondominio, v.medidorNome, v.bairro, v.cidade, v.nomeResponsavel, v.tecnicoResponsavel]
          .some(f => (f || '').toLowerCase().includes(txt))
      })
      .sort((a, b) => (b.dataHora || '').localeCompare(a.dataHora || '')) // mais recente primeiro
  }, [visitas, viewMode, monthDate, weekStart, filtroTexto])

  // ── Render ─────────────────────────────────────────────────────────────────
  const MODO_LABELS = { google: '📅 Google Calendar', misto: '📅 Google + 📋 Vedafacil', proprio: '📋 Vedafacil (própria)' }

  return (
    <div>
      {/* ── Barra superior ── */}
      <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-sm text-gray-500">Modo:</span>
          <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${
            agendaMode === 'proprio' ? 'bg-blue-100 text-blue-700' :
            agendaMode === 'misto'   ? 'bg-purple-100 text-purple-700' :
                                       'bg-gray-100 text-gray-600'
          }`}>{MODO_LABELS[agendaMode] || agendaMode}</span>
          {isAdmin && (
            <button onClick={() => setShowModoModal(true)}
              className="text-xs px-2 py-1 rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors">
              ⚙️ Mudar modo
            </button>
          )}
        </div>
        <button onClick={abrirNova}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg font-semibold hover:bg-primary/90 transition-colors shadow-sm">
          + Nova Visita
        </button>
      </div>

      {/* ── Filtro por medidor (só para admin/comercial) ── */}
      {podeVerTodos && medidores.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap mb-4">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Medidor:</span>
          <button
            onClick={() => setFiltroMedidor('todos')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${filtroMedidor === 'todos' ? 'bg-primary text-white shadow-sm' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
            Todos
          </button>
          {medidores.map(m => (
            <button key={m.email}
              onClick={() => setFiltroMedidor(m.email)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${filtroMedidor === m.email ? 'bg-primary text-white shadow-sm' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
              👤 {m.nome}
            </button>
          ))}
        </div>
      )}

      {/* Banner: medidor vê só a própria agenda */}
      {isMedidor && (
        <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-700">
          📋 Exibindo apenas as visitas agendadas para você.
        </div>
      )}

      {erro    && <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{erro} <button onClick={() => setErro('')} className="ml-2 text-red-500">✕</button></div>}
      {sucesso && <div className="mb-3 p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">{sucesso}</div>}

      {loading ? (
        <div className="flex justify-center py-16"><div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" /></div>
      ) : (
        <>
          {/* ── Toggle Mês / Semana + Legenda de cores dos medidores ── */}
          <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
            <div className="flex rounded-lg overflow-hidden border border-gray-200 shadow-sm">
              {[['mes', '📅 Mês'], ['semana', '🗓️ Semana']].map(([v, l]) => (
                <button key={v} onClick={() => setViewMode(v)}
                  className={`px-4 py-2 text-sm font-medium transition-colors ${viewMode === v ? 'bg-primary text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
                  {l}
                </button>
              ))}
            </div>
            {/* Legenda de cores dos medidores */}
            {medidores.length > 0 && (
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Cores:</span>
                {medidores.map(m => (
                  <span key={m.email} className="inline-flex items-center gap-1.5 text-xs">
                    <span style={{ width: 12, height: 12, borderRadius: 4, background: corDoMedidor(m.email) }} />
                    <span className="text-gray-600">{m.nome}</span>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* ── Navegação ── */}
          {viewMode === 'mes' ? (
            <div className="flex items-center justify-between mb-4">
              <button onClick={() => setMonthDate(d => new Date(d.getFullYear(), d.getMonth()-1, 1))}
                className="px-3 py-1.5 rounded-lg bg-white border border-gray-200 hover:bg-gray-50 text-sm font-medium">
                ‹ Mês anterior
              </button>
              <h2 className="text-base font-bold text-gray-800 capitalize">
                {MESES[monthDate.getMonth()]} {monthDate.getFullYear()}
              </h2>
              <button onClick={() => setMonthDate(d => new Date(d.getFullYear(), d.getMonth()+1, 1))}
                className="px-3 py-1.5 rounded-lg bg-white border border-gray-200 hover:bg-gray-50 text-sm font-medium">
                Próximo mês ›
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-between mb-4">
              <button onClick={() => setWeekStart(d => { const n = new Date(d); n.setDate(n.getDate() - 7); return n })}
                className="px-3 py-1.5 rounded-lg bg-white border border-gray-200 hover:bg-gray-50 text-sm font-medium">
                ‹ Semana anterior
              </button>
              <h2 className="text-base font-bold text-gray-800">
                {(() => {
                  const fim = new Date(weekStart); fim.setDate(fim.getDate() + 6)
                  const fmt = d => d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
                  return `${fmt(weekStart)} → ${fmt(fim)}`
                })()}
              </h2>
              <button onClick={() => setWeekStart(d => { const n = new Date(d); n.setDate(n.getDate() + 7); return n })}
                className="px-3 py-1.5 rounded-lg bg-white border border-gray-200 hover:bg-gray-50 text-sm font-medium">
                Próxima semana ›
              </button>
            </div>
          )}

          {/* ── Grade do calendário (Mês) ── */}
          {viewMode === 'mes' && (
          <div className="card overflow-hidden p-0 mb-6">
            <div className="grid grid-cols-7 border-b border-gray-200 bg-gray-50">
              {DIAS_SEMANA.map(d => (
                <div key={d} className="py-2 text-center text-xs font-semibold text-gray-500 border-r last:border-r-0 border-gray-100">{d}</div>
              ))}
            </div>
            <div className="grid grid-cols-7">
              {calDays.map(({ date, thisMonth }, idx) => {
                const key = toStr(date)
                const dayVisitas = visitasPorDia[key] || []
                const isToday = sameDay(date, today)
                const isWE = date.getDay() === 0 || date.getDay() === 6
                return (
                  <div key={idx} className={`min-h-[88px] p-1 border-r border-b last:border-r-0 border-gray-100 ${
                    !thisMonth ? 'bg-gray-50' : isWE ? 'bg-gray-50/40' : 'bg-white'
                  }`}>
                    <div className="text-center mb-1">
                      <span className={`inline-flex w-6 h-6 items-center justify-center rounded-full text-xs font-bold ${
                        isToday ? 'bg-primary text-white' : thisMonth ? 'text-gray-700' : 'text-gray-300'
                      }`}>{date.getDate()}</span>
                    </div>
                    {dayVisitas.slice(0, 3).map(v => (
                      <VisitaCardCompacto key={v._id} v={v} modo="mes" onClick={() => abrirEditar(v)} />
                    ))}
                    {dayVisitas.length > 3 && (
                      <div className="text-xs text-gray-400 px-1 font-medium">+{dayVisitas.length - 3}</div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
          )}

          {/* ── Grade da Semana ── */}
          {viewMode === 'semana' && (() => {
            // 7 dias começando em weekStart
            const dias = Array.from({ length: 7 }, (_, i) => {
              const d = new Date(weekStart); d.setDate(d.getDate() + i); return d
            })
            return (
              <div className="card overflow-hidden p-0 mb-6">
                <div className="grid grid-cols-7 border-b border-gray-200 bg-gray-50">
                  {dias.map((d, i) => {
                    const isToday = sameDay(d, today)
                    return (
                      <div key={i} className={`py-2 text-center border-r last:border-r-0 border-gray-100 ${isToday ? 'bg-primary/10' : ''}`}>
                        <div className={`text-xs font-semibold ${isToday ? 'text-primary' : 'text-gray-500'}`}>
                          {DIAS_SEMANA[d.getDay()]}
                        </div>
                        <div className={`text-sm mt-0.5 ${isToday ? 'text-primary font-bold' : 'text-gray-700'}`}>
                          {String(d.getDate()).padStart(2,'0')}/{String(d.getMonth()+1).padStart(2,'0')}
                        </div>
                      </div>
                    )
                  })}
                </div>
                <div className="grid grid-cols-7">
                  {dias.map((d, i) => {
                    const key = toStr(d)
                    const dayVisitas = (visitasPorDia[key] || [])
                      .sort((a, b) => (a.dataHora || '').localeCompare(b.dataHora || ''))
                    const isWE = d.getDay() === 0 || d.getDay() === 6
                    return (
                      <div key={i} className={`min-h-[260px] p-1.5 border-r border-b last:border-r-0 border-gray-100 ${isWE ? 'bg-gray-50/40' : 'bg-white'}`}>
                        {dayVisitas.length === 0 ? (
                          <div className="text-xs text-gray-300 text-center pt-4">—</div>
                        ) : dayVisitas.map(v => (
                          <VisitaCardCompacto key={v._id} v={v} modo="semana" onClick={() => abrirEditar(v)} />
                        ))}
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })()}

          {/* ── Lista do mês ── */}
          <div className="flex items-center gap-3 flex-wrap mb-3">
            <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wide">
              {viewMode === 'semana'
                ? (() => {
                    const fim = new Date(weekStart); fim.setDate(fim.getDate() + 6)
                    const fmt = d => d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
                    return `📋 Visitas de ${fmt(weekStart)} a ${fmt(fim)} (${visitasMes.length})`
                  })()
                : `📋 Visitas em ${MESES[monthDate.getMonth()]} (${visitasMes.length})`
              }
            </h3>
            <input
              type="search"
              value={filtroTexto}
              onChange={e => setFiltroTexto(e.target.value)}
              placeholder="🔍 Buscar condomínio, medidor, bairro…"
              className="flex-1 min-w-[200px] border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
            />
          </div>
          {visitasMes.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <div className="text-4xl mb-2">📅</div>
              <p>{filtroTexto ? 'Nenhuma visita encontrada para essa busca.' : 'Nenhuma visita neste mês.'}<br/>
                {!filtroTexto && <button onClick={abrirNova} className="text-primary underline mt-1">Criar nova visita</button>}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {visitasMes.map(v => {
                const sc = STATUS_CONFIG[v.status] || STATUS_CONFIG.reservado
                const isAcomp = !!v.acompanhamento
                const isPast = v.dataHora && new Date(v.dataHora) < new Date() && !['reservado'].includes(v.status)
                const corMed = isAcomp ? '#0d9488' : corDoMedidor(v.medidorEmail)
                const bgCard = isAcomp ? '#f0fdfa' : corClaraMedidor(v.medidorEmail)
                return (
                  <div key={v._id} className={`card p-4 border-l-4 transition-opacity ${isPast ? 'opacity-50' : ''}`}
                    style={{ borderLeftColor: corMed, background: bgCard }}>
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className="font-bold text-gray-800 text-sm">{v.nomeCondominio}</span>
                          {isAcomp && (
                            <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-teal-100 text-teal-700 border border-teal-200">
                              🔁 Acomp.
                            </span>
                          )}
                          {v.fonte === 'google' ? (
                            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 border border-blue-300">
                              📅 Google Calendar
                            </span>
                          ) : (
                            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${sc.bg} ${sc.text} border`} style={{ borderColor: sc.border }}>
                              {sc.label}
                            </span>
                          )}
                        </div>
                        <div className="text-sm text-gray-600 space-y-0.5">
                          {v.dataHora && <div>📅 {fmtData(v.dataHora)}{fmtHora(v.dataHora) ? ` às ${fmtHora(v.dataHora)}` : ''}</div>}
                          {v.endereco && <div>📍 {[v.endereco, v.bairro, v.cidade, v.estado].filter(Boolean).join(', ')}</div>}
                          <div className="flex items-center gap-1.5 flex-wrap mt-1">
                            {v.medidorNome && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-white text-xs font-semibold"
                                    style={{ background: corMed }}>
                                <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'white' }} />
                                📐 {v.medidorNome}
                              </span>
                            )}
                            {v.tecnicoResponsavel && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-gray-700 text-white">
                                🔧 {v.tecnicoResponsavel}
                              </span>
                            )}
                          </div>
                          {v.nomeResponsavel && <div>👤 {v.nomeResponsavel}{v.telefone ? ` · ${v.telefone}` : ''}</div>}
                          {v.observacao && <div className="text-gray-500 italic">💬 {v.observacao}</div>}
                          {Array.isArray(v.fotosCliente) && v.fotosCliente.length > 0 && (
                            <div className="text-blue-600 text-xs">📎 {v.fotosCliente.length} foto(s) anexada(s) pro medidor</div>
                          )}
                          {/* Info de conclusão pelo medidor */}
                          {v.concluidaEm && (
                            <div className="mt-2 p-2 bg-green-50 border border-green-200 rounded-lg text-xs text-green-800">
                              ✅ <strong>Medição enviada pelo medidor</strong>
                              <div className="text-green-700 mt-0.5">
                                {new Date(v.concluidaEm).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                              </div>
                              {v.numeroMedicao && (
                                <div className="text-green-700 mt-0.5">
                                  📐 Medição <strong>#{String(v.numeroMedicao).padStart(3, '0')}</strong>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-col gap-1.5 flex-shrink-0">
                        {v.fonte === 'google' && (
                          <span className="text-xs px-3 py-1.5 bg-gray-100 text-gray-500 rounded-lg font-semibold italic">
                            🔒 Somente leitura
                          </span>
                        )}
                        {v.fonte !== 'google' && v.status === 'reservado' && (
                          <button onClick={() => confirmar(v._id, 'confirmado')}
                            disabled={confirmandoId === v._id}
                            className="text-xs px-3 py-1.5 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700 transition-colors disabled:opacity-50">
                            {confirmandoId === v._id ? '...' : '✅ Confirmar'}
                          </button>
                        )}
                        {v.fonte !== 'google' && v.status === 'confirmado' && (
                          <button onClick={() => confirmar(v._id, 'reservado')}
                            disabled={confirmandoId === v._id}
                            className="text-xs px-3 py-1.5 bg-orange-500 text-white rounded-lg font-semibold hover:bg-orange-600 transition-colors disabled:opacity-50">
                            🔒 Reservar
                          </button>
                        )}
                        {v.fonte !== 'google' && (
                        <button onClick={() => abrirEditar(v)}
                          className="text-xs px-3 py-1.5 bg-blue-100 text-blue-700 rounded-lg font-semibold hover:bg-blue-200 transition-colors">
                          ✏️ Editar
                        </button>
                        )}
                        {v.fonte !== 'google' && (
                          <button onClick={() => excluir(v._id)}
                            className="text-xs px-3 py-1.5 bg-red-100 text-red-700 rounded-lg font-semibold hover:bg-red-200 transition-colors">
                            🗑 Excluir
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}

      {/* ── Modal: Nova/Editar Visita ── */}
      {modalAberto && (
        <NovaVisitaModal
          visita={visitaEditando}
          onSalvar={onSalvar}
          onFechar={() => setModalAberto(false)}
          onExcluir={visitaEditando ? async () => {
            if (!confirm('Excluir esta visita? Ela irá para a lixeira.')) return
            try {
              await api.deleteVisita(visitaEditando._id || visitaEditando.id)
              setModalAberto(false)
              setSucesso('Visita excluída.')
              await load()
              setTimeout(() => setSucesso(''), 3000)
            } catch (e) { alert('Erro ao excluir: ' + e.message) }
          } : undefined}
        />
      )}

      {/* ── Modal: Mudar Modo da Agenda ── */}
      {showModoModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowModoModal(false)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-gray-800 mb-2">⚙️ Modo da Agenda de Visitas</h2>
            <p className="text-sm text-gray-500 mb-4">Define de onde o PWA Medidor busca os compromissos.</p>
            <div className="space-y-3">
              {[
                { modo: 'google',  titulo: '📅 Apenas Google Calendar', desc: 'Comportamento atual. Medidor usa somente o Google Calendar. Visitas desta agenda NÃO aparecem.' },
                { modo: 'misto',   titulo: '📅 + 📋 Modo Misto (recomendado para transição)', desc: 'Medidor mostra eventos do Google Calendar E visitas desta agenda, com badge de fonte para diferenciar.' },
                { modo: 'proprio', titulo: '📋 Apenas Agenda Própria', desc: '⚠️ Google Calendar desativado no medidor. Apenas visitas desta agenda aparecem. Use após completar a transição.' },
              ].map(({ modo, titulo, desc }) => (
                <div key={modo}
                  className={`p-4 rounded-xl border-2 cursor-pointer transition-all ${agendaMode === modo ? 'border-primary bg-primary/5' : 'border-gray-200 hover:border-gray-300'}`}
                  onClick={() => !mudandoModo && mudarModo(modo)}>
                  <div className="font-semibold text-gray-800 text-sm mb-1">{titulo}</div>
                  <div className="text-xs text-gray-500">{desc}</div>
                  {agendaMode === modo && <div className="text-xs text-primary font-bold mt-1">✓ Modo atual</div>}
                </div>
              ))}
            </div>
            <button onClick={() => setShowModoModal(false)} className="mt-4 w-full text-sm py-2 rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors">
              Fechar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
