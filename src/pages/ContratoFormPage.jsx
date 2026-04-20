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
  const [contrato, setContrato] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const [zapsignLoading, setZapsignLoading] = useState(false)

  useEffect(() => {
    api.getContrato(id)
      .then(setContrato)
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [id])

  const update = (field) => (e) => {
    setContrato(prev => ({ ...prev, [field]: e.target.value }))
    setSaved(false)
  }

  const handleSave = async () => {
    setSaving(true)
    setError('')
    try {
      const updated = await api.updateContrato(id, contrato)
      setContrato(updated)
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
      const res = await api.sendToZapSign(id)
      setContrato(prev => ({ ...prev, zapsignDocId: res.docToken, zapsignSignUrl: res.signUrl }))
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

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
    </div>
  )

  if (!contrato) return <div className="p-6 text-red-500">{error || 'Contrato não encontrado'}</div>

  const c = contrato

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
            <span className={`badge ${c.status === 'assinado' ? 'bg-green-100 text-green-800' : 'bg-orange-100 text-orange-800'}`}>
              {c.status === 'assinado' ? 'Assinado' : 'Aguardando Assinatura'}
            </span>
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

      {/* Client & Contract Info */}
      <section className="card mb-4">
        <h2 className="font-semibold text-primary mb-4 flex items-center gap-2">
          <span className="w-6 h-6 rounded-full bg-primary text-white text-xs flex items-center justify-center">1</span>
          Dados do Cliente
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <Field label="Nome do Cliente">
            <input className="input" value={c.cliente || ''} onChange={update('cliente')} />
          </Field>
          <Field label="AC (Responsável)">
            <input className="input" value={c.ac || ''} onChange={update('ac')} />
          </Field>
          <Field label="Celular">
            <input className="input" value={c.celular || ''} onChange={update('celular')} />
          </Field>
          <Field label="CPF do Responsável">
            <input className="input" value={c.cpfResponsavel || ''} onChange={update('cpfResponsavel')} placeholder="000.000.000-00" />
          </Field>
          <Field label="RG do Responsável">
            <input className="input" value={c.rgResponsavel || ''} onChange={update('rgResponsavel')} />
          </Field>
          <Field label="CNPJ do Cliente">
            <input className="input" value={c.cnpjCliente || ''} onChange={update('cnpjCliente')} placeholder="00.000.000/0001-00" />
          </Field>
          <div className="md:col-span-2">
            <Field label="Endereço">
              <input className="input" value={c.endereco || ''} onChange={update('endereco')} />
            </Field>
          </div>
          <Field label="Cidade">
            <input className="input" value={c.cidade || ''} onChange={update('cidade')} />
          </Field>
        </div>
      </section>

      {/* Contract Details */}
      <section className="card mb-4">
        <h2 className="font-semibold text-primary mb-4 flex items-center gap-2">
          <span className="w-6 h-6 rounded-full bg-primary text-white text-xs flex items-center justify-center">2</span>
          Informações do Contrato
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <Field label="Data de Início">
            <input className="input" type="date" value={c.dataInicio || ''} onChange={update('dataInicio')} />
          </Field>
          <Field label="Data de Término">
            <input className="input" type="date" value={c.dataTermino || ''} onChange={update('dataTermino')} />
          </Field>
          <Field label="Data de Assinatura">
            <input className="input" type="date" value={c.dataAssinatura || ''} onChange={update('dataAssinatura')} />
          </Field>
          <Field label="Foro">
            <input className="input" value={c.foro || 'Barra Mansa'} onChange={update('foro')} />
          </Field>
        </div>
      </section>

      {/* Financial Summary */}
      <section className="card mb-4">
        <h2 className="font-semibold text-primary mb-4 flex items-center gap-2">
          <span className="w-6 h-6 rounded-full bg-primary text-white text-xs flex items-center justify-center">3</span>
          Resumo Financeiro
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <div className="bg-gray-50 rounded-lg p-3">
            <div className="text-gray-500 text-xs mb-1">Total</div>
            <div className="font-bold text-gray-800 text-lg">{fmt(c.totalLiquido)}</div>
          </div>
          <div className="bg-gray-50 rounded-lg p-3">
            <div className="text-gray-500 text-xs mb-1">Entrada ({c.entrada || 0}%)</div>
            <div className="font-bold text-green-700">{fmt(c.totalLiquido * (Number(c.entrada) || 0) / 100)}</div>
          </div>
          <div className="bg-gray-50 rounded-lg p-3">
            <div className="text-gray-500 text-xs mb-1">Saldo</div>
            <div className="font-bold text-primary">{fmt(c.saldo)}</div>
          </div>
          <div className="bg-gray-50 rounded-lg p-3">
            <div className="text-gray-500 text-xs mb-1">Parcelas</div>
            <div className="font-bold text-gray-800">{c.parcelas || 1}x de {fmt(c.valorParcela)}</div>
          </div>
        </div>
      </section>

      {/* Items */}
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
        {c.status !== 'assinado' && (
          <button onClick={handleZapSign} disabled={zapsignLoading} className="btn-primary">
            {zapsignLoading ? 'Enviando...' : 'Enviar ZapSign'}
          </button>
        )}
      </div>
    </div>
  )
}
