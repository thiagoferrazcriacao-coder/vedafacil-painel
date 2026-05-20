/**
 * helpers.test.js — Testes automatizados para lib/helpers.js
 * Rodar com: npm test  (usa Vitest)
 */

import { describe, it, expect, vi } from 'vitest';
import {
  log,
  sanitizeImages, MAX_IMG_B64_BYTES,
  calcObra,
  expandSubPontos,
  ensureSubPontos,
  calcProgressoOS,
  pushStatusHistorico,
  extenso,
  valorExtenso,
} from '../lib/helpers.js';

// ── log ───────────────────────────────────────────────────────────────────────

describe('log', () => {
  it('emite JSON para console.log em nível info', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    log('info', 'teste', { x: 1 });
    expect(spy).toHaveBeenCalled();
    const output = JSON.parse(spy.mock.calls[0][0]);
    expect(output.level).toBe('info');
    expect(output.msg).toBe('teste');
    expect(output.data).toEqual({ x: 1 });
    spy.mockRestore();
  });

  it('emite para console.error em nível error', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    log('error', 'falhou');
    expect(spy).toHaveBeenCalled();
    const output = JSON.parse(spy.mock.calls[0][0]);
    expect(output.level).toBe('error');
    spy.mockRestore();
  });
});

// ── sanitizeImages ────────────────────────────────────────────────────────────

describe('sanitizeImages', () => {
  it('retorna primitivos sem alteração', () => {
    expect(sanitizeImages('texto')).toBe('texto');
    expect(sanitizeImages(42)).toBe(42);
    expect(sanitizeImages(null)).toBeNull();
  });

  it('passa imagens abaixo do limite sem truncar', () => {
    const img = 'data:image/png;base64,' + 'A'.repeat(100);
    const result = sanitizeImages({ foto: img });
    expect(result.foto).toBe(img);
  });

  it('trunca imagens acima do limite (400 KB)', () => {
    // Gera string base64 maior que MAX_IMG_B64_BYTES
    const bigImg = 'data:image/jpeg;base64,' + 'A'.repeat(MAX_IMG_B64_BYTES * 2);
    const result = sanitizeImages({ foto: bigImg });
    expect(result.foto).toContain('IMAGEM_MUITO_GRANDE_COMPRIMA_NO_CLIENTE');
    expect(result.foto.length).toBeLessThan(bigImg.length);
  });

  it('processa arrays recursivamente', () => {
    const small = 'data:image/png;base64,' + 'B'.repeat(50);
    const result = sanitizeImages([{ foto: small }]);
    expect(result[0].foto).toBe(small);
  });

  it('não altera campos que não são imagem', () => {
    const obj = { nome: 'João', idade: 30, ativo: true };
    expect(sanitizeImages(obj)).toEqual(obj);
  });
});

// ── calcObra ──────────────────────────────────────────────────────────────────

describe('calcObra', () => {
  it('retorna zeros para entrada vazia', () => {
    const r = calcObra({});
    expect(r.diasTrabalho).toBe(0);
    expect(r.consumoProduto).toBe(0);
    expect(r.qtdInjetores).toBe(0);
  });

  it('calcula corretamente para trinca=8 (exatamente 1 dia)', () => {
    const r = calcObra({ trinca: 8 });
    expect(r.diasTrabalho).toBe(1);
    expect(r.consumoProduto).toBe(12); // 8 * 1.5
    expect(r.qtdInjetores).toBe(32);   // 8 * 4
  });

  it('arredonda dias para o 0,5 mais próximo (4,75 → 5)', () => {
    // 38 unidades / 8 = 4,75
    const r = calcObra({ trinca: 38 });
    expect(r.diasTrabalho).toBe(5);
  });

  it('arredonda dias para o 0,5 mais próximo (5,25 → 5,5)', () => {
    // 42 unidades / 8 = 5,25
    const r = calcObra({ trinca: 42 });
    expect(r.diasTrabalho).toBe(5.5);
  });

  it('calcula consumo diferente por tipo', () => {
    // juntaDilat × 2 vs juntaFria × 1
    const r1 = calcObra({ juntaDilat: 10 });
    const r2 = calcObra({ juntaFria: 10 });
    expect(r1.consumoProduto).toBe(20);
    expect(r2.consumoProduto).toBe(10);
  });

  it('injetores apenas para lineares (sem cortina/ferragem)', () => {
    const r = calcObra({ cortina: 20, ferragem: 10 });
    expect(r.qtdInjetores).toBe(0); // cortina e ferragem não geram injetores
  });
});

