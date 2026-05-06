import React, { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { api } from '../api/client.js'

const fmt = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0)

function Field({ label, children }) {
  return (
    <div>
      <label className="label">{label}</label>
      {children}
    </div>
  )
}

// Adiciona N dias a uma string 'YYYY-MM-DD'
function addDays(dateStr, days) {
  if (!dateStr) return ''
  const [y, m, d] = dateStr.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  dt.setDate(dt.getDate() + days)
  const yy = dt.getFullYear()
  const mm = String(dt.getMonth() + 1).padStart(2, '0')
  const dd = String(dt.getDate()).padStart(2, '0')
  return `${yy}-${mm}-${dd}`
}

// Adiciona N dias ÚTEIS (pula sábado=6, domingo=0) a uma string 'YYYY-MM-DD'
function addBusinessDays(dateStr, businessDays) {
  if (!dateStr || !businessDays) return ''
  const [y, m, d] = dateStr.split('-').map(Number)
  let dt = new Date(y, m - 1, d)
  let count = 0
  while (count < businessDays) {
    dt.setDate(dt.getDate() + 1)
    const dow = dt.getDay()
    if (dow !== 0 && dow !== 6) count++
  }
  const yy = dt.getFullYear()
  const mm = String(dt.getMonth() + 1).padStart(2, '0')
  const dd = String(dt.getDate()).padStart(2, '0')
  return `${yy}-${mm}-${dd}`
}

// Gera array de parcelas com datas de 30 em 30 dias
function generateParcelas(n, valor, firstDate) {
  return Array.from({ length: n }, (_, i) => ({
    numero: i + 1,
    data: addDays(firstDate || '', i * 30),
    valor: parseFloat((valor).toFixed(2)),
  }))
}

