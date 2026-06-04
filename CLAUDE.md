# VEDAFÁCIL — Sistema de Medição e Orçamentação

---

## 🔒 REGRAS DE GOVERNANÇA — LEIA PRIMEIRO (PRIORIDADE MÁXIMA)

Estas regras são **invioláveis** e se sobrepõem a qualquer outra instrução neste arquivo.

### 🛡️ Camadas de proteção ativas

| Camada | O que protege | Onde fica |
|--------|--------------|-----------|
| **1 — Claude settings (projeto)** | Bloqueia comandos destrutivos antes de executar | `.claude/settings.json` |
| **2 — Claude settings (global)** | Proteção base em qualquer projeto | `~/.claude/settings.json` |
| **3 — Git hook pre-commit** | Bloqueia commits com credenciais e arquivos grandes | `.git/hooks/pre-commit` |
| **4 — Git hook pre-push** | Bloqueia force push e avisa push em main | `.git/hooks/pre-push` |
| **5 — MongoDB usuário restrito** | Usuário do app sem permissão de dropDatabase | MongoDB Atlas *(configurar manualmente)* |
| **6 — GitHub branch protection** | Impede push direto em main sem revisão | GitHub Settings *(configurar manualmente)* |

### ❌ NUNCA fazer — sem exceções (bloqueado automaticamente pelo settings.json)

| Ação proibida | Motivo |
|---------------|--------|
| `git push --force` / `git push -f` / `--force-with-lease` | Apaga histórico no repositório remoto, irreversível |
| `git reset --hard` | Descarta commits locais não publicados |
| `git branch -D main` ou `-d main` | Apaga a branch principal |
| `git checkout -- .` / `git restore .` / `git checkout -- *` | Descarta todas as alterações locais |
| `git clean -f` / `git clean -fd` | Remove arquivos não rastreados irreversivelmente |
| `git rebase -i` | Reescreve histórico de commits |
| `db.dropDatabase()` / `dropDatabase()` / `drop()` / `dropCollection()` | Apaga coleção ou banco inteiro |
| `deleteMany({})` com filtro vazio | Apaga TODOS os documentos de uma coleção |
| `vercel project rm` / `vercel remove` / `vercel alias rm` | Exclui projeto Vercel ou alias de produção |
| `vercel env rm` / `vercel env remove` | Remove variáveis de ambiente de produção |
| `rm -rf painel` / `rm -rf medidor-app` / `rm -rf aplicador-app` / `rm -rf .` | Destrói código-fonte |
| `rd /s /q` em diretórios do projeto (Windows) | Equivalente ao rm -rf no Windows |
| Alterar `.vercel/project.json` | Redireciona deploy para projeto errado = banco errado |

### ⚠️ Sempre perguntar antes de executar

- Qualquer operação que afete **múltiplos registros** no banco (ex: `updateMany`, `deleteMany` com filtro)
- Fazer deploy em produção **sem ter rodado os testes** (`npm test`)
- Alterar variáveis de ambiente no Vercel
- Criar ou deletar índices no MongoDB
- Alterar o schema de coleções com dados existentes
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
- O hook pre-commit bloqueia automaticamente commits com esses arquivos

### 🧟 PROIBIDO: padrão de conexão Mongoose zumbi (causou incidente 03/06/2026)

**NUNCA escrever este padrão** em `painel/server.js` ou em qualquer função serverless:

```js
// ❌ ERRADO — causa "buffering timed out after 10000ms"
let isConnected = false;
async function connectDB() {
  if (isConnected) return;
  await mongoose.connect(URI);
  isConnected = true;
}
```

**Por que é proibido:** em serverless (Vercel), containers ficam ociosos e o Atlas mata o socket TCP depois de ~10 min, mas a flag boolean continua `true` em memória. A próxima request tenta usar conexão morta, Mongoose bufferiza esperando, e dá timeout de exatos 10s. Isso travou o sistema em produção dia 03/06/2026.

