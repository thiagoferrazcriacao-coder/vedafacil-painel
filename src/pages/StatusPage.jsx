import React, { useEffect, useState, useRef } from 'react'
import { api } from '../api/client.js'

// Mapeamento status → cor visual
const STATUS_STYLE = {
  ok:      { bg: 'bg-green-50',   border: 'border-green-200',   text: 'text-green-800',   pill: 'bg-green-100 text-green-700',   barra: 'bg-green-500',  label: 'OK' },
  warn:    { bg: 'bg-amber-50',   border: 'border-amber-200',   text: 'text-amber-800',   pill: 'bg-amber-100 text-amber-700',   barra: 'bg-amber-500',  label: 'ATENÇÃO' },
  crit:    { bg: 'bg-red-50',     border: 'border-red-200',     text: 'text-red-800',     pill: 'bg-red-100 text-red-700',       barra: 'bg-red-500',    label: 'CRÍTICO' },
  info:    { bg: 'bg-gray-50',    border: 'border-gray-200',    text: 'text-gray-700',    pill: 'bg-gray-100 text-gray-600',     barra: 'bg-gray-400',   label: 'INFO' },
  unknown: { bg: 'bg-gray-50',    border: 'border-gray-200',    text: 'text-gray-500',    pill: 'bg-gray-100 text-gray-500',     barra: 'bg-gray-300',   label: 'SEM DADO' },
}

// Agrupamento de métricas em seções
const SECOES = [
  {
    titulo: '🗄️ Banco de Dados (MongoDB Atlas)',
    descricao: 'Saúde da conexão com o banco, latência e uso do plano gratuito',
    chaves: ['mongo_conexao', 'mongo_latencia', 'mongo_storage', 'mongo_conexoes', 'mongo_documentos'],
  },
  {
    titulo: '🌐 API do Painel',
    descricao: 'Performance das chamadas HTTP nos últimos 5 minutos',
    chaves: ['api_tempo_medio', 'api_tempo_p95', 'api_taxa_erro', 'api_payload_medio', 'api_payload_max', 'api_requisicoes'],
  },
  {
    titulo: '🖥️ Container Vercel',
    descricao: 'Recursos do servidor onde a API está rodando',
    chaves: ['sistema_memoria', 'sistema_heap', 'sistema_uptime'],
  },
]

function fmtValor(m) {
  if (m.atualFmt) return m.atualFmt
  if (m.atual == null) return '—'
  if (typeof m.atual === 'number') {
    if (m.unidade === 'ms') return `${m.atual} ms`
    if (m.unidade === '%') return `${m.atual}%`
    if (m.unidade === 's' && m.atual > 60) return `${Math.round(m.atual / 60)} min`
    return `${m.atual}${m.unidade ? ' ' + m.unidade : ''}`
  }
  return String(m.atual)
}

function MetricaCard({ chave, m }) {
  const style = STATUS_STYLE[m.status] || STATUS_STYLE.unknown
  const showBarra = typeof m.percent === 'number'
  return (
    <div className={`${style.bg} ${style.border} border-2 rounded-xl p-4 transition-all`}>
      <div className="flex items-start justify-between mb-2">
        <h3 className="font-semibold text-gray-900 text-sm">{m.label}</h3>
        <span className={`${style.pill} text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap`}>
          {style.label}
        </span>
      </div>
      {m.descricao && (
        <p className="text-xs text-gray-500 mb-3">{m.descricao}</p>
      )}
      {/* Valor atual em destaque */}
      <div className={`text-3xl font-bold ${style.text} mb-3`}>
        {fmtValor(m)}
      </div>
      {/* Barra de progresso quando há percentual (storage, conexões) */}
      {showBarra && (
        <div className="mb-3">
          <div className="flex justify-between text-[10px] text-gray-500 mb-1">
            <span>0%</span><span>{m.percent}% usado</span><span>100%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
            <div className={`${style.barra} h-full transition-all`} style={{ width: `${Math.min(100, m.percent)}%` }} />
          </div>
        </div>
      )}
      {/* Tabela ideal × limite × atual */}
      <div className="grid grid-cols-3 gap-1 text-[10px] mt-2 pt-2 border-t border-gray-200">
        <div className="text-center">
          <div className="text-gray-400 uppercase tracking-wide mb-0.5">Ideal</div>
          <div className="font-medium text-green-700">{m.ideal}</div>
        </div>
        <div className="text-center">
          <div className="text-gray-400 uppercase tracking-wide mb-0.5">Limite</div>
          <div className="font-medium text-red-700">{m.limite}</div>
        </div>
        <div className="text-center">
          <div className="text-gray-400 uppercase tracking-wide mb-0.5">Atual</div>
          <div className={`font-medium ${style.text}`}>{fmtValor(m)}</div>
        </div>
      </div>
    </div>
  )
}

