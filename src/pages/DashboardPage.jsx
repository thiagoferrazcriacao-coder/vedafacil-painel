import React, { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api/client.js'

// ── Helpers de Data ──────────────────────────────────────────────────────────

function isoDate(d) {
  return d.toISOString().split('T')[0]
}
function fmtBR(str) {
  if (!str) return '—'
  return new Date(str + 'T12:00:00').toLocaleDateString('pt-BR')
}
function fmtBRShort(str) {
  if (!str) return ''
  const d = new Date(str + 'T12:00:00')
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}

function getPeriodDates(period, customStart, customEnd) {
  const today = new Date()
  const todayStr = isoDate(today)

  if (period === 'today') {
    return { start: todayStr, end: todayStr, label: `Hoje, ${fmtBR(todayStr)}` }
  }
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

// ── Componente: Card de Métrica ───────────────────────────────────────────────

function MetricCard({ icon, label, value, sub, badge, badgeColor = 'bg-gray-100 text-gray-600', bg = 'bg-blue-50', textColor = 'text-blue-600', onClick, trend, trendLabel }) {
  const trendUp = trend > 0
  const trendNeutral = trend === 0 || trend == null

  return (
    <div
      className={`card ${onClick ? 'cursor-pointer hover:shadow-md' : ''} transition-shadow`}
      onClick={onClick}
    >
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${bg}`}>
          <span className={`text-xl ${textColor}`}>{icon}</span>
        </div>
        {badge && (
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${badgeColor}`}>{badge}</span>
        )}
      </div>
      <div className="text-3xl font-bold text-gray-800">{value ?? '—'}</div>
      <div className="text-sm font-medium text-gray-600 mt-0.5">{label}</div>
      {sub && <div className="text-xs text-gray-400 mt-1">{sub}</div>}
      {trend != null && (
        <div className={`flex items-center gap-1 mt-2 text-xs font-medium ${trendNeutral ? 'text-gray-400' : trendUp ? 'text-green-600' : 'text-red-500'}`}>
          <span>{trendNeutral ? '→' : trendUp ? '↑' : '↓'}</span>
          <span>{trendNeutral ? 'igual ao período anterior' : `${Math.abs(trend)} vs período anterior`}</span>
        </div>
      )}
    </div>
  )
}

// ── Componente: Barra de Consumo ──────────────────────────────────────────────

function ConsumoBar({ label, real, estimado, maxVal }) {
  const pctReal  = maxVal > 0 ? Math.min(100, (real  / maxVal) * 100) : 0
  const pctEstim = maxVal > 0 ? Math.min(100, (estimado / maxVal) * 100) : 0
  return (
    <div className="mb-3">
      <div className="flex justify-between text-xs text-gray-500 mb-1">
        <span className="font-medium">{label}</span>
        <span>
          <span className="text-orange-600 font-semibold">{real.toFixed(1)}L</span>
          <span className="text-gray-300 mx-1">/</span>
          <span className="text-blue-500">{estimado.toFixed(1)}L est.</span>
        </span>
      </div>
      <div className="relative h-5 bg-gray-100 rounded-full overflow-hidden">
        <div className="absolute inset-y-0 left-0 bg-blue-200 rounded-full transition-all" style={{ width: `${pctEstim}%` }} />
        <div className="absolute inset-y-0 left-0 bg-orange-400 rounded-full transition-all" style={{ width: `${pctReal}%`, opacity: 0.85 }} />
      </div>
    </div>
  )
}

// ── Componente: Badge de Status ───────────────────────────────────────────────

