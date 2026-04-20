import React, { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { api } from '../api/client.js'

export default function MedicaoDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [medicao, setMedicao] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.getMedicao(id)
      .then(setMedicao)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [id])

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
    </div>
  )

  if (!medicao) return (
    <div className="p-6 text-center text-gray-500">Medição não encontrada</div>
  )

  const m = medicao
  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate('/medicoes')} className="btn-secondary">
          Voltar
        </button>
        <h1 className="text-xl font-bold text-gray-800">
          Medição #{String(m.numeroMedicao || '').padStart(3, '0')}
        </h1>
        <button
          className="btn-primary ml-auto"
          onClick={() => navigate(`/orcamentos/novo/${m.id}`)}
        >
          Gerar Orçamento
        </button>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="card">
          <h2 className="font-semibold mb-3 text-primary">Cliente</h2>
          <dl className="space-y-2 text-sm">
            {[
              ['Nome', m.cliente || m.nomeCliente],
              ['AC', m.ac],
              ['Endereço', m.endereco],
              ['Cidade', m.cidade],
              ['CEP', m.cep],
              ['Celular', m.celular || m.telefone]
            ].map(([k, v]) => v ? (
              <div key={k} className="flex gap-2">
                <dt className="font-medium text-gray-500 w-24 flex-shrink-0">{k}:</dt>
                <dd className="text-gray-800">{v}</dd>
              </div>
            ) : null)}
          </dl>
        </div>

        <div className="card">
          <h2 className="font-semibold mb-3 text-primary">Informações</h2>
          <dl className="space-y-2 text-sm">
            {[
              ['Medidor', m.medidor],
              ['Data', m.receivedAt ? new Date(m.receivedAt).toLocaleString('pt-BR') : null],
              ['Status', m.status],
              ['Locais', Array.isArray(m.locais) ? `${m.locais.length} locais` : null],
              ['Fotos', Array.isArray(m.fotos) ? `${m.fotos.length} fotos` : null]
            ].map(([k, v]) => v ? (
              <div key={k} className="flex gap-2">
                <dt className="font-medium text-gray-500 w-24 flex-shrink-0">{k}:</dt>
                <dd className="text-gray-800 capitalize">{v}</dd>
              </div>
            ) : null)}
          </dl>
        </div>

        {Array.isArray(m.locais) && m.locais.length > 0 && (
          <div className="card md:col-span-2">
            <h2 className="font-semibold mb-3 text-primary">Locais</h2>
            <div className="grid sm:grid-cols-2 gap-3">
              {m.locais.map((local, i) => (
                <div key={i} className="bg-gray-50 rounded-lg p-3 text-sm">
                  <div className="font-medium mb-1">{local.nome || local.local || `Local ${i + 1}`}</div>
                  {Object.entries(local).filter(([k]) => !['nome', 'local', 'fotos'].includes(k)).map(([k, v]) => (
                    <div key={k} className="text-gray-500"><span className="font-medium">{k}:</span> {String(v)}</div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}

        {Array.isArray(m.fotos) && m.fotos.length > 0 && (
          <div className="card md:col-span-2">
            <h2 className="font-semibold mb-3 text-primary">Fotos ({m.fotos.length})</h2>
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
              {m.fotos.map((foto, i) => (
                <img
                  key={i}
                  src={foto.url || foto}
                  alt={`Foto ${i + 1}`}
                  className="w-full aspect-square object-cover rounded-lg"
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
