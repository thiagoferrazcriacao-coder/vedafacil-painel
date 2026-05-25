import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api/client.js'

// ─── Funções auxiliares ────────────────────────────────────────────────────────

function novoLocal() {
  return {
    _id: Date.now() + Math.random(),
    nome: '',
    andaime: 'nao',
    trinca:     [''],
    juntaFria:  [''],
    juntaDilat: [''],
    ralo:       [''],
    ferragem:   [''],
    cortina:    [''],
    fotos:      [],
  }
}

function gerarSubPontos(local) {
  const subs = []
  const tipos = [
    { key: 'trinca',     label: 'Trinca',             unidade: 'm'  },
    { key: 'juntaFria',  label: 'Junta Fria',         unidade: 'm'  },
    { key: 'juntaDilat', label: 'Junta de Dilatação', unidade: 'm'  },
    { key: 'ralo',       label: 'Ralo',               unidade: 'un' },
    { key: 'ferragem',   label: 'Ferragem',            unidade: 'm'  },
    { key: 'cortina',    label: 'Cortina',             unidade: 'm²' },
  ]
  for (const { key, label, unidade } of tipos) {
    const vals = (local[key] || []).filter(v => v !== '' && parseFloat(v) > 0)
    vals.forEach((v, i) => {
      subs.push({
        tipo: key,
        desc: vals.length > 1
          ? `${label} ${i + 1} (${parseFloat(v)}${unidade})`
          : `${label} (${parseFloat(v)}${unidade})`,
        valor: parseFloat(v),
        unidade,
        feito: false,
      })
    })
  }
  return subs
}

function somaValores(arr) {
  return arr.reduce((s, v) => s + (parseFloat(v) || 0), 0)
}

function calcConsumoPonto(local) {
  return (
    somaValores(local.trinca)     * 1.5 +
    somaValores(local.juntaFria)  * 1.0 +
    somaValores(local.juntaDilat) * 2.0 +
    somaValores(local.ralo)       * 1.0 +
    somaValores(local.ferragem)   * 0.5 +
    somaValores(local.cortina)    * 2.0
  )
}

// ─── Componente LocalCard ──────────────────────────────────────────────────────

