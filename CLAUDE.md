# VEDAFÁCIL — Sistema de Medição e Orçamentação

---

## 🔒 REGRAS DE GOVERNANÇA — LEIA PRIMEIRO (PRIORIDADE MÁXIMA)

Estas regras são **invioláveis** e se sobrepõem a qualquer outra instrução neste arquivo.

### ❌ NUNCA fazer — sem exceções

| Ação proibida | Motivo |
|---------------|--------|
| `git push --force` / `git push -f` | Apaga histórico no repositório remoto, irreversível |
| `git reset --hard` | Descarta commits locais não publicados |
| `git branch -D main` ou `-d main` | Apaga a branch principal |
| `git checkout -- .` / `git restore .` | Descarta todas as alterações locais |
| `git clean -f` | Remove arquivos não rastreados irreversivelmente |
| `db.dropDatabase()` / `dropDatabase()` | Apaga TODO o banco de produção |
| `deleteMany({})` com filtro vazio | Apaga TODOS os documentos de uma coleção |
| `vercel project rm` / `vercel remove` | Exclui o projeto Vercel (perde env vars e histórico) |
| `vercel env rm` / `vercel env remove` | Remove variáveis de ambiente de produção |
| Apagar arquivos de `painel/src/`, `medidor-app/`, `aplicador-app/` com `rm -rf` | Destrói código-fonte |
| Alterar `.vercel/project.json` | Redireciona deploy para projeto errado = banco errado |

### ⚠️ Sempre perguntar antes de executar

- Qualquer operação que afete **múltiplos registros** no banco (ex: `updateMany`, `deleteMany` com filtro)
- Fazer deploy em produção **sem ter rodado os testes** (`npm test`)
- Alterar variáveis de ambiente no Vercel
- Criar ou deletar índices no MongoDB
- Alterar o schema de colações com dados existentes
- Alterar arquivos de configuração: `vercel.json`, `vite.config.js`, `package.json` (deps), `.env`

### ✅ Fluxo obrigatório para qualquer mudança de código

```
1. Alterar arquivos
2. npm test (painel/)           ← obrigatório
3. Revisar diff com git diff     ← confirmar o que muda
4. Commitar em branch ou em main (sem force)
5. Fazer deploy apenas após testes passarem
```

### 🗂️ Deleções no sistema — regra de ouro

**Toda deleção de registro deve usar a Lixeira** (`salvarNaLixeira`).
- Nunca usar `findOneAndDelete` ou `deleteOne` diretamente sem antes salvar na lixeira
- O usuário pode restaurar itens da lixeira em até 30 dias
- A lixeira é a última proteção contra perda acidental de dados do cliente

### 🔐 Credenciais e segredos

- Nunca exibir valores de env vars completos no chat ou em logs
- Nunca commitar `.env`, `*_b64.txt`, ou arquivos com tokens
- O `.gitignore` deve sempre conter: `node_modules/`, `dist/`, `.env`, `*_b64.txt`, `*.local`

---

## Contexto do Projeto

Sistema completo para a empresa Vedafácil (impermeabilização de estruturas de concreto), composto por:

1. **PWA do Medidor** (`medidor-app/`) — app instalável no celular, offline-first
2. **Painel do Escritório** (`painel/`) — dashboard React para orçamentos, contratos e PDFs
3. **App do Aplicador** (`aplicador-app/`) — PWA para equipes em campo (croqui, fotos, consumo)

## Dados da Empresa

- Razão Social: T. R. FERRAZ TECNOLOGIA EM IMPERMEABILIZACAO EIRELI ME
- Nome fantasia: Vedafácil
- CNPJ: 23.606.470/0001-07
- Endereço: Rua Professora Margarida Fialho Thompson Leite, 670 — Residencial Cristo Redentor
- Cidade: Barra Mansa / UF: RJ — CEP: 27323-755
- Representante: Thiago Ramos Ferraz — CPF: 104.589.167-30

## Medidores

Login exclusivo via Google (OAuth). Cada medidor entra com seu Gmail.
Usuários ativos: **Edson**, **Fernando**, **Alan** (e admin: thiagoferrazcriacao@gmail.com)

## Stack

