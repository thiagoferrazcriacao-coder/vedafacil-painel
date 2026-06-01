import React, { useEffect, useState, useCallback, useMemo } from 'react'
import { api } from '../api/client.js'

// ── helpers de data ──────────────────────────────────────────────────────────
function todayStr() {
  return new Date().toLocaleDateString('fr-CA', { timeZone: 'America/Sao_Paulo' }) // YYYY-MM-DD
}
function addDays(str, n) {
  const d = new Date(str + 'T12:00:00')
  d.setDate(d.getDate() + n)
  return d.toLocaleDateString('fr-CA', { timeZone: 'America/Sao_Paulo' })
}
function weekRange() {
  const today = new Date()
  const dow = today.getDay() // 0=dom
  const mon = new Date(today); mon.setDate(today.getDate() - (dow === 0 ? 6 : dow - 1))
  const sun = new Date(mon);  sun.setDate(mon.getDate() + 6)
  return {
    start: mon.toLocaleDateString('fr-CA', { timeZone: 'America/Sao_Paulo' }),
    end:   sun.toLocaleDateString('fr-CA', { timeZone: 'America/Sao_Paulo' }),
  }
}
function fmtDiaMes(dateStr) {
  if (!dateStr) return '—'
  const s = String(dateStr).split('T')[0]
  const [y, m, d] = s.split('-')
  return `${d}/${m}`
}
function fmtDataCompleta(dateStr) {
  if (!dateStr) return '—'
  const s = String(dateStr).split('T')[0]
  const [y, m, d] = s.split('-')
  return `${d}/${m}/${y}`
}
function fmtDatetime(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
    timeZone: 'America/Sao_Paulo',
  })
}

