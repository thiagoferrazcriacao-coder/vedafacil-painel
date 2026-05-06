import React, { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { api } from '../api/client.js'

export default function MedicaoDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [medicao, setMedicao] = useState(null)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [editData, setEditData] = useState(null)
  const [saving, setSaving] = useState(false)
  const [showPartialModal, setShowPartialModal] = useState(false)
  const [selectedLocais, setSelectedLocais] = useState([])
  const [error, setError] = useState('')

  useEffect(() => {
    api.getMedicao(id)
      .then(data => { setMedicao(data); setEditData(data) })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [id])

  const handleEdit = () => {
    setEditData({ ...medicao })
    setEditing(true)
    setError('')
  }

  const handleCancelEdit = () => {
    setEditData({ ...medicao })
    setEditing(false)
    setError('')
  }

  const handleSave = async () => {
    setSaving(true)
    setError('')
    try {
      const updated = await api.updateMedicao(id, editData)
      setMedicao(updated)
      setEditData(updated)
      setEditing(false)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const updateField = (field, value) => {
    setEditData(prev => ({ ...prev, [field]: value }))
  }

  const updateLocal = (idx, field, value) => {
    const locais = [...(editData.locais || [])]
    locais[idx] = { ...locais[idx], [field]: value }
    setEditData(prev => ({ ...prev, locais }))
  }

  // Seleção Integral → cria orçamento com todos os locais
  const handleIntegral = () => {
    navigate(`/orcamentos/novo/${medicao.id}`)
  }

  const handleReabrir = async () => {
    if (!confirm('Reabrir esta medição para que o medidor possa corrigir e reenviar?')) return
    try {
      await api.updateMedicaoStatus(medicao._id || medicao.id, 'reaberta')
      setMedicao(prev => ({ ...prev, status: 'reaberta' }))
    } catch (err) {
      alert('Erro ao reabrir: ' + err.message)
    }
  }

  // Seleção Parcial → abre modal com checklist
  const handleParcial = () => {
    setSelectedLocais((medicao.locais || []).map((_, i) => i))
    setShowPartialModal(true)
  }

  const toggleLocalSelection = (idx) => {
    setSelectedLocais(prev =>
      prev.includes(idx) ? prev.filter(i => i !== idx) : [...prev, idx]
    )
  }

  const confirmarParcial = () => {
    if (selectedLocais.length === 0) {
      alert('Selecione pelo menos um local')
      return
    }
    const locaisIds = selectedLocais.join(',')
    navigate(`/orcamentos/novo/${medicao.id}?locais=${locaisIds}`)
    setShowPartialModal(false)
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
    </div>
  )

  if (!medicao) return (
    <div className="p-6 text-center text-gray-500">Medição não encontrada</div>
  )

  const m = editing ? editData : medicao
  const CAMPOS_IGNORAR = ['nome', 'local', 'fotos', 'trinca', 'juntaFria', 'ralo', 'juntaDilat', 'ferragem', 'cortina', 'juntaGerber', 'mobilizacao']
  const CAMPOS_QUANTIDADES = ['trinca', 'juntaFria', 'ralo', 'juntaDilat', 'ferragem', 'cortina', 'juntaGerber']
  const LABELS_QTDE = {
    trinca: 'Trincas (m)', juntaFria: 'Juntas Frias (m)', ralo: 'Ralos (unid)',
    juntaDilat: 'Juntas Dilatação (m)', ferragem: 'Trat. Ferragens (m)',
    cortina: 'Cortina (m²)', juntaGerber: 'Juntas Gerber (m)'
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6 flex-wrap">
        <button onClick={() => navigate('/medicoes')} className="btn-secondary">
          Voltar
        </button>
        <h1 className="text-xl font-bold text-gray-800">
          Medição #{String(medicao.numeroMedicao || '').padStart(3, '0')}
        </h1>
        <div className="ml-auto flex gap-2 flex-wrap">
          {!editing && (
            <>
              {medicao.status === 'recebida' && (
                <button onClick={handleReabrir} className="btn-secondary text-amber-700 border-amber-300 hover:bg-amber-50">
                  🔓 Reabrir
                </button>
              )}
              <button onClick={handleEdit} className="btn-secondary">
                ✏️ Editar
              </button>
              <button onClick={handleParcial} className="btn-secondary">
                📋 Usar Parcial
              </button>
              <button onClick={handleIntegral} className="btn-primary">
                ✅ Usar Integral
              </button>
            </>
          )}
          {editing && (
            <>
              <button onClick={handleCancelEdit} className="btn-secondary" disabled={saving}>
                Cancelar
              </button>
              <button onClick={handleSave} className="btn-primary" disabled={saving}>
                {saving ? 'Salvando...' : '💾 Salvar'}
              </button>
            </>
          )}
        </div>
      </div>

      {error && (
        <div className="bg-red-50 text-red-700 border border-red-200 rounded-lg p-3 mb-4 text-sm">{error}</div>
      )}

      {editing && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4 text-sm text-blue-700">
          ✏️ Modo de edição ativo — altere os dados e clique em Salvar
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-4">
        {/* Dados do Cliente */}
        <div className="card">
          <h2 className="font-semibold mb-3 text-primary">Cliente</h2>
          {editing ? (
            <div className="space-y-3">
              {[
                ['cliente', 'Nome / Condomínio', 'text'],
                ['ac', 'AC (Responsável)', 'text'],
                ['endereco', 'Endereço', 'text'],
                ['cidade', 'Cidade', 'text'],
                ['cep', 'CEP', 'text'],
                ['celular', 'Celular', 'text'],
              ].map(([field, label]) => (
                <div key={field}>
                  <label className="label">{label}</label>
                  <input
                    className="input"
                    value={editData[field] || editData[field === 'cliente' ? 'nomeCliente' : field === 'celular' ? 'telefone' : field] || ''}
                    onChange={e => updateField(field, e.target.value)}
                  />
                </div>
              ))}
            </div>
          ) : (
            <dl className="space-y-2 text-sm">
              {[
                ['Nome', m.cliente || m.nomeCliente],
                ['AC', m.ac],
                ['Endereço', m.endereco],
                ['Cidade', m.cidade],
                ['CEP', m.cep],
                ['Celular', m.celular || m.telefone]
              ].map(([k, v]) => v ? (
                <div key={k} className="flex gap-2">
                  <dt className="font-medium text-gray-500 w-24 flex-shrink-0">{k}:</dt>
                  <dd className="text-gray-800">{v}</dd>
                </div>
              ) : null)}
            </dl>
          )}
        </div>

        {/* Informações */}
        <div className="card">
          <h2 className="font-semibold mb-3 text-primary">Informações</h2>
          <dl className="space-y-2 text-sm">
            {[
              ['Medidor', medicao.user || medicao.medidor],
              ['Data', (medicao.createdAt || medicao.receivedAt) ? new Date(medicao.createdAt || medicao.receivedAt).toLocaleString('pt-BR') : null],
              ['Status', medicao.status],
              ['Locais', Array.isArray(medicao.locais) ? `${medicao.locais.length} locais` : null],
              ['Fotos', (() => { const n = (medicao.locais||[]).reduce((a,l) => a + (l.fotos||[]).length, 0); return n > 0 ? `${n} fotos` : null })()]
            ].map(([k, v]) => v ? (
              <div key={k} className="flex gap-2">
                <dt className="font-medium text-gray-500 w-24 flex-shrink-0">{k}:</dt>
                <dd className="text-gray-800 capitalize">{v}</dd>
              </div>
            ) : null)}
          </dl>
        </div>

        {/* Locais */}
        {Array.isArray(m.locais) && m.locais.length > 0 && (
          <div className="card md:col-span-2">
            <h2 className="font-semibold mb-3 text-primary">Locais Medidos</h2>
            <div className="grid sm:grid-cols-2 gap-3">
              {m.locais.map((local, i) => (
                <div key={i} className="bg-gray-50 rounded-lg p-3 text-sm">
                  <div className="font-medium mb-2 text-gray-700">
                    {local.nome || local.local || `Local ${i + 1}`}
                  </div>
                  {/* Quantidades editáveis */}
                  {CAMPOS_QUANTIDADES.map(campo => {
                    const val = local[campo]
                    if (!editing && (!val || val === 0)) return null
                    if (!editing) return (
                      <div key={campo} className="text-gray-600">
                        <span className="font-medium">{LABELS_QTDE[campo]}:</span>{' '}
                        {Array.isArray(val) ? val.join(' + ') + ` = ${val.reduce((a,b)=>a+parseFloat(b||0),0)}` : val}
                      </div>
                    )
                    return (
                      <div key={campo} className="mb-1">
                        <label className="text-xs text-gray-500">{LABELS_QTDE[campo]}</label>
                        <input
                          type="number"
                          className="input py-1 text-sm"
                          value={Array.isArray(local[campo]) ? local[campo].reduce((a,b)=>a+parseFloat(b||0),0) : (local[campo] || 0)}
                          onChange={e => updateLocal(i, campo, parseFloat(e.target.value) || 0)}
                        />
                      </div>
                    )
                  })}
                  {/* Outros campos */}
                  {!editing && Object.entries(local)
                    .filter(([k]) => !CAMPOS_IGNORAR.includes(k))
                    .map(([k, v]) => (
                      <div key={k} className="text-gray-500">
                        <span className="font-medium">{k}:</span> {String(v)}
                      </div>
                    ))
                  }
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Fotos */}
        {(medicao.locais || []).some(l => l.fotos && l.fotos.length > 0) && (
          <div className="card md:col-span-2">
            <h2 className="font-semibold mb-3 text-primary">Fotos por Local</h2>
            {(medicao.locais || []).filter(l => l.fotos && l.fotos.length > 0).map((local, li) => (
              <div key={li} className="mb-4">
                <h3 className="text-sm font-medium text-gray-600 mb-2">
                  {local.nome || `Local ${li+1}`} ({local.fotos.length} fotos)
                </h3>
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
                  {local.fotos.map((foto, i) => (
                    <img key={i} src={foto.data || foto.url || foto} alt={`Foto ${i+1}`}
                      className="w-full aspect-square object-cover rounded-lg cursor-pointer"
                      onClick={() => window.open(foto.data || foto.url || foto, '_blank')} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal Seleção Parcial */}
      {showPartialModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full max-h-[80vh] flex flex-col">
            <div className="p-5 border-b">
              <h2 className="text-lg font-bold text-gray-800">Seleção Parcial de Locais</h2>
              <p className="text-sm text-gray-500 mt-1">
                Selecione os locais que farão parte do orçamento
              </p>
            </div>

            <div className="p-5 overflow-auto flex-1">
              <div className="flex justify-between mb-3">
                <button
                  className="text-xs text-primary underline"
                  onClick={() => setSelectedLocais((medicao.locais||[]).map((_,i)=>i))}
                >
                  Selecionar todos
                </button>
                <button
                  className="text-xs text-gray-500 underline"
                  onClick={() => setSelectedLocais([])}
                >
                  Limpar seleção
                </button>
              </div>
              <div className="space-y-2">
                {(medicao.locais || []).map((local, i) => {
                  const isSelected = selectedLocais.includes(i)
                  // Calcular total do local
                  const CAMPOS_QT = ['trinca','juntaFria','ralo','juntaDilat','ferragem','cortina','juntaGerber']
                  const totais = CAMPOS_QT.filter(c => local[c] && local[c] !== 0)
                    .map(c => {
                      const v = local[c]
                      const qt = Array.isArray(v) ? v.reduce((a,b)=>a+parseFloat(b||0),0) : parseFloat(v||0)
                      return `${qt} ${LABELS_QTDE[c]?.match(/\((.*?)\)/)?.[1] || ''}`
                    })
                  return (
                    <label key={i}
                      className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                        isSelected ? 'border-primary bg-blue-50' : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <input
                        type="checkbox"
                        className="mt-0.5 accent-primary"
                        checked={isSelected}
                        onChange={() => toggleLocalSelection(i)}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-gray-800 text-sm">
                          {local.nome || local.local || `Local ${i + 1}`}
                        </div>
                        {totais.length > 0 && (
                          <div className="text-xs text-gray-500 mt-0.5">{totais.join(' · ')}</div>
                        )}
                      </div>
                    </label>
                  )
                })}
              </div>
            </div>

            <div className="p-5 border-t flex gap-3 justify-end">
              <button onClick={() => setShowPartialModal(false)} className="btn-secondary">
                Cancelar
              </button>
              <button onClick={confirmarParcial} className="btn-primary">
                Gerar Orçamento ({selectedLocais.length} locais)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