**Sempre usar o padrão correto** (já implementado em `connectDB()`):
- Validar `mongoose.connection.readyState === 1` em vez de boolean
- Passar `bufferCommands: false` ao `mongoose.connect()` para falhar rápido
- Passar `maxPoolSize: 2` (Vercel Pro mantém muitos containers warm; com pool 5 estouramos o Flex em 90% com ~100 containers)
- Passar `maxIdleTimeMS: 30000` (fecha conexões ociosas em 30s — containers Vercel morrem sem SIGTERM, sem isso o Atlas fica com conexões pendentes ~10 min)
- Passar `waitQueueTimeoutMS: 5000` (espera no máximo 5s por conexão livre antes de falhar)
- Passar `serverSelectionTimeoutMS: 5000` para detectar Atlas indisponível em 5s
- Listeners `disconnected`/`error`/`connected` para sincronizar a flag

**Regra geral:** em endpoints que usam Mongoose, sempre `await connectDB()` no início do handler — o `connectDB` real revalida o `readyState` a cada chamada.

### 📦 PROIBIDO: retornar fotos/PDFs base64 em listagens (causou incidente 03/06/2026)

`/api/ordens-servico`, `/api/medicoes`, `/api/orcamentos`, `/api/contratos` e qualquer outro endpoint de **lista** DEVE usar `.select()` ou `$project` para **excluir** campos base64 pesados:

- OS: `fotosReparo`, `pontos.fotos`, `pontos.fotosAntes`, `pontos.fotosDepois`, `pontos.fotosMedicao`, `pontos.croquiBase64`, `pontos.croquiOtimizado`, `fechamentosDia.fotos`, `pdfBase64`, `contratoManualPdfBase64`
- Medição: `fotos`, `locais.fotos`, `locais.fotosMedicao`
- Orçamento: `pdfBase64`, `propostas`, `locais.fotos`, `locais.fotosMedicao`
- Contrato: `pdfBase64`, `pdfManualBase64`, `anexoOrcamentoPdfBase64`, `textoHtml`, `clausulas`, `locais.fotos`, `locais.fotosMedicao`

Sem isso, listagens chegam a **20 MB** (vimos isso no incidente). Equipe em campo no 4G simplesmente não consegue usar.

Para a UI manter o que precisa (ex: badge de croqui na listagem de OS), retornar **flags booleanos computados** (`temCroqui: true/false`) via `$addFields` do aggregate em vez do base64 inteiro.

Detalhes completos (com fotos) continuam vindo via `GET /api/<recurso>/:id` que **NÃO** filtra.

---

## Contexto do Projeto

Sistema completo para a empresa Vedafácil (impermeabilização de estruturas de concreto), composto por:

1. **PWA do Medidor** (`medidor-app/`) — app instalável no celular, offline-first
2. **Painel do Escritório** (`painel/`) — dashboard React para orçamentos, contratos e PDFs
3. **App do Aplicador** (`aplicador-app/`) — PWA para equipes em campo (croqui, fotos, consumo)

## Dados da Empresa

- Razão Social: T. R. FERRAZ TECNOLOGIA EM IMPERMEABILIZACAO EIRELI ME
- Nome fantasia: Vedafácil
- **⚠️ Em mensagens WhatsApp, textos do sistema e código novo: escrever sempre `Vedafacil` (SEM acento) — é assim que o cliente quer.**
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
- Service Worker: versão atual **v17** (`vedafacil-medidor-v17`) — incrementar a cada deploy que altera `index.html` ou `sw.js`
- Status `reaberta`: medição reaberta pelo painel usa PUT em vez de POST ao reenviar

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

