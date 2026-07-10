---
name: pdf-diagramacao
description: >
  Corrige problemas de diagramação em PDFs gerados a partir de HTML — cabeçalho/rodapé sobrepondo
  conteúdo, páginas em branco, conteúdo saindo das margens, layout diferente entre páginas, fotos
  desalinhadas. Use esta skill SEMPRE que o usuário reclamar que o PDF está com layout errado, que
  letras estão "entrando dentro da página", que o cabeçalho/rodapé cobre o texto, que aparece página
  em branco, que o layout muda entre páginas, ou pedir para "arrumar a diagramação do PDF". Aplica-se
  a qualquer projeto que gere PDFs via HTML + window.print() ou Puppeteer — contratos, orçamentos,
  relatórios, garantias, etc.
---

# PDF Diagramação — Correção de Layout HTML→PDF

## O diagnóstico rápido

Antes de qualquer mudança, identifique qual dos problemas abaixo está ocorrendo:

| Sintoma | Causa raiz |
|---|---|
| Texto escondido atrás do cabeçalho/rodapé | `position:fixed` com padding de compensação incorreto |
| Página em branco entre seções | `<tfoot>` ou `<thead>` renderizando como bloco fora do contexto de tabela |
| Conteúdo sai da margem direita/esquerda | Falta de `table-layout:fixed` ou `width:100%` na tabela |
| Cabeçalho/rodapé não repete em todas as páginas | Conteúdo do anexo foi inserido FORA da `<table>` principal |
| Layout inconsistente entre páginas | Mix de `position:fixed` + `padding` de compensação |

---

## A regra de ouro

> **`position:fixed` em `@media print` é sempre errado.** O browser não garante a altura exata de
> elementos fixos. Qualquer `padding-top` de compensação é um chute que quebra com diferentes
> conteúdos, fontes, zoom ou DPI do sistema.

**A única solução confiável** (funciona em Chrome, Edge e Puppeteer sem variação):

```
display: table-header-group  →  thead repete em cada página automaticamente
display: table-footer-group  →  tfoot repete em cada página automaticamente
```

O browser gerencia o espaço — o conteúdo nunca sobrepõe nada.

---

## Arquitetura correta

### HTML — uma única tabela abraça TODO o documento

```html
<table class="doc-tbl">
  <thead>
    <tr><th style="-webkit-print-color-adjust:exact;print-color-adjust:exact">
      <!-- Cabeçalho: logo, título, número do documento -->
      <!-- O browser repete isso no TOPO de cada página impressa -->
      <div style="display:flex;justify-content:space-between;align-items:center;
                  padding:4mm 22mm;border-bottom:2px solid #brand;background:#fff">
        <img src="logo.png" style="height:12mm">
        <div>Título do documento / Nº</div>
      </div>
    </th></tr>
  </thead>

  <tfoot>
    <tr><td style="-webkit-print-color-adjust:exact;print-color-adjust:exact">
      <!-- Rodapé: empresa, CNPJ, telefone -->
      <!-- O browser repete isso no RODAPÉ de cada página impressa -->
      <div style="text-align:center;font-size:8.5px;padding:3mm 22mm;
                  border-top:1px solid #ddd;background:#fff">
        Empresa · CNPJ · Tel.
      </div>
    </td></tr>
  </tfoot>

  <tbody>
    <tr><td>
      <!-- TODO o conteúdo vai aqui: páginas do documento, fotos, anexos -->
      <!-- NUNCA coloque conteúdo fora desta tabela -->
      <!-- Marker para injetar anexos dinamicamente: -->
      <!-- APPEND_HERE -->
    </td></tr>
  </tbody>
</table>
```

### CSS — tela vs. impressão

```css
/* ── TELA: tabela age como bloco simples ── */
.doc-tbl { display: block; width: 100%; max-width: 210mm; margin: 0 auto; }
.doc-tbl > thead,
.doc-tbl > tfoot  { display: none; }   /* cabeçalho/rodapé ocultos na tela */
.doc-tbl > tbody,
.doc-tbl > tbody > tr,
.doc-tbl > tbody > tr > td { display: block; }

/* ── IMPRESSÃO: tabela com thead/tfoot que repetem ── */
@media print {
  body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  @page { size: A4; margin: 0; }

  /* Elementos apenas de tela */
  .download-btn  { display: none !important; }
  .screen-only   { display: none !important; }
  /* Rodapé inline redundante (tfoot da tabela já cobre) */
  .foot          { display: none !important; }
  /* Logo e rodapé inline dos documentos anexados */
  .pg-logo-inline   { display: none !important; }
  .pg-footer-inline { display: none !important; }

  /* ★ A mágica: thead e tfoot repetem em CADA página ★ */
  .doc-tbl {
    display: table !important;
    width: 100% !important;
    border-collapse: collapse !important;
    table-layout: fixed !important;
  }
  .doc-tbl > thead { display: table-header-group !important; }
  .doc-tbl > tfoot { display: table-footer-group !important; }
  .doc-tbl > tbody { display: table-row-group !important; }
  .doc-tbl > tbody > tr { display: table-row !important; }

  /* Células: sempre alinhadas ao topo, sem padding extra */
  .doc-tbl > thead > tr > th,
  .doc-tbl > tfoot > tr > td,
  .doc-tbl > tbody > tr > td {
    display: table-cell !important;
    padding: 0 !important;
    font-weight: normal !important;
    vertical-align: top !important;
  }

  /* Blocos de conteúdo: padding lateral de página, vertical livre */
  .pg { padding: 6mm 22mm 8mm !important; max-width: none !important; margin: 0 !important; }

  /* Forçar quebra de página antes de um bloco */
  .pb { break-before: page !important; page-break-before: always !important; }
}
```

