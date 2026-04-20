import React, { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { api } from '../api/client.js'

const fmt = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0)

const DEFAULT_ITENS = [
  { tipo: 'trinca', descricao: 'Trincas', quantidade: 0, unidade: 'm', valorUnit: 950, subtotal: 0 },
  { tipo: 'juntaFria', descricao: 'Juntas Frias', quantidade: 0, unidade: 'm', valorUnit: 950, subtotal: 0 },
  { tipo: 'ralo', descricao: 'Ralos', quantidade: 0, unidade: 'unid', valorUnit: 750, subtotal: 0 },
  { tipo: 'juntaDilat', descricao: 'Juntas de Dilatação', quantidade: 0, unidade: 'm', valorUnit: 950, subtotal: 0 },
  { tipo: 'ferragem', descricao: 'Tratamento de Ferragens', quantidade: 0, unidade: 'm', valorUnit: 120, subtotal: 0 },
  { tipo: 'cortina', descricao: 'Cortinas', quantidade: 0, unidade: 'm²', valorUnit: 1020, subtotal: 0 },
  { tipo: 'art', descricao: 'ART Engº', quantidade: 1, unidade: 'unid', valorUnit: 300, subtotal: 300 },
  { tipo: 'mobilizacao', descricao: 'Mobilização', quantidade: 1, unidade: 'unid', valorUnit: 300, subtotal: 300 }
]

function recalculate(orc) {
  const itens = (orc.itens || []).map(item => ({
    ...item,
    subtotal: Number(item.quantidade || 0) * Number(item.valorUnit || 0)
  }))
  const totalBruto = itens.reduce((s, i) => s + i.subtotal, 0)
  const descontoValor = orc.descontoTipo === 'percent'
    ? totalBruto * (Number(orc.desconto) || 0) / 100
    : (Number(orc.desconto) || 0)
  const totalLiquido = Math.max(0, totalBruto - descontoValor)
  const entradaValor = totalLiquido * (Number(orc.entrada) || 0) / 100
  const saldo = Math.max(0, totalLiquido - entradaValor)
  const parcelas = Math.max(1, Number(orc.parcelas) || 1)
  const valorParcela = saldo / parcelas

  return { ...orc, itens, totalBruto, totalLiquido, saldo, valorParcela }
}

function Field({ label, children }) {
  return (
    <div>
      <label className="label">{label}</label>
      {children}
    </div>
  )
}