export default function ContratoFormPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [c, setC] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const [uploadingArquivo, setUploadingArquivo] = useState(false)

  useEffect(() => {
    api.getContrato(id)
      .then(data => setC(data))
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [id])

  const update = (field) => (e) => {
    setC(prev => ({ ...prev, [field]: e.target.value }))
    setSaved(false)
  }

  const updateNested = (field, value) => {
    setC(prev => ({ ...prev, [field]: value }))
    setSaved(false)
  }

  const handleSave = async () => {
    setSaving(true)
    setError('')
    try {
      const updated = await api.updateContrato(id, c)
      setC(updated)
      setSaved(true)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const handleUpdateStatus = async (newStatus) => {
    const labels = { rascunho: 'Rascunho', pendente_assinatura: 'Pend. Assinatura', assinado: 'Assinado' }
    if (!confirm(`Alterar status para "${labels[newStatus]}"?`)) return
    setError('')
    try {
      const updated = await api.updateContratoStatus(id, newStatus)
      setC(prev => ({ ...prev, status: updated.status || newStatus }))
      setSaved(false)
    } catch (err) {
      setError(err.message)
    }
  }

  const handleUploadArquivo = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    setUploadingArquivo(true)
    try {
      const reader = new FileReader()
      reader.onload = async (ev) => {
        const base64 = ev.target.result
        const updated = await api.updateContrato(c._id || c.id || id, {
          contratoArquivo: base64,
          contratoArquivoNome: file.name,
        })
        setC(updated)
        setUploadingArquivo(false)
      }
      reader.readAsDataURL(file)
    } catch (err) {
      alert('Erro ao enviar: ' + err.message)
      setUploadingArquivo(false)
    }
  }

  const handleRemoverArquivo = async () => {
    if (!confirm('Remover contrato assinado?')) return
    const updated = await api.updateContrato(c._id || c.id || id, { contratoArquivo: '', contratoArquivoNome: '' })
    setC(updated)
  }

  // ── Proposta selection ──────────────────────────────────────────────────────
  const handleSelectProposta = (proposta) => {
    const firstData = (c.parcelasContrato?.[0]?.data) || ''
    let parcelas
    if (proposta === 1) {
      // À vista: 1 parcela, valor = totalLiquido (com desconto)
      parcelas = generateParcelas(1, c.totalLiquido || 0, firstData)
    } else {
      // Parcelado: N parcelas, valor = totalBruto / N (sem desconto)
      const n = Math.max(1, Number(c.parcelas) || 1)
      const valorParcela = (c.totalBruto || 0) / n
      parcelas = generateParcelas(n, valorParcela, firstData)
    }
    setC(prev => ({ ...prev, propostaEscolhida: proposta, parcelasContrato: parcelas }))
    setSaved(false)
  }

  // ── Cronograma helpers ──────────────────────────────────────────────────────
  const addCronograma = () => {
    const cron = [...(c.cronograma || []), { local: '', dataInicio: '', dataFim: '' }]
    updateNested('cronograma', cron)
  }

  const removeCronograma = (i) => {
    const cron = (c.cronograma || []).filter((_, idx) => idx !== i)
    updateNested('cronograma', cron)
  }

  const updateCronograma = (i, field, value) => {
    const cron = [...(c.cronograma || [])]
    cron[i] = { ...cron[i], [field]: value }
    updateNested('cronograma', cron)
  }

  // ── Parcelas helpers ────────────────────────────────────────────────────────
  const addParcela = () => {
    const parcels = [...(c.parcelasContrato || []), { numero: (c.parcelasContrato || []).length + 1, data: '', valor: 0 }]
    updateNested('parcelasContrato', parcels)
  }

  const removeParcela = (i) => {
    const parcels = (c.parcelasContrato || []).filter((_, idx) => idx !== i).map((p, idx) => ({ ...p, numero: idx + 1 }))
    updateNested('parcelasContrato', parcels)
  }

  const updateParcela = (i, field, value) => {
    const parcels = [...(c.parcelasContrato || [])]
    parcels[i] = { ...parcels[i], [field]: field === 'valor' ? Number(value) : value }

    // Se editou a data da 1ª parcela, propaga +30 dias para as demais
    if (field === 'data' && i === 0 && parcels.length > 1) {
      for (let j = 1; j < parcels.length; j++) {
        parcels[j] = { ...parcels[j], data: addDays(value, j * 30) }
      }
    }

    updateNested('parcelasContrato', parcels)
  }

  // Financial calculations
  const descontoValor = c && (c.descontoTipo === 'percent'
    ? (c.totalBruto || 0) * (Number(c.desconto) || 0) / 100
    : (Number(c.desconto) || 0))

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
    </div>
  )

  if (!c) return <div className="p-6 text-red-500">{error || 'Contrato não encontrado'}</div>

  const statusLabel = c.status === 'assinado' ? 'Assinado'
    : c.status === 'aguardando_assinatura' ? 'Aguardando Assinatura'
    : 'Rascunho'
  const statusColor = c.status === 'assinado' ? 'bg-green-100 text-green-800'
    : c.status === 'aguardando_assinatura' ? 'bg-orange-100 text-orange-800'
    : 'bg-gray-100 text-gray-700'

  const totalParcelasContrato = (c.parcelasContrato || []).reduce((s, p) => s + (Number(p.valor) || 0), 0)

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto pb-24">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <button onClick={() => navigate('/contratos')} className="btn-secondary">
          Voltar
        </button>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-gray-800">
            Contrato {c.numero ? `#${String(c.numero).padStart(4, '0')}` : ''}
          </h1>
          <div className="flex items-center gap-2 mt-0.5">
            <span className={`badge ${statusColor}`}>{statusLabel}</span>
            {saved && <span className="text-green-600 text-xs">Salvo</span>}
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          {/* Status buttons */}
          {[
            { key: 'rascunho', label: '📝 Rascunho', active: 'bg-gray-600 text-white border-gray-600', inactive: 'border border-gray-300 text-gray-600 bg-white hover:bg-gray-50' },
            { key: 'pendente_assinatura', label: '⏳ Pend. Assinatura', active: 'bg-orange-600 text-white border-orange-600', inactive: 'border border-orange-300 text-orange-600 bg-white hover:bg-orange-50' },
            { key: 'assinado', label: '✅ Assinado', active: 'bg-green-600 text-white border-green-600', inactive: 'border border-green-300 text-green-600 bg-white hover:bg-green-50' },
          ].map(btn => (
            <button
              key={btn.key}
              onClick={() => handleUpdateStatus(btn.key)}
              className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${c.status === btn.key ? btn.active : btn.inactive}`}
            >
              {btn.label}
            </button>
          ))}
          <div className="w-px bg-gray-200 mx-1 self-stretch" />
          <button onClick={handleSave} disabled={saving} className="btn-secondary">
            {saving ? 'Salvando...' : 'Salvar'}
          </button>
          <button
            onClick={() => window.open(api.getContratoPdfUrl(id), '_blank')}
            className="btn-secondary"
          >
            Gerar PDF
          </button>
          <button
            onClick={() => window.open(api.getGarantiaPdfUrl(id), '_blank')}
            className="btn-secondary"
          >
            Cert. Garantia
          </button>
          <button
            onClick={() => window.open(api.getArtPdfUrl(id), '_blank')}
            className="btn-secondary"
          >
            ART
          </button>
          <button
            onClick={() => navigate(`/ordens-servico?contratoId=${id}&tipo=reparo`)}
            className="bg-amber-50 text-amber-700 border border-amber-300 rounded-lg px-4 py-2 text-sm font-medium hover:bg-amber-100 transition-colors"
          >
            🔧 Assistência Técnica
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>
      )}

      {/* ── Seção 1: Dados do Cliente ── */}
      <section className="card mb-4">
        <h2 className="font-semibold text-primary mb-4 flex items-center gap-2">
          <span className="w-6 h-6 rounded-full bg-primary text-white text-xs flex items-center justify-center">1</span>
          Dados do Cliente
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <Field label="Razão Social">
            <input className="input" value={c.razaoSocial || ''} onChange={update('razaoSocial')} />
          </Field>
          <Field label="Nome do Condomínio">
            <input className="input" value={c.cliente || ''} onChange={update('cliente')} />
          </Field>
          <Field label="Síndico / Responsável">
            <input className="input" value={c.sindico || ''} onChange={update('sindico')} placeholder={c.ac || ''} />
          </Field>
          <Field label="AC (Responsável)">
            <input className="input" value={c.ac || ''} onChange={update('ac')} />
          </Field>
          <Field label="Celular">
            <input className="input" value={c.celular || ''} onChange={update('celular')} />
          </Field>
          <Field label="E-mail do Signatário">
            <input className="input" type="email" value={c.emailCliente || ''} onChange={update('emailCliente')} placeholder="email@cliente.com.br" />
          </Field>
          <Field label="CNPJ do Cliente">
            <input className="input" value={c.cnpjCliente || ''} onChange={update('cnpjCliente')} placeholder="00.000.000/0001-00" />
          </Field>
          <Field label="CPF do Responsável">
            <input className="input" value={c.cpfResponsavel || ''} onChange={update('cpfResponsavel')} placeholder="000.000.000-00" />
          </Field>
          <Field label="RG do Responsável">
            <input className="input" value={c.rgResponsavel || ''} onChange={update('rgResponsavel')} />
          </Field>
          <Field label="Inscrição Estadual">
            <input className="input" value={c.ie || ''} onChange={update('ie')} />
          </Field>
          <div className="md:col-span-2">
            <Field label="Endereço">
              <input className="input" value={c.endereco || ''} onChange={update('endereco')} />
            </Field>
          </div>
          <Field label="Bairro">
            <input className="input" value={c.bairro || ''} onChange={update('bairro')} />
          </Field>
          <Field label="Cidade">
            <input className="input" value={c.cidade || ''} onChange={update('cidade')} />
          </Field>
          <Field label="CEP">
            <input className="input" value={c.cep || ''} onChange={update('cep')} />
          </Field>
        </div>
      </section>

      {/* ── Seção 2: Informações do Contrato ── */}
      <section className="card mb-4">
        <h2 className="font-semibold text-primary mb-4 flex items-center gap-2">
          <span className="w-6 h-6 rounded-full bg-primary text-white text-xs flex items-center justify-center">2</span>
          Informações do Contrato
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Field label="Data de Assinatura">
            <input className="input" type="date" value={c.dataAssinatura || ''} onChange={update('dataAssinatura')} />
          </Field>
          <Field label="Data de Início">
            <input className="input" type="date" value={c.dataInicio || ''} onChange={e => {
              const inicio = e.target.value
              const prazo = Number(c.prazoExecucao) || 0
              const termino = prazo > 0 ? addBusinessDays(inicio, prazo) : (c.dataTermino || '')
              setC(prev => ({ ...prev, dataInicio: inicio, dataTermino: termino }))
              setSaved(false)
            }} />
          </Field>
          <Field label="Prazo de Execução (dias úteis)">
            <input className="input" type="number" min="1" value={c.prazoExecucao || 3} onChange={e => {
              const prazo = Number(e.target.value)
              const termino = prazo > 0 && c.dataInicio ? addBusinessDays(c.dataInicio, prazo) : (c.dataTermino || '')
              setC(prev => ({ ...prev, prazoExecucao: prazo, dataTermino: termino }))
              setSaved(false)
            }} />
          </Field>
          <Field label="Data de Término (calculada automaticamente)">
            <input className="input" type="date" value={c.dataTermino || ''} onChange={update('dataTermino')} />
          </Field>
          <Field label="Foro">
            <input className="input" value={c.foro || 'Rio de Janeiro'} onChange={update('foro')} />
          </Field>
        </div>
        <div className="mt-3">
          <label className="label">Garantia (aparece no PDF)</label>
          <div className="flex gap-4 mt-1">
            {[5, 7, 10, 15].map(anos => (
              <label key={anos} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="garantia"
                  value={anos}
                  checked={Number(c.garantia || 15) === anos}
                  onChange={() => updateNested('garantia', anos)}
                  className="accent-primary"
                />
                <span className="text-sm font-medium">{anos} anos</span>
              </label>
            ))}
          </div>
        </div>
      </section>

      {/* ── Seção 3: Resumo Financeiro ── */}
      <section className="card mb-4">
        <h2 className="font-semibold text-primary mb-4 flex items-center gap-2">
          <span className="w-6 h-6 rounded-full bg-primary text-white text-xs flex items-center justify-center">3</span>
          Resumo Financeiro
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
          <Field label="Total Bruto (R$)">
            <input className="input" type="number" min="0" step="0.01"
              value={c.totalBruto || 0}
              onChange={e => {
                const totalBruto = Number(e.target.value)
                const descVal = c.descontoTipo === 'percent' ? totalBruto * (Number(c.desconto) || 0) / 100 : Number(c.desconto || 0)
                updateNested('totalBruto', totalBruto)
                updateNested('totalLiquido', Math.max(0, totalBruto - descVal))
              }}
            />
          </Field>
          <div>
            <label className="label">Tipo de Desconto</label>
            <select
              className="input"
              value={c.descontoTipo || 'percent'}
              onChange={e => {
                const tipo = e.target.value
                const descVal = tipo === 'percent' ? (c.totalBruto || 0) * (Number(c.desconto) || 0) / 100 : Number(c.desconto || 0)
                updateNested('descontoTipo', tipo)
                updateNested('totalLiquido', Math.max(0, (c.totalBruto || 0) - descVal))
              }}
            >
              <option value="percent">Percentual (%)</option>
              <option value="value">Valor (R$)</option>
            </select>
          </div>
          <Field label={`Desconto (${c.descontoTipo === 'percent' ? '%' : 'R$'})`}>
            <input className="input" type="number" min="0" step="0.01"
              value={c.desconto || 0}
              onChange={e => {
                const desc = Number(e.target.value)
                const descVal = c.descontoTipo === 'percent' ? (c.totalBruto || 0) * desc / 100 : desc
                updateNested('desconto', desc)
                updateNested('totalLiquido', Math.max(0, (c.totalBruto || 0) - descVal))
              }}
            />
          </Field>
          <Field label="Nº de Parcelas (Proposta 2)">
            <input className="input" type="number" min="1" max="24" step="1"
              value={c.parcelas || 1}
              onChange={e => updateNested('parcelas', Number(e.target.value))}
            />
          </Field>
          <Field label="ISS (%)">
            <input className="input" type="number" min="0" step="0.1"
              value={c.issPercent || 3}
              onChange={update('issPercent')}
            />
          </Field>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <div className="bg-gray-50 rounded-lg p-3">
            <div className="text-gray-500 text-xs mb-1">Total Bruto</div>
            <div className="font-bold text-gray-800 text-lg">{fmt(c.totalBruto)}</div>
          </div>
          <div className="bg-red-50 rounded-lg p-3">
            <div className="text-gray-500 text-xs mb-1">Desconto ({c.descontoTipo === 'percent' ? `${c.desconto}%` : 'R$'})</div>
            <div className="font-bold text-red-600">{fmt(descontoValor)}</div>
          </div>
          <div className="bg-green-50 rounded-lg p-3">
            <div className="text-gray-500 text-xs mb-1">Total Líquido (à vista)</div>
            <div className="font-bold text-green-700 text-lg">{fmt(c.totalLiquido)}</div>
          </div>
          <div className="bg-blue-50 rounded-lg p-3">
            <div className="text-gray-500 text-xs mb-1">ISS ({c.issPercent || 3}%)</div>
            <div className="font-bold text-blue-700">{fmt((c.totalLiquido || 0) * (Number(c.issPercent) || 3) / 100)}</div>
          </div>
        </div>
      </section>

      {/* ── Seção 4: Proposta Aceita pelo Cliente ── */}
      <section className="card mb-4">
        <h2 className="font-semibold text-primary mb-4 flex items-center gap-2">
          <span className="w-6 h-6 rounded-full bg-primary text-white text-xs flex items-center justify-center">4</span>
          Proposta Aceita pelo Cliente
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          {/* Proposta 1 — À Vista */}
          <label
            className={`cursor-pointer border-2 rounded-xl p-4 flex items-start gap-3 transition-all ${
              c.propostaEscolhida === 1
                ? 'border-primary bg-blue-50 shadow-md'
                : 'border-gray-200 hover:border-primary/40'
            }`}
          >
            <input
              type="radio"
              name="proposta"
              checked={c.propostaEscolhida === 1}
              onChange={() => handleSelectProposta(1)}
              className="mt-1 accent-primary"
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="font-bold text-gray-800">Proposta 1</span>
                <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">À Vista</span>
              </div>
              <div className="text-2xl font-bold text-primary">{fmt(c.totalLiquido)}</div>
              {(Number(c.desconto) > 0) && (
                <div className="text-xs text-green-600 mt-1">
                  ✓ Desconto de {c.descontoTipo === 'percent' ? `${c.desconto}%` : fmt(Number(c.desconto))} aplicado
                </div>
              )}
              <div className="text-xs text-gray-500 mt-2 italic">
                {c.condicaoPgto1Obs || '*Pgto a vista, na assinatura do contrato.'}
              </div>
            </div>
          </label>

          {/* Proposta 2 — Parcelado */}
          <label
            className={`cursor-pointer border-2 rounded-xl p-4 flex items-start gap-3 transition-all ${
              c.propostaEscolhida === 2
                ? 'border-primary bg-blue-50 shadow-md'
                : 'border-gray-200 hover:border-primary/40'
            }`}
          >
            <input
              type="radio"
              name="proposta"
              checked={c.propostaEscolhida === 2}
              onChange={() => handleSelectProposta(2)}
              className="mt-1 accent-primary"
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="font-bold text-gray-800">Proposta 2</span>
                <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full font-medium">Parcelado</span>
              </div>
              <div className="text-2xl font-bold text-gray-700">{fmt(c.totalBruto)}</div>
              <div className="text-sm text-gray-600 mt-1 font-medium">
                {Math.max(1, Number(c.parcelas) || 1)}x de {fmt((c.totalBruto || 0) / Math.max(1, Number(c.parcelas) || 1))}
              </div>
              <div className="text-xs text-gray-500 mt-2 italic">
                {c.condicaoPgto2Obs1 || '* 1ª parcela de entrada na assinatura do contrato.'}
              </div>
            </div>
          </label>
        </div>

        {c.propostaEscolhida ? (
          <div className="flex items-center gap-2 text-sm text-blue-700 bg-blue-50 rounded-lg px-3 py-2">
            <span>✅</span>
            <span>
              <strong>Proposta {c.propostaEscolhida}</strong> selecionada.
              As parcelas abaixo foram preenchidas automaticamente.
              Editando a <strong>data da 1ª parcela</strong>, as demais são ajustadas (+30 dias cada). Todos os campos são editáveis.
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-sm text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
            <span>⚠️</span>
            <span>Selecione a proposta aceita pelo cliente para preencher as parcelas automaticamente.</span>
          </div>
        )}
      </section>

      {/* ── Seção 5: Itens do Serviço ── */}
      {Array.isArray(c.itens) && c.itens.length > 0 && (
        <section className="card mb-4">
          <h2 className="font-semibold text-primary mb-3 flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-primary text-white text-xs flex items-center justify-center">5</span>
            Itens do Serviço
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b-2 border-primary">
                  <th className="text-left py-2 pr-3 text-xs font-semibold text-gray-600">Descrição</th>
                  <th className="text-center py-2 px-2 text-xs font-semibold text-gray-600">Qtd</th>
                  <th className="text-center py-2 px-2 text-xs font-semibold text-gray-600">Un</th>
                  <th className="text-right py-2 px-2 text-xs font-semibold text-gray-600">Vlr Unit</th>
                  <th className="text-right py-2 pl-2 text-xs font-semibold text-gray-600">Subtotal</th>
                </tr>
              </thead>
              <tbody>
                {c.itens.filter(i => i.quantidade > 0).map((item, i) => (
                  <tr key={i} className="border-b border-gray-100">
                    <td className="py-2 pr-3">{item.descricao}</td>
                    <td className="py-2 px-2 text-center">{item.quantidade}</td>
                    <td className="py-2 px-2 text-center text-gray-500">{item.unidade}</td>
                    <td className="py-2 px-2 text-right">{fmt(item.valorUnit)}</td>
                    <td className="py-2 pl-2 text-right font-medium">{fmt(item.subtotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ── Seção 6: Cronograma ── */}
      <section className="card mb-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-primary flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-primary text-white text-xs flex items-center justify-center">6</span>
            Cronograma de Obras
          </h2>
          <button onClick={addCronograma} className="btn-secondary text-sm py-1 px-3">
            + Local
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b-2 border-primary">
                <th className="text-center py-2 px-2 text-xs font-semibold text-gray-600 w-10">Nº</th>
                <th className="text-left py-2 pr-3 text-xs font-semibold text-gray-600">Local</th>
                <th className="text-center py-2 px-2 text-xs font-semibold text-gray-600 w-36">Data Início</th>
                <th className="text-center py-2 px-2 text-xs font-semibold text-gray-600 w-36">Data Fim</th>
                <th className="w-10"></th>
              </tr>
            </thead>
            <tbody>
              {(c.cronograma || []).length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center py-4 text-gray-400 text-sm">
                    Nenhum local adicionado. Clique em "+ Local" para adicionar.
                  </td>
                </tr>
              ) : (c.cronograma || []).map((cr, i) => (
                <tr key={i} className="border-b border-gray-100">
                  <td className="text-center py-2 px-2 text-gray-500">{i + 1}</td>
                  <td className="py-2 pr-3">
                    <input className="input py-1" value={cr.local || ''}
                      onChange={e => updateCronograma(i, 'local', e.target.value)}
                      placeholder="Nome do local" />
                  </td>
                  <td className="py-2 px-2">
                    <input className="input py-1" type="date" value={cr.dataInicio || ''}
                      onChange={e => updateCronograma(i, 'dataInicio', e.target.value)} />
                  </td>
                  <td className="py-2 px-2">
                    <input className="input py-1" type="date" value={cr.dataFim || ''}
                      onChange={e => updateCronograma(i, 'dataFim', e.target.value)} />
                  </td>
                  <td className="py-2 px-2">
                    <button onClick={() => removeCronograma(i)} className="text-red-400 hover:text-red-600 text-lg leading-none">&times;</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Seção 7: Parcelas ── */}
      <section className="card mb-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-primary flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-primary text-white text-xs flex items-center justify-center">7</span>
            Parcelas do Contrato
          </h2>
          <button onClick={addParcela} className="btn-secondary text-sm py-1 px-3">
            + Parcela
          </button>
        </div>

        {/* Dica de auto-propagação */}
        {(c.parcelasContrato || []).length > 1 && (
          <div className="mb-3 text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2">
            💡 Editando a <strong>data da 1ª parcela</strong>, as datas das demais são recalculadas automaticamente (+30 dias cada).
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b-2 border-primary">
                <th className="text-center py-2 px-2 text-xs font-semibold text-gray-600 w-16">Nº</th>
                <th className="text-center py-2 px-2 text-xs font-semibold text-gray-600 w-44">Data de Vencimento</th>
                <th className="text-right py-2 px-2 text-xs font-semibold text-gray-600">Valor (R$)</th>
                <th className="w-10"></th>
              </tr>
            </thead>
            <tbody>
              {(c.parcelasContrato || []).length === 0 ? (
                <tr>
                  <td colSpan={4} className="text-center py-4 text-gray-400 text-sm">
                    Selecione uma proposta acima ou clique em "+ Parcela" para adicionar manualmente.
                  </td>
                </tr>
              ) : (
                <>
                  {(c.parcelasContrato || []).map((p, i) => (
                    <tr key={i} className={`border-b border-gray-100 ${i === 0 ? 'bg-blue-50/40' : ''}`}>
                      <td className="text-center py-2 px-2 text-gray-500 font-medium">
                        {p.numero || i + 1}
                        {i === 0 && <span className="ml-1 text-xs text-blue-400">★</span>}
                      </td>
                      <td className="py-2 px-2">
                        <input className="input py-1 w-full" type="date" value={p.data || ''}
                          onChange={e => updateParcela(i, 'data', e.target.value)} />
                      </td>
                      <td className="py-2 px-2">
                        <input className="input py-1 text-right w-full" type="number" min="0" step="0.01"
                          value={p.valor || 0}
                          onChange={e => updateParcela(i, 'valor', e.target.value)} />
                      </td>
                      <td className="py-2 px-2">
                        <button onClick={() => removeParcela(i)} className="text-red-400 hover:text-red-600 text-lg leading-none">&times;</button>
                      </td>
                    </tr>
                  ))}
                  <tr className="border-t-2 border-primary bg-gray-50">
                    <td colSpan={2} className="py-2 px-2 text-right font-semibold text-sm">Total das Parcelas</td>
                    <td className={`py-2 px-2 text-right font-bold text-base ${
                      Math.abs(totalParcelasContrato - (c.propostaEscolhida === 1 ? c.totalLiquido : c.totalBruto)) > 1
                        ? 'text-red-600' : 'text-primary'
                    }`}>
                      {fmt(totalParcelasContrato)}
                    </td>
                    <td></td>
                  </tr>
                  {/* Alerta se total das parcelas diverge do valor da proposta */}
                  {c.propostaEscolhida && Math.abs(totalParcelasContrato - (c.propostaEscolhida === 1 ? c.totalLiquido : c.totalBruto)) > 1 && (
                    <tr>
                      <td colSpan={4} className="py-2 px-2">
                        <div className="text-xs text-red-600 bg-red-50 rounded px-2 py-1">
                          ⚠️ Total das parcelas ({fmt(totalParcelasContrato)}) difere do valor da Proposta {c.propostaEscolhida} ({fmt(c.propostaEscolhida === 1 ? c.totalLiquido : c.totalBruto)}).
                          Verifique os valores.
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Upload contrato assinado ── */}
      <div className="card mt-4 mb-4">
        <h3 className="font-semibold text-gray-700 mb-3">📎 Contrato Assinado</h3>
        {c.contratoArquivo ? (
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-600">📄 {c.contratoArquivoNome || 'contrato-assinado'}</span>
            <a href={c.contratoArquivo} download={c.contratoArquivoNome || 'contrato.pdf'}
               className="text-xs text-primary hover:underline">Baixar</a>
            <button onClick={() => handleRemoverArquivo()} className="text-xs text-red-500 hover:underline">Remover</button>
          </div>
        ) : (
          <div>
            <label className="cursor-pointer">
              <span className="btn-secondary text-sm">📎 Selecionar arquivo (PDF ou imagem)</span>
              <input type="file" accept=".pdf,image/*" className="hidden" onChange={handleUploadArquivo} />
            </label>
            <p className="text-xs text-gray-400 mt-1">PDF ou imagem do contrato físico assinado</p>
          </div>
        )}
        {uploadingArquivo && <p className="text-xs text-gray-500 mt-1">Enviando...</p>}
      </div>

      {/* Sticky Bottom */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-4 py-3 flex gap-3 justify-end z-10 md:left-56">
        <div className="flex-1 flex items-center gap-4">
          <span className="text-sm text-gray-500">
            {c.propostaEscolhida ? `Proposta ${c.propostaEscolhida} —` : 'Total:'}
          </span>
          <span className="text-xl font-bold text-primary">
            {fmt(c.propostaEscolhida === 2 ? c.totalBruto : c.totalLiquido)}
          </span>
        </div>
        <button onClick={handleSave} disabled={saving} className="btn-secondary">
          {saving ? 'Salvando...' : 'Salvar'}
        </button>
        <button onClick={() => window.open(api.getContratoPdfUrl(id), '_blank')} className="btn-secondary">
          Gerar PDF
        </button>
        <button onClick={() => window.open(api.getGarantiaPdfUrl(id), '_blank')} className="btn-secondary">
          Cert. Garantia
        </button>
        <button onClick={() => window.open(api.getArtPdfUrl(id), '_blank')} className="btn-secondary">
          ART
        </button>
      </div>
    </div>
  )
}
