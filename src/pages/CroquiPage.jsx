import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api/client.js'

const STATUS_CONFIG = {
  agendada:              { label: 'Agendada',            color: 'bg-blue-100 text-blue-700' },
  em_andamento:          { label: 'Em Andamento',        color: 'bg-yellow-100 text-yellow-700' },
  aguardando_assinatura: { label: 'Aguard. Assinatura',  color: 'bg-orange-100 text-orange-700' },
  concluida:             { label: 'Concluída',            color: 'bg-green-100 text-green-700' },
  cancelada:             { label: 'Cancelada',            color: 'bg-red-100 text-red-700' },
}

function fmtData(val) {
  if (!val) return null
  const d = new Date(val)
  if (isNaN(d)) return null
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function CroquiModal({ croqui, onClose }) {
  const st = STATUS_CONFIG[croqui.osStatus] || { label: croqui.osStatus, color: 'bg-gray-100 text-gray-600' }
  const data = fmtData(croqui.osData)
  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="relative max-w-3xl w-full" onClick={e => e.stopPropagation()}>
        <button
          onClick={onClose}
          className="absolute -top-10 right-0 text-white text-2xl font-bold hover:opacity-70"
        >×</button>
        <div className="bg-white rounded-xl overflow-hidden shadow-2xl">
          <div className="p-4 border-b">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="font-bold text-gray-800">
                  OS #{String(croqui.osNumero || '').padStart(3, '0')} — {croqui.pontoNome}
                </div>
                <div className="text-sm text-gray-700 font-medium mt-0.5 truncate">{croqui.osCliente}</div>
                {(croqui.osEndereco || croqui.osBairro || croqui.osCidade) && (
                  <div className="text-xs text-gray-400 mt-0.5 truncate">
                    {[croqui.osEndereco, croqui.osBairro, croqui.osCidade].filter(Boolean).join(' — ')}
                  </div>
                )}
                <div className="flex flex-wrap gap-2 mt-1.5">
                  {croqui.osEquipe && (
                    <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full font-medium">
                      👷 {croqui.osEquipe}
                    </span>
                  )}
                  {data && (
                    <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">
                      📅 {data}
                    </span>
                  )}
                  {croqui.osTipo === 'reparo' && (
                    <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full">🛠️ Reparo</span>
                  )}
                </div>
              </div>
              <div className="flex flex-col items-end gap-1.5 shrink-0">
                {croqui.otimizado && (
                  <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">🤖 IA</span>
                )}
                <span className={`text-xs px-2 py-0.5 rounded-full ${st.color}`}>{st.label}</span>
              </div>
            </div>
          </div>
          <img
            src={croqui.imagem}
            alt={`Croqui ${croqui.pontoNome}`}
            className="w-full object-contain max-h-[65vh] bg-gray-50"
          />
        </div>
      </div>
    </div>
  )
}

