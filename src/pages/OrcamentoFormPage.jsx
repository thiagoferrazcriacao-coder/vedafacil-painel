import React, { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { api } from '../api/client.js'
import { useAuth } from '../App.jsx'

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
  const trinca     = get('trinca')
  const juntaFria  = get('juntaFria')
  const juntaDilat = get('juntaDilat')
  const ralo       = get('ralo')
  const ferragem   = get('ferragem')
  const cortina    = get('cortina')

  const totalUnidades = trinca + juntaFria + juntaDilat + ralo + ferragem + cortina
  const consumo = trinca * 1.5 + juntaDilat * 2.0 + juntaFria * 1.0 + ralo * 1.0 + cortina * 2.0
  const linear  = trinca + juntaFria + juntaDilat // para qtdInjetores

  // Dias: arredonda para cima até o 0,5 mais próximo (ex: 4,75→5 | 5,25→5,5 | 5,5→5,5)
  const diasArredondado = Math.ceil((totalUnidades / 8) * 2) / 2

  return {
    diasTrabalho:   diasArredondado,
    prazoExecucao:  diasArredondado, // prazo = dias calculados pela fórmula
    consumoProduto: parseFloat(consumo.toFixed(1)),
    qtdInjetores:   Math.ceil(linear * 4),
  }
}