| Parte | Tecnologia |
|-------|-----------|
| PWA medidor | HTML + CSS + JS puro, Service Worker, localStorage |
| App aplicador | HTML + CSS + JS puro, Service Worker, localStorage |
| Painel frontend | React + Vite + Tailwind CSS |
| Painel backend | Node.js + Express (serverless no Vercel via `api/index.js`) |
| Banco de dados | MongoDB (Mongoose) |
| Geração de PDF | Puppeteer |
| Assinatura digital | ZapSign API |
| Otimização de croqui | Gemini 2.0 Flash (image generation) |
| Deploy medidor | Vercel (`medidor-app` project → `vedafacil-medidor.vercel.app`) |
| Deploy painel | Vercel (`painel` project → `vedafacil-painel.vercel.app`) |
| Deploy aplicador | Vercel (`aplicador-app` project → `vedafacil-aplicador.vercel.app`) |

## URLs de Produção

| App | URL |
|-----|-----|
| PWA Medidor | https://vedafacil-medidor.vercel.app |
| Painel | https://vedafacil-painel.vercel.app |
| Aplicador | https://vedafacil-aplicador.vercel.app |

## Vercel Projects

| Project | projectId | Uso |
|---------|-----------|-----|
| `painel` | `prj_FdThhbFZc6XFWsrNA58AYMG4XGbt` | Painel + backend principal |
| `medidor-app` | `prj_1wiQRLeQNWcCvBAz17aUQIxH4NmI` | PWA do medidor |

**IMPORTANTE:** Nunca mudar o `.vercel/project.json` — apontar para o projeto errado causa perda de dados (MongoDB diferente).

## Variáveis de Ambiente — Painel (Vercel Production)

| Variável | Descrição |
|----------|-----------|
| `MONGODB_URI` | URI do MongoDB Atlas |
| `JWT_SECRET` | Segredo para assinar tokens JWT |
| `ADMIN_USER` | Usuário admin do painel |
| `ADMIN_PASSWORD` | Senha admin do painel |
| `GOOGLE_CLIENT_ID` | OAuth 2.0 Client ID (sem trailing `\n`) |
| `GOOGLE_CLIENT_SECRET` | OAuth 2.0 Client Secret (sem trailing `\n`) |
| `GOOGLE_REDIRECT_URI` | `https://vedafacil-painel.vercel.app/api/auth/google/callback` |
| `MEDIDOR_URL` | `https://vedafacil-medidor.vercel.app` |
| `ZAPSIGN_API_TOKEN` | Token da ZapSign |
| `GEMINI_API_KEY` | Chave da API Gemini (opcional — sem ela, croqui não é otimizado mas não dá erro) |

**CRÍTICO ao adicionar env vars via CLI:** usar `printf '%s' 'valor'` em vez de `echo` para evitar `\n` no final que causa erro 400 no OAuth do Google. O servidor já faz `.trim()` como proteção adicional.

```bash
# Exemplo correto:
printf '%s' 'minha-chave' | npx vercel env add GEMINI_API_KEY production
# NÃO usar: echo "minha-chave" | npx vercel env add ...
```

## Google OAuth — Fluxo

1. Medidor acessa https://vedafacil-medidor.vercel.app
2. Clica "Entrar com Google" → `window.location.href` vai direto para `vedafacil-painel.vercel.app/api/auth/google?source=medidor`
3. Servidor gera URL OAuth e redireciona para Google
4. Após login Google, callback em `/api/auth/google/callback`
5. Servidor cria JWT, redireciona de volta ao medidor com `#google_token=...`
6. PWA armazena sessão no localStorage (validade 30 dias)

Redirect URI registrado no Google Cloud Console: `https://vedafacil-painel.vercel.app/api/auth/google/callback`

**CRÍTICO:** `getOAuthClient()` em `server.js` faz `.trim()` em todas as env vars do Google para evitar erros causados por `\n` residual.

## Deploy

**Painel:**
```bash
cd painel
npx vercel --prod
npx vercel alias set <novo-deploy-url>.vercel.app vedafacil-painel.vercel.app
```

**Medidor:**
```bash
cd medidor-app
npx vercel --prod
npx vercel alias set <novo-deploy-url>.vercel.app vedafacil-medidor.vercel.app
```