export default function OrcamentoFormPage() {
  const { id, medicaoId } = useParams()
  const navigate = useNavigate()
  const isNew = !id || id === 'novo'

  const [orc, setOrc] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  // Load existing or create new
  useEffect(() => {
    async function load() {
      try {
        if (!isNew) {
          const data = await api.getOrcamento(id)
          setOrc(recalculate(data))
        } else {
          // Create new from measurement
          const data = await api.createOrcamento({ medicaoId: medicaoId || null })
          setOrc(recalculate(data))
          // Redirect to the edit URL so saves work
          navigate(`/orcamentos/${data.id}`, { replace: true })
        }
      } catch (err) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const update = useCallback((updates) => {
    setOrc(prev => recalculate({ ...prev, ...updates }))
    setSaved(false)
  }, [])

  const updateField = (field) => (e) => update({ [field]: e.target.value })

  const updateItem = (i, field, value) => {
    const newItens = [...orc.itens]
    newItens[i] = { ...newItens[i], [field]: field === 'descricao' ? value : Number(value) }
    update({ itens: newItens })
  }

  const handleSave = async () => {
    setSaving(true)
    setError('')
    try {
      await api.updateOrcamento(orc.id, orc)
      setSaved(true)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const handleGeneratePdf = () => {
    handleSave().then(() => {
      window.open(api.getOrcamentoPdfUrl(orc.id), '_blank')
    })
  }

  const handleApprove = async () => {
    if (!confirm('Aprovar este orçamento e gerar contrato?')) return
    setSaving(true)
    try {
      await api.updateOrcamento(orc.id, orc)
      await api.approveOrcamento(orc.id)
      const contrato = await api.createContrato({ orcamentoId: orc.id })
      navigate(`/contratos/${contrato.id}`)
    } catch (err) {
      setError(err.message)
      setSaving(false)
    }
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
    </div>
  )

  if (!orc) return <div className="p-6 text-red-500">{error || 'Orçamento não encontrado'}</div>

  const descontoValor = orc.descontoTipo === 'percent'
    ? orc.totalBruto * (Number(orc.desconto) || 0) / 100
    : (Number(orc.desconto) || 0)

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto pb-24">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <button onClick={() => navigate('/orcamentos')} className="btn-secondary">
          Voltar
        </button>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-gray-800">
            Orçamento {orc.numero ? `#${String(orc.numero).padStart(4, '0')}` : ''}
          </h1>
          <div className="flex items-center gap-2 mt-0.5">
            <span className={`badge ${
              orc.status === 'aprovado' ? 'bg-green-100 text-green-800' :
              orc.status === 'enviado' ? 'bg-blue-100 text-blue-800' :
              'bg-gray-100 text-gray-700'
            }`}>
              {orc.status === 'aprovado' ? 'Aprovado' : orc.status === 'enviado' ? 'Enviado' : 'Rascunho'}
            </span>
            {saved && <span className="text-green-600 text-xs">Salvo</span>}
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex gap-2 flex-wrap">
          <button onClick={handleSave} disabled={saving} className="btn-secondary">
            {saving ? 'Salvando...' : 'Salvar Rascunho'}
          </button>
          <button onClick={handleGeneratePdf} disabled={saving} className="btn-secondary">
            Gerar PDF
          </button>
          {orc.status !== 'aprovado' && (
            <button onClick={handleApprove} disabled={saving} className="btn-success">
              Aprovar → Contrato
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>
      )}

      {/* ─── Section 1: Header ─── */}
      <section className="card mb-4">
        <h2 className="font-semibold text-primary mb-4 flex items-center gap-2">
          <span className="w-6 h-6 rounded-full bg-primary text-white text-xs flex items-center justify-center">1</span>
          Dados do Orçamento
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Field label="Data do Orçamento">
            <input className="input" type="text" value={orc.dataOrcamento || ''} onChange={updateField('dataOrcamento')} placeholder="dd/mm/aaaa" />
          </Field>
          <Field label="Validade">
            <input className="input" type="text" value={orc.validade || ''} onChange={updateField('validade')} placeholder="Ex: 30 dias" />
          </Field>
          <Field label="Origem">
            <input className="input" value={orc.origem || ''} onChange={updateField('origem')} />
          </Field>
          <Field label="Sigla">
            <input className="input" value={orc.sigla || ''} onChange={updateField('sigla')} />
          </Field>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-3">
          <Field label="Avaliado Por">
            <input className="input" value={orc.avaliadoPor || ''} onChange={updateField('avaliadoPor')} />
          </Field>
          <Field label="Acompanhado Por">
            <input className="input" value={orc.acompanhadoPor || ''} onChange={updateField('acompanhadoPor')} />
          </Field>
          <Field label="Técnico Responsável">
            <input className="input" value={orc.tecnicoResponsavel || ''} onChange={updateField('tecnicoResponsavel')} />
          </Field>
          <Field label="Elaborado Por">
            <input className="input" value={orc.elaboradoPor || ''} onChange={updateField('elaboradoPor')} />
          </Field>
        </div>
      </section>

      {/* ─── Section 2: Client ─── */}
      <section className="card mb-4">
        <h2 className="font-semibold text-primary mb-4 flex items-center gap-2">
          <span className="w-6 h-6 rounded-full bg-primary text-white text-xs flex items-center justify-center">2</span>
          Dados do Cliente
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <Field label="Nome do Cliente">
            <input className="input" value={orc.cliente || ''} onChange={updateField('cliente')} />
          </Field>
          <Field label="AC (Responsável)">
            <input className="input" value={orc.ac || ''} onChange={updateField('ac')} />
          </Field>
          <Field label="Celular">
            <input className="input" value={orc.celular || ''} onChange={updateField('celular')} placeholder="(00) 00000-0000" />
          </Field>
          <Field label="Endereço">
            <input className="input" value={orc.endereco || ''} onChange={updateField('endereco')} />
          </Field>
          <Field label="Cidade">
            <input className="input" value={orc.cidade || ''} onChange={updateField('cidade')} />
          </Field>
          <Field label="CEP">
            <input className="input" value={orc.cep || ''} onChange={updateField('cep')} placeholder="00000-000" />
          </Field>
        </div>
      </section>

      {/* ─── Section 3: Items Table ─── */}
      <section className="card mb-4">
        <h2 className="font-semibold text-primary mb-4 flex items-center gap-2">
          <span className="w-6 h-6 rounded-full bg-primary text-white text-xs flex items-center justify-center">3</span>
          Itens do Orçamento
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b-2 border-primary">
                <th className="text-left py-2 pr-3 text-xs font-semibold text-gray-600">Descrição</th>
                <th className="text-center py-2 px-2 text-xs font-semibold text-gray-600 w-24">Qtd</th>
                <th className="text-center py-2 px-2 text-xs font-semibold text-gray-600 w-16">Un</th>
                <th className="text-right py-2 px-2 text-xs font-semibold text-gray-600 w-32">Vlr Unit (R$)</th>
                <th className="text-right py-2 pl-2 text-xs font-semibold text-gray-600 w-32">Subtotal</th>
              </tr>
            </thead>
            <tbody>
              {(orc.itens || []).map((item, i) => (
                <tr key={item.tipo} className={`border-b border-gray-100 ${item.quantidade > 0 ? 'bg-blue-50/30' : ''}`}>
                  <td className="py-2 pr-3">
                    <input
                      className="input py-1"
                      value={item.descricao}
                      onChange={e => updateItem(i, 'descricao', e.target.value)}
                    />
                  </td>
                  <td className="py-2 px-2">
                    <input
                      className="input py-1 text-center"
                      type="number"
                      min="0"
                      step="0.01"
                      value={item.quantidade}
                      onChange={e => updateItem(i, 'quantidade', e.target.value)}
                    />
                  </td>
                  <td className="py-2 px-2 text-center text-gray-500 text-xs">{item.unidade}</td>
                  <td className="py-2 px-2">
                    <input
                      className="input py-1 text-right"
                      type="number"
                      min="0"
                      step="0.01"
                      value={item.valorUnit}
                      onChange={e => updateItem(i, 'valorUnit', e.target.value)}
                    />
                  </td>
                  <td className="py-2 pl-2 text-right font-medium text-gray-800">
                    {fmt(item.subtotal)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Totals */}
        <div className="mt-4 flex justify-end">
          <div className="w-72 space-y-2 text-sm">
            <div className="flex justify-between py-1 border-b border-gray-200">
              <span className="text-gray-600">Total Bruto</span>
              <span className="font-medium">{fmt(orc.totalBruto)}</span>
            </div>
            {descontoValor > 0 && (
              <div className="flex justify-between py-1 border-b border-gray-200 text-red-600">
                <span>Desconto</span>
                <span>- {fmt(descontoValor)}</span>
              </div>
            )}
            <div className="flex justify-between py-2 text-primary font-bold text-base">
              <span>Total Líquido</span>
              <span>{fmt(orc.totalLiquido)}</span>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Section 4: Discount & Payment ─── */}
      <section className="card mb-4">
        <h2 className="font-semibold text-primary mb-4 flex items-center gap-2">
          <span className="w-6 h-6 rounded-full bg-primary text-white text-xs flex items-center justify-center">4</span>
          Desconto e Condições de Pagamento
        </h2>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <div>
            <label className="label">Tipo de Desconto</label>
            <select
              className="input"
              value={orc.descontoTipo || 'percent'}
              onChange={e => update({ descontoTipo: e.target.value })}
            >
              <option value="percent">Percentual (%)</option>
              <option value="value">Valor (R$)</option>
            </select>
          </div>
          <Field label={`Desconto (${orc.descontoTipo === 'percent' ? '%' : 'R$'})`}>
            <input
              className="input"
              type="number"
              min="0"
              step="0.01"
              value={orc.desconto || 0}
              onChange={e => update({ desconto: e.target.value })}
            />
          </Field>
          <div className="md:col-span-2 flex items-end">
            <div className="bg-gray-50 rounded-lg px-4 py-2.5 w-full text-sm">
              <span className="text-gray-500">Total com desconto: </span>
              <span className="font-bold text-primary text-base">{fmt(orc.totalLiquido)}</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Field label="Entrada (%)">
            <input
              className="input"
              type="number"
              min="0"
              max="100"
              step="1"
              value={orc.entrada || 0}
              onChange={e => update({ entrada: e.target.value })}
            />
          </Field>
          <div>
            <label className="label">Valor da Entrada</label>
            <div className="input bg-gray-50 text-gray-600">
              {fmt(orc.totalLiquido * (Number(orc.entrada) || 0) / 100)}
            </div>
          </div>
          <Field label="Nº de Parcelas">
            <input
              className="input"
              type="number"
              min="1"
              max="24"
              step="1"
              value={orc.parcelas || 1}
              onChange={e => update({ parcelas: e.target.value })}
            />
          </Field>
          <div>
            <label className="label">Valor da Parcela</label>
            <div className="input bg-gray-50 text-gray-600 font-medium">
              {fmt(orc.valorParcela)}
            </div>
          </div>
        </div>

        <div className="mt-3 bg-primary/5 rounded-lg p-3 grid grid-cols-3 gap-3 text-sm text-center">
          <div>
            <div className="text-gray-500 text-xs">Total</div>
            <div className="font-bold text-gray-800">{fmt(orc.totalLiquido)}</div>
          </div>
          <div>
            <div className="text-gray-500 text-xs">Entrada</div>
            <div className="font-bold text-green-700">{fmt(orc.totalLiquido * (Number(orc.entrada) || 0) / 100)}</div>
          </div>
          <div>
            <div className="text-gray-500 text-xs">Saldo ({orc.parcelas}x)</div>
            <div className="font-bold text-primary">{fmt(orc.saldo)}</div>
          </div>
        </div>
      </section>

      {/* ─── Section 5: Locais ─── */}
      {Array.isArray(orc.locais) && orc.locais.length > 0 && (
        <section className="card mb-4">
          <h2 className="font-semibold text-primary mb-4 flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-primary text-white text-xs flex items-center justify-center">5</span>
            Detalhamento de Locais
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b-2 border-primary">
                  <th className="text-left py-2 pr-3 text-xs font-semibold text-gray-600">Local</th>
                  <th className="text-right py-2 px-2 text-xs font-semibold text-gray-600">Trincas (m)</th>
                  <th className="text-right py-2 px-2 text-xs font-semibold text-gray-600">Junta Fria (m)</th>
                  <th className="text-right py-2 px-2 text-xs font-semibold text-gray-600">Ralos</th>
                  <th className="text-right py-2 pl-2 text-xs font-semibold text-gray-600">Descrição</th>
                </tr>
              </thead>
              <tbody>
                {orc.locais.map((local, i) => (
                  <tr key={i} className="border-b border-gray-100">
                    <td className="py-2 pr-3 font-medium">{local.nome || local.local || `Local ${i + 1}`}</td>
                    <td className="py-2 px-2 text-right">{local.trinca || '—'}</td>
                    <td className="py-2 px-2 text-right">{local.juntaFria || '—'}</td>
                    <td className="py-2 px-2 text-right">{local.ralo || '—'}</td>
                    <td className="py-2 pl-2 text-right text-gray-500 text-xs">{local.descricao || ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ─── Section 6: Observations ─── */}
      <section className="card mb-4">
        <h2 className="font-semibold text-primary mb-3 flex items-center gap-2">
          <span className="w-6 h-6 rounded-full bg-primary text-white text-xs flex items-center justify-center">6</span>
          Observações Adicionais
        </h2>
        <textarea
          className="input min-h-[80px] resize-y"
          placeholder="Informações adicionais, condições especiais, garantias..."
          value={orc.obsAdicionais || ''}
          onChange={updateField('obsAdicionais')}
        />
      </section>

      {/* Sticky Bottom Bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-4 py-3 flex gap-3 justify-end z-10 md:left-56">
        <div className="flex-1 flex items-center gap-4">
          <span className="text-sm text-gray-500">Total:</span>
          <span className="text-xl font-bold text-primary">{fmt(orc.totalLiquido)}</span>
        </div>
        <button onClick={handleSave} disabled={saving} className="btn-secondary">
          {saving ? 'Salvando...' : 'Salvar Rascunho'}
        </button>
        <button onClick={handleGeneratePdf} disabled={saving} className="btn-secondary">
          Gerar PDF
        </button>
        {orc.status !== 'aprovado' && (
          <button onClick={handleApprove} disabled={saving} className="btn-success">
            Aprovar → Gerar Contrato
          </button>
        )}
      </div>
    </div>
  )
}