---

## Injetando um anexo (ex: orçamento dentro de um contrato)

### Regra crítica
O conteúdo do anexo deve entrar **dentro** do `<tbody><tr><td>` da tabela principal —
nunca depois do `</table>` ou antes do `</body>`. Se entrar fora, o thead/tfoot do documento
principal não se repete nas páginas do anexo.

### 1. Extrair apenas o conteúdo interno do anexo (Node.js)

```js
function extractInnerContent(html) {
  // Extrai SOMENTE o conteúdo do tbody > tr > td (sem thead, tfoot, wrapper doc-tbl)
  const tbodyMatch = html.match(
    /<tbody[^>]*>\s*<tr[^>]*>\s*<td[^>]*>([\s\S]*?)<\/td>\s*<\/tr>\s*<\/tbody>/i
  );
  if (tbodyMatch) return tbodyMatch[1].trim();

  // Fallback: documento sem doc-tbl, extrai body inteiro
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  return bodyMatch ? bodyMatch[1].trim() : '';
}
```

### 2. Injetar via marcador dentro do tbody

```js
// No HTML principal: <td>${bodyContent}<!-- APPEND_HERE --></td>

const separador = `
<div class="pb" style="padding:6mm 22mm 0;-webkit-print-color-adjust:exact">
  <div style="padding:5mm 0 4mm;border-top:2px solid #brand;border-bottom:2px solid #brand;
              background:#fff3e0;text-align:center">
    <strong>ANEXO — Documento Nº ${num}</strong>
  </div>
</div>`;

// ✅ CERTO: injeta dentro da tabela
mainHtml = mainHtml.replace('<!-- APPEND_HERE -->', separador + '\n' + innerContent);

// ❌ ERRADO: coloca fora da tabela — thead/tfoot não vai repetir nas páginas do anexo
// mainHtml = mainHtml.replace('</body>', separador + body + '</body>');
```

### 3. Filtrar estilos conflitantes do anexo

```js
function filtrarCssAnexo(css) {
  // Remove @page (documento principal já define)
  let r = css.replace(/@page\s*\{[^}]*\}/g, '');

  // Remove @media print inteiro (evita conflito com o CSS do documento principal)
  let out = ''; let i = 0;
  while (i < r.length) {
    if (r.slice(i).match(/^@media\s+print\s*\{/)) {
      let depth = 0, j = i;
      while (j < r.length) {
        if (r[j] === '{') depth++;
        else if (r[j] === '}') { depth--; if (depth === 0) { j++; break; } }
        j++;
      }
      i = j;
    } else { out += r[i++]; }
  }
  return out;
}
```

---

## Alternativa: Puppeteer server-side puro

Se o PDF é gerado **exclusivamente pelo servidor** (sem botão "Salvar como PDF" no browser),
`headerTemplate`/`footerTemplate` é ainda mais robusto — Puppeteer gerencia o espaço diretamente:

```js
const buffer = await page.pdf({
  format: 'A4',
  printBackground: true,
  displayHeaderFooter: true,
  margin: { top: '24mm', bottom: '16mm', left: '0', right: '0' },
  headerTemplate: `
    <div style="width:100%;padding:4mm 22mm;display:flex;justify-content:space-between;
                align-items:center;border-bottom:2px solid #e87722;font-size:10px;
                font-family:Arial,sans-serif;-webkit-print-color-adjust:exact">
      <img src="data:image/png;base64,${LOGO_B64}" style="height:10mm">
      <span>Documento Nº ${num}</span>
    </div>`,
  footerTemplate: `
    <div style="width:100%;padding:3mm 22mm;text-align:center;font-size:8px;color:#666;
                border-top:1px solid #ddd;font-family:Arial,sans-serif">
      Empresa · CNPJ · Tel.
      <span style="margin-left:8px">
        Página <span class="pageNumber"></span> de <span class="totalPages"></span>
      </span>
    </div>`,
});
// Nota: headerTemplate/footerTemplate aceitam apenas inline styles e imagens em base64
// (URLs externas não funcionam). O margin do page.pdf() define o espaço — não usar @page margin.
```

---

## Checklist de verificação

Antes de considerar o problema resolvido:

- [ ] Nenhum `position: fixed` no `@media print`
- [ ] Existe **uma única** `<table class="doc-tbl">` no documento inteiro
- [ ] `<thead>` tem `display: table-header-group !important` no print CSS
- [ ] `<tfoot>` tem `display: table-footer-group !important` no print CSS
- [ ] `<thead>` e `<tfoot>` estão `display: none` no CSS de tela
- [ ] Todo conteúdo (incluindo anexos) está dentro do `<tbody><tr><td>`
- [ ] Anexo injetado via `<!-- APPEND_HERE -->` dentro do `<td>`, não via `</body>`
- [ ] CSS `@media print` do anexo foi filtrado antes da injeção
- [ ] `.pg` tem apenas padding lateral (~22mm) + pequeno vertical — sem compensações grandes
- [ ] Fotos têm `max-height` e `object-fit: contain` para não estourar a página
- [ ] `@page { size: A4; margin: 0 }` definido no CSS de impressão