## Status do Projeto (2026-05-13)

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
- Dívidas técnicas: sanitizeImages() wired, lib/helpers.js extraído, 44 testes Vitest passando
- Governança: .claude/settings.json, git hooks, backup script, CLAUDE.md, MongoDB user restrito
- Medidor: `bairro` field, CEP auto-fill com bairro, status `reaberta` + PUT reenvio (SW v17)
- Painel: PUT /api/medicoes/:id, botão Reabrir na MedicaoDetailPage
- Painel: OrcamentoFormPage — removido origem/sigla, validade type=number, bairro field, elaboradoPor auto-fill, andaime radio, propostas com valores calculados, seção 5 completa com totais
- Painel: MedicoesPage — modal Nova Medição Manual + endpoint POST /api/medicoes/manual
- Painel: OrcamentosPage — botões PDF/Duplicar/Aprovar com ícones e cores
- Painel: ContratosPage — botões rápidos Pend./Assinado por linha
- Painel: ContratoFormPage — campo bairro
- Painel: GarantiasPage — modal de edição completo
- Painel: Croqui — vista agrupada por OS com botão PDF, toggle galeria/OS
- Painel: Equipes/Ranking — score melhorado (+10 obra concluída, +3 reparo próprio), métricas Obras Exec. e Reparos Próprios
- Painel: Roles — operador (sem Config/Users/Lixeira), login com senha, ProtectedRoute adminOnly
- App Aplicador: lightbox fullscreen de fotos (overlay in-app, prev/next, ESC), SW v8
- App Aplicador: debounce 400ms no toggleSubponto
- App Aplicador: reparo — sem croqui, fotos do problema exibidas no local
- Backend: /api/me endpoint, numMedicao auto-increment, PUT medicoes/:id, manual medicao, ranking melhorado, role operador
- Aplicador PWA: toolbar de croqui em 2 linhas (sem scroll horizontal), SW v22
- Aplicador PWA: ferramenta de texto refeita com overlay arrastável + rotacionável (⠿ arrastar + ↻ handle)
- Aplicador PWA: otimização IA croqui via `gemini-2.5-flash` → SVG vetorial (linhas retas, círculos perfeitos)
  - viewBox usa dimensões reais do canvas; escala `contain` ao renderizar (sem distorção no celular)
  - Fallback: alto contraste local se Gemini indisponível
  - GEMINI_API_KEY configurada no Vercel (Nível 1, faturamento ativo)
- Aplicador PWA: bug fix `croquiOtimizado` → ao salvar manualmente, campo zerado no server (evita carregar versão IA antiga)
- Aplicador PWA: bug fix SVG/imagem IA desenhada em coords físicas (canvas.width) em vez de CSS — corrigido para W/H = canvas/dpr
- Painel: PDF do Contrato inclui o Orçamento vinculado como ANEXO CONTRATUAL nas últimas páginas
  - Gerado pelo endpoint `/api/contratos/:id/pdf` usando `c.orcamentoId`
  - Separador laranja "ANEXO CONTRATUAL — Orçamento Nº XXXX" entre contrato e orçamento

### App Aplicador — Ferramenta de Texto (croqui)

- `openTextOverlay(x, y)` abre overlay flutuante no ponto clicado
- Barra laranja "⠿ ARRASTAR" no topo → arrastar para mover
- Handle ↻ (círculo laranja acima) → arrastar para girar em qualquer ângulo
- Botões ✓ OK (confirma + grava no canvas) e ✕ (cancela)
- Enter = confirmar, Escape = cancelar
- Rotação: `_TXT.rot = atan2(mouseY - centerY, mouseX - centerX) + π/2`
- Commit usa `ctx.translate(_TXT.x, _TXT.y)` + `ctx.rotate(_TXT.rot)`
- `getCroquiPos(e, canvas)` como função global para `handleTextTool`

### App Aplicador — Croqui IA (`gemini-2.5-flash`)

- Modelo único disponível para nova conta: `gemini-2.5-flash` (outros 404)
- SVG como estratégia primária: texto + visão → prompt CAD agressivo
- viewBox = `canvasW × canvasH` (proporção real do celular, não 1000×1000 fixo)
- Cliente envia `canvasW, canvasH` no body da requisição
- Renderização: `_drawOnCanvas(img)` com contain scaling + centralização
- `croquiOtimizado` limpo quando salva manualmente (`otimizado: false`)

### 🔲 Pendente / A verificar
- Envio de orçamento ("não passa dessa parte") — bug reportado, não investigado completamente
- OS Compartilhada: registro parcial de consumo quando redirecionado
- MongoDB Atlas: criar usuário `vedafacil_app` com permissão `readWrite` only (manual — sem dropDatabase)
- 5.3: Rebuild PDF garantia (aguardando leitura do PDF modelo)
- 3.9: Orçamento Mínimo PDF (aguardando leitura do PDF modelo)
- 12.3 / 12.4: Melhorias na aba Compartilhadas e layout do Aplicador
- 12.6: Histórico de execução em reparo
- 7.1: Mapa completo de sub-itens em ReparosPage
