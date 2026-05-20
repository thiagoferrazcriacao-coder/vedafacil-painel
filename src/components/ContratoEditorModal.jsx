import React, { useEffect, useRef, useState, useCallback } from 'react'
import { api } from '../api/client.js'

// CSS do contrato injetado no editor para preview fiel
const CONTRACT_EDITOR_CSS = `
  .contrato-editor-area {
    font-family: Arial, Helvetica, sans-serif;
    font-size: 10.5px;
    color: #222;
    line-height: 1.6;
    padding: 12mm 22mm;
    min-height: 400px;
    outline: none;
  }
  .contrato-editor-area h2 {
    background: #e87722;
    color: white;
    padding: 6px 14px;
    margin: 16px 0 9px;
    font-size: 11px;
    font-weight: bold;
    border-radius: 2px;
  }
  .contrato-editor-area h2.clause-title {
    background: #e87722;
    color: white;
    padding: 6px 14px;
    margin: 16px 0 9px;
    font-size: 11px;
    font-weight: bold;
    border-radius: 2px;
  }
  .contrato-editor-area .clause {
    margin: 6px 0;
    text-align: justify;
    font-size: 10.5px;
  }
  .contrato-editor-area .clause p {
    margin-bottom: 6px;
    text-indent: 20px;
  }
  .contrato-editor-area p {
    margin-bottom: 6px;
  }
  .contrato-editor-area table {
    width: 100%;
    border-collapse: collapse;
    margin: 8px 0;
    font-size: 10px;
  }
  .contrato-editor-area table th {
    background: #e87722;
    color: white;
    padding: 5px 6px;
    text-align: center;
    font-weight: bold;
  }
  .contrato-editor-area table td {
    border: 1px solid #aaa;
    padding: 4px 6px;
  }
  .contrato-editor-area .sig {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0 50px;
    margin: 40px 0 24px;
    text-align: center;
    font-size: 10px;
  }
  .contrato-editor-area .sig .role {
    color: #333;
    font-weight: bold;
    font-size: 10px;
    margin-bottom: 26mm;
    text-transform: uppercase;
    letter-spacing: .4px;
  }
  .contrato-editor-area .sig .line {
    border-top: 1.5px solid #222;
    padding-top: 6px;
    font-size: 10px;
    line-height: 1.5;
  }
  .contrato-editor-area .pg-content {
    display: block;
  }
`

function ToolbarBtn({ onClick, title, children, active }) {
  return (
    <button
      type="button"
      onMouseDown={e => { e.preventDefault(); onClick() }}
      title={title}
      className={`px-2 py-1 text-sm rounded border border-gray-200 transition-colors ${
        active ? 'bg-primary text-white' : 'bg-white text-gray-700 hover:bg-gray-100'
      }`}
    >
      {children}
    </button>
  )
}

