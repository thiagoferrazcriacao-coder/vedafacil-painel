import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { api } from '../api/client.js'

// ─── ISO Week helpers ─────────────────────────────────────────────────────────
function getISOWeekStr(date) {
  const d = new Date(date)
  const dayNum = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7)
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`
}
function addWeeks(semana, delta) {
  const [yearStr, wStr] = semana.split('-W')
  const year = parseInt(yearStr), w = parseInt(wStr)
  const jan4 = new Date(Date.UTC(year, 0, 4))
  const dow = jan4.getUTCDay() || 7
  const monday = new Date(jan4)
  monday.setUTCDate(jan4.getUTCDate() - dow + 1 + (w - 1) * 7)
  monday.setUTCDate(monday.getUTCDate() + delta * 7)
  return getISOWeekStr(monday)
}
function semanaLabel(semana) {
  const [yearStr, wStr] = semana.split('-W')
  const year = parseInt(yearStr), w = parseInt(wStr)
  const jan4 = new Date(Date.UTC(year, 0, 4))
  const dow = jan4.getUTCDay() || 7
  const monday = new Date(jan4)
  monday.setUTCDate(jan4.getUTCDate() - dow + 1 + (w - 1) * 7)
  const sunday = new Date(monday)
  sunday.setUTCDate(monday.getUTCDate() + 6)
  const fmtD = d => d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
  return `Semana ${w} · ${fmtD(monday)} – ${fmtD(sunday)}`
}

// ─── Estoque Semanal Tab ──────────────────────────────────────────────────────
function EstoqueSemanalTab() {
  const [semana, setSemana] = useState(() => getISOWeekStr(new Date()))
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [editValue, setEditValue] = useState('')
  const [saving, setSaving] = useState(false)

  const load = useCallback(async (s) => {
    setLoading(true)
    setError('')
    try {
      const d = await api.getEstoqueEquipes(s)
      setData(d)
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load(semana) }, [load, semana])

  const handleSave = async (equipeId) => {
    const val = parseFloat(editValue)
    if (isNaN(val) || val < 0) return
    setSaving(true)
    try {
      await api.setEstoqueEquipe(equipeId, semana, val)
      setEditingId(null)
      await load(semana)
    } catch (e) { setError(e.message) }
    finally { setSaving(false) }
  }

  const isCurrentWeek = semana === getISOWeekStr(new Date())

  return (
    <div className="space-y-4">
      {error && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>}

      {/* Week navigation */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
        <div className="flex items-center justify-between gap-3">
          <button onClick={() => setSemana(s => addWeeks(s, -1))}
            className="w-10 h-10 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-600 font-bold transition-colors">
            ‹
          </button>
          <div className="text-center flex-1">
            <div className="font-bold text-gray-800 text-sm">{semanaLabel(semana)}</div>
            {isCurrentWeek && <div className="text-xs text-orange-500 font-medium mt-0.5">Semana atual</div>}
          </div>
          <button onClick={() => setSemana(s => addWeeks(s, 1))}
            className="w-10 h-10 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-600 font-bold transition-colors">
            ›
          </button>
        </div>
        {!isCurrentWeek && (
          <div className="mt-3 flex justify-center">
            <button onClick={() => setSemana(getISOWeekStr(new Date()))}
              className="text-xs text-orange-500 hover:underline">
              Ir para semana atual
            </button>
          </div>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-32">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500" />
        </div>
      ) : !data?.equipes?.length ? (
        <div className="bg-white rounded-xl p-8 text-center text-gray-400 text-sm">
          Nenhuma equipe cadastrada
        </div>
      ) : (
        <div className="space-y-3">
          {data.equipes.map(eq => {
            const pct = eq.recebido > 0 ? Math.min(100, (eq.consumido / eq.recebido) * 100) : 0
            const isOver = eq.consumido > eq.recebido && eq.recebido > 0
            const isEditing = editingId === eq.equipeId

            return (
              <div key={eq.equipeId} className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="font-bold text-gray-800">{eq.equipeNome}</div>
                    {eq.recebido === 0 && (
                      <div className="text-xs text-gray-400 mt-0.5">Nenhum estoque lançado esta semana</div>
                    )}
                  </div>
                  <button
                    onClick={() => { setEditingId(eq.equipeId); setEditValue(String(eq.recebido)) }}
                    className="text-xs text-orange-500 hover:text-orange-700 px-2 py-1 rounded hover:bg-orange-50 transition-colors font-medium">
                    ✏️ Editar
                  </button>
                </div>

                {/* Edit inline */}
                {isEditing && (
                  <div className="flex gap-2 items-center mb-3">
                    <input
                      type="number" min="0" step="0.1"
                      value={editValue}
                      onChange={e => setEditValue(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') handleSave(eq.equipeId); if (e.key === 'Escape') setEditingId(null) }}
                      className="flex-1 border border-orange-300 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-orange-400 outline-none"
                      placeholder="Litros recebidos"
                      autoFocus
                    />
                    <button onClick={() => handleSave(eq.equipeId)} disabled={saving}
                      className="px-3 py-1.5 bg-orange-500 text-white rounded-lg text-sm font-medium hover:bg-orange-600 disabled:opacity-50">
                      {saving ? '...' : '✓'}
                    </button>
                    <button onClick={() => setEditingId(null)}
                      className="px-3 py-1.5 bg-gray-100 text-gray-600 rounded-lg text-sm hover:bg-gray-200">
                      ✕
                    </button>
                  </div>
                )}

                {/* Progress bar */}
                {eq.recebido > 0 && (
                  <div className="mb-3">
                    <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${isOver ? 'bg-red-400' : pct > 80 ? 'bg-amber-400' : 'bg-emerald-400'}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* Stats */}
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="bg-blue-50 rounded-lg py-2">
                    <div className="text-base font-bold text-blue-700">{fmt(eq.recebido)}L</div>
                    <div className="text-xs text-blue-500 mt-0.5">Recebido</div>
                  </div>
                  <div className="bg-orange-50 rounded-lg py-2">
                    <div className="text-base font-bold text-orange-700">{fmt(eq.consumido)}L</div>
                    <div className="text-xs text-orange-500 mt-0.5">Consumido</div>
                  </div>
                  <div className={`rounded-lg py-2 ${isOver ? 'bg-red-50' : 'bg-emerald-50'}`}>
                    <div className={`text-base font-bold ${isOver ? 'text-red-700' : 'text-emerald-700'}`}>
                      {isOver ? '-' : ''}{fmt(eq.restante)}L
                    </div>
                    <div className={`text-xs mt-0.5 ${isOver ? 'text-red-500' : 'text-emerald-500'}`}>
                      {isOver ? 'Excedeu!' : 'Restante'}
                    </div>
                  </div>
                </div>

                {/* Histórico de lançamentos */}
                <div className="mt-3 pt-3 border-t border-gray-100">
                  <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                    📋 Lançamentos da semana
                  </div>
                  {!eq.lancamentos || eq.lancamentos.length === 0 ? (
                    eq.recebido > 0 ? (
                      <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-2 leading-relaxed">
                        ⓘ Esta semana tem <strong>{fmt(eq.recebido)}L</strong> registrados, mas os lançamentos foram feitos antes desse detalhamento estar disponível. <strong>Novos lançamentos da equipe pelo app vão aparecer aqui automaticamente</strong> (quem, quando e quanto).
                      </div>
                    ) : (
                      <div className="text-xs text-gray-400 italic px-2.5 py-1">Nenhum lançamento ainda.</div>
                    )
                  ) : (
                    <div className="space-y-1">
                      {[...eq.lancamentos].map((l, origIdx) => ({ ...l, origIdx })).reverse().map((l) => (
                        <div key={l.origIdx} className="flex items-center justify-between text-xs bg-gray-50 rounded-lg px-2.5 py-1.5">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="font-semibold text-gray-700 truncate">{l.membro || 'Equipe'}</span>
                            <span className="text-gray-400">
                              {l.ts ? new Date(l.ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : ''}
                              {l.ts ? ` · ${new Date(l.ts).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' })}` : ''}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 flex-shrink-0 ml-2">
                            <span className="font-bold text-blue-700">+{fmt(l.litros)}L</span>
                            <button
                              onClick={async () => {
                                if (!confirm(`Excluir este lançamento de ${l.membro || 'Equipe'} (+${fmt(l.litros)}L)?`)) return
                                const descontar = confirm('Descontar também do total recebido da semana?\n\nOK = sim, descontar  ·  Cancelar = não, manter total')
                                try { await api.deleteLancamento(eq.equipeId, l.origIdx, semana, descontar); await load(semana) }
                                catch (e) { alert('Erro: ' + e.message) }
                              }}
                              className="text-gray-300 hover:text-red-500 transition-colors text-sm leading-none"
                              title="Excluir este lançamento">×</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-700">
        <strong>ℹ️ Como funciona:</strong> Os aplicadores lançam o estoque recebido diretamente pelo app.
        O consumido é calculado automaticamente a partir dos fechamentos de dia.
        O operador pode ajustar o valor recebido manualmente se necessário.
      </div>
    </div>
  )
}

