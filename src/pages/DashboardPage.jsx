import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api/client.js'

function MetricCard({ label, value, sub, color, icon, onClick }) {
  return (
    <div
      className={`card flex items-start gap-4 ${onClick ? 'cursor-pointer hover:shadow-md transition-shadow' : ''}`}
      onClick={onClick}
    >
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${color}`}>
        {icon}
      </div>
      <div>
        <div className="text-2xl font-bold text-gray-800">{value}</div>
        <div className="text-sm font-medium text-gray-700">{label}</div>
        {sub && <div className="text-xs text-gray-400 mt-0.5">{sub}</div>}
      </div>
    </div>
  )
}

function statusLabel(status) {
  const map = {
    pendente: 'Pendente',
    rascunho: 'Rascunho',
    enviado: 'Enviado',
    aprovado: 'Aprovado',
    aguardando_assinatura: 'Aguardando Assinatura',
    assinado: 'Assinado'
  }
  return map[status] || status
}

function statusColor(status) {
  const map = {
    pendente: 'bg-yellow-100 text-yellow-800',
    rascunho: 'bg-gray-100 text-gray-700',
    enviado: 'bg-blue-100 text-blue-800',
    aprovado: 'bg-green-100 text-green-800',
    aguardando_assinatura: 'bg-orange-100 text-orange-800',
    assinado: 'bg-green-100 text-green-800'
  }
  return map[status] || 'bg-gray-100 text-gray-700'
}

export default function DashboardPage() {
  const navigate = useNavigate()
  const [data, setData] = useState({ medicoes: [], orcamentos: [], contratos: [] })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      try {
        const [medicoes, orcamentos, contratos] = await Promise.all([
          api.getMedicoes(),
          api.getOrcamentos(),
          api.getContratos()
        ])
        setData({ medicoes, orcamentos, contratos })
      } catch (err) {
        console.error(err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const today = new Date().toDateString()
  const medicoesHoje = data.medicoes.filter(m => new Date(m.receivedAt).toDateString() === today).length
  const orcPendentes = data.orcamentos.filter(o => o.status === 'rascunho' || o.status === 'enviado').length
  const contPendentes = data.contratos.filter(c => c.status === 'aguardando_assinatura').length
  const contAssinados = data.contratos.filter(c => c.status === 'assinado').length

  // Recent activity: merge and sort
  const recent = [
    ...data.medicoes.slice(0, 5).map(m => ({ ...m, _type: 'medicao', _date: m.receivedAt })),
    ...data.orcamentos.slice(0, 5).map(o => ({ ...o, _type: 'orcamento', _date: o.createdAt })),
    ...data.contratos.slice(0, 5).map(c => ({ ...c, _type: 'contrato', _date: c.createdAt }))
  ]
    .sort((a, b) => new Date(b._date) - new Date(a._date))
    .slice(0, 10)

  const typeIcon = {
    medicao: { label: 'Medição', color: 'bg-purple-100 text-purple-700' },
    orcamento: { label: 'Orçamento', color: 'bg-blue-100 text-blue-700' },
    contrato: { label: 'Contrato', color: 'bg-green-100 text-green-700' }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    )
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Dashboard</h1>
        <p className="text-gray-500 text-sm mt-1">Resumo das atividades</p>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <MetricCard
          label="Medições Hoje"
          value={medicoesHoje}
          sub={`${data.medicoes.length} total`}
          color="bg-purple-100"
          onClick={() => navigate('/medicoes')}
          icon={
            <svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
          }
        />
        <MetricCard
          label="Orçamentos Pendentes"
          value={orcPendentes}
          sub={`${data.orcamentos.length} total`}
          color="bg-blue-100"
          onClick={() => navigate('/orcamentos')}
          icon={
            <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          }
        />
        <MetricCard
          label="Aguardando Assinatura"
          value={contPendentes}
          sub={`${data.contratos.length} contratos`}
          color="bg-orange-100"
          onClick={() => navigate('/contratos')}
          icon={
            <svg className="w-5 h-5 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
            </svg>
          }
        />
        <MetricCard
          label="Obras Ativas"
          value={contAssinados}
          sub="contratos assinados"
          color="bg-green-100"
          onClick={() => navigate('/contratos')}
          icon={
            <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
        />
      </div>

      {/* Recent Activity */}
      <div className="card">
        <h2 className="text-base font-semibold text-gray-800 mb-4">Atividade Recente</h2>
        {recent.length === 0 ? (
          <p className="text-gray-400 text-sm text-center py-8">Nenhuma atividade ainda</p>
        ) : (
          <div className="divide-y divide-gray-100">
            {recent.map((item, i) => {
              const ti = typeIcon[item._type]
              const href = item._type === 'medicao'
                ? `/medicoes/${item.id}`
                : item._type === 'orcamento'
                ? `/orcamentos/${item.id}`
                : `/contratos/${item.id}`

              return (
                <div
                  key={`${item._type}-${item.id}-${i}`}
                  className="flex items-center gap-3 py-3 cursor-pointer hover:bg-gray-50 px-2 rounded-lg -mx-2 transition-colors"
                  onClick={() => navigate(href)}
                >
                  <span className={`badge ${ti.color}`}>{ti.label}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-800 truncate">
                      {item.cliente || item.nomeCliente || `#${item.numero || item.numeroMedicao || item.id?.slice(0, 6)}`}
                    </div>
                    <div className="text-xs text-gray-400">
                      {item.cidade || ''}{item.medidor ? ` — ${item.medidor}` : ''}
                    </div>
                  </div>
                  <span className={`badge ${statusColor(item.status)}`}>
                    {statusLabel(item.status)}
                  </span>
                  <span className="text-xs text-gray-400 flex-shrink-0">
                    {new Date(item._date).toLocaleDateString('pt-BR')}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
