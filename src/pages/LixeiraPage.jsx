import React, { useEffect, useState } from 'react'
import { api } from '../api/client.js'

const TIPO_CONFIG = {
  os:        { label: 'Ordem de Serviço', color: 'bg-yellow-100 text-yellow-800', icon: '🔧' },
  orcamento: { label: 'Orçamento',        color: 'bg-blue-100 text-blue-800',    icon: '📋' },
  contrato:  { label: 'Contrato',         color: 'bg-purple-100 text-purple-800',icon: '📄' },
  medicao:   { label: 'Medição',          color: 'bg-green-100 text-green-800',  icon: '📏' },
}

function fmtDate(ts) {
  if (!ts) return '—'
  return new Date(ts).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export default function LixeiraPage() {
  const [itens, setItens] = useState([])
  const [loading, setLoading] = useState(true)
  const [filtroTipo, setFiltroTipo] = useState('')
  const [restaurando, setRestaurando] = useState(null)
  const [deletando, setDeletando] = useState(null)
  const [msg, setMsg] = useState(null) // { tipo: 'ok'|'erro', texto }

  const load = () => {
    setLoading(true)
    api.getLixeira()
      .then(setItens)
      .catch(e => setMsg({ tipo: 'erro', texto: e.message }))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const showMsg = (tipo, texto) => {
    setMsg({ tipo, texto })
    setTimeout(() => setMsg(null), 4000)
  }

  const handleRestaurar = async (id, identificacao) => {
    if (!confirm(`Restaurar "${identificacao}" para o local de origem?`)) return
    setRestaurando(id)
    try {
      const r = await api.restaurarItem(id)
      setItens(prev => prev.filter(i => i._id !== id))
      showMsg('ok', `✅ "${r.identificacao}" restaurado com sucesso!`)
    } catch (err) {
      showMsg('erro', 'Erro ao restaurar: ' + err.message)
    } finally {
      setRestaurando(null)
    }
  }

  const handleDeletarPermanente = async (id, identificacao) => {
    if (!confirm(`⚠️ EXCLUIR PERMANENTEMENTE "${identificacao}"?\n\nEsta ação é IRREVERSÍVEL — o item será apagado para sempre.`)) return
    setDeletando(id)
    try {
      await api.deletarPermanente(id)
      setItens(prev => prev.filter(i => i._id !== id))
      showMsg('ok', `🗑️ "${identificacao}" excluído permanentemente.`)
    } catch (err) {
      showMsg('erro', 'Erro ao excluir: ' + err.message)
    } finally {
      setDeletando(null)
    }
  }

  const filtrados = filtroTipo ? itens.filter(i => i.tipo === filtroTipo) : itens

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            🗑️ Lixeira
          </h1>
          <p className="text-gray-500 text-sm mt-0.5">
            Itens excluídos — somente o admin pode restaurar ou apagar permanentemente
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <span className="font-medium">{itens.length}</span> item(ns) na lixeira
        </div>
      </div>

      {/* Toast */}
      {msg && (
        <div className={`mb-4 px-4 py-3 rounded-lg text-sm font-medium ${
          msg.tipo === 'ok' ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'
        }`}>
          {msg.texto}
        </div>
      )}

      {/* Filtro por tipo */}
      <div className="card mb-4 flex gap-2 flex-wrap">
        <button
          onClick={() => setFiltroTipo('')}
          className={`text-xs px-3 py-1.5 rounded-full border transition-all ${!filtroTipo ? 'bg-primary text-white border-transparent' : 'border-gray-200 text-gray-600 hover:border-gray-300'}`}
        >
          Todos ({itens.length})
        </button>
        {Object.entries(TIPO_CONFIG).map(([key, cfg]) => {
          const count = itens.filter(i => i.tipo === key).length
          if (count === 0) return null
          return (
            <button
              key={key}
              onClick={() => setFiltroTipo(key)}
              className={`text-xs px-3 py-1.5 rounded-full border transition-all ${filtroTipo === key ? 'bg-primary text-white border-transparent' : 'border-gray-200 text-gray-600 hover:border-gray-300'}`}
            >
              {cfg.icon} {cfg.label} ({count})
            </button>
          )
        })}
      </div>

      {/* Lista */}
      {loading ? (
        <div className="flex items-center justify-center h-48">
          <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
        </div>
      ) : filtrados.length === 0 ? (
        <div className="card text-center py-16 text-gray-400">
          <div className="text-5xl mb-3">✨</div>
          <p className="font-medium text-gray-600">Lixeira vazia</p>
          <p className="text-sm mt-1">Nenhum item foi excluído{filtroTipo ? ' deste tipo' : ''}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtrados.map(item => {
            const cfg = TIPO_CONFIG[item.tipo] || { label: item.tipo, color: 'bg-gray-100 text-gray-700', icon: '📁' }
            const isRestaurando = restaurando === item._id
            const isDeletando = deletando === item._id

            return (
              <div key={item._id} className="card border border-gray-100 hover:border-gray-200 transition-colors">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cfg.color}`}>
                        {cfg.icon} {cfg.label}
                      </span>
                    </div>
                    <p className="font-semibold text-gray-800 text-sm mb-1">{item.identificacao}</p>
                    <div className="flex gap-4 text-xs text-gray-500 flex-wrap">
                      <span>🕐 Excluído em {fmtDate(item.deletadoEm)}</span>
                      {item.deletadoPor && (
                        <span>👤 por {item.deletadoPor}</span>
                      )}
                    </div>
                  </div>

                  {/* Ações */}
                  <div className="flex gap-2 flex-shrink-0 items-center">
                    <button
                      onClick={() => handleRestaurar(item._id, item.identificacao)}
                      disabled={isRestaurando || isDeletando}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-green-50 text-green-700 border border-green-200 rounded-lg text-xs font-medium hover:bg-green-100 transition-colors disabled:opacity-50"
                    >
                      {isRestaurando ? (
                        <span className="animate-spin w-3 h-3 border-2 border-green-600 border-t-transparent rounded-full inline-block" />
                      ) : '♻️'}
                      {isRestaurando ? 'Restaurando...' : 'Restaurar'}
                    </button>
                    <button
                      onClick={() => handleDeletarPermanente(item._id, item.identificacao)}
                      disabled={isRestaurando || isDeletando}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 text-red-600 border border-red-200 rounded-lg text-xs font-medium hover:bg-red-100 transition-colors disabled:opacity-50"
                      title="Excluir permanentemente (irreversível)"
                    >
                      {isDeletando ? (
                        <span className="animate-spin w-3 h-3 border-2 border-red-500 border-t-transparent rounded-full inline-block" />
                      ) : '🗑️'}
                      {isDeletando ? 'Apagando...' : 'Apagar'}
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
