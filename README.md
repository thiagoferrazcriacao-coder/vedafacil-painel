# Vedafácil — Sistema de Medição e Orçamentação

Sistema completo para impermeabilização: **PWA do Medidor** (celular) + **Painel do Escritório** (web).

---

## Estrutura

```
vedafacil/
├── medidor-app/          # PWA para celular (instala sem App Store)
│   ├── index.html        # App completo (HTML/CSS/JS puro)
│   ├── sw.js             # Service Worker (offline)
│   ├── manifest.json     # PWA manifest
│   └── vercel.json       # Config deploy Vercel
├── painel/               # Dashboard do escritório
│   ├── server.js         # Backend Express + MongoDB
│   ├── api/index.js      # Vercel Serverless entry
│   ├── src/              # Frontend React
│   ├── vercel.json       # Config deploy Vercel
│   └── .env.example      # Variáveis de ambiente
└── README.md
```

---

## DEPLOY — Passo a passo completo

### PASSO 1 — Criar conta no MongoDB Atlas (banco de dados gratuito)

1. Acesse **mongodb.com/atlas** e clique em **"Try Free"**
2. Crie uma conta (pode usar Google)
3. Escolha o plano **Free (M0)**
4. Escolha a região mais próxima (ex: São Paulo)
5. Clique em **"Create Deployment"**
6. Na tela "Connect", crie um usuário:
   - Username: `vedafacil`
   - Password: **gere uma senha aleatória forte** (use 1Password / Bitwarden / gerador) — NUNCA use exemplos prontos
   - Clique **"Create Database User"**
7. Em "Where would you like to connect from?" → escolha **"My Local Environment"** → adicione `0.0.0.0/0` no IP (permite conexão de qualquer lugar)
8. Clique **"Finish and Close"** → **"Go to Overview"**
9. Clique em **"Connect"** → **"Drivers"** → copie a connection string fornecida pelo Atlas
   - Substitua `<password>` pela senha que você criou no passo anterior
   - **Guarde essa string** — será usada no Vercel como variável `MONGODB_URI`

---

### PASSO 2 — Subir o PWA do Medidor no GitHub + Vercel

#### 2a. Criar repositório no GitHub

1. Acesse **github.com** e faça login
2. Clique em **"New repository"**
3. Nome: `vedafacil-medidor`
4. Deixe **Public** (ou Private)
5. Clique **"Create repository"**
6. Na tela do repo, clique em **"uploading an existing file"**
7. Arraste os 4 arquivos da pasta `medidor-app/`:
   - `index.html`
   - `sw.js`
   - `manifest.json`
   - `vercel.json`
8. Clique **"Commit changes"**

#### 2b. Deploy no Vercel

1. Acesse **vercel.com** e faça login com GitHub
2. Clique em **"Add New Project"**
3. Selecione o repo `vedafacil-medidor`
4. **Não precisa configurar nada** — Vercel detecta automaticamente
5. Clique **"Deploy"**
6. Aguarde ~1 minuto → copie a URL gerada (ex: `https://vedafacil-medidor.vercel.app`)

---

### PASSO 3 — Subir o Painel no GitHub + Vercel

#### 3a. Criar repositório no GitHub

1. Crie um novo repositório: `vedafacil-painel`
2. Faça upload de **toda a pasta `painel/`** (todos os arquivos e subpastas)
   - Se tiver muitos arquivos, use o GitHub Desktop (mais fácil para pastas)
   - Ou instale o Git e use o terminal (instruções abaixo)

**Opção com GitHub Desktop:**
1. Baixe **desktop.github.com** e instale
2. Faça login com sua conta GitHub
3. Clique em **"Add an Existing Repository from your Hard Drive"**
4. Selecione a pasta `painel/`
5. Publique no GitHub como `vedafacil-painel`

#### 3b. Deploy no Vercel

