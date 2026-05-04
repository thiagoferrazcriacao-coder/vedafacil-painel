# PRD — VEDAFÁCIL v2.0
## Sistema de Medição, Orçamentação e Execução para Impermeabilização

**Versão:** 2.0 | **Data:** 2026-04-24 | **Status:** Em desenvolvimento ativo

---

## 1. Visão Geral

Sistema end-to-end para a empresa **Vedafácil** (T. R. Ferraz Tecnologia em Impermeabilização EIRELI ME, CNPJ 23.606.470/0001-07, Barra Mansa/RJ), automatizando:

> **Medição → Inbox → Seleção Integral/Parcial → Orçamento → Contrato → Assinatura → Boletos → Agendamento → Execução (Mapa de Serviço) → Relatório Fotográfico → Certificado de Garantia**

**3 aplicações integradas:**
1. **PWA do Medidor** — 3 medidores (Edson, Fernando, Alan)
2. **Painel Administrativo** — escritório
3. **PWA do Aplicador** — equipes de execução (login Gmail da equipe)

---

## 2. BUGS A CORRIGIR (PRIORIDADE IMEDIATA)

### 2.1 Google Calendar não puxa no mobile do medidor
**Problema:** `GOOGLE_CLIENT_ID` está como placeholder `'SEU_GOOGLE_CLIENT_ID_AQUI'` (linha 861). Botão tem `style="display:none"`. Fluxo OAuth usa popup que não funciona bem em mobile.

**Solução:**
1. Configurar `GOOGLE_CLIENT_ID` real (mesmo projeto do painel)
2. Reutilizar o `googleToken` já obtido no login para chamar `/api/calendar/events`
3. Ao logar com Google, automaticamente chamar `loadServerCalendarEvents(token)`
4. Remover `connectGoogleCalendar()` redundante (popup)

### 2.2 Botão "Reabrir medição" no mobile do medidor
**Problema:** Medições `sent` não podem ser editadas (`canEdit = m.status !== 'sent'`)

**Solução:**
1. Adicionar botão "Reabrir" em cards com status `sent`
2. Confirmar ação → mudar status para `draft`
3. Permitir edição completa e reenvio
4. Incluir flag `reaberta: true` no payload para o painel distinguir

---

## 3. NOVAS FUNCIONALIDADES — MEDIÇÃO (PAINEL)

### 3.1 Seleção Integral/Parcial de Medições
Na página de detalhe da medição (`MedicaoDetailPage.jsx`):
- Botão **"Usar Integral"** — cria orçamento com TODOS os locais da medição
- Botão **"Usar Parcial"** — abre modal com checklist dos locais (ex: "Casa de bomba ☑", "Vaga 1 ☑", "Vaga 10 ☐")
- Locais selecionados são passados para a criação do orçamento
- Totais recalculados com base apenas nos locais selecionados
- Medição original permanece intacta — seleção parcial fica registrada no orçamento

### 3.2 Edição de Medições no Painel
Na `MedicaoDetailPage.jsx`:
- Botão "Editar" coloca a página em modo de edição
- Permite alterar dados do cliente, locais, quantidades
- Ao salvar, manter histórico da versão original
- Recalcular totais automaticamente

---

## 4. CÁLCULOS DE OBRA (NO ORÇAMENTO)

### Fórmulas (editáveis em /config)

| Serviço | Rendimento Diário |
|---------|------------------|
| Trincas (m) | 9 m/dia |
| Juntas Frias (m) | 9 m/dia |
| Ralos (unid) | 9 unid/dia |
| J. Dilatação (m) | 9 m/dia |
| Trat. Ferragens (m) | 9 m/dia |
| Juntas Gerber (m) | 9 m/dia |
| Cortina (m²) | 9 m²/dia |
| Mobilização | +0.2 dia fixo |

```
Dias por serviço = ceil(quantidade / rendimento_diario)
Dias totais = soma(dias por serviço) + 0.2
Litros totais = soma(quantidade × fator_produto)
Injetores totais = soma(quantidade × fator_injetor)
```

Exibido como **"Sugestão de produto GVF SEAL: X Lts"** e **"Sugestão de injetores: X Inj."**

---

## 5. CERTIFICADO DE GARANTIA

Nova página/fluxo no painel:
- Dados puxados automaticamente do contrato
- Período configurável (5/7/10/15 anos)
- Assinatura automática de Thiago (`ASSINATURA ELETRONICA.png`)
- Selo visual conforme período
- Texto padrão conforme aba "GARANTIA" da planilha
- Gerar PDF

---

## 6. ART — Anotação de Responsabilidade Técnica

Nova página `/art`:
- Dados da Vedafácil puxados automaticamente
- Dados do cliente e contrato puxados automaticamente
- Quantidades de serviços puxados
- Categoria (Comercial/Residencial/Misto) — checkbox
- Campos editáveis: data início, previsão término, responsável técnico, CREA
- Gerar PDF para envio ao CREA

---

## 7. GESTÃO DE EQUIPES

Nova página `/equipes`:
- CRUD de equipes: nome, email Gmail, membros
- Montar/desmontar equipes (revezamento de funcionários)
- Exemplo: Equipe B — email: `equipebvedafacil@gmail.com` — Membros: Walney, Leandro
- Ao criar OS, atribuir uma equipe

---

## 8. PWA DO APLICADOR

**Login:** Gmail da equipe → seleção de membro ("Quem está usando?")

**Funcionalidades:**
1. Lista de Ordens de Serviço atribuídas
2. Tela de Mapa de Serviço (ponto-a-ponto da medição)
3. Endereço → Google Maps
4. Sugestão de produto e injetores calculados
5. Checklist ponto-a-ponto: Pendente → Em andamento → Concluído
6. Foto **ANTES** (obrigatória ao iniciar) + Foto **DEPOIS** (obrigatória ao concluir)
7. Barra de progresso (% da obra)
8. Ao 100% → marca obra como concluída, notifica painel