**Aplicador:**
```bash
cd aplicador-app
npx vercel --prod
npx vercel alias set <novo-deploy-url>.vercel.app vedafacil-aplicador.vercel.app
```

## Cores e Design

- Cor primária PWA medidor: `#e87722` (laranja)
- Cor primária painel: sidebar laranja com gradiente `linear-gradient(180deg, #c45d12 0%, #e87722 50%, #f59340 100%)`
- Logo: `painel/public/logo.png` (copiado de `transparent/logo_transparent.png`)
- Tipografia: system-ui / -apple-system
- Cards brancos, sombra suave, bordas arredondadas

### Tailwind — utilitários personalizados (`painel/tailwind.config.js`)
```js
backgroundImage: {
  'gradient-orange':   'linear-gradient(180deg, #c45d12 0%, #e87722 50%, #f59340 100%)',
  'gradient-orange-h': 'linear-gradient(135deg, #c45d12 0%, #e87722 100%)',
}
```

## Preços Padrão (configuráveis no painel)

| Serviço | Unidade | Preço |
|---------|---------|-------|
| Trincas | m | R$ 950 |
| Juntas Frias | m | R$ 950 |
| Ralos | unid | R$ 750 |
| Juntas de Dilatação | m | R$ 950 |
| Tratamento de Ferragens | m | R$ 120 |
| Cortinas | m² | R$ 1.020 |
| ART Engº | unid | R$ 300 |
| Mobilização | unid | R$ 300 |

## Regras Críticas de UX

### PWA Medidor (`medidor-app/index.html`)

- Campo de medição com soma múltipla (Etapa 2): cada campo tem múltiplos inputs somados automaticamente
  - Ex: Trincas `[2] + [1] + [3] = 6m`
  - Botão "+" adiciona input, "×" remove (mínimo 1)
  - Funciona bem com o dedo no celular
- Fotos por local: `capture="environment"` no input para abrir câmera diretamente
  - **CRÍTICO:** o listener `change` deve ser adicionado diretamente no elemento input via `addEventListener` — NÃO usar event delegation via `locations-list` (não funciona de forma confiável no mobile)
  - Código correto em `buildLocationCard`:
    ```js
    const photoInput = document.createElement('input');
    photoInput.type = 'file';
    photoInput.accept = 'image/*';
    photoInput.capture = 'environment';
    photoInput.multiple = true;
    photoInput.style.display = 'none';
    photoInput.dataset.loc = idx;
    photoInput.addEventListener('change', handleLocationPhotoSelect); // direto no elemento
    ```
- Service Worker: versão atual **v16** (`vedafacil-medidor-v16`) — incrementar a cada deploy que altera `index.html` ou `sw.js`

### App Aplicador (`aplicador-app/index.html`) — Croqui Canvas

Todas as funções que limpam ou salvam o canvas DEVEM preencher fundo branco antes de desenhar, pois JPEG não tem canal alpha (transparente → preto):

```js
ctx.fillStyle = '#FFFFFF';
ctx.fillRect(0, 0, canvas.width, canvas.height);
```

Funções afetadas: `salvarCroqui()`, `initCroquiCanvas()`, `limparCroqui()`, `otimizarCroqui()` (img.onload), e qualquer `clearRect`.

`salvarCroqui()` usa canvas offscreen + PNG:
```js
const temp = document.createElement('canvas');
// ... copia dimensões, preenche branco, drawImage, exporta como PNG
temp.toDataURL('image/png')
```

### Painel (`painel/`)

- Rota Express: `/api/aplicador/os/compartilhadas` DEVE estar ANTES de `/api/aplicador/os/:id`
- Rota Express: `/api/equipes/localizacao` DEVE estar ANTES de `/api/equipes/:id`
- Dashboard mostra consumo de produto (GVF Seal) separado: Obras vs Reparos

## Webhook

O PWA envia JSON via POST para `https://vedafacil-painel.vercel.app/api/medicao`.
`WEBHOOK_URL` está hardcoded em `medidor-app/index.html`.

## Croquis

