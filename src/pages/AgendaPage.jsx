import React, { useEffect, useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api/client.js'

// ── Cores por status ──────────────────────────────────────────────────────────
const STATUS_COLORS = {
  agendada:              { bg: '#dbeafe', text: '#1e40af', border: '#93c5fd' },
  em_andamento:          { bg: '#fef9c3', text: '#854d0e', border: '#fcd34d' },
  aguardando_assinatura: { bg: '#fff7ed', text: '#9a3412', border: '#fdba74' },
  concluida:             { bg: '#dcfce7', text: '#166534', border: '#86efac' },
  cancelada:             { bg: '#fee2e2', text: '#991b1b', border: '#fca5a5' },
}
const STATUS_LABEL = {
  agendada: 'Agendada',
  em_andamento: 'Em Andamento',
  aguardando_assinatura: 'Aguard. Assin.',
  concluida: 'Concluída',
  cancelada: 'Cancelada',
}

// Paleta de cores para as equipes (cor de fundo do cabeçalho da linha)
const EQUIPE_PALETTE = [
  '#e87722','#1a5c9a','#16a34a','#9333ea','#dc2626',
  '#0891b2','#d97706','#4f46e5','#059669','#c026d3',
]

const WEEK_DAYS_SHORT = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb']
const WEEK_DAYS_FULL  = ['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado']
const MONTHS = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']

// ── Helpers de data ───────────────────────────────────────────────────────────
function parseLocal(str) {
  if (!str) return null
  const [y, m, d] = str.split('-').map(Number)
  return new Date(y, m - 1, d)
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
// Início da semana (segunda-feira)
function startOfWeek(date) {
  const d = new Date(date)
  const dow = d.getDay()
  const diff = dow === 0 ? -6 : 1 - dow  // segunda
  d.setDate(d.getDate() + diff)
  d.setHours(0, 0, 0, 0)
  return d
}
function addDays(date, n) {
  const d = new Date(date)
  d.setDate(d.getDate() + n)
  return d
}
function fmtPtBR(date) {
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
}

// ── Componente principal ──────────────────────────────────────────────────────
export default function AgendaPage() {
  const navigate = useNavigate()
  const [ordens,  setOrdens]  = useState([])
  const [equipes, setEquipes] = useState([])
  const [loading, setLoading] = useState(true)

  const [viewMode,     setViewMode]     = useState('semana') // 'semana' | 'mes' | 'lista'
  const [filtroStatus, setFiltroStatus] = useState('todos')
  const [filtroTipo,   setFiltroTipo]   = useState('todos')
  const [filtroEquipe, setFiltroEquipe] = useState('')       // equipeId | '' = todas

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  // Datas de navegação
  const [weekStart, setWeekStart] = useState(() => startOfWeek(today))
  const [monthDate, setMonthDate] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1))

  useEffect(() => {
    Promise.all([api.getOrdensServico(), api.getEquipes()])
      .then(([oss, eqs]) => { setOrdens(oss); setEquipes(eqs) })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  // ── Filtragem base ──────────────────────────────────────────────────────────
  const ordensFiltradas = useMemo(() => {
    return ordens.filter(os => {
      if (os.status === 'cancelada' && filtroStatus !== 'cancelada') return false
      if (filtroStatus !== 'todos' && os.status !== filtroStatus) return false
      if (filtroTipo !== 'todos' && (os.tipo || 'normal') !== filtroTipo) return false
      if (filtroEquipe && (os.equipeId || '') !== filtroEquipe) return false
      return true
    })
  }, [ordens, filtroStatus, filtroTipo, filtroEquipe])

  // Mapa dia→[OS] para views rápidas
  const osPerDay = useMemo(() => {
    const map = {}
    ordensFiltradas.forEach(os => {
      const start = parseLocal(os.dataInicio)
      const end   = parseLocal(os.dataTermino) || start
      if (!start) return
      const cur = new Date(start)
      while (cur <= end) {
        const key = toStr(cur)
        if (!map[key]) map[key] = []
        map[key].push(os)
        cur.setDate(cur.getDate() + 1)
      }
    })
    return map
  }, [ordensFiltradas])

  // ── Vista SEMANA: mapa equipe → dia → [OS] ─────────────────────────────────
  const weekDays = useMemo(() =>
    Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
  [weekStart])

  // Equipes que aparecem na semana (+ suas cores)
  const equipesNaSemana = useMemo(() => {
    const semanaKeys = weekDays.map(toStr)
    const ids = new Set()
    semanaKeys.forEach(k => (osPerDay[k] || []).forEach(os => ids.add(os.equipeId || '__sem_equipe__')))
    // Também adiciona equipes do filtro se estiver filtrando
    if (filtroEquipe) ids.add(filtroEquipe)
    // Sempre mostra todas as equipes cadastradas no topo, mesmo sem OS na semana
    equipes.forEach(eq => ids.add(eq.id || eq._id))
    ids.add('__sem_equipe__')

    return Array.from(ids).map((eqId, idx) => {
      if (eqId === '__sem_equipe__') return { id: '__sem_equipe__', nome: 'Sem equipe', cor: '#9ca3af' }
      const eq = equipes.find(e => (e.id || e._id) === eqId)
      return {
        id: eqId,
        nome: eq?.nome || 'Equipe',
        cor: eq?.cor || EQUIPE_PALETTE[idx % EQUIPE_PALETTE.length],
      }
    }).filter((e, i, arr) => arr.findIndex(x => x.id === e.id) === i) // dedup
  }, [weekDays, osPerDay, equipes, filtroEquipe])

  // Para cada equipe, para cada dia, lista de OS
  const weekMatrix = useMemo(() => {
    const matrix = {}
    equipesNaSemana.forEach(eq => {
      matrix[eq.id] = {}
      weekDays.forEach(d => {
        const key = toStr(d)
        const dayOS = osPerDay[key] || []
        matrix[eq.id][key] = eq.id === '__sem_equipe__'
          ? dayOS.filter(os => !os.equipeId)
          : dayOS.filter(os => os.equipeId === eq.id)
      })
    })
    return matrix
  }, [equipesNaSemana, weekDays, osPerDay])

  // Navega semana
  const prevWeek = () => setWeekStart(d => addDays(d, -7))
  const nextWeek = () => setWeekStart(d => addDays(d, +7))
  const goHoje   = () => {
    setWeekStart(startOfWeek(today))
    setMonthDate(new Date(today.getFullYear(), today.getMonth(), 1))
  }

  // ── Calendario mês ─────────────────────────────────────────────────────────
  const calDays = useMemo(() => {
    const year = monthDate.getFullYear()
    const month = monthDate.getMonth()
    const firstDay = new Date(year, month, 1)
    const lastDay  = new Date(year, month + 1, 0)
    const startPad = firstDay.getDay()
    const days = []
    for (let i = startPad - 1; i >= 0; i--)  days.push({ date: new Date(year, month, -i),   thisMonth: false })
    for (let d = 1; d <= lastDay.getDate(); d++) days.push({ date: new Date(year, month, d), thisMonth: true })
    const rem = (7 - days.length % 7) % 7
    for (let i = 1; i <= rem; i++) days.push({ date: new Date(year, month + 1, i), thisMonth: false })
    return days
  }, [monthDate])

  const prevMonth = () => setMonthDate(d => new Date(d.getFullYear(), d.getMonth() - 1, 1))
  const nextMonth = () => setMonthDate(d => new Date(d.getFullYear(), d.getMonth() + 1, 1))

  // OS do mês (para lista)
  const osNoMes = useMemo(() => {
    const year = monthDate.getFullYear()
    const month = monthDate.getMonth()
    const ms = new Date(year, month, 1)
    const me = new Date(year, month + 1, 0)
    return ordensFiltradas.filter(os => {
      const s = parseLocal(os.dataInicio)
      const e = parseLocal(os.dataTermino) || s
      return s && s <= me && e >= ms
    }).sort((a, b) => (parseLocal(a.dataInicio) || 0) - (parseLocal(b.dataInicio) || 0))
  }, [ordensFiltradas, monthDate])

  // ── Label de período ────────────────────────────────────────────────────────
  const weekLabel = useMemo(() => {
    const end = addDays(weekStart, 6)
    if (weekStart.getMonth() === end.getMonth())
      return `${weekStart.getDate()} – ${end.getDate()} de ${MONTHS[weekStart.getMonth()]} ${weekStart.getFullYear()}`
    return `${fmtPtBR(weekStart)} – ${fmtPtBR(end)} ${end.getFullYear()}`
  }, [weekStart])

  const isCurrentWeek = sameDay(weekStart, startOfWeek(today))

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
    </div>
  )

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">📅 Agenda de Obras</h1>
          <p className="text-gray-500 text-sm mt-0.5">Onde cada equipe está e o que está por vir</p>
        </div>

        {/* View toggle */}
        <div className="flex rounded-lg overflow-hidden border border-gray-200 shadow-sm">
          {[['semana','🗓️ Semana'],['mes','📅 Mês'],['lista','📋 Lista']].map(([v, l]) => (
            <button key={v} onClick={() => setViewMode(v)}
              className={`px-4 py-2 text-sm font-medium transition-colors ${viewMode === v ? 'bg-primary text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
              {l}
            </button>
          ))}
        </div>
      </div>

      {/* ── Filtros ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-2 mb-4 items-center">
        <select className="input text-sm py-1.5 w-40" value={filtroEquipe} onChange={e => setFiltroEquipe(e.target.value)}>
          <option value="">Todas as equipes</option>
          {equipes.map(eq => <option key={eq.id||eq._id} value={eq.id||eq._id}>{eq.nome}</option>)}
        </select>
        <select className="input text-sm py-1.5 w-36" value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)}>
          <option value="todos">Todos os status</option>
          {Object.entries(STATUS_LABEL).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select className="input text-sm py-1.5 w-28" value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)}>
          <option value="todos">Todos tipos</option>
          <option value="normal">Obra</option>
          <option value="reparo">Reparo</option>
        </select>
        {(filtroEquipe || filtroStatus !== 'todos' || filtroTipo !== 'todos') && (
          <button onClick={() => { setFiltroEquipe(''); setFiltroStatus('todos'); setFiltroTipo('todos') }}
            className="text-sm text-red-500 hover:underline">✕ Limpar</button>
        )}
      </div>

      {/* ── Navegação ──────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-4">
        <button onClick={viewMode === 'mes' ? prevMonth : prevWeek}
          className="btn-secondary px-3 py-1.5 text-sm flex items-center gap-1">
          ‹ {viewMode === 'mes' ? 'Mês anterior' : 'Semana anterior'}
        </button>
        <div className="flex items-center gap-3">
          <span className="font-bold text-gray-800 text-base">
            {viewMode === 'mes'
              ? `${MONTHS[monthDate.getMonth()]} ${monthDate.getFullYear()}`
              : viewMode === 'lista'
              ? `${MONTHS[monthDate.getMonth()]} ${monthDate.getFullYear()}`
              : weekLabel}
          </span>
          {!isCurrentWeek && viewMode === 'semana' && (
            <button onClick={goHoje} className="text-xs text-primary font-medium hover:underline bg-orange-50 px-2 py-0.5 rounded-full">
              ↩ Hoje
            </button>
          )}
          {viewMode !== 'semana' && (
            <button onClick={goHoje} className="text-xs text-primary font-medium hover:underline">Hoje</button>
          )}
        </div>
        <button onClick={viewMode === 'mes' ? nextMonth : nextWeek}
          className="btn-secondary px-3 py-1.5 text-sm flex items-center gap-1">
          {viewMode === 'mes' ? 'Próximo mês' : 'Próxima semana'} ›
        </button>
      </div>

      {/* ══════════════════ VISTA SEMANA ══════════════════════════════════════ */}
      {viewMode === 'semana' && (
        <div className="card p-0 overflow-hidden overflow-x-auto">
          <table className="w-full border-collapse min-w-[700px]">
            <thead>
              <tr>
                {/* Cabeçalho equipe */}
                <th className="border-r border-b border-gray-200 p-3 bg-gray-50 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide w-36">
                  Equipe
                </th>
                {weekDays.map((d, idx) => {
                  const isToday = sameDay(d, today)
                  const isWeekend = d.getDay() === 0 || d.getDay() === 6
                  return (
                    <th key={idx}
                      className={`border-r last:border-r-0 border-b border-gray-200 p-2 text-center text-xs font-semibold min-w-[100px] ${
                        isToday ? 'bg-orange-50' : isWeekend ? 'bg-gray-50' : 'bg-white'
                      }`}>
                      <div className={`font-semibold ${isToday ? 'text-primary' : 'text-gray-600'}`}>
                        {WEEK_DAYS_FULL[d.getDay()]}
                      </div>
                      <div className={`text-sm mt-0.5 ${isToday ? 'text-primary font-bold' : 'text-gray-400'}`}>
                        {d.getDate()}/{d.getMonth()+1}
                      </div>
                      {isToday && <div className="w-1.5 h-1.5 bg-primary rounded-full mx-auto mt-1"/>}
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody>
              {equipesNaSemana.map((eq, eqIdx) => {
                const rowMatrix = weekMatrix[eq.id] || {}
                // Verifica se a equipe tem alguma OS na semana visível
                const temOSNaSemana = weekDays.some(d => (rowMatrix[toStr(d)] || []).length > 0)
                // Oculta "sem equipe" se não tiver OS
                if (eq.id === '__sem_equipe__' && !temOSNaSemana) return null

                return (
                  <tr key={eq.id} className="border-b border-gray-100 hover:bg-gray-50/50 transition-colors">
                    {/* Nome da equipe */}
                    <td className="border-r border-gray-200 p-2 align-top">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: eq.cor }} />
                        <span className="text-xs font-semibold text-gray-700 leading-tight">{eq.nome}</span>
                      </div>
                      {!temOSNaSemana && (
                        <div className="text-xs text-gray-300 mt-1 italic">sem obra</div>
                      )}
                    </td>

                    {/* Células por dia */}
                    {weekDays.map((d, dIdx) => {
                      const key = toStr(d)
                      const dayOS = rowMatrix[key] || []
                      const isToday = sameDay(d, today)
                      const isWeekend = d.getDay() === 0 || d.getDay() === 6

                      return (
                        <td key={dIdx}
                          className={`border-r last:border-r-0 border-gray-100 p-1.5 align-top min-h-[64px] ${
                            isToday ? 'bg-orange-50/40' : isWeekend ? 'bg-gray-50/50' : ''
                          }`}
                          style={{ minWidth: 100, minHeight: 64 }}>
                          {dayOS.length === 0 ? (
                            <div className="h-8" /> // espaço vazio
                          ) : dayOS.map(os => {
                            const id = os.id || os._id
                            const c  = STATUS_COLORS[os.status] || STATUS_COLORS.agendada
                            const isReparo = (os.tipo || 'normal') === 'reparo'
                            const isStart  = sameDay(d, parseLocal(os.dataInicio))
                            const isEnd    = sameDay(d, parseLocal(os.dataTermino) || parseLocal(os.dataInicio))
                            return (
                              <div key={id}
                                onClick={() => navigate(`/ordens-servico/${id}`)}
                                title={`OS #${String(os.numero||'').padStart(3,'0')} — ${os.cliente}\nStatus: ${STATUS_LABEL[os.status]||os.status}${os.tipoReparo?' — '+os.tipoReparo:''}`}
                                className="cursor-pointer mb-1 hover:opacity-80 transition-opacity text-xs leading-tight px-1.5 py-1 rounded"
                                style={{
                                  background: c.bg,
                                  color: c.text,
                                  border: `1.5px solid ${c.border}`,
                                  borderLeft: isStart ? `3px solid ${eq.cor}` : `1.5px solid ${c.border}`,
                                  borderRadius: isStart && isEnd ? 4 : isStart ? '4px 0 0 4px' : isEnd ? '0 4px 4px 0' : 2,
                                }}>
                                <div className="font-bold truncate">
                                  {isReparo ? '🔧' : '🏗️'} #{String(os.numero||'').padStart(3,'0')}
                                </div>
                                <div className="truncate opacity-80">{os.cliente}</div>
                                {isStart && os.dataTermino && !isEnd && (
                                  <div className="text-xs opacity-60">até {fmtPtBR(parseLocal(os.dataTermino))}</div>
                                )}
                              </div>
                            )
                          })}
                        </td>
                      )
                    })}
                  </tr>
                )
              })}

              {/* Linha "nenhuma OS na semana" se todas as equipes estiverem sem */}
              {equipesNaSemana.every(eq => weekDays.every(d => (weekMatrix[eq.id]?.[toStr(d)] || []).length === 0)) && (
                <tr>
                  <td colSpan={8} className="text-center py-8 text-gray-400 text-sm italic">
                    Nenhuma obra programada para esta semana
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* ══════════════════ VISTA MÊS ════════════════════════════════════════ */}
      {viewMode === 'mes' && (
        <div className="card overflow-hidden p-0">
          {/* Cabeçalho dos dias */}
          <div className="grid grid-cols-7 border-b border-gray-200">
            {['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'].map(d => (
              <div key={d} className="py-2 text-center text-xs font-semibold text-gray-500 border-r last:border-r-0 border-gray-100">
                {d}
              </div>
            ))}
          </div>
          {/* Grade de dias */}
          <div className="grid grid-cols-7">
            {calDays.map(({ date, thisMonth }, idx) => {
              const key     = toStr(date)
              const dayOS   = osPerDay[key] || []
              const isToday = sameDay(date, today)
              const isSat   = date.getDay() === 6
              const isSun   = date.getDay() === 0

              return (
                <div key={idx}
                  className={`min-h-[96px] p-1 border-r border-b last:border-r-0 border-gray-100
                    ${!thisMonth ? 'bg-gray-50' : (isSat||isSun) ? 'bg-gray-50/40' : 'bg-white'}`}>
                  {/* Número do dia */}
                  <div className={`text-xs font-bold mb-1 w-6 h-6 flex items-center justify-center rounded-full mx-auto
                    ${isToday ? 'bg-primary text-white' : thisMonth ? 'text-gray-700' : 'text-gray-300'}`}>
                    {date.getDate()}
                  </div>
                  {/* Eventos */}
                  <div className="space-y-0.5">
                    {dayOS.slice(0, 3).map(os => {
                      const id      = os.id || os._id
                      const c       = STATUS_COLORS[os.status] || STATUS_COLORS.agendada
                      const eqIdx   = equipes.findIndex(e => (e.id||e._id) === os.equipeId)
                      const eq      = equipes[eqIdx]
                      const eqColor = eq?.cor || EQUIPE_PALETTE[Math.max(eqIdx,0) % EQUIPE_PALETTE.length] || '#9ca3af'
                      const isReparo = (os.tipo||'normal') === 'reparo'

                      // Concluída/cancelada = cor suavizada; ativa = cor sólida
                      const chipBg = os.status === 'cancelada' ? '#9ca3af'
                        : os.status === 'concluida' ? eqColor + 'bb'
                        : eqColor

                      return (
                        <div key={id}
                          onClick={() => navigate(`/ordens-servico/${id}`)}
                          className="cursor-pointer rounded overflow-hidden hover:brightness-90 transition-all"
                          style={{ background: chipBg, boxShadow: `0 1px 3px ${eqColor}55` }}
                          title={`${os.equipeNome||'Sem equipe'} — OS #${String(os.numero||'').padStart(3,'0')} — ${os.cliente}\nStatus: ${STATUS_LABEL[os.status]||os.status}`}>
                          {/* Faixa de status no topo */}
                          <div style={{ height: 3, background: c.border, opacity: 0.9 }} />
                          <div className="px-1.5 py-0.5">
                            <div className="font-bold text-white leading-tight truncate" style={{ fontSize: 10 }}>
                              {isReparo ? '🔧 ' : ''}#{String(os.numero||'').padStart(3,'0')}
                              {os.equipeNome && <span style={{ fontWeight: 500, opacity: 0.85 }}> · {os.equipeNome}</span>}
                            </div>
                            <div className="truncate leading-tight text-white" style={{ fontSize: 9, opacity: 0.85 }}>
                              {os.cliente}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                    {dayOS.length > 3 && (
                      <div className="text-xs text-gray-400 px-1 font-medium">+{dayOS.length - 3} mais</div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Legenda de equipes dentro do calendário */}
          {equipes.length > 0 && (
            <div className="border-t border-gray-100 px-4 py-3 bg-gray-50 flex flex-wrap gap-2 items-center">
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide mr-1">Equipes:</span>
              {equipes.map((eq, eqIdx) => {
                const cor = eq.cor || EQUIPE_PALETTE[eqIdx % EQUIPE_PALETTE.length]
                return (
                  <button key={eq.id||eq._id}
                    onClick={() => setFiltroEquipe(filtroEquipe === (eq.id||eq._id) ? '' : (eq.id||eq._id))}
                    className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-semibold border-2 transition-all ${
                      filtroEquipe === (eq.id||eq._id)
                        ? 'text-white ring-2 ring-offset-1 ring-gray-400'
                        : 'hover:opacity-90'
                    }`}
                    style={{
                      background: filtroEquipe === (eq.id||eq._id) ? cor : cor + '22',
                      borderColor: cor,
                      color: filtroEquipe === (eq.id||eq._id) ? 'white' : cor,
                    }}>
                    <span className="w-2.5 h-2.5 rounded-full inline-block flex-shrink-0" style={{ background: cor }}/>
                    {eq.nome}
                  </button>
                )
              })}
              {/* Legenda de status */}
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide mx-2">Status (faixa):</span>
              {Object.entries(STATUS_COLORS).slice(0,4).map(([k, c]) => (
                <span key={k} className="flex items-center gap-1 text-xs text-gray-500">
                  <span className="inline-block w-6 h-1.5 rounded-full" style={{ background: c.border }}/>
                  {STATUS_LABEL[k]}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ══════════════════ VISTA LISTA ══════════════════════════════════════ */}
      {viewMode === 'lista' && (
        <div>
          {osNoMes.length === 0 ? (
            <div className="card text-center py-12">
              <div className="text-4xl mb-3">📅</div>
              <p className="text-gray-500">Nenhuma obra neste mês com os filtros selecionados</p>
            </div>
          ) : (
            <div className="space-y-2">
              {osNoMes.map(os => {
                const id       = os.id || os._id
                const c        = STATUS_COLORS[os.status] || STATUS_COLORS.agendada
                const isReparo = (os.tipo || 'normal') === 'reparo'
                const start    = parseLocal(os.dataInicio)
                const end      = parseLocal(os.dataTermino)
                const eq       = equipes.find(e => (e.id||e._id) === os.equipeId)
                const eqColor  = eq?.cor || '#9ca3af'

                const diffDays = end ? Math.ceil((end - today) / 86400000) : null
                let prazo = null
                if (diffDays !== null && os.status === 'em_andamento') {
                  if (diffDays < 0)    prazo = { text: `${Math.abs(diffDays)}d atrasado`, cls: 'bg-red-100 text-red-700' }
                  else if (!diffDays)  prazo = { text: 'Termina hoje',                    cls: 'bg-orange-100 text-orange-700' }
                  else                 prazo = { text: `${diffDays}d restante${diffDays > 1 ? 's' : ''}`, cls: 'bg-blue-50 text-blue-700' }
                }

                return (
                  <div key={id}
                    onClick={() => navigate(`/ordens-servico/${id}`)}
                    className="card cursor-pointer hover:shadow-md transition-shadow py-3"
                    style={{ borderLeft: `4px solid ${eqColor}` }}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className="font-bold text-primary text-sm">
                            {isReparo ? '🔧' : '🏗️'} OS #{String(os.numero || '').padStart(3, '0')}
                          </span>
                          <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                            style={{ background: c.bg, color: c.text }}>{STATUS_LABEL[os.status] || os.status}</span>
                          {isReparo && <span className="text-xs bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full">REPARO</span>}
                          {prazo && <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${prazo.cls}`}>⏱ {prazo.text}</span>}
                        </div>
                        <div className="flex items-center gap-2 mb-0.5">
                          {os.equipeNome && (
                            <span className="text-xs font-semibold px-2 py-0.5 rounded-full text-white" style={{ background: eqColor }}>
                              👷 {os.equipeNome}
                            </span>
                          )}
                          {os.tecnicoResponsavel && (
                            <span className="text-xs bg-orange-50 text-orange-700 px-2 py-0.5 rounded-full">🔧 {os.tecnicoResponsavel}</span>
                          )}
                        </div>
                        <p className="font-semibold text-gray-800 text-sm">{os.cliente}</p>
                        {os.endereco && <p className="text-xs text-gray-500 truncate">{os.endereco}{os.cidade ? `, ${os.cidade}` : ''}</p>}
                        <div className="flex gap-3 mt-1 text-xs text-gray-400 flex-wrap">
                          {start && <span>📅 {fmtPtBR(start)}{end && !sameDay(start,end) ? ` → ${fmtPtBR(end)}` : ''}</span>}
                          {os.diasTrabalho > 0 && <span>⏱ {os.diasTrabalho} dias</span>}
                          {(os.pontos||[]).length > 0 && <span>📍 {os.pontos.length} local(is)</span>}
                        </div>
                      </div>
                      <div className="flex-shrink-0 text-right">
                        <div className="text-lg font-bold text-gray-700">{os.progresso || 0}%</div>
                        <div className="w-14 h-1.5 bg-gray-200 rounded-full mt-1">
                          <div className="h-1.5 bg-primary rounded-full" style={{ width: `${os.progresso||0}%` }}/>
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Legenda + Resumo ─────────────────────────────────────────────────── */}
      <div className="mt-5 flex flex-wrap gap-4 items-start">
        {/* Equipes */}
        {equipes.length > 0 && (
          <div className="flex-1 min-w-48">
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Equipes</div>
            <div className="flex flex-wrap gap-2">
              {equipes.map((eq, idx) => (
                <button key={eq.id||eq._id}
                  onClick={() => setFiltroEquipe(filtroEquipe === (eq.id||eq._id) ? '' : (eq.id||eq._id))}
                  className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded-full border transition-all ${
                    filtroEquipe === (eq.id||eq._id) ? 'ring-2 ring-offset-1 ring-primary' : 'opacity-80 hover:opacity-100'
                  }`}
                  style={{
                    background: (eq.cor || EQUIPE_PALETTE[idx % EQUIPE_PALETTE.length]) + '22',
                    borderColor: eq.cor || EQUIPE_PALETTE[idx % EQUIPE_PALETTE.length],
                    color: eq.cor || EQUIPE_PALETTE[idx % EQUIPE_PALETTE.length],
                  }}>
                  <div className="w-2 h-2 rounded-full" style={{ background: eq.cor || EQUIPE_PALETTE[idx % EQUIPE_PALETTE.length] }}/>
                  {eq.nome}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Resumo numérico */}
        <div className="grid grid-cols-4 gap-2">
          {[
            { label: 'Em andamento', value: ordensFiltradas.filter(o => o.status === 'em_andamento').length, color: 'text-yellow-700', bg: 'bg-yellow-50' },
            { label: 'Agendadas',    value: ordensFiltradas.filter(o => o.status === 'agendada').length,    color: 'text-blue-700',   bg: 'bg-blue-50' },
            { label: 'Concluídas',   value: ordensFiltradas.filter(o => o.status === 'concluida').length,   color: 'text-green-700',  bg: 'bg-green-50' },
            { label: 'Total',        value: ordensFiltradas.filter(o => o.status !== 'cancelada').length,   color: 'text-gray-800',   bg: 'bg-gray-50' },
          ].map(({ label, value, color, bg }) => (
            <div key={label} className={`${bg} rounded-lg px-3 py-2 text-center min-w-[70px]`}>
              <div className={`text-xl font-bold ${color}`}>{value}</div>
              <div className="text-xs text-gray-500 mt-0.5 leading-tight">{label}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