function LocalCard({
  local, idx,
  onRemover, onAtualizarLocal, onAdicionarMedicao, onRemoverMedicao,
  onAtualizarMedicao, onFoto, onRemoverFoto, erro
}) {
  const tipos = [
    { key: 'trinca',     label: 'Trinca',             unidade: 'm',  icon: '─', cor: 'text-red-600'    },
    { key: 'juntaFria',  label: 'Junta Fria',         unidade: 'm',  icon: '╌', cor: 'text-orange-600' },
    { key: 'juntaDilat', label: 'Junta de Dilatação', unidade: 'm',  icon: '━', cor: 'text-yellow-700' },
    { key: 'ralo',       label: 'Ralo',               unidade: 'un', icon: '⬤', cor: 'text-blue-600'   },
    { key: 'ferragem',   label: 'Ferragem',            unidade: 'm',  icon: '▬', cor: 'text-gray-600'   },
    { key: 'cortina',    label: 'Cortina',             unidade: 'm²', icon: '▦', cor: 'text-purple-600' },
  ]

  const subPontos = gerarSubPontos(local)
  const consumo = calcConsumoPonto(local)

  return (
    <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 border-l-4 border-l-orange-400 mb-3">
      {/* Cabeçalho do local */}
      <div className="flex items-center gap-3 mb-3">
        <span className="flex-shrink-0 w-6 h-6 rounded-full bg-orange-500 text-white text-xs flex items-center justify-center font-bold">
          {idx + 1}
        </span>
        <input
          type="text"
          placeholder="Nome do local (ex: Cobertura, Piscina, Fachada...)"
          value={local.nome}
          onChange={e => onAtualizarLocal(local._id, 'nome', e.target.value)}
          className="flex-1 border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
        />
        <button
          type="button"
          onClick={() => onRemover(local._id)}
          className="text-red-400 hover:text-red-600 text-xs border border-red-200 rounded px-2 py-1 hover:bg-red-50 transition-colors"
        >
          🗑️ Remover
        </button>
      </div>
      {erro && <p className="text-red-500 text-xs mb-2">{erro}</p>}

      {/* Andaime */}
      <div className="flex items-center gap-3 mb-3">
        <span className="text-xs font-semibold text-gray-500 w-20">Andaime:</span>
        <label className="flex items-center gap-1.5 cursor-pointer">
          <input
            type="radio"
            name={`andaime_${local._id}`}
            value="nao"
            checked={local.andaime === 'nao'}
            onChange={() => onAtualizarLocal(local._id, 'andaime', 'nao')}
            className="accent-orange-500"
          />
          <span className="text-sm text-gray-600">Não</span>
        </label>
        <label className="flex items-center gap-1.5 cursor-pointer">
          <input
            type="radio"
            name={`andaime_${local._id}`}
            value="sim"
            checked={local.andaime === 'sim'}
            onChange={() => onAtualizarLocal(local._id, 'andaime', 'sim')}
            className="accent-orange-500"
          />
          <span className="text-sm text-gray-600">Sim</span>
        </label>
      </div>

      {/* Medições por tipo */}
      <div className="space-y-2 mb-3">
        {tipos.map(({ key, label, unidade, icon, cor }) => {
          const vals = local[key] || ['']
          const total = somaValores(vals)
          return (
            <div key={key} className="flex flex-wrap items-center gap-2 py-1.5 border-b border-gray-50 last:border-0">
              <span className={`text-xs font-semibold w-32 flex-shrink-0 ${cor}`}>
                {icon} {label}
              </span>
              <div className="flex flex-wrap items-center gap-1.5">
                {vals.map((v, i) => (
                  <div key={i} className="flex items-center gap-1">
                    {i > 0 && <span className="text-gray-400 text-xs">+</span>}
                    <input
                      type="number"
                      min="0"
                      step="0.1"
                      placeholder="0"
                      value={v}
                      onChange={e => onAtualizarMedicao(local._id, key, i, e.target.value)}
                      className="w-20 text-center border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-orange-300"
                    />
                    <span className="text-xs text-gray-400">{unidade}</span>
                    {vals.length > 1 && (
                      <button
                        type="button"
                        onClick={() => onRemoverMedicao(local._id, key, i)}
                        className="text-red-400 hover:text-red-600 text-xs leading-none"
                        title="Remover"
                      >
                        ×
                      </button>
                    )}
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => onAdicionarMedicao(local._id, key)}
                  className="text-orange-500 border border-orange-300 rounded px-2 py-0.5 text-xs hover:bg-orange-50 transition-colors"
                  title="Adicionar medição"
                >
                  + Add
                </button>
              </div>
              {total > 0 && (
                <span className="text-xs text-gray-500 ml-auto font-medium">
                  Total: {total.toFixed(1)}{unidade}
                </span>
              )}
            </div>
          )
        })}
      </div>

      {/* Fotos de referência */}
      <div className="mb-3">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xs font-semibold text-gray-500">📷 Fotos de referência</span>
          <label className="cursor-pointer text-xs text-orange-500 border border-orange-300 rounded px-2 py-0.5 hover:bg-orange-50 transition-colors">
            + Adicionar
            <input
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={e => onFoto(local._id, e)}
            />
          </label>
        </div>
        {local.fotos.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {local.fotos.map((foto, i) => (
              <div key={i} className="relative w-16 h-16 flex-shrink-0">
                <img
                  src={foto}
                  alt={`Foto ${i + 1}`}
                  className="w-16 h-16 object-cover rounded-lg border border-gray-200"
                />
                <button
                  type="button"
                  onClick={() => onRemoverFoto(local._id, i)}
                  className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white rounded-full text-xs flex items-center justify-center hover:bg-red-700 leading-none"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Preview dos sub-pontos e consumo */}
      {(subPontos.length > 0 || consumo > 0) && (
        <div className="bg-gray-50 rounded-lg p-3 mt-2">
          {subPontos.length > 0 && (
            <div className="mb-2">
              <span className="text-xs font-semibold text-gray-500 mb-1.5 block">
                Sub-pontos que serão gerados ({subPontos.length}):
              </span>
              <div className="flex flex-wrap gap-1">
                {subPontos.map((sp, i) => (
                  <span key={i} className="text-xs bg-white border border-gray-200 rounded px-2 py-0.5 text-gray-600">
                    {sp.desc}
                  </span>
                ))}
              </div>
            </div>
          )}
          {consumo > 0 && (
            <div className="flex items-center gap-1.5 text-xs text-gray-600">
              <span className="font-semibold">🧴 Consumo estimado GVF Seal:</span>
              <span className="bg-orange-100 text-orange-700 font-bold px-2 py-0.5 rounded">
                {consumo.toFixed(1)} L
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Página principal ──────────────────────────────────────────────────────────

export default function NovaOSManualPage() {
  const navigate = useNavigate()

  const [dados, setDados] = useState({
    cliente: '', endereco: '', bairro: '', cidade: '', celular: '',
    garantia: '15', dataInicio: '', dataTermino: '',
    equipeId: '', tecnicoResponsavel: '', obs: '',
  })

  const [locais, setLocais] = useState([novoLocal()])
  const [equipes, setEquipes] = useState([])
  const [tecnicos, setTecnicos] = useState(['Alan', 'Fernando', 'Thiago', 'Daniel'])
  const [saving, setSaving] = useState(false)
  const [erros, setErros] = useState({})

  useEffect(() => {
    Promise.all([api.getEquipes(), api.getPrecos()])
      .then(([eqs, precos]) => {
        setEquipes(eqs.filter(e => e.ativa !== false))
        setTecnicos(precos?.tecnicos || ['Alan', 'Fernando', 'Thiago', 'Daniel'])
      })
      .catch(() => {})
  }, [])

  // ── Handlers de locais ──────────────────────────────────────────────────────

  function adicionarLocal() {
    setLocais(l => [...l, novoLocal()])
  }

  function removerLocal(id) {
    setLocais(l => l.filter(x => x._id !== id))
  }

  function atualizarLocal(id, campo, valor) {
    setLocais(l => l.map(x => x._id === id ? { ...x, [campo]: valor } : x))
  }

  function adicionarMedicao(id, tipo) {
    setLocais(l => l.map(x => x._id === id ? { ...x, [tipo]: [...x[tipo], ''] } : x))
  }

  function removerMedicao(id, tipo, idx) {
    setLocais(l => l.map(x => x._id === id
      ? { ...x, [tipo]: x[tipo].filter((_, i) => i !== idx) }
      : x
    ))
  }

  function atualizarMedicao(id, tipo, idx, valor) {
    setLocais(l => l.map(x => x._id === id
      ? { ...x, [tipo]: x[tipo].map((v, i) => i === idx ? valor : v) }
      : x
    ))
  }

  async function handleFotoLocal(id, e) {
    const files = Array.from(e.target.files)
    for (const file of files) {
      const reader = new FileReader()
      reader.onload = ev => {
        setLocais(l => l.map(x => x._id === id
          ? { ...x, fotos: [...x.fotos, ev.target.result] }
          : x
        ))
      }
      reader.readAsDataURL(file)
    }
    e.target.value = ''
  }

  function removerFoto(id, idx) {
    setLocais(l => l.map(x => x._id === id
      ? { ...x, fotos: x.fotos.filter((_, i) => i !== idx) }
      : x
    ))
  }

  // ── Validação e submit ──────────────────────────────────────────────────────

  async function handleSubmit(e) {
    e.preventDefault()
    const errosNovos = {}
    if (!dados.cliente.trim()) errosNovos.cliente = 'Cliente é obrigatório'
    if (!dados.dataInicio)     errosNovos.dataInicio = 'Data de início é obrigatória'
    if (locais.length === 0)   errosNovos.locais = 'Adicione ao menos um local'
    locais.forEach((l, i) => {
      if (!l.nome.trim()) errosNovos[`local_${i}`] = `Local ${i + 1}: informe o nome`
    })
    if (Object.keys(errosNovos).length > 0) { setErros(errosNovos); return }
    setErros({})
    setSaving(true)

    const eq = equipes.find(x => (x._id || x.id) === dados.equipeId)

    const pontos = locais.map(l => {
      const subPontos = gerarSubPontos(l)
      const clean = tipo => l[tipo].filter(v => v !== '' && parseFloat(v) > 0).map(v => parseFloat(v))
      return {
        local:        l.nome,
        andaime:      l.andaime,
        status:       'pendente',
        statusLocal:  'pendente',
        trinca:       clean('trinca'),
        juntaFria:    clean('juntaFria'),
        juntaDilat:   clean('juntaDilat'),
        ralo:         clean('ralo'),
        ferragem:     clean('ferragem'),
        cortina:      clean('cortina'),
        fotosMedicao: l.fotos.map((data, i) => ({ data, id: `ref_${i}` })),
        fotosAntes:   [],
        fotosDepois:  [],
        subPontos,
      }
    })

    const consumoProduto = locais.reduce((s, l) => s + calcConsumoPonto(l), 0)
    const qtdInjetores = Math.round(
      locais.reduce((s, l) =>
        s + somaValores(l.trinca) * 4 + somaValores(l.juntaFria) * 4 + somaValores(l.juntaDilat) * 4
      , 0)
    )
    const diasTrabalho = Math.max(1,
      Math.ceil((pontos.reduce((s, p) => s + (p.subPontos?.length || 1), 0) / 8) * 2) / 2
    )

    try {
      const res = await api.createOrdemServico({
        ...dados,
        equipeNome:             eq?.nome || '',
        contratoManual:         true,
        contratoManualNome:     `OS Manual — ${dados.cliente}`,
        pontos,
        consumoProduto:         Math.round(consumoProduto * 10) / 10,
        qtdInjetores,
        diasTrabalho:           Math.round(diasTrabalho * 2) / 2,
        tipo: 'normal',
      })
      navigate(`/ordens-servico/${res._id || res.id}`)
    } catch (err) {
      setErros({ geral: err.message || 'Erro ao criar OS' })
    } finally {
      setSaving(false)
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  const totalSubPontos = locais.reduce((s, l) => s + gerarSubPontos(l).length, 0)
  const totalConsumo   = locais.reduce((s, l) => s + calcConsumoPonto(l), 0)

  return (
    <div className="max-w-3xl mx-auto p-4 pb-24">
      {/* Cabeçalho */}
      <div className="flex items-center gap-3 mb-6">
        <button
          type="button"
          onClick={() => navigate('/ordens-servico')}
          className="text-gray-500 hover:text-gray-700 text-lg leading-none"
          title="Voltar"
        >
          ←
        </button>
        <h1 className="text-xl font-bold text-gray-800">Nova OS Manual</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">

        {/* ── SEÇÃO 1: Dados da Obra ── */}
        <section className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
          <h2 className="text-base font-bold text-gray-700 mb-3 pb-2 border-b">📋 Dados da Obra</h2>

          {/* Cliente */}
          <div className="mb-3">
            <label className="block text-xs font-semibold text-gray-600 mb-1">
              Cliente <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              placeholder="Nome do cliente / condomínio"
              value={dados.cliente}
              onChange={e => setDados(d => ({ ...d, cliente: e.target.value }))}
              className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 ${erros.cliente ? 'border-red-400' : 'border-gray-300'}`}
            />
            {erros.cliente && <p className="text-red-500 text-xs mt-1">{erros.cliente}</p>}
          </div>

          {/* Endereço */}
          <div className="mb-3">
            <label className="block text-xs font-semibold text-gray-600 mb-1">Endereço</label>
            <input
              type="text"
              placeholder="Rua, número, complemento"
              value={dados.endereco}
              onChange={e => setDados(d => ({ ...d, endereco: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
            />
          </div>

          {/* Bairro + Cidade */}
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Bairro</label>
              <input
                type="text"
                placeholder="Bairro"
                value={dados.bairro}
                onChange={e => setDados(d => ({ ...d, bairro: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Cidade</label>
              <input
                type="text"
                placeholder="Cidade"
                value={dados.cidade}
                onChange={e => setDados(d => ({ ...d, cidade: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
              />
            </div>
          </div>

          {/* Celular */}
          <div className="mb-3">
            <label className="block text-xs font-semibold text-gray-600 mb-1">Celular</label>
            <input
              type="tel"
              placeholder="(21) 99999-0000"
              value={dados.celular}
              onChange={e => setDados(d => ({ ...d, celular: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
            />
          </div>

          {/* Garantia */}
          <div className="mb-3">
            <label className="block text-xs font-semibold text-gray-600 mb-2">Garantia</label>
            <div className="flex gap-4">
              {[{ v: '15', label: '15 anos' }, { v: '7', label: '7 anos' }].map(({ v, label }) => (
                <label key={v} className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="radio"
                    name="garantia"
                    value={v}
                    checked={dados.garantia === v}
                    onChange={() => setDados(d => ({ ...d, garantia: v }))}
                    className="accent-orange-500"
                  />
                  <span className="text-sm text-gray-700">{label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Datas */}
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">
                Data de Início <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                value={dados.dataInicio}
                onChange={e => setDados(d => ({ ...d, dataInicio: e.target.value }))}
                className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 ${erros.dataInicio ? 'border-red-400' : 'border-gray-300'}`}
              />
              {erros.dataInicio && <p className="text-red-500 text-xs mt-1">{erros.dataInicio}</p>}
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Data de Término</label>
              <input
                type="date"
                value={dados.dataTermino}
                onChange={e => setDados(d => ({ ...d, dataTermino: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
              />
            </div>
          </div>

          {/* Equipe */}
          <div className="mb-3">
            <label className="block text-xs font-semibold text-gray-600 mb-1">Equipe</label>
            <select
              value={dados.equipeId}
              onChange={e => setDados(d => ({ ...d, equipeId: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
            >
              <option value="">Sem equipe atribuída</option>
              {equipes.map(eq => (
                <option key={eq._id || eq.id} value={eq._id || eq.id}>{eq.nome}</option>
              ))}
            </select>
          </div>

          {/* Técnico Responsável */}
          <div className="mb-3">
            <label className="block text-xs font-semibold text-gray-600 mb-1">Técnico Responsável</label>
            <select
              value={dados.tecnicoResponsavel}
              onChange={e => setDados(d => ({ ...d, tecnicoResponsavel: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
            >
              <option value="">Sem técnico designado</option>
              {tecnicos.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>

          {/* Observações */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Observações</label>
            <textarea
              rows={3}
              placeholder="Instruções especiais, acesso, portaria..."
              value={dados.obs}
              onChange={e => setDados(d => ({ ...d, obs: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-orange-300"
            />
          </div>
        </section>

        {/* ── SEÇÃO 2: Locais de Serviço ── */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-lg font-bold text-gray-800">📍 Locais de Serviço</h2>
              {totalSubPontos > 0 && (
                <p className="text-xs text-gray-500 mt-0.5">
                  {locais.length} local(is) · {totalSubPontos} sub-ponto(s) · {totalConsumo.toFixed(1)}L GVF Seal
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={adicionarLocal}
              className="bg-orange-500 hover:bg-orange-600 text-white text-sm px-3 py-1.5 rounded-lg font-semibold transition-colors flex items-center gap-1"
            >
              + Adicionar Local
            </button>
          </div>

          {erros.locais && (
            <p className="text-red-600 text-sm mb-2 bg-red-50 border border-red-200 rounded p-2">
              {erros.locais}
            </p>
          )}

          {locais.map((local, idx) => (
            <LocalCard
              key={local._id}
              local={local}
              idx={idx}
              onRemover={removerLocal}
              onAtualizarLocal={atualizarLocal}
              onAdicionarMedicao={adicionarMedicao}
              onRemoverMedicao={removerMedicao}
              onAtualizarMedicao={atualizarMedicao}
              onFoto={handleFotoLocal}
              onRemoverFoto={removerFoto}
              erro={erros[`local_${idx}`]}
            />
          ))}

          {locais.length === 0 && (
            <div className="bg-gray-50 border border-dashed border-gray-300 rounded-xl py-10 text-center text-gray-400 text-sm">
              Nenhum local adicionado. Clique em "+ Adicionar Local" para começar.
            </div>
          )}
        </section>

        {/* Erro geral */}
        {erros.geral && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-4 text-sm">
            ⚠️ {erros.geral}
          </div>
        )}

        {/* Resumo e botão submit */}
        {(totalSubPontos > 0 || dados.cliente) && (
          <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 text-sm">
            <p className="font-semibold text-orange-800 mb-1">📊 Resumo da OS</p>
            <div className="text-orange-700 space-y-0.5">
              {dados.cliente && <p>Cliente: <strong>{dados.cliente}</strong></p>}
              <p>Locais: <strong>{locais.length}</strong></p>
              {totalSubPontos > 0 && <p>Sub-pontos: <strong>{totalSubPontos}</strong></p>}
              {totalConsumo > 0 && <p>Consumo estimado: <strong>{totalConsumo.toFixed(1)} L GVF Seal</strong></p>}
            </div>
          </div>
        )}

        <button
          type="submit"
          disabled={saving}
          className="w-full bg-orange-500 hover:bg-orange-600 disabled:bg-orange-300 text-white font-bold py-3 px-6 rounded-xl transition-colors text-base flex items-center justify-center gap-2"
        >
          {saving ? (
            <>
              <span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full inline-block" />
              Criando OS...
            </>
          ) : (
            '✅ Criar Ordem de Serviço'
          )}
        </button>
      </form>
    </div>
  )
}
