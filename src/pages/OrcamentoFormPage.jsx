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

function calcObra(itens) {
  const get = (tipo) => Number((itens || []).find(i => i.tipo === tipo)?.quantidade) || 0
  const trinca = get('trinca')
  const juntaFria = get('juntaFria')
  const juntaDilat = get('juntaDilat')
  const linear = trinca + juntaFria + juntaDilat
  return {
    diasTrabalho: parseFloat((linear / 9).toFixed(2)),
    consumoProduto: parseFloat((trinca * 1.5 + (juntaFria + juntaDilat) * 1.0).toFixed(1)),
    qtdInjetores: Math.ceil(linear * 4),
  }
}

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
  const obra = calcObra(itens)

  return { ...orc, itens, totalBruto, totalLiquido, saldo, valorParcela, ...obra }
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
          // Fetch next sequential number before creating
          let proximoNumero = 1
          try {
            const proxResult = await api.getProximoOrcamento()
            proximoNumero = proxResult.numero || 1
          } catch (_) { /* silently fall back to 1 */ }

          // Create new from measurement
          const data = await api.createOrcamento({ medicaoId: medicaoId || null })
          // Use the pre-fetched number (server already applied it, but ensure it matches)
          setOrc(recalculate({ ...data, numero: data.numero || proximoNumero }))
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

  const handleGeneratePdf = async () => {
    await handleSave()
    window.open(api.getOrcamentoPdfUrl(orc.id), '_blank')
  }

  const handleDownloadExcel = async () => {
    await handleSave()
    const token = localStorage.getItem('veda_token')
    const res = await fetch(`/api/orcamentos/${orc.id}/excel`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` }
    })
    if (!res.ok) { setError('Erro ao gerar Excel'); return }
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `Orcamento_${orc.numero || orc.id}_${(orc.cliente || 'cliente').replace(/\s+/g, '_')}.xlsx`
    a.click()
    URL.revokeObjectURL(url)
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
          <button onClick={handleDownloadExcel} disabled={saving} className="btn-secondary">
            Excel
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
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <Field label="Nº do Orçamento">
            <input className="input" type="number" value={orc.numero || ''} onChange={e => update({ numero: Number(e.target.value) })} />
          </Field>
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

      {/* ─── Cálculo de Obra ─── */}
      {(orc.diasTrabalho > 0 || orc.consumoProduto > 0 || orc.qtdInjetores > 0) && (
        <section className="card mb-4 bg-amber-50 border border-amber-200">
          <h2 className="font-semibold text-amber-800 mb-3 flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-amber-600 text-white text-xs flex items-center justify-center">⚙</span>
            Cálculo de Obra
          </h2>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div className="bg-white rounded-lg p-3 border border-amber-200">
              <div className="text-2xl font-bold text-amber-700">{orc.diasTrabalho?.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
              <div className="text-xs text-gray-500 mt-1">Dias de Trabalho</div>
            </div>
            <div className="bg-white rounded-lg p-3 border border-amber-200">
              <div className="text-2xl font-bold text-amber-700">{orc.consumoProduto?.toLocaleString('pt-BR', { minimumFractionDigits: 1 })} L</div>
              <div className="text-xs text-gray-500 mt-1">Consumo GVF Seal</div>
            </div>
            <div className="bg-white rounded-lg p-3 border border-amber-200">
              <div className="text-2xl font-bold text-amber-700">{orc.qtdInjetores}</div>
              <div className="text-xs text-gray-500 mt-1">Injetores</div>
            </div>
          </div>
          <p className="text-xs text-amber-700 mt-2">Calculado automaticamente a partir das quantidades acima.</p>
        </section>
      )}

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

        <div className="mb-3">
          <label className="label">Garantia (aparece no PDF)</label>
          <div className="flex gap-4 mt-1">
            {[7, 15].map(anos => (
              <label key={anos} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="garantia"
                  value={anos}
                  checked={Number(orc.garantia || 15) === anos}
                  onChange={() => update({ garantia: anos })}
                  className="accent-primary"
                />
                <span className="text-sm font-medium">{anos} anos</span>
              </label>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Field label="Prazo de Execução (dias úteis)">
            <input
              className="input"
              type="number"
              min="1"
              value={orc.prazoExecucao || 3}
              onChange={e => update({ prazoExecucao: Number(e.target.value) })}
            />
          </Field>
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
            <label className="label">Valor da Parcela (sem desc.)</label>
            <div className="input bg-gray-50 text-gray-600 font-medium">
              {fmt((orc.totalBruto || 0) / Math.max(1, Number(orc.parcelas) || 1))}
            </div>
          </div>
          <div>
            <label className="label">Total Líquido (à vista)</label>
            <div className="input bg-gray-50 text-primary font-bold">
              {fmt(orc.totalLiquido)}
            </div>
          </div>
        </div>

        <div className="mt-4 space-y-3">
          <h3 className="text-sm font-semibold text-gray-600">Textos das Condições (aparecem no PDF)</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="Proposta 1 (à vista) — observação">
              <input className="input" value={orc.condicaoPgto1Obs || ''} onChange={updateField('condicaoPgto1Obs')} placeholder="*Pgto a vista, na assinatura do contrato." />
            </Field>
            <Field label="Proposta 2 — obs linha 1">
              <input className="input" value={orc.condicaoPgto2Obs1 || ''} onChange={updateField('condicaoPgto2Obs1')} placeholder="* 1ª parcela de entrada na assinatura do contrato." />
            </Field>
            <Field label="Proposta 2 — obs linha 2">
              <input className="input" value={orc.condicaoPgto2Obs2 || ''} onChange={updateField('condicaoPgto2Obs2')} placeholder="*2ª parcela p/ 30 dias." />
            </Field>
            <Field label="Observação geral (itálico abaixo das propostas)">
              <input className="input" value={orc.obsGeral || ''} onChange={updateField('obsGeral')} placeholder="Obs: O contrato deve ser assinado até 2 dias após recebimento..." />
            </Field>
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
        <button onClick={handleDownloadExcel} disabled={saving} className="btn-secondary">
          Excel
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