- Página `/croquis` no painel mostra galeria de todos os croquis desenhados pelos aplicadores
- Backend: `GET /api/croquis` (auth obrigatório) — agrega `pontos[*].croquiBase64` de todas as OSes
- Suporte a IA (badge 🤖) quando `pontos[*].croquiOtimizado` está presente
- Otimização: `POST /api/croqui/otimizar` envia imagem base64 para Gemini 2.0 Flash image generation
  - Requer env var `GEMINI_API_KEY` no projeto `painel` no Vercel
  - Se não houver chave, retorna imagem original sem erro (fallback silencioso)
- PDF de Garantia inclui página de croqui após as fotos antes/depois

## Equipes — Localização em Tempo Real

- `GET /api/equipes/localizacao` retorna cada equipe com sua OS atual (`em_andamento`)
- Frontend `EquipesPage.jsx` mostra card "Em andamento" com OS nº, cliente, endereço e indicador pulsante amarelo
- Sem OS ativa → card cinza "Sem obra em andamento"

## Contratos — Filtros de Período

`ContratosPage.jsx` tem filtros rápidos: **Hoje / Semana / Mês / Mês passado / Próximo mês / Personalizado**

Cards de resumo no topo:
- **Rascunho** — qtd + valor total
- **Pend. Assinatura** — qtd + valor total
- **Assinado** — qtd + valor total

Calculados via `useMemo` a partir dos contratos filtrados.

## Campos de Formulário — Medidor (Etapa 1)

- `Responsável (síndico/zelador)` — label atualizado de "AC"
- `Celular do Responsável` — label atualizado de "Celular"
- `Garantia`: radios **15 anos** (padrão) / **7 anos** — persistido em `currentMeasurement.garantia`
- `Precisa de andaime?`: radios **Não** (padrão) / **Sim** — persistido em `currentMeasurement.andaime`
- Obs removida da Etapa 1 → movida para Etapa 3 (Resumo)
- Botão Etapa 3: `CONCLUIR` (salva rascunho + volta à Home) — sem "Enviar Medição" nesta tela
- Envio manual via botão "Enviar agora" na Home (card do rascunho)

### Agenda (Medidor) — Visualização

- Toggle **Dia / Semana** (padrão: Semana)
- Modo Dia: navegação por dia com setas ◀ ▶ + label da data
- Botão "🗺️ Google Maps" em cada evento com endereço
- Badge **ATRASADO** em eventos com horário definido e data passada

### Orçamento Mínimo (Painel)

- Toggle "🔖 Orç. Mínimo" no header do `OrcamentoFormPage`
- Quando ativo: campo `Total Mínimo` editável + banner informativo
- PDF simplificado: logo, dados do cliente, lista numerada de locais, valor total em destaque
- Campos no schema: `orcMinimo: Boolean`, `totalMinimo: Number`
- `buildOrcamentoPdfHtml()` detecta `o.orcMinimo === true` e retorna layout mínimo antes do HTML normal

### OS — Técnico Responsável

- Campo `tecnicoResponsavel: String` adicionado ao schema de OS em `server.js`
- Disponível no form de **Nova OS** (`OrdensServicoPage.jsx`) e na edição da **OSDetailPage.jsx**
- Lista de técnicos carregada via `api.getPrecos()` (usa `precos.tecnicos`)
- Exibido em cards de OS no painel (badge laranja) e no app aplicador (card + detalhe)

### Técnicos Responsáveis (ConfigPage)

- Nova seção na ConfigPage para gerenciar lista de técnicos
- Técnicos salvos em `precos.tecnicos: [String]`
- Padrão: `['Alan', 'Fernando', 'Thiago', 'Daniel']`
- Pills removíveis + input + botão "Adicionar" + Enter para adicionar

### Data de Término Automática (Contratos)

- `ContratoFormPage.jsx`: `dataTermino` calculada automaticamente via `addBusinessDays(dataInicio, prazoExecucao)`
- Recalcula ao alterar `dataInicio` ou `prazoExecucao`
- Campo exibido como "calculada automaticamente" (ainda editável)

### OS Filtros Avançados (Painel)

- `OrdensServicoPage.jsx` tem filtros combinados via `useMemo`:
  - Tipo: Todos / Obra / Reparo
  - Status: Todos / Agendada / Em Andamento / Aguard. Assinatura / Concluída / Cancelada
  - Equipe: dropdown das equipes
  - Período: botões rápidos Hoje / Semana / Mês / Mês passado / Personalizado + range de datas