// ── expandSubPontos ───────────────────────────────────────────────────────────

describe('expandSubPontos', () => {
  it('retorna array vazio para local sem medições', () => {
    expect(expandSubPontos({})).toEqual([]);
  });

  it('gera 1 sub-ponto para trinca simples', () => {
    const subs = expandSubPontos({ trinca: 5 });
    expect(subs).toHaveLength(1);
    expect(subs[0].tipo).toBe('trinca');
    expect(subs[0].valor).toBe(5);
    expect(subs[0].feito).toBe(false);
  });

  it('ignora campos com valor 0', () => {
    const subs = expandSubPontos({ trinca: 0, ralo: 2 });
    expect(subs).toHaveLength(1);
    expect(subs[0].tipo).toBe('ralo');
  });

  it('expande array de medições individuais em múltiplos sub-pontos', () => {
    // Dois valores distintos → dois sub-pontos
    const subs = expandSubPontos({ trinca: [3, 4] });
    expect(subs).toHaveLength(2);
    expect(subs[0].valor).toBe(3);
    expect(subs[1].valor).toBe(4);
  });

  it('usa xxxDetalhe quando há múltiplos valores', () => {
    const subs = expandSubPontos({ trinca: 7, trincaDetalhe: [3, 4] });
    expect(subs).toHaveLength(2);
  });
});

// ── ensureSubPontos ───────────────────────────────────────────────────────────

describe('ensureSubPontos', () => {
  it('retorna array vazio para entrada vazia', () => {
    expect(ensureSubPontos([])).toEqual([]);
    expect(ensureSubPontos(null)).toEqual([]);
  });

  it('gera subPontos se ausentes', () => {
    const pontos = [{ trinca: 3, fotosAntes: [], fotosDepois: [] }];
    const result = ensureSubPontos(pontos);
    expect(result[0].subPontos).toHaveLength(1);
  });

  it('não sobreescreve subPontos existentes', () => {
    const existentes = [{ tipo: 'trinca', feito: true }];
    const pontos = [{ trinca: 5, subPontos: existentes }];
    const result = ensureSubPontos(pontos);
    expect(result[0].subPontos).toEqual(existentes);
  });

  it('garante fotosAntes e fotosDepois como arrays', () => {
    const result = ensureSubPontos([{ trinca: 1 }]);
    expect(Array.isArray(result[0].fotosAntes)).toBe(true);
    expect(Array.isArray(result[0].fotosDepois)).toBe(true);
  });

  it('define statusLocal como pendente por padrão', () => {
    const result = ensureSubPontos([{ trinca: 1 }]);
    expect(result[0].statusLocal).toBe('pendente');
  });

  it('define statusLocal como concluido quando status=concluido', () => {
    const result = ensureSubPontos([{ trinca: 1, status: 'concluido' }]);
    expect(result[0].statusLocal).toBe('concluido');
  });

  it('mapeia p.fotos para p.fotosMedicao quando fotosMedicao está vazio', () => {
    const fotos = ['data:image/png;base64,abc'];
    const result = ensureSubPontos([{ trinca: 1, fotos }]);
    expect(result[0].fotosMedicao).toHaveLength(1);
    expect(result[0].fotosMedicao[0].data).toBe('data:image/png;base64,abc');
  });

  it('mapeia fotos como objetos com campo data', () => {
    const fotos = [{ data: 'data:image/jpeg;base64,xyz', id: '123' }];
    const result = ensureSubPontos([{ trinca: 1, fotos }]);
    expect(result[0].fotosMedicao[0].data).toBe('data:image/jpeg;base64,xyz');
  });

  it('não sobreescreve fotosMedicao existente', () => {
    const fotosMedicao = [{ data: 'existente' }];
    const result = ensureSubPontos([{ trinca: 1, fotos: ['nova'], fotosMedicao }]);
    expect(result[0].fotosMedicao).toEqual(fotosMedicao);
  });

  it('lida com pontos Mongoose (toObject)', () => {
    const ponto = { trinca: 2, toObject: () => ({ trinca: 2 }) };
    const result = ensureSubPontos([ponto]);
    expect(result[0].subPontos).toHaveLength(1);
  });
});