---

## 9. MAPA DE SERVIÇO (PAINEL)

Nova página `/ordens-servico`:
- Lista de OS criadas a partir de contratos assinados
- Progresso em tempo real (% concluído)
- Tabela detalhada dos pontos
- Galeria de fotos antes/depois
- Botão gerar Relatório Fotográfico (PDF)
- Criação de OS → agendamento no Google Calendar

---

## 10. AGENDAMENTO GOOGLE CALENDAR

Ao criar OS no painel:
- Criar evento no Google Calendar (título, local, data, equipe, descrição)
- Aplicador visualiza agenda sincronizada no mobile
- Endereço clicável → abre Google Maps para rota

---

## 11. FINANCEIRO / BOLETOS

Nova página `/financeiro`:
- Lista de contratos e status de pagamento
- Gerar boletos a partir das condições de pagamento
- APIs a pesquisar: Sicredi, Sicoob, Itaú, Banco do Brasil
- Marcar parcelas como pagas/recebidas
- Dashboard financeiro

---

## 12. CROQUI + RELATÓRIO FOTOGRÁFICO + OS/TERMO

- **Croqui:** Upload de imagem no painel (futuramente recebido do aplicador)
- **Relatório Fotográfico:** PDF com foto ANTES/DEPOIS por ponto
- **Ordem de Serviço + Termo de Entrega:** PDFs formatados (fase posterior)

---

## 13. FLUXO COMPLETO

| # | Etapa | Status |
|---|-------|--------|
| 1 | MEDIÇÃO (Medidor) | ✅ Feito → [NOVO] Reabrir medição |
| 2 | INBOX (Painel) | ✅ Feito → [NOVO] Editar / Integral/Parcial |
| 3 | ORÇAMENTO | ✅ Feito → [NOVO] Cálculos de obra |
| 4 | CONTRATO | ✅ Feito → ZapSign bloqueado por plano |
| 5 | BOLETOS | 🔲 NOVO (API bancária) |
| 6 | ASSINATURA | 🔲 Bloqueado por plano ZapSign |
| 7 | EQUIPES | 🔲 NOVO (CRUD no painel) |
| 8 | AGENDAMENTO + OS | 🔲 NOVO (Google Calendar) |
| 9 | MAPA DE SERVIÇO | 🔲 NOVO (PWA Aplicador) |
| 10 | CONCLUSÃO | 🔲 NOVO (100% → aviso ao painel) |
| 11 | CERTIFICADO DE GARANTIA | 🔲 NOVO (PDF + assinatura) |
| 12 | ART | 🔲 NOVO (página + PDF) |

---

## 14. PLANO DE IMPLEMENTAÇÃO

| Fase | Módulo |
|------|--------|
| **1** | Corrigir Google Calendar no medidor |
| **1** | Botão "Reabrir medição" no medidor |
| **1** | Edição de medições no painel |
| **1** | Seleção Integral/Parcial no painel |
| **2** | Cálculos de Obra no orçamento |
| **3** | Certificado de Garantia (PDF) |
| **3** | ART (página + PDF) |
| **4** | Gestão de Equipes |
| **4** | Mapa de Serviço no Painel |
| **4** | Agendamento Google Calendar |
| **5** | PWA do Aplicador |
| **6** | Geração de Boletos |
| **7** | Croqui, Relatório Fotográfico, OS/Termo |

---

## 15. ARQUIVOS DE REFERÊNCIA

| Arquivo | Uso |
|---------|-----|
| `3071 - Condomínio Seleto.xls` | Planilha modelo com todas as abas |
| `ASSINATURA ELETRONICA.png` | Assinatura do Thiago para certificados |
| `15 ANOS_Selo de garantia.png` / `7 ANOS_Selo de garantia.png` | Selos de garantia |
| `Logo Vedafacil Rio Oficial - Placa.png` | Logo oficial |
| `Logo Produto GVF SEAL.png` / `Galão de produto GFV SEAL.png` | Imagens de produto |

---

## 16. STACK TÉCNICO

| Camada | Tecnologia |
|--------|-----------|
| PWA Medidor | HTML + CSS + JS puro, Service Worker, localStorage |
| PWA Aplicador | HTML + CSS + JS puro (a criar) |
| Painel Frontend | React 18 + Vite + Tailwind CSS |
| Painel Backend | Node.js + Express (serverless Vercel) |
| Banco de Dados | MongoDB Atlas |
| Geração PDF | Puppeteer + @sparticuz/chromium |
| Assinatura Digital | ZapSign API (sandbox ativo, produção aguarda plano) |
| Agendamento | Google Calendar API |
| Boletos | A definir (Sicredi/Sicoob/Itaú/BB) |
| Deploy | Vercel |
| Auth | JWT + bcryptjs |

---

## 17. PROBLEMAS CONHECIDOS (BLOQUEIOS ATUAIS)

| # | Problema | Severidade | Status |
|---|----------|-----------|--------|
| 1 | ZapSign requer Plano API pago em produção | Alto | Decisão pendente com cliente |
| 2 | Rewrite `/api/zapsign-send` caindo no Express antigo | Alto | Em investigação |
| 3 | Vercel cacheia agressivamente `api/index.js` | Médio | Contornado com função isolada |
| 4 | Google Calendar com CLIENT_ID placeholder no medidor | Médio | A corrigir (Fase 1) |

---

*Documento gerado em 2026-04-24. Atualizar a cada sprint.*
