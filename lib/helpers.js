/**
 * helpers.js — Funções utilitárias puras do Vedafácil
 * Extraídas de server.js para facilitar teste e reutilização.
 */

// ── Logging estruturado ─────────────────────────────────────────────────────

export const LOG_LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };
export const LOG_LEVEL = LOG_LEVELS[process.env.LOG_LEVEL] ?? LOG_LEVELS.info;

export function log(level, msg, data) {
  if (LOG_LEVELS[level] > LOG_LEVEL) return;
  const entry = { ts: new Date().toISOString(), level, msg };
  if (data) entry.data = data;
  if (level === 'error') console.error(JSON.stringify(entry));
  else if (level === 'warn') console.warn(JSON.stringify(entry));
  else console.log(JSON.stringify(entry));
}

// ── Sanitização de imagens base64 ───────────────────────────────────────────

/** 400 KB em caracteres base64 (overhead ~0.75 real bytes/char) */
export const MAX_IMG_B64_BYTES = 400 * 1024;

/**
 * Percorre obj recursivamente e trunca strings base64 de imagens
 * que excedam MAX_IMG_B64_BYTES, emitindo um warn no log.
 */
export function sanitizeImages(obj, path = '') {
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map((item, i) => sanitizeImages(item, `${path}[${i}]`));
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    const fullPath = path ? `${path}.${k}` : k;
    if (typeof v === 'string' && v.startsWith('data:image')) {
      const sizeBytes = v.length * 0.75;
      if (sizeBytes > MAX_IMG_B64_BYTES) {
        log('warn', `Imagem muito grande em ${fullPath}`, { sizeKB: Math.round(sizeBytes / 1024) });
        out[k] = v.substring(0, 100) + '...IMAGEM_MUITO_GRANDE_COMPRIMA_NO_CLIENTE';
      } else {
        out[k] = v;
      }
    } else if (v && typeof v === 'object') {
      out[k] = sanitizeImages(v, fullPath);
    } else {
      out[k] = v;
    }
  }
  return out;
}

// ── Cálculos de obra ────────────────────────────────────────────────────────

/**
 * Fórmulas de cálculo de obra — conforme definição Vedafácil
 * Dias: todos os tipos / 8
 * Consumo: trinca×1.5 | juntaDilat×2 | juntaFria×1 | ralo×1 | cortina×2
 */
export function calcObra(totals) {
  const trinca     = totals.trinca     || 0;
  const juntaFria  = totals.juntaFria  || 0;
  const juntaDilat = totals.juntaDilat || 0;
  const ralo       = totals.ralo       || 0;
  const ferragem   = totals.ferragem   || 0;
  const cortina    = totals.cortina    || 0;

  const totalUnidades = trinca + juntaFria + juntaDilat + ralo + ferragem + cortina;
  const consumo = trinca * 1.5 + juntaDilat * 2.0 + juntaFria * 1.0 + ralo * 1.0 + cortina * 2.0;

  // qtdInjetores: 4 injetores por metro de injeção linear (trinca + juntas)
  const linear = trinca + juntaFria + juntaDilat;

  // Dias: arredonda para cima até o 0,5 mais próximo (ex: 4,75→5 | 5,25→5,5 | 5,5→5,5)
  const diasBruto = totalUnidades / 8;
  const diasArredondado = Math.ceil(diasBruto * 2) / 2;

  return {
    diasTrabalho:   diasArredondado,
    prazoExecucao:  diasArredondado,
    consumoProduto: parseFloat(consumo.toFixed(1)),
    qtdInjetores:   Math.ceil(linear * 4),
  };
}

// ── Sub-pontos de OS ────────────────────────────────────────────────────────

const TIPOS_SUBPONTO = [
  { key: 'trinca',     label: 'Trinca',             unidade: 'm'  },
  { key: 'juntaFria',  label: 'Junta Fria',          unidade: 'm'  },
  { key: 'ralo',       label: 'Ralo',                unidade: 'un' },
  { key: 'juntaDilat', label: 'Junta de Dilatação',  unidade: 'm'  },
  { key: 'ferragem',   label: 'Ferragem',            unidade: 'm'  },
  { key: 'cortina',    label: 'Cortina',             unidade: 'm²' },
];

/**
 * Expande um local de medição em sub-pontos individuais.
 * Cada trinca/junta/ralo vira um subponto com feito:false.
 */
