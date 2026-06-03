import React, { useEffect, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { api } from '../api/client.js'
import NovoReparoModal from '../components/NovoReparoModal.jsx'
import { fmtNumeroOS } from '../lib/osNumero.js'

const STATUS_CONFIG = {
  agendada:               { label: 'Agendada',             color: 'bg-blue-100 text-blue-700' },
  em_andamento:           { label: 'Em Andamento',         color: 'bg-yellow-100 text-yellow-700' },
  aguardando_assinatura:  { label: 'Aguard. Assinatura',   color: 'bg-orange-100 text-orange-700' },
  concluida:              { label: 'Concluída',             color: 'bg-green-100 text-green-700' },
  cancelada:              { label: 'Cancelada',             color: 'bg-red-100 text-red-700' },
}


/* ────────────────────────── ReparosPage (main) ───────────────────────────── */
export default function ReparosPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const [reparos, setReparos] = useState([])
  const [loading, setLoading] = useState(true)
  const [novoModalOpen, setNovoModalOpen] = useState(false)
  const [preloadOS, setPreloadOS] = useState(null) // pre-loaded from navigation state

  const load = () => {
    setLoading(true)
    api.getReparos()
      .then(setReparos)
      .catch(console.error)
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  // Auto-open modal when navigating from OS detail with state
  useEffect(() => {
    if (location.state?.osOriginalId) {
      setPreloadOS({
        id: location.state.osOriginalId,
        cliente: location.state.osCliente,
        pontos: location.state.osPontos || [],
      })
      setNovoModalOpen(true)
      // Clear state so re-visits don't re-open
      window.history.replaceState({}, '')
    }
  }, [location.state])

  const handleCreated = (novaOS) => {
    setReparos(prev => [novaOS, ...prev])
    navigate(`/ordens-servico/${novaOS._id || novaOS.id}`)
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
    </div>
  )

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">🔧 Reparos / Assistência Técnica</h1>
          <p className="text-gray-500 text-sm mt-1">Ordens de serviço de reparo em obras executadas</p>
        </div>
        <button onClick={() => setNovoModalOpen(true)} className="btn-primary">
          + Novo Reparo
        </button>
      </div>

      {reparos.length === 0 ? (
        <div className="card text-center py-16">
          <div className="text-5xl mb-4">🔧</div>
          <h2 className="text-lg font-semibold text-gray-700 mb-2">Nenhum reparo registrado</h2>
          <p className="text-gray-500 text-sm max-w-sm mx-auto mb-6">
            Crie um reparo a partir de uma OS ou contrato concluído.
          </p>
          <button onClick={() => setNovoModalOpen(true)} className="btn-primary">
            + Criar primeiro reparo
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {reparos.map(os => {
            const id = os.id || os._id
            const st = STATUS_CONFIG[os.status] || STATUS_CONFIG.agendada
            return (
              <div
                key={id}
                className="card cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => navigate(`/ordens-servico/${id}`)}
              >
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-gray-800">
                        🔧 OS #{fmtNumeroOS(os)}
                      </span>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${st.color}`}>{st.label}</span>
                      {os.tipoReparo && (
                        <span className="text-xs bg-orange-50 text-orange-700 border border-orange-200 px-2 py-0.5 rounded-full">
                          {os.tipoReparo}
                        </span>
                      )}
                    </div>
                    <div className="text-sm text-gray-600 mt-0.5">{os.cliente}</div>
                    {os.endereco && <div className="text-xs text-gray-400 mt-0.5">{os.endereco}{os.cidade ? `, ${os.cidade}` : ''}</div>}
                    <div className="flex flex-wrap gap-3 mt-1.5 text-xs text-gray-500">
                      {os.dataInicio && <span>📅 {new Date(os.dataInicio + 'T12:00:00').toLocaleDateString('pt-BR')}</span>}
                      {os.equipeNome && <span>👷 {os.equipeNome}</span>}
                      {os.osOriginalId && <span>📋 Ref. OS origem</span>}
                    </div>
                  </div>
                  <div className="text-gray-300 text-lg">›</div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {novoModalOpen && (
        <NovoReparoModal
          onClose={() => { setNovoModalOpen(false); setPreloadOS(null) }}
          onCreated={handleCreated}
          preloadOS={preloadOS}
        />
      )}
    </div>
  )
}