export default function CroquiPage() {
  const navigate = useNavigate()
  const [croquis, setCroquis] = useState([])
  const [loading, setLoading] = useState(true)
  const [busca, setBusca] = useState('')
  const [filtroTipo, setFiltroTipo] = useState('todos')  // todos | obra | reparo
  const [modalCroqui, setModalCroqui] = useState(null)
  const [viewMode, setViewMode] = useState('agrupado')   // agrupado | galeria

  useEffect(() => {
    setLoading(true)
    api.getCroquis()
      .then(setCroquis)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  const filtrados = croquis.filter(c => {
    if (filtroTipo === 'obra'   && c.osTipo === 'reparo') return false
    if (filtroTipo === 'reparo' && c.osTipo !== 'reparo') return false
    if (!busca.trim()) return true
    const q = busca.toLowerCase()
    return (
      (c.osCliente  || '').toLowerCase().includes(q) ||
      (c.osEndereco || '').toLowerCase().includes(q) ||
      (c.pontoNome  || '').toLowerCase().includes(q) ||
      String(c.osNumero || '').includes(q)
    )
  })

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
    </div>
  )

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">🗺️ Croquis de Obra</h1>
          <p className="text-gray-500 text-sm mt-1">
            Desenhos feitos pelo aplicador no celular — {croquis.length} croqui{croquis.length !== 1 ? 's' : ''}
          </p>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-3 mb-6">
        <input
          type="text"
          className="input max-w-xs"
          placeholder="Buscar cliente, local ou OS..."
          value={busca}
          onChange={e => setBusca(e.target.value)}
        />
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
          {[
            { v: 'todos',  l: 'Todos' },
            { v: 'obra',   l: '🔧 Obras' },
            { v: 'reparo', l: '🛠️ Reparos' },
          ].map(({ v, l }) => (
            <button
              key={v}
              onClick={() => setFiltroTipo(v)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                filtroTipo === v
                  ? 'bg-white shadow text-gray-800'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {l}
            </button>
          ))}
        </div>
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1 ml-auto">
          {[{ v: 'agrupado', l: '📂 Por OS' }, { v: 'galeria', l: '⊞ Galeria' }].map(({ v, l }) => (
            <button key={v} onClick={() => setViewMode(v)} className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${viewMode === v ? 'bg-white shadow text-gray-800' : 'text-gray-500 hover:text-gray-700'}`}>{l}</button>
          ))}
        </div>
      </div>

      {/* Gallery */}
      {filtrados.length === 0 ? (
        <div className="card text-center py-16">
          <div className="text-5xl mb-4">🗺️</div>
          <h2 className="text-lg font-semibold text-gray-700 mb-2">
            {croquis.length === 0 ? 'Nenhum croqui registrado' : 'Nenhum resultado'}
          </h2>
          <p className="text-gray-500 text-sm max-w-sm mx-auto">
            {croquis.length === 0
              ? 'Os croquis desenhados pelo aplicador no celular aparecem aqui automaticamente.'
              : 'Tente ajustar os filtros de busca.'
            }
          </p>
        </div>
      ) : viewMode === 'agrupado' ? (
        /* ── Agrupado por OS ── */
        (() => {
          const grupos = []
          const seen = new Map()
          filtrados.forEach(c => {
            if (!seen.has(c.osId)) {
              seen.set(c.osId, grupos.length)
              grupos.push({ osId: c.osId, osNumero: c.osNumero, osCliente: c.osCliente, osEndereco: c.osEndereco, osBairro: c.osBairro, osCidade: c.osCidade, osStatus: c.osStatus, osTipo: c.osTipo, osEquipe: c.osEquipe, osData: c.osData, items: [] })
            }
            grupos[seen.get(c.osId)].items.push(c)
          })
          return (
            <div className="space-y-6">
              {grupos.map(g => {
                const st = STATUS_CONFIG[g.osStatus] || { label: g.osStatus, color: 'bg-gray-100 text-gray-600' }
                return (
                  <div key={g.osId} className="card p-0 overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b">
                      <div className="flex items-center gap-3 min-w-0">
                        <button onClick={() => navigate(`/ordens-servico/${g.osId}`)} className="font-bold text-primary hover:underline text-sm shrink-0">
                          OS #{String(g.osNumero || '').padStart(3, '0')}
                        </button>
                        <span className="font-medium text-gray-700 text-sm truncate">{g.osCliente}</span>
                        {(g.osEndereco || g.osBairro || g.osCidade) && (
                          <span className="text-xs text-gray-400 hidden sm:inline truncate">
                            {[g.osEndereco, g.osBairro, g.osCidade].filter(Boolean).join(' — ')}
                          </span>
                        )}
                        {g.osEquipe && (
                          <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full font-medium hidden md:inline shrink-0">
                            👷 {g.osEquipe}
                          </span>
                        )}
                        {g.osData && (
                          <span className="text-xs text-gray-400 hidden lg:inline shrink-0">
                            {fmtData(g.osData)}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-xs text-gray-400">{g.items.length} croqui{g.items.length !== 1 ? 's' : ''}</span>
                        {g.osTipo === 'reparo' && <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full">🛠️</span>}
                        <span className={`text-xs px-2 py-0.5 rounded-full ${st.color}`}>{st.label}</span>
                        <button
                          onClick={() => window.open(api.getGarantiaOSUrl(g.osId), '_blank')}
                          className="text-xs px-2 py-1 rounded bg-blue-100 text-blue-700 hover:bg-blue-200"
                          title="PDF com croquis desta OS"
                        >
                          📄 PDF
                        </button>
                      </div>
                    </div>
                    <div className="p-3 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                      {g.items.map((c, i) => (
                        <div key={i} className="cursor-pointer rounded-lg overflow-hidden border border-gray-200 hover:shadow-md transition-shadow group" onClick={() => setModalCroqui(c)}>
                          <div className="relative bg-gray-100 aspect-[4/3]">
                            <img src={c.imagem} alt={c.pontoNome} className="w-full h-full object-contain group-hover:scale-105 transition-transform" />
                            {c.otimizado && <div className="absolute top-1 left-1 bg-purple-600 text-white text-[10px] px-1 py-0.5 rounded-full">🤖 IA</div>}
                          </div>
                          <div className="p-2 bg-white">
                            <div className="text-xs font-medium text-gray-700 truncate">{c.pontoNome}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          )
        })()
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {filtrados.map((c, i) => {
            const st = STATUS_CONFIG[c.osStatus] || { label: c.osStatus, color: 'bg-gray-100 text-gray-600' }
            return (
              <div
                key={`${c.osId}-${c.pontoIdx}-${i}`}
                className="card p-0 overflow-hidden cursor-pointer hover:shadow-lg transition-shadow group"
                onClick={() => setModalCroqui(c)}
              >
                {/* Thumbnail */}
                <div className="relative bg-gray-100 aspect-[4/3]">
                  <img
                    src={c.imagem}
                    alt={c.pontoNome}
                    className="w-full h-full object-contain group-hover:scale-105 transition-transform"
                  />
                  {c.otimizado && (
                    <div className="absolute top-2 left-2 bg-purple-600 text-white text-xs px-1.5 py-0.5 rounded-full">
                      🤖 IA
                    </div>
                  )}
                  <div className="absolute top-2 right-2">
                    <span className={`text-xs px-1.5 py-0.5 rounded-full ${st.color}`}>{st.label}</span>
                  </div>
                </div>

                {/* Info */}
                <div className="p-3">
                  <div className="font-semibold text-sm text-gray-800 truncate">{c.pontoNome}</div>
                  <div className="text-xs text-gray-500 mt-0.5 truncate">
                    OS #{String(c.osNumero || '').padStart(3, '0')} — {c.osCliente}
                  </div>
                  {(c.osEndereco || c.osCidade) && (
                    <div className="text-xs text-gray-400 mt-0.5 truncate">
                      {[c.osEndereco, c.osBairro, c.osCidade].filter(Boolean).join(', ')}
                    </div>
                  )}
                  {c.osEquipe && (
                    <div className="text-xs text-orange-600 font-medium mt-0.5 truncate">👷 {c.osEquipe}</div>
                  )}
                  <button
                    onClick={e => { e.stopPropagation(); navigate(`/ordens-servico/${c.osId}`) }}
                    className="mt-2 text-xs text-primary hover:underline"
                  >
                    Ver OS →
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Modal */}
      {modalCroqui && (
        <CroquiModal croqui={modalCroqui} onClose={() => setModalCroqui(null)} />
      )}
    </div>
  )
}
