import React, { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../App.jsx'

const API = '/api'

// ── Helpers ───────────────────────────────────────────────────────────────────
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = e => resolve(e.target.result)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

// Comprime imagem para JPEG ~1200px de largura máx e qualidade 0.72
// Mantém PDFs/outros formatos intactos
function compressImage(file, maxDim = 1200, quality = 0.72) {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) return fileToBase64(file).then(resolve, reject)
    const reader = new FileReader()
    reader.onerror = reject
    reader.onload = e => {
      const img = new Image()
      img.onerror = reject
      img.onload = () => {
        let { width, height } = img
        if (width > maxDim || height > maxDim) {
          const ratio = Math.min(maxDim / width, maxDim / height)
          width  = Math.round(width  * ratio)
          height = Math.round(height * ratio)
        }
        const canvas = document.createElement('canvas')
        canvas.width = width; canvas.height = height
        const ctx = canvas.getContext('2d')
        ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, width, height)
        ctx.drawImage(img, 0, 0, width, height)
        resolve(canvas.toDataURL('image/jpeg', quality))
      }
      img.src = e.target.result
    }
    reader.readAsDataURL(file)
  })
}

async function filesToBase64(files) {
  // Comprime imagens; PDFs e outros passam direto
  return Promise.all(Array.from(files).map(f => compressImage(f)))
}

// Tamanho do payload JSON em bytes (aproximado)
function payloadSize(obj) {
  try { return new Blob([JSON.stringify(obj)]).size } catch { return 0 }
}
function fmtMB(bytes) { return (bytes / (1024 * 1024)).toFixed(2) + ' MB' }