1. No Vercel, clique em **"Add New Project"**
2. Selecione o repo `vedafacil-painel`
3. **Framework Preset:** selecione **"Vite"**
4. **Build Command:** `npm run vercel-build`
5. **Output Directory:** `dist`
6. Abra a seção **"Environment Variables"** e adicione:

| Nome | Valor |
|------|-------|
| `MONGODB_URI` | sua string do MongoDB Atlas (passo 1) |
| `ADMIN_USER` | `daniel` |
| `ADMIN_PASSWORD` | escolha uma senha |
| `JWT_SECRET` | qualquer texto longo aleatório (ex: `vedafacil-jwt-2024-xkz9`) |
| `ZAPSIGN_API_TOKEN` | seu token ZapSign (quando tiver) |
| `WEBHOOK_SECRET` | qualquer texto (ex: `webhook-veda-2024`) |

7. Clique **"Deploy"**
8. Aguarde ~3 minutos → copie a URL (ex: `https://vedafacil-painel.vercel.app`)

---

### PASSO 4 — Conectar o PWA ao Painel

1. Abra o arquivo `medidor-app/index.html`
2. Encontre a linha (perto do início do `<script>`):
   ```javascript
   const WEBHOOK_URL = 'CONFIGURE_WEBHOOK_URL_HERE';
   ```
3. Substitua por:
   ```javascript
   const WEBHOOK_URL = 'https://vedafacil-painel.vercel.app/api/medicao';
   ```
   (use a URL real do seu painel)
4. Salve o arquivo
5. No GitHub, vá no repo `vedafacil-medidor` → edite o `index.html` → cole o conteúdo atualizado → commit
6. O Vercel faz o redeploy automaticamente em ~1 minuto

---

### PASSO 5 — Instalar o PWA no celular

**iPhone (Safari):**
1. Abra `https://vedafacil-medidor.vercel.app` no Safari
2. Toque no ícone de compartilhar (quadrado com seta)
3. Role para baixo → **"Adicionar à Tela de Início"**
4. Toque **"Adicionar"**

**Android (Chrome):**
1. Abra a URL no Chrome
2. Toque nos 3 pontos (menu) → **"Adicionar à tela inicial"**
3. Ou aguarde o banner aparecer automaticamente

---

## Acessar o painel

- URL: `https://vedafacil-painel.vercel.app`
- Usuário: `daniel` (ou o que configurou em `ADMIN_USER`)
- Senha: a que você configurou em `ADMIN_PASSWORD`

---

## Fluxo de Trabalho

```
Medidor no campo
    ↓ Abre o PWA no celular
    ↓ Registra medição (cliente, locais, fotos)
    ↓ Envia (fila offline automática)
    ↓
Painel do escritório
    ↓ Recebe medição no Inbox
    ↓ Clica "Gerar Orçamento"
    ↓ Ajusta preços → Gerar PDF
    ↓ Envia PDF ao cliente
    ↓ Cliente aprova → Gerar Contrato
    ↓ Envia para ZapSign → assinatura digital
```

---

## Medidores

Três usuários fixos (sem senha — só selecionar o nome no app):
- **Edson** · **Fernando** · **Alan**

---

## Preços Padrão (editáveis no painel em Configurações)

| Serviço | Preço |
|---------|-------|
| Trincas | R$ 950/m |
| Juntas Frias | R$ 950/m |
| Ralos | R$ 750/unid |
| Juntas de Dilatação | R$ 950/m |
| Tratamento de Ferragens | R$ 120/m |
| Cortinas | R$ 1.020/m² |
| ART Engº | R$ 300 |
| Mobilização | R$ 300 |

---

## Dados da Empresa

- **Razão Social:** T. R. FERRAZ TECNOLOGIA EM IMPERMEABILIZACAO EIRELI ME
- **CNPJ:** 23.606.470/0001-07
- **Endereço:** Rua Professora Margarida Fialho Thompson Leite, 670 — Residencial Cristo Redentor — Barra Mansa/RJ — CEP: 27323-755
- **Representante:** Thiago Ramos Ferraz — CPF: 104.589.167-30
