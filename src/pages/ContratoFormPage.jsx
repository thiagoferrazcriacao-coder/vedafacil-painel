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

export default function ContratoFormPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [c, setC] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const [zapsignLoading, setZapsignLoading] = useState(false)

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

  const handleZapSign = async () => {
    if (!confirm('Enviar contrato para assinatura via ZapSign?')) return
    setZapsignLoading(true)
    setError('')
    try {
      await handleSave()
      const email = (c.emailCliente || '').trim()
      if (!email) { alert('Preencha o E-mail do Signatario em Dados do Cliente'); setZapsignLoading(false); return }
      const res = await api.sendToZapSign(id, email, c.sindico || c.ac || c.cliente)
      setC(prev => ({ ...prev, zapsignDocId: res.docToken, zapsignSignUrl: res.signUrl }))
      if (res.signUrl) {
        alert(`Contrato enviado! Link de assinatura:\n${res.signUrl}`)
      } else {
        alert('Contrato enviado para ZapSign com sucesso!')
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setZapsignLoading(false)
    }
  }

  // Cronograma helpers
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

  // Parcelas helpers
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
          {c.status !== 'assinado' && (
            <button
              onClick={handleZapSign}
              disabled={zapsignLoading}
              className="btn-primary"
            >
              {zapsignLoading ? 'Enviando...' : c.zapsignDocId ? 'Reenviar ZapSign' : 'Enviar ZapSign'}
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>
      )}

      {/* ZapSign info */}
      {c.zapsignDocId && (
        <div className="mb-4 p-3 bg-purple-50 border border-purple-200 rounded-lg text-sm">
          <div className="font-medium text-purple-800 mb-1">Enviado para ZapSign</div>
          <div className="text-purple-600">Doc ID: {c.zapsignDocId}</div>
          {c.zapsignSignUrl && (
            <a href={c.zapsignSignUrl} target="_blank" rel="noreferrer"
              className="text-purple-800 underline hover:text-purple-900">
              Link de assinatura
            </a>
          )}
          {c.assinadoEm && (
            <div className="text-green-700 font-medium mt-1">
              Assinado em: {new Date(c.assinadoEm).toLocaleString('pt-BR')}
            </div>
          )}
        </div>
      )}

      {/* Section 1: Dados do Cliente */}
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
          <Field label="Cidade">
            <input className="input" value={c.cidade || ''} onChange={update('cidade')} />
          </Field>
          <Field label="CEP">
            <input className="input" value={c.cep || ''} onChange={update('cep')} />
          </Field>
        </div>
      </section>

      {/* Section 2: Informações do Contrato */}
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
            <input className="input" type="date" value={c.dataInicio || ''} onChange={update('dataInicio')} />
          </Field>
          <Field label="Data de Término">
            <input className="input" type="date" value={c.dataTermino || ''} onChange={update('dataTermino')} />
          </Field>
          <Field label="Foro">
            <input className="input" value={c.foro || 'Rio de Janeiro'} onChange={update('foro')} />
          </Field>
          <Field label="Prazo de Execução (dias úteis)">
            <input className="input" type="number" min="1" value={c.prazoExecucao || 3} onChange={e => updateNested('prazoExecucao', Number(e.target.value))} />
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

      {/* Section 3: Resumo Financeiro */}
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
            <div className="text-gray-500 text-xs mb-1">Total Líquido</div>
            <div className="font-bold text-green-700 text-lg">{fmt(c.totalLiquido)}</div>
          </div>
          <div className="bg-blue-50 rounded-lg p-3">
            <div className="text-gray-500 text-xs mb-1">ISS ({c.issPercent || 3}%)</div>
            <div className="font-bold text-blue-700">{fmt((c.totalLiquido || 0) * (Number(c.issPercent) || 3) / 100)}</div>
          </div>
        </div>
      </section>

      {/* Section 4: Itens do Serviço */}
      {Array.isArray(c.itens) && c.itens.length > 0 && (
        <section className="card mb-4">
          <h2 className="font-semibold text-primary mb-3 flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-primary text-white text-xs flex items-center justify-center">4</span>
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

      {/* Section 5: Cronograma */}
      <section className="card mb-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-primary flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-primary text-white text-xs flex items-center justify-center">5</span>
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

      {/* Section 6: Parcelas */}
      <section className="card mb-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-primary flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-primary text-white text-xs flex items-center justify-center">6</span>
            Parcelas do Contrato
          </h2>
          <button onClick={addParcela} className="btn-secondary text-sm py-1 px-3">
            + Parcela
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b-2 border-primary">
                <th className="text-center py-2 px-2 text-xs font-semibold text-gray-600 w-16">Nº</th>
                <th className="text-center py-2 px-2 text-xs font-semibold text-gray-600 w-40">Data</th>
                <th className="text-right py-2 px-2 text-xs font-semibold text-gray-600">Valor (R$)</th>
                <th className="w-10"></th>
              </tr>
            </thead>
            <tbody>
              {(c.parcelasContrato || []).length === 0 ? (
                <tr>
                  <td colSpan={4} className="text-center py-4 text-gray-400 text-sm">
                    Nenhuma parcela. Clique em "+ Parcela" para adicionar.
                  </td>
                </tr>
              ) : (
                <>
                  {(c.parcelasContrato || []).map((p, i) => (
                    <tr key={i} className="border-b border-gray-100">
                      <td className="text-center py-2 px-2 text-gray-500 font-medium">{p.numero || i + 1}</td>
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
                  <tr className="border-t-2 border-primary">
                    <td colSpan={2} className="py-2 px-2 text-right font-semibold">Total</td>
                    <td className="py-2 px-2 text-right font-bold text-primary text-base">
                      {fmt((c.parcelasContrato || []).reduce((s, p) => s + (Number(p.valor) || 0), 0))}
                    </td>
                    <td></td>
                  </tr>
                </>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Sticky Bottom */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-4 py-3 flex gap-3 justify-end z-10 md:left-56">
        <div className="flex-1 flex items-center gap-4">
          <span className="text-sm text-gray-500">Total:</span>
          <span className="text-xl font-bold text-primary">{fmt(c.totalLiquido)}</span>
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
        {c.status !== 'assinado' && (
          <button onClick={handleZapSign} disabled={zapsignLoading} className="btn-primary">
            {zapsignLoading ? 'Enviando...' : 'Enviar ZapSign'}
          </button>
        )}
      </div>
    </div>
  )
}