// ── calcProgressoOS ───────────────────────────────────────────────────────────

describe('calcProgressoOS', () => {
  it('retorna 0 para array vazio', () => {
    expect(calcProgressoOS([])).toBe(0);
  });

  it('retorna 0 quando nenhum sub-ponto foi feito', () => {
    const pontos = [
      { subPontos: [{ feito: false }, { feito: false }] },
    ];
    expect(calcProgressoOS(pontos)).toBe(0);
  });

  it('retorna 100 quando todos sub-pontos feitos', () => {
    const pontos = [
      { subPontos: [{ feito: true }, { feito: true }] },
    ];
    expect(calcProgressoOS(pontos)).toBe(100);
  });

  it('retorna 50 quando metade dos sub-pontos feitos', () => {
    const pontos = [
      { subPontos: [{ feito: true }, { feito: false }] },
    ];
    expect(calcProgressoOS(pontos)).toBe(50);
  });

  it('usa statusLocal quando não há sub-pontos', () => {
    const pontos = [
      { subPontos: [], statusLocal: 'concluido' },
      { subPontos: [], statusLocal: 'pendente' },
    ];
    expect(calcProgressoOS(pontos)).toBe(50);
  });

  it('combina pontos com e sem sub-pontos corretamente', () => {
    const pontos = [
      { subPontos: [{ feito: true }, { feito: true }] },  // 2/2
      { subPontos: [], statusLocal: 'pendente' },          // 0/1
    ];
    // Total: 3, feitos: 2 → 67%
    expect(calcProgressoOS(pontos)).toBe(67);
  });
});

// ── pushStatusHistorico ───────────────────────────────────────────────────────

describe('pushStatusHistorico', () => {
  it('não faz nada quando status não mudou', () => {
    const updates = {};
    pushStatusHistorico(updates, 'rascunho', { status: 'rascunho' });
    expect(updates.statusHistorico).toBeUndefined();
  });

  it('adiciona entrada quando status muda', () => {
    const updates = {};
    pushStatusHistorico(updates, 'assinado', { status: 'rascunho', statusHistorico: [] });
    expect(updates.statusHistorico).toHaveLength(1);
    expect(updates.statusHistorico[0].status).toBe('assinado');
    expect(typeof updates.statusHistorico[0].data).toBe('number');
  });

  it('preserva histórico anterior', () => {
    const updates = {};
    const docAtual = {
      status: 'rascunho',
      statusHistorico: [{ status: 'criado', data: 1000 }],
    };
    pushStatusHistorico(updates, 'assinado', docAtual);
    expect(updates.statusHistorico).toHaveLength(2);
    expect(updates.statusHistorico[0].status).toBe('criado');
  });

  it('funciona sem statusHistorico existente', () => {
    const updates = {};
    pushStatusHistorico(updates, 'assinado', { status: 'rascunho' });
    expect(updates.statusHistorico).toHaveLength(1);
  });
});

// ── extenso ───────────────────────────────────────────────────────────────────

describe('extenso', () => {
  it('converte números simples', () => {
    expect(extenso(0)).toBe('zero');
    expect(extenso(1)).toBe('um');
    expect(extenso(15)).toBe('quinze');
    expect(extenso(20)).toBe('vinte');
    expect(extenso(21)).toBe('vinte e um');
  });

  it('converte centenas', () => {
    expect(extenso(100)).toBe('cem');
    expect(extenso(200)).toBe('duzentos');
    expect(extenso(150)).toBe('cento e cinquenta');
  });

  it('converte milhares', () => {
    expect(extenso(1000)).toBe('mil');
    expect(extenso(2000)).toBe('dois mil');
    expect(extenso(1500)).toBe('mil e quinhentos');
  });
});

// ── valorExtenso ─────────────────────────────────────────────────────────────

describe('valorExtenso', () => {
  it('converte reais inteiros', () => {
    const v = valorExtenso(1000);
    expect(v.toLowerCase()).toContain('mil');
    expect(v.toLowerCase()).toContain('reais');
  });

  it('inclui centavos quando presentes', () => {
    const v = valorExtenso(10.50);
    expect(v.toLowerCase()).toContain('reais');
    expect(v.toLowerCase()).toContain('centavo');
  });

  it('usa "real" (singular) para R$1,00', () => {
    const v = valorExtenso(1);
    expect(v.toLowerCase()).toContain('real');
  });
});
