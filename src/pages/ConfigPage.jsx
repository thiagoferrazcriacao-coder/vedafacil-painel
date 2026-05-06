import React, { useEffect, useState } from 'react'
import { api } from '../api/client.js'

const PRICE_LABELS = {
  trinca: 'Trincas (por metro)',
  juntaFria: 'Juntas Frias (por metro)',
  ralo: 'Ralos (por unidade)',
  juntaDilat: 'Juntas de Dilatação (por metro)',
  ferragem: 'Tratamento de Ferragens (por metro)',
  cortina: 'Cortinas (por m²)',
  art: 'ART Engenheiro (por unidade)',
  mobilizacao: 'Mobilização (por obra)'
}

const PRICE_UNITS = {
  trinca: 'm',
  juntaFria: 'm',
  ralo: 'unid',
  juntaDilat: 'm',
  ferragem: 'm',
  cortina: 'm²',
  art: 'unid',
  mobilizacao: 'obra'
}

const fmt = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0)

const DEFAULT_TECNICOS = ['Alan', 'Fernando', 'Thiago', 'Daniel']

export default function ConfigPage() {
  const [precos, setPrecos] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [novoTecnico, setNovoTecnico] = useState('')

  useEffect(() => {
    api.getPrecos()
      .then(setPrecos)
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  const handleChange = (key, value) => {
    setPrecos(prev => ({ ...prev, [key]: Number(value) }))
    setSaved(false)
  }

  const handleNumOrcamentoChange = (value) => {
    setPrecos(prev => ({ ...prev, numOrcamento: Number(value) }))
    setSaved(false)
  }

  const handleSave = async () => {
    setSaving(true)
    setError('')
    try {
      await api.updatePrecos(precos)
      setSaved(true)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
    </div>
  )

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Configurações</h1>
          <p className="text-gray-500 text-sm mt-0.5">Preços padrão para novos orçamentos</p>
        </div>
        <div className="flex items-center gap-3">
          {saved && <span className="text-green-600 text-sm font-medium">Salvo com sucesso!</span>}
          <button onClick={handleSave} disabled={saving} className="btn-primary">
            {saving ? 'Salvando...' : 'Salvar Preços'}
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>
      )}

      <div className="card">
        <h2 className="font-semibold text-gray-700 mb-4 text-sm uppercase tracking-wide">Tabela de Preços</h2>

        <p className="text-sm text-gray-500 mb-4">
          Estes preços serão usados como valores padrão ao criar novos orçamentos. Cada orçamento pode ter seus preços editados individualmente.
        </p>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b-2 border-primary">
                <th className="text-left py-2 pr-4 text-xs font-semibold text-gray-600">Serviço</th>
                <th className="text-center py-2 px-3 text-xs font-semibold text-gray-600 w-20">Unidade</th>
                <th className="text-right py-2 pl-3 text-xs font-semibold text-gray-600 w-40">Preço Unitário (R$)</th>
              </tr>
            </thead>
            <tbody>
              {precos && Object.entries(PRICE_LABELS).map(([key, label]) => (
                <tr key={key} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="py-3 pr-4">
                    <div className="font-medium text-gray-800">{label}</div>
                  </td>
                  <td className="py-3 px-3 text-center text-gray-500">
                    {PRICE_UNITS[key]}
                  </td>
                  <td className="py-3 pl-3">
                    <div className="flex items-center gap-1 justify-end">
                      <span className="text-gray-400 text-xs">R$</span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={precos[key] || 0}
                        onChange={e => handleChange(key, e.target.value)}
                        className="input w-28 text-right py-1"
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Preview */}
        {precos && (
          <div className="mt-6 bg-gray-50 rounded-lg p-4">
            <h3 className="text-xs font-semibold text-gray-500 uppercase mb-3">Visualização da Tabela</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {Object.entries(PRICE_LABELS).map(([key, label]) => (
                <div key={key} className="bg-white rounded-lg p-2.5 shadow-sm">
                  <div className="text-xs text-gray-500 leading-tight mb-1">{label.split(' (')[0]}</div>
                  <div className="font-bold text-primary">{fmt(precos[key])}</div>
                  <div className="text-xs text-gray-400">{PRICE_UNITS[key]}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Numeração */}
      <div className="card mt-4">
        <h2 className="font-semibold text-gray-700 mb-4 text-sm uppercase tracking-wide">Numeração</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div>
            <label className="label">Número atual do orçamento</label>
            <input
              type="number" min="1" step="1" className="input w-36"
              value={precos?.numOrcamento ?? 1}
              onChange={e => setPrecos(prev => ({ ...prev, numOrcamento: Number(e.target.value) })) || setSaved(false)}
            />
            <p className="text-xs text-gray-400 mt-1">Próximo orçamento terá este número.</p>
          </div>
          <div>
            <label className="label">Número atual das medições</label>
            <input
              type="number" min="1" step="1" className="input w-36"
              value={precos?.numMedicao ?? 1}
              onChange={e => { setPrecos(prev => ({ ...prev, numMedicao: Number(e.target.value) })); setSaved(false) }}
            />
            <p className="text-xs text-gray-400 mt-1">Próxima medição recebida terá este número.</p>
          </div>
        </div>
      </div>

      {/* Técnicos Responsáveis */}
      <div className="card mt-4">
        <h2 className="font-semibold text-gray-700 mb-1 text-sm uppercase tracking-wide">Técnicos Responsáveis</h2>
        <p className="text-xs text-gray-400 mb-4">Lista usada nas OS e no App do Aplicador como ponto de contato</p>
        <div className="flex flex-wrap gap-2 mb-3">
          {(precos?.tecnicos || DEFAULT_TECNICOS).map((t, i) => (
            <div key={i} className="flex items-center gap-1.5 bg-orange-50 border border-orange-200 rounded-full px-3 py-1.5">
              <span className="text-sm font-medium text-orange-800">{t}</span>
              <button
                onClick={() => {
                  const arr = [...(precos?.tecnicos || DEFAULT_TECNICOS)]
                  arr.splice(i, 1)
                  setPrecos(prev => ({ ...prev, tecnicos: arr }))
                  setSaved(false)
                }}
                className="text-orange-400 hover:text-red-500 text-xs leading-none ml-1"
                title="Remover"
              >×</button>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            className="input flex-1"
            placeholder="Nome do técnico..."
            value={novoTecnico}
            onChange={e => setNovoTecnico(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && novoTecnico.trim()) {
                setPrecos(prev => ({ ...prev, tecnicos: [...(prev?.tecnicos || DEFAULT_TECNICOS), novoTecnico.trim()] }))
                setNovoTecnico('')
                setSaved(false)
              }
            }}
          />
          <button
            onClick={() => {
              if (!novoTecnico.trim()) return
              setPrecos(prev => ({ ...prev, tecnicos: [...(prev?.tecnicos || DEFAULT_TECNICOS), novoTecnico.trim()] }))
              setNovoTecnico('')
              setSaved(false)
            }}
            className="btn-primary px-4"
          >+ Adicionar</button>
        </div>
      </div>

      {/* Company Info */}
      <div className="card mt-4">
        <h2 className="font-semibold text-gray-700 mb-4 text-sm uppercase tracking-wide">Dados da Empresa</h2>
        <div className="text-sm text-gray-600 space-y-1.5">
          <div><span className="font-medium">Razão Social:</span> T. R. FERRAZ TECNOLOGIA EM IMPERMEABILIZACAO EIRELI ME</div>
          <div><span className="font-medium">Nome Fantasia:</span> Vedafácil</div>
          <div><span className="font-medium">CNPJ:</span> 23.606.470/0001-07</div>
          <div><span className="font-medium">Endereço:</span> Rua Professora Margarida Fialho Thompson Leite, 670</div>
          <div><span className="font-medium">Bairro:</span> Residencial Cristo Redentor — Barra Mansa/RJ</div>
          <div><span className="font-medium">CEP:</span> 27323-755</div>
        </div>
      </div>
    </div>
  )
}