function recalculate(orc) {
  const itens = (orc.itens || []).map(item => ({
    ...item,
    subtotal: Number(item.quantidade || 0) * Number(item.valorUnit || 0)
  }))
  const totalBruto = itens.reduce((s, i) => s + i.subtotal, 0)

  // Proposta 1 — À Vista (desconto1 / descontoTipo1)
  const desconto1Val = orc.descontoTipo1 === 'valor'
    ? (Number(orc.desconto1) || 0)
    : totalBruto * (Number(orc.desconto1) || 0) / 100
  const totalProposta1 = Math.max(0, totalBruto - desconto1Val)

  // Proposta 2 — Parcelado (desconto2 / descontoTipo2)
  const desconto2Val = orc.descontoTipo2 === 'valor'
    ? (Number(orc.desconto2) || 0)
    : totalBruto * (Number(orc.desconto2) || 0) / 100
  const totalProposta2 = Math.max(0, totalBruto - desconto2Val)
  const entradaTipo2 = orc.entradaTipo2 || 'percent'
  const entrada2Pct = orc.entrada2 != null ? Number(orc.entrada2) : (orc.entrada != null ? Number(orc.entrada) : 50)
  const entradaVal2 = entradaTipo2 === 'valor'
    ? (Number(orc.entrada2) || 0)
    : totalProposta2 * entrada2Pct / 100
  const saldo2 = Math.max(0, totalProposta2 - entradaVal2)
  const parcelas2 = Math.max(1, Number(orc.parcelas) || 1)
  const valorParcela2 = saldo2 / parcelas2

  // Legacy compat — totalLiquido uses proposta1 by default
  const totalLiquido = totalProposta1
  const obra = calcObra(itens)

  return {
    ...orc, itens, totalBruto, totalLiquido,
    totalProposta1, totalProposta2,
    entradaVal2, saldo2, valorParcela2,
    valorParcela: valorParcela2, // backward compat
    diasTrabalho:   obra.diasTrabalho,
    consumoProduto: obra.consumoProduto,
    qtdInjetores:   obra.qtdInjetores,
    // Prazo: auto-calcula a partir dos serviços, mas preserva se o usuário editou manualmente
    prazoExecucao: orc.prazoManual
      ? (orc.prazoExecucao || obra.prazoExecucao || 3)
      : Math.max(1, obra.prazoExecucao || 3),
  }
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
  const { user } = useAuth()

  const [orc, setOrc] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  // Load existing or create new
  useEffect(() => {
    async function load() {
      try {
        const meNome = user?.username || user?.name || ''

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
          // elaboradoPor = usuário logado; avaliadoPor = em branco
          const elaboradoPor = meNome || data.elaboradoPor || ''
          // Use the pre-fetched number (server already applied it, but ensure it matches)
          setOrc(recalculate({ ...data, numero: data.numero || proximoNumero, elaboradoPor, avaliadoPor: '' }))
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
              {orc.status === 'aprovado' ? 'Aprovado' : orc.status === 'enviado' ? 'Enviado' : 'Redigido'}
            </span>
            {saved && <span className="text-green-600 text-xs">Salvo</span>}
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex gap-2 flex-wrap">
          {/* Toggle Orçamento Mínimo */}
          <button
            onClick={() => update({ orcMinimo: !orc.orcMinimo })}
            className={`text-xs px-3 py-1.5 rounded-full border font-semibold transition-colors ${
              orc.orcMinimo
                ? 'bg-amber-500 text-white border-amber-500'
                : 'bg-white text-amber-600 border-amber-400 hover:bg-amber-50'
            }`}
            title="Modo simplificado: mostra apenas nomes dos locais e valor total"
          >
            {orc.orcMinimo ? '🔖 Orç. Mínimo Ativo' : '🔖 Orç. Mínimo'}
          </button>
          <button onClick={handleSave} disabled={saving} className="btn-secondary">
            {saving ? 'Salvando...' : 'Salvar Rascunho'}
          </button>
          <button onClick={handleGeneratePdf} disabled={saving} className="btn-secondary">
            Gerar PDF
          </button>
          <button onClick={handleDownloadExcel} disabled={saving} className="btn-secondary">
            Excel
          </button>
          <button
            onClick={async () => { await handleSave(); navigate('/orcamentos') }}
            disabled={saving}
            className="btn-primary"
          >
            {saving ? 'Salvando...' : '✓ Concluir'}
          </button>
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
          <Field label="Nº do Orçamento">
            <input className="input" type="number" value={orc.numero || ''} onChange={e => update({ numero: Number(e.target.value) })} />
          </Field>
          <Field label="Data do Orçamento">
            <input className="input" type="text" value={orc.dataOrcamento || ''} onChange={updateField('dataOrcamento')} placeholder="dd/mm/aaaa" />
          </Field>
          <Field label="Validade (dias)">
            <input className="input" type="number" min="1" value={orc.validade || 30} onChange={e => update({ validade: Number(e.target.value) })} />
          </Field>
          <Field label="Elaborado Por">
            <input className="input" value={orc.elaboradoPor || ''} onChange={updateField('elaboradoPor')} />
          </Field>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-3">
          <div>
            <label className="label">Avaliado Por</label>
            <div className="flex flex-wrap gap-2 mt-1">
              {['Thiago', 'Alan', 'Fernando', 'Daniel'].map(nome => {
                const selecionados = (orc.avaliadoPor || '').split(',').map(s => s.trim()).filter(Boolean)
                const ativo = selecionados.includes(nome)
                return (
                  <button key={nome} type="button"
                    onClick={() => {
                      const atual = (orc.avaliadoPor || '').split(',').map(s => s.trim()).filter(Boolean)
                      const novo = ativo ? atual.filter(s => s !== nome) : [...atual, nome]
                      update({ avaliadoPor: novo.join(', ') })
                    }}
                    className={`px-3 py-1 rounded-full text-xs font-medium border transition-all ${ativo ? 'bg-primary text-white border-primary' : 'bg-white text-gray-600 border-gray-300 hover:border-primary hover:text-primary'}`}>
                    {nome}
                  </button>
                )
              })}
            </div>
          </div>
          <Field label="Acompanhado Por">
            <input className="input" value={orc.acompanhadoPor || ''} onChange={updateField('acompanhadoPor')} />
          </Field>
          <Field label="Técnico Responsável">
            <input className="input" value={orc.tecnicoResponsavel || ''} onChange={updateField('tecnicoResponsavel')} />
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
          <Field label="Bairro">
            <input className="input" value={orc.bairro || ''} onChange={updateField('bairro')} />
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

      {/* ─── Orçamento Mínimo Banner ─── */}
      {orc.orcMinimo && (
        <section className="card mb-4 border-2 border-amber-400 bg-amber-50">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <h2 className="font-bold text-amber-800 mb-1 flex items-center gap-2">
                🔖 Modo Orçamento Mínimo
              </h2>
              <p className="text-xs text-amber-700 mb-3">
                O PDF exibirá apenas a lista de nomes dos locais e o valor total abaixo. A tabela de medições não aparecerá.
              </p>
              <div>
                <label className="label">Valor Total (Orçamento Mínimo)</label>
                <div className="flex items-center gap-2">
                  <span className="text-gray-500 text-sm">R$</span>
                  <input
                    className="input w-48"
                    type="number"
                    min="0"
                    step="0.01"
                    value={orc.totalMinimo || 0}
                    onChange={e => update({ totalMinimo: Number(e.target.value) })}
                    placeholder="0,00"
                  />
                  <span className="text-xs text-gray-500">
                    (calculado: {fmt(orc.totalLiquido)})
                  </span>
                </div>
                <p className="text-xs text-gray-400 mt-1">
                  Deixe 0 para usar o total calculado automaticamente.
                </p>
              </div>
            </div>
            <button
              onClick={() => update({ orcMinimo: false })}
              className="text-amber-500 hover:text-amber-700 text-sm font-medium flex-shrink-0"
            >
              ✕ Desativar
            </button>
          </div>
        </section>
      )}

      {/* ─── Section 4: Propostas ─── */}
      <section className="card mb-4">
        <h2 className="font-semibold text-primary mb-4 flex items-center gap-2">
          <span className="w-6 h-6 rounded-full bg-primary text-white text-xs flex items-center justify-center">4</span>
          Condições de Pagamento e Propostas
        </h2>

        {/* Prazo + Garantia + Andaime */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5 p-4 bg-gray-50 rounded-xl border border-gray-200">
          <Field label={<span>Prazo de Execução (dias úteis) {orc.prazoManual ? <span className="text-xs text-amber-600 font-normal ml-1">(editado)</span> : <span className="text-xs text-green-600 font-normal ml-1">(automático)</span>}</span>}>
            <div className="flex gap-2 items-center">
              <input className="input" type="number" min="1" value={orc.prazoExecucao || 3}
                onChange={e => update({ prazoExecucao: Number(e.target.value), prazoManual: true })} />
              {orc.prazoManual && (
                <button type="button" title="Recalcular automaticamente"
                  onClick={() => update({ prazoManual: false })}
                  className="px-2 py-1 text-sm bg-gray-100 hover:bg-gray-200 rounded border border-gray-300 text-gray-600 whitespace-nowrap">
                  🔄 Auto
                </button>
              )}
            </div>
          </Field>
          <div>
            <label className="label">Garantia (aparece no PDF)</label>
            <div className="flex gap-4 mt-1">
              {[7, 15].map(anos => (
                <label key={anos} className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" name="garantia" value={anos} checked={Number(orc.garantia || 15) === anos} onChange={() => update({ garantia: anos })} className="accent-primary" />
                  <span className="text-sm font-medium">{anos} anos</span>
                </label>
              ))}
            </div>
          </div>
          <div>
            <label className="label">Andaime necessário?</label>
            <div className="flex gap-4 mt-1">
              {[['nao', 'Não'], ['sim', 'Sim']].map(([val, lbl]) => (
                <label key={val} className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" name="andaime" value={val} checked={(orc.andaime || 'nao') === val} onChange={() => update({ andaime: val })} className="accent-primary" />
                  <span className="text-sm font-medium">{lbl}</span>
                </label>
              ))}
            </div>
          </div>
        </div>

        {/* Total bruto */}
        <div className="flex items-center gap-2 mb-5 p-3 bg-orange-50 rounded-lg border border-orange-200">
          <span className="text-sm text-gray-600">Total Bruto dos Serviços:</span>
          <span className="font-bold text-primary text-lg">{fmt(orc.totalBruto)}</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-5">
          {/* Proposta 1 — À Vista */}
          <div className="bg-green-50 border-2 border-green-300 rounded-xl p-4">
            <div className="font-bold text-green-800 text-sm mb-3 flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-green-600 text-white text-xs flex items-center justify-center">1</span>
              PROPOSTA 1 — Pagamento à Vista
            </div>
            <div className="grid grid-cols-2 gap-2 mb-3">
              <div>
                <label className="label text-xs">Tipo de Desconto</label>
                <select className="input py-1 text-sm" value={orc.descontoTipo1 || 'percent'} onChange={e => update({ descontoTipo1: e.target.value })}>
                  <option value="percent">Percentual (%)</option>
                  <option value="valor">Valor (R$)</option>
                </select>
              </div>
              <div>
                <label className="label text-xs">{orc.descontoTipo1 === 'valor' ? 'Desconto (R$)' : 'Desconto (%)'}</label>
                <input className="input py-1 text-sm" type="number" min="0" step="0.01" value={orc.desconto1 || 0} onChange={e => update({ desconto1: e.target.value })} />
              </div>
            </div>
            <div className="bg-white rounded-lg p-3 text-center border border-green-200">
              <div className="text-xs text-gray-500 mb-1">TOTAL À VISTA</div>
              <div className="text-2xl font-bold text-green-700">{fmt(orc.totalProposta1 ?? orc.totalLiquido)}</div>
            </div>
            <div className="mt-3">
              <Field label="Observação (aparece no PDF)">
                <input className="input text-sm" value={orc.condicaoPgto1Obs || ''} onChange={updateField('condicaoPgto1Obs')} placeholder="*Pgto à vista na assinatura do contrato." />
              </Field>
            </div>
          </div>

          {/* Proposta 2 — Parcelado */}
          <div className="bg-blue-50 border-2 border-blue-300 rounded-xl p-4">
            <div className="font-bold text-blue-800 text-sm mb-3 flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-blue-600 text-white text-xs flex items-center justify-center">2</span>
              PROPOSTA 2 — Pagamento Parcelado
            </div>
            <div className="grid grid-cols-2 gap-2 mb-3">
              <div>
                <label className="label text-xs">Tipo de Desconto</label>
                <select className="input py-1 text-sm" value={orc.descontoTipo2 || 'percent'} onChange={e => update({ descontoTipo2: e.target.value })}>
                  <option value="percent">Percentual (%)</option>
                  <option value="valor">Valor (R$)</option>
                </select>
              </div>
              <div>
                <label className="label text-xs">{orc.descontoTipo2 === 'valor' ? 'Desconto (R$)' : 'Desconto (%)'}</label>
                <input className="input py-1 text-sm" type="number" min="0" step="0.01" value={orc.desconto2 || 0} onChange={e => update({ desconto2: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 mb-3">
              <div>
                <label className="label text-xs">Nº de Parcelas</label>
                <input className="input py-1 text-sm" type="number" min="1" max="24" step="1" value={orc.parcelas || 1} onChange={e => update({ parcelas: e.target.value })} />
              </div>
              <div>
                <label className="label text-xs">Tipo de Entrada</label>
                <select className="input py-1 text-sm" value={orc.entradaTipo2 || 'percent'} onChange={e => update({ entradaTipo2: e.target.value })}>
                  <option value="percent">Percentual (%)</option>
                  <option value="valor">Valor (R$)</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 mb-3">
              <div>
                <label className="label text-xs">{orc.entradaTipo2 === 'valor' ? 'Entrada (R$)' : 'Entrada (%)'}</label>
                <input className="input py-1 text-sm" type="number" min="0" step="0.01" value={orc.entrada2 ?? orc.entrada ?? 50} onChange={e => update({ entrada2: e.target.value })} />
              </div>
              <div className="flex flex-col justify-end">
                <div className="bg-white rounded-lg p-2 text-center border border-blue-200">
                  <div className="text-xs text-gray-400">Valor da Parcela</div>
                  <div className="font-bold text-blue-700 text-base">{fmt(orc.valorParcela2 ?? orc.valorParcela)}</div>
                </div>
              </div>
            </div>
            <div className="bg-white rounded-lg p-3 text-center border border-blue-200 mb-3">
              <div className="text-xs text-gray-500 mb-0.5">TOTAL PARCELADO</div>
              <div className="text-xl font-bold text-blue-700">{fmt(orc.totalProposta2 ?? orc.totalLiquido)}</div>
              <div className="text-xs text-gray-400 mt-0.5">
                Entrada: {fmt(orc.entradaVal2 ?? 0)} + {orc.parcelas || 1}x {fmt(orc.valorParcela2 ?? orc.valorParcela)}
              </div>
            </div>
            <Field label="Obs linha 1">
              <input className="input text-sm" value={orc.condicaoPgto2Obs1 || ''} onChange={updateField('condicaoPgto2Obs1')} placeholder="* 1ª parcela de entrada na assinatura." />
            </Field>
            <div className="mt-2">
              <Field label="Obs linha 2">
                <input className="input text-sm" value={orc.condicaoPgto2Obs2 || ''} onChange={updateField('condicaoPgto2Obs2')} placeholder="*2ª parcela p/ 30 dias." />
              </Field>
            </div>
          </div>
        </div>

        <Field label="Observação geral (itálico abaixo das propostas)">
          <input className="input" value={orc.obsGeral || ''} onChange={updateField('obsGeral')} placeholder="Obs: O contrato deve ser assinado até 2 dias após recebimento..." />
        </Field>
      </section>

      {/* ─── Section 5: Locais ─── */}
      {Array.isArray(orc.locais) && orc.locais.length > 0 && (
        <section className="card mb-4">
          <h2 className="font-semibold text-primary mb-4 flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-primary text-white text-xs flex items-center justify-center">5</span>
            Detalhamento de Locais
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b-2 border-primary bg-orange-50">
                  <th className="text-left py-2 pr-3 font-semibold text-gray-600">Local</th>
                  <th className="text-right py-2 px-1 font-semibold text-gray-600">Trincas (m)</th>
                  <th className="text-right py-2 px-1 font-semibold text-gray-600">J. Fria (m)</th>
                  <th className="text-right py-2 px-1 font-semibold text-gray-600">Ralos</th>
                  <th className="text-right py-2 px-1 font-semibold text-gray-600">J. Dilat (m)</th>
                  <th className="text-right py-2 px-1 font-semibold text-gray-600">Ferragem (m)</th>
                  <th className="text-right py-2 px-1 font-semibold text-gray-600">Cortina (m²)</th>
                  <th className="text-right py-2 pl-2 font-semibold text-primary">Total</th>
                </tr>
              </thead>
              <tbody>
                {orc.locais.map((local, i) => {
                  const total = (Number(local.trinca)||0) + (Number(local.juntaFria)||0) + (Number(local.ralo)||0) + (Number(local.juntaDilat)||0) + (Number(local.ferragem)||0) + (Number(local.cortina)||0)
                  return (
                    <tr key={i} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="py-1.5 pr-3 font-medium text-gray-800">{local.nome || local.local || `Local ${i + 1}`}</td>
                      <td className="py-1.5 px-1 text-right">{Number(local.trinca) > 0 ? local.trinca : '—'}</td>
                      <td className="py-1.5 px-1 text-right">{Number(local.juntaFria) > 0 ? local.juntaFria : '—'}</td>
                      <td className="py-1.5 px-1 text-right">{Number(local.ralo) > 0 ? local.ralo : '—'}</td>
                      <td className="py-1.5 px-1 text-right">{Number(local.juntaDilat) > 0 ? local.juntaDilat : '—'}</td>
                      <td className="py-1.5 px-1 text-right">{Number(local.ferragem) > 0 ? local.ferragem : '—'}</td>
                      <td className="py-1.5 px-1 text-right">{Number(local.cortina) > 0 ? local.cortina : '—'}</td>
                      <td className="py-1.5 pl-2 text-right font-semibold text-primary">{total > 0 ? total : '—'}</td>
                    </tr>
                  )
                })}
                {/* Totals row */}
                <tr className="bg-orange-50 font-bold border-t-2 border-primary">
                  <td className="py-2 pr-3 text-xs font-bold text-gray-700">TOTAL</td>
                  {['trinca','juntaFria','ralo','juntaDilat','ferragem','cortina'].map(k => (
                    <td key={k} className="py-2 px-1 text-right text-primary">
                      {orc.locais.reduce((s,l) => s + (Number(l[k])||0), 0) > 0
                        ? orc.locais.reduce((s,l) => s + (Number(l[k])||0), 0)
                        : '—'}
                    </td>
                  ))}
                  <td className="py-2 pl-2 text-right text-primary">
                    {orc.locais.reduce((s,l) => s + ['trinca','juntaFria','ralo','juntaDilat','ferragem','cortina'].reduce((a,k)=>a+(Number(l[k])||0),0), 0)}
                  </td>
                </tr>
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
          <span className="text-sm text-gray-500">{orc.orcMinimo ? 'Total Mínimo:' : 'Total:'}</span>
          <span className="text-xl font-bold text-primary">
            {fmt(orc.orcMinimo && orc.totalMinimo > 0 ? orc.totalMinimo : orc.totalLiquido)}
          </span>
          {orc.orcMinimo && <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-semibold">🔖 Mínimo</span>}
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
        <button
          onClick={async () => { await handleSave(); navigate('/orcamentos') }}
          disabled={saving}
          className="btn-primary"
        >
          {saving ? 'Salvando...' : '✓ Concluir'}
        </button>
      </div>
    </div>
  )
}
