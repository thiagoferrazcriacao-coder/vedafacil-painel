import React, { useState, useEffect, useCallback } from 'react'
import { api } from '../api/client.js'

const fmt = (n) => Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('pt-BR') : '—'

export default function ProdutosPage() {
  const [dash, setDash] = useState(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('dashboard') // 'dashboard' | 'compras'
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
    <div className="p-6 flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500" />
    </div>
  )

  const saldo = dash?.saldoAtual ?? 0
  const alerta = dash?.alertaBaixoEstoque

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">🧴 Produtos</h1>
          <p className="text-sm text-gray-500 mt-0.5">Gestão de estoque — GVF Seal</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setTab('dashboard')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === 'dashboard' ? 'bg-orange-500 text-white' : 'bg-white text-gray-600 border border-gray-300 hover:border-orange-400'}`}>
            📊 Dashboard
          </button>
          <button onClick={() => setTab('compras')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === 'compras' ? 'bg-orange-500 text-white' : 'bg-white text-gray-600 border border-gray-300 hover:border-orange-400'}`}>
            🛒 Lançar Compra
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>
      )}

      {/* Alerta baixo estoque */}
      {alerta && (
        <div className="mb-5 p-4 bg-red-50 border-l-4 border-red-500 rounded-lg flex items-start gap-3">
          <span className="text-2xl">⚠️</span>
          <div>
            <div className="font-bold text-red-800">Estoque baixo!</div>
            <div className="text-red-700 text-sm mt-0.5">
              Saldo atual: <strong>{fmt(saldo)}L</strong>. Mínimo recomendado: 100L. <strong>Compre mais produto!</strong>
            </div>
          </div>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
          <div className="text-xs text-gray-500 mb-1">Total Comprado</div>
          <div className="text-2xl font-bold text-blue-600">{fmt(dash?.totalComprado)}L</div>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
          <div className="text-xs text-gray-500 mb-1">Total Gasto</div>
          <div className="text-2xl font-bold text-red-600">{fmt(dash?.totalGasto)}L</div>
        </div>
        <div className={`rounded-xl p-4 shadow-sm border ${alerta ? 'bg-red-50 border-red-200' : 'bg-white border-gray-100'}`}>
          <div className="text-xs text-gray-500 mb-1">Saldo Atual</div>
          <div className={`text-2xl font-bold ${alerta ? 'text-red-600' : saldo < 200 ? 'text-yellow-600' : 'text-green-600'}`}>
            {fmt(saldo)}L
          </div>
          {alerta && <div className="text-xs text-red-500 mt-1 font-medium">⚠ Comprar!</div>}
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
          <div className="text-xs text-gray-500 mb-1">Alerta Mínimo</div>
          <div className="text-2xl font-bold text-gray-400">100L</div>
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
            {/* Barra proporcional */}
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

          {/* Top Obras/Reparos */}
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

          {/* Histórico de Compras (resumido) */}
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

      {tab === 'compras' && (
        <div className="space-y-5">
          {/* Form lançar compra */}
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
              <div className="flex gap-3 items-center">
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

          {/* Histórico completo */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
            <h2 className="font-bold text-gray-700 mb-4">📋 Histórico de Compras</h2>
            {!dash?.compras?.length ? (
              <div className="text-gray-400 text-sm text-center py-8">Nenhuma compra registrada ainda.<br />Use o formulário acima para lançar a primeira compra.</div>
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