- Badge REPARO (âmbar) nos cards de OS com `tipo === 'reparo'`

### App Aplicador — Mapa de Serviço

- Botão "📋 Ver Mapa de Serviço" aparece nos locais que têm `subPontos.length > 0`
- `abrirMapaServico()` abre modal com: barra de progresso, lista de sub-pontos com status, fotos de referência (se `p.fotosMedicao`), observações do ponto

### App Aplicador — Finalização do Dia

- Campo "Quantidade de injetores utilizados" adicionado ao modal de fechar dia
- Enviado como `body.injetores` para `PATCH /api/aplicador/os/:id/fechar-dia`
- Armazenado em `fechamentosDia[*].injetores`
- Toast mostra: `🌅 Dia fechado! 12.5L · 48 injetores`

## Status do Projeto (2026-04-30)

### Painel: Agenda de Obras (`/agenda`)

- Página `AgendaPage.jsx` com rota `/agenda` na sidebar (ícone calendário)
- **Vista Mês**: grade 7×N dias, OS exibidas como chips coloridos por status cobrindo o range `dataInicio→dataTermino`
- **Vista Lista**: OSes do mês ordenadas por dataInicio, com badge de prazo restante (dias restantes / ATRASADO)
- Filtros: Status + Tipo (Obra/Reparo)
- Navegação: botões Mês anterior / Próximo mês + botão "Hoje"
- Legenda de cores por status + resumo (total, em andamento, agendadas, concluídas)
- Chips clicáveis → navega para OS detail

### Painel: Reparos — Fotos do Problema

- `NovoReparoModal` (Step 2) agora tem grid de upload de fotos/vídeos
- Campo: grid 3 colunas com preview, botão × para remover, label input file aceita `image/*,video/*`
- `fotosReparo: [Mixed]` adicionado ao schema de OS em `server.js`
- Endpoint `POST /api/reparos/from-os` agora aceita `fotosReparo: [base64]`
- `OSDetailPage.jsx` exibe as fotos do reparo em grid 3 colunas quando presentes

### ✅ Concluído e em produção
- PWA medidor: login Google, medição com fotos (câmera direta), envio para painel, offline-first (SW v16)
- Medidor: labels Responsável/Celular do Responsável, radios Garantia 15/7 anos, Andaime Sim/Não, Obs na Etapa 3
- Medidor: agenda com toggle Dia/Semana, navegação por dia, Maps button, badge ATRASADO
- Painel: orçamentos, contratos (filtros período + cards resumo), PDFs, ZapSign, OSes, equipes
- Painel: Orçamento Mínimo (toggle + PDF simplificado + campo totalMinimo)
- Painel: OS com filtros avançados (tipo, equipe, período, status), badge REPARO
- Painel: OS nova + edição com campo Técnico Responsável (select da lista de técnicos)
- Painel: ConfigPage com lista editável de técnicos responsáveis
- Painel: ContratosPage — data término auto via dias úteis
- Painel: Agenda de Obras (`/agenda`) — calendario mensal + vista lista com status e prazo
- Painel: Reparos — upload fotos/vídeos do problema no modal + exibição na OS detail
- Dashboard com métricas e consumo de produto separado (obras vs reparos)
- Croquis: galeria no painel com filtros, modal, badge IA; canvas fundo branco; PDF de garantia inclui croqui
- Aplicador PWA: OSes compartilhadas, croqui com fundo branco em PNG, otimização Gemini
- Aplicador PWA: WhatsApp do Síndico, Mapa de Serviço (modal sub-pontos), campo injetores no fechar-dia
- Equipes: card de obra atual em tempo real (endpoint `/api/equipes/localizacao`)
- Google OAuth: Client ID + Secret sem trailing newline, `.trim()` no servidor, redirect direto (sem pre-check)
- Logo Vedafácil na sidebar do painel; gradiente laranja

### 🔲 Pendente / A verificar
- Envio de orçamento ("não passa dessa parte") — bug reportado, não investigado completamente
- Adicionar `GEMINI_API_KEY` ao Vercel (painel) para ativar otimização de croqui com IA
- OS Compartilhada: registro parcial de consumo quando redirecionado
- PWA Aplicador: redesign completo — cards maiores com botões de ação diretos visíveis sem abrir a OS