// ── UI Components ─────────────────────────────────────────────────────────────
function StepBar({ step }) {
  const steps = ['Orçamento', 'Contrato', 'Confirmar']
  return (
    <div className="flex items-center gap-0 mb-8">
      {steps.map((label, i) => {
        const n = i + 1
        const active = step === n
        const done = step > n
        return (
          <React.Fragment key={n}>
            <div className="flex flex-col items-center flex-1">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold border-2 transition-all ${
                done   ? 'bg-green-500 border-green-500 text-white' :
                active ? 'bg-[#e87722] border-[#e87722] text-white' :
                         'bg-white border-gray-300 text-gray-400'
              }`}>
                {done ? '✓' : n}
              </div>
              <span className={`text-xs mt-1 font-medium ${active ? 'text-[#e87722]' : done ? 'text-green-600' : 'text-gray-400'}`}>
                {label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div className={`h-0.5 flex-1 mt-[-12px] transition-all ${done ? 'bg-green-500' : 'bg-gray-200'}`} />
            )}
          </React.Fragment>
        )
      })}
    </div>
  )
}

function DropZone({ accept, label, hint, onFile, fileName, loading }) {
  const inputRef = useRef()
  const [dragging, setDragging] = useState(false)
  const handleDrop = e => {
    e.preventDefault(); setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) onFile(file)
  }
  return (
    <div
      className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${
        dragging ? 'border-[#e87722] bg-orange-50' :
        fileName  ? 'border-green-400 bg-green-50' :
                    'border-gray-300 hover:border-[#e87722] hover:bg-orange-50'
      }`}
      onClick={() => inputRef.current?.click()}
      onDragOver={e => { e.preventDefault(); setDragging(true) }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
    >
      <input ref={inputRef} type="file" accept={accept} className="hidden"
        onChange={e => { if (e.target.files[0]) onFile(e.target.files[0]) }} />
      {loading ? (
        <div className="flex flex-col items-center gap-2">
          <div className="w-8 h-8 border-4 border-[#e87722] border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-gray-500">Processando com IA...</p>
        </div>
      ) : fileName ? (
        <div className="flex flex-col items-center gap-2">
          <span className="text-3xl">✅</span>
          <p className="text-sm font-medium text-green-700">{fileName}</p>
          <p className="text-xs text-gray-500">Clique para trocar</p>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-2">
          <span className="text-3xl">📂</span>
          <p className="text-sm font-semibold text-gray-700">{label}</p>
          <p className="text-xs text-gray-400">{hint}</p>
        </div>
      )}
    </div>
  )
}

function FieldRow({ label, value, onChange, type = 'text' }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</label>
      <input type={type} value={value || ''} onChange={e => onChange(e.target.value)}
        className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#e87722]" />
    </div>
  )
}

// ── MultiSumField — múltiplos inputs somados (igual PWA medidor) ─────────────
// Permite digitar 2 + 1 + 3 = 6m. Botão + adiciona input, × remove (mín. 1).
function MultiSumField({ label, un, partes, onChange }) {
  // Garante array com pelo menos 1 parte
  const arr = Array.isArray(partes) && partes.length > 0 ? partes : ['']
  const total = arr.reduce((s, v) => s + (Number(v) || 0), 0)
  const setPart = (i, v) => onChange(arr.map((p, j) => j === i ? v : p))
  const addPart = () => onChange([...arr, ''])
  const removePart = (i) => onChange(arr.length <= 1 ? [''] : arr.filter((_, j) => j !== i))

  return (
    <div className="bg-gray-50 border border-gray-200 rounded-lg p-2">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[11px] font-medium text-gray-600">
          {label} <span className="text-gray-400">({un})</span>
        </span>
        <span className="text-xs font-bold text-[#e87722]">
          {total > 0 ? `= ${total.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} ${un}` : ''}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-1">
        {arr.map((v, i) => (
          <React.Fragment key={i}>
            {i > 0 && <span className="text-gray-400 text-sm font-bold">+</span>}
            <div className="relative">
              <input
                type="number"
                step="0.1"
                min="0"
                inputMode="decimal"
                placeholder="0"
                className="w-16 border border-gray-300 rounded px-1.5 py-1 text-xs text-center focus:outline-none focus:ring-1 focus:ring-[#e87722]"
                value={v ?? ''}
                onChange={e => setPart(i, e.target.value)}
              />
              {arr.length > 1 && (
                <button
                  type="button"
                  onClick={() => removePart(i)}
                  className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-red-500 text-white text-[10px] rounded-full font-bold flex items-center justify-center leading-none hover:bg-red-600"
                  title="Remover este valor"
                >×</button>
              )}
            </div>
          </React.Fragment>
        ))}
        <button
          type="button"
          onClick={addPart}
          className="ml-1 w-6 h-6 bg-orange-100 text-orange-700 rounded-full font-bold text-sm hover:bg-orange-200 flex items-center justify-center leading-none"
          title="Adicionar mais um valor"
        >+</button>
      </div>
    </div>
  )
}

// ── LocalCard — local do orçamento com upload de fotos + soma múltipla ───────
const CAMPOS_MEDIDA = [
  { campo: 'trinca',     label: 'Trincas',     un: 'm'   },
  { campo: 'juntaFria',  label: 'Juntas Frias', un: 'm'   },
  { campo: 'ralo',       label: 'Ralos',       un: 'un'  },
  { campo: 'juntaDilat', label: 'Jt. Dilatação', un: 'm'   },
  { campo: 'ferragem',   label: 'Ferragens',   un: 'm'   },
  { campo: 'cortina',    label: 'Cortinas',    un: 'm²'  },
]

function LocalCard({ local, idx, onChange, onFotosAdd, onFotoRemove }) {
  const fotoInputRef = useRef()

  async function handleFotoChange(e) {
    const b64s = await filesToBase64(e.target.files)
    onFotosAdd(idx, b64s)
    e.target.value = ''
  }

  // Atualiza parcelas E o total (Number) que vai pro backend
  function updatePartes(campo, partes) {
    const total = partes.reduce((s, v) => s + (Number(v) || 0), 0)
    onChange(idx, '_partes', { ...(local._partes || {}), [campo]: partes })
    onChange(idx, campo, total > 0 ? total : null)
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
      {/* Nome do local */}
      <input
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-[#e87722]"
        value={local.nome || ''}
        placeholder="Nome do local"
        onChange={e => onChange(idx, 'nome', e.target.value)}
      />

      {/* Medidas — agora com soma múltipla (igual PWA medidor) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
        {CAMPOS_MEDIDA.map(({ campo, label, un }) => {
          // Se já tem partes salvas usa, senão inicializa com o total atual como única parte
          const partes = local._partes?.[campo] ?? (local[campo] != null ? [String(local[campo])] : [''])
          return (
            <MultiSumField
              key={campo}
              label={label}
              un={un}
              partes={partes}
              onChange={novasPartes => updatePartes(campo, novasPartes)}
            />
          )
        })}
      </div>

      {/* Fotos */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xs font-medium text-gray-500">
            Fotos ({(local.fotos || []).length})
          </span>
          <button
            type="button"
            onClick={() => fotoInputRef.current?.click()}
            className="text-xs px-2.5 py-1 bg-orange-100 text-orange-700 rounded-lg hover:bg-orange-200 font-semibold transition-colors flex items-center gap-1"
          >
            📷 Adicionar fotos
          </button>
          <input
            ref={fotoInputRef} type="file" accept="image/*" multiple className="hidden"
            onChange={handleFotoChange}
          />
        </div>

        {(local.fotos || []).length > 0 && (
          <div className="flex flex-wrap gap-2">
            {(local.fotos || []).map((f, j) => (
              <div key={j} className="relative group">
                <img src={f} alt="" className="w-16 h-16 object-cover rounded-lg border border-gray-200" />
                <button
                  type="button"
                  onClick={() => onFotoRemove(idx, j)}
                  className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white rounded-full text-xs font-bold opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center leading-none"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function IntegracaoPage() {
  const { token } = useAuth()
  const navigate = useNavigate()
  const [step, setStep] = useState(1)

  // Step 1 — Orçamento
  const [orcFile, setOrcFile]       = useState(null)
  const [orcLoading, setOrcLoading] = useState(false)
  const [orcDados, setOrcDados]     = useState(null)   // dados do PDF
  const [locais, setLocais]         = useState([])      // locais com fotos
  const [orcError, setOrcError]     = useState('')

  // Step 1.5 — Relatório fotográfico (Word) — opcional
  const [relFile, setRelFile]       = useState(null)
  const [relLoading, setRelLoading] = useState(false)
  const [relError, setRelError]     = useState('')
  const [relInfo, setRelInfo]       = useState(null) // { totalFotos, locaisMatched, locaisNaoMatched }

  // Step 2 — Contrato
  const [cttFile, setCttFile]       = useState(null)
  const [cttLoading, setCttLoading] = useState(false)
  const [cttDados, setCttDados]     = useState(null)
  const [cttError, setCttError]     = useState('')

  // Step 3 — Resultado
  const [criando, setCriando]       = useState(false)
  const [resultado, setResultado]   = useState(null)
  const [criarError, setCriarError] = useState('')

  const authHeader = { Authorization: `Bearer ${token}` }

  async function apiFetch(url, body) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeader },
      body: JSON.stringify(body)
    })
    const text = await res.text()
    let data
    try { data = JSON.parse(text) } catch {
      if (res.status === 413 || text.includes('Entity Too Large'))
        throw new Error('Arquivo muito grande para o servidor (limite ~4.5 MB).')
      throw new Error(`Erro do servidor (${res.status}): ${text.slice(0, 150)}`)
    }
    if (!res.ok) throw new Error(data.error || `Erro ${res.status}`)
    return data
  }

  // ── Step 1: extrair orçamento ─────────────────────────────────────────────
  async function extrairOrcamento(file) {
    setOrcFile(file); setOrcError(''); setOrcLoading(true)
    try {
      const base64 = await fileToBase64(file)
      const data = await apiFetch(`${API}/integracao/extrair-orcamento`, { pdf: base64 })
      if (!data.dados || typeof data.dados !== 'object') throw new Error('Resposta inválida do servidor')
      setOrcDados(data.dados)
      // Inicializa locais com fotos vazias
      setLocais((data.dados.locais || []).map(l => ({ ...l, fotos: [] })))
    } catch (e) { setOrcError(e.message); setOrcFile(null) }
    finally { setOrcLoading(false) }
  }

  function updateLocal(idx, campo, valor) {
    setLocais(ls => ls.map((l, i) => i === idx ? { ...l, [campo]: valor } : l))
  }

  function addFotos(idx, b64s) {
    setLocais(ls => ls.map((l, i) => i === idx ? { ...l, fotos: [...(l.fotos || []), ...b64s] } : l))
  }

  function removeFoto(idx, fotoIdx) {
    setLocais(ls => ls.map((l, i) =>
      i === idx ? { ...l, fotos: l.fotos.filter((_, j) => j !== fotoIdx) } : l
    ))
  }

  // ── Step 1.5: extrair fotos do Word do relatório fotográfico ──────────────
  // Faz matching com locais já extraídos do orçamento usando string normalizada.
  function normalize(s) {
    return String(s || '').toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ').trim()
  }

  async function extrairRelatorio(file) {
    setRelFile(file); setRelError(''); setRelLoading(true); setRelInfo(null)
    try {
      const base64 = await fileToBase64(file)
      const data = await apiFetch(`${API}/integracao/extrair-relatorio`, { docx: base64 })
      if (!data.locais || data.locais.length === 0) {
        throw new Error('Nenhum local com fotos encontrado no arquivo')
      }

      // Faz matching dos blocos extraídos com os locais já existentes
      const matched = []
      const naoMatched = []
      const novosLocais = locais.map(l => ({ ...l }))

      data.locais.forEach(bloco => {
        const blocoNorm = normalize(bloco.nome)
        // Procura local existente com nome similar
        const idxMatch = novosLocais.findIndex(l => {
          const ln = normalize(l.nome)
          return ln === blocoNorm
              || ln.includes(blocoNorm)
              || blocoNorm.includes(ln)
              // ou match por palavras-chave (mín 2 palavras em comum)
              || (() => {
                const wordsA = blocoNorm.split(' ').filter(w => w.length > 2)
                const wordsB = ln.split(' ').filter(w => w.length > 2)
                const inter = wordsA.filter(w => wordsB.includes(w))
                return inter.length >= 2
              })()
        })

        if (idxMatch >= 0) {
          // Vincula fotos ao local existente
          const existing = novosLocais[idxMatch].fotos || []
          novosLocais[idxMatch] = { ...novosLocais[idxMatch], fotos: [...existing, ...bloco.fotos] }
          matched.push({ relName: bloco.nome, locName: novosLocais[idxMatch].nome, fotos: bloco.fotos.length })
        } else {
          // Cria novo local com as fotos (usuário pode renomear/ajustar)
          novosLocais.push({ nome: bloco.nome, fotos: bloco.fotos })
          naoMatched.push({ relName: bloco.nome, fotos: bloco.fotos.length })
        }
      })

      setLocais(novosLocais)
      setRelInfo({
        totalFotos: data.totalFotos || data.locais.reduce((s, l) => s + l.fotos.length, 0),
        locaisMatched: matched,
        locaisNaoMatched: naoMatched,
      })
    } catch (e) {
      setRelError(e.message)
      setRelFile(null)
    } finally {
      setRelLoading(false)
    }
  }

  // ── Step 2: extrair contrato ──────────────────────────────────────────────
  async function extrairContrato(file) {
    setCttFile(file); setCttError(''); setCttLoading(true)
    try {
      const base64 = await fileToBase64(file)
      const data = await apiFetch(`${API}/integracao/extrair-contrato`, { pdf: base64 })
      setCttDados(data.dados)
    } catch (e) { setCttError(e.message); setCttFile(null) }
    finally { setCttLoading(false) }
  }

  // ── Step 3: criar registros ───────────────────────────────────────────────
  // Estratégia para evitar limite de 4.5MB do Vercel:
  //   1) Primeiro POST cria medição+orçamento+contrato SEM fotos (payload pequeno)
  //   2) Depois envia fotos por local em chamadas separadas, agrupadas em lotes
  //      respeitando ~3MB por requisição
  const [criandoStatus, setCriandoStatus] = useState('')
  async function criarRegistros() {
    setCriarError(''); setCriando(true); setCriandoStatus('Criando medição, orçamento e contrato...')
    try {
      // Remove o campo auxiliar de soma múltipla antes de enviar
      const limparLocal = (l) => {
        const { fotos, _partes, ...rest } = l
        return rest
      }
      const dadosOrcamento = {
        ...orcDados,
        locais: locais.map(limparLocal),
      }
      // Etapa 1 — cria sem fotos. Se houver número original (contrato antigo),
      // mantém ele em toda a cadeia (medição/orçamento/contrato/OS/garantia)
      const data = await apiFetch(`${API}/integracao/criar`, {
        dadosOrcamento,
        dadosContrato: cttDados,
        locaisComFotos: locais.map(l => ({ nome: l.nome, fotos: [] })),
        numeroOriginal: cttDados?.numeroContrato || null,
      })

      // Etapa 2 — upload das fotos por local em lotes pequenos
      const LIMITE = 3 * 1024 * 1024 // 3MB por requisição
      const locaisComFotos = locais.filter(l => (l.fotos || []).length > 0)
      let enviadas = 0
      const totalFotos = locaisComFotos.reduce((s, l) => s + l.fotos.length, 0)

      for (const local of locaisComFotos) {
        const fotos = local.fotos
        // Divide fotos do local em batches que respeitem o limite
        let batch = []
        let batchSize = 0
        for (let i = 0; i < fotos.length; i++) {
          const fotoSize = new Blob([fotos[i]]).size
          if (batch.length > 0 && batchSize + fotoSize > LIMITE) {
            setCriandoStatus(`Enviando fotos: ${enviadas}/${totalFotos}...`)
            await apiFetch(`${API}/integracao/adicionar-fotos`, {
              medicaoId: data.medicaoId,
              nomeLocal: local.nome,
              fotos: batch,
            })
            enviadas += batch.length
            batch = []
            batchSize = 0
          }
          batch.push(fotos[i])
          batchSize += fotoSize
        }
        if (batch.length > 0) {
          setCriandoStatus(`Enviando fotos: ${enviadas}/${totalFotos}...`)
          await apiFetch(`${API}/integracao/adicionar-fotos`, {
            medicaoId: data.medicaoId,
            nomeLocal: local.nome,
            fotos: batch,
          })
          enviadas += batch.length
        }
      }

      setCriandoStatus('')
      setResultado(data)
    } catch (e) { setCriarError(e.message); setCriandoStatus('') }
    finally { setCriando(false) }
  }

  // ── Step 1 render ─────────────────────────────────────────────────────────
  const renderStep1 = () => (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-gray-800 mb-1">📄 PDF do Orçamento</h2>
        <p className="text-sm text-gray-500">
          Suba o PDF do orçamento. A IA extrai cliente, locais e medidas.
          Depois você adiciona as fotos manualmente em cada local — elas formarão o relatório fotográfico.
        </p>
      </div>

      <DropZone accept=".pdf,application/pdf"
        label="Arraste ou clique para selecionar o PDF do Orçamento"
        hint="Somente arquivos .pdf"
        onFile={extrairOrcamento} fileName={orcFile?.name} loading={orcLoading} />

      {orcError && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">❌ {orcError}</div>
      )}

      {orcDados && (
        <div className="space-y-4">
          {/* Dados do cliente */}
          <div className="bg-green-50 border border-green-200 rounded-xl p-4 space-y-3">
            <h3 className="font-semibold text-green-800">✅ Dados extraídos — revise se necessário</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <FieldRow label="Cliente" value={orcDados.cliente}
                onChange={v => setOrcDados(d => ({...d, cliente: v}))} />
              <FieldRow label="Endereço" value={orcDados.endereco}
                onChange={v => setOrcDados(d => ({...d, endereco: v}))} />
              <FieldRow label="Bairro" value={orcDados.bairro}
                onChange={v => setOrcDados(d => ({...d, bairro: v}))} />
              <FieldRow label="Cidade" value={orcDados.cidade}
                onChange={v => setOrcDados(d => ({...d, cidade: v}))} />
              <FieldRow label="CEP" value={orcDados.cep}
                onChange={v => setOrcDados(d => ({...d, cep: v}))} />
              <FieldRow label="Responsável (AC/Síndico)" value={orcDados.ac}
                onChange={v => setOrcDados(d => ({...d, ac: v}))} />
              <FieldRow label="Celular" value={orcDados.celular}
                onChange={v => setOrcDados(d => ({...d, celular: v}))} />
              <FieldRow label="Data Orçamento (YYYY-MM-DD)" value={orcDados.dataOrcamento}
                onChange={v => setOrcDados(d => ({...d, dataOrcamento: v}))} />
              <FieldRow label="Garantia (anos)" value={orcDados.garantia} type="number"
                onChange={v => setOrcDados(d => ({...d, garantia: Number(v)}))} />
              <FieldRow label="Total Bruto (R$)" value={orcDados.totalBruto} type="number"
                onChange={v => setOrcDados(d => ({...d, totalBruto: Number(v)}))} />
            </div>
          </div>

          {/* Relatório fotográfico — auto-match com locais */}
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-3">
            <div>
              <h3 className="font-semibold text-blue-900">📸 Relatório Fotográfico (opcional)</h3>
              <p className="text-xs text-blue-700 mt-1">
                Suba o <strong>Word do relatório fotográfico</strong> (.docx) e o sistema vai puxar as fotos
                automaticamente para cada local pelo nome. Você ainda pode anexar/remover manualmente depois.
              </p>
            </div>

            <DropZone
              accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              label="Arraste ou clique para selecionar o Word do Relatório"
              hint="Somente arquivos .docx · as fotos vão para os locais com nome correspondente"
              onFile={extrairRelatorio}
              fileName={relFile?.name}
              loading={relLoading}
            />

            {relError && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-2 text-xs text-red-700">
                ❌ {relError}
              </div>
            )}

            {relInfo && (
              <div className="bg-white border border-blue-200 rounded-lg p-3 text-sm space-y-2">
                <div className="font-semibold text-blue-900">
                  ✅ {relInfo.totalFotos} foto(s) extraída(s) do relatório
                </div>
                {relInfo.locaisMatched.length > 0 && (
                  <div>
                    <div className="text-xs font-medium text-green-700 mb-1">
                      🎯 {relInfo.locaisMatched.length} local(is) vinculado(s) automaticamente:
                    </div>
                    <ul className="text-xs space-y-0.5 ml-3">
                      {relInfo.locaisMatched.map((m, i) => (
                        <li key={i} className="text-gray-700">
                          • <span className="text-green-700 font-medium">{m.relName}</span>
                          {' '}→ <span className="text-gray-900">{m.locName}</span>
                          {' '}<span className="text-gray-500">({m.fotos} fotos)</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {relInfo.locaisNaoMatched.length > 0 && (
                  <div>
                    <div className="text-xs font-medium text-amber-700 mb-1">
                      ⚠️ {relInfo.locaisNaoMatched.length} local(is) sem correspondência — foram adicionados como novos:
                    </div>
                    <ul className="text-xs space-y-0.5 ml-3">
                      {relInfo.locaisNaoMatched.map((m, i) => (
                        <li key={i} className="text-amber-700">
                          • {m.relName} <span className="text-gray-500">({m.fotos} fotos)</span>
                        </li>
                      ))}
                    </ul>
                    <p className="text-[11px] text-gray-500 italic mt-1">
                      Você pode renomear ou apagar esses locais nos cards abaixo.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Locais com fotos */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-gray-800">
                📍 Locais ({locais.length})
                {locais.some(l => l.fotos?.length > 0) && (
                  <span className="ml-2 text-sm font-normal text-gray-500">
                    — {locais.reduce((s, l) => s + (l.fotos?.length || 0), 0)} foto(s) adicionada(s)
                  </span>
                )}
              </h3>
            </div>
            <div className="space-y-3">
              {locais.map((l, i) => (
                <LocalCard key={i} local={l} idx={i}
                  onChange={updateLocal}
                  onFotosAdd={addFotos}
                  onFotoRemove={removeFoto}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="flex justify-end">
        <button onClick={() => setStep(2)} disabled={!orcDados}
          className="px-6 py-2.5 bg-[#e87722] text-white rounded-lg font-semibold disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#d06a1a] transition-colors">
          Próximo →
        </button>
      </div>
    </div>
  )

  // ── Step 2 render ─────────────────────────────────────────────────────────
  const renderStep2 = () => (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-gray-800 mb-1">📝 PDF do Contrato</h2>
        <p className="text-sm text-gray-500">
          Suba o PDF do contrato assinado — <strong>somente até a página das assinaturas</strong>, sem o relatório fotográfico.
          A IA extrai CNPJ, CPF, datas e parcelas. <span className="text-gray-400">(Opcional — pode pular)</span>
        </p>
      </div>

      <DropZone accept=".pdf,application/pdf"
        label="Arraste ou clique para selecionar o PDF do Contrato"
        hint="Somente arquivos .pdf · até a página das assinaturas"
        onFile={extrairContrato} fileName={cttFile?.name} loading={cttLoading} />

      {cttError && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">❌ {cttError}</div>
      )}

      {cttDados && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 space-y-3">
          <h3 className="font-semibold text-green-800">✅ Dados extraídos — revise se necessário</h3>

          {/* Número do Contrato (original) — usado em toda a cadeia */}
          <div className="bg-amber-50 border-2 border-amber-300 rounded-lg p-3">
            <label className="block text-xs font-bold text-amber-800 uppercase tracking-wide mb-1">
              🔢 Número do Contrato (original)
            </label>
            <div className="flex items-center gap-2 flex-wrap">
              <input
                type="number"
                value={cttDados.numeroContrato || ''}
                onChange={e => setCttDados(d => ({...d, numeroContrato: e.target.value ? parseInt(e.target.value, 10) : null}))}
                placeholder="Ex: 2205"
                className="w-32 px-3 py-2 border-2 border-amber-400 rounded-lg text-lg font-bold text-amber-900 bg-white focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
              <div className="text-xs text-amber-700 flex-1 min-w-[200px]">
                <strong>Mesmo número</strong> vai pra medição, orçamento, contrato, OS e garantia.<br/>
                Deixe <strong>vazio</strong> para usar a numeração automática do sistema.
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <FieldRow label="Razão Social" value={cttDados.razaoSocial}
              onChange={v => setCttDados(d => ({...d, razaoSocial: v}))} />
            <FieldRow label="CNPJ do Cliente" value={cttDados.cnpjCliente}
              onChange={v => setCttDados(d => ({...d, cnpjCliente: v}))} />
            <FieldRow label="CPF do Responsável" value={cttDados.cpfResponsavel}
              onChange={v => setCttDados(d => ({...d, cpfResponsavel: v}))} />
            <FieldRow label="RG do Responsável" value={cttDados.rgResponsavel}
              onChange={v => setCttDados(d => ({...d, rgResponsavel: v}))} />
            <FieldRow label="Síndico" value={cttDados.sindico}
              onChange={v => setCttDados(d => ({...d, sindico: v}))} />
            <FieldRow label="Data Assinatura (YYYY-MM-DD)" value={cttDados.dataAssinatura}
              onChange={v => setCttDados(d => ({...d, dataAssinatura: v}))} />
            <FieldRow label="Data Início (YYYY-MM-DD)" value={cttDados.dataInicio}
              onChange={v => setCttDados(d => ({...d, dataInicio: v}))} />
            <FieldRow label="Data Término (YYYY-MM-DD)" value={cttDados.dataTermino}
              onChange={v => setCttDados(d => ({...d, dataTermino: v}))} />
            <FieldRow label="Garantia (anos)" value={cttDados.garantia} type="number"
              onChange={v => setCttDados(d => ({...d, garantia: Number(v)}))} />
            <FieldRow label="Total Líquido (R$)" value={cttDados.totalLiquido} type="number"
              onChange={v => setCttDados(d => ({...d, totalLiquido: Number(v)}))} />
            <FieldRow label="Parcelas" value={cttDados.parcelas} type="number"
              onChange={v => setCttDados(d => ({...d, parcelas: Number(v)}))} />
            <FieldRow label="Valor por Parcela (R$)" value={cttDados.valorParcela} type="number"
              onChange={v => setCttDados(d => ({...d, valorParcela: Number(v)}))} />
          </div>
        </div>
      )}

      <div className="flex justify-between">
        <button onClick={() => setStep(1)}
          className="px-5 py-2.5 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition-colors">
          ← Voltar
        </button>
        <button onClick={() => setStep(3)}
          className="px-6 py-2.5 bg-[#e87722] text-white rounded-lg font-semibold hover:bg-[#d06a1a] transition-colors">
          Revisar →
        </button>
      </div>
    </div>
  )

  // ── Step 3 render ─────────────────────────────────────────────────────────
  const renderStep3 = () => {
    if (resultado) {
      return (
        <div className="space-y-6">
          <div className="bg-green-50 border border-green-300 rounded-xl p-6 text-center">
            <div className="text-5xl mb-3">🎉</div>
            <h2 className="text-xl font-bold text-green-800 mb-1">Integração concluída!</h2>
            <p className="text-sm text-gray-600">
              Registros criados com o badge{' '}
              <span className="bg-orange-100 text-orange-700 px-2 py-0.5 rounded font-semibold text-xs">🔗 Integração</span>
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              { icon: '📐', label: 'Medição', num: resultado.numeroMedicao, path: `/medicoes/${resultado.medicaoId}` },
              { icon: '📄', label: 'Orçamento', num: resultado.numeroOrcamento, path: `/orcamentos/${resultado.orcamentoId}` },
              { icon: '📋', label: 'Contrato', num: resultado.numeroOrcamento, path: `/contratos/${resultado.contratoId}` },
            ].map(item => (
              <button key={item.label} onClick={() => navigate(item.path)}
                className="flex flex-col items-center gap-2 p-4 bg-white border border-gray-200 rounded-xl hover:border-[#e87722] hover:shadow-md transition-all">
                <span className="text-2xl">{item.icon}</span>
                <span className="font-semibold text-gray-800">{item.label} #{item.num}</span>
                <span className="text-xs text-[#e87722]">Ver {item.label.toLowerCase()} →</span>
              </button>
            ))}
          </div>

          <div className="flex justify-center">
            <button onClick={() => {
              setStep(1); setOrcFile(null); setOrcDados(null); setLocais([]); setOrcError('')
              setRelFile(null); setRelInfo(null); setRelError('')
              setCttFile(null); setCttDados(null); setCttError('')
              setResultado(null); setCriarError('')
            }} className="px-6 py-2.5 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition-colors">
              Importar outro contrato
            </button>
          </div>
        </div>
      )
    }

    const totalFotos = locais.reduce((s, l) => s + (l.fotos?.length || 0), 0)

    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-lg font-bold text-gray-800 mb-1">✅ Confirmar criação</h2>
          <p className="text-sm text-gray-500">
            Serão criados: <strong>1 Medição + 1 Orçamento + 1 Contrato</strong>, todos marcados como Integração.
          </p>
        </div>

        <div className="bg-gray-50 rounded-xl border border-gray-200 divide-y divide-gray-200">
          <div className="p-4">
            <p className="text-xs font-bold text-gray-500 uppercase mb-2">📐 Medição</p>
            <p className="text-sm"><strong>Cliente:</strong> {orcDados?.cliente || '—'}</p>
            <p className="text-sm"><strong>Endereço:</strong> {[orcDados?.endereco, orcDados?.bairro].filter(Boolean).join(', ') || '—'}</p>
            <p className="text-sm"><strong>Locais:</strong> {locais.length}</p>
            <p className="text-sm"><strong>Fotos:</strong> {totalFotos > 0 ? `${totalFotos} foto(s) em ${locais.filter(l => l.fotos?.length).length} local(is)` : 'nenhuma'}</p>
          </div>
          <div className="p-4">
            <p className="text-xs font-bold text-gray-500 uppercase mb-2">📄 Orçamento</p>
            <p className="text-sm">
              <strong>Total:</strong>{' '}
              {orcDados?.totalBruto
                ? `R$ ${Number(orcDados.totalBruto).toLocaleString('pt-BR', {minimumFractionDigits: 2})}`
                : '(calculado dos itens)'}
            </p>
            <p className="text-sm"><strong>Status:</strong>{' '}
              <span className="bg-green-100 text-green-700 px-1.5 py-0.5 rounded text-xs font-medium">aprovado</span>
            </p>
          </div>
          <div className="p-4">
            <p className="text-xs font-bold text-gray-500 uppercase mb-2">📋 Contrato</p>
            {cttDados ? (
              <>
                <p className="text-sm">
                  <strong>Total Líquido:</strong>{' '}
                  {cttDados.totalLiquido
                    ? `R$ ${Number(cttDados.totalLiquido).toLocaleString('pt-BR', {minimumFractionDigits: 2})}`
                    : '—'}
                </p>
                <p className="text-sm">
                  <strong>Parcelas:</strong> {cttDados.parcelas || 1}x
                  {cttDados.valorParcela ? ` de R$ ${Number(cttDados.valorParcela).toLocaleString('pt-BR', {minimumFractionDigits: 2})}` : ''}
                </p>
                <p className="text-sm"><strong>CNPJ:</strong> {cttDados.cnpjCliente || '—'}</p>
              </>
            ) : (
              <p className="text-sm text-gray-400">Contrato sem dados extras — valores herdados do orçamento</p>
            )}
            <p className="text-sm"><strong>Status:</strong>{' '}
              <span className="bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded text-xs font-medium">assinado</span>
            </p>
          </div>
        </div>

        {criarError && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">❌ {criarError}</div>
        )}

        <div className="flex justify-between">
          <button onClick={() => setStep(2)}
            className="px-5 py-2.5 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition-colors">
            ← Voltar
          </button>
          <button onClick={criarRegistros} disabled={criando || !orcDados}
            className="flex items-center gap-2 px-6 py-2.5 bg-green-600 text-white rounded-lg font-semibold disabled:opacity-40 disabled:cursor-not-allowed hover:bg-green-700 transition-colors">
            {criando
              ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />{criandoStatus || 'Criando...'}</>
              : '✅ Criar Medição, Orçamento e Contrato'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">🔗 Integração de Contratos Legados</h1>
        <p className="text-sm text-gray-500 mt-1">Importe contratos antigos — a IA extrai os dados automaticamente dos arquivos.</p>
      </div>
      <StepBar step={step} />
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
        {step === 1 && renderStep1()}
        {step === 2 && renderStep2()}
        {step === 3 && renderStep3()}
      </div>
    </div>
  )
}