export default function StatusPage() {
  const [data, setData] = useState(null)
  const [erro, setErro] = useState(null)
  const [loading, setLoading] = useState(true)
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [lastUpdate, setLastUpdate] = useState(null)
  const timerRef = useRef(null)

  const carregar = async () => {
    try {
      const res = await api.getStatus()
      setData(res)
      setErro(null)
      setLastUpdate(new Date())
    } catch (e) {
      setErro(e.message || 'Falha ao buscar status')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    carregar()
  }, [])

  useEffect(() => {
    if (autoRefresh) {
      timerRef.current = setInterval(carregar, 15000) // 15s
    } else if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [autoRefresh])

  if (loading) {
    return (
      <div className="p-6 max-w-7xl mx-auto">
        <div className="text-center py-12 text-gray-500">Carregando status...</div>
      </div>
    )
  }

  if (erro || !data) {
    return (
      <div className="p-6 max-w-7xl mx-auto">
        <div className="bg-red-50 border-2 border-red-200 rounded-xl p-6 text-red-800">
          <h2 className="font-bold mb-2">⚠️ Falha ao carregar status</h2>
          <p className="text-sm mb-3">{erro || 'Erro desconhecido'}</p>
          <button onClick={carregar} className="bg-red-600 text-white px-4 py-2 rounded font-medium hover:bg-red-700">
            Tentar novamente
          </button>
        </div>
      </div>
    )
  }

  const resumoStyle = STATUS_STYLE[data.resumo] || STATUS_STYLE.info

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto">
      {/* Header com resumo global */}
      <div className="mb-6">
        <div className="flex items-start justify-between mb-3 flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 mb-1">Status do Sistema</h1>
            <p className="text-sm text-gray-600">
              Janela: últimos {data.janelaMin} min · Atualizado {lastUpdate ? lastUpdate.toLocaleTimeString('pt-BR') : '—'}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={e => setAutoRefresh(e.target.checked)}
                className="w-4 h-4"
              />
              Auto-refresh (15s)
            </label>
            <button onClick={carregar} className="bg-orange-500 hover:bg-orange-600 text-white text-sm font-medium px-4 py-2 rounded">
              🔄 Atualizar
            </button>
          </div>
        </div>

        {/* Banner do resumo global */}
        <div className={`${resumoStyle.bg} ${resumoStyle.border} border-2 rounded-xl p-4 flex items-center gap-3`}>
          <div className={`w-3 h-3 rounded-full ${resumoStyle.barra} animate-pulse`} />
          <div className="flex-1">
            <div className={`font-bold ${resumoStyle.text}`}>
              {data.resumo === 'ok'   && '✅ Sistema operando normalmente'}
              {data.resumo === 'warn' && '⚠️ Atenção — alguma métrica fora do ideal'}
              {data.resumo === 'crit' && '🚨 Crítico — uma ou mais métricas no limite'}
              {data.resumo === 'info' && 'ℹ️ Sistema monitorado'}
            </div>
            <div className="text-xs text-gray-600 mt-1">
              Status calculado pelo pior nível entre todas as métricas abaixo.
            </div>
          </div>
        </div>
      </div>

      {/* Legenda */}
      <div className="bg-white border rounded-lg p-3 mb-6 text-xs flex flex-wrap gap-4 items-center">
        <span className="text-gray-500 font-medium">Como ler:</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-green-500" /> OK = dentro do ideal</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-amber-500" /> ATENÇÃO = entre ideal e limite</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-red-500" /> CRÍTICO = ultrapassou o limite</span>
      </div>

      {/* Seções de métricas */}
      {SECOES.map(secao => (
        <div key={secao.titulo} className="mb-8">
          <h2 className="text-lg font-bold text-gray-900 mb-1">{secao.titulo}</h2>
          <p className="text-xs text-gray-500 mb-4">{secao.descricao}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {secao.chaves.map(k => data.metrics[k] && (
              <MetricaCard key={k} chave={k} m={data.metrics[k]} />
            ))}
          </div>
        </div>
      ))}

      {/* Top endpoints lentos — diagnóstico acionável */}
      {data.topEndpointsLentos && data.topEndpointsLentos.length > 0 && (
        <div className="mb-8">
          <h2 className="text-lg font-bold text-gray-900 mb-1">🐢 Endpoints mais lentos (5 min)</h2>
          <p className="text-xs text-gray-500 mb-3">
            Tempo médio por rota — se algum estiver em <span className="text-amber-700 font-medium">ATENÇÃO</span> ou{' '}
            <span className="text-red-700 font-medium">CRÍTICO</span>, é ele que está derrubando a média geral.
          </p>
          <div className="bg-white border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-600 text-xs uppercase">
                <tr>
                  <th className="text-left px-3 py-2">Endpoint</th>
                  <th className="text-right px-3 py-2">Chamadas</th>
                  <th className="text-right px-3 py-2">Médio</th>
                  <th className="text-right px-3 py-2">Máximo</th>
                  <th className="text-right px-3 py-2">Payload médio</th>
                  <th className="text-center px-3 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {data.topEndpointsLentos.map((e, i) => {
                  const style = STATUS_STYLE[e.severidade] || STATUS_STYLE.ok
                  return (
                    <tr key={i} className="border-t hover:bg-gray-50">
                      <td className="px-3 py-2 font-mono text-xs">{e.path}</td>
                      <td className="px-3 py-2 text-right text-xs text-gray-600">{e.count}</td>
                      <td className={`px-3 py-2 text-right text-xs font-bold ${style.text}`}>{e.avgMs} ms</td>
                      <td className="px-3 py-2 text-right text-xs text-gray-600">{e.maxMs} ms</td>
                      <td className="px-3 py-2 text-right text-xs text-gray-600">{(e.avgBytes / 1024).toFixed(1)} KB</td>
                      <td className="px-3 py-2 text-center">
                        <span className={`${style.pill} text-[10px] font-bold px-2 py-0.5 rounded-full`}>{style.label}</span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Recomendações automáticas baseadas no que vimos */}
          {(() => {
            const criticos = data.topEndpointsLentos.filter(e => e.severidade === 'crit')
            const atencao = data.topEndpointsLentos.filter(e => e.severidade === 'warn')
            const sugestoes = []
            criticos.forEach(e => {
              if (e.avgBytes > 200 * 1024) sugestoes.push(`📦 ${e.path}: payload de ${(e.avgBytes/1024).toFixed(0)} KB — candidato a paginação ou novo .select() de exclusão`)
              else if (e.avgMs > 3000) sugestoes.push(`🐌 ${e.path}: ${e.avgMs}ms médio com payload pequeno (${(e.avgBytes/1024).toFixed(0)} KB) — provavelmente falta índice ou agregação pesada`)
              else sugestoes.push(`🔴 ${e.path}: ${e.avgMs}ms — investigar handler no server.js`)
            })
            if (atencao.length > 0 && criticos.length === 0) {
              sugestoes.push(`⚠️ ${atencao.length} endpoint(s) acima do ideal — não urgente, mas vale otimizar`)
            }
            if (sugestoes.length === 0 && data.topEndpointsLentos.length > 0) {
              sugestoes.push('✅ Todos endpoints dentro do ideal — performance saudável')
            }
            return sugestoes.length > 0 ? (
              <div className="mt-3 bg-blue-50 border border-blue-200 rounded-lg p-3">
                <div className="text-xs font-bold text-blue-900 mb-2">💡 Diagnóstico automático</div>
                <ul className="text-xs text-blue-900 space-y-1">
                  {sugestoes.map((s, i) => <li key={i}>{s}</li>)}
                </ul>
              </div>
            ) : null
          })()}
        </div>
      )}

      {/* Últimos erros */}
      {data.ultimosErros && data.ultimosErros.length > 0 && (
        <div className="mb-8">
          <h2 className="text-lg font-bold text-gray-900 mb-3">🔴 Últimos erros 5xx (5 min)</h2>
          <div className="bg-white border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-600 text-xs uppercase">
                <tr>
                  <th className="text-left px-3 py-2">Quando</th>
                  <th className="text-left px-3 py-2">Endpoint</th>
                  <th className="text-left px-3 py-2">Status</th>
                  <th className="text-left px-3 py-2">Mensagem</th>
                </tr>
              </thead>
              <tbody>
                {data.ultimosErros.map((e, i) => (
                  <tr key={i} className="border-t">
                    <td className="px-3 py-2 text-gray-600 text-xs">{new Date(e.ts).toLocaleTimeString('pt-BR')}</td>
                    <td className="px-3 py-2 font-mono text-xs">{e.path}</td>
                    <td className="px-3 py-2"><span className="bg-red-100 text-red-700 px-2 py-0.5 rounded text-xs font-bold">{e.status}</span></td>
                    <td className="px-3 py-2 text-gray-600 text-xs">{e.msg}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Últimos payloads grandes */}
      {data.ultimosPayloadsGrandes && data.ultimosPayloadsGrandes.length > 0 && (
        <div className="mb-8">
          <h2 className="text-lg font-bold text-gray-900 mb-1">📦 Payloads acima de 500 KB</h2>
          <p className="text-xs text-gray-500 mb-3">Listagens que voltaram pesadas — candidatas a otimização</p>
          <div className="bg-white border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-600 text-xs uppercase">
                <tr>
                  <th className="text-left px-3 py-2">Quando</th>
                  <th className="text-left px-3 py-2">Endpoint</th>
                  <th className="text-right px-3 py-2">Tamanho</th>
                </tr>
              </thead>
              <tbody>
                {data.ultimosPayloadsGrandes.map((p, i) => (
                  <tr key={i} className="border-t">
                    <td className="px-3 py-2 text-gray-600 text-xs">{new Date(p.ts).toLocaleTimeString('pt-BR')}</td>
                    <td className="px-3 py-2 font-mono text-xs">{p.path}</td>
                    <td className="px-3 py-2 text-right font-medium text-amber-700">{(p.bytes / 1024).toFixed(0)} KB</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Nota de rodapé */}
      <div className="text-xs text-gray-400 text-center mt-8 pb-4">
        Dados deste container Vercel · Janela rolling de {data.janelaMin} min ·
        {' '}Healthcheck automático a cada 5 min com alerta WhatsApp quando crítico.
      </div>
    </div>
  )
}