// ── LembreteBtn ──────────────────────────────────────────────────────────────
function LembreteBtn({ label, log, onSend, disabled, loading }) {
  if (log?.status === 'enviado') {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-green-700 bg-green-50 border border-green-200 rounded px-2 py-1">
        ✅ {label} enviado
      </span>
    )
  }
  if (log?.status === 'erro') {
    return (
      <button onClick={onSend} disabled={disabled || loading}
        className="inline-flex items-center gap-1 text-xs text-red-700 bg-red-50 border border-red-300 rounded px-2 py-1 hover:bg-red-100">
        ⚠️ {label} (reenviar)
      </button>
    )
  }
  return (
    <button onClick={onSend} disabled={disabled || loading}
      className="inline-flex items-center gap-1 text-xs text-gray-700 bg-white border border-gray-300 rounded px-2 py-1 hover:bg-gray-50 disabled:opacity-40">
      {loading ? '...' : `📤 ${label}`}
    </button>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────
export default function FollowUpPage() {
  const [eventos, setEventos] = useState([])
  const [conexoes, setConexoes] = useState([])
  const [usuarios, setUsuarios] = useState([])
  const [logs, setLogs] = useState([])
  const [evolutionStatus, setEvolutionStatus] = useState(null)
  const [qrData, setQrData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState({})
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [showConfig, setShowConfig] = useState(false)
  const [showLogs, setShowLogs] = useState(false)
  const [editConexao, setEditConexao] = useState(null)
  const [loadingQr, setLoadingQr] = useState(false)

  // ── filtros ────────────────────────────────────────────────────────────────
  const [filtroPeriodo, setFiltroPeriodo] = useState('semana') // hoje | amanha | semana | 7dias | tudo
  const [filtroTecnico, setFiltroTecnico] = useState('todos')  // todos | edson | fernando

  // ── load ──────────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [ev, cx, us, lg] = await Promise.all([
        api.getFollowupEventos().catch(() => []),
        api.getFollowupConexoes().catch(() => []),
        api.getFollowupUsuarios().catch(() => []),
        api.getFollowupLogs().catch(() => []),
      ])
      setEventos(Array.isArray(ev) ? ev : [])
      setConexoes(Array.isArray(cx) ? cx : [])
      setUsuarios(Array.isArray(us) ? us : [])
      setLogs(Array.isArray(lg) ? lg : [])
    } catch (err) {
      setError(err.message || 'Erro ao carregar dados')
    } finally {
      setLoading(false)
    }
  }, [])

  const loadEvolutionStatus = useCallback(async () => {
    try {
      const data = await api.getEvolutionStatus()
      setEvolutionStatus(data)
    } catch {
      setEvolutionStatus({ error: 'Nao configurada' })
    }
  }, [])

  useEffect(() => {
    load()
    loadEvolutionStatus()
  }, [load, loadEvolutionStatus])

  // ── filtros aplicados ──────────────────────────────────────────────────────
  const eventosFiltrados = useMemo(() => {
    const today = todayStr()
    const tomorrow = addDays(today, 1)
    const week = weekRange()
    const in7 = addDays(today, 7)

    return eventos.filter(ev => {
      const d = String(ev.inicio).split('T')[0]

      // período
      if (filtroPeriodo === 'hoje' && d !== today) return false
      if (filtroPeriodo === 'amanha' && d !== tomorrow) return false
      if (filtroPeriodo === 'semana' && (d < week.start || d > week.end)) return false
      if (filtroPeriodo === '7dias' && (d < today || d > in7)) return false

      // técnico
      if (filtroTecnico !== 'todos') {
        const nome = String(ev.tecnico || ev.nomeExibicao || '').toLowerCase()
        if (!nome.includes(filtroTecnico.toLowerCase())) return false
      }

      return true
    })
  }, [eventos, filtroPeriodo, filtroTecnico])

  // ── tecnicos disponíveis ──────────────────────────────────────────────────
  const tecnicosDisponiveis = useMemo(() => {
    const nomes = [...new Set(eventos.map(e => e.nomeExibicao || e.tecnico).filter(Boolean))]
    return nomes
  }, [eventos])

  // ── handlers ──────────────────────────────────────────────────────────────
  const handleSalvarConexao = async () => {
    if (!editConexao?.tecnico || !editConexao?.nomeExibicao) return
    setError('')
    try {
      await api.saveFollowupConexao(editConexao)
      setEditConexao(null)
      setSuccess('Conexao salva!')
      setTimeout(() => setSuccess(''), 3000)
      load()
    } catch (err) { setError(err.message) }
  }

  const handleDeletarConexao = async (tecnico) => {
    if (!confirm(`Remover agenda do tecnico "${tecnico}"?`)) return
    try {
      await api.deleteFollowupConexao(tecnico)
      load()
    } catch (err) { setError(err.message) }
  }

  const handleDisparar = async (evento, tipo) => {
    const key = `${evento.id}_${tipo}`
    setSending(s => ({ ...s, [key]: true }))
    setError('')
    try {
      await api.dispararFollowup({
        eventoId: evento.id, tipo,
        telefone: evento.telefone,
        titulo: evento.titulo,
        inicio: String(evento.inicio).split('T')[0],
        tecnico: evento.tecnico,
        nomeExibicao: evento.nomeExibicao,
      })
      setSuccess(`Lembrete enviado para ${evento.telefone}!`)
      setTimeout(() => setSuccess(''), 4000)
      load()
    } catch (err) {
      setError(err.message)
    } finally {
      setSending(s => ({ ...s, [key]: false }))
    }
  }

  const handleGetQr = async () => {
    setLoadingQr(true)
    setError('')
    try {
      const data = await api.getEvolutionQr()
      setQrData(data)
    } catch (err) { setError(err.message) }
    finally { setLoadingQr(false) }
  }

  const isConnected = evolutionStatus?.instance?.state === 'open' || evolutionStatus?.state === 'open'
  const techSlots = [
    { tecnico: 'edson',    nomeExibicao: 'Edson' },
    { tecnico: 'fernando', nomeExibicao: 'Fernando' },
  ]

  // ── render ─────────────────────────────────────────────────────────────────
  return (
    <div className="p-6 max-w-6xl mx-auto">

      {/* Header */}
      <div className="mb-6 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">📅 Follow-up Agendamento</h1>
          <p className="text-sm text-gray-500 mt-1">Lembretes automaticos via WhatsApp para clientes com visita agendada</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowConfig(v => !v)} className="btn-secondary text-sm">
            ⚙️ {showConfig ? 'Fechar' : 'Configurar'}
          </button>
          <button onClick={load} className="btn-secondary text-sm" disabled={loading}>
            🔄 Atualizar
          </button>
        </div>
      </div>

      {error && <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">{error}</div>}
      {success && <div className="mb-4 bg-green-50 border border-green-200 rounded-lg p-3 text-sm text-green-700">{success}</div>}

      {/* ── Configuração ── */}
      {showConfig && (
        <div className="mb-6 bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <h2 className="font-semibold text-gray-800 mb-4">⚙️ Configuracao</h2>

          {/* WhatsApp */}
          <div className="mb-5 p-4 bg-gray-50 rounded-lg border border-gray-200">
            <div className="flex items-center justify-between mb-2">
              <div>
                <p className="font-medium text-gray-700">📱 WhatsApp Vedafacil</p>
                <p className="text-xs text-gray-500">Numero que dispara os lembretes (final 2182)</p>
              </div>
              <div className="flex items-center gap-2">
                {isConnected ? (
                  <span className="flex items-center gap-1 text-sm text-green-700 bg-green-50 border border-green-200 rounded-full px-3 py-1">
                    <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse inline-block"/>
                    Conectado
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-sm text-red-700 bg-red-50 border border-red-200 rounded-full px-3 py-1">
                    <span className="w-2 h-2 rounded-full bg-red-400 inline-block"/>
                    Desconectado
                  </span>
                )}
                {!isConnected && (
                  <button onClick={handleGetQr} disabled={loadingQr} className="btn-primary text-sm">
                    {loadingQr ? 'Gerando...' : '📷 Ver QR Code'}
                  </button>
                )}
                <button onClick={loadEvolutionStatus} className="btn-secondary text-sm">↺</button>
              </div>
            </div>

            {qrData && !isConnected && (
              <div className="mt-3 p-3 bg-white rounded-lg border border-gray-200 text-center">
                {(qrData.base64 || qrData.qrcode?.base64) ? (
                  <>
                    <p className="text-sm text-gray-600 mb-2">
                      Abra o WhatsApp → <strong>Dispositivos vinculados</strong> → <strong>Vincular dispositivo</strong>
                    </p>
                    <img src={qrData.base64 || qrData.qrcode?.base64} alt="QR Code WhatsApp"
                      className="mx-auto max-w-xs border rounded"/>
                    <p className="text-xs text-gray-400 mt-2">O QR code expira em ~20 segundos. Se expirar, clique novamente em "Ver QR Code".</p>
                  </>
                ) : (
                  <pre className="text-xs text-gray-500 text-left overflow-auto max-h-40">{JSON.stringify(qrData, null, 2)}</pre>
                )}
              </div>
            )}
            {evolutionStatus?.error && !isConnected && (
              <div className="mt-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
                ⚠️ Configure as variaveis <code>EVOLUTION_API_URL</code>, <code>EVOLUTION_API_KEY</code> e <code>EVOLUTION_INSTANCE</code> no Vercel.
              </div>
            )}
          </div>

          {/* Agendas */}
          <div>
            <p className="font-medium text-gray-700 mb-3">🗓️ Agendas dos Tecnicos</p>
            <p className="text-xs text-gray-500 mb-3">
              O sistema le automaticamente as OS do Vedafacil + Google Calendar de cada tecnico.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {techSlots.map(slot => {
                const cx = conexoes.find(c => c.tecnico === slot.tecnico)
                const isEditing = editConexao?.tecnico === slot.tecnico
                return (
                  <div key={slot.tecnico} className="p-3 bg-white border border-gray-200 rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium text-gray-800">👤 {slot.nomeExibicao}</span>
                      {cx?.tokenOk
                        ? <span className="text-xs text-green-700 bg-green-50 border border-green-200 rounded-full px-2 py-0.5">✅ Agenda ativa</span>
                        : <span className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">⏳ Aguardando login</span>
                      }
                    </div>
                    {cx && !isEditing ? (
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-gray-700 font-mono">{cx.email || '(sem email)'}</p>
                          {cx.nomeUsuario && <p className="text-xs text-green-600">✓ {cx.nomeUsuario} ja fez login</p>}
                        </div>
                        <div className="flex gap-1">
                          <button onClick={() => setEditConexao({ tecnico: cx.tecnico, nomeExibicao: cx.nomeExibicao, email: cx.email || '' })}
                            className="text-xs text-blue-600 hover:underline">Editar</button>
                          <button onClick={() => handleDeletarConexao(cx.tecnico)}
                            className="text-xs text-red-500 hover:underline ml-2">Remover</button>
                        </div>
                      </div>
                    ) : isEditing ? (
                      <div className="space-y-2">
                        <input value={editConexao.nomeExibicao}
                          onChange={e => setEditConexao(v => ({ ...v, nomeExibicao: e.target.value }))}
                          placeholder="Nome de exibicao"
                          className="w-full border border-gray-300 rounded px-2 py-1 text-sm"/>
                        <input type="email" value={editConexao.email}
                          onChange={e => setEditConexao(v => ({ ...v, email: e.target.value }))}
                          placeholder="gmail@gmail.com"
                          className="w-full border border-gray-300 rounded px-2 py-1 text-sm"/>
                        <div className="flex gap-2">
                          <button onClick={handleSalvarConexao} className="btn-primary text-xs py-1 px-3">Salvar</button>
                          <button onClick={() => setEditConexao(null)} className="btn-secondary text-xs py-1 px-3">Cancelar</button>
                        </div>
                      </div>
                    ) : (
                      <button onClick={() => setEditConexao({ tecnico: slot.tecnico, nomeExibicao: slot.nomeExibicao, email: '' })}
                        className="w-full text-center text-sm text-blue-600 border border-dashed border-blue-300 rounded py-2 hover:bg-blue-50">
                        + Vincular agenda
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
            {usuarios.length > 0 && (
              <p className="text-xs text-gray-400 mt-2">Ja fizeram login: {usuarios.map(u => u.name).join(', ')}</p>
            )}
          </div>
        </div>
      )}

      {/* ── Eventos ── */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">

        {/* Cabeçalho + Filtros */}
        <div className="p-4 border-b border-gray-100">
          <div className="flex items-center justify-between flex-wrap gap-3 mb-3">
            <h2 className="font-semibold text-gray-800">📆 Agendamentos</h2>
            <span className="text-xs text-gray-400 bg-gray-100 rounded-full px-2 py-0.5">
              {eventosFiltrados.length} de {eventos.length} eventos
            </span>
          </div>

          {/* Filtros */}
          <div className="flex flex-wrap gap-2 items-center">
            {/* Período */}
            <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
              {[
                { key: 'hoje',   label: 'Hoje' },
                { key: 'amanha', label: 'Amanhã' },
                { key: 'semana', label: 'Esta semana' },
                { key: '7dias',  label: 'Próx. 7 dias' },
                { key: 'tudo',   label: 'Tudo' },
              ].map(op => (
                <button key={op.key}
                  onClick={() => setFiltroPeriodo(op.key)}
                  className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                    filtroPeriodo === op.key
                      ? 'bg-white shadow text-primary font-semibold'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}>
                  {op.label}
                </button>
              ))}
            </div>

            {/* Divisor */}
            <div className="w-px h-6 bg-gray-200"/>

            {/* Técnico */}
            <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
              <button onClick={() => setFiltroTecnico('todos')}
                className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                  filtroTecnico === 'todos'
                    ? 'bg-white shadow text-primary font-semibold'
                    : 'text-gray-500 hover:text-gray-700'
                }`}>
                Todos
              </button>
              {tecnicosDisponiveis.map(nome => (
                <button key={nome}
                  onClick={() => setFiltroTecnico(filtroTecnico === nome ? 'todos' : nome)}
                  className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                    filtroTecnico === nome
                      ? 'bg-white shadow text-primary font-semibold'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}>
                  👤 {nome}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Tabela */}
        {loading ? (
          <div className="flex items-center justify-center py-16 gap-3 text-gray-400">
            <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin"/>
            Carregando agendamentos...
          </div>
        ) : eventosFiltrados.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <p className="text-4xl mb-2">📅</p>
            <p className="text-sm">Nenhum evento no periodo selecionado</p>
            {eventos.length > 0 && (
              <button onClick={() => { setFiltroPeriodo('tudo'); setFiltroTecnico('todos') }}
                className="mt-2 text-xs text-blue-600 hover:underline">
                Ver todos os {eventos.length} eventos
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-left text-xs text-gray-500 uppercase tracking-wide">
                  <th className="px-4 py-3 font-medium">Data</th>
                  <th className="px-4 py-3 font-medium">Agendamento</th>
                  <th className="px-4 py-3 font-medium">Técnico</th>
                  <th className="px-4 py-3 font-medium">Telefone</th>
                  <th className="px-4 py-3 font-medium">Lembretes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {eventosFiltrados.map(ev => {
                  const today = todayStr()
                  const tomorrow = addDays(today, 1)
                  const d = String(ev.inicio).split('T')[0]
                  const isToday = d === today
                  const isTomorrow = d === tomorrow
                  const isPast = d < today
                  const semTel = !ev.telefone
                  return (
                    <tr key={ev.id} className={`hover:bg-gray-50 ${isPast ? 'opacity-50' : ''}`}>

                      {/* Data */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <p className="font-semibold text-gray-800 text-base">{fmtDiaMes(ev.inicio)}</p>
                        <p className="text-xs text-gray-500">{fmtDataCompleta(ev.inicio)}</p>
                        {isToday && <span className="text-xs font-bold text-orange-600">● HOJE</span>}
                        {isTomorrow && <span className="text-xs font-bold text-blue-600">● AMANHÃ</span>}
                        {isPast && <span className="text-xs text-gray-400">Passado</span>}
                        {/* badge fonte */}
                        <div className="mt-0.5">
                          {ev.fonte === 'google'
                            ? <span className="text-xs text-blue-500">🗓 Google</span>
                            : <span className="text-xs text-indigo-500">📋 OS #{ev.osNumero}</span>
                          }
                        </div>
                      </td>

                      {/* Evento */}
                      <td className="px-4 py-3 max-w-xs">
                        <p className="font-medium text-gray-800 truncate">{ev.titulo}</p>
                        {ev.local && <p className="text-xs text-gray-400 truncate">📍 {ev.local}</p>}
                      </td>

                      {/* Técnico */}
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-white bg-primary rounded-full px-2 py-0.5">
                          👤 {ev.nomeExibicao}
                        </span>
                      </td>

                      {/* Telefone */}
                      <td className="px-4 py-3">
                        {semTel ? (
                          <span className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">⚠️ Sem telefone</span>
                        ) : (
                          <span className="text-sm font-mono text-gray-700">{ev.telefone}</span>
                        )}
                      </td>

                      {/* Lembretes */}
                      <td className="px-4 py-3">
                        {isPast ? (
                          <span className="text-xs text-gray-400">—</span>
                        ) : semTel ? (
                          <span className="text-xs text-gray-400">Sem telefone</span>
                        ) : (
                          <div className="flex flex-col gap-1">
                            <LembreteBtn
                              label="Véspera"
                              log={ev.lembreteVespera || ev.lembrete24h}
                              disabled={!isConnected}
                              loading={!!sending[`${ev.id}_vespera`]}
                              onSend={() => handleDisparar(ev, 'vespera')}
                            />
                            <LembreteBtn
                              label="Dia da visita"
                              log={ev.lembreteDia || ev.lembrete1h}
                              disabled={!isConnected}
                              loading={!!sending[`${ev.id}_dia`]}
                              onSend={() => handleDisparar(ev, 'dia')}
                            />
                            {!isConnected && <span className="text-xs text-gray-400">WhatsApp desconectado</span>}
                          </div>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Logs ── */}
      <div className="mt-4">
        <button onClick={() => setShowLogs(v => !v)} className="text-sm text-gray-500 hover:text-gray-700 underline">
          {showLogs ? '▲ Ocultar' : '▼ Ver'} historico de envios ({logs.length})
        </button>
        {showLogs && logs.length > 0 && (
          <div className="mt-2 bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-gray-50 text-gray-500 uppercase text-left">
                  <th className="px-3 py-2">Data</th>
                  <th className="px-3 py-2">Evento</th>
                  <th className="px-3 py-2">Técnico</th>
                  <th className="px-3 py-2">Tipo</th>
                  <th className="px-3 py-2">Telefone</th>
                  <th className="px-3 py-2">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {logs.map(l => (
                  <tr key={l._id} className="hover:bg-gray-50">
                    <td className="px-3 py-2 text-gray-500">{fmtDatetime(l.createdAt)}</td>
                    <td className="px-3 py-2 text-gray-700 max-w-[160px] truncate">{l.titulo}</td>
                    <td className="px-3 py-2 text-gray-700">{l.tecnico}</td>
                    <td className="px-3 py-2">
                      <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${
                        l.tipo === 'vespera' || l.tipo === '24h' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'
                      }`}>
                        {l.tipo === 'vespera' ? 'Véspera' : l.tipo === 'dia' ? 'Dia' : l.tipo}
                      </span>
                    </td>
                    <td className="px-3 py-2 font-mono text-gray-600">{l.telefone}</td>
                    <td className="px-3 py-2">
                      {l.status === 'enviado'
                        ? <span className="text-green-700">✅ Enviado</span>
                        : <span className="text-red-600" title={l.erro}>❌ Erro</span>
                      }
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {showLogs && logs.length === 0 && <p className="mt-2 text-sm text-gray-400">Nenhum envio registrado.</p>}
      </div>
    </div>
  )
}