export default function ContratoEditorModal({ contratoId, onClose, onSaved }) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [isCustomizado, setIsCustomizado] = useState(false)
  const [editadoEm, setEditadoEm] = useState(null)
  const [htmlPendente, setHtmlPendente] = useState(null)
  const editorRef = useRef(null)

  // Carrega o HTML bruto do contrato — sem transformações
  useEffect(() => {
    if (!contratoId) return
    setLoading(true)
    setHtmlPendente(null)
    api.getContratoTextoHtml(contratoId)
      .then(({ html, customizado, editadoEm: ea }) => {
        setHtmlPendente(html || '')
        setIsCustomizado(!!customizado)
        setEditadoEm(ea || null)
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [contratoId])

  // Popula o innerHTML DEPOIS que o editor aparece no DOM (loading = false)
  useEffect(() => {
    if (!loading && htmlPendente !== null && editorRef.current) {
      editorRef.current.innerHTML = htmlPendente
    }
  }, [loading, htmlPendente])

  // Salva o innerHTML bruto — sem nenhuma transformação
  const handleSave = useCallback(async () => {
    if (!editorRef.current) return
    setSaving(true)
    setError('')
    try {
      const html = editorRef.current.innerHTML
      await api.updateContrato(contratoId, {
        textoPersonalizado: html,
        textoPersonalizadoAt: Date.now(),
      })
      onSaved?.()
      onClose()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }, [contratoId, onClose, onSaved])

  const handleResetarTemplate = useCallback(async () => {
    if (!confirm('Descartar edições e voltar ao texto automático do contrato?')) return
    setSaving(true)
    setError('')
    try {
      await api.updateContrato(contratoId, {
        textoPersonalizado: null,
        textoPersonalizadoAt: null,
      })
      onSaved?.()
      onClose()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }, [contratoId, onClose, onSaved])

  // Comandos de formatação básicos usando execCommand (preserva HTML existente)
  const exec = (cmd, value = null) => {
    editorRef.current?.focus()
    document.execCommand(cmd, false, value)
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <style>{CONTRACT_EDITOR_CSS}</style>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[95vh] flex flex-col">

        {/* Header */}
        <div className="p-4 border-b flex items-center justify-between flex-shrink-0">
          <div>
            <h2 className="text-lg font-bold text-gray-800">✏️ Editar Texto do Contrato</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Edições ficam salvas e são usadas na geração do PDF. A formatação original é preservada.
              {isCustomizado && editadoEm && (
                <span className="ml-2 text-amber-600 font-medium">
                  ⚠️ Texto customizado · editado em {new Date(editadoEm).toLocaleDateString('pt-BR')}
                </span>
              )}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none ml-4">×</button>
        </div>

        {/* Alerts */}
        {error && (
          <div className="mx-4 mt-3 bg-red-50 border border-red-200 rounded p-3 text-sm text-red-700 flex-shrink-0">{error}</div>
        )}
        {isCustomizado && (
          <div className="mx-4 mt-3 bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800 flex items-center justify-between flex-shrink-0">
            <span>⚠️ Este contrato usa texto personalizado. O PDF usará este texto em vez do modelo padrão.</span>
            <button onClick={handleResetarTemplate} className="ml-3 text-xs underline text-amber-700 hover:text-amber-900 whitespace-nowrap" disabled={saving}>
              Voltar ao padrão
            </button>
          </div>
        )}

        {/* Toolbar */}
        <div className="flex flex-wrap gap-1 px-4 py-2 bg-gray-50 border-b border-gray-200 flex-shrink-0">
          <ToolbarBtn onClick={() => exec('undo')} title="Desfazer">↩</ToolbarBtn>
          <ToolbarBtn onClick={() => exec('redo')} title="Refazer">↪</ToolbarBtn>
          <div className="w-px h-6 bg-gray-300 mx-1 self-center" />
          <ToolbarBtn onClick={() => exec('bold')} title="Negrito"><strong>N</strong></ToolbarBtn>
          <ToolbarBtn onClick={() => exec('italic')} title="Itálico"><em>I</em></ToolbarBtn>
          <ToolbarBtn onClick={() => exec('underline')} title="Sublinhado"><u>U</u></ToolbarBtn>
          <div className="w-px h-6 bg-gray-300 mx-1 self-center" />
          <ToolbarBtn onClick={() => exec('justifyLeft')} title="Alinhar esquerda">⬅</ToolbarBtn>
          <ToolbarBtn onClick={() => exec('justifyCenter')} title="Centralizar">↔</ToolbarBtn>
          <ToolbarBtn onClick={() => exec('justifyRight')} title="Alinhar direita">➡</ToolbarBtn>
          <ToolbarBtn onClick={() => exec('justifyFull')} title="Justificar">☰</ToolbarBtn>
        </div>

        {/* Editor area */}
        <div className="flex-1 overflow-auto mx-4 my-3 border border-gray-200 rounded-lg">
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
              <span className="ml-3 text-gray-500">Carregando texto do contrato...</span>
            </div>
          ) : (
            <div
              ref={editorRef}
              contentEditable
              suppressContentEditableWarning
              className="contrato-editor-area"
              spellCheck="true"
            />
          )}
        </div>

        {/* Dica */}
        <div className="px-4 pb-2 flex-shrink-0">
          <p className="text-xs text-gray-400">
            💡 Clique no texto para editar. Use <strong>N</strong> para negrito, <em>I</em> para itálico. A diagramação (cores, tabelas, layout) é preservada exatamente como no PDF original.
          </p>
        </div>

        {/* Footer */}
        <div className="p-4 border-t flex gap-3 justify-end flex-shrink-0">
          <button onClick={onClose} className="btn-secondary" disabled={saving}>Cancelar</button>
          <button onClick={handleSave} className="btn-primary" disabled={saving || loading}>
            {saving ? 'Salvando...' : '💾 Salvar e fechar'}
          </button>
        </div>
      </div>
    </div>
  )
}