const fmt = (n) => Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
const fmtInt = (n) => Number(n || 0).toLocaleString('pt-BR')
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('pt-BR') : '—'

// ─── Modal: Adicionar lançamento manual (admin) ──────────────────────────────
function LancamentoManualModal({ equipeId, equipeNome, semana, onClose, onSaved }) {
  // datetime-local no fuso local — default = agora
  const agoraLocal = () => {
    const d = new Date()
    const off = d.getTimezoneOffset() * 60000
    return new Date(d - off).toISOString().slice(0, 16)
  }
  const [membro, setMembro] = useState('')
  const [litros, setLitros] = useState('')
  const [ts, setTs] = useState(agoraLocal())
  const [somarTotal, setSomarTotal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [erro, setErro] = useState('')

  // ESC fecha
  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [onClose])

  const handleSalvar = async () => {
    if (!membro.trim()) { setErro('Informe o nome do membro'); return }
    const litrosNum = parseFloat(String(litros).replace(',', '.'))
    if (!Number.isFinite(litrosNum) || litrosNum <= 0) { setErro('Quantidade de litros inválida'); return }
    setErro(''); setSaving(true)
    try {
      await api.addLancamentoManual(equipeId, {
        semana,
        membro: membro.trim(),
        litros: litrosNum,
        ts: new Date(ts).toISOString(),
        somarTotal,
      })
      await onSaved()
    } catch (e) { setErro(e.message) }
    finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-base font-bold text-gray-800">➕ Adicionar lançamento</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none">✕</button>
        </div>
        <div className="px-5 py-4 space-y-3">
          <div className="text-xs text-gray-500">
            <strong>{equipeNome}</strong> · {semanaLabel(semana)}
          </div>
          {erro && <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-2">{erro}</div>}

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Membro</label>
            <input type="text" value={membro} onChange={e => setMembro(e.target.value)}
              placeholder="Ex: Wanderson"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Litros</label>
            <input type="number" step="0.1" min="0" value={litros} onChange={e => setLitros(e.target.value)}
              placeholder="Ex: 30"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Data e hora</label>
            <input type="datetime-local" value={ts} onChange={e => setTs(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" />
          </div>

          <label className="flex items-start gap-2 cursor-pointer bg-amber-50 border border-amber-200 rounded-lg p-3">
            <input type="checkbox" checked={somarTotal} onChange={e => setSomarTotal(e.target.checked)}
              className="mt-0.5 accent-amber-500" />
            <div className="text-xs">
              <div className="font-semibold text-amber-800">Somar ao total recebido da semana?</div>
              <div className="text-amber-700 mt-0.5">
                <strong>Deixe DESMARCADO</strong> se você só quer registrar um lançamento antigo que já está somado.<br/>
                <strong>Marque</strong> se for um lançamento NOVO que ainda não está no total.
              </div>
            </div>
          </label>
        </div>
        <div className="px-5 py-3 border-t border-gray-200 flex gap-2 justify-end">
          <button onClick={onClose} className="px-4 py-2 rounded-lg border border-gray-300 text-sm text-gray-600 hover:bg-gray-50">
            Cancelar
          </button>
          <button onClick={handleSalvar} disabled={saving}
            className="px-4 py-2 rounded-lg bg-primary text-white text-sm font-semibold hover:bg-primary/90 disabled:opacity-50">
            {saving ? 'Salvando...' : '💾 Salvar lançamento'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── GVF Seal Panel ──────────────────────────────────────────────────────────
function GVFSealPanel() {
  const [dash, setDash] = useState(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('dashboard')
  const [form, setForm] = useState({ data: new Date().toISOString().split('T')[0], quantidade: '', obs: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const d = await api.getProdutosDashboard()
      setDash(d)
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const handleAddCompra = async (e) => {
    e.preventDefault()
    if (!form.quantidade || parseFloat(form.quantidade) <= 0) return
    setSaving(true)
    try {
      await api.addCompra({ data: form.data, quantidade: parseFloat(form.quantidade), obs: form.obs })
      setForm({ data: new Date().toISOString().split('T')[0], quantidade: '', obs: '' })
      await load()
    } catch (e) { setError(e.message) }
    finally { setSaving(false) }
  }

  const handleDelete = async (id) => {
    if (!confirm('Excluir este lançamento de compra?')) return
    try {
      await api.deleteCompra(id)
      await load()
    } catch (e) { setError(e.message) }
  }

  if (loading) return (
    <div className="flex items-center justify-center h-48">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500" />
    </div>
  )

  const saldo = dash?.saldoAtual ?? 0
  const alerta = dash?.alertaBaixoEstoque

  return (
    <div className="space-y-4">
      {error && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>}

      {/* Sub-tabs */}
      <div className="flex gap-2 flex-wrap">
        <button onClick={() => setTab('dashboard')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === 'dashboard' ? 'bg-orange-500 text-white' : 'bg-white text-gray-600 border border-gray-300 hover:border-orange-400'}`}>
          📊 Dashboard
        </button>
        <button onClick={() => setTab('estoqueSemanal')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === 'estoqueSemanal' ? 'bg-orange-500 text-white' : 'bg-white text-gray-600 border border-gray-300 hover:border-orange-400'}`}>
          📦 Estoque Semanal
        </button>
        <button onClick={() => setTab('compras')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === 'compras' ? 'bg-orange-500 text-white' : 'bg-white text-gray-600 border border-gray-300 hover:border-orange-400'}`}>
          🛒 Lançar Compra
        </button>
      </div>

      {/* Hero saldo */}
      <div className={`rounded-2xl p-6 shadow-md flex flex-col md:flex-row items-center justify-between gap-4 ${
        alerta ? 'bg-gradient-to-r from-red-500 to-red-600' :
        saldo < 200 ? 'bg-gradient-to-r from-yellow-400 to-orange-400' :
        'bg-gradient-to-r from-green-500 to-emerald-600'
      }`}>
        <div className="text-center md:text-left">
          <div className="text-white/80 text-sm font-medium uppercase tracking-wide mb-1">🧴 Saldo Atual em Estoque</div>
          <div className="text-white font-black" style={{ fontSize: '3.5rem', lineHeight: 1 }}>
            {fmt(saldo)}<span className="text-3xl font-bold ml-1">L</span>
          </div>
          <div className="text-white/80 text-sm mt-2">
            {alerta ? '⚠️ Estoque crítico — compre mais produto!' :
             saldo < 200 ? '⚠️ Estoque baixo — atenção!' :
             '✅ Estoque normal'}
          </div>
        </div>
        <div className="flex flex-col items-center gap-2 min-w-[140px]">
          <div className="w-full bg-white/20 rounded-full h-4 overflow-hidden">
            <div className="h-full bg-white rounded-full transition-all"
              style={{ width: `${Math.min(100, (saldo / Math.max(dash?.totalComprado || 1, saldo)) * 100)}%` }} />
          </div>
          <div className="flex justify-between w-full text-white/70 text-xs">
            <span>0L</span>
            <span>mín. 100L</span>
            <span>{fmt(dash?.totalComprado)}L</span>
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
          <div className="text-xs text-gray-500 mb-1">Total Comprado</div>
          <div className="text-xl font-bold text-blue-600">{fmt(dash?.totalComprado)}L</div>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
          <div className="text-xs text-gray-500 mb-1">Total Gasto</div>
          <div className="text-xl font-bold text-red-500">{fmt(dash?.totalGasto)}L</div>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
          <div className="text-xs text-gray-500 mb-1">Alerta Mínimo</div>
          <div className="text-xl font-bold text-gray-400">100L</div>
        </div>
      </div>

      {tab === 'dashboard' && (
        <div className="space-y-5">
          {/* Obras vs Reparos */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
            <h2 className="font-bold text-gray-700 mb-4">⚖️ Consumo por Tipo</h2>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-blue-50 rounded-lg p-4 text-center">
                <div className="text-3xl font-bold text-blue-600">{fmt(dash?.gastoObras)}L</div>
                <div className="text-sm text-blue-700 mt-1 font-medium">🏗️ Obras</div>
                <div className="text-xs text-gray-500 mt-0.5">
                  {dash?.totalGasto > 0 ? ((dash.gastoObras / dash.totalGasto) * 100).toFixed(0) : 0}% do total
                </div>
              </div>
              <div className="bg-amber-50 rounded-lg p-4 text-center">
                <div className="text-3xl font-bold text-amber-600">{fmt(dash?.gastoReparos)}L</div>
                <div className="text-sm text-amber-700 mt-1 font-medium">🔧 Reparos</div>
                <div className="text-xs text-gray-500 mt-0.5">
                  {dash?.totalGasto > 0 ? ((dash.gastoReparos / dash.totalGasto) * 100).toFixed(0) : 0}% do total
                </div>
              </div>
            </div>
            {dash?.totalGasto > 0 && (
              <div className="mt-4 h-4 rounded-full overflow-hidden bg-gray-100 flex">
                <div className="bg-blue-500 transition-all" style={{ width: `${(dash.gastoObras / dash.totalGasto) * 100}%` }} />
                <div className="bg-amber-400 flex-1" />
              </div>
            )}
          </div>

          {/* Consumo por Equipe */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
            <h2 className="font-bold text-gray-700 mb-4">👷 Consumo por Equipe</h2>
            {!dash?.gastoPorEquipe?.length ? (
              <div className="text-gray-400 text-sm text-center py-4">Nenhum consumo registrado</div>
            ) : (
              <div className="space-y-3">
                {dash.gastoPorEquipe.map((e, i) => {
                  const max = dash.gastoPorEquipe[0]?.litros || 1
                  const pct = (e.litros / max) * 100
                  return (
                    <div key={i}>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="font-medium text-gray-700">{e.equipeNome}</span>
                        <span className="text-orange-600 font-bold">{fmt(e.litros)}L</span>
                      </div>
                      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full bg-orange-400 rounded-full transition-all" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Top OS */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
            <h2 className="font-bold text-gray-700 mb-4">🏆 Maiores Consumidores</h2>
            {!dash?.topOS?.length ? (
              <div className="text-gray-400 text-sm text-center py-4">Nenhuma OS com consumo registrado</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="text-left py-2 text-xs text-gray-500 font-medium">#</th>
                      <th className="text-left py-2 text-xs text-gray-500 font-medium">Cliente</th>
                      <th className="text-left py-2 text-xs text-gray-500 font-medium">Tipo</th>
                      <th className="text-left py-2 text-xs text-gray-500 font-medium">Equipe</th>
                      <th className="text-right py-2 text-xs text-gray-500 font-medium">Consumo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dash.topOS.map((os, i) => (
                      <tr key={i} className="border-b border-gray-50 hover:bg-gray-50">
                        <td className="py-2 text-gray-400 w-8">{i + 1}</td>
                        <td className="py-2">
                          <div className="font-medium text-gray-800">{os.cliente || '—'}</div>
                          {os.numOS && <div className="text-xs text-gray-400">OS #{os.numOS}</div>}
                        </td>
                        <td className="py-2">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${os.tipo === 'reparo' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'}`}>
                            {os.tipo === 'reparo' ? 'Reparo' : 'Obra'}
                          </span>
                        </td>
                        <td className="py-2 text-gray-600">{os.equipeNome || '—'}</td>
                        <td className="py-2 text-right font-bold text-orange-600">{fmt(os.litros)}L</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Últimas Compras resumo */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-gray-700">🛒 Últimas Compras</h2>
              <button onClick={() => setTab('compras')} className="text-xs text-orange-500 hover:underline">Ver todas →</button>
            </div>
            {!dash?.compras?.length ? (
              <div className="text-gray-400 text-sm text-center py-4">Nenhuma compra registrada</div>
            ) : (
              <div className="space-y-2">
                {dash.compras.slice(0, 5).map((c, i) => (
                  <div key={i} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                    <div>
                      <span className="font-medium text-gray-700">{fmt(c.quantidade)}L</span>
                      {c.obs && <span className="text-xs text-gray-400 ml-2">— {c.obs}</span>}
                    </div>
                    <div className="text-xs text-gray-400">{fmtDate(c.data)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'estoqueSemanal' && <EstoqueSemanalTab />}

      {tab === 'compras' && (
        <div className="space-y-5">
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
            <h2 className="font-bold text-gray-700 mb-4">➕ Lançar Nova Compra</h2>
            <form onSubmit={handleAddCompra} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Data da Compra</label>
                  <input type="date" value={form.data}
                    onChange={e => setForm(f => ({ ...f, data: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-orange-400 focus:border-orange-400 outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Quantidade (litros) <span className="text-red-500">*</span></label>
                  <input type="number" min="0.1" step="0.1" value={form.quantidade} placeholder="Ex: 200"
                    onChange={e => setForm(f => ({ ...f, quantidade: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-orange-400 focus:border-orange-400 outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Observação</label>
                  <input type="text" value={form.obs} placeholder="Ex: Nota fiscal 1234"
                    onChange={e => setForm(f => ({ ...f, obs: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-orange-400 focus:border-orange-400 outline-none" />
                </div>
              </div>
              <div className="flex gap-3 items-center flex-wrap">
                <button type="submit" disabled={saving || !form.quantidade}
                  className="px-6 py-2 bg-orange-500 text-white rounded-lg text-sm font-medium hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                  {saving ? 'Salvando...' : '✅ Lançar Compra'}
                </button>
                {dash?.saldoAtual != null && (
                  <span className="text-sm text-gray-500">
                    Saldo atual: <strong className={dash.alertaBaixoEstoque ? 'text-red-600' : 'text-green-600'}>{fmt(dash.saldoAtual)}L</strong>
                    {form.quantidade && parseFloat(form.quantidade) > 0 && (
                      <> → após: <strong className="text-green-600">{fmt(dash.saldoAtual + parseFloat(form.quantidade || 0))}L</strong></>
                    )}
                  </span>
                )}
              </div>
            </form>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
            <h2 className="font-bold text-gray-700 mb-4">📋 Histórico de Compras</h2>
            {!dash?.compras?.length ? (
              <div className="text-gray-400 text-sm text-center py-8">Nenhuma compra registrada ainda.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="text-left py-2 px-2 text-xs text-gray-500 font-medium">Data</th>
                      <th className="text-right py-2 px-2 text-xs text-gray-500 font-medium">Quantidade</th>
                      <th className="text-left py-2 px-2 text-xs text-gray-500 font-medium">Observação</th>
                      <th className="py-2 px-2 w-10"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {dash.compras.map((c, i) => (
                      <tr key={c._id || i} className="border-b border-gray-50 hover:bg-gray-50">
                        <td className="py-2 px-2 text-gray-600">{fmtDate(c.data)}</td>
                        <td className="py-2 px-2 text-right font-bold text-blue-600">{fmt(c.quantidade)}L</td>
                        <td className="py-2 px-2 text-gray-500">{c.obs || '—'}</td>
                        <td className="py-2 px-2">
                          <button onClick={() => handleDelete(c._id)}
                            className="text-red-400 hover:text-red-600 transition-colors text-xs px-2 py-1 rounded hover:bg-red-50"
                            title="Excluir">✕</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-gray-200">
                      <td className="py-2 px-2 text-sm font-bold text-gray-700">Total</td>
                      <td className="py-2 px-2 text-right font-bold text-blue-700">{fmt(dash.totalComprado)}L</td>
                      <td colSpan={2}></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Injetores Panel ─────────────────────────────────────────────────────────
function InjetoresPanel() {
  const [dash, setDash] = useState(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('dashboard')
  const [form, setForm] = useState({
    data: new Date().toISOString().split('T')[0],
    quantidade: '',
    fornecedor: '',
    notaFiscal: '',
    obs: ''
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const d = await api.getInjetoresDashboard()
      setDash(d)
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const handleAddCompra = async (e) => {
    e.preventDefault()
    if (!form.quantidade || parseInt(form.quantidade) <= 0) return
    setSaving(true)
    try {
      await api.addCompraInjetor({
        data: form.data,
        quantidade: parseInt(form.quantidade),
        fornecedor: form.fornecedor,
        notaFiscal: form.notaFiscal,
        obs: form.obs
      })
      setForm({ data: new Date().toISOString().split('T')[0], quantidade: '', fornecedor: '', notaFiscal: '', obs: '' })
      await load()
    } catch (e) { setError(e.message) }
    finally { setSaving(false) }
  }

  const handleDelete = async (id) => {
    if (!confirm('Excluir este lançamento de compra?')) return
    try {
      await api.deleteCompraInjetor(id)
      await load()
    } catch (e) { setError(e.message) }
  }

  if (loading) return (
    <div className="flex items-center justify-center h-48">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
    </div>
  )

  const saldo = dash?.saldoAtual ?? 0
  const alerta = dash?.alertaBaixoEstoque

  return (
    <div className="space-y-4">
      {error && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>}

      {/* Sub-tabs */}
      <div className="flex gap-2">
        <button onClick={() => setTab('dashboard')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === 'dashboard' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 border border-gray-300 hover:border-blue-400'}`}>
          📊 Dashboard
        </button>
        <button onClick={() => setTab('compras')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === 'compras' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 border border-gray-300 hover:border-blue-400'}`}>
          🛒 Lançar Compra
        </button>
      </div>

      {/* Hero saldo */}
      <div className={`rounded-2xl p-6 shadow-md flex flex-col md:flex-row items-center justify-between gap-4 ${
        alerta ? 'bg-gradient-to-r from-red-500 to-red-600' :
        saldo < 300 ? 'bg-gradient-to-r from-yellow-400 to-orange-400' :
        'bg-gradient-to-r from-blue-500 to-blue-700'
      }`}>
        <div className="text-center md:text-left">
          <div className="text-white/80 text-sm font-medium uppercase tracking-wide mb-1">💉 Saldo Atual em Estoque</div>
          <div className="text-white font-black" style={{ fontSize: '3.5rem', lineHeight: 1 }}>
            {fmtInt(saldo)}<span className="text-3xl font-bold ml-1">un</span>
          </div>
          <div className="text-white/80 text-sm mt-2">
            {alerta ? '⚠️ Estoque crítico — compre mais injetores!' :
             saldo < 300 ? '⚠️ Estoque baixo — atenção!' :
             '✅ Estoque normal'}
          </div>
        </div>
        <div className="flex flex-col items-center gap-2 min-w-[140px]">
          <div className="w-full bg-white/20 rounded-full h-4 overflow-hidden">
            <div className="h-full bg-white rounded-full transition-all"
              style={{ width: `${Math.min(100, (saldo / Math.max(dash?.totalComprado || 1, saldo)) * 100)}%` }} />
          </div>
          <div className="flex justify-between w-full text-white/70 text-xs">
            <span>0</span>
            <span>mín. 150</span>
            <span>{fmtInt(dash?.totalComprado)} un</span>
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
          <div className="text-xs text-gray-500 mb-1">Total Comprado</div>
          <div className="text-xl font-bold text-blue-600">{fmtInt(dash?.totalComprado)} un</div>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
          <div className="text-xs text-gray-500 mb-1">Total Utilizado</div>
          <div className="text-xl font-bold text-red-500">{fmtInt(dash?.totalGasto)} un</div>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
          <div className="text-xs text-gray-500 mb-1">Alerta Mínimo</div>
          <div className="text-xl font-bold text-gray-400">150 un</div>
        </div>
      </div>

      {tab === 'dashboard' && (
        <div className="space-y-5">
          {/* Obras vs Reparos */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
            <h2 className="font-bold text-gray-700 mb-4">⚖️ Uso por Tipo</h2>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-blue-50 rounded-lg p-4 text-center">
                <div className="text-3xl font-bold text-blue-600">{fmtInt(dash?.gastoObras)}</div>
                <div className="text-sm text-blue-700 mt-1 font-medium">🏗️ Obras</div>
                <div className="text-xs text-gray-500 mt-0.5">
                  {dash?.totalGasto > 0 ? ((dash.gastoObras / dash.totalGasto) * 100).toFixed(0) : 0}% do total
                </div>
              </div>
              <div className="bg-amber-50 rounded-lg p-4 text-center">
                <div className="text-3xl font-bold text-amber-600">{fmtInt(dash?.gastoReparos)}</div>
                <div className="text-sm text-amber-700 mt-1 font-medium">🔧 Reparos</div>
                <div className="text-xs text-gray-500 mt-0.5">
                  {dash?.totalGasto > 0 ? ((dash.gastoReparos / dash.totalGasto) * 100).toFixed(0) : 0}% do total
                </div>
              </div>
            </div>
            {dash?.totalGasto > 0 && (
              <div className="mt-4 h-4 rounded-full overflow-hidden bg-gray-100 flex">
                <div className="bg-blue-500 transition-all" style={{ width: `${(dash.gastoObras / dash.totalGasto) * 100}%` }} />
                <div className="bg-amber-400 flex-1" />
              </div>
            )}
          </div>

          {/* Consumo por Equipe */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
            <h2 className="font-bold text-gray-700 mb-4">👷 Uso por Equipe</h2>
            {!dash?.gastoPorEquipe?.length ? (
              <div className="text-gray-400 text-sm text-center py-4">Nenhum uso registrado</div>
            ) : (
              <div className="space-y-3">
                {dash.gastoPorEquipe.map((e, i) => {
                  const max = dash.gastoPorEquipe[0]?.unidades || 1
                  const pct = (e.unidades / max) * 100
                  return (
                    <div key={i}>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="font-medium text-gray-700">{e.equipeNome}</span>
                        <span className="text-blue-600 font-bold">{fmtInt(e.unidades)} un</span>
                      </div>
                      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full bg-blue-400 rounded-full transition-all" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Top OS */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
            <h2 className="font-bold text-gray-700 mb-4">🏆 Maiores Consumidores</h2>
            {!dash?.topOS?.length ? (
              <div className="text-gray-400 text-sm text-center py-4">Nenhuma OS com uso registrado</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="text-left py-2 text-xs text-gray-500 font-medium">#</th>
                      <th className="text-left py-2 text-xs text-gray-500 font-medium">Cliente</th>
                      <th className="text-left py-2 text-xs text-gray-500 font-medium">Tipo</th>
                      <th className="text-left py-2 text-xs text-gray-500 font-medium">Equipe</th>
                      <th className="text-right py-2 text-xs text-gray-500 font-medium">Injetores</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dash.topOS.map((os, i) => (
                      <tr key={i} className="border-b border-gray-50 hover:bg-gray-50">
                        <td className="py-2 text-gray-400 w-8">{i + 1}</td>
                        <td className="py-2">
                          <div className="font-medium text-gray-800">{os.cliente || '—'}</div>
                          {os.numOS && <div className="text-xs text-gray-400">OS #{os.numOS}</div>}
                        </td>
                        <td className="py-2">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${os.tipo === 'reparo' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'}`}>
                            {os.tipo === 'reparo' ? 'Reparo' : 'Obra'}
                          </span>
                        </td>
                        <td className="py-2 text-gray-600">{os.equipeNome || '—'}</td>
                        <td className="py-2 text-right font-bold text-blue-600">{fmtInt(os.unidades)} un</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Últimas Compras resumo */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-gray-700">🛒 Últimas Compras</h2>
              <button onClick={() => setTab('compras')} className="text-xs text-blue-500 hover:underline">Ver todas →</button>
            </div>
            {!dash?.compras?.length ? (
              <div className="text-gray-400 text-sm text-center py-4">Nenhuma compra registrada</div>
            ) : (
              <div className="space-y-2">
                {dash.compras.slice(0, 5).map((c, i) => (
                  <div key={i} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                    <div className="flex-1 min-w-0">
                      <span className="font-medium text-gray-700">{fmtInt(c.quantidade)} un</span>
                      {c.fornecedor && <span className="text-xs text-gray-500 ml-2">— {c.fornecedor}</span>}
                      {c.notaFiscal && <span className="text-xs text-gray-400 ml-1">NF {c.notaFiscal}</span>}
                      {c.obs && <span className="text-xs text-gray-400 ml-1">· {c.obs}</span>}
                    </div>
                    <div className="text-xs text-gray-400 flex-shrink-0 ml-2">{fmtDate(c.data)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'compras' && (
        <div className="space-y-5">
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
            <h2 className="font-bold text-gray-700 mb-4">➕ Lançar Nova Compra de Injetores</h2>
            <form onSubmit={handleAddCompra} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Data da Compra</label>
                  <input type="date" value={form.data}
                    onChange={e => setForm(f => ({ ...f, data: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-400 focus:border-blue-400 outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Quantidade (unidades) <span className="text-red-500">*</span></label>
                  <input type="number" min="1" step="1" value={form.quantidade} placeholder="Ex: 500"
                    onChange={e => setForm(f => ({ ...f, quantidade: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-400 focus:border-blue-400 outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Fornecedor</label>
                  <input type="text" value={form.fornecedor} placeholder="Nome do fornecedor"
                    onChange={e => setForm(f => ({ ...f, fornecedor: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-400 focus:border-blue-400 outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nota Fiscal</label>
                  <input type="text" value={form.notaFiscal} placeholder="Nº da NF"
                    onChange={e => setForm(f => ({ ...f, notaFiscal: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-400 focus:border-blue-400 outline-none" />
                </div>
                <div className="md:col-span-2 lg:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Observação</label>
                  <input type="text" value={form.obs} placeholder="Observações adicionais"
                    onChange={e => setForm(f => ({ ...f, obs: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-400 focus:border-blue-400 outline-none" />
                </div>
              </div>
              <div className="flex gap-3 items-center flex-wrap">
                <button type="submit" disabled={saving || !form.quantidade}
                  className="px-6 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                  {saving ? 'Salvando...' : '✅ Lançar Compra'}
                </button>
                {dash?.saldoAtual != null && (
                  <span className="text-sm text-gray-500">
                    Saldo atual: <strong className={dash.alertaBaixoEstoque ? 'text-red-600' : 'text-green-600'}>{fmtInt(dash.saldoAtual)} un</strong>
                    {form.quantidade && parseInt(form.quantidade) > 0 && (
                      <> → após: <strong className="text-green-600">{fmtInt(dash.saldoAtual + parseInt(form.quantidade || 0))} un</strong></>
                    )}
                  </span>
                )}
              </div>
            </form>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
            <h2 className="font-bold text-gray-700 mb-4">📋 Histórico de Compras</h2>
            {!dash?.compras?.length ? (
              <div className="text-gray-400 text-sm text-center py-8">Nenhuma compra registrada ainda.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="text-left py-2 px-2 text-xs text-gray-500 font-medium">Data</th>
                      <th className="text-right py-2 px-2 text-xs text-gray-500 font-medium">Qtd</th>
                      <th className="text-left py-2 px-2 text-xs text-gray-500 font-medium">Fornecedor</th>
                      <th className="text-left py-2 px-2 text-xs text-gray-500 font-medium">NF</th>
                      <th className="text-left py-2 px-2 text-xs text-gray-500 font-medium">Obs</th>
                      <th className="py-2 px-2 w-10"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {dash.compras.map((c, i) => (
                      <tr key={c._id || i} className="border-b border-gray-50 hover:bg-gray-50">
                        <td className="py-2 px-2 text-gray-600 whitespace-nowrap">{fmtDate(c.data)}</td>
                        <td className="py-2 px-2 text-right font-bold text-blue-600 whitespace-nowrap">{fmtInt(c.quantidade)} un</td>
                        <td className="py-2 px-2 text-gray-500">{c.fornecedor || '—'}</td>
                        <td className="py-2 px-2 text-gray-500">{c.notaFiscal || '—'}</td>
                        <td className="py-2 px-2 text-gray-400">{c.obs || '—'}</td>
                        <td className="py-2 px-2">
                          <button onClick={() => handleDelete(c._id)}
                            className="text-red-400 hover:text-red-600 transition-colors text-xs px-2 py-1 rounded hover:bg-red-50"
                            title="Excluir">✕</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-gray-200">
                      <td className="py-2 px-2 text-sm font-bold text-gray-700">Total</td>
                      <td className="py-2 px-2 text-right font-bold text-blue-700">{fmtInt(dash.totalComprado)} un</td>
                      <td colSpan={4}></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function ProdutosPage() {
  const [produto, setProduto] = useState('gvf') // 'gvf' | 'injetores'

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">📦 Produtos</h1>
          <p className="text-sm text-gray-500 mt-0.5">Gestão de estoque e consumo</p>
        </div>
        {/* Segmented control */}
        <div className="flex bg-gray-100 rounded-xl p-1 gap-1">
          <button
            onClick={() => setProduto('gvf')}
            className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all ${
              produto === 'gvf'
                ? 'bg-white text-orange-600 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            🧴 GVF Seal
          </button>
          <button
            onClick={() => setProduto('injetores')}
            className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all ${
              produto === 'injetores'
                ? 'bg-white text-blue-600 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            💉 Injetores
          </button>
        </div>
      </div>

      {produto === 'gvf' ? <GVFSealPanel /> : <InjetoresPanel />}
    </div>
  )
}
