import React, { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api/client.js'

// ── Helpers de Data ──────────────────────────────────────────────────────────

function isoDate(d) { return d.toISOString().split('T')[0] }
function fmtBR(str) {
  if (!str) return '—'
  return new Date(str + 'T12:00:00').toLocaleDateString('pt-BR')
}
function fmtBRShort(str) {
  if (!str) return ''
  return new Date(str + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}

function getPeriodDates(period, customStart, customEnd) {
  const today = new Date()
  const todayStr = isoDate(today)
  if (period === 'today') return { start: todayStr, end: todayStr, label: `Hoje, ${fmtBR(todayStr)}` }
  if (period === 'week') {
    const day = today.getDay() === 0 ? 7 : today.getDay()
    const mon = new Date(today); mon.setDate(today.getDate() - (day - 1))
    const sun = new Date(mon);   sun.setDate(mon.getDate() + 6)
    const s = isoDate(mon), e = isoDate(sun)
    return { start: s, end: e, label: `Semana de ${fmtBRShort(s)} a ${fmtBR(e)}` }
  }
  if (period === '15days') {
    const d = new Date(today); d.setDate(today.getDate() - 14)
    return { start: isoDate(d), end: todayStr, label: 'Últimos 15 dias' }
  }
  if (period === '30days') {
    const d = new Date(today); d.setDate(today.getDate() - 29)
    return { start: isoDate(d), end: todayStr, label: 'Últimos 30 dias' }
  }
  if (period === 'custom') {
    const s = customStart || todayStr, e = customEnd || todayStr
    return { start: s, end: e, label: `${fmtBR(s)} a ${fmtBR(e)}` }
  }
  return { start: todayStr, end: todayStr, label: '' }
}

// ── Metric Card — gradient, white text ───────────────────────────────────────

function MetricCard({ label, value, sub, icon, gradient, trend, onClick }) {
  const isUp   = trend > 0
  const isDown = trend < 0
  return (
    <div
      onClick={onClick}
      className={`relative overflow-hidden rounded-2xl p-5 text-white shadow-md cursor-pointer
        hover:shadow-xl hover:-translate-y-0.5 active:scale-95 transition-all duration-200 ${gradient}`}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold uppercase tracking-widest opacity-75 mb-1">{label}</p>
          <p className="text-4xl font-black leading-none">{value ?? '—'}</p>
          {sub && <p className="text-xs opacity-65 mt-1.5 truncate">{sub}</p>}
        </div>
        <span className="text-3xl opacity-40 flex-shrink-0 ml-2">{icon}</span>
      </div>
      {trend != null && (
        <div className={`mt-3 flex items-center gap-1 text-xs font-semibold
          ${isUp ? 'text-green-200' : isDown ? 'text-red-200' : 'text-white/50'}`}>
          <span className="text-sm">{isUp ? '↑' : isDown ? '↓' : '→'}</span>
          <span>{isUp ? `+${trend}` : trend} vs anterior</span>
        </div>
      )}
      {/* Decorative circles */}
      <div className="absolute -right-5 -bottom-5 w-24 h-24 rounded-full bg-white/10 pointer-events-none" />
      <div className="absolute -right-10 -bottom-10 w-36 h-36 rounded-full bg-white/5 pointer-events-none" />
    </div>
  )
}

// ── GVF Consumption Progress Bar ─────────────────────────────────────────────

function ConsumoProgressBar({ label, real, estimado }) {
  const pct = estimado > 0 ? Math.min(100, (real / estimado) * 100) : 0
  const over = real > estimado
  return (
    <div className="mb-4">
      <div className="flex justify-between items-baseline mb-1.5">
        <span className="text-sm font-medium text-gray-700">{label}</span>
        <div className="text-right">
          <span className={`text-base font-bold ${over ? 'text-red-600' : 'text-orange-600'}`}>
            {real.toFixed(1)}L
          </span>
          <span className="text-xs text-gray-400 ml-1">/ {estimado.toFixed(1)}L est.</span>
        </div>
      </div>
      <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-700 ${over ? 'bg-red-400' : 'bg-gradient-to-r from-orange-400 to-orange-500'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="flex justify-between text-[10px] text-gray-400 mt-0.5">
        <span>0L</span>
        <span className={`font-medium ${over ? 'text-red-500' : 'text-gray-500'}`}>
          {pct.toFixed(0)}% {over ? '⚠ acima' : 'do estimado'}
        </span>
      </div>
    </div>
  )
}

// ── Status Progress Row ───────────────────────────────────────────────────────

function StatusRow({ label, value, total, colorClass, dotColor }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0
  return (
    <div className="flex items-center gap-3 py-2">
      <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${dotColor}`} />
      <div className="flex-1">
        <div className="flex justify-between text-sm mb-1">
          <span className="text-gray-600">{label}</span>
          <span className="font-bold text-gray-800">{value}</span>
        </div>
        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
          <div className={`h-full rounded-full transition-all duration-700 ${colorClass}`} style={{ width: `${pct}%` }} />
        </div>
      </div>
      <span className="text-xs text-gray-400 w-8 text-right">{pct}%</span>
    </div>
  )
}

// ── Comparativo Row ───────────────────────────────────────────────────────────

function ComparativoRow({ label, atual, anterior }) {
  const diff = atual - anterior
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-gray-50 last:border-0">
      <span className="text-sm text-gray-600">{label}</span>
      <div className="flex items-center gap-3">
        <span className="text-sm font-bold text-gray-800 w-8 text-right">{atual}</span>
        <span className={`text-xs font-bold w-12 text-right px-1.5 py-0.5 rounded-md
          ${diff > 0 ? 'bg-green-50 text-green-600' : diff < 0 ? 'bg-red-50 text-red-500' : 'text-gray-300'}`}>
          {diff > 0 ? `+${diff}` : diff !== 0 ? diff : '='}
        </span>
        <span className="text-xs text-gray-300 w-8 text-right">{anterior}</span>
      </div>
    </div>
  )
}

// ── Atividade Recente Item ────────────────────────────────────────────────────

const TIPO_CONFIG = {
  medicao: { label: 'Medição', border: 'border-l-purple-400', dot: 'bg-purple-400', bg: 'bg-purple-50 text-purple-700' },
  os:      { label: 'Obra',    border: 'border-l-green-400',  dot: 'bg-green-400',  bg: 'bg-green-50 text-green-700' },
  reparo:  { label: 'Reparo',  border: 'border-l-red-400',    dot: 'bg-red-400',    bg: 'bg-red-50 text-red-600' },
}

function AtividadeItem({ item, onClick }) {
  const t = TIPO_CONFIG[item.tipo] || TIPO_CONFIG.os
  const dataFmt = item.data
    ? new Date(item.data).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
    : '—'
  return (
    <div
      onClick={onClick}
      className={`flex items-start gap-3 p-3 border-l-[3px] bg-white rounded-r-xl shadow-sm
        hover:shadow-md cursor-pointer transition-all duration-150 hover:-translate-y-px ${t.border}`}
    >
      <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${t.dot}`} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-800 truncate">{item.titulo}</p>
        {item.subtitulo && <p className="text-xs text-gray-400 truncate mt-0.5">{item.subtitulo}</p>}
      </div>
      <div className="flex flex-col items-end gap-1 flex-shrink-0">
        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${t.bg}`}>{t.label}</span>
        <span className="text-[10px] text-gray-400">{dataFmt}</span>
      </div>
    </div>
  )
}

// ── Dashboard Principal ───────────────────────────────────────────────────────

const PERIODS = [
  { value: 'today',   label: 'Hoje' },
  { value: 'week',    label: 'Esta semana' },
  { value: '15days',  label: '15 dias' },
  { value: '30days',  label: '30 dias' },
  { value: 'custom',  label: 'Período' },
]

export default function DashboardPage() {
  const navigate = useNavigate()
  const [period, setPeriod]             = useState('week')
  const [customStart, setCustomStart]   = useState('')
  const [customEnd, setCustomEnd]       = useState('')
  const [stats, setStats]               = useState(null)
  const [loadingStats, setLoadingStats] = useState(false)

  const { start, end, label } = getPeriodDates(period, customStart, customEnd)

  const loadStats = useCallback(async (s, e) => {
    if (!s || !e) return
    setLoadingStats(true)
    try { setStats(await api.getDashboardStats(s, e)) }
    catch (err) { console.error('Dashboard stats error:', err) }
    finally { setLoadingStats(false) }
  }, [])

  useEffect(() => { if (start && end) loadStats(start, end) }, [start, end, loadStats])

  const S    = stats
  const prev = S?.periodoAnterior

  const diasConsumo = S?.consumoProduto?.porDia
    ? Object.entries(S.consumoProduto.porDia).sort(([a], [b]) => a > b ? 1 : -1)
    : []

  return (
    <div className="p-3 sm:p-6 max-w-7xl mx-auto space-y-4 sm:space-y-6">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="bg-gradient-to-r from-[#2d1106] via-[#5a2209] to-[#8b3812] rounded-2xl p-6 text-white shadow-lg">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black tracking-tight">Dashboard</h1>
            <p className="text-orange-100 text-sm mt-0.5 font-medium">{label}</p>
          </div>
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
            {/* Period pills */}
            <div className="flex bg-white/20 rounded-xl p-1 gap-0.5 backdrop-blur-sm">
              {PERIODS.map(p => (
                <button
                  key={p.value}
                  onClick={() => setPeriod(p.value)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-all duration-150
                    ${period === p.value
                      ? 'bg-white text-orange-700 shadow-md'
                      : 'text-white/80 hover:text-white hover:bg-white/10'
                    }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
            {/* Custom dates */}
            {period === 'custom' && (
              <div className="flex items-center gap-2">
                <input type="date" className="rounded-lg px-2 py-1.5 text-sm text-gray-700 bg-white border-0 outline-none"
                  value={customStart} onChange={e => setCustomStart(e.target.value)} />
                <span className="text-white/70 text-sm">até</span>
                <input type="date" className="rounded-lg px-2 py-1.5 text-sm text-gray-700 bg-white border-0 outline-none"
                  value={customEnd} onChange={e => setCustomEnd(e.target.value)} />
              </div>
            )}
            {loadingStats && (
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin flex-shrink-0" />
            )}
          </div>
        </div>
      </div>

      {/* ── Metric Cards ────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <MetricCard
          icon="📋" label="Medições"
          gradient="bg-gradient-to-br from-purple-500 to-purple-700"
          value={S?.medicoes?.total ?? '—'}
          sub="no período"
          trend={S && prev ? S.medicoes.total - prev.medicoes : null}
          onClick={() => navigate('/medicoes')}
        />
        <MetricCard
          icon="📄" label="Orçamentos"
          gradient="bg-gradient-to-br from-blue-500 to-blue-700"
          value={S?.orcamentos?.total ?? '—'}
          sub={S ? `${S.orcamentos.aprovado} aprovado(s)` : 'no período'}
          trend={S && prev ? S.orcamentos.total - prev.orcamentos : null}
          onClick={() => navigate('/orcamentos')}
        />
        <MetricCard
          icon="✍️" label="Contratos"
          gradient="bg-gradient-to-br from-[#5a2209] to-[#2d1106]"
          value={S?.contratos?.total ?? '—'}
          sub={S ? `${S.contratos.assinado} assinado(s)` : 'no período'}
          trend={S && prev ? S.contratos.total - prev.contratos : null}
          onClick={() => navigate('/contratos')}
        />
        <MetricCard
          icon="🔧" label="Obras Ativas"
          gradient="bg-gradient-to-br from-emerald-500 to-emerald-700"
          value={S?.ordensServico?.total ?? '—'}
          sub={S ? `${S.ordensServico.em_andamento} em andamento` : 'no período'}
          trend={S && prev ? S.ordensServico.total - prev.ordensServico : null}
          onClick={() => navigate('/ordens-servico')}
        />
        <MetricCard
          icon="🛠️" label="Reparos"
          gradient="bg-gradient-to-br from-red-500 to-rose-700"
          value={S?.reparos?.total ?? '—'}
          sub={S ? `${S.reparos.em_andamento} em andamento` : 'no período'}
          trend={S && prev ? S.reparos.total - prev.reparos : null}
          onClick={() => navigate('/ordens-servico')}
        />
      </div>

      {/* ── GVF Seal + Comparativo ───────────────────────────────────────────── */}
      <div className="grid lg:grid-cols-3 gap-4">

        {/* GVF Seal */}
        <div className="card lg:col-span-2 space-y-0">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="font-bold text-gray-800 text-base">Consumo de GVF Seal</h2>
              <p className="text-xs text-gray-400 mt-0.5">Realizado vs Estimado no período</p>
            </div>
            {S?.consumoProduto && (
              <div className={`text-center px-4 py-2 rounded-xl font-bold text-sm ${
                S.consumoProduto.variacaoPercent > 5  ? 'bg-red-50 text-red-600' :
                S.consumoProduto.variacaoPercent < -5 ? 'bg-green-50 text-green-600' :
                'bg-orange-50 text-orange-600'
              }`}>
                <div className="text-xl">{S.consumoProduto.variacaoPercent > 0 ? '+' : ''}{S.consumoProduto.variacaoPercent}%</div>
                <div className="text-[10px] font-medium opacity-70">vs estimado</div>
              </div>
            )}
          </div>

          {!S ? (
            <div className="flex items-center justify-center h-32 text-gray-300 text-sm">Carregando...</div>
          ) : (
            <>
              {/* Big totals */}
              <div className="grid grid-cols-3 gap-3 mb-5">
                {[
                  { label: 'Estimado',  val: S.consumoProduto.estimado, cls: 'from-blue-50 to-blue-100 text-blue-700', sub: 'total previsto' },
                  { label: 'Realizado', val: S.consumoProduto.real,     cls: 'from-orange-50 to-orange-100 text-orange-600', sub: 'total consumido' },
                  {
                    label: S.consumoProduto.diferenca > 0 ? 'Excedente' : S.consumoProduto.diferenca < 0 ? 'Economia' : 'No previsto',
                    val: Math.abs(S.consumoProduto.diferenca),
                    cls: S.consumoProduto.diferenca > 0 ? 'from-red-50 to-red-100 text-red-600' :
                         S.consumoProduto.diferenca < 0 ? 'from-green-50 to-green-100 text-green-600' :
                         'from-gray-50 to-gray-100 text-gray-500',
                    sub: 'diferença',
                  },
                ].map(item => (
                  <div key={item.label} className={`bg-gradient-to-br ${item.cls} rounded-2xl p-4 text-center`}>
                    <div className={`text-2xl font-black ${item.cls.split(' ').pop()}`}>
                      {item.val.toLocaleString('pt-BR', { minimumFractionDigits: 1 })}L
                    </div>
                    <div className="text-[11px] font-semibold opacity-70 mt-1">{item.sub}</div>
                    <div className="text-[10px] opacity-50 mt-0.5">{item.label}</div>
                  </div>
                ))}
              </div>

              {/* Obras vs Reparos bars */}
              {(S.consumoProduto.obras || S.consumoProduto.reparos) && (
                <div className="space-y-1">
                  <ConsumoProgressBar
                    label="Obras"
                    real={S.consumoProduto.obras?.real ?? 0}
                    estimado={S.consumoProduto.obras?.estimado ?? 0}
                  />
                  <ConsumoProgressBar
                    label="Reparos"
                    real={S.consumoProduto.reparos?.real ?? 0}
                    estimado={S.consumoProduto.reparos?.estimado ?? 0}
                  />
                </div>
              )}

              {/* Day-by-day bars */}
              {diasConsumo.length > 0 && (
                <div className="mt-4 pt-4 border-t border-gray-100">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Por dia</p>
                  <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                    {diasConsumo.map(([data, vals]) => (
                      <ConsumoProgressBar key={data}
                        label={fmtBRShort(data)}
                        real={vals.real || 0}
                        estimado={vals.estimado || 0}
                      />
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Comparativo */}
        <div className="card">
          <h2 className="font-bold text-gray-800 text-base mb-1">Comparativo</h2>
          <p className="text-xs text-gray-400 mb-4">Atual vs período anterior</p>
          {!S || !prev ? (
            <div className="flex items-center justify-center h-32 text-gray-300 text-sm">Carregando...</div>
          ) : (
            <>
              <div className="flex justify-between text-[10px] text-gray-300 mb-2 px-0.5">
                <span>Indicador</span>
                <div className="flex gap-3">
                  <span className="w-8 text-right font-semibold text-gray-500">Atual</span>
                  <span className="w-12 text-right">Var.</span>
                  <span className="w-8 text-right">Ant.</span>
                </div>
              </div>
              <ComparativoRow label="Medições"   atual={S.medicoes.total}      anterior={prev.medicoes} />
              <ComparativoRow label="Orçamentos" atual={S.orcamentos.total}    anterior={prev.orcamentos} />
              <ComparativoRow label="Contratos"  atual={S.contratos.total}     anterior={prev.contratos} />
              <ComparativoRow label="Obras"      atual={S.ordensServico.total} anterior={prev.ordensServico} />
              <ComparativoRow label="Reparos"    atual={S.reparos.total}       anterior={prev.reparos} />
              <div className="mt-3 pt-3 border-t border-gray-100">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-500 font-medium">GVF Realizado</span>
                  <div className="flex items-center gap-2">
                    <span className="text-base font-black text-orange-600">{S.consumoProduto.real.toFixed(1)}L</span>
                    <span className={`text-xs font-bold px-1.5 py-0.5 rounded-md
                      ${S.consumoProduto.real - prev.consumoReal > 0 ? 'bg-red-50 text-red-500' :
                        S.consumoProduto.real - prev.consumoReal < 0 ? 'bg-green-50 text-green-600' :
                        'text-gray-300'}`}>
                      {S.consumoProduto.real - prev.consumoReal > 0 ? '+' : ''}
                      {(S.consumoProduto.real - prev.consumoReal).toFixed(1)}L
                    </span>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Status Breakdown ────────────────────────────────────────────────── */}
      {S && (
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="card">
            <h2 className="font-bold text-gray-800 text-base mb-4">Obras por Status</h2>
            <div className="divide-y divide-gray-50">
              {[
                ['Agendada',           S.ordensServico.agendada,              'bg-blue-400',   S.ordensServico.total],
                ['Em andamento',       S.ordensServico.em_andamento,          'bg-amber-400',  S.ordensServico.total],
                ['Aguard. Assinatura', S.ordensServico.aguardando_assinatura, 'bg-orange-400', S.ordensServico.total],
                ['Concluída',          S.ordensServico.concluida,             'bg-green-500',  S.ordensServico.total],
                ['Cancelada',          S.ordensServico.cancelada,             'bg-red-400',    S.ordensServico.total],
              ].map(([lbl, val, color, total]) => (
                <StatusRow key={lbl} label={lbl} value={val} total={total} colorClass={color} dotColor={color} />
              ))}
            </div>
          </div>

          <div className="card">
            <h2 className="font-bold text-gray-800 text-base mb-4">Reparos por Status</h2>
            {S.reparos.total === 0 ? (
              <div className="flex items-center justify-center h-32 text-gray-300 text-sm">
                Nenhum reparo no período
              </div>
            ) : (
              <div className="divide-y divide-gray-50">
                {[
                  ['Agendado',     S.reparos.agendada,     'bg-blue-400',  S.reparos.total],
                  ['Em andamento', S.reparos.em_andamento, 'bg-amber-400', S.reparos.total],
                  ['Concluído',    S.reparos.concluida,    'bg-green-500', S.reparos.total],
                ].map(([lbl, val, color, total]) => (
                  <StatusRow key={lbl} label={lbl} value={val} total={total} colorClass={color} dotColor={color} />
                ))}
                <div className="flex items-center justify-between pt-3 pb-1">
                  <span className="text-sm font-semibold text-gray-500">Total</span>
                  <span className="text-xl font-black text-gray-800">{S.reparos.total}</span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Atividade Recente ────────────────────────────────────────────────── */}
      {S?.atividadeRecente && (
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-bold text-gray-800 text-base">Atividade Recente</h2>
              <p className="text-xs text-gray-400 mt-0.5">{S.atividadeRecente.length} eventos no período</p>
            </div>
            <div className="flex items-center gap-3 text-[10px] text-gray-400">
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-purple-400 inline-block" />Medição</span>
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-green-400 inline-block" />Obra</span>
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-red-400 inline-block" />Reparo</span>
            </div>
          </div>
          {S.atividadeRecente.length === 0 ? (
            <div className="flex items-center justify-center h-24 text-gray-300 text-sm">
              Nenhuma atividade no período
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 gap-2">
              {S.atividadeRecente.map((item, i) => (
                <AtividadeItem
                  key={`${item.tipo}-${item.id || i}`}
                  item={item}
                  onClick={item.tipo === 'medicao'
                    ? () => navigate(`/medicoes/${item.id}`)
                    : () => navigate(`/ordens-servico/${item.id}`)
                  }
                />
              ))}
            </div>
          )}
        </div>
      )}

    </div>
  )
}