export function expandSubPontos(local) {
  const subs = [];
  for (const { key, label, unidade } of TIPOS_SUBPONTO) {
    const detail = local[key + 'Detalhe'];
    const val    = local[key];
    if (!val || val === 0) continue;
    const total = Array.isArray(val) ? val.reduce((a, b) => a + parseFloat(b || 0), 0) : parseFloat(val);
    if (!total) continue;

    if (Array.isArray(detail) && detail.filter(v => parseFloat(v || 0) > 0).length > 1) {
      detail.forEach((v, i) => {
        const n = parseFloat(v || 0);
        if (n > 0) subs.push({ tipo: key, desc: `${label} ${i + 1} (${n}${unidade})`, valor: n, unidade, feito: false });
      });
    } else if (Array.isArray(val)) {
      val.forEach((v, i) => {
        const n = parseFloat(v || 0);
        if (n > 0) subs.push({ tipo: key, desc: `${label} ${i + 1} (${n}${unidade})`, valor: n, unidade, feito: false });
      });
    } else {
      subs.push({ tipo: key, desc: `${label} (${total}${unidade})`, valor: total, unidade, feito: false });
    }
  }
  return subs;
}

/**
 * Normaliza um array de pontos de OS:
 * - Gera subPontos se ausentes
 * - Garante fotosAntes/fotosDepois como arrays
 * - Normaliza statusLocal
 * - Mapeia p.fotos (campo do medidor) → p.fotosMedicao
 */
export function ensureSubPontos(pontos) {
  return (pontos || []).map(p => {
    const pojo = p.toObject ? p.toObject() : { ...p };
    if (!pojo.subPontos || pojo.subPontos.length === 0) pojo.subPontos = expandSubPontos(pojo);
    if (!pojo.fotosAntes)  pojo.fotosAntes  = [];
    if (!pojo.fotosDepois) pojo.fotosDepois = [];
    if (!pojo.statusLocal) pojo.statusLocal = pojo.status === 'concluido' ? 'concluido' : 'pendente';
    // Mapear p.fotos (campo do medidor) → p.fotosMedicao para exibição no painel e aplicador
    if (!pojo.fotosMedicao || pojo.fotosMedicao.length === 0) {
      const fonteFotos = pojo.fotos || [];
      if (fonteFotos.length > 0) {
        pojo.fotosMedicao = fonteFotos.map(f => {
          if (typeof f === 'object' && f !== null) {
            return { data: f.data || f.base64 || f.thumb || f.full || '', id: f.id || '' };
          }
          return { data: String(f) };
        }).filter(f => f.data);
      }
    }
    return pojo;
  });
}

/**
 * Calcula progresso percentual de uma OS com base nos sub-pontos executados.
 * Retorna 0–100.
 */
export function calcProgressoOS(pontos) {
  let total = 0, feitos = 0;
  for (const p of pontos) {
    const subs = p.subPontos || [];
    if (subs.length > 0) {
      total  += subs.length;
      feitos += subs.filter(sp => sp.feito).length;
    } else {
      total  += 1;
      feitos += (p.statusLocal || p.status) === 'concluido' ? 1 : 0;
    }
  }
  return total > 0 ? Math.round(feitos / total * 100) : 0;
}

// ── Status histórico ────────────────────────────────────────────────────────

/**
 * Adiciona entrada no statusHistorico do contrato quando o status muda.
 * Modifica `updates` in-place.
 */
export function pushStatusHistorico(updates, novoStatus, docAtual) {
  if (novoStatus && novoStatus !== (docAtual?.status)) {
    const hist = [...(docAtual?.statusHistorico || []), { status: novoStatus, data: Date.now() }];
    updates.statusHistorico = hist;
  }
}

// ── Valores por extenso ─────────────────────────────────────────────────────

const UNIDADES = ['', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove',
  'dez', 'onze', 'doze', 'treze', 'quatorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove'];
const DEZENAS = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'];
const CENTENAS = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos',
  'seiscentos', 'setecentos', 'oitocentos', 'novecentos'];

/** Converte número inteiro (até 999.999) para extenso em pt-BR. */
export function extenso(n) {
  n = Math.round(n);
  if (n === 0) return 'zero';
  if (n === 100) return 'cem';
  if (n < 0) return 'menos ' + extenso(-n);
  const parts = [];
  if (n >= 1000) {
    const milhares = Math.floor(n / 1000);
    parts.push((milhares === 1 ? 'mil' : extenso(milhares) + ' mil'));
    n %= 1000;
  }
  if (n >= 100) {
    parts.push(CENTENAS[Math.floor(n / 100)]);
    n %= 100;
  }
  if (n >= 20) {
    const dez = Math.floor(n / 10);
    const uni = n % 10;
    parts.push(uni > 0 ? `${DEZENAS[dez]} e ${UNIDADES[uni]}` : DEZENAS[dez]);
  } else if (n > 0) {
    parts.push(UNIDADES[n]);
  }
  return parts.join(' e ');
}

/** Formata valor monetário em extenso (reais e centavos). */
export function valorExtenso(valor) {
  const reais = Math.floor(valor);
  const centavos = Math.round((valor - reais) * 100);
  let r = extenso(reais) + (reais === 1 ? ' real' : ' reais');
  if (centavos > 0) r += ' e ' + extenso(centavos) + (centavos === 1 ? ' centavo' : ' centavos');
  return r;
}