function StatusBadge({ status }) {
  const map = {
    pendente: ['bg-yellow-100 text-yellow-800', 'Pendente'],
    rascunho: ['bg-gray-100 text-gray-700', 'Rascunho'],
    enviado: ['bg-blue-100 text-blue-800', 'Enviado'],
    aprovado: ['bg-green-100 text-green-800', 'Aprovado'],
    aguardando_assinatura: ['bg-amber-100 text-amber-800', 'Aguard. Assin.'],
    assinado: ['bg-green-100 text-green-800', 'Assinado'],
    agendada: ['bg-blue-100 text-blue-700', 'Agendada'],
    em_andamento: ['bg-yellow-100 text-yellow-700', 'Em Andamento'],
    concluida: ['bg-green-100 text-green-700', 'Concluída'],
    cancelada: ['bg-red-100 text-red-700', 'Cancelada'],
    recebida: ['bg-purple-100 text-purple-700', 'Recebida'],
  }
  const [cls, lbl] = map[status] || ['bg-gray-100 text-gray-600', status]
  return <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cls}`}>{lbl}</span>
}

// ── Componente: Seção de Comparativo ─────────────────────────────────────────

function ComparativoRow({ label, atual, anterior }) {
  const diff = atual - anterior
  return (
    <div className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
      <span className="text-sm text-gray-600">{label}</span>
      <div className="flex items-center gap-3">
        <span className="text-sm font-bold text-gray-800 w-8 text-right">{atual}</span>
        <span className={`text-xs font-medium w-12 text-right ${diff > 0 ? 'text-green-600' : diff < 0 ? 'text-red-500' : 'text-gray-400'}`}>
          {diff > 0 ? '+' : ''}{diff !== 0 ? diff : '='}
        </span>
        <span className="text-xs text-gray-400 w-8 text-right">{anterior}</span>
      </div>
    </div>
  )
}

// ── Dashboard Principal ───────────────────────────────────────────────────────

const PERIODS = [
  { value: 'today',   label: 'Hoje' },
  { value: 'week',    label: 'Esta semana' },
  { value: '15days',  label: 'Últimos 15 dias' },
  { value: '30days',  label: 'Últimos 30 dias' },
  { value: 'custom',  label: 'Período personalizado' },
]

export default function DashboardPage() {
  const navigate = useNavigate()
  const [period, setPeriod]           = useState('week')
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd]     = useState('')
  const [stats, setStats]             = useState(null)
  const [loading, setLoading]         = useState(true)
  const [loadingStats, setLoadingStats] = useState(false)

  const { start, end, label } = getPeriodDates(period, customStart, customEnd)

  // Carrega estatísticas por período
  const loadStats = useCallback(async (s, e) => {
    if (!s || !e) return
    setLoadingStats(true)
    try {
      const data = await api.getDashboardStats(s, e)
      setStats(data)
    } catch (err) {
      console.error('Dashboard stats error:', err)
    } finally {
      setLoadingStats(false)
    }
  }, [])

  // Initial load
  useEffect(() => {
    setLoading(false)
  }, [])

  // Carrega stats quando período muda
  useEffect(() => {
    if (start && end) loadStats(start, end)
  }, [start, end, loadStats])

  // ── Consumo por dia (para gráfico) ─────────────────────────────────────────
  const diasConsumo = stats?.consumoProduto?.porDia
    ? Object.entries(stats.consumoProduto.porDia)
        .sort(([a], [b]) => a > b ? 1 : -1)
    : []
  const maxConsumo = diasConsumo.length > 0
    ? Math.max(...diasConsumo.map(([, v]) => Math.max(v.real, v.estimado, 1)))
    : 1

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    )
  }

  const S = stats
  const prev = S?.periodoAnterior

  return (
    <div className="p-6 max-w-7xl mx-auto">

      {/* ── Header + Seletor de Período ─────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Dashboard</h1>
          <p className="text-gray-500 text-sm mt-0.5">{label}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <select
            className="input py-1.5 text-sm min-w-[180px]"
            value={period}
            onChange={e => setPeriod(e.target.value)}
          >
            {PERIODS.map(p => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </select>
          {period === 'custom' && (
            <>
              <input type="date" className="input py-1.5 text-sm" value={customStart}
                onChange={e => setCustomStart(e.target.value)} />
              <span className="text-gray-400 text-sm">até</span>
              <input type="date" className="input py-1.5 text-sm" value={customEnd}
                onChange={e => setCustomEnd(e.target.value)} />
            </>
          )}
          {loadingStats && (
            <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          )}
        </div>
      </div>

      {/* ── Cards de Métricas ────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
        <MetricCard
          icon="📋" label="Medições" bg="bg-purple-50" textColor="text-purple-600"
          value={S?.medicoes?.total ?? '—'}
          sub={`Total no período`}
          trend={S && prev ? S.medicoes.total - prev.medicoes : null}
          onClick={() => navigate('/medicoes')}
        />
        <MetricCard
          icon="📄" label="Orçamentos" bg="bg-blue-50" textColor="text-blue-600"
          value={S?.orcamentos?.total ?? '—'}
          sub={S ? `${S.orcamentos.aprovado} aprovado(s)` : ''}
          badge={S?.orcamentos?.rascunho > 0 ? `${S.orcamentos.rascunho} rascunho` : undefined}
          badgeColor="bg-gray-100 text-gray-600"
          trend={S && prev ? S.orcamentos.total - prev.orcamentos : null}
          onClick={() => navigate('/orcamentos')}
        />
        <MetricCard
          icon="✍️" label="Contratos" bg="bg-orange-50" textColor="text-orange-600"
          value={S?.contratos?.total ?? '—'}
          sub={S ? `${S.contratos.assinado} assinado(s)` : ''}
          badge={S?.contratos?.aguardando > 0 ? `${S.contratos.aguardando} aguardando` : undefined}
          badgeColor="bg-amber-100 text-amber-700"
          trend={S && prev ? S.contratos.total - prev.contratos : null}
          onClick={() => navigate('/contratos')}
        />
        <MetricCard
          icon="🔧" label="Obras Ativas" bg="bg-green-50" textColor="text-green-600"
          value={S?.ordensServico?.total ?? '—'}
          sub={S ? `${S.ordensServico.em_andamento} em andamento` : ''}
          badge={S?.ordensServico?.aguardando_assinatura > 0 ? `${S.ordensServico.aguardando_assinatura} ass.` : undefined}
          badgeColor="bg-green-100 text-green-700"
          trend={S && prev ? S.ordensServico.total - prev.ordensServico : null}
          onClick={() => navigate('/ordens-servico')}
        />
        <MetricCard
          icon="🛠️" label="Reparos" bg="bg-red-50" textColor="text-red-500"
          value={S?.reparos?.total ?? '—'}
          sub={S ? `${S.reparos.em_andamento} em andamento · ${S.reparos.concluida} concluído(s)` : ''}
          trend={S && prev ? S.reparos.total - prev.reparos : null}
          onClick={() => navigate('/ordens-servico')}
        />
      </div>

      <div className="grid lg:grid-cols-3 gap-4 mb-4">

        {/* ── Consumo de GVF Seal ─────────────────────────────────────────────── */}
        <div className="card lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-800">🧪 Consumo de GVF Seal</h2>
            {S?.consumoProduto && (
              <span className={`text-xs px-2 py-1 rounded-full font-semibold ${
                S.consumoProduto.variacaoPercent > 5  ? 'bg-red-100 text-red-700' :
                S.consumoProduto.variacaoPercent < -5 ? 'bg-green-100 text-green-700' :
                'bg-gray-100 text-gray-600'
              }`}>
                {S.consumoProduto.variacaoPercent > 0 ? '+' : ''}{S.consumoProduto.variacaoPercent}% vs estimado
              </span>
            )}
          </div>

          {!S ? (
            <div className="text-sm text-gray-400 text-center py-6">Carregando...</div>
          ) : (
            <>
              {/* Totais gerais */}
              <div className="grid grid-cols-3 gap-3 mb-4">
                <div className="text-center p-3 bg-blue-50 rounded-xl">
                  <div className="text-xl font-bold text-blue-700">
                    {S.consumoProduto.estimado.toLocaleString('pt-BR', { minimumFractionDigits: 1 })}L
                  </div>
                  <div className="text-xs text-blue-600 mt-1">Estimado total</div>
                </div>
                <div className="text-center p-3 bg-orange-50 rounded-xl">
                  <div className="text-xl font-bold text-orange-600">
                    {S.consumoProduto.real.toLocaleString('pt-BR', { minimumFractionDigits: 1 })}L
                  </div>
                  <div className="text-xs text-orange-500 mt-1">Realizado total</div>
                </div>
                <div className={`text-center p-3 rounded-xl ${
                  S.consumoProduto.diferenca > 0 ? 'bg-red-50' :
                  S.consumoProduto.diferenca < 0 ? 'bg-green-50' : 'bg-gray-50'
                }`}>
                  <div className={`text-xl font-bold ${
                    S.consumoProduto.diferenca > 0 ? 'text-red-600' :
                    S.consumoProduto.diferenca < 0 ? 'text-green-600' : 'text-gray-500'
                  }`}>
                    {S.consumoProduto.diferenca > 0 ? '+' : ''}
                    {S.consumoProduto.diferenca.toLocaleString('pt-BR', { minimumFractionDigits: 1 })}L
                  </div>
                  <div className={`text-xs mt-1 ${
                    S.consumoProduto.diferenca > 0 ? 'text-red-500' :
                    S.consumoProduto.diferenca < 0 ? 'text-green-500' : 'text-gray-400'
                  }`}>
                    {S.consumoProduto.diferenca > 0 ? 'Acima' :
                     S.consumoProduto.diferenca < 0 ? 'Abaixo' : 'No previsto'}
                  </div>
                </div>
              </div>

              {/* Breakdown Obras vs Reparos */}
              {(S.consumoProduto.obras || S.consumoProduto.reparos) && (
                <div className="grid grid-cols-2 gap-2 mb-4">
                  <div className="p-3 bg-gray-50 rounded-xl border border-gray-100">
                    <div className="text-xs font-semibold text-gray-500 mb-2 flex items-center gap-1">
                      <span>🔧</span> Obras
                    </div>
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-base font-bold text-orange-600">
                        {(S.consumoProduto.obras?.real ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 1 })}L
                      </span>
                      <span className="text-xs text-gray-400">realizado</span>
                    </div>
                    <div className="text-xs text-blue-500 mt-0.5">
                      {(S.consumoProduto.obras?.estimado ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 1 })}L estimado
                    </div>
                  </div>
                  <div className="p-3 bg-gray-50 rounded-xl border border-gray-100">
                    <div className="text-xs font-semibold text-gray-500 mb-2 flex items-center gap-1">
                      <span>🛠️</span> Reparos
                    </div>
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-base font-bold text-orange-600">
                        {(S.consumoProduto.reparos?.real ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 1 })}L
                      </span>
                      <span className="text-xs text-gray-400">realizado</span>
                    </div>
                    <div className="text-xs text-blue-500 mt-0.5">
                      {(S.consumoProduto.reparos?.estimado ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 1 })}L estimado
                    </div>
                  </div>
                </div>
              )}

              {/* Gráfico de barras por dia */}
              {diasConsumo.length > 0 ? (
                <div>
                  <div className="flex items-center gap-4 mb-3 text-xs text-gray-500">
                    <span className="flex items-center gap-1"><span className="w-3 h-2 rounded bg-orange-400 inline-block" /> Realizado</span>
                    <span className="flex items-center gap-1"><span className="w-3 h-2 rounded bg-blue-200 inline-block" /> Estimado/dia</span>
                  </div>
                  <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                    {diasConsumo.map(([data, vals]) => (
                      <ConsumoBar
                        key={data}
                        label={fmtBRShort(data)}
                        real={vals.real || 0}
                        estimado={vals.estimado || 0}
                        maxVal={maxConsumo}
                      />
                    ))}
                  </div>
                </div>
              ) : (
                <div className="text-center text-sm text-gray-400 py-4">
                  Nenhum consumo registrado no período
                </div>
              )}
            </>
          )}
        </div>

        {/* ── Comparativo com Período Anterior ────────────────────────────────── */}
        <div className="card">
          <h2 className="font-semibold text-gray-800 mb-1">📊 Comparativo</h2>
          <p className="text-xs text-gray-400 mb-4">Atual vs período anterior</p>
          {!S || !prev ? (
            <div className="text-sm text-gray-400 text-center py-6">Carregando...</div>
          ) : (
            <div>
              <div className="flex justify-between text-[10px] text-gray-400 mb-1 px-1">
                <span>Indicador</span>
                <div className="flex gap-3">
                  <span className="w-8 text-right font-semibold text-gray-600">Atual</span>
                  <span className="w-12 text-right">Variação</span>
                  <span className="w-8 text-right">Anterior</span>
                </div>
              </div>
              <ComparativoRow label="Medições"   atual={S.medicoes.total}     anterior={prev.medicoes} />
              <ComparativoRow label="Orçamentos" atual={S.orcamentos.total}   anterior={prev.orcamentos} />
              <ComparativoRow label="Contratos"  atual={S.contratos.total}    anterior={prev.contratos} />
              <ComparativoRow label="Obras"      atual={S.ordensServico.total} anterior={prev.ordensServico} />
              <ComparativoRow label="Reparos"    atual={S.reparos.total}      anterior={prev.reparos} />
              <div className="mt-3 pt-3 border-t border-gray-100">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-500">GVF Realizado</span>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-bold text-orange-600">
                      {S.consumoProduto.real.toFixed(1)}L
                    </span>
                    <span className={`text-xs font-medium ${S.consumoProduto.real - prev.consumoReal > 0 ? 'text-red-500' : S.consumoProduto.real - prev.consumoReal < 0 ? 'text-green-600' : 'text-gray-400'}`}>
                      {S.consumoProduto.real - prev.consumoReal > 0 ? '+' : ''}{(S.consumoProduto.real - prev.consumoReal).toFixed(1)}L
                    </span>
                    <span className="text-xs text-gray-400">{prev.consumoReal.toFixed(1)}L</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Breakdown Detalhado (OS + Reparos) ──────────────────────────────── */}
      {S && (
        <div className="grid sm:grid-cols-2 gap-4 mb-4">
          {/* OS por status */}
          <div className="card">
            <h2 className="font-semibold text-gray-800 mb-3">🔧 Obras — por Status</h2>
            <div className="space-y-2">
              {[
                ['agendada',              S.ordensServico.agendada,             'bg-blue-100 text-blue-700'],
                ['em andamento',          S.ordensServico.em_andamento,         'bg-yellow-100 text-yellow-700'],
                ['aguard. assinatura',    S.ordensServico.aguardando_assinatura,'bg-amber-100 text-amber-800'],
                ['concluída',             S.ordensServico.concluida,            'bg-green-100 text-green-700'],
                ['cancelada',             S.ordensServico.cancelada,            'bg-red-100 text-red-700'],
              ].map(([lbl, val, cls]) => (
                <div key={lbl} className="flex items-center justify-between">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${cls}`}>{lbl}</span>
                  <span className="font-bold text-gray-700 text-sm">{val}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Reparos por status */}
          <div className="card">
            <h2 className="font-semibold text-gray-800 mb-3">🛠️ Reparos — por Status</h2>
            {S.reparos.total === 0 ? (
              <div className="text-sm text-gray-400 text-center py-6">Nenhum reparo no período</div>
            ) : (
              <div className="space-y-2">
                {[
                  ['agendado',     S.reparos.agendada,     'bg-blue-100 text-blue-700'],
                  ['em andamento', S.reparos.em_andamento, 'bg-yellow-100 text-yellow-700'],
                  ['concluído',    S.reparos.concluida,    'bg-green-100 text-green-700'],
                ].map(([lbl, val, cls]) => (
                  <div key={lbl} className="flex items-center justify-between">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${cls}`}>{lbl}</span>
                    <span className="font-bold text-gray-700 text-sm">{val}</span>
                  </div>
                ))}
                <div className="pt-2 border-t border-gray-100 flex items-center justify-between">
                  <span className="text-xs text-gray-500 font-medium">Total</span>
                  <span className="font-bold text-gray-800">{S.reparos.total}</span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

    </div>
  )
}
