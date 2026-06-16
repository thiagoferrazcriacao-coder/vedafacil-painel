import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';

// Sanitizador SVG manual (substitui DOMPurify que quebra no runtime Vercel)
// Remove vetores conhecidos de XSS: <script>, on*= handlers, javascript: URIs, <foreignObject>
function sanitizeSvg(svg) {
  if (!svg || typeof svg !== 'string') return null;
  return svg
    // Remove <script>...</script> (com qualquer conteúdo, multi-linha)
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<script[^>]*\/?>/gi, '')
    // Remove <foreignObject> (pode embutir HTML arbitrário)
    .replace(/<foreignObject[\s\S]*?<\/foreignObject>/gi, '')
    .replace(/<foreignObject[^>]*\/?>/gi, '')
    // Remove handlers on*= (onclick, onload, onerror, etc.)
    .replace(/\s+on[a-z]+\s*=\s*"[^"]*"/gi, '')
    .replace(/\s+on[a-z]+\s*=\s*'[^']*'/gi, '')
    .replace(/\s+on[a-z]+\s*=\s*[^\s>]+/gi, '')
    // Remove javascript: e data: em href/xlink:href
    .replace(/(?:xlink:)?href\s*=\s*"javascript:[^"]*"/gi, 'href="#"')
    .replace(/(?:xlink:)?href\s*=\s*'javascript:[^']*'/gi, "href='#'")
    .replace(/(?:xlink:)?href\s*=\s*"data:text\/html[^"]*"/gi, 'href="#"');
}
import { v4 as uuidv4 } from 'uuid';
import axios from 'axios';
import mongoose from 'mongoose';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import path from 'path';
import { createRequire } from 'module';
import { google } from 'googleapis';
import { readFileSync, existsSync } from 'fs';
import webpush from 'web-push';
import {
  log, sanitizeImages, MAX_IMG_B64_BYTES,
  calcObra, expandSubPontos, ensureSubPontos, calcProgressoOS,
  pushStatusHistorico, extenso, valorExtenso,
} from './lib/helpers.js';
import {
  isR2Configured, processLocaisPhotos, resolvePhotosForPdf, getPhotoUrl, isR2Key,
} from './lib/storage.js';

let puppeteerLauncher = null;
let mammothLib = null;
const require = createRequire(import.meta.url);
const IS_VERCEL = !!process.env.VERCEL;
try { mammothLib = require('mammoth'); } catch (e) { console.warn('mammoth not available:', e.message); }
if (IS_VERCEL) {
  try {
    const chromium = require('@sparticuz/chromium');
    const puppeteerCore = require('puppeteer-core');
    puppeteerLauncher = { chromium, puppeteerCore };
  } catch (e) { console.warn('chromium/puppeteer not available:', e.message); }
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const LOGO_B64 = existsSync(path.join(__dirname, 'logo_b64.txt'))
  ? readFileSync(path.join(__dirname, 'logo_b64.txt'), 'utf8').trim()
  : '';

const SELO7_B64 = existsSync(path.join(__dirname, 'anos7_b64.txt'))
  ? readFileSync(path.join(__dirname, 'anos7_b64.txt'), 'utf8').trim()
  : '';

const SELO15_B64 = existsSync(path.join(__dirname, 'anos15_b64.txt'))
  ? readFileSync(path.join(__dirname, 'anos15_b64.txt'), 'utf8').trim()
  : '';

const GVF_SEAL_LOGO_B64 = existsSync(path.join(__dirname, 'gvf_seal_logo_b64.txt'))
  ? readFileSync(path.join(__dirname, 'gvf_seal_logo_b64.txt'), 'utf8').trim()
  : '';

const GVF_GALAO_B64 = existsSync(path.join(__dirname, 'gvf_galao_b64.txt'))
  ? readFileSync(path.join(__dirname, 'gvf_galao_b64.txt'), 'utf8').trim()
  : '';

const SIMBOLO_B64 = existsSync(path.join(__dirname, 'simbolo_b64.txt'))
  ? readFileSync(path.join(__dirname, 'simbolo_b64.txt'), 'utf8').trim()
  : '';

const ASSINATURA_B64 = existsSync(path.join(__dirname, 'assinatura_b64.txt'))
  ? readFileSync(path.join(__dirname, 'assinatura_b64.txt'), 'utf8').trim()
  : '';

const app = express();
// Necessário no Vercel: confiar no header X-Forwarded-For para rate limiting funcionar
app.set('trust proxy', 1);

// ── Web Push (VAPID) setup ────────────────────────────────────────────────────
if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  try {
    webpush.setVapidDetails(
      'mailto:thiagoferrazcriacao@gmail.com',
      process.env.VAPID_PUBLIC_KEY,
      process.env.VAPID_PRIVATE_KEY
    );
  } catch (e) {
    console.warn('VAPID setup failed:', e.message);
  }
} else {
  console.log('[Push] VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY não configurados — notificações push desabilitadas.');
  console.log('[Push] Para gerar chaves: node -e "const wp=require(\'web-push\'); const k=wp.generateVAPIDKeys(); console.log(JSON.stringify(k,null,2))"');
}

// MongoDB connection
// IMPORTANTE: em serverless do Vercel, NÃO confiar em flag boolean estática.
// Cada container pode ter conexão TCP morta enquanto a flag diz "true",
// causando "buffering timed out after 10000ms" no Mongoose.
// Sempre validar via mongoose.connection.readyState:
//   0 = disconnected, 1 = connected, 2 = connecting, 3 = disconnecting
let isConnected = false;
let _connectPromise = null;
async function connectDB() {
  if (!process.env.MONGODB_URI) {
    console.warn('MONGODB_URI not set — using in-memory fallback');
    isConnected = false;
    return;
  }
  // Sincroniza a flag com o estado real ANTES de qualquer decisão
  isConnected = (mongoose.connection.readyState === 1);
  if (isConnected) return;
  // Se já há tentativa em curso, aguardar a mesma (evita N conexões paralelas)
  if (_connectPromise) return _connectPromise;
  _connectPromise = mongoose.connect(process.env.MONGODB_URI, {
    serverSelectionTimeoutMS: 5000,   // desistir do Atlas em 5s se não responde
    socketTimeoutMS: 45000,           // socket idle timeout > cold start
    connectTimeoutMS: 10000,          // handshake TCP
    // POOL SIZING para Vercel Pro:
    // Pro mantém vários containers warm em paralelo. Com maxPoolSize:5 e ~100 containers,
    // o Atlas Flex (500 conn) chegou em 90%. Reduzimos pra 2 — cada container abre poucas
    // conexões e o Vercel ainda balanceia tráfego entre eles. 100 containers × 2 = 200,
    // sobra metade do pool do Flex pra picos.
    maxPoolSize: 2,
    minPoolSize: 0,
    // maxIdleTimeMS: fecha conexões ociosas em 30s em vez de esperar TCP timeout (~10 min).
    // CRÍTICO em serverless — containers Vercel são killed sem SIGTERM, conexões ficariam
    // pendentes no Atlas até o socket expirar. Fechando rápido, liberamos pool pro próximo.
    maxIdleTimeMS: 30000,
    waitQueueTimeoutMS: 5000,         // espera 5s por conexão livre antes de falhar
    bufferCommands: false,            // SEM buffer falso — falha imediato se sem conexão
    heartbeatFrequencyMS: 10000,
  })
    .then(() => {
      isConnected = (mongoose.connection.readyState === 1);
      _connectPromise = null;
    })
    .catch(err => {
      isConnected = false;
      _connectPromise = null;
      console.error('Mongo connect failed:', err.message);
      throw err;
    });
  return _connectPromise;
}
// Quando o driver perde conexão (ping falha, socket morto), zera a flag para forçar reconnect
mongoose.connection.on('disconnected', () => { isConnected = false; });
mongoose.connection.on('error', () => { isConnected = false; });
mongoose.connection.on('connected', () => { isConnected = true; });

// ── Mongoose Schemas ──────────────────────────────────────────────────────────

const medicaoSchema = new mongoose.Schema({
  _id: { type: String, default: uuidv4 },
  numeroMedicao: Number,
  user: String,
  createdAt: { type: Number, default: Date.now },
  dataMedicao: String, // data da visita no formato YYYY-MM-DD (manual entry)
  status: { type: String, default: 'recebida' },
  cliente: String,
  endereco: String,
  bairro: String,
  cidade: String,
  cep: String,
  ac: String,
  celular: String,
  obs: String,
  garantia: { type: String, default: '15' },
  avaliadoPor: String,
  andaime: { type: String, default: 'nao' },
  andaimeMetros: { type: Number, default: 0 },
  andaimeRodinhas: { type: Boolean, default: false },
  andaimeBases: { type: Boolean, default: false },
  andaimeLargura: { type: String, default: '1m' },
  locais: [mongoose.Schema.Types.Mixed],
  fotos: [mongoose.Schema.Types.Mixed],
  dadosAlterados: { type: mongoose.Schema.Types.Mixed, default: null }, // payload do reenvio aguardando revisão
  origem: String, // 'integracao' para registros importados via integração
  criadoPor: String,      // nome/email de quem criou — preenchido no POST
  criadoPorRole: String,  // 'admin' | 'operador' | 'medidor' | 'integracao'
}, { _id: false });

const orcamentoSchema = new mongoose.Schema({
  _id: { type: String, default: uuidv4 },
  numero: Number,
  medicaoId: String,
  numeroMedicao: Number,
  status: { type: String, default: 'rascunho' },
  createdAt: { type: Number, default: Date.now },
  updatedAt: { type: Number, default: Date.now },
  cliente: String, endereco: String, bairro: String, cidade: String, cep: String, ac: String, celular: String, emailCliente: String,
  dataOrcamento: String, validade: { type: String, default: '30' }, avaliadoPor: String, acompanhadoPor: String,
  tecnicoResponsavel: String, elaboradoPor: String, origem: String, sigla: String,
  andaime: { type: String, default: 'nao' },
  andaimeMetros: { type: Number, default: 0 },
  andaimeRodinhas: { type: Boolean, default: false },
  andaimeBases: { type: Boolean, default: false },
  andaimeLargura: { type: String, default: '1m' },
  itens: [mongoose.Schema.Types.Mixed],
  totalBruto: { type: Number, default: 0 },
  desconto: { type: Number, default: 0 },
  descontoTipo: { type: String, default: 'percent' },
  totalLiquido: { type: Number, default: 0 },
  entrada: { type: Number, default: 0 },
  saldo: { type: Number, default: 0 },
  parcelas: { type: Number, default: 1 },
  valorParcela: { type: Number, default: 0 },
  desconto1: { type: Number, default: 0 },
  descontoTipo1: { type: String, default: 'percent' },
  totalProposta1: { type: Number, default: 0 },
  desconto2: { type: Number, default: 0 },
  descontoTipo2: { type: String, default: 'percent' },
  totalProposta2: { type: Number, default: 0 },
  entrada2: { type: Number, default: 50 },
  entradaTipo2: { type: String, default: 'percent' },
  entradaVal2: { type: Number, default: 0 },
  saldo2: { type: Number, default: 0 },
  valorParcela2: { type: Number, default: 0 },
  obsAdicionais: String,
  orcMinimo: { type: Boolean, default: false },
  totalMinimo: { type: Number, default: 0 },
  mostrarProposta1: { type: Boolean, default: true },
  mostrarProposta2: { type: Boolean, default: true },
  locais: [mongoose.Schema.Types.Mixed],
  diasTrabalho: { type: Number, default: 0 },
  consumoProduto: { type: Number, default: 0 },
  qtdInjetores: { type: Number, default: 0 },
  prazoExecucao: { type: Number, default: 3 },
  garantia: { type: Number, default: 15 },
  condicaoPgto1Obs: { type: String, default: '*Pgto a vista, na assinatura do contrato.' },
  condicaoPgto2Obs1: { type: String, default: '* 1ª parcela de entrada na assinatura do contrato.' },
  condicaoPgto2Obs2: { type: String, default: '*2ª parcela p/ 30 dias.' },
  obsGeral: { type: String, default: 'Obs: O contrato deve ser assinado até 2 dias após recebimento. Após este período não garantimos a data estabelecida préviamente para execução do serviço, podendo ser modificada sem aviso prévio.' },
  departamentoComercial: { type: String, default: 'Daniel Guimarães' },
  enviadoParaCliente: { type: Boolean, default: false },
  criadoPor: String,
  criadoPorRole: String,
}, { _id: false });

const contratoSchema = new mongoose.Schema({
  _id: { type: String, default: uuidv4 },
  numero: Number,
  orcamentoId: String,
  status: { type: String, default: 'rascunho' },
  createdAt: { type: Number, default: Date.now },
  updatedAt: { type: Number, default: Date.now },
  cliente: String, endereco: String, bairro: String, cidade: String, cep: String, ac: String, celular: String, emailCliente: String,
  razaoSocial: String,
  cnpjCliente: String, cpfResponsavel: String, rgResponsavel: String,
  sindico: String,
  ie: String,
  dataNasc: String,
  dataAssinatura: String, dataInicio: String, dataTermino: String,
  foro: { type: String, default: 'Rio de Janeiro' },
  garantia: { type: Number, default: 15 },
  prazoExecucao: { type: Number, default: 3 },
  desconto: { type: Number, default: 0 },
  descontoTipo: { type: String, default: 'percent' },
  totalBruto: { type: Number, default: 0 },
  totalLiquido: { type: Number, default: 0 },
  valorExtenso: String,
  issPercent: { type: Number, default: 3 },
  parcelas: { type: Number, default: 1 },
  valorParcela: { type: Number, default: 0 },
  parcelasContrato: [mongoose.Schema.Types.Mixed],
  locais: [mongoose.Schema.Types.Mixed],
  itens: [mongoose.Schema.Types.Mixed],
  cronograma: [{ local: String, dataInicio: String, dataFim: String }],
  zapsignDocId: String, zapsignSignUrl: String, assinadoEm: Number,
  garantiaEnviadaEm: Number,
  diasTrabalho:   { type: Number, default: 0 },
  consumoProduto: { type: Number, default: 0 },
  qtdInjetores:   { type: Number, default: 0 },
  propostaEscolhida: { type: Number, default: null },
  condicaoPgto1Obs:  String,
  condicaoPgto2Obs1: String,
  condicaoPgto2Obs2: String,
  obsGeral: String,
  emailCliente: String,
  statusHistorico: [{ status: String, data: Number }],
  contratoArquivo: String,
  contratoArquivoNome: String,
  textoPersonalizado: String, // HTML editado pelo operador (substitui cláusulas geradas automaticamente)
  textoPersonalizadoAt: Number, // timestamp da última edição
  origem: String, // 'integracao' para registros importados via integração
  criadoPor: String,
  criadoPorRole: String,
}, { _id: false });

const userSchema = new mongoose.Schema({
  _id: { type: String }, // email
  email: String,
  name: String,
  picture: String,
  role: { type: String, default: 'medidor' }, // admin | operador | medidor
  password: String, // para operadores (sha256 ou texto simples temporário)
  mustChangePassword: { type: Boolean, default: false }, // força troca na 1ª entrada
  googleAccessToken: String,
  googleRefreshToken: String,
  googleTokenExpiry: Number,
  setores: { type: [String], default: [] },
  pushSubscription: { type: mongoose.Schema.Types.Mixed },
  // Horário de almoço (medidor) — usado pra bloquear agendamentos conflitantes na Agenda de Visitas
  almocoInicio: { type: String, default: '12:00' },  // HH:mm — local de Brasília
  almocoFim:    { type: String, default: '13:30' },  // HH:mm — sempre 1h30 após inicio (validado no PUT)
  // Agendamento pelo PWA Medidor:
  // podeAgendar = true → medidor vê botão "FAZER AGENDAMENTO" e pode criar visitas
  // agendaPara = lista de e-mails de outros medidores pra quem ele pode agendar (além dele)
  podeAgendar: { type: Boolean, default: false },
  agendaPara:  { type: [String], default: [] },
  // Gestão de equipes pelo PWA Medidor (encarregado tipo Edson):
  // podeGerirEquipes = true → vê botão "GESTÃO DE EQUIPES" na home + acessa endpoints /api/encarregado/*
  podeGerirEquipes: { type: Boolean, default: false },
}, { _id: false });
const User = mongoose.model('User', userSchema);

const configSchema = new mongoose.Schema({
  _id: { type: String, default: 'main' },
  precos: {
    trinca: { type: Number, default: 950 },
    juntaFria: { type: Number, default: 950 },
    ralo: { type: Number, default: 750 },
    juntaDilat: { type: Number, default: 950 },
    ferragem: { type: Number, default: 120 },
    cortina: { type: Number, default: 1020 },
    art: { type: Number, default: 300 },
    mobilizacao: { type: Number, default: 300 },
    numOrcamento: { type: Number, default: 1 },
    numMedicao:   { type: Number, default: 1 },
    tecnicos: { type: [String], default: ['Alan', 'Fernando', 'Thiago', 'Daniel'] },
    setores: { type: [String], default: ['Administrativo', 'Financeiro', 'Orçamentos', 'Comercial', 'Adm. de Obras', 'Operacional de Obras'] },
  },
  // Healthcheck dedup (vide /api/cron/healthcheck): evita spam de WhatsApp
  ultimoHealthAlertHash: { type: String, default: null },
  ultimoHealthAlertEm: { type: Number, default: null },
}, { _id: false, strict: false });

const equipeSchema = new mongoose.Schema({
  _id: { type: String, default: uuidv4 },
  nome: { type: String, required: true },
  emailGmail: String,
  membros: [String],
  cor: { type: String, default: '#1a5c9a' },
  ativa: { type: Boolean, default: true },
  senhaHash: String,
  senhaInicial: { type: Boolean, default: true },
  createdAt: { type: Number, default: Date.now },
}, { _id: false });

const osSchema = new mongoose.Schema({
  _id: { type: String, default: uuidv4 },
  numero: Number,
  contratoId: String,
  orcamentoId: String,
  status: { type: String, default: 'agendada' }, // agendada | em_andamento | aguardando_assinatura | concluida | cancelada
  cliente: String,
  endereco: String,
  bairro: String,
  cidade: String,
  celular: String,
  equipeId: String,
  equipeNome: String,
  dataInicio: String,
  dataTermino: String,
  horaInicio: String,        // "HH:MM" — exibido no PWA aplicador, usado pra ordenar OSes do dia
  calendarEventId: String,
  diasTrabalho: Number,
  diasAtivos: [String], // dias de trabalho efetivos: ['YYYY-MM-DD', ...]
  consumoProduto: Number,
  qtdInjetores: Number,
  tecnicoResponsavel: String,
  pontos: [mongoose.Schema.Types.Mixed], // locais da medicao
  itens: [mongoose.Schema.Types.Mixed],
  obs: String,
  progresso: { type: Number, default: 0 }, // 0-100
  nomeResponsavel: String,
  cargoResponsavel: String,
  assinaturaResponsavel: String, // base64 da assinatura canvas
  concluidaEm: Number,
  tipo: { type: String, default: 'normal' }, // 'normal' | 'reparo'
  origem: { type: String, default: '' }, // '' | 'contrato' | 'manual' — origem da OS
  pendente_equipe: { type: Boolean, default: false }, // OS criada de contrato sem equipe atribuída
  consumosDiarios: [mongoose.Schema.Types.Mixed], // [{ data, litros, membro }]
  totalConsumoReal: { type: Number, default: 0 },
  fechamentosDia: [mongoose.Schema.Types.Mixed], // [{ data:'YYYY-MM-DD', litros, membro, ts }]
  // Compartilhamento multi-equipe
  equipesAtribuidas: [mongoose.Schema.Types.Mixed], // [{ equipeId, equipeNome, pontos:[Number], status, pontosExecutados:[Number] }]
  // Reparo / Assistência Técnica
  osOriginalId: String,       // ID da OS original (se este é um reparo)
  tipoReparo: String,         // descrição do reparo
  fotosReparo: [mongoose.Schema.Types.Mixed], // fotos do problema no momento do reparo
  fotosDepoisReparo: [mongoose.Schema.Types.Mixed], // fotos após a conclusão do reparo
  historicoEquipes: [mongoose.Schema.Types.Mixed], // [{ equipeId, equipeNome, de:ts, ate:ts }] — todas equipes que atuaram
  equipeOriginalId: String,   // equipe que executou o serviço original (causou o problema)
  equipeOriginalNome: String, // nome da equipe original
  fotosAntesOriginal: [mongoose.Schema.Types.Mixed], // fotos originais da OS base
  fotosDepoisOriginal: [mongoose.Schema.Types.Mixed],
  // Contrato manual (transição do sistema antigo)
  contratoManual: { type: Boolean, default: false },
  contratoManualNome: String,
  contratoManualNumero: String,
  contratoManualPdfBase64: String,
  createdAt: { type: Number, default: Date.now },
  updatedAt: { type: Number, default: Date.now },
  criadoPor: String,      // nome/email de quem criou a OS
  criadoPorRole: String,  // 'admin' | 'operador' | 'medidor' | 'contrato' (auto)
}, { _id: false });

// ── Índices (criados em background; não bloqueiam queries) ────────────────────
// Reduzem listagens de ~3s para sub-segundo. Não alteram dados.
medicaoSchema.index({ createdAt: -1 });
medicaoSchema.index({ numeroMedicao: -1 });
medicaoSchema.index({ status: 1, createdAt: -1 });
medicaoSchema.index({ user: 1, createdAt: -1 });

orcamentoSchema.index({ createdAt: -1 });
orcamentoSchema.index({ numero: -1 });
orcamentoSchema.index({ status: 1, createdAt: -1 });
orcamentoSchema.index({ medicaoId: 1 });

contratoSchema.index({ createdAt: -1 });
contratoSchema.index({ numero: -1 });
contratoSchema.index({ status: 1, createdAt: -1 });
contratoSchema.index({ orcamentoId: 1 });
contratoSchema.index({ dataInicio: 1 });

osSchema.index({ createdAt: -1 });
osSchema.index({ numero: -1 });
osSchema.index({ tipo: 1, status: 1, createdAt: -1 });
osSchema.index({ status: 1, createdAt: -1 });
osSchema.index({ equipe: 1, status: 1 });
osSchema.index({ equipe: 1, createdAt: -1 });
osSchema.index({ osOriginalId: 1 });
osSchema.index({ contratoId: 1 });
osSchema.index({ orcamentoId: 1 });
osSchema.index({ dataInicio: 1 });

equipeSchema.index({ nome: 1 });
equipeSchema.index({ emailGmail: 1 });

const Medicao = mongoose.model('Medicao', medicaoSchema);
const Orcamento = mongoose.model('Orcamento', orcamentoSchema);
const Contrato = mongoose.model('Contrato', contratoSchema);
const Config = mongoose.model('Config', configSchema);
const Equipe = mongoose.model('Equipe', equipeSchema);
const OS = mongoose.model('OS', osSchema);

// ── Lixeira (soft delete) ─────────────────────────────────────────────────────
const lixeiraSchema = new mongoose.Schema({
  _id: { type: String },
  tipo: String,          // 'os' | 'orcamento' | 'contrato' | 'medicao'
  tipoLabel: String,     // 'Ordem de Serviço' | 'Orçamento' | 'Contrato' | 'Medição'
  colecao: String,       // nome da coleção MongoDB para restauração
  identificacao: String, // texto amigável ex: "OS #003 — Condomínio Alfa"
  dados: mongoose.Schema.Types.Mixed, // documento original completo
  deletadoEm: { type: Number, default: Date.now },
  deletadoPor: { type: String, default: '' },
}, { collection: 'lixeira' }); // sem _id:false — _id é String explícito

const Lixeira = mongoose.models.Lixeira || mongoose.model('Lixeira', lixeiraSchema, 'lixeira');

// ── Compras de Produto ────────────────────────────────────────────────────────
const compraSchema = new mongoose.Schema({
  data: { type: Date, default: Date.now },
  quantidade: { type: Number, required: true }, // litros
  obs: { type: String, default: '' },
  criadoEm: { type: Date, default: Date.now }
});
const Compra = mongoose.model('Compra', compraSchema, 'compras');

// ── Compras de Injetores ──────────────────────────────────────────────────────
const compraInjetorSchema = new mongoose.Schema({
  data: { type: Date, default: Date.now },
  quantidade: { type: Number, required: true }, // unidades
  fornecedor: { type: String, default: '' },
  notaFiscal: { type: String, default: '' },
  obs: { type: String, default: '' },
  criadoEm: { type: Date, default: Date.now }
});
const CompraInjetor = mongoose.model('CompraInjetor', compraInjetorSchema, 'compras_injetores');

// ── Estoque por Equipe / Semana ───────────────────────────────────────────────
function getISOWeekStr(date) {
  const d = new Date(date);
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}
function getWeekDateRange(semana) {
  const [yearStr, wStr] = semana.split('-W');
  const year = parseInt(yearStr), w = parseInt(wStr);
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const dow = jan4.getUTCDay() || 7;
  const monday = new Date(jan4);
  monday.setUTCDate(jan4.getUTCDate() - dow + 1 + (w - 1) * 7);
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  return { start: monday.toISOString().split('T')[0], end: sunday.toISOString().split('T')[0] };
}

const estoqueEquipeSemanaSchema = new mongoose.Schema({
  equipeId:   { type: String, required: true },
  equipeNome: { type: String, default: '' },
  semana:     { type: String, required: true }, // "2026-W20"
  recebido:   { type: Number, default: 0 },
  // injetores recebidos do encarregado (Edson) — fecha o ciclo de declaração
  // igual ao `recebido` (litros). Equipe declara no aplicador.
  injetoresRecebidos: { type: Number, default: 0 },
  // histórico de lançamentos individuais: quem lançou, quando e quanto
  lancamentos: [{
    membro:   String,
    litros:   Number,
    injetores: Number,   // quantidade de injetores (se for esse o tipo do lançamento)
    tipo:     { type: String, default: 'produto' },  // 'produto' | 'injetores'
    ts:       { type: Date, default: Date.now },
  }],
  criadoEm:   { type: Date, default: Date.now },
  updatedAt:  { type: Date, default: Date.now }
});
estoqueEquipeSemanaSchema.index({ equipeId: 1, semana: 1 }, { unique: true });
const EstoqueEquipeSemana = mongoose.model('EstoqueEquipeSemana', estoqueEquipeSemanaSchema, 'estoque_equipe_semana');

// Registro de fornecimentos do ENCARREGADO (ex: Edson) pra cada equipe.
// Edson lança no PWA Medidor "dei 50L pra Equipe B" — comparado com o que
// a equipe declara via aplicador (EstoqueEquipeSemana.recebido).
const fornecimentoEncarregadoSchema = new mongoose.Schema({
  _id:              { type: String, default: () => uuidv4() },
  semana:           { type: String, required: true }, // "2026-W24"
  equipeId:         { type: String, required: true },
  equipeNome:       { type: String, default: '' },
  tipo:             { type: String, enum: ['produto', 'injetores'], required: true },
  quantidade:       { type: Number, required: true },
  encarregadoEmail: { type: String, default: '' },
  encarregadoNome:  { type: String, default: '' },
  ts:               { type: Number, default: Date.now },
  // Confirmação pela equipe
  confirmado:       { type: Boolean, default: null }, // null=pendente, true=confirmado, false=divergência
  qtdConfirmada:    { type: Number, default: null },
  divergenciaDesc:  { type: String, default: '' },
  tsConfirmado:     { type: Number, default: null },
});
fornecimentoEncarregadoSchema.index({ semana: 1, equipeId: 1, tipo: 1 });
const FornecimentoEncarregado = mongoose.model('FornecimentoEncarregado', fornecimentoEncarregadoSchema, 'fornecimentos_encarregado');

// ── Garantias Standalone (geradas a partir de OS) ─────────────────────────────
const garantiaDocSchema = new mongoose.Schema({
  osId:           { type: mongoose.Schema.Types.ObjectId },
  cliente:        { type: String, default: '' },
  razaoSocial:    { type: String, default: '' },
  cnpjCliente:    { type: String, default: '' },
  endereco:       { type: String, default: '' },
  bairro:         { type: String, default: '' },
  cidade:         { type: String, default: '' },
  estado:         { type: String, default: '' },
  cep:            { type: String, default: '' },
  garantia:       { type: Number, default: 15 },
  totalLiquido:   { type: Number, default: 0 },
  dataInicio:     Date,
  dataTermino:    Date,
  obsGarantia:    { type: String, default: '' },
  garantiaEnviadaEm: Number,
  criadoEm:       { type: Date, default: Date.now }
});
const GarantiaDoc = mongoose.model('GarantiaDoc', garantiaDocSchema, 'garantias');

// ── Push notification helper ──────────────────────────────────────────────────
async function sendPushToSetores(setoresAlvo, payload) {
  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) return;
  try {
    const users = await User.find({ setores: { $in: setoresAlvo }, pushSubscription: { $exists: true } });
    for (const u of users) {
      try {
        await webpush.sendNotification(u.pushSubscription, JSON.stringify(payload));
      } catch (e) {
        if (e.statusCode === 410) await User.findByIdAndUpdate(u._id, { $unset: { pushSubscription: 1 } });
      }
    }
  } catch (e) { console.error('Push error:', e.message); }
}

// In-memory fallback (when no MongoDB)
const memStore = { medicoes: [], orcamentos: [], contratos: [], config: null, users: [], equipes: [], ordens: [], lixeira: [] };

// Helper: salva item na lixeira antes de deletar
async function salvarNaLixeira(tipo, tipoLabel, colecao, documento, deletadoPor) {
  const doc = documento.toObject ? documento.toObject() : { ...documento };
  const entrada = {
    _id: uuidv4(),
    tipo,
    tipoLabel,
    colecao,
    identificacao: buildIdentificacao(tipo, doc),
    dados: doc,
    deletadoEm: Date.now(),
    deletadoPor: deletadoPor || '',
  };
  if (isConnected) {
    await Lixeira.create(entrada);
  } else {
    memStore.lixeira.push(entrada);
  }
}

function buildIdentificacao(tipo, doc) {
  const num = doc.numero ? `#${String(doc.numero).padStart(3, '0')}` : '';
  const cli = doc.cliente || doc.user || '';
  switch (tipo) {
    case 'os':        return `OS ${num} — ${cli}`.trim();
    case 'orcamento': return `Orçamento ${num} — ${cli}`.trim();
    case 'contrato':  return `Contrato ${num} — ${cli}`.trim();
    case 'medicao':   return `Medição — ${cli || doc._id}`.trim();
    default:          return doc._id || '';
  }
}

// log, sanitizeImages, calcObra, expandSubPontos, ensureSubPontos,
// calcProgressoOS, pushStatusHistorico, extenso, valorExtenso
// → importados de ./lib/helpers.js

// ── Segurança: constantes obrigatórias ────────────────────────────────────────
// Se faltarem em produção, o servidor recusa subir (defesa contra deploy quebrado)
const IS_PROD = process.env.NODE_ENV === 'production';
const JWT_SECRET = process.env.JWT_SECRET || (IS_PROD ? null : 'dev-secret-only-local');
const ADMIN_USER = process.env.ADMIN_USER || (IS_PROD ? null : 'admin');
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || (IS_PROD ? null : 'change-me-local');

if (IS_PROD) {
  const missing = [];
  if (!JWT_SECRET)     missing.push('JWT_SECRET');
  if (!ADMIN_USER)     missing.push('ADMIN_USER');
  if (!ADMIN_PASSWORD) missing.push('ADMIN_PASSWORD');
  if (missing.length) {
    console.error('❌ FATAL: variáveis obrigatórias ausentes em produção:', missing.join(', '));
    throw new Error('Missing required env vars: ' + missing.join(', '));
  }
}

// Helper para mascarar PII em logs (LGPD)
function safeLog(obj) {
  if (obj == null) return obj;
  if (typeof obj === 'string') {
    return obj
      .replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, '***.***.***-**')     // CPF
      .replace(/\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g, '**.***.***/****-**') // CNPJ
      .replace(/\b\(?\d{2}\)?\s?9?\d{4}-?\d{4}\b/g, '(**)****-****')      // Telefone BR
      .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}/g, '***@***'); // Email
  }
  if (typeof obj === 'object') {
    try { return JSON.parse(safeLog(JSON.stringify(obj))); } catch { return '[unsafe]'; }
  }
  return obj;
}

// ── Middleware ────────────────────────────────────────────────────────────────

// Helmet: headers de segurança (CSP, X-Frame, HSTS, etc.)
app.use(helmet({
  contentSecurityPolicy: false, // CSP gerenciado pelo Vercel/SPA — ativar depois com cuidado
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));

// CORS restrito a domínios conhecidos da Vedafacil
const ALLOWED_ORIGINS = [
  'https://vedafacil-painel.vercel.app',
  'https://vedafacil-medidor.vercel.app',
  'https://vedafacil-aplicador.vercel.app',
];
if (!IS_PROD) {
  ALLOWED_ORIGINS.push('http://localhost:5173', 'http://localhost:3001', 'http://localhost:5174');
}
app.use(cors({
  origin: (origin, cb) => {
    // Sem origin = requests server-to-server (curl, Postman) — permitir
    if (!origin) return cb(null, true);
    if (ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
    // Permite *.vercel.app (previews) e Vercel deploys de preview
    if (/^https:\/\/[a-z0-9-]+\.vercel\.app$/i.test(origin)) return cb(null, true);
    log('warn', 'CORS bloqueado origem:', origin);
    cb(new Error('CORS bloqueado'));
  },
  credentials: true,
}));

// JSON parser: limite global 1MB; rotas que recebem fotos sobrescrevem com bigJson.
// Vercel Pro suporta body até 100 MB. Usamos 50 MB pra ter margem de segurança e
// permitir lotes maiores de fotos sem precisar do workaround de batches pequenos.
app.use(express.json({ limit: '1mb' }));
const bigJson = express.json({ limit: '50mb' });
// Exporta como global para rotas grandes usarem (ver uso em /api/medicao etc.)
app.locals.bigJson = bigJson;

// Rate limiter para login (10 tentativas por 15 min por IP)
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { trustProxy: false, xForwardedForHeader: false }, // já configuramos trust proxy
  message: { error: 'Muitas tentativas de login. Tente novamente em 15 min.' },
});

// Rate limiter para endpoints custosos (Gemini, geração PDF)
const expensiveLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { trustProxy: false, xForwardedForHeader: false },
  message: { error: 'Muitas requisições. Aguarde 1 minuto.' },
});
app.locals.expensiveLimiter = expensiveLimiter;

// Request logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const dur = Date.now() - start;
    if (req.path.startsWith('/api')) {
      const lvl = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';
      log(lvl, `${req.method} ${req.path}`, { status: res.statusCode, ms: dur });
    }
  });
  next();
});

// Serve Vite build in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, 'dist')));
}

// JWT auth middleware (admin/operador/medidor — painel)
function auth(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1] || req.query.token;
  if (!token) return res.status(401).json({ error: 'Token required' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

// Extrai info do criador a partir do JWT — usado em POSTs pra rastrear quem criou
// cada medição/orçamento/contrato/OS. nome cai em email (admin/operador) ou username.
function creatorInfo(req) {
  return {
    criadoPor: req.user?.email || req.user?.username || req.user?.nome || '—',
    criadoPorRole: req.user?.role || 'operador',
  };
}

// JWT auth middleware (equipe — aplicador). Garante que o token é de equipe,
// e que a equipeId requisitada bate com a do token (anti-IDOR)
function authEquipe(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1] || req.query.token;
  if (!token) return res.status(401).json({ error: 'Token required' });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    if (!payload.equipeId && payload.role !== 'admin') {
      return res.status(401).json({ error: 'Token sem equipeId' });
    }
    req.equipe = payload;
    // Sobrescreve qualquer equipeId vindo do request com o do token (admins-master mantêm acesso amplo via masterMode)
    if (req.query.equipeId && payload.role !== 'admin' && req.query.equipeId !== payload.equipeId) {
      return res.status(403).json({ error: 'equipeId não corresponde ao token' });
    }
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

// Audit log — registra ações destrutivas de admins (delete, mass update)
const auditLogSchema = new mongoose.Schema({
  ts:       { type: Date, default: Date.now },
  user:     String,
  role:     String,
  action:   String,
  resource: String,
  resourceId: String,
  details:  mongoose.Schema.Types.Mixed,
}, { collection: 'auditLogs' });
const AuditLog = mongoose.models?.AuditLog || mongoose.model('AuditLog', auditLogSchema);

async function audit(req, action, resource, resourceId, details) {
  try {
    await AuditLog.create({
      user: req.user?.username || req.user?.email || 'unknown',
      role: req.user?.role || 'unknown',
      action, resource, resourceId,
      details: safeLog(details),
    });
  } catch (e) { /* nunca quebra a request por log */ }
}

// ── Health ────────────────────────────────────────────────────────────────────

// ── Telemetria interna: rolling stats em memória (5 min de janela) ────────────
// Permite o /api/admin/status mostrar latência média, taxa de erro, payload médio.
// Em serverless cada container tem seu próprio buffer (não é global) — é um best-effort
// para diagnóstico; o cron de healthcheck cobre o monitoramento contínuo.
const _stats = {
  reqs: [],          // { ts, path, ms, status, bytes }
  errors: [],        // { ts, path, status, msg }
  payloadWarnings: [], // { ts, path, bytes }
  startedAt: Date.now(),
};
const _STATS_WINDOW_MS = 5 * 60 * 1000;       // 5 minutos
const _STATS_MAX_REQS = 500;                  // teto p/ não estourar memória
const _PAYLOAD_WARN_THRESHOLD = 500 * 1024;   // 500 KB

function _trimStats() {
  const cutoff = Date.now() - _STATS_WINDOW_MS;
  _stats.reqs = _stats.reqs.filter(r => r.ts >= cutoff).slice(-_STATS_MAX_REQS);
  _stats.errors = _stats.errors.filter(r => r.ts >= cutoff).slice(-100);
  _stats.payloadWarnings = _stats.payloadWarnings.filter(r => r.ts >= cutoff).slice(-50);
}

// Middleware que mede tempo + tamanho de resposta de toda chamada /api/*
app.use((req, res, next) => {
  if (!req.path.startsWith('/api/')) return next();
  const t0 = Date.now();
  let bytes = 0;
  const origWrite = res.write.bind(res);
  const origEnd = res.end.bind(res);
  res.write = (chunk, enc, cb) => {
    if (chunk) bytes += Buffer.isBuffer(chunk) ? chunk.length : Buffer.byteLength(chunk, enc);
    return origWrite(chunk, enc, cb);
  };
  res.end = (chunk, enc, cb) => {
    if (chunk) bytes += Buffer.isBuffer(chunk) ? chunk.length : Buffer.byteLength(chunk, enc);
    const ms = Date.now() - t0;
    const status = res.statusCode;
    // Não registrar a própria página de status para não inflar números
    if (!req.path.startsWith('/api/admin/status') && !req.path.startsWith('/api/health')) {
      _stats.reqs.push({ ts: Date.now(), path: req.path, ms, status, bytes });
      if (status >= 500) {
        _stats.errors.push({ ts: Date.now(), path: req.path, status, msg: `HTTP ${status}` });
      }
      if (bytes > _PAYLOAD_WARN_THRESHOLD) {
        _stats.payloadWarnings.push({ ts: Date.now(), path: req.path, bytes });
        console.warn(`[payload-warn] ${req.method} ${req.path} → ${(bytes/1024).toFixed(0)} KB (limite recomendado: ${_PAYLOAD_WARN_THRESHOLD/1024} KB)`);
      }
      _trimStats();
    }
    return origEnd(chunk, enc, cb);
  };
  next();
});

// Ping real do Mongo: round-trip mínimo para medir latência verdadeira
async function _pingMongo() {
  if (mongoose.connection.readyState !== 1) return { ok: false, latencyMs: null };
  const t0 = Date.now();
  try {
    await mongoose.connection.db.admin().ping();
    return { ok: true, latencyMs: Date.now() - t0 };
  } catch (e) {
    return { ok: false, latencyMs: Date.now() - t0, error: e.message };
  }
}

// Coleta métricas detalhadas do Mongo (storage, conexões, etc)
async function _collectMongoMetrics() {
  if (mongoose.connection.readyState !== 1) return null;
  try {
    const dbStats = await mongoose.connection.db.stats();
    const serverStatus = await mongoose.connection.db.admin().serverStatus().catch(() => null);
    return {
      storageBytes: dbStats.dataSize + dbStats.indexSize,
      collections: dbStats.collections,
      documents: dbStats.objects,
      connections: serverStatus?.connections?.current ?? null,
      connectionsAvailable: serverStatus?.connections?.available ?? null,
    };
  } catch (e) {
    return { error: e.message };
  }
}

// ── Versículos para o devocional diário dos PWAs ──────────────────────────────
// Lista cíclica: dia 1 do ano usa índice 0, dia 2 usa índice 1, etc.
// Quando esgota a lista, recomeça do início. Atualizar versículos = editar array + redeploy.
const VERSICULOS_DIARIOS = [
  { texto: 'Posso todas as coisas naquele que me fortalece.', referencia: 'Filipenses 4:13' },
  { texto: 'O Senhor é o meu pastor; nada me faltará.', referencia: 'Salmos 23:1' },
  { texto: 'Tudo coopera para o bem daqueles que amam a Deus.', referencia: 'Romanos 8:28' },
  { texto: 'Não temas, porque eu sou contigo; não te assombres, porque eu sou o teu Deus.', referencia: 'Isaías 41:10' },
  { texto: 'Confia no Senhor de todo o teu coração e não te estribes no teu próprio entendimento.', referencia: 'Provérbios 3:5' },
  { texto: 'Porque Deus amou o mundo de tal maneira que deu o seu Filho unigênito.', referencia: 'João 3:16' },
  { texto: 'Lâmpada para os meus pés é a tua palavra, e luz para o meu caminho.', referencia: 'Salmos 119:105' },
  { texto: 'Bem-aventurados os mansos, porque herdarão a terra.', referencia: 'Mateus 5:5' },
  { texto: 'Buscai primeiro o Reino de Deus e a sua justiça, e todas as coisas vos serão acrescentadas.', referencia: 'Mateus 6:33' },
  { texto: 'A alegria do Senhor é a vossa força.', referencia: 'Neemias 8:10' },
  { texto: 'Tudo posso, mas nem tudo me convém; tudo me é lícito, mas nem tudo edifica.', referencia: '1 Coríntios 10:23' },
  { texto: 'Em paz me deitarei e dormirei, porque só tu, Senhor, me fazes habitar em segurança.', referencia: 'Salmos 4:8' },
  { texto: 'O choro pode durar uma noite, mas a alegria vem pela manhã.', referencia: 'Salmos 30:5' },
  { texto: 'O Senhor é a minha luz e a minha salvação; a quem temerei?', referencia: 'Salmos 27:1' },
  { texto: 'Entrega o teu caminho ao Senhor; confia nele, e ele tudo fará.', referencia: 'Salmos 37:5' },
  { texto: 'A resposta branda desvia o furor, mas a palavra dura suscita a ira.', referencia: 'Provérbios 15:1' },
  { texto: 'Vinde a mim, todos os que estais cansados e oprimidos, e eu vos aliviarei.', referencia: 'Mateus 11:28' },
  { texto: 'Eu sou o caminho, e a verdade, e a vida; ninguém vem ao Pai senão por mim.', referencia: 'João 14:6' },
  { texto: 'A paz vos deixo, a minha paz vos dou; não vo-la dou como o mundo a dá.', referencia: 'João 14:27' },
  { texto: 'Se Deus é por nós, quem será contra nós?', referencia: 'Romanos 8:31' },
  { texto: 'O amor é paciente, o amor é bondoso; não inveja, não se vangloria, não se orgulha.', referencia: '1 Coríntios 13:4' },
  { texto: 'Examinai tudo. Retende o bem.', referencia: '1 Tessalonicenses 5:21' },
  { texto: 'Não vos amoldeis ao padrão deste mundo, mas transformai-vos pela renovação da vossa mente.', referencia: 'Romanos 12:2' },
  { texto: 'O Senhor te abençoe e te guarde; faça resplandecer o seu rosto sobre ti.', referencia: 'Números 6:24-25' },
  { texto: 'Os céus declaram a glória de Deus, e o firmamento anuncia a obra das suas mãos.', referencia: 'Salmos 19:1' },
  { texto: 'Honra a teu pai e a tua mãe, para que se prolonguem os teus dias.', referencia: 'Êxodo 20:12' },
  { texto: 'Ama o Senhor, teu Deus, de todo o teu coração, de toda a tua alma e de todo o teu entendimento.', referencia: 'Mateus 22:37' },
  { texto: 'Amarás o teu próximo como a ti mesmo.', referencia: 'Mateus 22:39' },
  { texto: 'Sede fortes e corajosos. Não temais nem vos atemorizeis por causa deles.', referencia: 'Deuteronômio 31:6' },
  { texto: 'O Senhor lutará por vós, e vós vos calareis.', referencia: 'Êxodo 14:14' },
  { texto: 'A oração feita por um justo pode muito em seus efeitos.', referencia: 'Tiago 5:16' },
  { texto: 'Aquietai-vos e sabei que eu sou Deus.', referencia: 'Salmos 46:10' },
  { texto: 'O temor do Senhor é o princípio da sabedoria.', referencia: 'Provérbios 9:10' },
  { texto: 'Bem-aventurado o homem que põe a sua confiança no Senhor.', referencia: 'Salmos 40:4' },
  { texto: 'O Senhor é bom; é fortaleza no dia da angústia, e conhece os que confiam nele.', referencia: 'Naum 1:7' },
  { texto: 'Pedi, e dar-se-vos-á; buscai e achareis; batei, e abrir-se-vos-á.', referencia: 'Mateus 7:7' },
  { texto: 'Ainda que eu andasse pelo vale da sombra da morte, não temeria mal algum.', referencia: 'Salmos 23:4' },
  { texto: 'Esforça-te, e tem bom ânimo; não pasmes, nem te espantes, porque o Senhor está contigo.', referencia: 'Josué 1:9' },
  { texto: 'Tudo tem o seu tempo determinado, e há tempo para todo propósito debaixo do céu.', referencia: 'Eclesiastes 3:1' },
  { texto: 'A graça do Senhor Jesus Cristo seja com todos vós.', referencia: 'Apocalipse 22:21' },
  { texto: 'Não andeis ansiosos por coisa alguma; antes, em tudo, sejam conhecidas as vossas petições.', referencia: 'Filipenses 4:6' },
  { texto: 'A paz de Deus, que excede todo o entendimento, guardará o vosso coração e a vossa mente.', referencia: 'Filipenses 4:7' },
  { texto: 'Tudo o que é verdadeiro, tudo o que é respeitável, tudo o que é justo... nisso pensai.', referencia: 'Filipenses 4:8' },
  { texto: 'Alegrai-vos sempre no Senhor; outra vez digo: alegrai-vos.', referencia: 'Filipenses 4:4' },
  { texto: 'Os que esperam no Senhor renovarão as suas forças.', referencia: 'Isaías 40:31' },
  { texto: 'O Senhor é a minha rocha, a minha fortaleza e o meu libertador.', referencia: 'Salmos 18:2' },
  { texto: 'Provai e vede que o Senhor é bom; bem-aventurado o homem que nele se refugia.', referencia: 'Salmos 34:8' },
  { texto: 'Aquele que habita no esconderijo do Altíssimo descansará à sombra do Onipotente.', referencia: 'Salmos 91:1' },
  { texto: 'Crie em mim, ó Deus, um coração puro, e renova dentro de mim um espírito reto.', referencia: 'Salmos 51:10' },
  { texto: 'O sacrifício aceitável a Deus é o espírito quebrantado.', referencia: 'Salmos 51:17' },
  { texto: 'A boca do justo é manancial de vida.', referencia: 'Provérbios 10:11' },
  { texto: 'O homem que tem amigos deve mostrar-se amigável; e há amigo mais chegado do que um irmão.', referencia: 'Provérbios 18:24' },
  { texto: 'Ensina a criança no caminho em que deve andar, e, ainda quando for velho, não se desviará.', referencia: 'Provérbios 22:6' },
  { texto: 'Levanto os meus olhos para os montes; de onde me virá o socorro?', referencia: 'Salmos 121:1' },
  { texto: 'O meu socorro vem do Senhor, que fez os céus e a terra.', referencia: 'Salmos 121:2' },
  { texto: 'Cantai ao Senhor um cântico novo; cantai ao Senhor, todos os habitantes da terra.', referencia: 'Salmos 96:1' },
  { texto: 'Cada manhã renovam-se as misericórdias do Senhor; grande é a tua fidelidade.', referencia: 'Lamentações 3:23' },
  { texto: 'Bem-aventurados os que choram, porque serão consolados.', referencia: 'Mateus 5:4' },
  { texto: 'Bem-aventurados os pacificadores, porque serão chamados filhos de Deus.', referencia: 'Mateus 5:9' },
  { texto: 'Sois a luz do mundo; não se pode esconder uma cidade edificada sobre um monte.', referencia: 'Mateus 5:14' },
  { texto: 'Onde está o vosso tesouro, aí estará também o vosso coração.', referencia: 'Mateus 6:21' },
  { texto: 'Tudo, pois, quanto vós quereis que os homens vos façam, fazei-lho também vós a eles.', referencia: 'Mateus 7:12' },
  { texto: 'O que aproveita ao homem ganhar o mundo inteiro e perder a sua alma?', referencia: 'Marcos 8:36' },
  { texto: 'Tudo é possível ao que crê.', referencia: 'Marcos 9:23' },
  { texto: 'No princípio era o Verbo, e o Verbo estava com Deus, e o Verbo era Deus.', referencia: 'João 1:1' },
  { texto: 'A luz resplandece nas trevas, e as trevas não a compreenderam.', referencia: 'João 1:5' },
  { texto: 'Conhecereis a verdade, e a verdade vos libertará.', referencia: 'João 8:32' },
  { texto: 'Eu vim para que tenham vida, e a tenham com abundância.', referencia: 'João 10:10' },
  { texto: 'Nisto conhecerão todos que sois meus discípulos: se vos amardes uns aos outros.', referencia: 'João 13:35' },
  { texto: 'Levantai os vossos olhos e vede os campos, porque já estão brancos para a ceifa.', referencia: 'João 4:35' },
  { texto: 'Sede vós misericordiosos, como também vosso Pai é misericordioso.', referencia: 'Lucas 6:36' },
  { texto: 'Toda Escritura é inspirada por Deus e útil para o ensino.', referencia: '2 Timóteo 3:16' },
  { texto: 'Combati o bom combate, completei a carreira, guardei a fé.', referencia: '2 Timóteo 4:7' },
  { texto: 'Pela graça sois salvos, mediante a fé; e isto não vem de vós; é dom de Deus.', referencia: 'Efésios 2:8' },
  { texto: 'Sêde uns para com os outros benignos, misericordiosos, perdoando-vos uns aos outros.', referencia: 'Efésios 4:32' },
  { texto: 'Sêde imitadores de Deus, como filhos amados.', referencia: 'Efésios 5:1' },
  { texto: 'Sede fortes no Senhor e na força do seu poder.', referencia: 'Efésios 6:10' },
  { texto: 'Tudo o que fizerdes, fazei-o de todo o coração, como ao Senhor e não aos homens.', referencia: 'Colossenses 3:23' },
  { texto: 'Orai sem cessar. Em tudo dai graças.', referencia: '1 Tessalonicenses 5:17-18' },
  { texto: 'Deus é amor; e quem permanece no amor permanece em Deus, e Deus, nele.', referencia: '1 João 4:16' },
  { texto: 'Maior é aquele que está em vós do que o que está no mundo.', referencia: '1 João 4:4' },
  { texto: 'Lançando sobre ele toda a vossa ansiedade, porque ele tem cuidado de vós.', referencia: '1 Pedro 5:7' },
  { texto: 'Humilhai-vos sob a poderosa mão de Deus, para que ele vos exalte a seu tempo.', referencia: '1 Pedro 5:6' },
  { texto: 'Toda boa dádiva e todo dom perfeito vêm do alto, descendo do Pai das luzes.', referencia: 'Tiago 1:17' },
  { texto: 'Bem-aventurado o homem que suporta com perseverança a provação.', referencia: 'Tiago 1:12' },
  { texto: 'Não tenhamos um amor de palavra nem de língua, mas em obras e em verdade.', referencia: '1 João 3:18' },
  { texto: 'O Senhor é o meu Deus e a minha força.', referencia: 'Habacuque 3:19' },
  { texto: 'Direi do Senhor: ele é o meu refúgio e a minha fortaleza, o meu Deus, em quem confio.', referencia: 'Salmos 91:2' },
  { texto: 'Aquele que começou boa obra em vós há de completá-la até o Dia de Cristo Jesus.', referencia: 'Filipenses 1:6' },
  { texto: 'Para mim, o viver é Cristo e o morrer é lucro.', referencia: 'Filipenses 1:21' },
  { texto: 'O Senhor estende a sua mão sobre os justos.', referencia: 'Salmos 125:3' },
  { texto: 'Glorifica ao Senhor com a tua substância e com as primícias de toda a tua renda.', referencia: 'Provérbios 3:9' },
  { texto: 'Onde está o Espírito do Senhor, aí há liberdade.', referencia: '2 Coríntios 3:17' },
  { texto: 'Andamos por fé, não pelo que vemos.', referencia: '2 Coríntios 5:7' },
  { texto: 'A nossa luta não é contra a carne e o sangue, mas contra os principados e potestades.', referencia: 'Efésios 6:12' },
  { texto: 'O coração alegre serve de bom remédio, mas o espírito abatido faz secar os ossos.', referencia: 'Provérbios 17:22' },
  { texto: 'Misericordioso e compassivo é o Senhor; longânimo e grande em benignidade.', referencia: 'Salmos 145:8' },
  { texto: 'Não retém o seu amor para sempre, porque ele tem prazer na misericórdia.', referencia: 'Miqueias 7:18' },
  { texto: 'Ainda que a figueira não floresça, eu me alegrarei no Senhor.', referencia: 'Habacuque 3:17-18' },
  { texto: 'A santidade é a beleza do Senhor.', referencia: 'Salmos 96:9' },
  { texto: 'Deleita-te no Senhor, e ele te concederá o que deseja o teu coração.', referencia: 'Salmos 37:4' },
  { texto: 'Bem-aventurado aquele que tem o Deus de Jacó por seu auxílio.', referencia: 'Salmos 146:5' },
];

// GET /api/devocional/hoje — versículo do dia (selecionado por dayOfYear).
// Pública, leve, cacheável. Cada PWA chama 1x por dia.
app.get('/api/devocional/hoje', (req, res) => {
  const agora = new Date();
  // Calcula o dayOfYear em fuso de Brasília
  const ssp = agora.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }); // YYYY-MM-DD
  const [y, m, d] = ssp.split('-').map(Number);
  const inicioAno = new Date(Date.UTC(y, 0, 1));
  const hojeUTC = new Date(Date.UTC(y, m - 1, d));
  const dayOfYear = Math.floor((hojeUTC - inicioAno) / 86400000) + 1;
  const idx = (dayOfYear - 1) % VERSICULOS_DIARIOS.length;
  const v = VERSICULOS_DIARIOS[idx];
  res.set('Cache-Control', 'public, max-age=3600');
  res.json({ texto: v.texto, referencia: v.referencia, data: ssp, dayOfYear });
});

// ── /api/health: termômetro público para monitoramento externo ────────────────
app.get('/api/health', async (req, res) => {
  try {
    await connectDB();
    const ping = await _pingMongo();
    const ok = ping.ok && mongoose.connection.readyState === 1;
    res.status(ok ? 200 : 503).json({
      status: ok ? 'ok' : 'degraded',
      db: ok ? 'connected' : 'disconnected',
      readyState: mongoose.connection.readyState,
      mongoLatencyMs: ping.latencyMs,
      uptime: Math.round(process.uptime()),
      env: process.env.NODE_ENV || 'development',
      ts: new Date().toISOString(),
    });
  } catch (err) {
    res.status(503).json({ status: 'error', db: 'disconnected', error: err.message });
  }
});

// ── /api/admin/status: dashboard completo para o painel (admin only) ──────────
// Retorna { metric, ideal, limite, atual, status: 'ok'|'warn'|'crit', unidade }
// para CADA métrica, para a UI mostrar barra/cor sem ter que calcular.
app.get('/api/admin/status', auth, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'admin only' });
    await connectDB();
    _trimStats();
    const ping = await _pingMongo();
    const mongoMetrics = await _collectMongoMetrics();
    const mem = process.memoryUsage();

    // Cálculos agregados sobre a janela de 5 min
    const reqs = _stats.reqs;
    const totalReqs = reqs.length;
    const errorReqs = reqs.filter(r => r.status >= 500).length;
    const errorRate = totalReqs ? (errorReqs / totalReqs) * 100 : 0;
    const avgMs = totalReqs ? Math.round(reqs.reduce((s, r) => s + r.ms, 0) / totalReqs) : 0;
    const p95Ms = totalReqs ? (() => {
      const sorted = [...reqs].map(r => r.ms).sort((a, b) => a - b);
      return sorted[Math.floor(sorted.length * 0.95)] || 0;
    })() : 0;
    const avgBytes = totalReqs ? Math.round(reqs.reduce((s, r) => s + r.bytes, 0) / totalReqs) : 0;
    const maxBytes = totalReqs ? Math.max(...reqs.map(r => r.bytes)) : 0;

    // Helper para classificar status com base em thresholds
    const cls = (atual, idealMax, critMin) =>
      atual == null ? 'unknown'
      : atual <= idealMax ? 'ok'
      : atual >= critMin ? 'crit'
      : 'warn';

    // ── Configuração do tier MongoDB Atlas em uso ──────────────────────────
    // Trocar aqui ao mudar de tier (M0 → Flex → M10…). Os thresholds derivam disto.
    // Flex (atual): 5 GB storage, ~500 connections, CPU compartilhada com burst on-demand.
    const ATLAS_TIER = {
      nome:           'Flex',
      storageBytes:   5 * 1024 * 1024 * 1024,    // 5 GB
      maxConnections: 500,
      idealStoragePct: 0.40,   // até 40% (~2 GB) = OK
      warnStoragePct:  0.60,   // de 40% a 90% = atenção
      critStoragePct:  0.90,   // > 90% = crítico
    };
    const STORAGE_LIMIT = ATLAS_TIER.storageBytes;
    const CONN_LIMIT = ATLAS_TIER.maxConnections;

    const metrics = {
      // ── MongoDB ──────────────────────────────────────────────────────────
      mongo_conexao: {
        label: 'Conexão com MongoDB',
        descricao: 'Estado do socket TCP com o Atlas',
        atual: mongoose.connection.readyState === 1 ? 'Conectado' : 'Desconectado',
        ideal: 'Conectado',
        limite: 'Desconectado',
        status: mongoose.connection.readyState === 1 ? 'ok' : 'crit',
        unidade: '',
      },
      mongo_latencia: {
        label: 'Latência ping Mongo',
        descricao: 'Round-trip de um ping ao Atlas. GCP/São Paulo costuma operar em 100-150 ms.',
        atual: ping.latencyMs,
        ideal: '< 200 ms',
        limite: '> 500 ms',
        status: cls(ping.latencyMs, 200, 500),
        unidade: 'ms',
      },
      mongo_storage: {
        label: 'Armazenamento usado',
        descricao: `Tier ${ATLAS_TIER.nome} tem ${(STORAGE_LIMIT / 1024 / 1024 / 1024).toFixed(0)} GB no total`,
        atual: mongoMetrics?.storageBytes ?? null,
        atualFmt: mongoMetrics
          ? (mongoMetrics.storageBytes >= 1024 * 1024 * 1024
              ? `${(mongoMetrics.storageBytes / 1024 / 1024 / 1024).toFixed(2)} GB`
              : `${(mongoMetrics.storageBytes / 1024 / 1024).toFixed(0)} MB`)
          : null,
        ideal: `< ${((STORAGE_LIMIT * ATLAS_TIER.idealStoragePct) / 1024 / 1024 / 1024).toFixed(1)} GB (${Math.round(ATLAS_TIER.idealStoragePct * 100)}%)`,
        limite: `> ${((STORAGE_LIMIT * ATLAS_TIER.critStoragePct) / 1024 / 1024 / 1024).toFixed(1)} GB (${Math.round(ATLAS_TIER.critStoragePct * 100)}%)`,
        status: !mongoMetrics ? 'unknown'
          : mongoMetrics.storageBytes > STORAGE_LIMIT * ATLAS_TIER.critStoragePct ? 'crit'
          : mongoMetrics.storageBytes > STORAGE_LIMIT * ATLAS_TIER.warnStoragePct ? 'warn'
          : 'ok',
        unidade: 'bytes',
        percent: mongoMetrics ? Math.round((mongoMetrics.storageBytes / STORAGE_LIMIT) * 100) : null,
      },
      mongo_conexoes: {
        label: 'Conexões ativas no Atlas',
        descricao: `Tier ${ATLAS_TIER.nome} permite até ${CONN_LIMIT} conexões simultâneas`,
        atual: mongoMetrics?.connections ?? null,
        ideal: '< 100',
        limite: `> 400 de ${CONN_LIMIT}`,
        status: mongoMetrics?.connections == null ? 'unknown'
          : mongoMetrics.connections > 400 ? 'crit'
          : mongoMetrics.connections > 200 ? 'warn'
          : 'ok',
        unidade: 'conexões',
        percent: mongoMetrics?.connections != null ? Math.round((mongoMetrics.connections / CONN_LIMIT) * 100) : null,
      },
      mongo_documentos: {
        label: 'Total de documentos',
        descricao: 'Soma de todos documentos em todas as coleções',
        atual: mongoMetrics?.documents ?? null,
        ideal: '—',
        limite: '—',
        status: 'info',
        unidade: 'docs',
      },

      // ── API ──────────────────────────────────────────────────────────────
      // Estatística com poucas amostras é volátil. Abaixo de 20 reqs, percentil
      // não é confiável — uma única chamada lenta vira "p95". Marcamos como info
      // pra não disparar alerta falso quando o sistema está apenas ocioso.
      api_tempo_medio: {
        label: 'Tempo médio de resposta',
        descricao: totalReqs < 20
          ? `Média de ${totalReqs} req(s) nos últimos 5 min — amostra pequena, valor pouco representativo`
          : 'Média dos últimos 5 min em todos endpoints /api/*',
        atual: avgMs,
        ideal: '< 500 ms',
        limite: '> 2.000 ms',
        status: totalReqs < 5 ? 'info' : cls(avgMs, 500, 2000),
        unidade: 'ms',
      },
      api_tempo_p95: {
        label: 'Tempo p95',
        descricao: totalReqs < 20
          ? `Apenas ${totalReqs} req(s) na janela — p95 não é estatisticamente significativo abaixo de 20 amostras`
          : '95% das requisições respondem abaixo deste tempo',
        atual: p95Ms,
        ideal: '< 1.500 ms',
        limite: '> 5.000 ms',
        // Com poucas amostras, o "p95" é só o pior tempo registrado — marca como info
        status: totalReqs < 20 ? 'info' : cls(p95Ms, 1500, 5000),
        unidade: 'ms',
      },
      api_taxa_erro: {
        label: 'Taxa de erro 5xx',
        descricao: '% de requisições com erro de servidor nos últimos 5 min',
        atual: Number(errorRate.toFixed(2)),
        ideal: '0%',
        limite: '> 1%',
        status: errorRate === 0 ? 'ok' : errorRate > 1 ? 'crit' : 'warn',
        unidade: '%',
      },
      api_payload_medio: {
        label: 'Payload médio',
        descricao: 'Tamanho médio das respostas JSON nos últimos 5 min',
        atual: avgBytes,
        atualFmt: `${(avgBytes / 1024).toFixed(1)} KB`,
        ideal: '< 100 KB',
        limite: '> 500 KB',
        status: cls(avgBytes, 100 * 1024, 500 * 1024),
        unidade: 'bytes',
      },
      api_payload_max: {
        label: 'Maior payload (5 min)',
        descricao: 'Maior resposta JSON registrada na janela',
        atual: maxBytes,
        atualFmt: `${(maxBytes / 1024).toFixed(1)} KB`,
        ideal: '< 300 KB',
        limite: '> 1 MB',
        status: cls(maxBytes, 300 * 1024, 1024 * 1024),
        unidade: 'bytes',
      },
      api_requisicoes: {
        label: 'Requisições (5 min)',
        descricao: 'Total de chamadas /api/* registradas neste container',
        atual: totalReqs,
        ideal: '—',
        limite: '—',
        status: 'info',
        unidade: 'reqs',
      },

      // ── Sistema ──────────────────────────────────────────────────────────
      // Container Vercel Pro: até 3008 MB de RAM por função (maxDuration 180s).
      sistema_memoria: {
        label: 'Memória RSS',
        descricao: 'RAM total usada por este container Vercel Pro (limite: 3 GB)',
        atual: mem.rss,
        atualFmt: `${(mem.rss / 1024 / 1024).toFixed(0)} MB`,
        ideal: '< 1 GB',
        limite: '> 2,5 GB',
        status: cls(mem.rss, 1024 * 1024 * 1024, 2.5 * 1024 * 1024 * 1024),
        unidade: 'bytes',
      },
      sistema_heap: {
        label: 'Heap V8 usado',
        descricao: 'Memória JS ativa neste container (objetos vivos)',
        atual: mem.heapUsed,
        atualFmt: `${(mem.heapUsed / 1024 / 1024).toFixed(0)} MB`,
        ideal: '< 500 MB',
        limite: '> 1,5 GB',
        status: cls(mem.heapUsed, 500 * 1024 * 1024, 1.5 * 1024 * 1024 * 1024),
        unidade: 'bytes',
      },
      sistema_uptime: {
        label: 'Uptime do container',
        descricao: 'Há quanto tempo este container Vercel está vivo',
        atual: Math.round(process.uptime()),
        atualFmt: `${Math.round(process.uptime() / 60)} min`,
        ideal: '—',
        limite: '—',
        status: 'info',
        unidade: 's',
      },
      sistema_tier: {
        label: 'Tier Vercel',
        descricao: 'Plano atual e principais limites de infra',
        atual: 'Pro',
        atualFmt: 'Pro · 1 TB BW · 240h CPU · crons ilimitados · body 50 MB',
        ideal: 'Pro / Enterprise',
        limite: 'Hobby (limite estourado em 2026-06)',
        status: 'ok',
        unidade: '',
      },
    };

    // Resumo geral: ok / warn / crit (pior status entre os monitorados)
    const niveis = ['info', 'unknown', 'ok', 'warn', 'crit'];
    const piorNivel = Object.values(metrics).reduce((pior, m) => {
      const idxAtual = niveis.indexOf(m.status);
      const idxPior = niveis.indexOf(pior);
      return idxAtual > idxPior ? m.status : pior;
    }, 'ok');

    res.json({
      resumo: piorNivel,
      ts: new Date().toISOString(),
      janelaMin: _STATS_WINDOW_MS / 60000,
      metrics,
      ultimosErros: _stats.errors.slice(-10).reverse(),
      ultimosPayloadsGrandes: _stats.payloadWarnings.slice(-10).reverse(),
      // Top endpoints mais lentos: agrupa por path e calcula média, p95, contagem
      // para identificar exatamente quais rotas estão derrubando a performance.
      topEndpointsLentos: (() => {
        const byPath = new Map()
        reqs.forEach(r => {
          // Normaliza path com :id (UUIDs/ObjectIds) pra agrupar rotas semelhantes
          const norm = r.path
            .replace(/\/[0-9a-f]{24}/gi, '/:id')                              // ObjectId
            .replace(/\/[0-9a-f-]{36}/gi, '/:id')                             // UUID
            .replace(/\/\d+/g, '/:n')                                         // números (sem confundir com path)
          if (!byPath.has(norm)) byPath.set(norm, { path: norm, count: 0, totalMs: 0, maxMs: 0, totalBytes: 0 })
          const e = byPath.get(norm)
          e.count++
          e.totalMs += r.ms
          e.maxMs = Math.max(e.maxMs, r.ms)
          e.totalBytes += r.bytes
        })
        return Array.from(byPath.values())
          .map(e => ({
            path: e.path,
            count: e.count,
            avgMs: Math.round(e.totalMs / e.count),
            maxMs: e.maxMs,
            avgBytes: Math.round(e.totalBytes / e.count),
            // Classificação para a UI colorir
            severidade: e.totalMs / e.count > 2000 ? 'crit'
              : e.totalMs / e.count > 500 ? 'warn'
              : 'ok',
          }))
          .sort((a, b) => b.avgMs - a.avgMs)
          .slice(0, 10)
      })(),
    });
  } catch (err) {
    console.error('Erro em /api/admin/status:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── Cron de healthcheck: bate a cada 5 min e alerta WhatsApp se crítico ───────
app.get('/api/cron/healthcheck', async (req, res) => {
  try {
    // Aceita autenticação via header (X-Cron-Secret) ou query (?secret=...)
    const secret = req.headers['x-cron-secret'] || req.query.secret;
    const expected = process.env.CRON_SECRET || JWT_SECRET;
    if (secret !== expected) return res.status(401).json({ error: 'unauthorized' });

    await connectDB();
    const ping = await _pingMongo();
    const mongoMetrics = await _collectMongoMetrics();
    // Tier atual: Flex (5 GB). Trocar aqui ao mudar de tier.
    const STORAGE_LIMIT = 5 * 1024 * 1024 * 1024;

    const problemas = [];
    if (mongoose.connection.readyState !== 1) {
      problemas.push(`Mongo DESCONECTADO (readyState=${mongoose.connection.readyState})`);
    }
    if (ping.ok && ping.latencyMs > 3000) {
      problemas.push(`Latência Mongo MUITO ALTA: ${ping.latencyMs}ms`);
    }
    if (mongoMetrics?.storageBytes && mongoMetrics.storageBytes > STORAGE_LIMIT * 0.9) {
      problemas.push(`Storage Atlas em ${Math.round((mongoMetrics.storageBytes / STORAGE_LIMIT) * 100)}% (>90%)`);
    }
    if (mongoMetrics?.connections != null && mongoMetrics.connections > 400) {
      problemas.push(`Conexões Atlas em ${mongoMetrics.connections}/500 (>80%)`);
    }

    // Dedup: só alerta no WhatsApp se mudou de estado desde o último cron
    // (evita spam quando problema dura horas). Estado guardado em Config.
    let alertaEnviado = false;
    if (problemas.length > 0 && isConnected) {
      try {
        const ConfigModel = mongoose.model('Config');
        let cfg = await ConfigModel.findOne();
        if (!cfg) cfg = new ConfigModel({});
        const ultimoAlertaHash = cfg.ultimoHealthAlertHash;
        const hashAtual = problemas.sort().join('|');
        if (ultimoAlertaHash !== hashAtual) {
          // Envia WhatsApp via Evolution API se configurado
          const evolutionUrl = process.env.EVOLUTION_API_URL;
          const evolutionToken = process.env.EVOLUTION_API_TOKEN;
          const adminWhatsapp = process.env.ADMIN_WHATSAPP; // ex: '5524999999999'
          if (evolutionUrl && evolutionToken && adminWhatsapp) {
            const texto = `🚨 *Vedafacil — Alerta de Sistema*\n\nProblemas detectados:\n${problemas.map(p => `• ${p}`).join('\n')}\n\n🕒 ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}\n\nAcesse https://vedafacil-painel.vercel.app/status para detalhes.`;
            try {
              await fetch(`${evolutionUrl}/message/sendText/Vedafacil`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', apikey: evolutionToken },
                body: JSON.stringify({ number: adminWhatsapp, text: texto }),
              });
              alertaEnviado = true;
            } catch (e) {
              console.error('Falha ao enviar alerta WhatsApp:', e.message);
            }
          }
          cfg.ultimoHealthAlertHash = hashAtual;
          cfg.ultimoHealthAlertEm = Date.now();
          await cfg.save();
        }
      } catch (e) {
        console.warn('Não foi possível processar dedup de alerta:', e.message);
      }
    } else if (problemas.length === 0 && isConnected) {
      // Sistema OK: limpa hash do último alerta para que próximo problema dispare
      try {
        const ConfigModel = mongoose.model('Config');
        const cfg = await ConfigModel.findOne();
        if (cfg && cfg.ultimoHealthAlertHash) {
          cfg.ultimoHealthAlertHash = null;
          await cfg.save();
        }
      } catch {}
    }

    res.json({
      ok: problemas.length === 0,
      problemas,
      alertaEnviado,
      ts: new Date().toISOString(),
    });
  } catch (err) {
    console.error('Erro em /api/cron/healthcheck:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── Backup automático diário ───────────────────────────────────────────────────
app.post('/api/cron/backup', async (req, res) => {
  try {
    const secret = req.headers['x-cron-secret'] || req.query.secret;
    if (secret !== process.env.CRON_SECRET) {
      return res.status(401).json({ error: 'Não autorizado' });
    }
    await connectDB();
    if (!isConnected) return res.status(500).json({ error: 'Sem conexão com banco' });

    // Campos de imagem/base64 excluídos do backup (estouram limite 16MB do MongoDB)
    const EXCLUIR_CAMPOS = { fotos: 0, fotosReparo: 0, croquiBase64: 0, croquiOtimizado: 0 };
    const IMG_KEYS = ['fotos', 'fotosReparo', 'croquiBase64', 'croquiOtimizado', 'fotosMedicao'];

    // Para lixeira: strip de campos de imagem de dentro do campo `dados` (Mixed aninhado)
    function stripImageFields(obj) {
      if (!obj || typeof obj !== 'object') return obj;
      if (Array.isArray(obj)) return obj.map(stripImageFields);
      const out = {};
      for (const [k, v] of Object.entries(obj)) {
        if (IMG_KEYS.includes(k)) continue;
        out[k] = stripImageFields(v);
      }
      return out;
    }

    const models = {
      users:                  { model: User,               proj: {} },
      medicoes:               { model: Medicao,            proj: { fotos: 0 } },
      orcamentos:             { model: Orcamento,          proj: {} },
      contratos:              { model: Contrato,           proj: {} },
      configs:                { model: Config,             proj: {} },
      equipes:                { model: Equipe,             proj: {} },
      ordens_servico:         { model: OS,                 proj: EXCLUIR_CAMPOS },
      compras:                { model: Compra,             proj: {} },
      compras_injetores:      { model: CompraInjetor,      proj: {} },
      estoque_equipe_semana:  { model: EstoqueEquipeSemana,proj: {} },
      garantias:              { model: GarantiaDoc,        proj: EXCLUIR_CAMPOS },
    };

    const today = new Date().toISOString().slice(0, 10);
    const backupDb = mongoose.connection.client.db('backups');
    const snapshotsCol = backupDb.collection('snapshots');

    const counts = {};

    // Salva cada coleção num documento separado (evita limite 16MB)
    for (const [name, { model, proj }] of Object.entries(models)) {
      try {
        const docs = await model.find({}, proj).lean();
        counts[name] = docs.length;
        await snapshotsCol.replaceOne(
          { project: 'vedafacil', collection: name, date: today },
          { project: 'vedafacil', collection: name, date: today, createdAt: new Date(), docs },
          { upsert: true }
        );
      } catch (e) {
        counts[name] = `erro: ${e.message}`;
      }
    }

    // Lixeira: strip profundo via aggregation (remove fotos em locais/pontos aninhados)
    try {
      const lixCol = mongoose.connection.db.collection('lixeira');
      const lixDocs = await lixCol.aggregate([
        { $unset: [
          'dados.fotos', 'dados.fotosReparo', 'dados.croquiBase64',
          'dados.croquiOtimizado', 'dados.fotosMedicao',
        ]},
        { $addFields: {
          'dados.locais': {
            $cond: {
              if: { $isArray: '$dados.locais' },
              then: { $map: { input: '$dados.locais', as: 'l',
                in: { $unsetField: { field: 'fotos', input: '$$l' } } } },
              else: '$dados.locais',
            }
          },
          'dados.pontos': {
            $cond: {
              if: { $isArray: '$dados.pontos' },
              then: { $map: { input: '$dados.pontos', as: 'p',
                in: { $unsetField: { field: 'croquiBase64',
                  input: { $unsetField: { field: 'croquiOtimizado',
                    input: { $unsetField: { field: 'fotosMedicao', input: '$$p' } } } } } } } },
              else: '$dados.pontos',
            }
          },
        }},
      ], { allowDiskUse: true }).toArray();
      counts['lixeira'] = lixDocs.length;
      await snapshotsCol.replaceOne(
        { project: 'vedafacil', collection: 'lixeira', date: today },
        { project: 'vedafacil', collection: 'lixeira', date: today, createdAt: new Date(), docs: lixDocs },
        { upsert: true }
      );
    } catch (e) {
      // Lixeira com documentos muito grandes: salva apenas metadados
      try {
        const lixCol = mongoose.connection.db.collection('lixeira');
        const lixMeta = await lixCol.find({}, { projection: {
          _id: 1, tipo: 1, tipoLabel: 1, identificacao: 1, deletadoEm: 1, deletadoPor: 1
        }}).toArray();
        counts['lixeira'] = `${lixMeta.length} (só metadados — dados muito grandes)`;
        await snapshotsCol.replaceOne(
          { project: 'vedafacil', collection: 'lixeira', date: today },
          { project: 'vedafacil', collection: 'lixeira', date: today, createdAt: new Date(), docs: lixMeta },
          { upsert: true }
        );
      } catch (e2) {
        counts['lixeira'] = `erro: ${e2.message}`;
      }
    }

    // Remove backups com mais de 7 dias
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 7);
    await snapshotsCol.deleteMany({
      project: 'vedafacil',
      date: { $lt: cutoff.toISOString().slice(0, 10) },
    });

    log('info', '[backup] Backup concluído', { date: today, counts });
    return res.json({ ok: true, date: today, counts });
  } catch (err) {
    log('error', '[backup] Erro:', { error: err.message });
    return res.status(500).json({ error: err.message });
  }
});

// Global error handler (catches unhandled async errors)
app.use((err, req, res, next) => {
  log('error', `Unhandled error on ${req.method} ${req.path}`, { error: err.message, stack: err.stack });
  res.status(500).json({ error: 'Internal server error' });
});

// ── Auth Routes ───────────────────────────────────────────────────────────────

app.post('/api/auth/login', loginLimiter, async (req, res) => {
  const { username, password } = req.body;
  // .trim() defensivo: env vars do Vercel podem vir com \n no final
  const expectedUser = (ADMIN_USER || '').trim();
  const expectedPass = (ADMIN_PASSWORD || '').trim();
  const isAdmin = (username || '').trim() === expectedUser && (password || '').trim() === expectedPass;
  if (isAdmin) {
    const token = jwt.sign({ username, role: 'admin' }, JWT_SECRET, { expiresIn: '24h' });
    return res.json({ token, user: { username, role: 'admin' } });
  }
  // Suporte a operadores e admins do banco
  try {
    await connectDB();
    if (isConnected) {
      // role: admin ou operador (admin do banco também usa esse fluxo)
      const user = await User.findOne({ email: username, role: { $in: ['operador', 'admin'] } }).lean();
      if (user && user.password) {
        let ok = false;
        // bcrypt hash começa com $2a$ / $2b$ / $2y$
        if (/^\$2[aby]\$/.test(user.password)) {
          ok = await bcrypt.compare(password, user.password);
        } else {
          // Hash SHA-256 legado ou texto puro — migra na hora para bcrypt
          const sha = require('crypto').createHash('sha256').update(password).digest('hex');
          ok = user.password === password || user.password === sha;
          if (ok) {
            // Atualiza para bcrypt silenciosamente
            const newHash = await bcrypt.hash(password, 10);
            await User.updateOne({ _id: user._id }, { $set: { password: newHash } });
            log('info', 'Senha migrada para bcrypt', { user: safeLog(username) });
          }
        }
        if (ok) {
          const mustChange = user.mustChangePassword === true;
          const pic = user.picture || '';
          const role = user.role || 'operador';
          const token = jwt.sign({ username: user.name || username, email: username, role, mustChangePassword: mustChange, picture: pic }, JWT_SECRET, { expiresIn: '24h' });
          return res.json({ token, user: { username: user.name || username, email: username, role, mustChangePassword: mustChange, picture: pic } });
        }
      }
    }
  } catch (e) {
    log('error', 'Login DB error', { error: e.message });
  }
  res.status(401).json({ error: 'Credenciais inválidas' });
});

app.get('/api/auth/me', auth, (req, res) => {
  res.json({ user: req.user });
});

// GET /api/me — retorna nome do usuário logado para auto-preencher "Elaborado por"
app.get('/api/me', auth, async (req, res) => {
  try {
    await connectDB();
    const email = req.user?.email || req.user?.username;
    // Admin Thiago → nome fixo
    if (email === 'thiagoferrazcriacao@gmail.com' || req.user?.username === 'admin') {
      return res.json({ name: 'Thiago Ferraz', email, role: req.user?.role || 'admin' });
    }
    // Busca no banco de usuários
    if (isConnected) {
      const u = await User.findById(email).lean();
      if (u) return res.json({ name: u.name || email, email, role: u.role || 'medidor' });
    }
    return res.json({ name: req.user?.name || email || '', email, role: req.user?.role || 'medidor' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Fotos R2 — endpoint de URL presignada ─────────────────────────────────────
// GET /api/fotos/url?key=medicoes/xxx.jpg  → redireciona para URL presignada (1h)
// Usado pelo frontend para exibir fotos armazenadas no R2
app.get('/api/fotos/url', auth, async (req, res) => {
  try {
    const key = req.query.key;
    if (!key) return res.status(400).json({ error: 'key é obrigatório' });
    if (!isR2Configured()) return res.status(503).json({ error: 'R2 não configurado' });
    const url = await getPhotoUrl(key, 3600);
    return res.redirect(302, url);
  } catch (err) {
    console.error('[R2] Erro ao gerar URL presignada:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Proteção de tamanho de imagem ────────────────────────────────────────────
// sanitizeImages + MAX_IMG_B64_BYTES → importados de ./lib/helpers.js

// ── Helper: resolve fotos R2 para PDF ────────────────────────────────────────
// Converte chaves R2 ("medicoes/xxx.jpg") em base64 data URI para o Puppeteer
async function resolveLocaisForPdf(locais) {
  if (!Array.isArray(locais)) return locais;
  return Promise.all(locais.map(async (local) => {
    if (!local.fotos || local.fotos.length === 0) return local;
    const resolved = await Promise.all(local.fotos.map(async (f) => {
      if (!f) return null;
      if (typeof f === 'string' && isR2Key(f)) {
        const { getPhotoAsBase64 } = await import('./lib/storage.js');
        return getPhotoAsBase64(f);
      }
      return f; // já é base64 ou objeto {data:...}
    }));
    return { ...local, fotos: resolved.filter(Boolean) };
  }));
}

// ── Helper: get/init config ───────────────────────────────────────────────────

async function getConfig() {
  await connectDB();
  if (!isConnected) {
    if (!memStore.config) memStore.config = { precos: { trinca: 950, juntaFria: 950, ralo: 750, juntaDilat: 950, ferragem: 120, cortina: 1020, art: 300, mobilizacao: 300 } };
    return memStore.config;
  }
  let cfg = await Config.findById('main');
  if (!cfg) { cfg = await Config.create({ _id: 'main' }); }
  return cfg;
}

// ── Medições Routes ───────────────────────────────────────────────────────────

app.post('/api/medicao', bigJson, async (req, res) => {
  try {
    await connectDB();
    const secret = process.env.WEBHOOK_SECRET;
    if (secret && req.headers['x-webhook-secret'] !== secret) {
      return res.status(401).json({ error: 'Invalid webhook secret' });
    }
    // Sanitize oversized base64 images before persisting
    let data = sanitizeImages(req.body, 'medicao');

    // ── Upload fotos para Cloudflare R2 (substitui base64 por chaves) ──────────
    if (isR2Configured() && Array.isArray(data.locais)) {
      try {
        const medId = data.id || uuidv4();
        data = { ...data, id: medId };
        data.locais = await processLocaisPhotos(data.locais, `medicoes/${medId}`);
      } catch (r2err) {
        console.warn('[R2] Falha no upload de fotos, mantendo base64:', r2err.message);
      }
    }

    if (isConnected) {
      // Usa numMedicao do config, com fallback para count+1
      let cfg = await Config.findById('main');
      if (!cfg) cfg = await Config.create({ _id: 'main' });
      const precos = cfg.precos || {};
      let numero = precos.numMedicao;
      if (!numero) {
        const count = await Medicao.countDocuments();
        numero = count + 1;
      }
      // Incrementa para a próxima
      await Config.findByIdAndUpdate('main', { 'precos.numMedicao': numero + 1 });
      // Medições do PWA têm `data.user` = email do medidor (preenchido pelo cliente)
      const medicao = await Medicao.create({
        ...data,
        _id: data.id || uuidv4(),
        numeroMedicao: numero,
        status: 'recebida',
        criadoPor: data.user || data.medidor || '—',
        criadoPorRole: 'medidor',
      });

      // Se essa medição veio de uma visita Vedafacil, atualiza a visita pra registrar a conclusão
      if (data.visitaId) {
        try {
          await Visita.findByIdAndUpdate(data.visitaId, {
            status: 'concluido',
            concluidaEm: Date.now(),
            medicaoId: medicao._id,
            numeroMedicao: numero,
            updatedAt: Date.now(),
          });
        } catch (e) { console.warn('Falha ao atualizar visita:', e.message); }
      }

      // Push notification para setores Orçamentos e Comercial
      sendPushToSetores(['Orçamentos', 'Comercial'], {
        title: '📐 Nova Medição',
        body: `${data.cliente || data.nomeCliente || 'Cliente'} — ${data.cidade || ''}`.trim().replace(/—\s*$/, ''),
        icon: '/logo.png',
        url: '/medicoes'
      });
      return res.json({ success: true, id: medicao._id });
    } else {
      const medicao = { ...data, _id: data.id || uuidv4(), numeroMedicao: memStore.medicoes.length + 1, status: 'recebida' };
      memStore.medicoes.push(medicao);
      return res.json({ success: true, id: medicao._id });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Endpoint público para PWA confirmar que medição foi recebida (sem auth)
app.get('/api/medicao/:id/ping', async (req, res) => {
  try {
    await connectDB();
    const exists = isConnected
      ? !!(await Medicao.exists({ _id: req.params.id }))
      : memStore.medicoes.some(m => m._id === req.params.id);
    res.json({ found: exists });
  } catch { res.json({ found: false }); }
});

// POST /api/medicoes/manual — criar medição manual pelo painel
app.post('/api/medicoes/manual', auth, bigJson, async (req, res) => {
  try {
    await connectDB();
    let cfg = await Config.findById('main');
    if (!cfg) cfg = await Config.create({ _id: 'main' });
    const precos = cfg.precos || {};
    let numero = precos.numMedicao;
    if (!numero) {
      const count = await Medicao.countDocuments();
      numero = count + 1;
    }
    await Config.findByIdAndUpdate('main', { 'precos.numMedicao': numero + 1 });
    const data = sanitizeImages(req.body, 'medicao-manual');
    const id = uuidv4();
    // Se informou dataMedicao (YYYY-MM-DD), usa como createdAt para ordenação correta
    const createdAt = data.dataMedicao
      ? new Date(data.dataMedicao + 'T12:00:00').getTime()
      : Date.now();
    const medicao = await Medicao.create({
      ...data,
      _id: id,
      id,
      numeroMedicao: numero,
      status: 'recebida',
      user: req.user?.email || req.user?.username || 'manual',
      createdAt,
      ...creatorInfo(req),
    });
    return res.json({ success: true, id: medicao._id, numeroMedicao: numero, ...medicao.toObject() });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/medicoes', auth, async (req, res) => {
  try {
    await connectDB();
    let medicoes;
    if (isConnected) {
      // Duas queries em PARALELO (eram sequenciais — economizava 1 round-trip ao Atlas).
      // Medicao.find() com fotos cortadas + Orcamento.find() só com campos mínimos.
      const [medicoesRaw, orcs] = await Promise.all([
        Medicao.find()
          .sort({ createdAt: -1 })
          .select('-fotos -locais.fotos -locais.fotosMedicao')
          .lean(),
        Orcamento.find().select('_id medicaoId numero').lean(),
      ]);
      const orcByMedicao = {};
      orcs.forEach(o => { if (o.medicaoId) orcByMedicao[o.medicaoId] = { orcamentoId: o._id, numeroOrcamento: o.numero }; });
      medicoes = medicoesRaw.map(m => ({
        ...m,
        temOrcamento: !!orcByMedicao[m._id],
        orcamentoId: orcByMedicao[m._id]?.orcamentoId || null,
        numeroOrcamento: orcByMedicao[m._id]?.numeroOrcamento || null,
      }));
    } else {
      medicoes = memStore.medicoes.map(m => {
        const { fotos, ...rest } = m;
        rest.locais = (rest.locais || []).map(l => { const { fotos, fotosMedicao, ...lr } = l; return lr; });
        return rest;
      });
    }
    return res.json(medicoes);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/medicoes/:id', auth, async (req, res) => {
  try {
    await connectDB();
    if (isConnected) {
      const m = await Medicao.findById(req.params.id).lean();
      if (!m) return res.status(404).json({ error: 'Not found' });
      const orc = await Orcamento.findOne({ medicaoId: m._id }).select('_id medicaoId numero').lean();
      return res.json({
        ...m,
        temOrcamento: !!orc,
        orcamentoId: orc?._id || null,
        numeroOrcamento: orc?.numero || null,
      });
    }
    const m = memStore.medicoes.find(x => x._id === req.params.id);
    if (!m) return res.status(404).json({ error: 'Not found' });
    res.json(m);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.patch('/api/medicoes/:id/status', auth, async (req, res) => {
  try {
    await connectDB();
    if (isConnected) {
      const m = await Medicao.findByIdAndUpdate(req.params.id, { status: req.body.status }, { new: true });
      return res.json(m);
    }
    const m = memStore.medicoes.find(x => x._id === req.params.id);
    if (m) m.status = req.body.status;
    res.json(m);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Atualizar apenas fotos da medição (sem bloquear se já tem orçamento) ──────
app.patch('/api/medicoes/:id/fotos', auth, async (req, res) => {
  try {
    await connectDB();
    const { locais } = req.body;
    if (!Array.isArray(locais)) return res.status(400).json({ error: 'locais required' });
    if (isConnected) {
      const m = await Medicao.findById(req.params.id);
      if (!m) return res.status(404).json({ error: 'Medição não encontrada.' });
      const locaisAtualizados = (m.locais || []).map((loc, i) => {
        const edit = locais[i];
        if (edit && Array.isArray(edit.fotos)) {
          const plain = typeof loc.toObject === 'function' ? loc.toObject() : { ...loc };
          return { ...plain, fotos: edit.fotos };
        }
        return loc;
      });
      m.locais = locaisAtualizados;
      m.updatedAt = new Date();
      await m.save();
      return res.json(m);
    }
    // memStore fallback
    const idx = memStore.medicoes.findIndex(x => x._id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Medição não encontrada.' });
    const m = memStore.medicoes[idx];
    const locaisAtualizados = (m.locais || []).map((loc, i) => {
      const edit = locais[i];
      if (edit && Array.isArray(edit.fotos)) return { ...loc, fotos: edit.fotos };
      return loc;
    });
    memStore.medicoes[idx] = { ...m, locais: locaisAtualizados, updatedAt: new Date() };
    return res.json(memStore.medicoes[idx]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Adicionar local manualmente (operador) — sem restrição de orçamento ────────
app.patch('/api/medicoes/:id/adicionar-local', auth, async (req, res) => {
  try {
    await connectDB();
    const { local } = req.body;
    if (!local || !local.nome) return res.status(400).json({ error: 'Campo nome é obrigatório.' });
    const nomeAutor = req.user?.username || req.user?.email || 'operador';
    const novoLocal = { ...local, adicionadoPor: nomeAutor };
    if (isConnected) {
      const m = await Medicao.findById(req.params.id);
      if (!m) return res.status(404).json({ error: 'Medição não encontrada.' });
      m.locais = [...(m.locais || []), novoLocal];
      m.markModified('locais');
      m.updatedAt = new Date();
      await m.save();
      return res.json(m);
    }
    const idx = memStore.medicoes.findIndex(x => x._id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Medição não encontrada.' });
    memStore.medicoes[idx] = { ...memStore.medicoes[idx], locais: [...(memStore.medicoes[idx].locais || []), novoLocal], updatedAt: new Date() };
    return res.json(memStore.medicoes[idx]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/medicoes/:id', auth, bigJson, async (req, res) => {
  try {
    await connectDB();
    const data = sanitizeImages(req.body, 'medicao-put');
    if (isConnected) {
      // Audit log se o número da medição foi alterado
      if (typeof data.numeroMedicao === 'number') {
        const atual = await Medicao.findById(req.params.id).lean();
        if (atual && data.numeroMedicao !== atual.numeroMedicao) {
          await audit(req, 'update-numero-medicao', 'medicao', req.params.id, {
            de: atual.numeroMedicao, para: data.numeroMedicao, cliente: atual.cliente,
          });
        }
      }
      const orc = await Orcamento.findOne({ medicaoId: req.params.id });
      if (orc) {
        // Já tem orçamento: salva como dados pendentes de revisão, status 'alterada'
        const m = await Medicao.findByIdAndUpdate(
          req.params.id,
          { dadosAlterados: data, status: 'alterada', updatedAt: new Date() },
          { new: true, runValidators: false }
        );
        if (!m) return res.status(404).json({ error: 'Medição não encontrada.' });
        return res.json(m);
      }
      // Sem orçamento: atualiza diretamente
      const m = await Medicao.findByIdAndUpdate(
        req.params.id,
        { ...data, status: 'recebida', updatedAt: new Date() },
        { new: true, runValidators: true }
      );
      if (!m) return res.status(404).json({ error: 'Medição não encontrada.' });
      return res.json(m);
    }
    // memStore fallback
    const idx = memStore.medicoes.findIndex(x => x._id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Medição não encontrada.' });
    const orc = memStore.orcamentos.find(o => o.medicaoId === req.params.id);
    if (orc) {
      memStore.medicoes[idx] = { ...memStore.medicoes[idx], dadosAlterados: data, status: 'alterada', updatedAt: new Date() };
    } else {
      memStore.medicoes[idx] = { ...memStore.medicoes[idx], ...data, status: 'recebida', updatedAt: new Date() };
    }
    res.json(memStore.medicoes[idx]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Aceitar alteração de medição reaberta
app.post('/api/medicoes/:id/aceitar-alteracao', auth, async (req, res) => {
  try {
    await connectDB();
    if (isConnected) {
      const m = await Medicao.findOne({ _id: req.params.id });
      if (!m) return res.status(404).json({ error: 'Medição não encontrada.' });
      if (m.status !== 'alterada' || !m.dadosAlterados) {
        return res.status(400).json({ error: 'Esta medição não tem alterações pendentes.' });
      }
      // Verifica se o orçamento foi enviado para o cliente
      const orc = await Orcamento.findOne({ medicaoId: req.params.id });
      if (orc && orc.enviadoParaCliente) {
        return res.status(409).json({
          error: 'O orçamento já foi enviado ao cliente. Não é possível aceitar alterações. Gere um novo orçamento com os dados atualizados.',
          bloqueado: true
        });
      }
      const novosDados = m.dadosAlterados;
      // Aplica os novos dados à medição e limpa dadosAlterados
      await Medicao.findByIdAndUpdate(req.params.id, {
        ...novosDados,
        status: 'recebida',
        dadosAlterados: null,
        updatedAt: new Date()
      });
      // Se existir orçamento, atualiza locais e recalcula itens de quantidade
      if (orc && novosDados.locais) {
        const locaisNovos = novosDados.locais;
        // Recalcula totais por tipo de serviço
        const TIPOS = ['trinca','juntaFria','ralo','juntaDilat','ferragem','cortina'];
        const totais = {};
        TIPOS.forEach(t => { totais[t] = 0; });
        locaisNovos.forEach(loc => {
          TIPOS.forEach(t => {
            const v = loc[t];
            const num = Array.isArray(v) ? v.reduce((a,b) => a + parseFloat(b||0), 0) : parseFloat(v||0);
            totais[t] = (totais[t] || 0) + num;
          });
        });
        // Atualiza itens do orçamento com novas quantidades
        const itensAtualizados = (orc.itens || []).map(item => {
          const tipo = item.tipo;
          if (tipo && totais[tipo] !== undefined) {
            const qtd = totais[tipo];
            return { ...item, quantidade: qtd, subtotal: qtd * (item.valorUnit || 0) };
          }
          return item;
        });
        const totalBruto = itensAtualizados.reduce((s, i) => s + (i.subtotal || 0), 0);
        await Orcamento.findByIdAndUpdate(orc._id, {
          locais: locaisNovos,
          itens: itensAtualizados,
          totalBruto,
          totalLiquido: totalBruto,
          updatedAt: Date.now()
        });
      }
      const updated = await Medicao.findOne({ _id: req.params.id });
      return res.json({ ok: true, medicao: updated, orcamentoAtualizado: !!orc });
    }
    // memStore
    const idx = memStore.medicoes.findIndex(x => x._id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Medição não encontrada.' });
    const m = memStore.medicoes[idx];
    const orc = memStore.orcamentos.find(o => o.medicaoId === req.params.id);
    if (orc && orc.enviadoParaCliente) {
      return res.status(409).json({ error: 'Orçamento já enviado ao cliente. Gere um novo orçamento.', bloqueado: true });
    }
    const nd = m.dadosAlterados || {};
    memStore.medicoes[idx] = { ...m, ...nd, status: 'recebida', dadosAlterados: null, updatedAt: new Date() };
    res.json({ ok: true, medicao: memStore.medicoes[idx] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Recusar alteração de medição reaberta
app.post('/api/medicoes/:id/recusar-alteracao', auth, async (req, res) => {
  try {
    await connectDB();
    if (isConnected) {
      const m = await Medicao.findByIdAndUpdate(
        req.params.id,
        { dadosAlterados: null, status: 'recebida', updatedAt: new Date() },
        { new: true }
      );
      if (!m) return res.status(404).json({ error: 'Medição não encontrada.' });
      return res.json({ ok: true, medicao: m });
    }
    const idx = memStore.medicoes.findIndex(x => x._id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Medição não encontrada.' });
    memStore.medicoes[idx] = { ...memStore.medicoes[idx], dadosAlterados: null, status: 'recebida', updatedAt: new Date() };
    res.json({ ok: true, medicao: memStore.medicoes[idx] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Toggle enviadoParaCliente no orçamento
app.post('/api/orcamentos/:id/enviado-cliente', auth, async (req, res) => {
  try {
    await connectDB();
    if (isConnected) {
      const orc = await Orcamento.findOne({ _id: req.params.id });
      if (!orc) return res.status(404).json({ error: 'Orçamento não encontrado.' });
      const novoValor = !orc.enviadoParaCliente;
      await Orcamento.findByIdAndUpdate(req.params.id, { enviadoParaCliente: novoValor, updatedAt: Date.now() });
      return res.json({ ok: true, enviadoParaCliente: novoValor });
    }
    const idx = memStore.orcamentos.findIndex(o => o._id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Orçamento não encontrado.' });
    const novo = !memStore.orcamentos[idx].enviadoParaCliente;
    memStore.orcamentos[idx].enviadoParaCliente = novo;
    res.json({ ok: true, enviadoParaCliente: novo });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/medicoes/:id', auth, adminOnly, async (req, res) => {
  try {
    await connectDB();
    await audit(req, 'delete', 'medicao', req.params.id);
    if (isConnected) {
      const doc = await Medicao.findOne({ _id: req.params.id });
      if (doc) await salvarNaLixeira('medicao', 'Medição', 'medicoes', doc, req.user?.email || req.user?.username);
      await Medicao.findOneAndDelete({ _id: req.params.id });
    } else {
      const doc = memStore.medicoes.find(x => x._id === req.params.id);
      if (doc) await salvarNaLixeira('medicao', 'Medição', 'medicoes', doc, req.user?.email);
      memStore.medicoes = memStore.medicoes.filter(x => x._id !== req.params.id);
    }
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Orçamentos Routes ─────────────────────────────────────────────────────────

app.get('/api/orcamentos', auth, async (req, res) => {
  try {
    await connectDB();
    if (isConnected) return res.json(await Orcamento.find()
      .sort({ createdAt: -1 })
      .select('-pdfBase64 -propostas -locais.fotos -locais.fotosMedicao')
      .lean());
    res.json(memStore.orcamentos);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// calcObra → importado de ./lib/helpers.js

app.post('/api/orcamentos', auth, async (req, res) => {
  try {
    await connectDB();
    const cfg = await getConfig();
    const precos = cfg.precos || cfg;

    // Get medicao to pull quantities
    let medicao = null;
    if (req.body.medicaoId) {
      if (isConnected) medicao = await Medicao.findById(req.body.medicaoId);
      else medicao = memStore.medicoes.find(x => x._id === req.body.medicaoId);
    }

    // Calculate totals per service type from locais
    const totals = { trinca: 0, juntaFria: 0, ralo: 0, juntaDilat: 0, ferragem: 0, cortina: 0 };
    if (medicao?.locais) {
      medicao.locais.forEach(l => {
        totals.trinca += l.trinca || 0;
        totals.juntaFria += l.juntaFria || 0;
        totals.ralo += l.ralo || 0;
        totals.juntaDilat += l.juntaDilat || 0;
        totals.ferragem += l.ferragem || 0;
        totals.cortina += l.cortina || 0;
      });
    }

    const obra = calcObra(totals);

    const itens = [
      { tipo: 'trinca', descricao: 'Trincas', quantidade: totals.trinca, unidade: 'm', valorUnit: precos.trinca, subtotal: totals.trinca * precos.trinca },
      { tipo: 'juntaFria', descricao: 'Juntas Frias', quantidade: totals.juntaFria, unidade: 'm', valorUnit: precos.juntaFria, subtotal: totals.juntaFria * precos.juntaFria },
      { tipo: 'ralo', descricao: 'Ralos', quantidade: totals.ralo, unidade: 'unid', valorUnit: precos.ralo, subtotal: totals.ralo * precos.ralo },
      { tipo: 'juntaDilat', descricao: 'Juntas de Dilatação', quantidade: totals.juntaDilat, unidade: 'm', valorUnit: precos.juntaDilat, subtotal: totals.juntaDilat * precos.juntaDilat },
      { tipo: 'ferragem', descricao: 'Tratamento de Ferragens', quantidade: totals.ferragem, unidade: 'm', valorUnit: precos.ferragem, subtotal: totals.ferragem * precos.ferragem },
      { tipo: 'cortina', descricao: 'Cortinas', quantidade: totals.cortina, unidade: 'm²', valorUnit: precos.cortina, subtotal: totals.cortina * precos.cortina },
      { tipo: 'art', descricao: 'ART Engº', quantidade: 1, unidade: 'unid', valorUnit: precos.art, subtotal: precos.art },
      { tipo: 'mobilizacao', descricao: 'Mobilização', quantidade: 1, unidade: 'unid', valorUnit: precos.mobilizacao, subtotal: precos.mobilizacao },
    ];

    const totalBruto = itens.reduce((s, i) => s + i.subtotal, 0);

    const numeroAtual = (cfg.precos || cfg).numOrcamento || 1;

    const novoOrcamento = {
      _id: uuidv4(),
      numero: numeroAtual,
      medicaoId: req.body.medicaoId || null,
      numeroMedicao: medicao?.numeroMedicao || null,
      status: 'rascunho',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      cliente: medicao?.cliente || '',
      endereco: medicao?.endereco || '',
      bairro: medicao?.bairro || '',
      cidade: medicao?.cidade || '',
      cep: medicao?.cep || '',
      ac: '',
      celular: '',
      dataOrcamento: new Date().toLocaleDateString('pt-BR'),
      validade: '30',
      avaliadoPor: medicao?.avaliadoPor || '', acompanhadoPor: medicao?.ac || '', tecnicoResponsavel: '', elaboradoPor: '',
      origem: '', sigla: '',
      garantia: Number(medicao?.garantia) || 15,
      andaime: String(medicao?.andaime || 'nao').trim().toLowerCase(),
      andaimeMetros: medicao?.andaimeMetros || 0,
      andaimeRodinhas: medicao?.andaimeRodinhas || false,
      andaimeBases: medicao?.andaimeBases || false,
      andaimeLargura: medicao?.andaimeLargura || '1m',
      itens,
      totalBruto,
      desconto: 0, descontoTipo: 'percent',
      totalLiquido: totalBruto,
      entrada: 0, saldo: totalBruto, parcelas: 1, valorParcela: totalBruto,
      obsAdicionais: '',
      locais: medicao?.locais || [],
      diasTrabalho: obra.diasTrabalho,
      consumoProduto: obra.consumoProduto,
      qtdInjetores: obra.qtdInjetores,
      ...creatorInfo(req),
    };

    if (isConnected) {
      const saved = await Orcamento.create(novoOrcamento);
      // Increment numOrcamento asynchronously (does not block response)
      Config.findByIdAndUpdate('main', { $inc: { 'precos.numOrcamento': 1 } }, { upsert: true }).catch(console.error);
      return res.json(saved);
    }
    memStore.orcamentos.push(novoOrcamento);
    // Increment numOrcamento in memStore
    if (!memStore.config) memStore.config = { precos: {} };
    memStore.config.precos.numOrcamento = (memStore.config.precos.numOrcamento || 1) + 1;
    res.json(novoOrcamento);
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }); }
});

app.get('/api/orcamentos/:id', auth, async (req, res) => {
  try {
    await connectDB();
    if (isConnected) {
      const o = await Orcamento.findById(req.params.id);
      if (!o) return res.status(404).json({ error: 'Not found' });
      return res.json(o);
    }
    const o = memStore.orcamentos.find(x => x._id === req.params.id);
    if (!o) return res.status(404).json({ error: 'Not found' });
    res.json(o);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Duplicar orçamento — copia todos os dados, atribui próximo número
app.post('/api/orcamentos/:id/duplicar', auth, async (req, res) => {
  try {
    await connectDB();
    let original;
    if (isConnected) {
      original = await Orcamento.findById(req.params.id);
    } else {
      original = memStore.orcamentos.find(x => x._id === req.params.id);
    }
    if (!original) return res.status(404).json({ error: 'Orçamento não encontrado' });

    const orig = original.toObject ? original.toObject() : { ...original };
    const cfg = await getConfig();
    const numeroAtual = (cfg.precos || cfg).numOrcamento || 1;

    const copia = {
      ...orig,
      _id: uuidv4(),
      numero: numeroAtual,
      status: 'rascunho',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      dataOrcamento: new Date().toLocaleDateString('pt-BR'),
      // Limpar vínculos com medição/contrato originais
      medicaoId: orig.medicaoId || null,
      zapsignDocId: undefined,
      zapsignSignUrl: undefined,
      ...creatorInfo(req),
    };
    delete copia.zapsignDocId;
    delete copia.zapsignSignUrl;

    if (isConnected) {
      const saved = await Orcamento.create(copia);
      Config.findByIdAndUpdate('main', { $inc: { 'precos.numOrcamento': 1 } }, { upsert: true }).catch(console.error);
      return res.json(saved);
    }
    memStore.orcamentos.push(copia);
    if (!memStore.config) memStore.config = { precos: {} };
    memStore.config.precos.numOrcamento = (memStore.config.precos.numOrcamento || 1) + 1;
    res.json(copia);
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }); }
});

app.put('/api/orcamentos/:id', auth, bigJson, async (req, res) => {
  try {
    await connectDB();
    // Strip immutable/internal fields before update to avoid MongoDB errors
    const { _id, id, __v, ...rest } = req.body;
    // Normalize andaime explicitly (string, lowercase, trimmed)
    if (rest.andaime !== undefined) rest.andaime = String(rest.andaime).trim().toLowerCase();
    const updates = { ...rest, updatedAt: Date.now() };
    if (isConnected) {
      // Audit log se o número do orçamento foi alterado
      if (typeof updates.numero === 'number') {
        const atual = await Orcamento.findById(req.params.id).lean();
        if (atual && updates.numero !== atual.numero) {
          await audit(req, 'update-numero-orcamento', 'orcamento', req.params.id, {
            de: atual.numero, para: updates.numero, cliente: atual.cliente,
          });
        }
      }
      // Use $set explicitly for Mongoose 8 compatibility (avoids implicit replace)
      const o = await Orcamento.findByIdAndUpdate(
        req.params.id,
        { $set: updates },
        { new: true, strict: false }
      );
      return res.json(o);
    }
    const idx = memStore.orcamentos.findIndex(x => x._id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Not found' });
    memStore.orcamentos[idx] = { ...memStore.orcamentos[idx], ...updates };
    res.json(memStore.orcamentos[idx]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/orcamentos/:id', auth, adminOnly, async (req, res) => {
  await audit(req, 'delete', 'orcamento', req.params.id);
  try {
    await connectDB();
    if (isConnected) {
      const doc = await Orcamento.findOne({ _id: req.params.id });
      if (doc) await salvarNaLixeira('orcamento', 'Orçamento', 'orcamentos', doc, req.user?.email || req.user?.username);
      await Orcamento.findOneAndDelete({ _id: req.params.id });
    } else {
      const doc = memStore.orcamentos.find(x => x._id === req.params.id);
      if (doc) await salvarNaLixeira('orcamento', 'Orçamento', 'orcamentos', doc, req.user?.email);
      memStore.orcamentos = memStore.orcamentos.filter(x => x._id !== req.params.id);
    }
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/orcamentos/:id/approve', auth, async (req, res) => {
  try {
    await connectDB();
    let o;
    if (isConnected) {
      o = await Orcamento.findByIdAndUpdate(req.params.id, { status: 'aprovado', updatedAt: Date.now() }, { new: true });
    } else {
      const idx = memStore.orcamentos.findIndex(x => x._id === req.params.id);
      if (idx === -1) return res.status(404).json({ error: 'Not found' });
      memStore.orcamentos[idx].status = 'aprovado';
      o = memStore.orcamentos[idx];
    }
    // Push notification para setores Financeiro e Administrativo
    if (o) {
      sendPushToSetores(['Financeiro', 'Administrativo'], {
        title: '📋 Contrato Pendente',
        body: `Orçamento #${o.numero || ''} aprovado — ${o.cliente || ''}`.trim().replace(/—\s*$/, ''),
        icon: '/logo.png',
        url: '/contratos'
      });
    }
    res.json(o);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Desfazer aprovação — reverte status e deleta contrato vinculado ────────────
app.post('/api/orcamentos/:id/desfazer-aprovacao', auth, async (req, res) => {
  try {
    await connectDB();

    // 1. Busca o orçamento
    let orc;
    if (isConnected) orc = await Orcamento.findById(req.params.id);
    else orc = memStore.orcamentos.find(x => x._id === req.params.id);
    if (!orc) return res.status(404).json({ error: 'Orçamento não encontrado' });
    if ((orc.status || orc.status) !== 'aprovado') {
      return res.status(400).json({ error: 'Orçamento não está aprovado' });
    }

    // 2. Busca o contrato vinculado
    let contrato = null;
    if (isConnected) {
      contrato = await Contrato.findOne({ orcamentoId: req.params.id });
    } else {
      contrato = memStore.contratos?.find(c => c.orcamentoId === req.params.id);
    }

    if (contrato) {
      const cStatus = contrato.status || 'rascunho';
      // Bloqueia se já foi assinado
      if (cStatus === 'assinado') {
        return res.status(400).json({ error: 'Não é possível desfazer: o contrato já foi assinado.' });
      }
      // Bloqueia se já tem OS criada
      let temOS = false;
      if (isConnected) {
        temOS = !!(await OS.findOne({ contratoId: String(contrato._id) }));
      } else {
        temOS = !!(memStore.ordensServico?.find(o => o.contratoId === String(contrato._id)));
      }
      if (temOS) {
        return res.status(400).json({ error: 'Não é possível desfazer: já existe uma Ordem de Serviço criada a partir deste contrato.' });
      }

      // 3. Salva na lixeira e deleta o contrato
      const deletadoPor = req.user?.email || req.user?.username || 'sistema';
      await salvarNaLixeira('contrato', 'Contrato', 'contratos', contrato, deletadoPor);
      if (isConnected) {
        await Contrato.findByIdAndDelete(contrato._id);
      } else {
        memStore.contratos = memStore.contratos.filter(c => String(c._id) !== String(contrato._id));
      }
    }

    // 4. Reverte status do orçamento para 'enviado'
    if (isConnected) {
      orc = await Orcamento.findByIdAndUpdate(
        req.params.id,
        { status: 'enviado', updatedAt: Date.now() },
        { new: true }
      );
    } else {
      const idx = memStore.orcamentos.findIndex(x => x._id === req.params.id);
      memStore.orcamentos[idx].status = 'enviado';
      orc = memStore.orcamentos[idx];
    }

    return res.json({
      ok: true,
      orcamento: orc,
      contratoExcluido: contrato ? String(contrato._id) : null,
    });
  } catch (err) {
    console.error('[desfazer-aprovacao]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── PDF Generation ────────────────────────────────────────────────────────────


export function buildOrcamentoPdfHtml(o) {
  // Normaliza andaime: aceita 'sim', 'Sim', true, 'true', 1 → true
  const hasAndaime = String(o.andaime || '').trim().toLowerCase() === 'sim' || o.andaime === true;
  const fmt = (n) => 'R$ ' + (n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
  const fmtDate = fmtDateBR; // usa helper global — DD/MM/YYYY robusto
  const fmtNum = (n) => (n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
  // Formata validade: "30" → "30 dias"; date string → data formatada
  const fmtValidade = (v) => {
    if (!v) return '';
    if (/^\d+$/.test(String(v))) return String(v) + ' dias';
    return fmtDate(String(v));
  };

  // ── ORÇAMENTO MÍNIMO — mesma estrutura do comum, locais simplificados ────────
  if (o.orcMinimo) {
    const totalMin = o.totalMinimo || o.totalLiquido || 0;
    const locaisMin = (o.locais || []);
    const prazoExecucaoM = o.prazoExecucao || 3;
    const garantiaM = o.garantia || 15;
    const parcelas = o.parcelas || 1;
    // Proposta 1 — aplica desconto1 sobre totalMin
    const desconto1ValM = o.descontoTipo1 === 'valor'
      ? (Number(o.desconto1) || 0)
      : totalMin * (Number(o.desconto1) || 0) / 100;
    const totalProposta1Min = Math.max(0, totalMin - desconto1ValM);
    // Proposta 2 — aplica desconto2 sobre totalMin + calcula entrada/parcelas
    const desconto2ValM = o.descontoTipo2 === 'valor'
      ? (Number(o.desconto2) || 0)
      : totalMin * (Number(o.desconto2) || 0) / 100;
    const totalProposta2Min = Math.max(0, totalMin - desconto2ValM);
    const entradaTipo2M = o.entradaTipo2 || 'percent';
    const entrada2PctM = o.entrada2 != null ? Number(o.entrada2) : (o.entrada != null ? Number(o.entrada) : 50);
    const entradaVal2Min = entradaTipo2M === 'valor'
      ? (Number(o.entrada2) || 0)
      : totalProposta2Min * entrada2PctM / 100;
    const saldo2Min = Math.max(0, totalProposta2Min - entradaVal2Min);
    const valorParcela2Min = parcelas > 1 ? saldo2Min / parcelas : totalProposta2Min;

    const condicaoPgto1ObsM = o.condicaoPgto1Obs || '*Pgto a vista, na assinatura do contrato.';
    const condicaoPgto2Obs1M = o.condicaoPgto2Obs1 || '* 1ª parcela de entrada na assinatura do contrato.';
    const condicaoPgto2Obs2M = o.condicaoPgto2Obs2 || '*2ª parcela p/ 30 dias.';
    const obsGeralM = o.obsGeral || 'Obs: O contrato deve ser assinado até 2 dias após recebimento. Após este período não garantimos a data estabelecida préviamente para execução do serviço, podendo ser modificada sem aviso prévio.';

    const seloSrcM = garantiaM <= 7 ? SELO7_B64 : SELO15_B64;
    const seloImgM = seloSrcM
      ? `<img src="data:image/png;base64,${seloSrcM}" style="width:82px;height:auto;display:block;" alt="${garantiaM} anos">`
      : `<div style="width:76px;height:76px;border-radius:50%;border:3px solid #c8942a;background:linear-gradient(135deg,#f5d060,#c8942a);display:flex;flex-direction:column;align-items:center;justify-content:center;color:white;font-weight:bold;">
          <div style="font-size:8px;text-align:center;">★ SUA OBRA TEM ★</div>
          <div style="font-size:20px;font-weight:900;line-height:1;">${garantiaM}</div>
          <div style="font-size:8px;letter-spacing:1px;">ANOS DE</div>
          <div style="font-size:7px;font-style:italic;">Garantia</div>
        </div>`;

    const LOGO_HTML_M = `<div class="pg-logo-inline" style="text-align:center;margin-bottom:8px;">${LOGO_B64 ? `<img src="data:image/png;base64,${LOGO_B64}" style="max-width:280px;height:auto;display:block;margin:0 auto;" alt="Vedafácil">` : `<div style="font-size:28px;font-weight:900;color:#e87722;">VEDAFÁCIL</div>`}</div>`;

    const FOOTER_M = `<div class="pg-footer-inline" style="text-align:center;font-size:8.5px;color:#666;margin-top:12px;padding-top:5px;border-top:1px solid #ccc;">
      <strong style="font-size:9px;color:#e87722;">Eliminamos Infiltrações Sem Quebrar!</strong><br>
      CNPJ: 23.606.470/0001-07 &nbsp;|&nbsp; Tel.: (21) 99984-1127 / (24) 2106-1015
    </div>`;

    const SIMBOLO_M = SIMBOLO_B64
      ? `<img src="data:image/png;base64,${SIMBOLO_B64}" style="width:22px;height:22px;margin-right:8px;flex-shrink:0;vertical-align:middle;display:inline-block;" alt="Vedafácil">`
      : `<div style="width:22px;height:22px;border-radius:50%;border:2px solid rgba(255,255,255,0.8);display:inline-flex;align-items:center;justify-content:center;margin-right:8px;flex-shrink:0;background:rgba(255,255,255,0.15);vertical-align:middle;"><div style="width:6px;height:6px;background:white;border-radius:1px;transform:skewX(-15deg);"></div></div>`;

    const secM = (n, t) => `<div style="background:#e87722;color:white;padding:7px 12px;margin:14px 0 10px;font-size:12px;display:flex;align-items:center;border-radius:2px;">${SIMBOLO_M}<em><strong>${n}. ${t}</strong></em></div>`;

    const gvfLogoM = GVF_SEAL_LOGO_B64 ? `<img src="data:image/png;base64,${GVF_SEAL_LOGO_B64}" style="width:110px;height:auto;display:block;" alt="GVF SEAL">` : '';
    const gvfGalaoM = GVF_GALAO_B64 ? `<img src="data:image/png;base64,${GVF_GALAO_B64}" style="width:110px;height:auto;display:block;border-radius:4px;" alt="GVF SEAL Galão">` : '';

    // Seção 5 — Localização simplificada: "Eliminar infiltrações em LOCAL"
    const locaisListM = locaisMin.length > 0
      ? locaisMin.map((l, i) => `<div style="padding:5px 0;border-bottom:1px solid #eee;display:flex;align-items:center;gap:8px;">
          <span style="background:#e87722;color:white;border-radius:50%;width:18px;height:18px;display:inline-flex;align-items:center;justify-content:center;font-size:9px;font-weight:bold;flex-shrink:0;">${i+1}</span>
          <span style="font-size:10.5px;">Eliminar infiltrações em <strong>${l.nome || l.local || `Local ${i+1}`}</strong></span>
        </div>`).join('')
      : '<div style="color:#888;font-style:italic;font-size:10.5px;">Nenhum local cadastrado</div>';

    // Foto pages (relatório fotográfico) — 2 fotos por página A4
    const locaisComFotosM = locaisMin.filter(l => l.fotos && l.fotos.length > 0);
    const photoPagesM = locaisComFotosM.map((l) => {
      const fotos = l.fotos || [];
      const pairs = [];
      for (let i = 0; i < fotos.length; i += 2) pairs.push(fotos.slice(i, i + 2));
      return pairs.map(pair => `
      <div class="pg pb">
        ${pair.map(f => `
        <div style="margin-bottom:6mm;border:1px solid #ccc;padding:6px;break-inside:avoid">
          <div style="font-size:10px;font-weight:bold;margin-bottom:4px">${l.nome || ''}</div>
          <img src="${f.data || f}" style="width:100%;max-height:115mm;object-fit:contain;display:block" alt="">
        </div>`).join('')}
      </div>`).join('');
    }).join('');

    return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>${o.numero||1} - ${o.cliente||'cliente'}</title>
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: Arial, Helvetica, sans-serif; font-size: 11px; color: #222; }
.pg { padding: 12mm 20mm; max-width: 210mm; margin: 0 auto; }
.pb { page-break-before: always; }
.bt { font-size: 10.5px; line-height: 1.65; text-align: justify; }
.bt p { margin-bottom: 8px; text-indent: 20px; }
.feats { display:grid; grid-template-columns:1fr 1fr; gap:4px 20px; margin-top:12px; font-size:10px; font-weight:bold; font-style:italic; }
.feats div::before { content:'✓ '; color:#e87722; }
.hbox { display:grid; grid-template-columns:1fr 1fr; border:1px solid #999; margin-bottom:14px; }
.hbox-l { padding:9px 12px; border-right:1px solid #999; font-size:10.5px; }
.hbox-r { padding:9px 12px; font-size:10.5px; }
table.val { width:100%; border-collapse:collapse; font-size:10.5px; margin:8px 0; }
table.val th, table.val td { border:1px solid #aaa; padding:5px 8px; }
table.val th { font-weight:bold; text-align:center; background:#e87722; color:white; }
table.pay { width:100%; border-collapse:collapse; font-size:10.5px; margin:8px 0 2px; }
table.pay td { border:1px solid #aaa; padding:5px 10px; }
.obs-box { border:1px solid #bbb; padding:8px 12px; margin-top:12px; font-size:10.5px; }
.sigs { display:grid; grid-template-columns:repeat(4,1fr); gap:12px; margin-top:24px; text-align:center; font-size:9.5px; }
.sigs .role { color:#444; margin-bottom:24px; }
.sigs .line { border-top:1px solid #333; padding-top:4px; font-weight:bold; font-size:10px; }
.gtee { display:flex; gap:14px; align-items:flex-start; margin:10px 0; }
.download-btn { position:fixed; top:12px; right:12px; z-index:9999; background:#e87722; color:white; border:none; padding:10px 20px; font-size:14px; font-weight:700; border-radius:8px; cursor:pointer; box-shadow:0 2px 8px rgba(0,0,0,0.3); }
.download-btn:hover { background:#d06a1b; }
.doc-tbl { display:block; width:100%; max-width:210mm; margin:0 auto; }
.doc-tbl > thead,.doc-tbl > tfoot { display:none; }
.doc-tbl > tbody,.doc-tbl > tbody > tr,.doc-tbl > tbody > tr > td { display:block; }
@media print {
  body { -webkit-print-color-adjust:exact; print-color-adjust:exact; }
  @page { size:A4; margin:0; }
  .download-btn { display:none !important; }
  .pg-logo-inline { display:none !important; }
  .pg-footer-inline { display:none !important; }
  .doc-tbl { display:table; width:100%; border-collapse:collapse; table-layout:fixed; }
  .doc-tbl > thead { display:table-header-group; }
  .doc-tbl > tfoot { display:table-footer-group; }
  .doc-tbl > tbody { display:table-row-group; }
  .doc-tbl > tbody > tr { display:table-row; }
  .doc-tbl > tbody > tr > td,.doc-tbl > thead > tr > th { display:table-cell; padding:0; font-weight:normal; }
  .pg { padding:8mm 22mm !important; }
}
</style>
</head>
<body>
<button class="download-btn" onclick="window.print()">⬇ Salvar como PDF</button>
<table class="doc-tbl">
<thead><tr><th>
  <div style="display:flex;justify-content:space-between;align-items:center;padding:6mm 22mm;border-bottom:2px solid #e87722;background:#fff">
    <div>${LOGO_B64 ? `<img src="data:image/png;base64,${LOGO_B64}" style="height:14mm;width:auto" alt="Vedafácil">` : '<span style="font-size:18px;font-weight:900;color:#e87722">VEDAFÁCIL</span>'}</div>
    <div style="text-align:right;line-height:1.6">
      <div style="font-size:13px;font-weight:800;color:#333">ORÇAMENTO MÍNIMO Nº ${o.numero||1}</div>
      <div style="font-size:10px;color:#e87722;margin-top:1px">${o.cliente||''}</div>
    </div>
  </div>
</th></tr></thead>
<tfoot><tr><td>
  <div style="text-align:center;font-size:8.5px;color:#666;padding:5mm 22mm;border-top:1px solid #ddd;background:#fff;line-height:1.7">
    <strong style="color:#e87722;font-size:9px">Eliminamos Infiltrações Sem Quebrar!</strong><br>
    CNPJ: 23.606.470/0001-07 &nbsp;|&nbsp; Tel.: (21) 99984-1127 / (24) 2106-1015
  </div>
</td></tr></tfoot>
<tbody><tr><td>

<!-- PAGE 1 -->
<div class="pg">
${LOGO_HTML_M}
<div class="hbox">
  <div class="hbox-l">
    <strong style="font-size:12px;display:block;margin-bottom:3px;">${o.cliente||''}</strong>
    ${o.endereco ? `<div>${o.endereco}${o.cidade?', '+o.cidade:''}${o.cep?'/'+o.cep.replace('-',''):''}</div>` : ''}
    <div>${[o.ac, o.celular].filter(Boolean).join(' - ')}</div>
  </div>
  <div class="hbox-r">
    <div style="font-size:13px;font-weight:bold;text-align:right;margin-bottom:6px;">ORÇAMENTO MÍNIMO Nº ${o.numero||1}</div>
    <div style="display:flex;justify-content:space-between;"><span>Data Medição:</span><strong>${fmtDate(o.dataOrcamento)}</strong></div>
    <div style="display:flex;justify-content:space-between;"><span>Validade da Proposta:</span><strong>${fmtValidade(o.validade||'30')}</strong></div>
  </div>
</div>

<p style="margin-bottom:4px;">Prezado (a),&nbsp;&nbsp;&nbsp;${o.ac||o.cliente||''}</p>
<p style="margin-bottom:14px;">Temos o prazer de submeter a vossa consideração, nosso orçamento para a eliminação de infiltrações:</p>

${secM('1','MÉTODO DE IMPERMEABILIZAÇÃO REPARATIVA')}
<div class="bt">
  <p>O método de injeção é a tecnologia mais moderna e avançada para eliminar qualquer tipo de infiltração em trincas e rachaduras em qualquer superfície de concreto maciço. O produto é injetado no concreto, nos pontos de infiltração, com equipamentos exclusivos, que o forçam a penetrar na estrutura vedando trincas e microfissuras até atingir a origem do vazamento.</p>
  <p>O gel hidroabsorvente <em>GVF SEAL</em> possui a consistência da água quando injetado, por isso percola exatamente o mesmo caminho da infiltração, mas em sentido contrário. Enquanto se injeta, permanece em estado líquido e quando a injeção se interrompe, em um minuto e meio, se transforma num gel flexível que produzirá a vedação do ponto tratado.</p>
</div>

${secM('2','PROPRIEDADES DO GVF SEAL')}
<div style="display:flex;gap:14px;margin:8px 0;">
  <div class="bt" style="flex:1;">
    <p>O GVF Seal possui viscosidade ultra baixa que possui altíssima penetração em trincas capilares. Após a cura, o gel forma uma barreira flexível e impermeável que preenche trincas, rachaduras, buracos, nichos de concretagem, fissuras, etc.</p>
    <p>O gel formado é inalterável ao ataque de agentes químicos ou biológicos, assim como também aos sais presentes nas estruturas. Além disso, é hidroexpansivo: Em períodos de seca, diminui seu volume, mas sem afetar a membrana impermeável.</p>
    <p>Em contato com água, o produto reabsorve a mesma recuperando seu volume inicial. Este ciclo pode se repetir inúmeras vezes sem afetar as propriedades impermeáveis.</p>
  </div>
  <div style="flex-shrink:0;width:120px;display:flex;flex-direction:column;align-items:center;gap:8px;">
    ${gvfLogoM}${gvfGalaoM}
  </div>
</div>
<div class="feats">
  <div>PRODUTO BICOMPONENTE</div><div>HIDROEXPANSIVO E HIDROABSORVENTE</div>
  <div>POSSUI ATÉ 300% DE ELONGAÇÃO</div><div>PODE SER APLICADO COM FLUXO DE ÁGUA</div>
  <div>TEMPO DE REAÇÃO 1,05-1,55min</div><div>PENETRA EM FISSURAS DE ATÉ 0,05mm</div>
</div>

${secM('3','GARANTIA')}
<div class="gtee">
  <div style="width:90px;flex-shrink:0;text-align:center;">${seloImgM}</div>
  <div>
    <p class="bt" style="margin-bottom:10px;">A Vedafacil - Tecnologia em Impermeabilização oferece garantia de <strong>${garantiaM} anos</strong> nos pontos tratados e especificados no ítem LOCALIZAÇÃO deste orçamento. Após o término da obra os pontos tratados serão descritos em croqui e relatório PDF com imagens do antes e depois das áreas trabalhadas.</p>
    <div class="feats" style="grid-template-columns:1fr 1fr;">
      <div>CERTIFICADO DE GARANTIA</div><div>RELATÓRIO DE FOTOS ANTES E DEPOIS</div>
      <div>CROQUI DO LOCAL TRABALHADO</div>
    </div>
  </div>
</div>
<div class="obs-box"><strong>Observação:</strong> Esta proposta contempla garantia Pontual, somente nos locais orçados e tratados.</div>
${FOOTER_M}
</div>

<!-- PAGE 2 -->
<div class="pg pb">
${LOGO_HTML_M}
${secM('4','DESCRIÇÃO DA OBRA (PASSO A PASSO)')}
<div style="font-size:10.5px;line-height:1.65;">
  <p><strong><u>• INÍCIO</u></strong></p>
  <p>Mapeamento dos locais a serem tratados e confecção das imagens (ANTES).</p>
  <p>Isolamento da região a tratar utilizando faixa zebrada para área de recuo.</p>
  <p><strong><u>• PERFURAÇÃO</u></strong></p>
  <p>• Perfuração utilizando furadeira de impacto com broca no diâmetro de ½ polegada.</p>
  <p>• Colocação de bicos injetores na estrutura.</p>
  <p><strong><u>• APLICAÇÃO</u></strong></p>
  <p>• Início do processo de injeção com bomba injetora elétrica de alta pressão.</p>
  <p><strong><u>• ACABAMENTO</u></strong></p>
  <p>• Acabamento dos locais tratados, utilizando argamassa cimentícia.</p>
  <p><strong><u>• CONCLUSÃO</u></strong></p>
  <p>• Limpeza do local trabalhado e remoção de detritos gerados no decorrer do serviço.</p>
  <p>• Confecção do croqui e fotos da área trabalhada.</p>
  <p>• Conferência do serviço realizado junto à contrantante, assinatura do termo de entrega de obra.</p>
  <p style="margin-top:8px;"><u>O cliente deverá:</u></p>
  <p>✓ Disponibilizar vaga para veículo da VEDAFACIL.</p>
  <p>✓ Fornecer ponto de energia elétrica;</p>
  <p>✓ Providenciar liberação da área a ser trabalhada, acesso desobstruído e livre de circulação de pessoas.</p>
  ${hasAndaime ? `<p>✓ Autorizar entrada e providenciar local para armazenamento do andaime durante a execução.</p>` : ''}
</div>
${hasAndaime ? `
<div style="background:#fff8f0;border:1.5px solid #e87722;border-radius:6px;padding:10px 14px;margin:10px 0 4px;display:flex;align-items:flex-start;gap:10px;">
  <div style="font-size:20px;line-height:1;flex-shrink:0;">🏗️</div>
  <div>
    <div style="font-weight:bold;font-size:11px;color:#c45d12;margin-bottom:3px;">ANDAIME NECESSÁRIO</div>
    <div style="font-size:10.5px;line-height:1.6;color:#333;">
      Para a execução desta obra será necessário andaime${o.andaimeMetros>0?` de <strong>${o.andaimeMetros}m</strong> de altura`:''}${o.andaimeLargura?`, largura <strong>${o.andaimeLargura}</strong>`:''}${o.andaimeRodinhas?', <strong>com rodinhas</strong>':''}${o.andaimeBases?', <strong>com bases ajustáveis</strong>':''}.
    </div>
  </div>
</div>` : ''}

${secM('5','LOCALIZAÇÃO')}
<div style="border:1px solid #e87722;border-radius:4px;padding:12px 14px;margin:8px 0;">
  <div style="font-size:10.5px;font-weight:bold;color:#e87722;text-transform:uppercase;margin-bottom:8px;letter-spacing:0.5px;">ELIMINAR INFILTRAÇÕES EM:</div>
  ${locaisListM}
</div>
${FOOTER_M}
</div>

<!-- PAGE 3 -->
<div class="pg pb">
${LOGO_HTML_M}
${secM('6','VALORES')}
<table class="val">
  <thead>
    <tr>
      <th style="width:6%">Item</th>
      <th style="text-align:left">Descrição</th>
      <th>Unid.</th>
      <th>Qtde.</th>
      <th style="text-align:right">Valor Unit.</th>
      <th style="text-align:right">Valor por Item</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td style="text-align:center">1</td>
      <td style="text-align:left">Serviços de impermeabilização reparativa nos locais especificados</td>
      <td style="text-align:center">Vb</td>
      <td style="text-align:center">1</td>
      <td style="text-align:right">—</td>
      <td style="text-align:right">${fmt(totalMin)}</td>
    </tr>
  </tbody>
  <tfoot>
    <tr>
      <td colspan="5" style="text-align:right;font-weight:bold;background:#fff3e0;padding:6px 8px;">TOTAL DOS SERVIÇOS</td>
      <td style="text-align:right;font-weight:bold;background:#e87722;color:white;font-size:12px;padding:6px 8px;">${fmt(totalMin)}</td>
    </tr>
  </tfoot>
</table>

${secM('7','CONDIÇÕES DE PAGAMENTO')}
<div style="border:2px solid #e87722;border-radius:6px;padding:12px 16px;margin:10px 0 14px;display:flex;justify-content:space-between;align-items:center;background:#fff8f0;">
  <div style="font-size:12px;font-weight:bold;color:#555;">VALOR TOTAL DOS SERVIÇOS</div>
  <div style="font-size:22px;font-weight:900;color:#e87722;">${fmt(totalMin)}</div>
</div>

${o.mostrarProposta1 !== false ? `
<p style="text-align:center;font-weight:bold;font-size:11px;margin:6px 0 4px;">Proposta 1 : &nbsp;<em>(Pagamento à vista)</em></p>
<table class="pay">
  <tr>
    <td style="font-style:italic;width:55%"><em>Valor dos Serviços</em></td>
    <td colspan="2" style="text-align:right;font-weight:bold;">${fmt(totalMin)}</td>
  </tr>
  ${desconto1ValM > 0 ? `<tr>
    <td style="font-style:italic;color:#c0392b;"><em>Desconto${o.descontoTipo1 !== 'valor' && o.desconto1 > 0 ? ` (${Number(o.desconto1)}%)` : ''}</em></td>
    <td colspan="2" style="text-align:right;font-weight:bold;color:#c0392b;">- ${fmt(desconto1ValM)}</td>
  </tr>` : ''}
  <tr style="background:#f0fff4;">
    <td style="font-style:italic;"><em><strong>Total à Vista</strong></em></td>
    <td colspan="2" style="text-align:right;font-weight:bold;font-size:12px;color:#27ae60;">${fmt(totalProposta1Min)}</td>
  </tr>
  <tr><td colspan="3" style="font-style:italic;font-size:10px;">${condicaoPgto1ObsM}</td></tr>
</table>
` : ''}

${o.mostrarProposta2 !== false ? `
<p style="text-align:center;font-size:10.5px;margin:10px 0 4px;font-weight:bold;">Proposta 2 : &nbsp;<em>(Pagamento Parcelado)</em></p>
<table class="pay">
  <tr>
    <td style="font-style:italic;width:45%"><em>Valor dos Serviços</em></td>
    <td colspan="2" style="text-align:right;font-weight:bold;">${fmt(totalMin)}</td>
  </tr>
  ${desconto2ValM > 0 ? `<tr>
    <td style="font-style:italic;color:#c0392b;"><em>Desconto${o.descontoTipo2 !== 'valor' && o.desconto2 > 0 ? ` (${Number(o.desconto2)}%)` : ''}</em></td>
    <td colspan="2" style="text-align:right;font-weight:bold;color:#c0392b;">- ${fmt(desconto2ValM)}</td>
  </tr>` : ''}
  <tr style="background:#f0f4ff;">
    <td style="font-style:italic;"><em><strong>Total Parcelado</strong></em></td>
    <td colspan="2" style="text-align:right;font-weight:bold;font-size:12px;">${fmt(totalProposta2Min)}</td>
  </tr>
  ${entradaVal2Min > 0 ? `<tr>
    <td style="font-style:italic"><em>Entrada</em></td>
    <td colspan="2" style="text-align:right;font-weight:bold;">${fmt(entradaVal2Min)}</td>
  </tr>` : ''}
  ${parcelas > 1 ? `<tr>
    <td style="font-style:italic"><em>${parcelas}x parcela(s)</em></td>
    <td colspan="2" style="text-align:right;font-weight:bold;">${fmt(valorParcela2Min)}</td>
  </tr>` : ''}
  <tr><td colspan="3" style="font-style:italic;font-size:10px;font-weight:bold;">Observações:</td></tr>
  <tr><td colspan="3" style="font-style:italic;font-size:10px;background:#fff8f0;">${condicaoPgto2Obs1M}</td></tr>
  ${condicaoPgto2Obs2M ? `<tr><td colspan="3" style="font-style:italic;font-size:10px;background:#fff8f0;">${condicaoPgto2Obs2M}</td></tr>` : ''}
</table>
` : ''}

${obsGeralM ? `<div class="obs-box" style="margin-top:10px;font-size:10px;font-style:italic;">${obsGeralM}</div>` : ''}

${secM('8','INFORMAÇÕES ADICIONAIS')}
<p style="font-size:11px;margin:8px 0;">
  &rarr; O prazo de execução desta obra será de:
  <span style="display:inline-block;min-width:36px;border-bottom:1px solid #333;text-align:center;font-weight:bold;margin:0 6px;">${prazoExecucaoM}</span>
  dias úteis.
</p>
${hasAndaime ? `<p style="font-size:11px;margin:8px 0;">
  &rarr; <strong>Andaime:</strong> necessário${o.andaimeMetros>0?` — ${o.andaimeMetros}m de altura`:''}${o.andaimeLargura?` — largura ${o.andaimeLargura}`:''}${o.andaimeRodinhas?' — com rodinhas':''}${o.andaimeBases?' — com bases':''}.
</p>` : ''}
<p style="margin:12px 0;">A <strong>VEDAFACIL</strong> agradece sua atenção e fica ao seu dispor para maiores esclarecimentos.</p>
<p style="margin-bottom:18px;">Atenciosamente,</p>

<div class="sigs">
  <div><div class="role">Departamento<br>Comercial:</div><div class="line">${o.departamentoComercial||o.elaboradoPor||'Thiago Ferraz'}</div></div>
  <div><div class="role">Responsável<br>Medição:</div><div class="line">${o.avaliadoPor||o.responsavelMedicao||''}</div></div>
  <div><div class="role">Vistoria<br>acompanhada por:</div><div class="line">${o.acompanhadoPor||''}</div></div>
  <div><div class="role">&nbsp;</div><div class="line">Engº Jociel Moreira da Silva</div><div style="font-size:8.5px;color:#555;">CREA: 201.513.600.3</div></div>
</div>
${FOOTER_M}
</div>

${photoPagesM}

</td></tr></tbody>
</table>
<script>function downloadPDF(){window.print();}<\/script>
</body></html>`;
  }
  // ── FIM ORÇAMENTO MÍNIMO ──────────────────────────────────────────────────

  const descontoValor = o.descontoTipo === 'percent'
    ? (o.totalBruto * (o.desconto || 0) / 100)
    : (o.desconto || 0);
  const totalLiquido = o.totalLiquido || (o.totalBruto - descontoValor);
  const parcelas = o.parcelas || 1;
  const valorParcelaBruto = parcelas > 1 ? (o.totalBruto / parcelas) : o.totalBruto;

  // Two-proposal system
  const totalProposta1 = o.totalProposta1 || totalLiquido;
  const totalProposta2 = o.totalProposta2 || totalLiquido;
  const entradaVal2 = o.entradaVal2 != null ? o.entradaVal2 : (totalProposta2 * (Number(o.entrada2 ?? o.entrada ?? 50)) / 100);
  const valorParcela2 = o.valorParcela2 || (parcelas > 1 ? ((totalProposta2 - entradaVal2) / parcelas) : 0);

  // Desconto calculado para exibição no PDF
  const baseCalcPdf = o.totalBruto || totalLiquido;
  const desconto1Val = o.descontoTipo1 === 'valor'
    ? (Number(o.desconto1) || 0)
    : baseCalcPdf * (Number(o.desconto1) || 0) / 100;
  const desconto2Val = o.descontoTipo2 === 'valor'
    ? (Number(o.desconto2) || 0)
    : baseCalcPdf * (Number(o.desconto2) || 0) / 100;

  const locais = o.locais || [];
  // Build rows with optional ANDAR header rows (snapshot: each local stores its own andar)
  let _lastAndar = null;
  const locaisRows = locais.map(l => {
    const andar = (l.andar || '').trim();
    let andarRow = '';
    if (andar && andar !== _lastAndar) {
      andarRow = `<tr>
        <td colspan="9" style="background:#fff3e0;color:#c45d12;font-weight:bold;font-size:9.5px;padding:3px 8px;text-align:left;">🏢 ${andar}</td>
      </tr>`;
      _lastAndar = andar;
    }
    return `${andarRow}<tr>
      <td class="td-local">${l.nome || ''}</td>
      <td>${l.trinca > 0 ? fmtNum(l.trinca) : ''}</td>
      <td>${l.juntaFria > 0 ? fmtNum(l.juntaFria) : ''}</td>
      <td>${l.ralo > 0 ? l.ralo : ''}</td>
      <td>${l.juntaDilat > 0 ? fmtNum(l.juntaDilat) : ''}</td>
      <td>${l.ferragem > 0 ? fmtNum(l.ferragem) : ''}</td>
      <td></td><td></td>
      <td>${l.cortina > 0 ? fmtNum(l.cortina) : ''}</td>
    </tr>`;
  }).join('');

  const emptyRows = Array(Math.max(0, 5 - locais.length)).fill('<tr style="height:18px;"><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>').join('');

  const totais = {
    trinca: locais.reduce((s, l) => s + (l.trinca || 0), 0),
    juntaFria: locais.reduce((s, l) => s + (l.juntaFria || 0), 0),
    ralo: locais.reduce((s, l) => s + (l.ralo || 0), 0),
    juntaDilat: locais.reduce((s, l) => s + (l.juntaDilat || 0), 0),
    ferragem: locais.reduce((s, l) => s + (l.ferragem || 0), 0),
    cortina: locais.reduce((s, l) => s + (l.cortina || 0), 0),
  };

  const itensAtivos = (o.itens || []).filter(i => i.quantidade > 0);
  const valuesRows = itensAtivos.map((item, i) => `
    <tr>
      <td style="text-align:center">${i + 1}</td>
      <td style="text-align:left">${item.descricao}</td>
      <td style="text-align:center">${item.unidade || '-'}</td>
      <td style="text-align:center">${fmtNum(item.quantidade)}</td>
      <td style="text-align:right">${fmtNum(item.valorUnit)}</td>
      <td style="text-align:right">${fmtNum(item.subtotal)}</td>
    </tr>`).join('');

  const prazoExecucao = o.prazoExecucao || 3;
  const condicaoPgto1Obs = o.condicaoPgto1Obs || '*Pgto a vista, na assinatura do contrato.';
  const condicaoPgto2Obs1 = o.condicaoPgto2Obs1 || '* 1ª parcela de entrada na assinatura do contrato.';
  const condicaoPgto2Obs2 = o.condicaoPgto2Obs2 || '*2ª parcela p/ 30 dias.';
  const obsGeral = o.obsGeral || 'Obs: O contrato deve ser assinado até 2 dias após recebimento. Após este período não garantimos a data estabelecida préviamente para execução do serviço, podendo ser modificada sem aviso prévio.';

  const garantia = o.garantia || 15;
  const seloSrc = garantia <= 7 ? SELO7_B64 : SELO15_B64;
  const seloImg = seloSrc
    ? `<img src="data:image/png;base64,${seloSrc}" style="width:82px;height:auto;display:block;" alt="${garantia} anos">`
    : `<div style="width:76px;height:76px;border-radius:50%;border:3px solid #c8942a;background:linear-gradient(135deg,#f5d060,#c8942a);display:flex;flex-direction:column;align-items:center;justify-content:center;color:white;font-weight:bold;">
        <div style="font-size:8px;text-align:center;">★ SUA OBRA TEM ★</div>
        <div style="font-size:20px;font-weight:900;line-height:1;">${garantia}</div>
        <div style="font-size:8px;letter-spacing:1px;">ANOS DE</div>
        <div style="font-size:7px;font-style:italic;">Garantia</div>
      </div>`;

  const logoImg = LOGO_B64
    ? `<img src="data:image/png;base64,${LOGO_B64}" style="max-width:280px;height:auto;display:block;margin:0 auto;" alt="Vedafácil">`
    : `<div style="text-align:center;margin-bottom:10px;padding-bottom:8px;">
        <div style="font-size:34px;font-weight:900;color:#2a2a2a;letter-spacing:-1px;font-family:'Arial Black',Arial,sans-serif;line-height:1;">
          <span style="color:#e87722;">&#92;</span>VEDAF<span style="color:#e87722;">Á</span>CIL
        </div>
        <div style="font-size:9px;letter-spacing:3.5px;color:#444;margin-top:1px;font-weight:600;">TECNOLOGIA EM IMPERMEABILIZAÇÃO</div>
      </div>`;

  const LOGO_HTML = `<div class="pg-logo-inline" style="text-align:center;margin-bottom:8px;">${logoImg}</div>`;

  const FOOTER = `<div class="pg-footer-inline" style="text-align:center;font-size:8.5px;color:#666;margin-top:12px;padding-top:5px;border-top:1px solid #ccc;">
    <strong style="font-size:9px;color:#e87722;">Eliminamos Infiltrações Sem Quebrar!</strong><br>
    CNPJ: 23.606.470/0001-07 &nbsp;|&nbsp; Tel.: (21) 99984-1127 / (24) 2106-1015
  </div>`;

  const SIMBOLO = SIMBOLO_B64
    ? `<img src="data:image/png;base64,${SIMBOLO_B64}" style="width:22px;height:22px;margin-right:8px;flex-shrink:0;vertical-align:middle;display:inline-block;" alt="Vedafácil">`
    : `<div style="width:22px;height:22px;border-radius:50%;border:2px solid rgba(255,255,255,0.8);display:inline-flex;align-items:center;justify-content:center;margin-right:8px;flex-shrink:0;background:rgba(255,255,255,0.15);vertical-align:middle;"><div style="width:6px;height:6px;background:white;border-radius:1px;transform:skewX(-15deg);"></div></div>`;

  const sec = (n, t) => `<div style="background:#e87722;color:white;padding:7px 12px;margin:14px 0 10px;font-size:12px;display:flex;align-items:center;border-radius:2px;">${SIMBOLO}<em><strong>${n}. ${t}</strong></em></div>`;

const gvfLogo = GVF_SEAL_LOGO_B64
    ? `<img src="data:image/png;base64,${GVF_SEAL_LOGO_B64}" style="width:140px;height:auto;display:block;margin:0 auto;" alt="GVF SEAL">`
    : '';
  const gvfGalao = GVF_GALAO_B64
    ? `<img src="data:image/png;base64,${GVF_GALAO_B64}" style="width:100%;max-width:220px;height:auto;display:block;margin:6px auto 0;border-radius:6px;" alt="GVF SEAL Galão">`
    : '';

  const locaisComFotos = (o.locais || []).filter(l => l.fotos && l.fotos.length > 0);
  const photoPages = locaisComFotos.map((l) =>
    (l.fotos || []).map(f => `
    <div class="pg pb">
      <div style="font-size:11px;margin-bottom:10px;font-weight:bold;">${l.nome || ''}</div>
      <div style="border:1px solid #ccc;padding:8px;">
        <img src="${f.data || f}" style="width:100%;max-height:200mm;object-fit:contain;" alt="">
        <div style="text-align:center;font-size:9px;color:#555;margin-top:4px;">${l.nome || ''}</div>
      </div>
    </div>`).join('')
  ).join('');

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>${o.numero || 1} - ${o.cliente || 'cliente'}</title>
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: Arial, Helvetica, sans-serif; font-size: 11px; color: #222; }
.pg { padding: 12mm 20mm; max-width: 210mm; margin: 0 auto; }
.pb { page-break-before: always; }
.bt { font-size: 10.5px; line-height: 1.65; text-align: justify; }
.bt p { margin-bottom: 8px; text-indent: 20px; }
.bt p + p { text-indent: 20px; }
.feats { display:grid; grid-template-columns:1fr 1fr; gap:4px 20px; margin-top:12px; font-size:10px; font-weight:bold; font-style:italic; }
.feats div::before { content:'✓ '; color:#e87722; }
.hbox { display:grid; grid-template-columns:1fr 1fr; border:1px solid #999; margin-bottom:14px; }
.hbox-l { padding:9px 12px; border-right:1px solid #999; font-size:10.5px; }
.hbox-r { padding:9px 12px; font-size:10.5px; }
table.loc { width:100%; border-collapse:collapse; font-size:9.5px; margin:8px 0; }
table.loc th, table.loc td { border:1px solid #aaa; padding:4px 5px; text-align:center; }
table.loc th { font-weight:bold; background:#e87722; color:white; }
table.loc .tl { text-align:left; }
table.loc tfoot td { font-weight:bold; background:#fff3e0; }
table.val { width:100%; border-collapse:collapse; font-size:10.5px; margin:8px 0; }
table.val th, table.val td { border:1px solid #aaa; padding:5px 8px; }
table.val th { font-weight:bold; text-align:center; background:#e87722; color:white; }
table.pay { width:100%; border-collapse:collapse; font-size:10.5px; margin:8px 0 2px; }
table.pay td { border:1px solid #aaa; padding:5px 10px; }
.obs-box { border:1px solid #bbb; padding:8px 12px; margin-top:12px; font-size:10.5px; }
.sigs { display:grid; grid-template-columns:repeat(4,1fr); gap:12px; margin-top:24px; text-align:center; font-size:9.5px; }
.sigs .role { color:#444; margin-bottom:24px; }
.sigs .line { border-top:1px solid #333; padding-top:4px; font-weight:bold; font-size:10px; }
.gtee { display:flex; gap:14px; align-items:flex-start; margin:10px 0; }
.download-btn { position:fixed; top:12px; right:12px; z-index:9999; background:#e87722; color:white; border:none; padding:10px 20px; font-size:14px; font-weight:700; border-radius:8px; cursor:pointer; box-shadow:0 2px 8px rgba(0,0,0,0.3); }
.download-btn:hover { background:#d06a1b; }
/* Tela: doc-tbl transparente — seletores filho direto (>) para não vazar nas tabelas internas */
.doc-tbl { display:block; width:100%; max-width:210mm; margin:0 auto; }
.doc-tbl > thead,.doc-tbl > tfoot { display:none; }
.doc-tbl > tbody,.doc-tbl > tbody > tr,.doc-tbl > tbody > tr > td { display:block; }
@media print {
  body { -webkit-print-color-adjust:exact; print-color-adjust:exact; }
  @page { size:A4; margin:0; }
  .download-btn { display:none !important; }
  .pg-logo-inline { display:none !important; }
  .pg-footer-inline { display:none !important; }
  /* Tabela com thead/tfoot repetindo em cada página */
  .doc-tbl { display:table; width:100%; border-collapse:collapse; table-layout:fixed; }
  .doc-tbl > thead { display:table-header-group; }
  .doc-tbl > tfoot { display:table-footer-group; }
  .doc-tbl > tbody { display:table-row-group; }
  .doc-tbl > tbody > tr { display:table-row; }
  .doc-tbl > tbody > tr > td,.doc-tbl > thead > tr > th { display:table-cell; padding:0; font-weight:normal; }
  .pg { padding:8mm 22mm !important; }
}
</style>
</head>
<body>

<button class="download-btn" onclick="window.print()">⬇ Salvar como PDF</button>
<table class="doc-tbl">
<thead><tr><th>
  <div style="display:flex;justify-content:space-between;align-items:center;padding:6mm 22mm;border-bottom:2px solid #e87722;background:#fff">
    <div>${LOGO_B64 ? `<img src="data:image/png;base64,${LOGO_B64}" style="height:14mm;width:auto" alt="Vedafácil">` : '<span style="font-size:18px;font-weight:900;color:#e87722">VEDAFÁCIL</span>'}</div>
    <div style="text-align:right;line-height:1.6">
      <div style="font-size:13px;font-weight:800;color:#333">ORÇAMENTO Nº ${o.numero || 1}</div>
      <div style="font-size:10px;color:#e87722;margin-top:1px">${o.cliente || ''}</div>
    </div>
  </div>
</th></tr></thead>
<tfoot><tr><td>
  <div style="text-align:center;font-size:8.5px;color:#666;padding:5mm 22mm;border-top:1px solid #ddd;background:#fff;line-height:1.7">
    <strong style="color:#e87722;font-size:9px">Eliminamos Infiltrações Sem Quebrar!</strong><br>
    CNPJ: 23.606.470/0001-07 &nbsp;|&nbsp; Tel.: (21) 99984-1127 / (24) 2106-1015
  </div>
</td></tr></tfoot>
<tbody><tr><td>

<!-- PAGE 1 -->
<div class="pg">
${LOGO_HTML}
<div class="hbox">
  <div class="hbox-l">
    <strong style="font-size:12px;display:block;margin-bottom:3px;">${o.cliente || ''}</strong>
    ${o.endereco ? `<div>${o.endereco}${o.cidade ? ', ' + o.cidade : ''}${o.cep ? '/' + o.cep.replace('-','') : ''}</div>` : ''}
    <div>${[o.ac, o.celular].filter(Boolean).join(' - ')}</div>
  </div>
  <div class="hbox-r">
    <div style="font-size:13px;font-weight:bold;text-align:right;margin-bottom:6px;">ORÇAMENTO Nº ${o.numero || 1}</div>
    <div style="display:flex;justify-content:space-between;"><span>Data Medição:</span><strong>${fmtDate(o.dataOrcamento)}</strong></div>
    <div style="display:flex;justify-content:space-between;"><span>Validade da Proposta:</span><strong>${fmtValidade(o.validade || '30')}</strong></div>
  </div>
</div>

<p style="margin-bottom:4px;">Prezado (a),&nbsp;&nbsp;&nbsp;${o.ac || o.cliente || ''}</p>
<p style="margin-bottom:14px;">Temos o prazer de submeter a vossa consideração, nosso orçamento para a eliminação de infiltrações:</p>

${sec('1','MÉTODO DE IMPERMEABILIZAÇÃO REPARATIVA')}
<div class="bt">
  <p>O método de injeção é a tecnologia mais moderna e avançada para eliminar qualquer tipo de infiltração em trincas e rachaduras em qualquer superfície de concreto maciço. O produto é injetado no concreto, nos pontos de infiltração, com equipamentos exclusivos, que o forçam a penetrar na estrutura vedando trincas e microfissuras até atingir a origem do vazamento.</p>
  <p>O gel hidroabsorvente <em>GVF SEAL</em> possui a consistência da água quando injetado, por isso percola exatamente o mesmo caminho da infiltração, mas em sentido contrário. Enquanto se injeta, permanece em estado líquido e quando a injeção se interrompe, em um minuto e meio, se transforma num gel flexível que produzirá a vedação do ponto tratado.</p>
</div>

${sec('2','PROPRIEDADES DO GVF SEAL')}
<div style="display:flex;gap:14px;margin:8px 0;">
  <div class="bt" style="flex:1;">
    <p>O GVF Seal possui viscosidade ultra baixa que possui altíssima penetração em trincas capilares. Após a cura, o gel forma uma barreira flexível e impermeável que preenche trincas, rachaduras, buracos, nichos de concretagem, fissuras, etc.</p>
    <p>O gel formado é inalterável ao ataque de agentes químicos ou biológicos, assim como também aos sais presentes nas estruturas. Além disso, é hidroexpansivo: Em períodos de seca, diminui seu volume, mas sem afetar a membrana impermeável.</p>
    <p>Em contato com água, o produto reabsorve a mesma recuperando seu volume inicial. Este ciclo pode se repetir inúmeras vezes sem afetar as propriedades impermeáveis.</p>
  </div>
  <div style="flex-shrink:0;width:120px;display:flex;flex-direction:column;align-items:center;gap:8px;">
    ${gvfLogo ? `<img src="data:image/png;base64,${GVF_SEAL_LOGO_B64}" style="width:110px;height:auto;display:block;" alt="GVF SEAL">` : ''}
    ${gvfGalao ? `<img src="data:image/png;base64,${GVF_GALAO_B64}" style="width:110px;height:auto;display:block;border-radius:4px;" alt="GVF SEAL Galão">` : ''}
  </div>
</div>
<div class="feats">
  <div>PRODUTO BICOMPONENTE</div><div>HIDROEXPANSIVO E HIDROABSORVENTE</div>
  <div>POSSUI ATÉ 300% DE ELONGAÇÃO</div><div>PODE SER APLICADO COM FLUXO DE ÁGUA</div>
  <div>TEMPO DE REAÇÃO 1,05-1,55min</div><div>PENETRA EM FISSURAS DE ATÉ 0,05mm</div>
</div>

${sec('3','GARANTIA')}
<div class="gtee">
  <div style="width:90px;flex-shrink:0;text-align:center;">
    ${seloImg}
  </div>
  <div>
    <p class="bt" style="margin-bottom:10px;">A Vedafacil - Tecnologia em Impermeabilização oferece garantia de <strong>${garantia} anos</strong> nos pontos tratados e especificados no ítem LOCALIZAÇÃO deste orçamento. Após o término da obra os pontos tratados serão descritos em croqui e relatório PDF com imagens do antes e depois das áreas trabalhadas.</p>
    <div class="feats" style="grid-template-columns:1fr 1fr;">
      <div>CERTIFICADO DE GARANTIA</div><div>RELATÓRIO DE FOTOS ANTES E DEPOIS</div>
      <div>CROQUI DO LOCAL TRABALHADO</div>
    </div>
  </div>
</div>
<div class="obs-box"><strong>Observação:</strong> Esta proposta contempla garantia Pontual, somente nos locais orçados e tratados.</div>
${FOOTER}
</div>

<!-- PAGE 3 -->
<div class="pg pb">
${LOGO_HTML}
${sec('4','DESCRIÇÃO DA OBRA (PASSO A PASSO)')}
<div style="font-size:10.5px;line-height:1.65;">
  <p><strong><u>• INÍCIO</u></strong></p>
  <p>Mapeamento dos locais a serem tratados e confecção das imagens (ANTES).</p>
  <p>Isolamento da região a tratar utilizando faixa zebrada para área de recuo.</p>
  <p><strong><u>• PERFURAÇÃO</u></strong></p>
  <p>• Perfuração utilizando furadeira de impacto com broca no diâmetro de ½ polegada.</p>
  <p>• Colocação de bicos injetores na estrutura.</p>
  <p><strong><u>• APLICAÇÃO</u></strong></p>
  <p>• Início do processo de injeção com bomba injetora elétrica de alta pressão.</p>
  <p><strong><u>• ACABAMENTO</u></strong></p>
  <p>• Acabamento dos locais tratados, utilizando argamassa cimentícia.</p>
  <p><strong><u>• CONCLUSÃO</u></strong></p>
  <p>• Limpeza do local trabalhado e remoção de detritos gerados no decorrer do serviço.</p>
  <p>• Confecção do croqui e fotos da área trabalhada.</p>
  <p>• Conferência do serviço realizado junto à contrantante, assinatura do termo de entrega de obra.</p>
  <p style="margin-top:8px;"><u>O cliente deverá:</u></p>
  <p>✓ Disponibilizar vaga para veículo da VEDAFACIL.</p>
  <p>✓ Fornecer ponto de energia elétrica;</p>
  <p>✓ Providenciar liberação da área a ser trabalhada, acesso desobstruído e livre de circulação de pessoas.</p>
  ${(hasAndaime) ? `<p>✓ Autorizar entrada e providenciar local para armazenamento do andaime durante a execução.</p>` : ''}
</div>

${(hasAndaime) ? `
<div style="background:#fff8f0;border:1.5px solid #e87722;border-radius:6px;padding:10px 14px;margin:10px 0 4px;display:flex;align-items:flex-start;gap:10px;">
  <div style="font-size:20px;line-height:1;flex-shrink:0;">🏗️</div>
  <div>
    <div style="font-weight:bold;font-size:11px;color:#c45d12;margin-bottom:3px;">ANDAIME NECESSÁRIO</div>
    <div style="font-size:10.5px;line-height:1.6;color:#333;">
      Para a execução desta obra será necessário andaime${o.andaimeMetros > 0 ? ` de <strong>${o.andaimeMetros}m</strong> de altura` : ''}${o.andaimeLargura ? `, largura <strong>${o.andaimeLargura}</strong>` : ''}${o.andaimeRodinhas ? ', <strong>com rodinhas</strong>' : ''}${o.andaimeBases ? ', <strong>com bases ajustáveis</strong>' : ''}.
    </div>
  </div>
</div>` : ''}

${sec('5','LOCALIZAÇÃO')}
<table class="loc">
  <thead>
    <tr>
      <th class="tl" rowspan="2">LOCAL</th>
      <th rowspan="2">Trincas<br>(metros)</th>
      <th rowspan="2">J.Fria<br>(metros)</th>
      <th rowspan="2">Ralos<br>(unid.)</th>
      <th rowspan="2">Juntas de<br>Dilatação<br>(metros)</th>
      <th rowspan="2">Tratam.<br>Ferragem<br>(metros)</th>
      <th colspan="3">Cortinas (m²)</th>
    </tr>
    <tr><th>L1</th><th>L2</th><th>Total</th></tr>
  </thead>
  <tbody>${locaisRows}${emptyRows}</tbody>
  <tfoot>
    <tr>
      <td class="tl" style="background:#e87722;color:white;">TOTAIS</td>
      <td>${totais.trinca > 0 ? fmtNum(totais.trinca) : ''}</td>
      <td>${totais.juntaFria > 0 ? fmtNum(totais.juntaFria) : ''}</td>
      <td>${totais.ralo > 0 ? totais.ralo : ''}</td>
      <td>${totais.juntaDilat > 0 ? fmtNum(totais.juntaDilat) : ''}</td>
      <td>${totais.ferragem > 0 ? fmtNum(totais.ferragem) : ''}</td>
      <td></td><td></td>
      <td>${totais.cortina > 0 ? fmtNum(totais.cortina) : ''}</td>
    </tr>
  </tfoot>
</table>
${FOOTER}
</div>

<!-- PAGE 4 -->
<div class="pg pb">
${LOGO_HTML}
${sec('6','VALORES')}
<table class="val">
  <thead>
    <tr>
      <th style="width:6%">Item</th>
      <th style="text-align:left">Descrição</th>
      <th>Unid.</th>
      <th>Qtde.</th>
      <th style="text-align:right">Valor Unit.</th>
      <th style="text-align:right">Valor por Item</th>
    </tr>
  </thead>
  <tbody>${valuesRows}</tbody>
  <tfoot>
    <tr>
      <td colspan="5" style="text-align:right;font-weight:bold;background:#fff3e0;padding:6px 8px;">TOTAL DOS SERVIÇOS</td>
      <td style="text-align:right;font-weight:bold;background:#e87722;color:white;font-size:12px;padding:6px 8px;">${fmt(o.totalBruto || totalProposta1)}</td>
    </tr>
  </tfoot>
</table>

${sec('7','CONDIÇÕES DE PAGAMENTO')}
<div style="border:2px solid #e87722;border-radius:6px;padding:12px 16px;margin:10px 0 14px;display:flex;justify-content:space-between;align-items:center;background:#fff8f0;">
  <div style="font-size:12px;font-weight:bold;color:#555;">VALOR TOTAL DOS SERVIÇOS</div>
  <div style="font-size:22px;font-weight:900;color:#e87722;">${fmt(o.totalBruto || totalProposta1)}</div>
</div>

${o.mostrarProposta1 !== false ? `
<p style="text-align:center;font-weight:bold;font-size:11px;margin:6px 0 4px;">Proposta 1 : &nbsp;<em>(Pagamento à vista)</em></p>
<table class="pay">
  <tr>
    <td style="font-style:italic;width:55%"><em>Valor dos Serviços</em></td>
    <td colspan="2" style="text-align:right;font-weight:bold;font-size:12px;">${fmt(baseCalcPdf)}</td>
  </tr>
  ${desconto1Val > 0 ? `<tr>
    <td style="font-style:italic;color:#c0392b;"><em>Desconto${o.descontoTipo1 !== 'valor' && Number(o.desconto1) > 0 ? ` (${Number(o.desconto1)}%)` : ''}</em></td>
    <td colspan="2" style="text-align:right;font-weight:bold;color:#c0392b;">- ${fmt(desconto1Val)}</td>
  </tr>` : ''}
  <tr style="background:#f0fff4;">
    <td style="font-style:italic;"><em><strong>Total à Vista</strong></em></td>
    <td colspan="2" style="text-align:right;font-weight:bold;font-size:12px;color:#27ae60;">${fmt(totalProposta1)}</td>
  </tr>
  <tr><td colspan="3" style="font-style:italic;font-size:10px;">${condicaoPgto1Obs}</td></tr>
</table>
` : ''}

${o.mostrarProposta2 !== false ? `
<p style="text-align:center;font-size:10.5px;margin:10px 0 4px;font-weight:bold;">Proposta 2 : &nbsp;<em>(Pagamento Parcelado)</em></p>
<table class="pay">
  <tr>
    <td style="font-style:italic;width:45%"><em>Valor dos Serviços</em></td>
    <td colspan="2" style="text-align:right;font-weight:bold;font-size:12px;">${fmt(baseCalcPdf)}</td>
  </tr>
  ${desconto2Val > 0 ? `<tr>
    <td style="font-style:italic;color:#c0392b;"><em>Desconto${o.descontoTipo2 !== 'valor' && Number(o.desconto2) > 0 ? ` (${Number(o.desconto2)}%)` : ''}</em></td>
    <td colspan="2" style="text-align:right;font-weight:bold;color:#c0392b;">- ${fmt(desconto2Val)}</td>
  </tr>` : ''}
  <tr>
    <td style="font-style:italic;"><em><strong>Total Parcelado</strong></em></td>
    <td colspan="2" style="text-align:right;font-weight:bold;font-size:12px;">${fmt(totalProposta2)}</td>
  </tr>
  ${entradaVal2 > 0 ? `<tr>
    <td style="font-style:italic"><em>Entrada</em></td>
    <td colspan="2" style="text-align:right;font-weight:bold;">${fmt(entradaVal2)}</td>
  </tr>` : ''}
  ${parcelas > 1 ? `<tr>
    <td style="font-style:italic"><em>${parcelas}x parcela(s)</em></td>
    <td colspan="2" style="text-align:right;font-weight:bold;">${fmt(valorParcela2)}</td>
  </tr>` : ''}
  <tr><td colspan="3" style="font-style:italic;font-size:10px;font-weight:bold;">Observações:</td></tr>
  <tr><td colspan="3" style="font-style:italic;font-size:10px;background:#fff8f0;">${condicaoPgto2Obs1}</td></tr>
  ${condicaoPgto2Obs2 ? `<tr><td colspan="3" style="font-style:italic;font-size:10px;background:#fff8f0;">${condicaoPgto2Obs2}</td></tr>` : ''}
</table>
` : ''}

${obsGeral ? `<div class="obs-box" style="margin-top:10px;font-size:10px;font-style:italic;">${obsGeral}</div>` : ''}

${sec('8','INFORMAÇÕES ADICIONAIS')}
<p style="font-size:11px;margin:8px 0;">
  &rarr; O prazo de execução desta obra será de:
  <span style="display:inline-block;min-width:36px;border-bottom:1px solid #333;text-align:center;font-weight:bold;margin:0 6px;">${prazoExecucao}</span>
  dias úteis.
</p>
${(hasAndaime) ? `<p style="font-size:11px;margin:8px 0;">
  &rarr; <strong>Andaime:</strong> necessário${o.andaimeMetros > 0 ? ` — ${o.andaimeMetros}m de altura` : ''}${o.andaimeLargura ? ` — largura ${o.andaimeLargura}` : ''}${o.andaimeRodinhas ? ' — com rodinhas' : ''}${o.andaimeBases ? ' — com bases' : ''}.
</p>` : ''}
<p style="margin:12px 0;">A <strong>VEDAFACIL</strong> agradece sua atenção e fica ao seu dispor para maiores esclarecimentos.</p>
<p style="margin-bottom:18px;">Atenciosamente,</p>

<div class="sigs">
  <div><div class="role">Departamento<br>Comercial:</div><div class="line">${o.departamentoComercial || o.elaboradoPor || 'Thiago Ferraz'}</div></div>
  <div><div class="role">Responsável<br>Medição:</div><div class="line">${o.avaliadoPor || o.responsavelMedicao || ''}</div></div>
  <div><div class="role">Vistoria<br>acompanhada por:</div><div class="line">${o.acompanhadoPor || ''}</div></div>
  <div><div class="role">&nbsp;</div><div class="line">Engº Jociel Moreira da Silva</div><div style="font-size:8.5px;color:#555;">CREA: 201.513.600.3</div></div>
</div>
${FOOTER}
</div>

${photoPages}

</td></tr></tbody>
</table>
<script>function downloadPDF(){window.print();}<\/script>
</body></html>`;
}app.get('/api/orcamentos/:id/pdf', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1] || req.query.token;
  if (!token) return res.status(401).json({ error: 'Token required' });
  try { jwt.verify(token, JWT_SECRET); }
  catch { return res.status(401).json({ error: 'Invalid token' }); }

  try {
    await connectDB();
    let o;
    if (isConnected) o = await Orcamento.findById(req.params.id);
    else o = memStore.orcamentos.find(x => x._id === req.params.id);
    if (!o) return res.status(404).json({ error: 'Not found' });

    // Fetch fotos from medicao if not in orcamento
    if (o.medicaoId && (!o.locais || o.locais.every(l => !l.fotos || l.fotos.length === 0))) {
      let med;
      if (isConnected) med = await Medicao.findById(o.medicaoId);
      else med = memStore.medicoes.find(x => x._id === o.medicaoId);
      if (med && med.locais) {
        const locaisComFotos = o.locais.map((l, i) => ({
          ...l,
          fotos: (med.locais[i] && med.locais[i].fotos) ? med.locais[i].fotos : []
        }));
        o = { ...o.toObject ? o.toObject() : o, locais: locaisComFotos };
      }
    }

    // Resolve fotos R2 → base64 para o Puppeteer renderizar inline
    if (o.locais) {
      const locaisResolved = await resolveLocaisForPdf(o.locais);
      o = { ...o.toObject ? o.toObject() : o, locais: locaisResolved };
    }

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(buildOrcamentoPdfHtml(o));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Contrato PDF ─────────────────────────────────────────────────────────────

// extenso, valorExtenso → importados de ./lib/helpers.js

function buildContratoPdfHtml(c) {
  const fmt = (n) => 'R$ ' + (n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
  const fmtDate = (d) => fmtDateBR(d) || '___';
  const fmtDateShort = fmtDate;
  const fmtDateExtenso = (d) => { if (!d) return '___'; const s = String(d); const date = new Date(s.length === 10 && s.includes('-') ? s + 'T12:00:00' : s); if (isNaN(date.getTime())) return s; const meses = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro']; return `${date.getDate()} de ${meses[date.getMonth()]} de ${date.getFullYear()}`; };

  const razaoSocial = c.razaoSocial || c.cliente || '___';
  const cnpjCliente = c.cnpjCliente || '___';
  const sindico = c.sindico || c.ac || '___';
  const cpfResp = c.cpfResponsavel || '___';
  const rgResp = c.rgResponsavel || '';
  const endereco = c.endereco || '___';
  const cidade = c.cidade || '___';
  const cep = c.cep || '';
  const clienteCompl = `${razaoSocial}${cnpjCliente !== '___' ? ', inscrita' + (cnpjCliente.match(/^0{3}/) ? 'o' : 'a') + ' no CNPJ sob número ' + cnpjCliente : ''}`;
  const contratada = 'T. R. FERRAZ TECNOLOGIA EM IMPERMEABILIZACAO EIRELI ME';
  const garantia = c.garantia || 15;
  const totalBruto = c.totalBruto || c.totalLiquido || 0;
  const totalLiquido = c.totalLiquido || 0;
  const descontoValor = c.descontoTipo === 'percent' ? (totalBruto * (c.desconto || 0) / 100) : (c.desconto || 0);
  // Valor contratual: usa totalBruto se proposta 2 (parcelado), caso contrário totalLiquido (à vista)
  const valorContratual = c.propostaEscolhida === 2 ? (totalBruto || totalLiquido) : totalLiquido;
  const issPercent = c.issPercent || 3;
  const prazo = c.prazoExecucao || 3;
  const foro = c.foro || 'Rio de Janeiro';
  const dataAssinatura = c.dataAssinatura ? fmtDateExtenso(c.dataAssinatura) : '___';
  const dataInicio = c.dataInicio ? fmtDate(c.dataInicio) : '';
  const dataTermino = c.dataTermino ? fmtDate(c.dataTermino) : '';
  const nOrc = c.numero ? String(c.numero).padStart(4, '0') : '___';
  const valorExt = valorExtenso(valorContratual);

  const itensFiltrados = (c.itens || []).filter(i => i.quantidade > 0);
  const itemRows = itensFiltrados.map((i, n) => `<tr><td>${n+1}</td><td>${i.descricao}</td><td style="text-align:center">${i.unidade || '-'}</td><td style="text-align:center">${i.quantidade}</td><td style="text-align:right">${fmt(i.valorUnit)}</td><td style="text-align:right">${fmt(i.subtotal)}</td></tr>`).join('');

  const parcelasContrato = c.parcelasContrato && c.parcelasContrato.length > 0 ? c.parcelasContrato : [];
  const parcelaRows = parcelasContrato.map((p, i) => `<tr><td style="text-align:center">${p.numero || i+1}</td><td style="text-align:center">${fmtDateShort(p.data)}</td><td style="text-align:right">${fmt(p.valor || 0)}</td></tr>`).join('');

  const cronograma = c.cronograma || [];
  const cronogramaRows = cronograma.map((cr, i) => `<tr><td style="text-align:center;width:30px">${i+1}</td><td>${cr.local || '___'}</td><td style="text-align:center">${fmtDateShort(cr.dataInicio)}</td><td style="text-align:center">${fmtDateShort(cr.dataFim)}</td></tr>`).join('');

  const locais = c.locais || [];
  const locaisStr = locais.map((l, i) => `${i+1}- ${l.nome || '___'}`).join(', ');

  // ── Helper: constrói o shell HTML do contrato ─────────────────────────────
  const contratoShell = (bodyContent) => `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8">
<title>Contrato_Vedafacil_${nOrc}_${(razaoSocial||'cliente').replace(/[^a-zA-Z0-9 ]/g,'').replace(/\s+/g,'_')}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:Arial,Helvetica,sans-serif;font-size:10.5px;color:#222;line-height:1.6}
.pg{padding:6mm 22mm 8mm;max-width:210mm;margin:0 auto}
h2.clause-title{background:#e87722;color:white;padding:6px 14px;margin:16px 0 9px;font-size:11px;font-weight:bold;border-radius:2px}
.clause{margin:6px 0;text-align:justify;font-size:10.5px}
.clause p{margin-bottom:6px;text-indent:20px}
.clause p:first-child{text-indent:0}
.clause .sub{margin-left:20px;margin-top:4px}
table.pt{width:100%;border-collapse:collapse;margin:8px 0;font-size:10px}
table.pt th{background:#e87722;color:white;padding:5px 6px;text-align:center;font-weight:bold}
table.pt td{border:1px solid #aaa;padding:4px 6px}
table.pt .tl{text-align:left}
table.pt tfoot td{font-weight:bold;background:#fff3e0}
table.pay{width:100%;border-collapse:collapse;margin:8px 0;font-size:10.5px}
table.pay td{border:1px solid #aaa;padding:5px 10px}
.crono{width:100%;border-collapse:collapse;margin:8px 0;font-size:10px}
.crono th{background:#e87722;color:white;padding:5px 6px;text-align:center}
.crono td{border:1px solid #aaa;padding:4px 6px}
.sig{display:grid;grid-template-columns:1fr 1fr;gap:0 50px;margin:40px 0 24px;text-align:center;font-size:10px}
.sig .role{color:#333;font-weight:bold;font-size:10px;margin-bottom:26mm;text-transform:uppercase;letter-spacing:.4px}
.sig .line{border-top:1.5px solid #222;padding-top:6px;font-size:10px;line-height:1.5}
/* Rodapé inline — visível só na tela, escondido na impressão (tfoot da tabela cobre) */
.foot{text-align:center;font-size:8.5px;color:#666;margin-top:16px;padding-top:6px;border-top:1px solid #ccc}
.download-btn{position:fixed;top:12px;right:12px;z-index:9999;background:#e87722;color:white;border:none;padding:10px 20px;font-size:14px;font-weight:700;border-radius:8px;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.3)}
.download-btn:hover{background:#d06a1b}
/* ── Tela: tabela age como bloco simples ── */
.doc-tbl{display:block;width:100%;max-width:210mm;margin:0 auto}
.doc-tbl > thead,.doc-tbl > tfoot{display:none}
.doc-tbl > tbody,.doc-tbl > tbody > tr,.doc-tbl > tbody > tr > td{display:block}
/* ── IMPRESSÃO ─────────────────────────────────────────────────────────────
   Estratégia: UMA tabela que abraça TODO o documento (contrato + anexo).
   - thead repete o cabeçalho no topo de CADA página impressa (table-header-group)
   - tfoot repete o rodapé no fim de CADA página impressa (table-footer-group)
   - O conteúdo flui naturalmente dentro do tbody — nunca sobrepõe nada.
   - NÃO usar position:fixed: o browser não garante altura exata do elemento fixo.
   ────────────────────────────────────────────────────────────────────────── */
@media print{
  body{-webkit-print-color-adjust:exact;print-color-adjust:exact}
  @page{size:A4;margin:0}
  .download-btn{display:none!important}
  .contrato-capa{display:none!important}
  .foot{display:none!important}
  .pg-logo-inline{display:none!important}
  .pg-footer-inline{display:none!important}
  /* Tabela-documento: thead e tfoot repetem em cada página */
  .doc-tbl{display:table!important;width:100%!important;border-collapse:collapse!important;table-layout:fixed!important}
  .doc-tbl > thead{display:table-header-group!important}
  .doc-tbl > tfoot{display:table-footer-group!important}
  .doc-tbl > tbody{display:table-row-group!important}
  .doc-tbl > tbody > tr{display:table-row!important}
  .doc-tbl > thead > tr > th,
  .doc-tbl > tfoot > tr > td,
  .doc-tbl > tbody > tr > td{display:table-cell!important;padding:0!important;font-weight:normal!important;vertical-align:top!important}
  /* Cada bloco de conteúdo: padding lateral de página */
  .pg{padding:6mm 22mm 8mm!important;max-width:none!important;margin:0!important}
  /* Forçar quebra de página antes de um bloco */
  .pb{break-before:page!important;page-break-before:always!important}
  /* Planilhas/tabelas nunca cortam ao meio — ficam inteiras na página anterior ou seguinte */
  table.pt,table.pay,.crono{break-inside:avoid!important;page-break-inside:avoid!important}
  /* Rodapé fixado no fundo de cada página via tfoot — célula preenche altura disponível */
  .doc-tbl > tbody > tr > td{height:100%!important}
}
</style>
</head><body>
<button class="download-btn" onclick="window.print()">⬇ Salvar como PDF</button>
<!-- Tela: cabeçalho decorativo da capa (oculto na impressão via .contrato-capa) -->
<div class="contrato-capa pg" style="text-align:center;padding-top:8mm;padding-bottom:4mm">
  <h1 style="color:#e87722;font-size:16px;margin-bottom:4px">INSTRUMENTO PARTICULAR DE CONTRATO DE PRESTAÇÃO DE SERVIÇOS</h1>
  <div style="font-size:10px;color:#666">Correspondente ao Orçamento Nº ${nOrc}</div>
</div>
<!-- Tabela-documento: thead/tfoot repetem em CADA página impressa (Chrome + Puppeteer) -->
<table class="doc-tbl">
  <thead>
    <tr>
      <th style="-webkit-print-color-adjust:exact;print-color-adjust:exact">
        <div style="display:flex;justify-content:space-between;align-items:center;padding:4mm 22mm 4mm;border-bottom:2px solid #e87722;background:#fff">
          <div>${LOGO_B64 ? `<img src="data:image/png;base64,${LOGO_B64}" style="height:12mm;width:auto" alt="Vedafácil">` : '<span style="font-size:18px;font-weight:900;color:#e87722">VEDAFÁCIL</span>'}</div>
          <div style="text-align:right;line-height:1.5">
            <div style="font-size:11px;font-weight:700;color:#333;text-transform:uppercase;letter-spacing:.3px">Contrato de Prestação de Serviços</div>
            <div style="font-size:10px;color:#e87722;margin-top:1px">Nº ${nOrc} — ${razaoSocial}</div>
          </div>
        </div>
      </th>
    </tr>
  </thead>
  <tfoot>
    <tr>
      <td style="-webkit-print-color-adjust:exact;print-color-adjust:exact">
        <div style="text-align:center;font-size:8.5px;color:#666;padding:3mm 22mm;border-top:1px solid #ddd;background:#fff;line-height:1.7">
          <strong style="color:#e87722">Eliminamos Infiltrações Sem Quebrar!</strong><br>
          CNPJ: 23.606.470/0001-07 &nbsp;·&nbsp; Tel.: (21) 99984-1127 / (24) 2106-1015
        </div>
      </td>
    </tr>
  </tfoot>
  <tbody>
    <tr>
      <td>${bodyContent}<!-- APPEND_HERE --></td>
    </tr>
  </tbody>
</table>
</body></html>`;

  // ── Se há texto personalizado, usa ele em vez do template ─────────────────
  if (c.textoPersonalizado) {
    const txt = c.textoPersonalizado.trim();
    // Garante que o conteúdo esteja envolvido em .pg para ter o padding correto na impressão.
    // Contratos antigos salvos como <div class="pg-content"> ou sem wrapper ganham o wrapper certo.
    const bodyTxt = (txt.startsWith('<div class="pg">') || txt.startsWith('<div class="pg '))
      ? txt
      : `<div class="pg">${txt}</div>`;
    return contratoShell(bodyTxt);
  }

  return contratoShell(`<div class="pg">
<p style="text-align:justify;font-size:10.5px;margin-bottom:10px">Contrato de Prestação de serviços para fornecimento das tarefas de hidrojateamento, calafetação e selado de infiltrações utilizando o sistema de injeção que entre si celebram por um lado:</p>

<p style="font-size:10.5px;text-align:justify;margin-bottom:8px"><strong>CONTRATADA:</strong> ${contratada} sita à Rua Professora Margarida Fialho Thompson Leite, 670, Residencial Cristo Redentor na cidade de Barra Mansa estado RJ, CEP 27323-755, inscrita no CNPJ sob número 23.606.470/0001-07, representado por Thiago Ramos Ferraz, inscrito no CPF sob n° 104.589.167-30 doravante denominada <strong style="color:#e87722">CONTRATADA</strong>.</p>

<p style="font-size:10.5px;text-align:justify;margin-bottom:8px">E do outro lado <strong>${razaoSocial}</strong>${cnpjCliente ? ', inscrit' + (cnpjCliente.match(/^0{3}/) ? 'o' : 'a') + ' no CNPJ sob número ' + cnpjCliente : ''} sito à ${endereco}, na cidade de ${cidade}${cep ? ', CEP ' + cep : ''}${sindico ? ', representado por ' + sindico : ''}${cpfResp && cpfResp !== '___' ? ', legalmente instituído em autos e com poderes de firma' : ''}${cpfResp && cpfResp !== '___' ? ', e inscrito no CPF sob n° ' + cpfResp : ''}${rgResp ? ', RG: ' + rgResp : ''}, doravante denominada <strong style="color:#e87722">CONTRATANTE</strong>.</p>

<p style="font-size:10.5px;text-align:justify">O serviço será executado na garagem do(a) ${razaoSocial} sito à ${endereco}${cidade ? ', ' + cidade : ''}, estado RJ, conforme orçamento anexo.</p>

<h2 class="clause-title">Cláusula 1ª - Objeto</h2>
<div class="clause">
<p>1.1 - Por este Instrumento Particular e na melhor forma de direito, a CONTRATANTE contrata com a CONTRATADA, a prestação dos serviços de fornecimento de material e mão de obra para hidrojateamento, calafetação e selado de infiltrações exclusivamente em estruturas de concreto maciço, utilizando o método de injeção.</p>
</div>

<h2 class="clause-title">Cláusula 2ª - Documentos Integrantes e Forma de Execução</h2>
<div class="clause">
<p>2.1 – Os serviços serão executados pela CONTRATADA em estrita conformidade com as Condições indicadas no Orçamento anexo, que passa a formar parte deste contrato.</p>
<p>2.2 – Passarão a integrar este Instrumento Particular, desde que assinadas pelas partes, ou por seus representantes autorizados, as atas de reuniões, novos orçamentos para eventuais extensões dos serviços e outros documentos posteriores à assinatura deste Instrumento.</p>
</div>

<h2 class="clause-title">Cláusula 3ª - Escopo dos Serviços</h2>
<div class="clause">
<p>3.1 - A CONTRATADA deverá realizar os serviços, com aplicação do produto, ora pactuados, observado as disposições contidas no orçamento anexo que dá origem a este Instrumento Particular e que passa a formar parte integrante do mesmo.</p>
<p>3.2 - Os serviços serão realizados nas regiões delimitadas no ponto 5.- denominado Localização, no orçamento anexo.</p>
</div>

<h2 class="clause-title">Cláusula 4ª - Valor dos Serviços</h2>
<div class="clause">
<p>4.1- A CONTRATANTE aceita pagar pelo serviço contratado um valor total de: <strong>${fmt(valorContratual)}</strong></p>
<p>(${valorExt})</p>
${descontoValor > 0 ? `<p>4.2 - Do valor total do contrato, ${issPercent}% refere-se ao pagamento do ISSQN (Imposto sobre serviço de qualquer natureza) que será de responsabilidade da CONTRATANTE e deverá ser recolhido no município da prestação do serviço. Outrossim, a CONTRATADA emitirá fatura com o valor líquido, com o desconto do valor do ISS.</p>` : ''}
<p>4.${descontoValor > 0 ? '3' : '2'} - Sem prejuízo, em conformidade com o disposto pelo regime do SIMPLES, não correspondem as retenções de 1,5% (um e meio) referente ao Imposto de Renda sobre o valor total da fatura de serviço nem a retenção de 4,65% (quatro e sessenta e cinco) referente ao Pis, Cofins e Csll sobre o valor total da fatura.</p>
<p>4.${descontoValor > 0 ? '4' : '3'} Outrossim, e devido à qualificação do serviço como Hidrojateamento, Calafetação e Selado de Infiltrações, o mesmo encontra-se isento do desconto de 11% de INSS. Conforme Art. 130, caput, 1ª da INSTRUÇÃO NORMATIVA RFB nº 2.110/2022.</p>
${descontoValor > 0 ? `<p>4.5 - O valor contratado objeto deste Instrumento Particular abrange exclusivamente os serviços descritos nos pontos 3.1 - e 3.2 -, qualquer serviço extra não contemplado no orçamento anexo e integrante deste contrato formará parte de um novo orçamento, que após aprovado pela CONTRATANTE passará a formar parte, em caráter de aditivo, deste Instrumento particular.</p>` : ''}
</div>

<h2 class="clause-title">Cláusula 5ª - Condições de Pagamento</h2>
<div class="clause">
<p>5.1 - A CONTRATADA enviará boletos bancários e notas fiscais, de serviço e produto, correspondentes até no máximo 2 (dois) dias úteis antes da data do vencimento, conforme o seguinte plano de pagamento:</p>

${parcelaRows ? `<table class="pay">
<tr><td style="width:50%;font-style:italic"><em>Nº de Parcela</em></td><td style="width:25%;text-align:center"><em>Data</em></td><td style="width:25%;text-align:right"><em>Valor</em></td></tr>
${parcelaRows}
<tr><td style="font-style:italic;font-weight:bold"><strong>TOTAL</strong></td><td></td><td style="text-align:right;font-weight:bold;font-size:12px"><strong>${fmt(valorContratual)}</strong></td></tr>
</table>` : `<table class="pay">
<tr><td style="font-style:italic;width:55%"><em>Total Orçamento</em></td><td style="text-align:right;font-weight:bold;font-size:12px">${fmt(valorContratual)}</td></tr>
</table>`}

<p>5.2 - A CONTRATANTE compromete-se neste ato ao pagamento dos boletos bancários, nas datas estipuladas no ponto 5.1, incidindo multa de 2% (dois por cento) sobre o valor da parcela e juros de mora de 1% (um por cento) ao mês, no caso de inadimplência.</p>
<p>5.3 - No caso de Inadimplência, para recebimento dos créditos devidos, a CONTRATADA utilizará de corpo jurídico terceirizado, no qual a CONTRATANTE arcará com honorários advocatícios e despesas judiciais.</p>
<p>5.4 - O preço ora contratado reflete a total compensação da CONTRATADA pela execução dos serviços objeto do presente Instrumento, incluindo todos os custos de mão de obra direta, materiais, máquinas e equipamentos, ferramentas, combustíveis, equipamentos de segurança e quaisquer outros, bem como todas as despesas relativas às obrigações e encargos trabalhistas, fiscais e previdenciários.</p>
</div>

<h2 class="clause-title">Cláusula 6ª - Vigência, Prazos e Cronograma de Obras</h2>
<div class="clause">
<p>6.1 - Este Contrato tem início a partir de sua assinatura considerando um prazo de execução de <strong>${prazo} dia(s) útil(eis)</strong>${dataInicio && dataTermino ? ', a partir de ' + dataInicio + ' até ' + dataTermino : ''}.</p>
</div>

${cronograma.length > 0 ? `
<p style="font-weight:bold;margin:8px 0 4px">LOCAIS A SEREM LIBERADOS CONFORME ANDAMENTO DA OBRA</p>
<table class="crono">
<thead><tr><th style="width:30px">Nº</th><th>Local</th><th>Data Inicial</th><th>Data Final</th></tr></thead>
<tbody>${cronogramaRows}</tbody>
</table>` : ''}

<h2 class="clause-title">Cláusula 7ª - Obrigações e Responsabilidades da CONTRATADA</h2>
<div class="clause">
<p>7.1 - Será responsabilidade da CONTRATADA a remoção de detritos gerados no decorrer do serviço, caso seja necessário.</p>
<p>7.2 - Outrossim, a CONTRATADA não se responsabiliza por despesas adicionais geradas para a coleta de gesso, calhas e materiais existentes no local, caso os mesmos sejam retirados para execução do trabalho.</p>
<p>7.3 - A CONTRATADA realizará acabamento utilizando argamassa para reparo (tamponamento) aos furos realizados durante execução da obra, entretando, não inclui pintura do local.</p>
<p>7.4 - Mobilizar um número de ferramentas e equipamentos suficientes e adequados para o cumprimento das metas estabelecidas, em bom estado de funcionamento e manutenção, comprometendo-se a substituir, qualquer equipamento que seja necessário, a fim de garantir a continuidade dos serviços, efetuando, inclusive, a manutenção preventiva e corretiva dos mesmos.</p>
<p>7.5 - Efetuar por sua conta e responsabilidade todos os pagamentos de tributos federais, estaduais e municipais de qualquer natureza, incidentes sobre o contrato mantendo à CONTRATANTE isenta de responsabilidade sobre quaisquer falhas ou atrasos nos recolhimentos dos mesmos.</p>
<p>7.6 - A CONTRATADA declara, para os devidos fins e efeitos de direito, estar devidamente credenciada e regularizada perante os órgãos públicos competentes, possuindo todos os certificados, licenças e quaisquer outros documentos necessários para a regular prestação dos serviços objeto do presente contrato. A CONTRATADA também declara estar apta ao cumprimento das obrigações ora avençadas, as quais serão prestadas com total observância à legislação vigente, nos âmbitos federal, estadual e municipal, sob pena de responsabilidade civil e criminal, sempre em caráter exclusivo, da CONTRATADA.</p>
<p>7.7 - A CONTRATADA emitirá a competente ART (Anotação de Responsabilidade Técnica) referente aos serviços prestados.</p>
<p>7.8 - Fornecer e dirigir sob sua responsabilidade toda mão de obra especializada, adequada e capacitada de que necessitar, bem como responsabilizar-se pelo pagamento de todas as despesas relativas ao seu pessoal, inclusive salários, subvenção de alimentação, transporte e serviços médicos, além daquelas decorrentes de obrigações fiscais, previdenciárias, trabalhistas e securitárias referentes à execução dos serviços.</p>
<p>7.9 - Fornecer aos seus empregados uniformes, e todos os demais equipamentos de proteção individuais necessários para a realização dos serviços contratados, assim como tornar seu uso obrigatório pelos mesmos.</p>
<p>7.10 - Fornecer todo o treinamento necessário e equipamentos de segurança conforme previsões da NR-35 (trabalho em altura), NR-07 (PCMSO – Programa de Controle Médico de Saúde Ocupacional), NR-09 (PPRA – Programa de Prevenção de Riscos Ambientais) aos seus funcionários, os quais devem estar devidamente registrados e segurados contra acidentes de trabalho, de acordo com os preceitos legais vigentes.</p>
<p>7.11 - Responsabilizar-se integralmente por qualquer dano ou acidente sofrido pelos profissionais contratados ou por terceiros em decorrência de suas atividades, inclusive em caso de óbito, respondendo por si, seus funcionários, subcontratados e fornecedores; e pelos serviços realizados.</p>
<p>7.12 - A CONTRATADA somente executará a impermeabilização para eliminação de infiltrações em áreas de concreto maciço. Caso constate-se outro tipo de construção dentro da área orçada, a CONTRATADA estará isenta de qualquer reparo como garantia.</p>
</div>

<h2 class="clause-title">Cláusula 8ª - Obrigações e Responsabilidades da CONTRATANTE</h2>
<div class="clause">
<p>8.1 - Será responsabilidade da CONTRATANTE permitir a entrada dos funcionários no local da obra no horário estipulado das 08:30 as 17:30, durante período de obra e assistência técnica.</p>
<p>8.2 - Será de responsabilidade da CONTRATANTE providenciar a remoção de qualquer obstáculo, seja ele em chão, parede ou teto, que impossibilite a execução do serviço, bem como, a retirada de forro existente no local do serviço a ser executado, antes do início da obra, caso exista.</p>
<p>8.3 - Será de responsabilidade da CONTRATANTE a realização da pintura ou colocação de forro no local trabalhado e especificado no ponto 6. do orçamento em anexo, visto que a CONTRATADA não realiza tais serviço e os mesmos não estão inclusos no escopo de trabalho.</p>
<p>8.4 - Outrossim, a CONTRATADA orienta a CONTRATANTE a aguardar período de aproximadamente 30 (trinta) dias para avaliação do serviço antes de realizar a pintura ou colocação de forro ou gesso.</p>
<p>8.5 - Obriga-se a CONTRATANTE a fornecer uma vaga para o veículo da CONTRATADA dentro do local da obra, podendo ser esta vaga alguma das interditadas durante a execução do serviço.</p>
<p>8.6 - Será responsabilidade da CONTRATANTE fornecer água e energia elétrica para o correto desempenho dos serviços.</p>
<p>8.7 - Caso seja necessário locação de máquinas ou equipamentos (andaime, plataformas, máquinas, etc.) para execução dos serviços, a CONTRATANTE deverá autorizar liberação para entrada dos equipamentos e providenciar local para seu armazenamento.</p>
<p>8.8 - Caso haja na execução da obra, áreas de caixão perdido, enchimentos com entulhos, estruturas de alvenaria de tijolos cerâmicos ou blocos de concreto, canos e conduítes embutidos na laje, bem como problemas já existentes nas dependências da CONTRATANTE, incluindo canos com vazamentos, ralos entupidos, esgotos pluviais ou sanitários com vazamentos, defeitos nas instalações elétricas, conduítes, quadros de força, também produtos aplicados e/ou utilizados anteriormente que impeçam a realização do serviço, isentará a CONTRATADA de qualquer responsabilidade por danos decorrentes dessas condições.</p>
<p>8.9 - É de responsabilidade da CONTRATANTE a troca ou reposição de piso de áreas superiores como cobertura, terraço e de piscina caso ocorra estufamento/desplacamento. As despesas para troca ou reposição de piso, bem como, esvaziamento e reabastecimento de água da piscina ocorrerá por conta da CONTRATANTE.</p>
<p>8.10 - Será exclusiva responsabilidade da CONTRATANTE informar à CONTRATADA sobre os novos pontos de infiltração que possam aparecer posteriores à data da vistoria e antes da data de início do serviço.</p>
<p>8.11 - A definição das áreas a serem trabalhadas, será feita pelo responsável técnico da CONTRATADA, o qual informará diariamente a CONTRATANTE os locais a serem liberados para o dia subsequente. Outrossim, obriga-se a CONTRATANTE manter as áreas indicadas no cronograma de obras da Cláusula 6ª, desimpedidas e livres nas datas estipuladas.</p>
<p>8.12 - Não será permitido à CONTRATANTE, a qualquer pretexto, filmar e/ou tirar fotos, durante a prestação de serviço dos profissionais envolvidos, bem como, dos equipamentos e procedimentos utilizados na execução da prestação de serviço com o fito de se respeitar os direitos autorais e de imagem de todos os envolvidos, seja de suas marcas, direitos autorais, programas de computador, procedimentos técnicos, bem como demais direitos de propriedade intelectual.</p>
</div>

<h2 class="clause-title">Cláusula 9ª - Garantia</h2>
<div class="clause">
<p>9.1 - A CONTRATADA oferece garantia limitada por <strong>${garantia} (${garantia === 1 ? 'um' : extenso(garantia)}) ${garantia === 1 ? 'ano' : 'anos'}</strong>, nos locais tratados e especificados no ponto 5 do orçamento anexo e integrante deste contrato.</p>
<p>9.2 - A CONTRATANTE declara estar ciente de que a garantia concedida contempla apenas o local mapeado, conforme orçamento e croqui anexos a este contrato (croqui será enviado após a finalização da obra). Infiltrações próximas ao local trabalhado serão tratadas como ponto novo, o qual a CONTRATANTE deverá solicitar a CONTRATADA novo orçamento.</p>
<p>9.2.1 - Caso seja identificado infiltrações na área em período de garantia, a CONTRATADA deverá prestar o atendimento necessário para a regularização do problema. Outrossim obriga-se a CONTRATANTE comunicar à CONTRATADA sobre a existência de possível assistência técnica registrado por meio de nossos canais de comunicação como telefone, email, whatsapp. Caso isso não ocorra, a CONTRATANTE isenta a CONTRATADA de quaisquer responsabilidades de danos causados decorrentes do problema.</p>
<p>9.3 - A CONTRATADA informará a data do agendamento de execução de garantia no prazo de até 5 (cinco) dias úteis, e a mesma se dará mediante disponibilidade de sua programação e agenda, num prazo de até 60 (sessenta) dias para execução.</p>
<p>9.4 - A CONTRATADA somente executará trabalhos de impermeabilização em áreas de concreto maciço, dentro da área contratada. Caso constate-se, durante a execução, outro tipo de estrutura que seja diferente de concreto maciço, a CONTRATADA ficará isenta de prosseguir qualquer reparo bem como fornecer garantia.</p>
<p>9.5 - Em ocorrências de assistência técnica, será de responsabilidade da CONTRATANTE, sem ônus a CONTRATADA, providenciar a retirada e recolocação de forro e realização da pintura, caso seja necessário.</p>
<p>9.6 - Caso sejam realizadas obras posteriores ao tratamento, sem anuência da CONTRATADA e estas obras afetem as condições da estrutura, nas regiões especificadas na Cláusula 9ª, a garantia perderá sua validade.</p>
<p>9.7 - Caso as condições descritas na cláusula 5ª, em especial quanto aos pagamentos convencionados, não sejam devidamente cumpridas e enquanto perdurar o inadimplemento, ficará imediatamente SUSPENSA esta garantia contratual, retornando a vigorar quando do fiel cumprimento da obrigação.</p>
</div>

<h2 class="clause-title">Cláusula 10ª - Da Rescisão</h2>
<div class="clause">
<p>10.1 - Além das hipóteses legais, o CONTRATANTE poderá rescindir o contrato, sem que caiba à CONTRATADA qualquer direito a indenização, nas seguintes hipóteses:</p>
<p class="sub">10.1.1 - Se a CONTRATADA entrar em falência, liquidação judicial ou extrajudicial ou concordata preventiva, requerida, homologada ou decretada.</p>
<p class="sub">10.1.2 - A utilização de material diferente daquele especificado.</p>
<p class="sub">10.1.3 - Se a CONTRATADA notoriamente deixar de apresentar condições técnicas, financeiras ou administrativas que possam comprometer ou inviabilizar a execução dos Serviços;</p>
<p class="sub">10.1.4 - Se a CONTRATADA depois de notificada pelo CONTRATANTE para cumprir qualquer determinação pactuada no presente instrumento, quedar-se inerte.</p>
<p>10.2 - Caso, durante a execução, seja constatada a existência de alvenaria de tijolo cerâmico, bloco de cimento ou qualquer outro tipo de estrutura diferente de concreto maciço nas áreas objeto do orçamento, a CONTRATADA ficará isenta de fornecer garantia sobre os serviços realizados nesses trechos, uma vez que tais condições inviabilizam a plena eficácia do método descrito na Cláusula 1ª deste contrato.</p>
<p>10.3 - Na ocorrência de rescisão contratual, a CONTRATADA apresentará relatório completo dos Serviços executados até a data da rescisão e entregará à CONTRATANTE todos os documentos de propriedade desta:</p>
<p class="sub">a) se os valores pagos pela CONTRATANTE à CONTRATADA constatarem-se superiores ao devido pelo efetivamente realizado, deverão ser restituídos pela CONTRATADA em favor da CONTRATANTE.</p>
<p class="sub">b) se os valores pagos pela CONTRATANTE à CONTRATADA constatarem-se inferiores ao devido pelo efetivamente realizado, deverão ter o pagamento complementado pela CONTRATANTE em favor da CONTRATADA, até que se atinja a justa razoabilidade pelos serviços executados.</p>
</div>

<h2 class="clause-title">Cláusula 11ª - Disposições Gerais</h2>
<div class="clause">
<p>11.1 - Eventualmente, durante o andamento da obra e sem comprometer os prazos definidos na Cláusula 6ª, poderão ocorrer paradas técnicas, sejam estas para manutenção de equipamentos ou para observar a reação dos produtos na estrutura.</p>
<p>11.2 - A CONTRATANTE declara expressamente, neste ato, estar ciente de todos os serviços a serem realizados e das regiões onde será aplicado o tratamento.</p>
<p>11.3 - Os direitos e obrigações do CONTRATADO previstos neste Contrato não poderão ser cedidos, delegados ou de qualquer forma transferidos, total ou parcialmente sem o consentimento prévio e por escrito do CONTRATANTE.</p>
<p>11.4 - A tolerância, por qualquer das partes, quanto ao não cumprimento das condições do presente contrato constituirá mera liberalidade, não significando novação ou alteração das condições ora pactuadas.</p>
<p>11.5 - Este contrato somente poderá ser alterado mediante aditivo formal celebrado entre as partes.</p>
<p>11.6 - Fica desde já eleito o foro da cidade do ${foro}, estado do Rio de Janeiro, para dirimir conflitos, ou dúvidas de interpretação oriundas deste contrato, em detrimento a qualquer outro, por mais privilegiado que o seja.</p>
<p>11.7 - Por estarem justos e contratados, assinam o presente em duas vias de igual teor e forma, para os efeitos legais e de direito.</p>
</div>

<p style="text-align:center;margin-top:30px;font-size:10.5px">${cidade || foro}, ${dataAssinatura}</p>

<div class="sig">
  <div>
    <div class="role">CONTRATANTE</div>
    <div class="line">
      ${razaoSocial}<br>
      ${sindico}${cpfResp && cpfResp !== '___' ? '<br><span style="font-size:9.5px;color:#555">CPF: ' + cpfResp + '</span>' : ''}
    </div>
  </div>
  <div>
    <div class="role">CONTRATADA</div>
    <div class="line">
      VEDAFACIL TECNOLOGIA EM IMPERMEABILIZAÇÃO<br>
      Thiago Ramos Ferraz<br>
      <span style="font-size:9.5px;color:#555">CPF: 104.589.167-30</span>
    </div>
  </div>
</div>

<div class="sig" style="margin-top:14px;break-before:avoid;page-break-before:avoid;">
  <div>
    <div class="role" style="margin-bottom:10mm;">Testemunha 1</div>
    <div class="line">&nbsp;</div>
    <div style="font-size:9px;color:#555;margin-top:6px;text-align:left;">Nome: ___________________________________</div>
    <div style="font-size:9px;color:#555;margin-top:4px;text-align:left;">CPF: ____________________________________</div>
  </div>
  <div>
    <div class="role" style="margin-bottom:10mm;">Testemunha 2</div>
    <div class="line">&nbsp;</div>
    <div style="font-size:9px;color:#555;margin-top:6px;text-align:left;">Nome: ___________________________________</div>
    <div style="font-size:9px;color:#555;margin-top:4px;text-align:left;">CPF: ____________________________________</div>
  </div>
</div>

<div class="foot"><strong style="color:#e87722">Eliminamos Infiltrações Sem Quebrar!</strong><br>CNPJ: 23.606.470/0001-07 · Tel.: (21) 99984-1127 / (24) 2106-1015</div>
</div>`);
}

// Retorna o HTML editável do corpo do contrato (para o editor rich text)
// ── Resetar texto personalizado do contrato pro template dinâmico ─────────────
// Quando o usuário usa "Editar PDF", o HTML é gravado em textoPersonalizado e
// IGNORA os campos do form (razaoSocial, cnpj, endereço, etc). Esse endpoint
// apaga o texto personalizado para voltar a renderizar dinamicamente.
app.delete('/api/contratos/:id/texto-personalizado', auth, async (req, res) => {
  try {
    await connectDB();
    if (!isConnected) return res.status(500).json({ error: 'Sem conexão com banco' });
    const c = await Contrato.findOneAndUpdate(
      { _id: req.params.id },
      { $unset: { textoPersonalizado: '', textoPersonalizadoAt: '' }, $set: { updatedAt: Date.now() } },
      { new: true }
    );
    if (!c) return res.status(404).json({ error: 'Contrato não encontrado' });
    await audit(req, 'reset-texto-personalizado', 'contrato', req.params.id, { cliente: c.cliente, numero: c.numero });
    res.json({ ok: true, numero: c.numero });
  } catch (err) {
    log('error', 'reset textoPersonalizado:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Indica se o contrato tem texto personalizado (não retorna o HTML — só o flag).
// Usado pelo ContratoFormPage para mostrar o banner de aviso sem trazer 21KB de HTML toda vez.
app.get('/api/contratos/:id/tem-texto-personalizado', auth, async (req, res) => {
  try {
    await connectDB();
    if (!isConnected) return res.json({ tem: false });
    const c = await Contrato.findOne({ _id: req.params.id })
      .select('textoPersonalizado textoPersonalizadoAt')
      .lean();
    if (!c) return res.status(404).json({ error: 'Contrato não encontrado' });
    res.json({
      tem: !!c.textoPersonalizado && c.textoPersonalizado.length > 0,
      editadoEm: c.textoPersonalizadoAt || null,
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/contratos/:id/texto-html', auth, async (req, res) => {
  try {
    await connectDB();
    let c;
    if (isConnected) c = await Contrato.findOne({ _id: req.params.id }).lean();
    else c = memStore.contratos.find(x => x._id === req.params.id);
    if (!c) return res.status(404).json({ error: 'Not found' });
    if (c.textoPersonalizado) {
      return res.json({ html: c.textoPersonalizado, customizado: true, editadoEm: c.textoPersonalizadoAt });
    }
    // Gera o HTML padrão e extrai só o body content
    const fullHtml = buildContratoPdfHtml(c);
    // Extrai o conteúdo dentro de <div class="pg">...</div> (wrapper principal do corpo, após a capa)
    const OPEN_TAG = '<div class="pg">';
    const pgStart = fullHtml.indexOf(OPEN_TAG);
    const outerClose = fullHtml.lastIndexOf('</div>');
    let bodyHtml;
    if (pgStart !== -1 && outerClose > pgStart) {
      const innerContent = fullHtml.substring(pgStart + OPEN_TAG.length, outerClose);
      // Usa class="pg" para que o editor salve com wrapper correto —
      // o contratoShell já aplica os estilos .pg na impressão
      bodyHtml = `<div class="pg">${innerContent}</div>`;
    } else {
      bodyHtml = '<p>Conteúdo não disponível</p>';
    }
    return res.json({ html: bodyHtml, customizado: false });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Extrai apenas o conteúdo interno do tbody (sem o wrapper doc-tbl, thead e tfoot)
// para injeção dentro da tabela-documento do contrato.
function extractHtmlForAppend(fullHtml) {
  // Remove botão de download e scripts
  const cleaned = fullHtml
    .replace(/<button[^>]*class="download-btn"[^>]*>[\s\S]*?<\/button>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '');
  // Coleta estilos do <head>
  const headMatch = cleaned.match(/<head[^>]*>([\s\S]*?)<\/head>/i);
  const extraStyles = [];
  if (headMatch) {
    const re = /<style[^>]*>([\s\S]*?)<\/style>/gi;
    let m;
    while ((m = re.exec(headMatch[1])) !== null) extraStyles.push(m[1]);
  }
  // Extrai SOMENTE o conteúdo interno do tbody > tr > td do doc-tbl
  // (os <div class="pg"> com o conteúdo do orçamento, sem thead/tfoot)
  // IMPORTANTE: usar regex GREEDY ([\s\S]*) — não non-greedy (*?) — para capturar até o
  // ÚLTIMO </td></tr></tbody>, que é o fechamento do tbody externo do doc-tbl.
  // Com non-greedy, o regex parava no primeiro </tbody> de tabela interna (locaisRows,
  // valuesRows), cortando o conteúdo antes das photoPages (relatório fotográfico).
  const tbodyMatch = cleaned.match(/<tbody[^>]*>\s*<tr[^>]*>\s*<td[^>]*>([\s\S]*)<\/td>\s*<\/tr>\s*<\/tbody>/i);
  if (tbodyMatch) {
    return { extraStyles, body: tbodyMatch[1].trim() };
  }
  // Fallback: extrai body inteiro se não houver doc-tbl
  const bodyMatch = cleaned.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  return { extraStyles, body: bodyMatch ? bodyMatch[1].trim() : '' };
}

app.get('/api/contratos/:id/pdf', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1] || req.query.token;
  if (token) {
    try { jwt.verify(token, JWT_SECRET); }
    catch { return res.status(401).json({ error: 'Invalid token' }); }
  }

  try {
    await connectDB();
    let c, orc = null;
    if (isConnected) {
      c = await Contrato.findOne({ _id: req.params.id }).lean();
      if (c?.orcamentoId) orc = await Orcamento.findById(c.orcamentoId).lean();
    } else {
      c = memStore.contratos.find(x => x._id === req.params.id);
      if (c?.orcamentoId) orc = memStore.orcamentos.find(x => x._id === c.orcamentoId);
    }
    if (!c) return res.status(404).json({ error: 'Not found' });

    let html = buildContratoPdfHtml(c);

    // Anexa orçamento ao final do contrato (se existir)
    if (orc) {
      const orcObj = orc.toObject ? orc.toObject() : { ...orc };
      // Busca fotos da medição se necessário
      if (orcObj.medicaoId && (!orcObj.locais || orcObj.locais.every(l => !l.fotos?.length))) {
        let med = isConnected
          ? await Medicao.findById(orcObj.medicaoId)
          : memStore.medicoes?.find(x => x._id === orcObj.medicaoId);
        if (med?.locais) {
          orcObj.locais = orcObj.locais.map((l, i) => ({ ...l, fotos: med.locais[i]?.fotos || [] }));
        }
      }
      // Resolve chaves R2 → base64 para o Puppeteer renderizar as fotos inline
      if (orcObj.locais?.length) {
        orcObj.locais = await resolveLocaisForPdf(orcObj.locais);
      }
      const orcHtml = buildOrcamentoPdfHtml(orcObj);
      const { extraStyles, body } = extractHtmlForAppend(orcHtml);

      // Injeta estilos extras antes de </style>, filtrando regras que conflitam com o contrato
      if (extraStyles.length) {
        const filtrarCssConflito = (css) => {
          // Remove @page rules
          let r = css.replace(/@page\s*\{[^}]*\}/g, '');
          // Remove @media print blocks (com tratamento de chaves aninhadas)
          let out = ''; let i = 0;
          while (i < r.length) {
            const rest = r.slice(i);
            const mp = rest.match(/^@media\s+print\s*\{/);
            if (mp) {
              let depth = 0, j = i;
              while (j < r.length) {
                if (r[j] === '{') depth++;
                else if (r[j] === '}') { depth--; if (depth === 0) { j++; break; } }
                j++;
              }
              i = j;
            } else { out += r[i]; i++; }
          }
          // Remove regras doc-tbl > tfoot (causa blank pages quando re-injetada)
          out = out.replace(/\.doc-tbl\s*>\s*tfoot[^{]*\{[^}]*\}/g, '');
          return out;
        };
        const safeStyles = extraStyles.map(filtrarCssConflito);
        html = html.replace('</style>', `/* ── Estilos do orçamento anexo ── */\n${safeStyles.join('\n')}\n</style>`);
      }
      const nOrcNum = orc.numero ? String(orc.numero).padStart(4, '0') : '';
      // Separador + conteúdo do orçamento são injetados DENTRO do tbody da tabela-documento
      // do contrato, via marcador <!-- APPEND_HERE -->. Isso garante que thead/tfoot do
      // contrato se repitam em TODAS as páginas — incluindo as do anexo.
      const separador = `
<div class="pb" style="padding:6mm 22mm 2mm">
  <p style="font-size:8px;color:#aaa;text-transform:uppercase;letter-spacing:0.8px;margin:0 0 4mm;border-bottom:1px solid #eee;padding-bottom:2mm">Anexo Contratual — Orçamento Nº ${nOrcNum}</p>
</div>`;
      html = html.replace('<!-- APPEND_HERE -->', `${separador}\n${body}`);
    }

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(html);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Certificado de Garantia PDF ───────────────────────────────────────────────

function buildGarantiaPdfHtml(c, osPontos = []) {
  // ── helpers ────────────────────────────────────────────────────────────────
  const fmtDate = (d) => {
    if (!d) return '';
    if (typeof d === 'number' && d < 1000000) return '';
    const r = fmtDateBR(d);
    return r && parseInt(r.slice(-4), 10) >= 2000 ? r : '';
  };

  const formatCnpj = (v) => {
    if (!v) return '';
    // converte notação científica para string de dígitos
    let s = String(v);
    if (s.toUpperCase().includes('E')) {
      const n = Number(v);
      s = isFinite(n) ? Math.round(n).toString() : '';
    }
    const d = s.replace(/\D/g, '').padStart(14, '0').slice(-14);
    return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
  };

  const anosRaw = Number(c.garantia);
  const anos = (!isNaN(anosRaw) && anosRaw > 0) ? anosRaw : 15;
  const anosExt = extenso(anos);
  const nContrato = c.numero ? String(c.numero).padStart(4, '0') : '___';
  const cliente = c.razaoSocial || c.cliente || '___';
  const endereco = [c.endereco, c.bairro].filter(Boolean).join(' - ');
  const cidadeUF = [c.cidade, c.estado || c.uf].filter(Boolean).join('   ');
  const cnpjCliente = formatCnpj(c.cnpjCliente);
  const foro = c.foro || 'Rio de Janeiro';
  const dataEmissao = fmtDate(c.dataTermino) || fmtDate(c.dataAssinatura) || new Date().toLocaleDateString('pt-BR', { day:'2-digit', month:'2-digit', year:'numeric' });

  // locais tratados
  const locais = c.locais || [];
  const descLocais = locais.map(l => {
    const partes = [];
    if (l.trinca > 0) partes.push(`${l.trinca}m de trinca`);
    if (l.juntaFria > 0) partes.push(`${l.juntaFria}m de junta fria`);
    if (l.ralo > 0) partes.push(`${l.ralo} ralo(s)`);
    if (l.juntaDilat > 0) partes.push(`${l.juntaDilat}m de junta de dilatação`);
    if (l.ferragem > 0) partes.push(`${l.ferragem}m de ferragem`);
    if (l.cortina > 0) partes.push(`${l.cortina}m² de cortina`);
    return partes.length ? `${l.nome || 'Local'}: ${partes.join(', ')}` : null;
  }).filter(Boolean).join('; ');

  const logoImg = LOGO_B64
    ? `<img src="data:image/png;base64,${LOGO_B64}" style="height:52px;width:auto;display:block;" alt="Vedafácil">`
    : `<div style="font-size:28px;font-weight:900;color:#e87722;">VEDAFÁCIL</div>`;

  const assinaturaImg = ASSINATURA_B64
    ? `<img src="data:image/png;base64,${ASSINATURA_B64}" style="max-width:160px;height:70px;object-fit:contain;display:block;margin:0 auto 4px;" alt="Assinatura">`
    : `<div style="height:70px;"></div>`;

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>Certificado_Garantia_${nContrato}_${cliente.replace(/[^a-zA-Z0-9]/g,'_')}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=UnifrakturMaguntia&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:Arial,Helvetica,sans-serif;font-size:11.5px;color:#222;line-height:1.75}
.pg{padding:14mm 20mm 16mm;max-width:210mm;margin:0 auto}
.logo-bar{display:flex;align-items:center;margin-bottom:24px;}
.logo-bar .lines{flex:1;margin-left:14px;display:flex;flex-direction:column;gap:4px;}
.logo-bar .line-orange{height:5px;background:#e87722;border-radius:1px;}
.logo-bar .line-dark{height:5px;background:#333;border-radius:1px;}
.cert-title{font-family:'UnifrakturMaguntia','Palatino Linotype','Book Antiqua',Palatino,serif;font-size:38px;font-weight:400;text-align:center;color:#111;margin:0 0 24px;line-height:1.2}
.client-block{margin-bottom:28px;font-size:11.5px;line-height:1.8}
.client-block .name{font-weight:700;font-size:12px;}
.clause{margin:14px 0;font-size:11.5px;line-height:1.75;text-align:justify}
.clause-num{font-weight:bold}
.date-line{margin:30px 0 0;text-align:center;font-size:11px;color:#333;}
.sig-block{text-align:center;margin-top:10px}
.sig-name{font-weight:700;font-size:11px;margin-top:2px;}
.sig-company{font-size:10px;color:#333;margin-top:1px;}
.download-btn{position:fixed;top:12px;right:12px;z-index:9999;background:#e87722;color:white;border:none;padding:10px 20px;font-size:14px;font-weight:700;border-radius:8px;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,0.3)}
/* Tela: doc-tbl transparente — filho direto (>) para não vazar nas tabelas internas */
.doc-tbl{display:block;width:100%;max-width:210mm;margin:0 auto}
.doc-tbl > thead,.doc-tbl > tfoot{display:none}
.doc-tbl > tbody,.doc-tbl > tbody > tr,.doc-tbl > tbody > tr > td{display:block}
@media print{
  body{-webkit-print-color-adjust:exact;print-color-adjust:exact}
  @page{size:A4;margin:0}
  .download-btn{display:none!important}
  .logo-bar{display:none!important}
  .doc-tbl{display:table;width:100%;border-collapse:collapse;table-layout:fixed}
  .doc-tbl > thead{display:table-header-group}
  .doc-tbl > tfoot{display:table-footer-group}
  .doc-tbl > tbody{display:table-row-group}
  .doc-tbl > tbody > tr{display:table-row}
  .doc-tbl > tbody > tr > td,.doc-tbl > thead > tr > th{display:table-cell;padding:0;font-weight:normal}
  .pg{padding:8mm 20mm!important;max-width:none!important;margin:0!important}
}
</style>
</head>
<body>
<button class="download-btn" onclick="window.print()">⬇ Salvar como PDF</button>
<table class="doc-tbl">
<thead><tr><th>
  <div style="display:flex;justify-content:space-between;align-items:center;padding:6mm 22mm;border-bottom:2px solid #e87722;background:#fff">
    <div>${LOGO_B64 ? `<img src="data:image/png;base64,${LOGO_B64}" style="height:14mm;width:auto" alt="Vedafácil">` : '<span style="font-size:18px;font-weight:900;color:#e87722">VEDAFÁCIL</span>'}</div>
    <div style="text-align:right;line-height:1.6">
      <div style="font-size:12px;font-weight:700;color:#333">Certificado de Garantia</div>
      <div style="font-size:10px;color:#e87722;margin-top:1px">Contrato Nº ${nContrato} — ${cliente}</div>
    </div>
  </div>
</th></tr></thead>
<tfoot><tr><td>
  <div style="text-align:center;font-size:8.5px;color:#666;padding:5mm 22mm;border-top:1px solid #ddd;background:#fff;line-height:1.7">
    <strong style="color:#e87722;font-size:9px">Eliminamos Infiltrações Sem Quebrar!</strong><br>
    CNPJ: 23.606.470/0001-07 &nbsp;|&nbsp; Tel.: (21) 99984-1127 / (24) 2106-1015
  </div>
</td></tr></tfoot>
<tbody><tr><td>

<div class="pg">

  <!-- Logo + linhas decorativas -->
  <div class="logo-bar">
    ${logoImg}
    <div class="lines">
      <div class="line-orange"></div>
      <div class="line-dark"></div>
    </div>
  </div>

  <!-- Título gótico -->
  <div class="cert-title">Certificado de Garantia</div>

  <!-- Dados do cliente -->
  <div class="client-block">
    <div class="name">${cliente}</div>
    ${endereco ? `<div>${endereco}</div>` : ''}
    ${cidadeUF ? `<div>${cidadeUF}</div>` : ''}
    ${cnpjCliente ? `<div>CNPJ: &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; ${cnpjCliente}</div>` : ''}
  </div>

  <!-- Cláusulas -->
  <div class="clause">
    <span class="clause-num">1.</span> A empresa <strong>T. R. FERRAZ (VEDAFACIL)</strong> oferece garantia limitada por um período de
    <strong>${anos} (${anosExt}) anos</strong>, nas áreas tratadas e especificadas no Contrato de Prestação de
    Serviço n° &nbsp;<strong>${nContrato}</strong>&nbsp; contada a partir da data de emissão desse certificado.
  </div>

  <div class="clause">
    <span class="clause-num">2.</span> <strong>Trabalho realizado:</strong> Serviço de hidrojateamento para selamento de trincas com problemas
    de infiltração, por meio de pressão negativa com gel calafetador de alta flexibilidade (GVF
    SEAL).${descLocais ? `<br><span style="font-size:10.5px;color:#444;">Locais: ${descLocais}.</span>` : ''}
  </div>

  <div class="clause">
    <span class="clause-num">3.</span> Cessa a garantia caso sejam realizadas obras posteriores ao tratamento e estas obras
    afetem as condições da estrutura.
  </div>

  <div class="clause">
    <span class="clause-num">4.</span> A garantia não cobre infiltrações em áreas não tratadas, danos causados por terceiros,
    alterações estruturais ou eventos de força maior.
  </div>

  <!-- Data e assinatura -->
  <div class="date-line">${foro}, ${dataEmissao}</div>

  <div class="sig-block" style="margin-top:14px;">
    ${assinaturaImg}
    <div class="sig-name">T. R. FERRAZ TECNOLOGIA EM IMPERMEABILIZAÇÃO LTDA ME</div>
    <div class="sig-company">CNPJ: 23.606.470/0001-07</div>
  </div>

</div>

${(() => {
  // ── Relatório fotográfico + Croquis ───────────────────────────────────────
  const FOOTER_RF = `<div style="text-align:center;font-size:8.5px;color:#666;margin-top:16px;padding-top:8px;border-top:1px solid #ccc;"><strong style="color:#e87722;">Eliminamos Infiltrações Sem Quebrar!</strong><br>CNPJ: 23.606.470/0001-07 &nbsp;|&nbsp; Tel.: (21) 99984-1127 / (24) 2106-1015</div>`;
  const logoGar = LOGO_B64 ? `<div style="text-align:center;margin-bottom:8px;"><img src="data:image/png;base64,${LOGO_B64}" style="height:40px;width:auto;" alt="Vedafácil"></div>` : '';

  // 1ª parte: Relatório fotográfico (ANTES e DEPOIS)
  const fotoPages = [];
  osPontos.forEach(p => {
    const antesFotos = p.fotosAntes || [];
    const depoisFotos = p.fotosDepois || [];
    antesFotos.forEach((f, fi) => {
      const imgSrc = (f && typeof f === 'object') ? (f.full || f.thumb || f.data) : f;
      if (!imgSrc) return;
      fotoPages.push(`<div style="page-break-before:always;padding:10mm 14mm 14mm;max-width:210mm;margin:0 auto;">
  ${logoGar}
  <div style="font-size:11px;font-weight:bold;margin-bottom:4px;color:#e87722;">📷 FOTO ANTES — ${p.nome || 'Local'} (${fi + 1}/${antesFotos.length})</div>
  <div style="border:1px solid #ccc;padding:8px;text-align:center;">
    <img src="${imgSrc}" style="width:100%;max-height:200mm;object-fit:contain;" alt="">
    <div style="text-align:center;font-size:9px;color:#555;margin-top:4px;">ANTES — ${p.nome || 'Local'}</div>
  </div>
  ${FOOTER_RF}
</div>`);
    });
    depoisFotos.forEach((f, fi) => {
      const imgSrc = (f && typeof f === 'object') ? (f.full || f.thumb || f.data) : f;
      if (!imgSrc) return;
      fotoPages.push(`<div style="page-break-before:always;padding:10mm 14mm 14mm;max-width:210mm;margin:0 auto;">
  ${logoGar}
  <div style="font-size:11px;font-weight:bold;margin-bottom:4px;color:#16a34a;">📷 FOTO DEPOIS — ${p.nome || 'Local'} (${fi + 1}/${depoisFotos.length})</div>
  <div style="border:1px solid #ccc;padding:8px;text-align:center;">
    <img src="${imgSrc}" style="width:100%;max-height:200mm;object-fit:contain;" alt="">
    <div style="text-align:center;font-size:9px;color:#555;margin-top:4px;">DEPOIS — ${p.nome || 'Local'}</div>
  </div>
  ${FOOTER_RF}
</div>`);
    });
  });

  // 2ª parte: Croquis das áreas trabalhadas
  const croquiPages = [];
  osPontos.forEach(p => {
    const imagem = p.croquiOtimizado || p.croquiBase64;
    if (!imagem) return;
    if (typeof imagem === 'string' && (imagem.includes('IMAGEM_MUITO_GRANDE') || imagem.length < 50)) return;
    const src = imagem.startsWith('data:') ? imagem : `data:image/png;base64,${imagem}`;
    const isIA = !!p.croquiOtimizado;
    croquiPages.push(`<div style="page-break-before:always;padding:10mm 14mm 14mm;max-width:210mm;margin:0 auto;">
  ${logoGar}
  <div style="font-size:11px;font-weight:bold;margin-bottom:4px;">📐 CROQUI — ${p.nome || 'Local'}${isIA ? ' <span style="background:#f3e8ff;color:#7c3aed;font-size:9px;padding:1px 5px;border-radius:8px;">🤖 IA</span>' : ''}</div>
  <div style="border:1px solid #ccc;padding:6px;text-align:center;background:#fff;">
    <img src="${src}" style="max-width:100%;max-height:190mm;object-fit:contain;background:#fff;" alt="">
  </div>
  ${FOOTER_RF}
</div>`);
  });

  return fotoPages.join('') + croquiPages.join('');
})()}

</td></tr></tbody>
</table>
<script>function downloadPDF(){window.print()}</script>
</body>
</html>`;
}

app.post('/api/contratos/:id/garantia/marcar-enviada', auth, async (req, res) => {
  try {
    await connectDB();
    const ts = Date.now();
    if (isConnected) {
      const c = await Contrato.findOneAndUpdate({ _id: req.params.id }, { garantiaEnviadaEm: ts }, { new: true });
      if (!c) return res.status(404).json({ error: 'Not found' });
      return res.json(c);
    }
    const c = memStore.contratos.find(x => x._id === req.params.id);
    if (!c) return res.status(404).json({ error: 'Not found' });
    c.garantiaEnviadaEm = ts;
    res.json(c);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/contratos/:id/garantia', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1] || req.query.token;
  if (!token) return res.status(401).json({ error: 'Token required' });
  try { jwt.verify(token, JWT_SECRET); }
  catch { return res.status(401).json({ error: 'Invalid token' }); }
  try {
    await connectDB();
    let c;
    if (isConnected) c = await Contrato.findOne({ _id: req.params.id });
    else c = memStore.contratos.find(x => x._id === req.params.id);
    if (!c) return res.status(404).json({ error: 'Not found' });

    // Fetch OS photos for relatório fotográfico
    let osPontos = [];
    try {
      let os;
      if (isConnected) {
        os = await OS.findOne({ contratoId: req.params.id, tipo: { $ne: 'reparo' } }).lean();
        if (!os && c.orcamentoId) os = await OS.findOne({ orcamentoId: c.orcamentoId, tipo: { $ne: 'reparo' } }).lean();
      } else {
        os = memStore.ordensServico?.find(o => o.contratoId === req.params.id && o.tipo !== 'reparo');
        if (!os && c.orcamentoId) os = memStore.ordensServico?.find(o => o.orcamentoId === c.orcamentoId && o.tipo !== 'reparo');
      }
      if (os && os.pontos) {
        osPontos = os.pontos; // inclui todos os pontos — fotos e croquis filtrados dentro de buildGarantiaPdfHtml
      }
    } catch (photoErr) {
      console.error('Garantia: erro ao buscar fotos da OS:', photoErr.message);
    }

    // Resolve fotos R2 → base64 para o Puppeteer renderizar inline
    if (osPontos.length > 0) {
      osPontos = await Promise.all(osPontos.map(async (p) => {
        const fotosMed = Array.isArray(p.fotosMedicao) ? await resolveLocaisForPdf([{ fotos: p.fotosMedicao }]) : [{ fotos: [] }];
        const fotosAnt = Array.isArray(p.fotosAntes) ? await resolveLocaisForPdf([{ fotos: p.fotosAntes }]) : [{ fotos: [] }];
        const fotosDep = Array.isArray(p.fotosDepois) ? await resolveLocaisForPdf([{ fotos: p.fotosDepois }]) : [{ fotos: [] }];
        return {
          ...p,
          fotosMedicao: fotosMed[0]?.fotos || p.fotosMedicao,
          fotosAntes: fotosAnt[0]?.fotos || p.fotosAntes,
          fotosDepois: fotosDep[0]?.fotos || p.fotosDepois,
        };
      }));
    }

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(buildGarantiaPdfHtml(c, osPontos));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── ART PDF ───────────────────────────────────────────────────────────────────

function buildArtPdfHtml(c) {
  const fmtDate = (d) => fmtDateBR(d) || '___';
  const fmt = (n) => 'R$ ' + (n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });

  const nContrato = c.numero ? String(c.numero).padStart(4, '0') : '___';
  const cliente = c.razaoSocial || c.cliente || '___';
  const cnpj = c.cnpjCliente || '___';
  const endereco = c.endereco || '___';
  const cidade = c.cidade || '___';
  const cep = c.cep || '___';
  const emailCliente = c.emailCliente || '___';
  const sindico = c.sindico || c.ac || '___';
  const celular = c.celular || '___';
  const dataInicio = fmtDate(c.dataInicio);
  const dataTermino = fmtDate(c.dataTermino);

  const totals = { trinca:0, juntaFria:0, ralo:0, juntaDilat:0, cortina:0 };
  (c.locais || []).forEach(l => {
    totals.trinca += l.trinca || 0;
    totals.juntaFria += l.juntaFria || 0;
    totals.ralo += l.ralo || 0;
    totals.juntaDilat += l.juntaDilat || 0;
    totals.cortina += l.cortina || 0;
  });

  const descLocais = (c.locais || []).map(l => {
    const partes = [];
    if (l.trinca > 0) partes.push(`${l.trinca} metro(s) de trinca`);
    if (l.juntaFria > 0) partes.push(`${l.juntaFria} metro(s) de junta fria`);
    if (l.ralo > 0) partes.push(`${l.ralo} ralo(s)`);
    if (l.juntaDilat > 0) partes.push(`${l.juntaDilat} metro(s) de junta de dilatação`);
    if (l.cortina > 0) partes.push(`${l.cortina}m² de cortina`);
    return partes.length ? `${l.nome || 'Local'}: ${partes.join(' - ')}` : null;
  }).filter(Boolean).join('; ');

  const descServico = `EXECUÇÃO DE SERVIÇO DE HIDROJATEAMENTO, CALAFETAÇÃO E SELADOR DE INFILTRAÇÕES UTILIZANDO O MÉTODO DE INJEÇÃO CAPILAR QUÍMICA FORÇADA EM ESTRUTURA DE CONCRETO MACIÇO.${descLocais ? ' LOCAL: ' + descLocais + '.' : ''}`;

  const logoImg = LOGO_B64
    ? `<img src="data:image/png;base64,${LOGO_B64}" style="max-width:200px;height:auto;display:block;" alt="Vedafácil">`
    : `<div style="font-size:22px;font-weight:900;color:#e87722;">VEDAFÁCIL</div>`;

  const row = (label, value) => `<tr><td class="lbl">${label}</td><td class="val">${value}</td></tr>`;

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8">
<title>ART_${nContrato}_${cliente.replace(/[^a-zA-Z0-9]/g,'_')}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#222;line-height:1.6}
.pg{padding:12mm 16mm;max-width:210mm;margin:0 auto}
h1{font-size:14px;font-weight:900;color:#e87722;text-transform:uppercase;letter-spacing:1px;margin:14px 0 10px;border-bottom:2px solid #e87722;padding-bottom:4px}
h2{font-size:11px;font-weight:bold;background:#e87722;color:white;padding:5px 10px;margin:12px 0 6px;border-radius:2px}
table.info{width:100%;border-collapse:collapse;font-size:10.5px;margin:4px 0}
table.info td{padding:4px 6px;border:1px solid #ccc}
table.info .lbl{background:#f5f5f5;font-weight:bold;width:38%;color:#444}
table.info .val{width:62%}
table.qty{width:100%;border-collapse:collapse;font-size:10.5px;margin:6px 0}
table.qty th{background:#e87722;color:white;padding:5px 8px;text-align:center;font-weight:bold}
table.qty td{border:1px solid #ccc;padding:5px 8px;text-align:center}
.desc{border:1px solid #ccc;padding:8px 10px;font-size:10.5px;margin:6px 0;line-height:1.7}
.download-btn{position:fixed;top:12px;right:12px;z-index:9999;background:#e87722;color:white;border:none;padding:10px 20px;font-size:14px;font-weight:700;border-radius:8px;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,0.3)}
.footer{text-align:center;font-size:8.5px;color:#666;margin-top:16px;padding-top:8px;border-top:1px solid #ccc}
@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}@page{margin:0;size:A4}.download-btn{display:none!important}}
</style>
</head>
<body>
<button class="download-btn" onclick="window.print()">⬇ Salvar como PDF</button>
<div class="pg">
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
    ${logoImg}
    <div style="text-align:right;font-size:10px;color:#555;">
      <div><b>Contrato nº ${nContrato}</b></div>
      <div>${new Date().toLocaleDateString('pt-BR')}</div>
    </div>
  </div>

  <h1>Informações para Emissão de ART</h1>

  <h2>Dados da Empresa Responsável (Contratada)</h2>
  <table class="info">
    ${row('Razão Social', 'T. R. FERRAZ TECNOLOGIA EM IMPERMEABILIZAÇÃO LTDA ME')}
    ${row('Nome Fantasia', 'VEDAFACIL')}
    ${row('CNPJ', '23.606.470/0001-07')}
    ${row('Endereço', 'Rua Professora Margarida Fialho Thompson Leite, 670')}
    ${row('Bairro', 'Residencial Cristo Redentor')}
    ${row('Cidade / UF', 'Barra Mansa / RJ')}
    ${row('CEP', '27.323-755')}
  </table>

  <h2>Dados do Contrato / Obra</h2>
  <table class="info">
    ${row('Contratante / Condomínio', cliente)}
    ${row('CNPJ do Contratante', cnpj)}
    ${row('Síndico / Responsável', sindico)}
    ${row('Celular do Responsável', celular)}
    ${row('E-mail do Signatário', emailCliente)}
    ${row('Endereço da Obra', endereco)}
    ${row('Cidade / UF', cidade + ' / RJ')}
    ${row('CEP', cep)}
    ${row('Local do Serviço', cliente)}
    ${row('Nº do Contrato', nContrato)}
    ${row('Valor do Contrato', fmt(c.totalLiquido || c.totalBruto))}
    ${row('Data de Início', dataInicio)}
    ${row('Previsão de Término', dataTermino)}
    ${row('Categoria', 'Residencial')}
  </table>

  <h2>Quantidade dos Serviços</h2>
  <table class="qty">
    <tr>
      <th>Trincas (m)</th>
      <th>Junta Fria (m)</th>
      <th>Ralos (unid)</th>
      <th>Junta Dilatação (m)</th>
      <th>Cortina (m²)</th>
    </tr>
    <tr>
      <td>${totals.trinca || '—'}</td>
      <td>${totals.juntaFria || '—'}</td>
      <td>${totals.ralo || '—'}</td>
      <td>${totals.juntaDilat || '—'}</td>
      <td>${totals.cortina || '—'}</td>
    </tr>
  </table>

  <h2>Descrição do Serviço</h2>
  <div class="desc">${descServico}</div>

  <div class="footer">
    <strong style="color:#e87722;">Eliminamos Infiltrações Sem Quebrar!</strong><br>
    CNPJ: 23.606.470/0001-07 &nbsp;|&nbsp; Tel.: (21) 99984-1127 / (24) 2106-1015
  </div>
</div>
</body>
</html>`;
}

app.get('/api/contratos/:id/art', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1] || req.query.token;
  if (!token) return res.status(401).json({ error: 'Token required' });
  try { jwt.verify(token, JWT_SECRET); }
  catch { return res.status(401).json({ error: 'Invalid token' }); }
  try {
    await connectDB();
    let c;
    if (isConnected) c = await Contrato.findOne({ _id: req.params.id });
    else c = memStore.contratos.find(x => x._id === req.params.id);
    if (!c) return res.status(404).json({ error: 'Not found' });
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(buildArtPdfHtml(c));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Excel Generation ──────────────────────────────────────────────────────────

async function buildOrcamentoExcel(o) {
  const { default: ExcelJS } = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Vedafácil';
  wb.created = new Date();

  const AZUL = '1a5c9a';
  const AZUL_CLARO = 'e8f0fb';
  const CINZA = 'f5f5f5';

  const fmt = (n) => Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // ── Aba 1: Informações ─────────────────────────────────────────────────────
  const wsInfo = wb.addWorksheet('Informações');
  wsInfo.columns = [
    { width: 28 }, { width: 40 }, { width: 28 }, { width: 30 },
  ];

  // Cabeçalho empresa
  const titleRow = wsInfo.addRow(['Vedafácil', '', '', `ORÇAMENTO Nº ${o.numero || 1}`]);
  titleRow.font = { bold: true, size: 16, color: { argb: 'FF' + AZUL } };
  titleRow.getCell(4).alignment = { horizontal: 'right' };
  titleRow.getCell(4).font = { bold: true, size: 14, color: { argb: 'FF' + AZUL } };
  wsInfo.mergeCells('A1:C1');

  wsInfo.addRow(['T. R. FERRAZ TECNOLOGIA EM IMPERMEABILIZACAO EIRELI ME', '', '', `Data: ${o.dataOrcamento || new Date().toLocaleDateString('pt-BR')}`])
    .getCell(4).alignment = { horizontal: 'right' };
  wsInfo.addRow(['CNPJ: 23.606.470/0001-07', '', '', `Validade: ${o.validade || '30 dias'}`])
    .getCell(4).alignment = { horizontal: 'right' };
  wsInfo.addRow(['Rua Profª Margarida F. T. Leite, 670 — Barra Mansa/RJ']);
  wsInfo.addRow([]);

  // Seção Dados do Cliente
  const headerCliente = wsInfo.addRow(['DADOS DO CLIENTE']);
  headerCliente.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + AZUL } };
  headerCliente.getCell(1).font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
  wsInfo.mergeCells(`A${headerCliente.number}:D${headerCliente.number}`);

  const addInfoRow = (label1, val1, label2, val2) => {
    const r = wsInfo.addRow([label1, val1, label2 || '', val2 || '']);
    r.getCell(1).font = { bold: true, size: 10, color: { argb: 'FF555555' } };
    r.getCell(3).font = { bold: true, size: 10, color: { argb: 'FF555555' } };
    [1, 2, 3, 4].forEach(c => {
      r.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + CINZA } };
      r.getCell(c).border = { bottom: { style: 'thin', color: { argb: 'FFDDDDDD' } } };
    });
    return r;
  };

  addInfoRow('CLIENTE / CONDOMÍNIO', o.cliente || '', 'A/C', o.ac || '');
  addInfoRow('ENDEREÇO', o.endereco || '', 'CEP', o.cep || '');
  addInfoRow('CIDADE', o.cidade || '', 'CELULAR', o.celular || '');
  addInfoRow('TÉCNICO RESPONSÁVEL', o.tecnicoResponsavel || '', 'ELABORADO POR', o.elaboradoPor || '');
  addInfoRow('AVALIADO POR', o.avaliadoPor || '', 'ACOMPANHADO POR', o.acompanhadoPor || '');
  addInfoRow('ORIGEM', o.origem || '', 'SIGLA', o.sigla || '');
  wsInfo.addRow([]);

  // Seção Locais
  if (o.locais && o.locais.length > 0) {
    const headerLocais = wsInfo.addRow(['LEVANTAMENTO POR LOCAL']);
    headerLocais.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + AZUL } };
    headerLocais.getCell(1).font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
    wsInfo.mergeCells(`A${headerLocais.number}:D${headerLocais.number}`);

    const colsLocais = wsInfo.addRow(['Local', 'Trincas (m)', 'Juntas Frias (m)', 'Ralos (un)', 'Jta. Dilat. (m)', 'Ferragens (m)', 'Cortinas (m²)']);
    colsLocais.eachCell(cell => {
      cell.font = { bold: true, size: 10, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF3a7cbf' } };
    });
    wsInfo.getColumn(5).width = 20;
    wsInfo.getColumn(6).width = 18;
    wsInfo.getColumn(7).width = 18;

    o.locais.forEach((l, i) => {
      const r = wsInfo.addRow([l.nome || `Local ${i + 1}`, l.trinca || 0, l.juntaFria || 0, l.ralo || 0, l.juntaDilat || 0, l.ferragem || 0, l.cortina || 0]);
      if (i % 2 === 0) r.eachCell(cell => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + CINZA } };
      });
    });
    wsInfo.addRow([]);
  }

  // Observações
  if (o.obsAdicionais) {
    wsInfo.addRow(['OBSERVAÇÕES']).getCell(1).font = { bold: true };
    wsInfo.addRow([o.obsAdicionais]);
  }

  // ── Aba 2: Orçamento ────────────────────────────────────────────────────────
  const wsOrc = wb.addWorksheet('Orçamento');
  wsOrc.columns = [
    { width: 6 }, { width: 35 }, { width: 18 }, { width: 20 }, { width: 20 },
  ];

  // Cabeçalho
  const titleOrc = wsOrc.addRow(['Vedafácil — ORÇAMENTO', '', '', '', `Nº ${o.numero || 1}`]);
  titleOrc.font = { bold: true, size: 14, color: { argb: 'FF' + AZUL } };
  titleOrc.getCell(5).alignment = { horizontal: 'right' };
  wsOrc.mergeCells('A1:D1');

  wsOrc.addRow([`Data: ${o.dataOrcamento || ''}`, '', '', '', `Validade: ${o.validade || '30 dias'}`])
    .getCell(5).alignment = { horizontal: 'right' };
  wsOrc.addRow([`Cliente: ${o.cliente || ''}`, '', '', '', `A/C: ${o.ac || ''}`])
    .getCell(5).alignment = { horizontal: 'right' };
  wsOrc.addRow([]);

  // Header tabela
  const tHead = wsOrc.addRow(['#', 'Descrição', 'Qtd / Unidade', 'Valor Unitário', 'Subtotal']);
  tHead.eachCell(cell => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + AZUL } };
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
    cell.alignment = { horizontal: 'center' };
    cell.border = { bottom: { style: 'medium' } };
  });

  (o.itens || []).forEach((item, i) => {
    const r = wsOrc.addRow([
      i + 1,
      item.descricao,
      `${item.quantidade} ${item.unidade}`,
      `R$ ${fmt(item.valorUnit)}`,
      `R$ ${fmt(item.subtotal)}`,
    ]);
    if (i % 2 === 0) r.eachCell(cell => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + AZUL_CLARO } };
    });
    r.getCell(4).alignment = { horizontal: 'right' };
    r.getCell(5).alignment = { horizontal: 'right' };
  });

  // Totais
  wsOrc.addRow([]);
  const addTotalRow = (label, value, bold = false) => {
    const r = wsOrc.addRow(['', '', '', label, `R$ ${fmt(value)}`]);
    r.getCell(4).alignment = { horizontal: 'right' };
    r.getCell(5).alignment = { horizontal: 'right' };
    if (bold) {
      r.getCell(4).font = { bold: true, size: 12 };
      r.getCell(5).font = { bold: true, size: 12 };
      r.eachCell(cell => { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + AZUL_CLARO } }; });
    }
    return r;
  };

  addTotalRow('TOTAL BRUTO', o.totalBruto, true);
  if (o.desconto) {
    const descValor = o.descontoTipo === 'percent' ? (o.totalBruto * o.desconto / 100) : o.desconto;
    addTotalRow(`Desconto (${o.descontoTipo === 'percent' ? o.desconto + '%' : 'R$ ' + fmt(o.desconto)})`, descValor);
  }
  addTotalRow('TOTAL LÍQUIDO', o.totalLiquido, true);

  if (o.parcelas > 1 || o.entrada) {
    wsOrc.addRow([]);
    wsOrc.addRow(['', '', '', 'CONDIÇÕES DE PAGAMENTO', '']).getCell(4).font = { bold: true };
    if (o.entrada) addTotalRow(`Entrada (${o.entrada}%)`, o.totalLiquido * o.entrada / 100);
    if (o.parcelas > 1) addTotalRow(`Saldo em ${o.parcelas}x`, o.valorParcela);
  }

  // Rodapé
  wsOrc.addRow([]);
  const footer = wsOrc.addRow(['Vedafácil — T. R. FERRAZ TECNOLOGIA EM IMPERMEABILIZACAO EIRELI ME — CNPJ: 23.606.470/0001-07']);
  footer.getCell(1).font = { size: 9, color: { argb: 'FF888888' } };
  wsOrc.mergeCells(`A${footer.number}:E${footer.number}`);

  return wb;
}

app.post('/api/orcamentos/:id/excel', auth, async (req, res) => {
  try {
    await connectDB();
    let o;
    if (isConnected) o = await Orcamento.findById(req.params.id);
    else o = memStore.orcamentos.find(x => x._id === req.params.id);
    if (!o) return res.status(404).json({ error: 'Not found' });

    const wb = await buildOrcamentoExcel(o);
    const filename = `Orcamento_${o.numero || o._id}_${(o.cliente || 'cliente').replace(/\s+/g, '_')}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    await wb.xlsx.write(res);
    res.end();
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }); }
});

// ── Contratos Routes ──────────────────────────────────────────────────────────

// pushStatusHistorico → importado de ./lib/helpers.js

app.get('/api/contratos', auth, async (req, res) => {
  try {
    await connectDB();
    if (isConnected) return res.json(await Contrato.find()
      .sort({ createdAt: -1 })
      .select('-pdfBase64 -pdfManualBase64 -anexoOrcamentoPdfBase64 -textoHtml -clausulas -locais.fotos -locais.fotosMedicao')
      .lean());
    res.json(memStore.contratos);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/contratos', auth, async (req, res) => {
  try {
    await connectDB();
    let o;
    const { orcamentoId } = req.body;
    if (isConnected) o = await Orcamento.findOne({ _id: orcamentoId });
    else o = memStore.orcamentos.find(x => x._id === orcamentoId);
    if (!o) return res.status(404).json({ error: 'Orçamento not found' });

    const descontoValor = o.descontoTipo === 'percent' ? (o.totalBruto * (o.desconto || 0) / 100) : (o.desconto || 0);
    const totalLiquido = o.totalLiquido || (o.totalBruto - descontoValor);
    const parcelas = o.parcelas || 1;
    const valorParcela = parcelas > 1 ? (totalLiquido / parcelas) : totalLiquido;

    // Número do contrato = número do orçamento de origem (mesma numeração para toda a cadeia)
    const n = o.numero;
    const novoContrato = {
      _id: uuidv4(),
      numero: n,
      orcamentoId,
      status: 'rascunho',
      createdAt: Date.now(), updatedAt: Date.now(),
      cliente: o.cliente || '', endereco: o.endereco || '', cidade: o.cidade || '', cep: o.cep || '',
      ac: o.ac || '', celular: o.celular || '', emailCliente: o.emailCliente || '',
      razaoSocial: o.razaoSocial || o.cliente || '',
      cnpjCliente: o.cnpjCliente || '', cpfResponsavel: '', rgResponsavel: '', sindico: '', ie: '',
      dataAssinatura: '', dataInicio: '', dataTermino: '',
      foro: 'Rio de Janeiro',
      garantia: o.garantia || 15,
      prazoExecucao: o.prazoExecucao || 3,
      desconto: o.desconto || 0, descontoTipo: o.descontoTipo || 'percent',
      totalBruto: o.totalBruto || 0,
      totalLiquido,
      issPercent: 3,
      parcelas, valorParcela,
      parcelasContrato: [],
      locais: o.locais || [],
      itens: (o.itens || []).filter(i => i.quantidade > 0),
      cronograma: (o.locais || []).map(l => ({ local: l.nome || '', dataInicio: '', dataFim: '' })),
      diasTrabalho:   o.diasTrabalho   || 0,
      consumoProduto: o.consumoProduto || 0,
      qtdInjetores:   o.qtdInjetores   || 0,
      propostaEscolhida: null,
      condicaoPgto1Obs:  o.condicaoPgto1Obs  || '*Pgto a vista, na assinatura do contrato.',
      condicaoPgto2Obs1: o.condicaoPgto2Obs1 || '* 1ª parcela de entrada na assinatura do contrato.',
      condicaoPgto2Obs2: o.condicaoPgto2Obs2 || '*2ª parcela p/ 30 dias.',
      obsGeral: o.obsGeral || '',
      zapsignDocId: null, zapsignSignUrl: null, assinadoEm: null,
      statusHistorico: [{ status: 'rascunho', data: Date.now() }],
      ...req.body,
      ...creatorInfo(req),
    };

    if (isConnected) { await Contrato.create(novoContrato); }
    else { memStore.contratos.push(novoContrato); }
    res.json(novoContrato);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/contratos/:id', auth, async (req, res) => {
  try {
    await connectDB();
    if (isConnected) {
      const c = await Contrato.findOne({ _id: req.params.id });
      if (!c) return res.status(404).json({ error: 'Not found' });
      return res.json(c);
    }
    const c = memStore.contratos.find(x => x._id === req.params.id);
    if (!c) return res.status(404).json({ error: 'Not found' });
    res.json(c);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/contratos/:id', auth, bigJson, async (req, res) => {
  try {
    await connectDB();
    const updates = { ...req.body, updatedAt: Date.now() };
    if (isConnected) {
      const docAtual = await Contrato.findOne({ _id: req.params.id }).lean();
      // Log de auditoria quando o número do contrato é alterado
      if (docAtual && typeof updates.numero === 'number' && updates.numero !== docAtual.numero) {
        await audit(req, 'update-numero-contrato', 'contrato', req.params.id, {
          de: docAtual.numero,
          para: updates.numero,
          cliente: docAtual.cliente,
        });
      }
      pushStatusHistorico(updates, updates.status, docAtual);
      // Usa $set explícito para garantir que arrays como parcelasContrato (Mixed) sejam salvos corretamente
      const c = await Contrato.findOneAndUpdate(
        { _id: req.params.id },
        { $set: updates },
        { new: true, strict: false }
      );
      return res.json(c);
    }
    const idx = memStore.contratos.findIndex(x => x._id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Not found' });
    pushStatusHistorico(updates, updates.status, memStore.contratos[idx]);
    memStore.contratos[idx] = { ...memStore.contratos[idx], ...updates };
    res.json(memStore.contratos[idx]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

async function generatePdfBuffer(html) {
  let browser;
  try {
    if (puppeteerLauncher) {
      const { chromium, puppeteerCore } = puppeteerLauncher;
      browser = await puppeteerCore.launch({
        args: chromium.args,
        defaultViewport: chromium.defaultViewport,
        executablePath: await chromium.executablePath(),
        headless: chromium.headless,
      });
    } else {
      const puppeteer = (await import('puppeteer-core')).default;
      const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH || undefined;
      browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
        executablePath,
      });
    }
    const page = await browser.newPage();
    await page.setViewport({ width: 794, height: 1123, deviceScaleFactor: 1 }); // A4 @ 96dpi — evita texto cortado na direita
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const buffer = await page.pdf({ format: 'A4', printBackground: true, margin: { top: '0', bottom: '0', left: '0', right: '0' } });
    return buffer;
  } finally {
    if (browser) await browser.close();
  }
}

app.patch('/api/contratos/:id/status', auth, async (req, res) => {
  try {
    await connectDB();
    const { status } = req.body;
    const statusValidos = ['rascunho', 'pendente_assinatura', 'assinado'];
    if (!status || !statusValidos.includes(status)) return res.status(400).json({ error: 'Status inválido' });

    let doc, updated;
    if (isConnected) {
      doc = await Contrato.findOne({ _id: req.params.id }).lean();
      if (!doc) return res.status(404).json({ error: 'Not found' });
      const hist = [...(doc.statusHistorico || []), { status, data: Date.now() }];
      updated = await Contrato.findOneAndUpdate(
        { _id: req.params.id },
        { status, statusHistorico: hist, updatedAt: Date.now() },
        { new: true }
      ).lean();
    } else {
      doc = memStore.contratos.find(x => x._id === req.params.id);
      if (!doc) return res.status(404).json({ error: 'Not found' });
      doc.status = status;
      doc.statusHistorico = [...(doc.statusHistorico || []), { status, data: Date.now() }];
      updated = doc;
    }

    // ── Ao assinar: cria OS automaticamente (se não existir já) ──────────────
    let novaOsId = null;
    if (status === 'assinado' && doc.status !== 'assinado') {
      try {
        // Verifica se já existe OS criada para este contrato
        const osExistente = isConnected
          ? await OS.findOne({ contratoId: req.params.id, origem: 'contrato' }).lean()
          : memStore.os?.find(o => o.contratoId === req.params.id && o.origem === 'contrato');

        if (!osExistente) {
          // Busca o orçamento vinculado para obter os locais
          let orc = null;
          if (doc.orcamentoId) {
            orc = isConnected
              ? await Orcamento.findById(doc.orcamentoId).lean()
              : memStore.orcamentos?.find(x => x._id === doc.orcamentoId);
          }

          // Converte locais do orçamento em pontos da OS
          const locais = orc?.locais || doc.locais || [];
          const pontos = locais.map(l => ({
            nome: l.nome || l.local || 'Local',
            andar: l.andar || '',
            trinca: l.trinca || 0,
            juntaFria: l.juntaFria || 0,
            ralo: l.ralo || 0,
            juntaDilat: l.juntaDilat || 0,
            ferragem: l.ferragem || 0,
            cortina: l.cortina || 0,
            statusLocal: 'pendente',
            subPontos: [],
            fotosAntes: [],
            fotosDepois: [],
          }));

          // Se o contrato veio de integração legada, a OS usa o mesmo número
          // (mantém a cadeia: contrato 2205 → OS 2205 → garantia 2205)
          let numeroOS
          if (doc.origem === 'integracao' && doc.numero) {
            numeroOS = doc.numero
          } else {
            const count = isConnected ? await OS.countDocuments() : (memStore.os?.length || 0)
            numeroOS = count + 1
          }

          const novaOS = {
            _id: uuidv4(),
            numero: numeroOS,
            tipo: 'normal',
            origem: doc.origem === 'integracao' ? 'integracao' : 'contrato',
            pendente_equipe: true,
            contratoId: req.params.id,
            cliente: doc.razaoSocial || doc.cliente || '',
            endereco: doc.endereco || '',
            cidade: doc.cidade || '',
            cep: doc.cep || '',
            celular: doc.celular || '',
            equipeId: '',
            equipeNome: '',
            dataInicio: doc.dataInicio || '',
            dataTermino: doc.dataTermino || '',
            diasTrabalho: doc.prazoExecucao || 0,
            consumoProduto: orc?.consumoProduto || 0,
            qtdInjetores: orc?.qtdInjetores || 0,
            pontos,
            obs: '',
            progresso: 0,
            status: 'agendada',
            createdAt: Date.now(),
            updatedAt: Date.now(),
          };

          if (isConnected) {
            const osDoc = new OS(novaOS);
            await osDoc.save();
            novaOsId = novaOS._id;
          } else {
            if (!memStore.os) memStore.os = [];
            memStore.os.push(novaOS);
            novaOsId = novaOS._id;
          }
          log('info', 'OS criada automaticamente ao assinar contrato', { contratoId: req.params.id, osId: novaOsId });
        }
      } catch (osErr) {
        log('warn', 'Erro ao criar OS automática do contrato', { error: osErr.message });
        // Não falha o request principal
      }
    }

    return res.json({ ...updated, _osAutocriadaId: novaOsId });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/contratos/:id', auth, adminOnly, async (req, res) => {
  await audit(req, 'delete', 'contrato', req.params.id);
  try {
    await connectDB();
    if (isConnected) {
      const doc = await Contrato.findOne({ _id: req.params.id });
      if (doc) await salvarNaLixeira('contrato', 'Contrato', 'contratos', doc, req.user?.email || req.user?.username);
      await Contrato.findOneAndDelete({ _id: req.params.id });
    } else {
      const doc = memStore.contratos.find(x => x._id === req.params.id);
      if (doc) await salvarNaLixeira('contrato', 'Contrato', 'contratos', doc, req.user?.email);
      memStore.contratos = memStore.contratos.filter(x => x._id !== req.params.id);
    }
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/contratos/:id/zapsign', auth, async (req, res) => {
  try {
    await connectDB();
    let c;
    if (isConnected) c = await Contrato.findOne({ _id: req.params.id });
    else c = memStore.contratos.find(x => x._id === req.params.id);
    if (!c) return res.status(404).json({ error: 'Not found' });

    const token = process.env.ZAPSIGN_API_TOKEN || 'b9e08716-cee2-43fc-81f0-18a974ed335cffcaa050-1373-4782-936c-0e6b366b8e20';
    const ZAPSIGN_BASE = process.env.ZAPSIGN_SANDBOX === 'true'
      ? 'https://sandbox.api.zapsign.com.br/api/v1'
      : 'https://api.zapsign.com.br/api/v1';

    console.log('[ZapSign] Sending contrato', req.params.id, '(PRODUCAO)');

    let sendMethod = 'base64';
    let base64Pdf = '';
    try {
      const html = buildContratoPdfHtml(c);
      const pdfBuffer = await generatePdfBuffer(html);
      base64Pdf = pdfBuffer.toString('base64');
      console.log('[ZapSign] PDF generated, size:', pdfBuffer.length, 'bytes');
    } catch (pdfErr) {
      console.warn('[ZapSign] PDF generation failed:', pdfErr.message, '- falling back to url_pdf');
      sendMethod = 'url_pdf';
    }

    const host = req.get('x-forwarded-host') || req.get('host');
    const protocol = (req.get('x-forwarded-proto') || 'https').replace(/:$/, '');
    const baseUrl = `${protocol}://${host}`;

    const signerName = (c.sindico || c.ac || c.cliente || 'Signatário').trim() || 'Signatário';
    const signerEmail = (req.body.email || c.emailCliente || '').trim();
    const docPayload = {
      name: `Contrato Vedafácil - ${(c.cliente || 'Cliente').trim()}`,
      folder_path: '/INTEGRAÇÃO/',
      signers: [{
        name: signerName,
        email: signerEmail,
        send_automatic_email: signerEmail ? true : false,
      }],
    };
    if (sendMethod === 'base64') {
      docPayload.base64_pdf = base64Pdf;
    } else {
      const jwtToken = req.headers.authorization?.split(' ')[1] || '';
      docPayload.url_pdf = `${baseUrl}/api/contratos/${req.params.id}/pdf?token=${encodeURIComponent(jwtToken)}`;
    }
    console.log('[ZapSign] send method:', sendMethod, 'signer:', signerName, signerEmail ? `<${signerEmail}>` : '(no email)');

    const response = await axios.post(`${ZAPSIGN_BASE}/docs/`, docPayload, {
      headers: { Authorization: `Bearer ${token}` },
      validateStatus: () => true
    });

    if (response.status !== 200 && response.status !== 201) {
      console.error('[ZapSign] API error:', response.status, JSON.stringify(response.data));
      const detail = typeof response.data === 'object' ? JSON.stringify(response.data) : String(response.data);
      return res.status(response.status).json({ error: `ZapSign ${response.status}: ${detail}`, detail: response.data });
    }

    const docToken = response.data.token;
    const signUrl = response.data.signers?.[0]?.sign_url;
    console.log('[ZapSign] Document created:', docToken, 'signUrl:', signUrl);

    if (isConnected) {
      c = await Contrato.findOneAndUpdate({ _id: req.params.id }, { zapsignDocId: docToken, zapsignSignUrl: signUrl }, { new: true });
    } else {
      const idx = memStore.contratos.findIndex(x => x._id === req.params.id);
      memStore.contratos[idx].zapsignDocId = docToken;
      memStore.contratos[idx].zapsignSignUrl = signUrl;
      c = memStore.contratos[idx];
    }
    res.json({ success: true, signUrl, docToken });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/contratos/webhook/zapsign', async (req, res) => {
  try {
    await connectDB();
    const { document } = req.body;
    if (document?.status === 'signed') {
      const docId = document.token;
      if (isConnected) {
        await Contrato.findOneAndUpdate({ zapsignDocId: docId }, { status: 'assinado', assinadoEm: Date.now() });
      } else {
        const c = memStore.contratos.find(x => x.zapsignDocId === docId);
        if (c) { c.status = 'assinado'; c.assinadoEm = Date.now(); }
      }
    }
    res.json({ received: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Google OAuth ──────────────────────────────────────────────────────────────

function getOAuthClient() {
  // .trim() remove \n que o Vercel CLI adiciona ao salvar via stdin
  const clientId     = (process.env.GOOGLE_CLIENT_ID     || '').trim();
  const clientSecret = (process.env.GOOGLE_CLIENT_SECRET || '').trim();
  const redirectUri  = (process.env.GOOGLE_REDIRECT_URI  || 'https://vedafacil-painel.vercel.app/api/auth/google/callback').trim();
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

app.get('/api/auth/google', (req, res) => {
  if (!(process.env.GOOGLE_CLIENT_ID || '').trim()) return res.status(400).json({ error: 'Google OAuth not configured' });
  // check=1: apenas verifica se está configurado, sem redirecionar (usado pelo PWA)
  if (req.query.check === '1') return res.json({ ok: true, configured: true });
  const source = req.query.source || 'panel';
  const debug = req.query.debug === '1';
  const oauth2Client = getOAuthClient();
  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: [
      'https://www.googleapis.com/auth/userinfo.email',
      'https://www.googleapis.com/auth/userinfo.profile',
      'https://www.googleapis.com/auth/calendar.readonly',
    ],
    prompt: 'consent',
    state: source,
  });
  if (debug) return res.json({ url, client_id: process.env.GOOGLE_CLIENT_ID, redirect_uri: process.env.GOOGLE_REDIRECT_URI });
  res.redirect(url);
});

app.get('/api/auth/google/callback', async (req, res) => {
  const { code, state, error: oauthError } = req.query;
  if (oauthError) return res.redirect('/login?error=oauth_denied');
  const source = state || 'panel';
  try {
    const redirectUri = process.env.GOOGLE_REDIRECT_URI || 'https://vedafacil-painel.vercel.app/api/auth/google/callback';

    // Exchange code for tokens via fetch (avoids googleapis cold-start overhead)
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }).toString(),
    });
    const tokens = await tokenRes.json();
    if (!tokens.access_token) throw new Error('No access_token: ' + JSON.stringify(tokens));

    // Get user info
    const userinfoRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    const userInfo = await userinfoRes.json();
    if (!userInfo.email) throw new Error('No email in userinfo');

    const ADMIN_EMAIL = 'thiagoferrazcriacao@gmail.com';
    const role = userInfo.email === ADMIN_EMAIL ? 'admin' : 'medidor';

    // Include access_token in JWT so calendar works immediately (no DB lookup needed)
    const token = jwt.sign(
      { email: userInfo.email, name: userInfo.name, picture: userInfo.picture || '', role, googleAccessToken: tokens.access_token },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    // Save to DB in background — use $setOnInsert for name to preserve admin-registered name
    connectDB().then(() => {
      const tokenFields = { googleAccessToken: tokens.access_token, googleRefreshToken: tokens.refresh_token || undefined, googleTokenExpiry: tokens.expiry_date, picture: userInfo.picture || '' };
      if (isConnected) {
        User.findOneAndUpdate(
          { _id: userInfo.email },
          { $setOnInsert: { name: userInfo.name, role, email: userInfo.email }, $set: tokenFields },
          { upsert: true }
        ).catch(() => {});
      } else {
        const idx = memStore.users.findIndex(u => u._id === userInfo.email);
        if (idx >= 0) Object.assign(memStore.users[idx], tokenFields);
        else memStore.users.push({ _id: userInfo.email, email: userInfo.email, name: userInfo.name, role, ...tokenFields });
      }
    }).catch(() => {});

    if (source === 'medidor') {
      const medidorUrl = process.env.MEDIDOR_URL || 'https://vedafacil-medidor.vercel.app';
      const dest = `${medidorUrl}/#google_token=${encodeURIComponent(token)}&google_name=${encodeURIComponent(userInfo.name)}&google_email=${encodeURIComponent(userInfo.email)}`;
      return res.send(`<!DOCTYPE html><html><head><meta charset="utf-8"></head><body><script>window.location.replace(${JSON.stringify(dest)})</script></body></html>`);
    }

    res.send(`<!DOCTYPE html><html><head><meta charset="utf-8"></head><body><script>window.location.replace(${JSON.stringify(`/?google_token=${token}`)})</script></body></html>`);
  } catch (err) {
    console.error('Google OAuth error:', err.message);
    res.redirect('/login?error=' + encodeURIComponent(err.message.slice(0, 80)));
  }
});

// ── Medidor master-login: admin entra como qualquer medidor sem precisar do Gmail dele ──
// Retorna um JWT com role 'medidor-master' + targetEmail (email do medidor escolhido)
// O PWA Medidor usa esse token e vê como se fosse o próprio medidor (read-only)
app.get('/api/medidor/master-medidores', async (req, res) => {
  try {
    await connectDB();
    if (!isConnected) return res.json([]);
    const meds = await User.find({ role: 'medidor' }, '_id email name picture').lean();
    res.json(meds.map(u => ({ email: u._id, nome: u.name, picture: u.picture || '' })));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/medidor/master-login', loginLimiter, async (req, res) => {
  try {
    await connectDB();
    const { masterPassword, medidorEmail } = req.body || {};
    if (!masterPassword || !medidorEmail) return res.status(400).json({ error: 'masterPassword e medidorEmail obrigatórios' });
    // Senha master = senha do painel admin (com trim defensivo)
    const expectedPass = (ADMIN_PASSWORD || '').trim();
    if ((masterPassword || '').trim() !== expectedPass) {
      return res.status(401).json({ error: 'Senha master incorreta' });
    }
    // Verifica se o medidor existe
    const target = await User.findById(medidorEmail).lean();
    if (!target || target.role !== 'medidor') {
      return res.status(404).json({ error: 'Medidor não encontrado' });
    }
    // Emite token master vinculado ao medidor escolhido
    const token = jwt.sign({
      username:    target.name,
      email:       target._id,         // o JWT usa o email do medidor (para identificação no medidor PWA)
      targetEmail: target._id,         // alias explícito para o endpoint de calendar
      role:        'medidor-master',
      picture:     target.picture || '',
      masterMode:  true,
    }, JWT_SECRET, { expiresIn: '12h' });
    res.json({
      ok: true,
      token,
      medidor: { email: target._id, nome: target.name, picture: target.picture || '' },
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/calendar/events', auth, async (req, res) => {
  try {
    // Verifica modo da agenda — se 'proprio', não busca Google Calendar
    await connectDB();
    if (isConnected) {
      const cfg = await Config.findById('main').lean().catch(() => null);
      if (cfg?.agendaMode === 'proprio') {
        return res.json({ events: [], desativado: true, agendaMode: 'proprio' });
      }
    }

    // Modo master: admin/medidor-master pode buscar Calendar de OUTRO medidor
    // (?asEmail=outro@gmail.com) usando o refresh token salvo no User
    let accessToken = req.user.googleAccessToken;
    if (req.user.role === 'medidor-master' && req.user.targetEmail) {
      const target = await User.findById(req.user.targetEmail).lean();
      if (target) accessToken = await refreshGToken(target);
    } else if (req.query.asEmail && req.user.role === 'admin') {
      const target = await User.findById(req.query.asEmail).lean();
      if (target) accessToken = await refreshGToken(target);
    }
    if (!accessToken) return res.json([]);

    const now = new Date();
    // timeMin = início do dia atual (meia-noite) para não perder eventos que já passaram no dia
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const maxTime = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const params = new URLSearchParams({
      timeMin: todayStart.toISOString(),
      timeMax: maxTime.toISOString(),
      maxResults: '30',
      singleEvents: 'true',
      orderBy: 'startTime',
    });

    const r = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!r.ok) return res.json([]);
    const data = await r.json();

    const events = (data.items || []).map(e => ({
      id: e.id,
      title: e.summary || '',
      start: e.start?.dateTime || e.start?.date || '',
      end: e.end?.dateTime || e.end?.date || '',
      location: e.location || '',
      description: e.description || '',
      htmlLink: e.htmlLink || '',
    }));

    res.json(events);
  } catch (err) {
    console.error('Calendar error:', err);
    res.json([]);
  }
});

// ── Config Routes ─────────────────────────────────────────────────────────────

app.get('/api/config/precos', auth, async (req, res) => {
  try {
    const cfg = await getConfig();
    res.json(cfg.precos || cfg);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/config/precos', auth, async (req, res) => {
  try {
    await connectDB();
    if (isConnected) {
      const cfg = await Config.findByIdAndUpdate('main', { precos: req.body }, { new: true, upsert: true });
      return res.json(cfg.precos);
    }
    if (!memStore.config) memStore.config = { precos: {} };
    memStore.config.precos = req.body;
    res.json(req.body);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/config/proximo-orcamento', auth, async (req, res) => {
  try {
    const cfg = await getConfig();
    const precos = cfg.precos || cfg;
    res.json({ numero: precos.numOrcamento || 1 });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Usuários Routes ───────────────────────────────────────────────────────────

function adminOnly(req, res, next) {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Acesso negado — somente admin' });
  next();
}

app.get('/api/usuarios/me', auth, async (req, res) => {
  try {
    await connectDB();
    const email = req.user.email;
    if (!email) return res.json(req.user);
    let user;
    if (isConnected) user = await User.findById(email);
    else user = memStore.users.find(u => u._id === email || u.email === email);
    if (!user) return res.json(req.user);
    res.json({ id: user._id || user.email, email: user.email, name: user.name, role: user.role, picture: user.picture });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Lista pública (auth) de MEDIDORES — usada por operadores no modal de visita ──
// Devolve apenas usuários com role 'medidor', sem dados sensíveis (tokens Google, etc).
// IMPORTANTE: declarada ANTES de /api/usuarios/:id pra não ser capturada como id.
app.get('/api/usuarios/medidores', auth, async (req, res) => {
  try {
    await connectDB();
    if (isConnected) {
      const meds = await User.find({ role: 'medidor' })
        .select('_id email name picture')
        .lean();
      return res.json(meds.map(u => ({ id: u._id, email: u.email, name: u.name, role: 'medidor', picture: u.picture })));
    }
    res.json((memStore.users || [])
      .filter(u => u.role === 'medidor')
      .map(u => ({ id: u._id || u.email, email: u.email, name: u.name, role: 'medidor', picture: u.picture })));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/usuarios', auth, adminOnly, async (req, res) => {
  try {
    await connectDB();
    const mapUser = u => ({
      id: u._id || u.email,
      email: u.email,
      name: u.name,
      role: u.role,
      picture: u.picture,
      setores: u.setores || [],
      podeAgendar: !!u.podeAgendar,
      agendaPara: u.agendaPara || [],
      podeGerirEquipes: !!u.podeGerirEquipes,
    });
    if (isConnected) {
      const users = await User.find().select('-googleAccessToken -googleRefreshToken -googleTokenExpiry');
      return res.json(users.map(mapUser));
    }
    res.json(memStore.users.map(mapUser));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/usuarios', auth, adminOnly, async (req, res) => {
  try {
    await connectDB();
    const { email, name, role, password, setores } = req.body;
    if (!email) return res.status(400).json({ error: 'Email obrigatório' });
    const isOperador = (role || 'medidor') === 'operador';
    const userData = {
      _id: email, email, name: name || '', role: role || 'medidor',
      setores: setores || [],
      ...(isOperador ? { password: password || '123456', mustChangePassword: true } : {}),
    };
    if (isConnected) {
      const existing = await User.findById(email);
      if (existing) return res.status(409).json({ error: 'Usuário já existe' });
      const created = await User.create(userData);
      return res.json({ id: created._id, email: created.email, name: created.name, role: created.role, setores: created.setores || [] });
    }
    if (memStore.users.find(u => u._id === email || u.email === email)) {
      return res.status(409).json({ error: 'Usuário já existe' });
    }
    memStore.users.push(userData);
    res.json({ id: email, email, name: userData.name, role: userData.role, setores: userData.setores || [] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/usuarios/:email', auth, adminOnly, async (req, res) => {
  try {
    await connectDB();
    const { email } = req.params;
    const { name, role, setores, podeAgendar, agendaPara, podeGerirEquipes } = req.body;
    const updates = {};
    if (name !== undefined) updates.name = name;
    if (role !== undefined) updates.role = role;
    if (setores !== undefined) updates.setores = setores;
    // Permissão de agendamento (PWA Medidor pode criar visitas pra ele + lista de colegas)
    if (podeAgendar !== undefined) updates.podeAgendar = !!podeAgendar;
    if (agendaPara !== undefined) {
      updates.agendaPara = Array.isArray(agendaPara)
        ? agendaPara.filter(e => typeof e === 'string' && e.trim()).map(e => e.trim().toLowerCase())
        : [];
    }
    // Permissão de gestão de equipes (encarregado vê aba "Gestão de Equipes" no PWA Medidor)
    if (podeGerirEquipes !== undefined) updates.podeGerirEquipes = !!podeGerirEquipes;
    if (isConnected) {
      const updated = await User.findByIdAndUpdate(email, updates, { new: true });
      if (!updated) return res.status(404).json({ error: 'Usuário não encontrado' });
      return res.json({
        id: updated._id, email: updated.email, name: updated.name, role: updated.role,
        setores: updated.setores || [],
        podeAgendar: !!updated.podeAgendar,
        agendaPara: updated.agendaPara || [],
        podeGerirEquipes: !!updated.podeGerirEquipes,
      });
    }
    const u = memStore.users.find(x => x._id === email || x.email === email);
    if (!u) return res.status(404).json({ error: 'Usuário não encontrado' });
    Object.assign(u, updates);
    res.json({
      id: u._id || u.email, email: u.email, name: u.name, role: u.role,
      setores: u.setores || [],
      podeAgendar: !!u.podeAgendar,
      agendaPara: u.agendaPara || [],
      podeGerirEquipes: !!u.podeGerirEquipes,
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Helpers para horário "HH:mm" → minutos do dia
function hhmmToMin(s) { if (!s || !/^\d{2}:\d{2}$/.test(s)) return null; const [h,m] = s.split(':').map(Number); return h*60+m; }
function minToHhmm(min) { const h = Math.floor(min/60), m = min % 60; return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`; }

// GET /api/usuarios/:email/almoco — busca horário de almoço de um medidor
app.get('/api/usuarios/:email/almoco', auth, async (req, res) => {
  try {
    await connectDB();
    const u = isConnected ? await User.findById(req.params.email).lean() : memStore.users.find(x => (x._id || x.email) === req.params.email);
    if (!u) return res.status(404).json({ error: 'Usuário não encontrado' });
    res.json({ almocoInicio: u.almocoInicio || '12:00', almocoFim: u.almocoFim || '13:30' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /api/usuarios/:email/almoco — atualiza horário de almoço (sempre 1h30 de duração)
app.put('/api/usuarios/:email/almoco', auth, async (req, res) => {
  try {
    await connectDB();
    const { almocoInicio } = req.body || {};
    if (!/^\d{2}:\d{2}$/.test(almocoInicio || '')) return res.status(400).json({ error: 'almocoInicio inválido (use HH:mm)' });
    const inicioMin = hhmmToMin(almocoInicio);
    if (inicioMin < 0 || inicioMin > 1350) return res.status(400).json({ error: 'almocoInicio deve estar entre 00:00 e 22:30' });
    // Sempre 1h30 depois do início — não pode ser configurado separadamente
    const almocoFim = minToHhmm(inicioMin + 90);
    if (isConnected) {
      const updated = await User.findByIdAndUpdate(req.params.email, { almocoInicio, almocoFim }, { new: true });
      if (!updated) return res.status(404).json({ error: 'Usuário não encontrado' });
      return res.json({ almocoInicio: updated.almocoInicio, almocoFim: updated.almocoFim });
    }
    const u = memStore.users.find(x => (x._id || x.email) === req.params.email);
    if (!u) return res.status(404).json({ error: 'Usuário não encontrado' });
    u.almocoInicio = almocoInicio; u.almocoFim = almocoFim;
    res.json({ almocoInicio, almocoFim });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/usuarios/:email', auth, adminOnly, async (req, res) => {
  await audit(req, 'delete', 'usuario', req.params.email);
  try {
    await connectDB();
    const { email } = req.params;
    if (isConnected) {
      await User.findByIdAndDelete(email);
    } else {
      memStore.users = memStore.users.filter(u => u._id !== email && u.email !== email);
    }
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Notification badge counts ─────────────────────────────────────────────────
app.get('/api/notifications/counts', auth, async (req, res) => {
  try {
    await connectDB();

    // Descobre setores do usuário logado para filtrar o que mostrar
    const setoresOrcamento = ['Orçamentos', 'Comercial'];
    const setoresFinanceiro = ['Financeiro', 'Administrativo'];

    let userSetores = [];
    if (isConnected) {
      const u = await User.findById(req.user?.email || req.user?.id || req.user?._id).lean();
      userSetores = u?.setores || [];
    }
    // admin e quem não tem setor vê tudo
    const isAdminRole = req.user?.role === 'admin';
    const semSetor = userSetores.length === 0;
    const verOrcamento = isAdminRole || semSetor || userSetores.some(s => setoresOrcamento.includes(s));
    const verFinanceiro = isAdminRole || semSetor || userSetores.some(s => setoresFinanceiro.includes(s));

    if (isConnected) {
      const medicaoIdsComOrcamento = await Orcamento.distinct('medicaoId', { medicaoId: { $ne: null } });
      const [medicoesSemOrcamento, orcamentosNaoEnviados, orcamentosAprovados, osPendentesEquipe, contratosPendentes] = await Promise.all([
        verOrcamento  ? Medicao.countDocuments({ _id: { $nin: medicaoIdsComOrcamento } }) : Promise.resolve(0),
        verOrcamento  ? Orcamento.countDocuments({ enviadoParaCliente: { $ne: true }, status: { $nin: ['aprovado'] } }) : Promise.resolve(0),
        verFinanceiro ? Orcamento.countDocuments({ status: 'aprovado' }) : Promise.resolve(0),
        OS.countDocuments({ origem: 'contrato', pendente_equipe: true }),
        verFinanceiro ? Contrato.countDocuments({ status: { $nin: ['pendente_assinatura', 'assinado'] } }) : Promise.resolve(0),
      ]);
      return res.json({ medicoesSemOrcamento, orcamentosNaoEnviados, orcamentosAprovados, osPendentesEquipe, contratosPendentes });
    }
    // fallback memStore
    const idsComOrc = new Set(memStore.orcamentos.map(o => o.medicaoId).filter(Boolean));
    const medicoesSemOrcamento = verOrcamento  ? memStore.medicoes.filter(m => !idsComOrc.has(m._id || m.id)).length : 0;
    const orcamentosNaoEnviados  = verOrcamento  ? memStore.orcamentos.filter(o => !o.enviadoParaCliente && o.status !== 'aprovado').length : 0;
    const orcamentosAprovados    = verFinanceiro ? memStore.orcamentos.filter(o => o.status === 'aprovado').length : 0;
    const osPendentesEquipe = (memStore.os || []).filter(o => o.origem === 'contrato' && o.pendente_equipe).length;
    const contratosPendentes = verFinanceiro ? (memStore.contratos || []).filter(o => !['pendente_assinatura','assinado'].includes(o.status)).length : 0;
    res.json({ medicoesSemOrcamento, orcamentosNaoEnviados, orcamentosAprovados, osPendentesEquipe, contratosPendentes });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Push Notifications ────────────────────────────────────────────────────────
app.get('/api/push/vapid-public-key', (req, res) => {
  res.json({ key: process.env.VAPID_PUBLIC_KEY || null });
});

app.post('/api/push/subscribe', auth, async (req, res) => {
  try {
    await connectDB();
    const { subscription } = req.body;
    if (!subscription) return res.status(400).json({ error: 'subscription required' });
    const email = req.user.email;
    if (isConnected) {
      await User.findByIdAndUpdate(email, { pushSubscription: subscription });
    } else {
      const u = memStore.users.find(x => x._id === email || x.email === email);
      if (u) u.pushSubscription = subscription;
    }
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/push/unsubscribe', auth, async (req, res) => {
  try {
    await connectDB();
    const email = req.user.email;
    if (isConnected) {
      await User.findByIdAndUpdate(email, { $unset: { pushSubscription: 1 } });
    } else {
      const u = memStore.users.find(x => x._id === email || x.email === email);
      if (u) delete u.pushSubscription;
    }
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Trocar senha do próprio operador ──────────────────────────────────────────
app.patch('/api/auth/change-password', auth, async (req, res) => {
  try {
    await connectDB();
    const { senhaAtual, novaSenha } = req.body;
    if (!novaSenha || novaSenha.length < 4) return res.status(400).json({ error: 'Nova senha precisa ter ao menos 4 caracteres' });
    const email = req.user.email;
    if (!email) return res.status(400).json({ error: 'Usuário sem email no token' });
    if (isConnected) {
      const user = await User.findById(email).lean();
      if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });
      const crypto = require('crypto');
      const hashAtual = senhaAtual ? crypto.createHash('sha256').update(senhaAtual).digest('hex') : null;
      const senhaOk = user.mustChangePassword // se mustChange, aceita senha temporária sem verificar
        ? (senhaAtual === user.password || (hashAtual && hashAtual === user.password) || senhaAtual === '123456')
        : (senhaAtual === user.password || (hashAtual && hashAtual === user.password));
      if (!senhaOk) return res.status(401).json({ error: 'Senha atual incorreta' });
      const novoHash = crypto.createHash('sha256').update(novaSenha).digest('hex');
      await User.findByIdAndUpdate(email, { password: novoHash, mustChangePassword: false });
      const pic = user.picture || '';
      // Retorna novo token sem mustChangePassword
      const token = jwt.sign({ username: user.name || email, email, role: 'operador', mustChangePassword: false, picture: pic }, JWT_SECRET, { expiresIn: '24h' });
      return res.json({ success: true, token, user: { username: user.name || email, email, role: 'operador', mustChangePassword: false, picture: pic } });
    }
    // memStore fallback
    const u = memStore.users.find(x => x._id === email || x.email === email);
    if (!u) return res.status(404).json({ error: 'Usuário não encontrado' });
    const crypto = require('crypto');
    const novoHash = crypto.createHash('sha256').update(novaSenha).digest('hex');
    u.password = novoHash; u.mustChangePassword = false;
    const pic = u.picture || '';
    const token = jwt.sign({ username: u.name || email, email, role: 'operador', mustChangePassword: false, picture: pic }, JWT_SECRET, { expiresIn: '24h' });
    res.json({ success: true, token, user: { username: u.name || email, email, role: 'operador', mustChangePassword: false, picture: pic } });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Foto de perfil ────────────────────────────────────────────────────────────
app.patch('/api/auth/profile-picture', auth, async (req, res) => {
  try {
    await connectDB();
    const { picture } = req.body;
    if (!picture) return res.status(400).json({ error: 'picture required' });
    const safe = sanitizeImages({ picture }, 'profile-picture');
    const picUrl = safe.picture;
    const email = req.user.email || req.user.username;
    if (!email) return res.status(400).json({ error: 'Usuário sem email no token' });

    if (isConnected) {
      // Upsert: cria ou atualiza o campo picture no User
      await User.findByIdAndUpdate(email, { picture: picUrl }, { upsert: false, new: true });
    } else {
      const u = memStore.users.find(x => x._id === email || x.email === email);
      if (u) u.picture = picUrl;
    }
    // Retorna novo token com picture atualizado
    const payload = { ...req.user, picture: picUrl };
    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '24h' });
    const userOut = { ...(req.user || {}), picture: picUrl };
    res.json({ success: true, picture: picUrl, token, user: userOut });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Equipes Routes ────────────────────────────────────────────────────────────

app.get('/api/equipes', auth, async (req, res) => {
  try {
    await connectDB();
    if (isConnected) return res.json(await Equipe.find().sort({ createdAt: -1 }));
    res.json(memStore.equipes);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/equipes', auth, adminOnly, async (req, res) => {
  try {
    await connectDB();
    const data = { ...req.body, _id: uuidv4(), createdAt: Date.now() };
    if (isConnected) { const e = await Equipe.create(data); return res.json(e); }
    memStore.equipes.push(data);
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/equipes/:id', auth, adminOnly, async (req, res) => {
  try {
    await connectDB();
    if (isConnected) {
      const e = await Equipe.findByIdAndUpdate(req.params.id, req.body, { new: true });
      if (!e) return res.status(404).json({ error: 'Not found' });
      return res.json(e);
    }
    const e = memStore.equipes.find(x => x._id === req.params.id);
    if (!e) return res.status(404).json({ error: 'Not found' });
    Object.assign(e, req.body);
    res.json(e);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Reset senha de uma equipe para 123456 + senhaInicial: true (admin only)
app.post('/api/equipes/:id/reset-senha', auth, adminOnly, async (req, res) => {
  try {
    await connectDB();
    const hash = await bcrypt.hash('123456', 10);
    if (isConnected) {
      const e = await Equipe.findByIdAndUpdate(req.params.id, { senhaHash: hash, senhaInicial: true }, { new: true });
      if (!e) return res.status(404).json({ error: 'Equipe não encontrada' });
      return res.json({ ok: true, equipe: e.nome });
    }
    return res.status(503).json({ error: 'DB offline' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/equipes/:id', auth, adminOnly, async (req, res) => {
  await audit(req, 'delete', 'equipe', req.params.id);
  try {
    await connectDB();
    if (isConnected) { await Equipe.findByIdAndDelete(req.params.id); return res.json({ success: true }); }
    memStore.equipes = memStore.equipes.filter(x => x._id !== req.params.id);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/equipes/localizacao', auth, async (req, res) => {
  try {
    await connectDB();
    const equipes = isConnected ? await Equipe.find().lean() : memStore.equipes;
    const hoje = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

    const result = await Promise.all(equipes.map(async (eq) => {
      const equipeId = String(eq._id);
      let obraAtual = null;
      if (isConnected) {
        const os = await OS.findOne({
          $or: [
            { equipeId, status: 'em_andamento' },
            { 'equipesAtribuidas.equipeId': equipeId, status: 'em_andamento' }
          ]
        }).select('_id numero cliente endereco cidade status dataInicio tipo').lean();
        if (os) obraAtual = { osId: os._id, numero: os.numero, cliente: os.cliente, endereco: os.endereco, cidade: os.cidade, status: os.status, tipo: os.tipo || 'normal' };
      } else {
        const os = memStore.ordens.find(o => (o.equipeId === equipeId || (o.equipesAtribuidas || []).some(e => e.equipeId === equipeId)) && o.status === 'em_andamento');
        if (os) obraAtual = { osId: os._id, numero: os.numero, cliente: os.cliente, endereco: os.endereco, cidade: os.cidade, status: os.status };
      }
      return {
        equipeId,
        equipeNome: eq.nome,
        cor: eq.cor,
        membros: eq.membros || [],
        obraAtual
      };
    }));

    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ── Dashboard Stats ───────────────────────────────────────────────────────────
app.get('/api/dashboard/stats', auth, async (req, res) => {
  try {
    await connectDB();
    const { start, end } = req.query;

    // Período atual
    const startTs = start ? new Date(start + 'T00:00:00').getTime() : (Date.now() - 7 * 24 * 3600 * 1000);
    const endTs   = end   ? new Date(end   + 'T23:59:59').getTime() : Date.now();

    // Período anterior com mesma duração (para comparativo)
    const duration   = endTs - startTs;
    const prevStartTs = startTs - duration - 1;
    const prevEndTs   = startTs - 1;

    const inPeriod     = ts => ts >= startTs && ts <= endTs;
    const inPrevPeriod = ts => ts >= prevStartTs && ts <= prevEndTs;

    if (isConnected) {
      const [medAll, orcAll, ctAll, osAll] = await Promise.all([
        Medicao.find({  createdAt: { $gte: prevStartTs, $lte: endTs } }).select('-fotos -pontos').lean(),
        Orcamento.find({ createdAt: { $gte: prevStartTs, $lte: endTs } }).select('status createdAt cliente numero').lean(),
        Contrato.find({  createdAt: { $gte: prevStartTs, $lte: endTs } }).select('status createdAt cliente numero').lean(),
        OS.find({        createdAt: { $gte: prevStartTs, $lte: endTs } }).select('status tipo createdAt consumoProduto totalConsumoReal consumosDiarios equipeNome cliente numero').lean(),
      ]);

      const med     = medAll.filter(x => inPeriod(x.createdAt));
      const medPrev = medAll.filter(x => inPrevPeriod(x.createdAt));
      const orc     = orcAll.filter(x => inPeriod(x.createdAt));
      const orcPrev = orcAll.filter(x => inPrevPeriod(x.createdAt));
      const ct      = ctAll.filter(x => inPeriod(x.createdAt));
      const ctPrev  = ctAll.filter(x => inPrevPeriod(x.createdAt));

      const osNorm     = osAll.filter(x => inPeriod(x.createdAt)     && (x.tipo || 'normal') === 'normal');
      const osRep      = osAll.filter(x => inPeriod(x.createdAt)     && x.tipo === 'reparo');
      const osNormPrev = osAll.filter(x => inPrevPeriod(x.createdAt) && (x.tipo || 'normal') === 'normal');
      const osRepPrev  = osAll.filter(x => inPrevPeriod(x.createdAt) && x.tipo === 'reparo');

      // Consumo de produto — todas OS (separado obras x reparos)
      // Obras: só precisam de consumoProduto (já calculado na criação)
      // Reparos: busca pontos para recalcular quando consumoProduto === 0 (dados legados)
      const CONSUMO_POR_TIPO_DASH = { trinca: 1.5, juntaDilat: 2.0, juntaFria: 1.0, ralo: 1.0, cortina: 2.0 };
      function calcConsumoFromPontos(pontos) {
        return (pontos || []).reduce((total, p) => {
          const subs = p.subPontos || [];
          if (subs.length > 0) {
            return total + subs.reduce((s, sp) => s + (sp.valor || 0) * (CONSUMO_POR_TIPO_DASH[sp.tipo] || 0), 0);
          }
          return total + (Number(p.trinca)||0)*1.5 + (Number(p.juntaDilat)||0)*2.0 +
                         (Number(p.juntaFria)||0)*1.0 + (Number(p.ralo)||0)*1.0 + (Number(p.cortina)||0)*2.0;
        }, 0);
      }

      const [osNormAll, osRepAll] = await Promise.all([
        OS.find({ $or: [{ tipo: 'normal' }, { tipo: { $exists: false } }] })
          .select('consumoProduto totalConsumoReal consumosDiarios tipo').lean(),
        OS.find({ tipo: 'reparo' })
          .select('consumoProduto totalConsumoReal consumosDiarios pontos tipo').lean(),
      ]);

      const todasOS = [...osNormAll, ...osRepAll];
      const osAtivasNorm = osNormAll;
      const osAtivasRep  = osRepAll;

      const estimadoObras  = osAtivasNorm.reduce((s, o) => s + (o.consumoProduto || 0), 0);
      const realObras      = osAtivasNorm.reduce((s, o) => s + (o.totalConsumoReal || 0), 0);
      const estimadoRep    = osAtivasRep.reduce((s, o) => {
        const est = o.consumoProduto > 0 ? o.consumoProduto : calcConsumoFromPontos(o.pontos);
        return s + est;
      }, 0);
      const realRep        = osAtivasRep.reduce((s, o) => s + (o.totalConsumoReal || 0), 0);
      const estimado       = estimadoObras + estimadoRep;
      const real           = realObras + realRep;
      const diferenca = parseFloat((real - estimado).toFixed(1));
      const variacaoPercent = estimado > 0 ? parseFloat(((real / estimado) * 100 - 100).toFixed(1)) : 0;

      // Consumo diário (do período) — separado por tipo
      const porDia = {};
      todasOS.forEach(o => {
        const tipoKey = (o.tipo || 'normal') === 'reparo' ? 'reparo' : 'obra';
        (o.consumosDiarios || []).forEach(c => {
          if (!c.data) return;
          const d = c.data;
          const dTs = new Date(d + 'T12:00:00').getTime();
          if (dTs < startTs || dTs > endTs) return;
          if (!porDia[d]) porDia[d] = { real: 0, estimado: 0, realObra: 0, realReparo: 0 };
          porDia[d].real += (c.litros || 0);
          if (tipoKey === 'reparo') porDia[d].realReparo = (porDia[d].realReparo || 0) + (c.litros || 0);
          else                      porDia[d].realObra   = (porDia[d].realObra   || 0) + (c.litros || 0);
        });
      });

      // Estimativa diária: proporção do total estimado dividida por dias do período
      const nDias = Math.max(1, Math.round((endTs - startTs) / (24 * 3600 * 1000)) + 1);
      const estimDia = parseFloat((estimado / nDias).toFixed(1));
      Object.keys(porDia).forEach(d => { porDia[d].estimado = estimDia; });

      // ── Atividade Recente: mistura de medições, OS e reparos criados no período
      const atividadeRecente = [
        ...med.map(m => ({
          tipo: 'medicao',
          titulo: `Medição - ${m.cliente || m.nomeCondominio || 'Sem nome'}`,
          subtitulo: m.endereco || '',
          status: m.status || 'recebida',
          data: m.createdAt,
          id: m._id,
        })),
        ...osNorm.map(o => ({
          tipo: 'os',
          titulo: `OS #${o.numero || ''} - ${o.cliente || o.nomeCliente || 'Sem nome'}`,
          subtitulo: o.equipeNome || '',
          status: o.status,
          data: o.createdAt,
          id: o._id,
        })),
        ...osRep.map(o => ({
          tipo: 'reparo',
          titulo: `Reparo #${o.numero || ''} - ${o.cliente || o.nomeCliente || 'Sem nome'}`,
          subtitulo: o.equipeNome || '',
          status: o.status,
          data: o.createdAt,
          id: o._id,
        })),
      ]
        .sort((a, b) => b.data - a.data)
        .slice(0, 20);

      return res.json({
        periodo: { start, end, startTs, endTs },
        medicoes: { total: med.length },
        orcamentos: {
          total:    orc.length,
          rascunho: orc.filter(o => o.status === 'rascunho').length,
          enviado:  orc.filter(o => o.status === 'enviado').length,
          aprovado: orc.filter(o => o.status === 'aprovado').length,
        },
        contratos: {
          total:     ct.length,
          rascunho:  ct.filter(c => c.status === 'rascunho').length,
          aguardando: ct.filter(c => c.status === 'aguardando_assinatura').length,
          assinado:  ct.filter(c => c.status === 'assinado').length,
        },
        ordensServico: {
          total:                osNorm.length,
          agendada:             osNorm.filter(o => o.status === 'agendada').length,
          em_andamento:         osNorm.filter(o => o.status === 'em_andamento').length,
          aguardando_assinatura:osNorm.filter(o => o.status === 'aguardando_assinatura').length,
          concluida:            osNorm.filter(o => o.status === 'concluida').length,
          cancelada:            osNorm.filter(o => o.status === 'cancelada').length,
        },
        reparos: {
          total:       osRep.length,
          agendada:    osRep.filter(o => o.status === 'agendada').length,
          em_andamento:osRep.filter(o => o.status === 'em_andamento').length,
          concluida:   osRep.filter(o => o.status === 'concluida').length,
        },
        consumoProduto: {
          estimado: parseFloat(estimado.toFixed(1)),
          real:     parseFloat(real.toFixed(1)),
          diferenca,
          variacaoPercent,
          porDia,
          obras: {
            estimado: parseFloat(estimadoObras.toFixed(1)),
            real:     parseFloat(realObras.toFixed(1)),
          },
          reparos: {
            estimado: parseFloat(estimadoRep.toFixed(1)),
            real:     parseFloat(realRep.toFixed(1)),
          },
        },
        periodoAnterior: {
          medicoes:     medPrev.length,
          orcamentos:   orcPrev.length,
          contratos:    ctPrev.length,
          ordensServico:osNormPrev.length,
          reparos:      osRepPrev.length,
          consumoReal:  parseFloat(osNormPrev.reduce((s, o) => s + (o.totalConsumoReal || 0), 0).toFixed(1)),
        },
        atividadeRecente,
      });
    }

    // ── In-memory fallback ────────────────────────────────────────────────────
    const med     = memStore.medicoes.filter(x => inPeriod(x.createdAt || 0));
    const orc     = memStore.orcamentos.filter(x => inPeriod(x.createdAt || 0));
    const ct      = memStore.contratos.filter(x => inPeriod(x.createdAt || 0));
    const osNorm  = memStore.ordens.filter(x => inPeriod(x.createdAt || 0) && (x.tipo || 'normal') === 'normal');
    const osRep   = memStore.ordens.filter(x => inPeriod(x.createdAt || 0) && x.tipo === 'reparo');
    const medPrev = memStore.medicoes.filter(x => inPrevPeriod(x.createdAt || 0));
    const orcPrev = memStore.orcamentos.filter(x => inPrevPeriod(x.createdAt || 0));
    const ctPrev  = memStore.contratos.filter(x => inPrevPeriod(x.createdAt || 0));
    const osNPrev = memStore.ordens.filter(x => inPrevPeriod(x.createdAt || 0) && (x.tipo||'normal') === 'normal');
    const osRPrev = memStore.ordens.filter(x => inPrevPeriod(x.createdAt || 0) && x.tipo === 'reparo');

    const estimadoObras = memStore.ordens.filter(x => (x.tipo||'normal') === 'normal').reduce((s,o)=>s+(o.consumoProduto||0),0);
    const realObras     = memStore.ordens.filter(x => (x.tipo||'normal') === 'normal').reduce((s,o)=>s+(o.totalConsumoReal||0),0);
    const estimadoRep   = memStore.ordens.filter(x => x.tipo === 'reparo').reduce((s,o)=>s+(o.consumoProduto||0),0);
    const realRep       = memStore.ordens.filter(x => x.tipo === 'reparo').reduce((s,o)=>s+(o.totalConsumoReal||0),0);
    const estimado      = estimadoObras + estimadoRep;
    const real          = realObras + realRep;

    res.json({
      periodo: { start, end, startTs, endTs },
      medicoes: { total: med.length },
      orcamentos: { total: orc.length, rascunho: orc.filter(o=>o.status==='rascunho').length, enviado: orc.filter(o=>o.status==='enviado').length, aprovado: orc.filter(o=>o.status==='aprovado').length },
      contratos: { total: ct.length, rascunho: ct.filter(c=>c.status==='rascunho').length, aguardando: ct.filter(c=>c.status==='aguardando_assinatura').length, assinado: ct.filter(c=>c.status==='assinado').length },
      ordensServico: { total: osNorm.length, agendada: osNorm.filter(o=>o.status==='agendada').length, em_andamento: osNorm.filter(o=>o.status==='em_andamento').length, aguardando_assinatura: osNorm.filter(o=>o.status==='aguardando_assinatura').length, concluida: osNorm.filter(o=>o.status==='concluida').length, cancelada: 0 },
      reparos: { total: osRep.length, agendada: osRep.filter(o=>o.status==='agendada').length, em_andamento: osRep.filter(o=>o.status==='em_andamento').length, concluida: osRep.filter(o=>o.status==='concluida').length },
      consumoProduto: {
        estimado: parseFloat(estimado.toFixed(1)), real: parseFloat(real.toFixed(1)),
        diferenca: parseFloat((real-estimado).toFixed(1)),
        variacaoPercent: estimado>0?parseFloat(((real/estimado)*100-100).toFixed(1)):0,
        porDia: {},
        obras:   { estimado: parseFloat(estimadoObras.toFixed(1)), real: parseFloat(realObras.toFixed(1)) },
        reparos: { estimado: parseFloat(estimadoRep.toFixed(1)),   real: parseFloat(realRep.toFixed(1))   },
      },
      periodoAnterior: { medicoes: medPrev.length, orcamentos: orcPrev.length, contratos: ctPrev.length, ordensServico: osNPrev.length, reparos: osRPrev.length, consumoReal: parseFloat(osNPrev.reduce((s,o)=>s+(o.totalConsumoReal||0),0).toFixed(1)) },
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Ordens de Serviço Routes ──────────────────────────────────────────────────

app.get('/api/ordens-servico', auth, async (req, res) => {
  try {
    await connectDB();
    const { equipeId } = req.query;
    const tipoFilter = req.query.tipo;
    const osOriginalId = req.query.osOriginalId;
    const filter = equipeId ? { equipeId } : {};
    if (tipoFilter) filter.tipo = tipoFilter;
    if (osOriginalId) filter.osOriginalId = osOriginalId;
    if (isConnected) {
      // Lista LEVE — duas queries em paralelo:
      //   1) find().select() — rápido, pega tudo SEM os campos base64 pesados
      //   2) aggregate só com _id e flag temCroqui (não carrega base64, só projeta tamanho > 0)
      // Roda em paralelo com Promise.all para minimizar latência total.
      const [oses, croquiFlags] = await Promise.all([
        OS.find(filter)
          .sort({ createdAt: -1 })
          .select('-fotosReparo -pontos.fotos -pontos.fotosAntes -pontos.fotosDepois -pontos.fotosMedicao -pontos.croquiBase64 -pontos.croquiOtimizado -fechamentosDia.fotos -pdfBase64 -contratoManualPdfBase64')
          .lean(),
        OS.aggregate([
          { $match: filter },
          { $project: {
            _id: 1,
            temCroqui: { $anyElementTrue: { $map: {
              input: { $ifNull: ['$pontos', []] },
              as: 'p',
              in: { $or: [
                { $gt: [{ $strLenCP: { $ifNull: ['$$p.croquiBase64', ''] } }, 0] },
                { $gt: [{ $strLenCP: { $ifNull: ['$$p.croquiOtimizado', ''] } }, 0] },
              ] },
            } } },
          } },
        ]),
      ]);
      const croquiMap = new Map(croquiFlags.map(c => [c._id, c.temCroqui]));
      oses.forEach(o => { o.temCroqui = croquiMap.get(o._id) || false; });
      return res.json(oses);
    }
    let list = memStore.ordens;
    if (equipeId) list = list.filter(o => o.equipeId === equipeId);
    if (tipoFilter) list = list.filter(o => (o.tipo || 'normal') === tipoFilter);
    if (osOriginalId) list = list.filter(o => o.osOriginalId === osOriginalId);
    res.json(list);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/ordens-servico', auth, async (req, res) => {
  try {
    await connectDB();
    // Número da OS = número do contrato associado (se houver)
    let numero = isConnected ? (await OS.countDocuments()) + 1 : memStore.ordens.length + 1;
    if (req.body.contratoId) {
      try {
        const ct = isConnected
          ? await Contrato.findOne({ _id: req.body.contratoId })
          : memStore.contratos.find(c => c._id === req.body.contratoId);
        if (ct?.numero) numero = ct.numero;
      } catch {}
    }
    const data = { ...req.body, _id: uuidv4(), numero, createdAt: Date.now(), updatedAt: Date.now(), ...creatorInfo(req) };

    // Try to create Google Calendar event
    if (data.dataInicio && data.equipeId) {
      try {
        const equipe = isConnected
          ? await Equipe.findById(data.equipeId)
          : memStore.equipes.find(e => e._id === data.equipeId);
        if (equipe) data.equipeNome = equipe.nome;
      } catch {}
    }

    if (isConnected) { const os = await OS.create(data); return res.json(os); }
    memStore.ordens.push(data);
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/ordens-servico/:id', auth, async (req, res) => {
  try {
    await connectDB();
    let os;
    if (isConnected) os = await OS.findOne({ _id: req.params.id }).lean();
    else os = memStore.ordens.find(x => x._id === req.params.id);
    if (!os) return res.status(404).json({ error: 'Not found' });
    // Garante que pontos tenham fotosAntes/fotosDepois inicializados e sub-pontos corretos
    if (os.pontos) os.pontos = ensureSubPontos(os.pontos);
    // DEBUG: log foto types para diagnosticar
    if (os.pontos) {
      os.pontos.forEach((p, pi) => {
        (p.fotosAntes || []).forEach((f, fi) => {
          console.log(`[DEBUG] ponto[${pi}].fotosAntes[${fi}]: type=${typeof f}, isNull=${f===null}, keys=${f && typeof f === 'object' ? Object.keys(f).join(',') : 'N/A'}, thumbLen=${f?.thumb?.length || 0}, fullLen=${f?.full?.length || 0}`);
        });
      });
    }
    res.json(os);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/ordens-servico/:id', auth, async (req, res) => {
  try {
    await connectDB();
    const updates = { ...req.body, updatedAt: Date.now() };
    // Limpa flag pendente_equipe automaticamente se uma equipe foi atribuída
    if (updates.equipeId && updates.equipeId !== '') {
      updates.pendente_equipe = false;
    }
    if (isConnected) {
      // Audit log se o número da OS for alterado
      if (typeof updates.numero === 'number') {
        const atual = await OS.findById(req.params.id).lean();
        if (atual && updates.numero !== atual.numero) {
          await audit(req, 'update-numero-os', 'ordem-servico', req.params.id, {
            de: atual.numero,
            para: updates.numero,
            cliente: atual.cliente,
          });
        }
      }
      const os = await OS.findOneAndUpdate({ _id: req.params.id }, updates, { new: true }).lean();
      if (!os) return res.status(404).json({ error: 'Not found' });
      if (os.pontos) os.pontos = ensureSubPontos(os.pontos);
      return res.json(os);
    }
    const os = memStore.ordens.find(x => x._id === req.params.id);
    if (!os) return res.status(404).json({ error: 'Not found' });
    Object.assign(os, updates);
    res.json(os);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Restaurar fotos da OS a partir do contrato/orçamento/medição ──────────────
// Necessário pra consertar OSes criadas durante a janela de bug em que a NovaOSModal
// usava api.getContratos() (listagem sem fotos por causa da otimização de payload),
// resultando em pontos[*] sem fotos. Pode ser chamado quantas vezes for preciso —
// idempotente: só preenche o que está vazio, não duplica.
app.post('/api/ordens-servico/:id/restaurar-fotos', auth, async (req, res) => {
  try {
    if (req.user?.role !== 'admin') return res.status(403).json({ error: 'admin only' });
    await connectDB();
    if (!isConnected) return res.status(500).json({ error: 'Sem conexão com banco' });

    const os = await OS.findById(req.params.id);
    if (!os) return res.status(404).json({ error: 'OS não encontrada' });

    // Tenta achar uma fonte de fotos seguindo a cadeia OS → contrato → orçamento → medição.
    // Importante: precisa testar se a fonte realmente TEM fotos, não só se tem locais.
    // Caso contrário, pega um contrato vazio e nunca chega na medição que tem as fotos.
    const temFotosUtilizaveis = src => (src?.locais || []).some(l => Array.isArray(l.fotos) && l.fotos.length > 0);

    let fonte = null;
    let fonteTipo = null;

    // 1ª tentativa: contrato
    if (os.contratoId) {
      const c = await Contrato.findById(os.contratoId).lean();
      if (temFotosUtilizaveis(c)) { fonte = c; fonteTipo = 'contrato'; }
    }

    // 2ª tentativa: orçamento (direto, ou via contrato.orcamentoId se não veio do contrato)
    if (!fonte) {
      let orcId = os.orcamentoId;
      if (!orcId && os.contratoId) {
        const c = await Contrato.findById(os.contratoId).select('orcamentoId').lean();
        orcId = c?.orcamentoId;
      }
      if (orcId) {
        const o = await Orcamento.findById(orcId).lean();
        if (temFotosUtilizaveis(o)) { fonte = o; fonteTipo = 'orcamento'; }
        // Guarda referência ao orçamento para pegar medicaoId no próximo passo
        if (!fonte && o?.medicaoId) { os._orcamentoMedicaoId = o.medicaoId; }
      }
    }

    // 3ª tentativa: medição (via orçamento.medicaoId)
    if (!fonte) {
      let medId = os._orcamentoMedicaoId;
      if (!medId) {
        const orcId = os.orcamentoId || (os.contratoId && (await Contrato.findById(os.contratoId).select('orcamentoId').lean())?.orcamentoId);
        if (orcId) {
          const o = await Orcamento.findById(orcId).select('medicaoId').lean();
          medId = o?.medicaoId;
        }
      }
      if (medId) {
        const m = await Medicao.findById(medId).lean();
        if (temFotosUtilizaveis(m)) { fonte = m; fonteTipo = 'medicao'; }
      }
    }

    if (!fonte) return res.status(404).json({ error: 'Não foi possível localizar fotos na cadeia contrato → orçamento → medição desta OS' });

    // Normaliza string para match
    const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();

    // Constrói mapa nome → fotos da fonte
    const fotosPorNome = new Map();
    (fonte.locais || []).forEach(l => {
      const fotosLocal = Array.isArray(l.fotos) ? l.fotos : [];
      if (fotosLocal.length > 0) fotosPorNome.set(norm(l.nome || l.local), fotosLocal);
    });

    if (fotosPorNome.size === 0) {
      return res.status(404).json({ error: `${fonteTipo} encontrado mas sem fotos nos locais` });
    }

    // Aplica nos pontos da OS, fazendo match por nome
    let pontosAtualizados = 0;
    let fotosAdicionadas = 0;
    const novosPontos = (os.pontos || []).map((p, pi) => {
      // Se já tem fotosMedicao, preserva
      if (Array.isArray(p.fotosMedicao) && p.fotosMedicao.length > 0) return p;

      const nomePonto = norm(p.local || p.nome);
      // Match exato → match por substring (em qualquer direção)
      let fotosFonte = fotosPorNome.get(nomePonto);
      if (!fotosFonte) {
        for (const [k, v] of fotosPorNome) {
          if (k.includes(nomePonto) || nomePonto.includes(k)) { fotosFonte = v; break; }
        }
      }
      if (!fotosFonte || fotosFonte.length === 0) return p;

      // Normaliza estrutura: aceita strings base64 e objetos { data, thumb, full }
      const fotosMedicao = fotosFonte.map((f, i) => {
        if (!f) return null;
        if (typeof f === 'string') return { data: f, id: `ref_${pi}_${i}` };
        if (typeof f === 'object') return { ...f, id: f.id || `ref_${pi}_${i}` };
        return null;
      }).filter(Boolean);

      pontosAtualizados++;
      fotosAdicionadas += fotosMedicao.length;
      return { ...(p.toObject ? p.toObject() : p), fotosMedicao };
    });

    os.pontos = novosPontos;
    os.markModified('pontos');
    os.updatedAt = Date.now();
    await os.save();

    log('info', `OS ${os.numero}: fotos restauradas de ${fonteTipo} — ${pontosAtualizados} ponto(s), ${fotosAdicionadas} foto(s)`);
    res.json({
      ok: true,
      fonte: fonteTipo,
      pontosAtualizados,
      fotosAdicionadas,
      totalPontos: novosPontos.length,
    });
  } catch (err) {
    log('error', 'ordens-servico/:id/restaurar-fotos:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/ordens-servico/:id/status', auth, async (req, res) => {
  try {
    await connectDB();
    const { status, progresso } = req.body;
    const updates = { updatedAt: Date.now() };
    if (status) updates.status = status;
    if (progresso !== undefined) updates.progresso = progresso;
    if (isConnected) {
      const os = await OS.findByIdAndUpdate(req.params.id, updates, { new: true });
      if (!os) return res.status(404).json({ error: 'Not found' });
      return res.json(os);
    }
    const os = memStore.ordens.find(x => x._id === req.params.id);
    if (!os) return res.status(404).json({ error: 'Not found' });
    Object.assign(os, updates);
    res.json(os);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Atualiza um ponto especifico da OS (status + fotos antes/depois)
app.patch('/api/ordens-servico/:id/pontos/:idx', auth, async (req, res) => {
  try {
    await connectDB();
    const { idx } = req.params;
    const { status, fotoAntes, fotoDepois, membro } = req.body;
    if (isConnected) {
      const os = await OS.findById(req.params.id);
      if (!os) return res.status(404).json({ error: 'Not found' });
      const pontos = os.pontos || [];
      if (!pontos[idx]) return res.status(404).json({ error: 'Ponto nao encontrado' });
      if (status !== undefined) pontos[idx].status = status;
      if (fotoAntes !== undefined) pontos[idx].fotoAntes = fotoAntes;
      if (fotoDepois !== undefined) pontos[idx].fotoDepois = fotoDepois;
      if (membro !== undefined) pontos[idx].membro = membro;
      pontos[idx].updatedAt = Date.now();
      // recalcula progresso
      const concluidos = pontos.filter(p => p.status === 'concluido').length;
      const progresso = pontos.length > 0 ? Math.round((concluidos / pontos.length) * 100) : 0;
      const novoStatus = progresso === 100 ? 'concluida' : progresso > 0 ? 'em_andamento' : os.status;
      const updated = await OS.findByIdAndUpdate(req.params.id, { pontos, progresso, status: novoStatus, updatedAt: Date.now() }, { new: true });
      return res.json(updated);
    }
    const os = memStore.ordens.find(x => x._id === req.params.id);
    if (!os) return res.status(404).json({ error: 'Not found' });
    if (!os.pontos?.[idx]) return res.status(404).json({ error: 'Ponto nao encontrado' });
    if (status !== undefined) os.pontos[idx].status = status;
    if (fotoAntes !== undefined) os.pontos[idx].fotoAntes = fotoAntes;
    if (fotoDepois !== undefined) os.pontos[idx].fotoDepois = fotoDepois;
    if (membro !== undefined) os.pontos[idx].membro = membro;
    os.pontos[idx].updatedAt = Date.now();
    const concluidos = os.pontos.filter(p => p.status === 'concluido').length;
    os.progresso = os.pontos.length > 0 ? Math.round((concluidos / os.pontos.length) * 100) : 0;
    if (os.progresso === 100) os.status = 'concluida';
    else if (os.progresso > 0) os.status = 'em_andamento';
    os.updatedAt = Date.now();
    res.json(os);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Sub-pontos helpers ────────────────────────────────────────────────────────

// expandSubPontos, ensureSubPontos, calcProgressoOS → importados de ./lib/helpers.js

// ── Garantia OS PDF ───────────────────────────────────────────────────────────

function buildRelatorioGarantiaOS(os, contrato) {
  const anos = contrato?.garantia || 15;
  const nOS = os.numero ? String(os.numero).padStart(4, '0') : '___';
  const cliente = os.cliente || '___';
  const endereco = os.endereco || '';
  const cidade = os.cidade || '';

  const logoImg = LOGO_B64
    ? `<img src="data:image/png;base64,${LOGO_B64}" style="max-width:240px;height:auto;display:block;margin:0 auto;" alt="Vedafácil">`
    : `<div style="font-size:28px;font-weight:900;color:#e87722;text-align:center;">VEDAFÁCIL</div>`;
  const assinaturaImg = ASSINATURA_B64
    ? `<img src="data:image/png;base64,${ASSINATURA_B64}" style="max-width:200px;height:60px;object-fit:contain;display:block;margin:0 auto;" alt="Assinatura">`
    : `<div style="height:60px;"></div>`;
  const seloSrc = anos <= 7 ? SELO7_B64 : SELO15_B64;
  const seloImg = seloSrc
    ? `<img src="data:image/png;base64,${seloSrc}" style="width:90px;height:auto;" alt="${anos} anos">`
    : `<div style="width:80px;height:80px;border-radius:50%;border:3px solid #c8942a;background:linear-gradient(135deg,#f5d060,#c8942a);display:flex;align-items:center;justify-content:center;color:white;font-weight:900;font-size:24px;">${anos}</div>`;
  const FOOTER = `<div style="text-align:center;font-size:8.5px;color:#666;margin-top:16px;padding-top:8px;border-top:1px solid #ccc;"><strong style="color:#e87722;">Eliminamos Infiltrações Sem Quebrar!</strong><br>CNPJ: 23.606.470/0001-07 &nbsp;|&nbsp; Tel.: (21) 99984-1127 / (24) 2106-1015</div>`;

  const pontos = ensureSubPontos(os.pontos || []);

  // Summary table rows
  const pontosRows = pontos.map(p => {
    const total = p.subPontos?.length || 0;
    const feitos = p.subPontos?.filter(sp => sp.feito).length || 0;
    const antesCount = p.fotosAntes?.length || 0;
    const depoisCount = p.fotosDepois?.length || 0;
    const statusBadge = p.statusLocal === 'concluido'
      ? `<span style="color:#16a34a;font-weight:bold;">✓ Concluído</span>`
      : `<span style="color:#d97706;">Em andamento</span>`;
    return `<tr>
      <td style="text-align:left;padding:5px 8px;">${p.nome || '—'}</td>
      <td style="text-align:center;padding:5px 8px;">${feitos}/${total}</td>
      <td style="text-align:center;padding:5px 8px;">${antesCount}</td>
      <td style="text-align:center;padding:5px 8px;">${depoisCount}</td>
      <td style="text-align:center;padding:5px 8px;">${statusBadge}</td>
    </tr>`;
  }).join('');

  // Photo pages — antes
  const antesPages = pontos.map(p => {
    const fotos = p.fotosAntes || [];
    if (!fotos.length) return '';
    return fotos.map((f, fi) => {
      // f pode ser objeto {thumb,full} ou string legacy — usa full para PDF
      const imgSrc = (f && typeof f === 'object') ? (f.full || f.thumb || f.data) : f;
      return `
<div style="page-break-before:always;padding:10mm 14mm 14mm;max-width:210mm;margin:0 auto;">
  ${logoImg ? `<div style="text-align:center;margin-bottom:8px;">${logoImg}</div>` : ''}
  <div style="font-size:11px;font-weight:bold;margin-bottom:4px;">📷 Foto ANTES — ${p.nome || 'Local'} (${fi + 1}/${fotos.length})</div>
  <div style="border:1px solid #ccc;padding:8px;">
    <img src="${imgSrc}" style="width:100%;max-height:200mm;object-fit:contain;" alt="">
    <div style="text-align:center;font-size:9px;color:#555;margin-top:4px;">ANTES — ${p.nome || 'Local'}</div>
  </div>
  ${FOOTER}
</div>`;
    }).join('');
  }).join('');

  // Photo pages — depois
  const depoisPages = pontos.map(p => {
    const fotos = p.fotosDepois || [];
    if (!fotos.length) return '';
    return fotos.map((f, fi) => {
      const imgSrc = (f && typeof f === 'object') ? (f.full || f.thumb || f.data) : f;
      return `
<div style="page-break-before:always;padding:10mm 14mm 14mm;max-width:210mm;margin:0 auto;">
  ${logoImg ? `<div style="text-align:center;margin-bottom:8px;">${logoImg}</div>` : ''}
  <div style="font-size:11px;font-weight:bold;margin-bottom:4px;">📷 Foto DEPOIS — ${p.nome || 'Local'} (${fi + 1}/${fotos.length})</div>
  <div style="border:1px solid #ccc;padding:8px;">
    <img src="${imgSrc}" style="width:100%;max-height:200mm;object-fit:contain;" alt="">
    <div style="text-align:center;font-size:9px;color:#555;margin-top:4px;">DEPOIS — ${p.nome || 'Local'}</div>
  </div>
  ${FOOTER}
</div>`;
    }).join('');
  }).join('');

  // ── Croqui por local ──
  const croquiPages = (os?.pontos || []).map(p => {
    const imagem = p.croquiOtimizado || p.croquiBase64;
    if (!imagem) return '';
    const src = imagem.startsWith('data:') ? imagem : `data:image/png;base64,${imagem}`;
    return `
<div style="page-break-before:always;padding:10mm 14mm 14mm;max-width:210mm;margin:0 auto;">
  <div style="text-align:center;margin-bottom:6px;">${logoImg}</div>
  <div style="font-size:11px;font-weight:bold;margin-bottom:4px;">📐 CROQUI — ${p.nome || 'Local'}${p.croquiOtimizado ? ' <span style="background:#f3e8ff;color:#7c3aed;font-size:9px;padding:1px 5px;border-radius:8px;">🤖 IA</span>' : ''}</div>
  <div style="border:1px solid #ccc;padding:6px;text-align:center;background:#fff;">
    <img src="${src}" style="max-width:100%;max-height:190mm;object-fit:contain;background:#fff;" alt="">
  </div>
  ${FOOTER}
</div>`;
  }).join('');

  const dataEmissao = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8">
<title>Garantia_OS_${nOS}_${cliente.replace(/[^a-zA-Z0-9]/g,'_')}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#222;line-height:1.7}
.pg{padding:14mm 18mm;max-width:210mm;margin:0 auto}
.title{text-align:center;font-size:20px;font-weight:900;color:#e87722;letter-spacing:2px;margin:18px 0 6px;text-transform:uppercase}
.subtitle{text-align:center;font-size:11px;color:#555;margin-bottom:18px;letter-spacing:1px}
.client-box{border:1.5px solid #e87722;border-radius:4px;padding:10px 14px;margin:14px 0;font-size:11px}
.client-box strong{color:#e87722;font-size:10px;text-transform:uppercase;letter-spacing:1px;display:block;margin-bottom:4px}
.clause{margin:10px 0;font-size:11px;text-align:justify}
.clause-num{font-weight:bold;color:#e87722}
.divider{border:none;border-top:1px solid #ddd;margin:16px 0}
.sig-block{text-align:center;margin-top:30px}
.sig-line{border-top:1px solid #333;width:280px;margin:8px auto 4px;padding-top:5px;font-size:10px;font-weight:bold}
table.sumario{width:100%;border-collapse:collapse;font-size:10px;margin:12px 0}
table.sumario th{background:#e87722;color:white;padding:5px 8px;text-align:center;font-weight:bold}
table.sumario td{border:1px solid #ddd;padding:4px 8px}
table.sumario tr:nth-child(even) td{background:#fafafa}
.download-btn{position:fixed;top:12px;right:12px;z-index:9999;background:#e87722;color:white;border:none;padding:10px 20px;font-size:14px;font-weight:700;border-radius:8px;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,0.3)}
@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}@page{margin:0;size:A4}.download-btn{display:none!important}}
</style>
</head>
<body>
<button class="download-btn" onclick="window.print()">⬇ Salvar como PDF</button>
<div class="pg">
  <div style="text-align:center;margin-bottom:8px;">${logoImg}</div>
  <div class="title">Certificado de Garantia</div>
  <div class="subtitle">Ordem de Serviço Nº ${nOS}</div>
  <hr class="divider">

  <div class="client-box">
    <strong>Cliente / Contratante</strong>
    <div><b>${cliente}</b></div>
    ${endereco ? `<div>${endereco}${cidade ? ', ' + cidade : ''}</div>` : ''}
  </div>

  <div class="clause">
    <span class="clause-num">1.</span> A empresa <strong>T. R. FERRAZ (VEDAFACIL)</strong> oferece garantia limitada por um período de
    <strong>${anos} (${extenso(anos)}) anos</strong>, nas áreas tratadas conforme Ordem de Serviço nº <strong>${nOS}</strong>,
    contada a partir da data de emissão desse certificado.
  </div>

  <div class="clause">
    <span class="clause-num">2.</span> <b>Serviços realizados:</b> Hidrojateamento, calafetação e selado de infiltrações em estrutura de concreto maciço, utilizando o método de injeção capilar química forçada com produto GVF SEAL.
  </div>

  <div class="clause">
    <span class="clause-num">3.</span> Cessa a garantia caso sejam realizadas obras posteriores ao tratamento e estas obras afetem as condições da estrutura nas regiões especificadas neste certificado.
  </div>

  <div class="clause">
    <span class="clause-num">4.</span> A garantia não cobre infiltrações em áreas não tratadas, danos causados por terceiros, alterações estruturais ou eventos de força maior.
  </div>

  <hr class="divider">
  <div style="font-weight:bold;margin-bottom:6px;font-size:11px;">Locais executados:</div>
  <table class="sumario">
    <thead>
      <tr>
        <th style="text-align:left">Local</th>
        <th>Sub-pontos (feitos/total)</th>
        <th>Fotos Antes</th>
        <th>Fotos Depois</th>
        <th>Status</th>
      </tr>
    </thead>
    <tbody>${pontosRows}</tbody>
  </table>

  <div style="display:flex;justify-content:space-between;align-items:flex-end;margin-top:24px;">
    <div><p style="font-size:10.5px;">Barra Mansa, ${dataEmissao}</p></div>
    <div style="text-align:center;">${seloImg}</div>
  </div>

  <div class="sig-block" style="margin-top:24px;">
    ${assinaturaImg}
    <div class="sig-line">Thiago Ramos Ferraz</div>
    <div style="font-size:9.5px;color:#555;">T. R. FERRAZ TECNOLOGIA EM IMPERMEABILIZAÇÃO LTDA ME</div>
    <div style="font-size:9.5px;color:#555;">CNPJ: 23.606.470/0001-07</div>
  </div>

  ${FOOTER}
</div>

${antesPages}
${depoisPages}
${croquiPages}

<script>function downloadPDF(){window.print()}</script>
</body>
</html>`;
}

app.get('/api/ordens-servico/:id/garantia', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1] || req.query.token;
  if (!token) return res.status(401).json({ error: 'Token required' });
  try { jwt.verify(token, JWT_SECRET); }
  catch { return res.status(401).json({ error: 'Invalid token' }); }
  try {
    await connectDB();
    let os;
    if (isConnected) os = await OS.findById(req.params.id).lean();
    else os = memStore.ordens?.find(x => x._id === req.params.id);
    if (!os) return res.status(404).json({ error: 'Not found' });

    // Try to load linked contrato for extra fields
    let contrato = null;
    try {
      if (os.contratoId && isConnected) contrato = await Contrato.findById(os.contratoId).lean();
      else if (os.contratoId) contrato = memStore.contratos?.find(x => String(x._id) === String(os.contratoId));
    } catch {}

    // Build contrato-like object for buildGarantiaPdfHtml (same model as aba Garantias)
    const cLike = {
      numero:        contrato?.numero || os.numOS || os.numero,
      garantia:      Number(contrato?.garantia || os.garantia) || 15,
      razaoSocial:   contrato?.razaoSocial || os.cliente || '',
      cliente:       os.cliente || '',
      endereco:      contrato?.endereco || os.endereco || '',
      bairro:        contrato?.bairro  || os.bairro  || '',
      cidade:        contrato?.cidade  || os.cidade  || '',
      estado:        contrato?.estado  || os.estado  || '',
      cep:           contrato?.cep     || os.cep     || '',
      cnpjCliente:   contrato?.cnpjCliente || '',
      foro:          contrato?.foro    || 'Barra Mansa',
      dataTermino:   contrato?.dataTermino || os.dataTermino,
      dataAssinatura: contrato?.dataAssinatura,
      locais:        contrato?.locais  || [],
      totalLiquido:  contrato?.totalLiquido || os.valorTotal || 0,
      obsGarantia:   contrato?.obsGarantia || ''
    };

    // Todos os pontos — fotos e croquis são filtrados dentro de buildGarantiaPdfHtml
    const osPontos = os.pontos || [];

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(buildGarantiaPdfHtml(cLike, osPontos));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Finalizar OS (aplicador — sem auth JWT) ───────────────────────────────────
// Recebe: { nomeResponsavel, cargoResponsavel, assinaturaBase64 }
app.patch('/api/aplicador/os/:id/finalizar', authEquipe, async (req, res) => {
  try {
    await connectDB();
    const { nomeResponsavel, cargoResponsavel, assinaturaBase64 } = req.body;

    let os;
    if (isConnected) os = await OS.findById(req.params.id);
    else os = memStore.ordens.find(x => x._id === req.params.id);
    if (!os) return res.status(404).json({ error: 'Not found' });

    const pontos = ensureSubPontos(os.pontos || []);
    const todosLocaisConcluidos = pontos.length > 0 && pontos.every(p => (p.statusLocal || p.status) === 'concluido');
    if (!todosLocaisConcluidos) {
      return res.status(400).json({ error: 'Todos os locais precisam estar concluídos antes de finalizar' });
    }

    const updates = {
      status: 'concluida',
      progresso: 100,
      concluidaEm: Date.now(),
      nomeResponsavel: nomeResponsavel || '',
      cargoResponsavel: cargoResponsavel || '',
      assinaturaResponsavel: assinaturaBase64 || '',
      updatedAt: Date.now(),
    };

    if (isConnected) {
      const updated = await OS.findByIdAndUpdate(req.params.id, updates, { new: true });
      return res.json({ success: true, status: updated.status, concluidaEm: updated.concluidaEm });
    }
    const o = memStore.ordens.find(x => x._id === req.params.id);
    Object.assign(o, updates);
    res.json({ success: true, status: o.status, concluidaEm: o.concluidaEm });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Registrar consumo de produto (aplicador — sem auth JWT) ──────────────────
app.patch('/api/aplicador/os/:id/consumo', authEquipe, async (req, res) => {
  try {
    await connectDB();
    const { litros, membro } = req.body;
    if (!litros || isNaN(parseFloat(litros))) return res.status(400).json({ error: 'Informe a quantidade em litros' });
    const entry = { data: new Date().toISOString().split('T')[0], litros: parseFloat(litros), membro: membro || '', ts: Date.now() };
    if (isConnected) {
      const os = await OS.findById(req.params.id);
      if (!os) return res.status(404).json({ error: 'Not found' });
      const novos = [...(os.consumosDiarios || []), entry];
      const total = novos.reduce((s, e) => s + (e.litros || 0), 0);
      const updated = await OS.findByIdAndUpdate(req.params.id, { consumosDiarios: novos, totalConsumoReal: total, updatedAt: Date.now() }, { new: true });
      return res.json({ success: true, consumosDiarios: updated.consumosDiarios, totalConsumoReal: updated.totalConsumoReal });
    }
    const os = memStore.ordens.find(x => x._id === req.params.id);
    if (!os) return res.status(404).json({ error: 'Not found' });
    if (!os.consumosDiarios) os.consumosDiarios = [];
    os.consumosDiarios.push(entry);
    os.totalConsumoReal = os.consumosDiarios.reduce((s, e) => s + (e.litros || 0), 0);
    res.json({ success: true, consumosDiarios: os.consumosDiarios, totalConsumoReal: os.totalConsumoReal });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Fechar Dia de Trabalho (aplicador — sem auth JWT) ────────────────────────
app.patch('/api/aplicador/os/:id/fechar-dia', authEquipe, async (req, res) => {
  try {
    await connectDB();
    const { litros, membro, injetores } = req.body;
    if (!litros || isNaN(parseFloat(litros))) return res.status(400).json({ error: 'Informe a quantidade de produto usada neste período' });
    const hoje = new Date().toISOString().split('T')[0];
    if (isConnected) {
      const os = await OS.findById(req.params.id);
      if (!os) return res.status(404).json({ error: 'Not found' });
      // Permite múltiplos períodos no mesmo dia — calcular período automaticamente
      const periodosHoje = (os.fechamentosDia || []).filter(f => f.data === hoje).length;
      const periodo = periodosHoje + 1;
      const entry = { data: hoje, litros: parseFloat(litros), membro: membro || '', ts: Date.now(), periodo };
      if (injetores && parseInt(injetores) > 0) entry.injetores = parseInt(injetores);
      const fd = [...(os.fechamentosDia || []), entry];
      const cd = [...(os.consumosDiarios || []), entry];
      const total = cd.reduce((s, e) => s + (e.litros || 0), 0);
      const updated = await OS.findByIdAndUpdate(req.params.id,
        { fechamentosDia: fd, consumosDiarios: cd, totalConsumoReal: total, updatedAt: Date.now() },
        { new: true });
      return res.json({ success: true, fechamentosDia: updated.fechamentosDia, totalConsumoReal: updated.totalConsumoReal });
    }
    const os = memStore.ordens.find(x => x._id === req.params.id);
    if (!os) return res.status(404).json({ error: 'Not found' });
    if (!os.fechamentosDia) os.fechamentosDia = [];
    const periodosHoje = os.fechamentosDia.filter(f => f.data === hoje).length;
    const periodo = periodosHoje + 1;
    const entry = { data: hoje, litros: parseFloat(litros), membro: membro || '', ts: Date.now(), periodo };
    if (injetores && parseInt(injetores) > 0) entry.injetores = parseInt(injetores);
    os.fechamentosDia.push(entry);
    if (!os.consumosDiarios) os.consumosDiarios = [];
    os.consumosDiarios.push(entry);
    os.totalConsumoReal = os.consumosDiarios.reduce((s, e) => s + (e.litros || 0), 0);
    res.json({ success: true, fechamentosDia: os.fechamentosDia, totalConsumoReal: os.totalConsumoReal });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Salvar fotos depois do reparo (aplicador — sem auth JWT) ──────────────────
app.patch('/api/aplicador/os/:id/fotos-depois-reparo', authEquipe, bigJson, async (req, res) => {
  try {
    await connectDB();
    const { fotos } = req.body; // array of base64 strings
    if (!Array.isArray(fotos)) return res.status(400).json({ error: 'fotos deve ser array' });
    const fotosData = fotos.map(f => ({ data: f }));
    if (isConnected) {
      const os = await OS.findById(req.params.id);
      if (!os) return res.status(404).json({ error: 'OS não encontrada' });
      os.fotosDepoisReparo = [...(os.fotosDepoisReparo || []), ...fotosData];
      os.updatedAt = Date.now();
      await os.save();
      return res.json({ ok: true, total: os.fotosDepoisReparo.length });
    } else {
      const idx = memStore.os.findIndex(o => o._id === req.params.id);
      if (idx === -1) return res.status(404).json({ error: 'OS não encontrada' });
      memStore.os[idx].fotosDepoisReparo = [...(memStore.os[idx].fotosDepoisReparo || []), ...fotosData];
      return res.json({ ok: true, total: memStore.os[idx].fotosDepoisReparo.length });
    }
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Alterar status da OS pelo aplicador (sem auth JWT — reabrir, etc.) ──────────
app.patch('/api/aplicador/os/:id/status', authEquipe, async (req, res) => {
  try {
    await connectDB();
    const { status } = req.body;
    const statusPermitidos = ['em_andamento', 'agendada'];
    if (!status || !statusPermitidos.includes(status)) return res.status(400).json({ error: 'Status inválido' });
    if (isConnected) {
      const updated = await OS.findByIdAndUpdate(req.params.id, { status, updatedAt: Date.now() }, { new: true });
      if (!updated) return res.status(404).json({ error: 'Not found' });
      return res.json({ success: true, status: updated.status });
    }
    const os = memStore.ordens.find(x => x._id === req.params.id);
    if (!os) return res.status(404).json({ error: 'Not found' });
    os.status = status;
    res.json({ success: true, status: os.status });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Redirecionar Equipe na OS (painel — com auth) ─────────────────────────────
app.patch('/api/ordens-servico/:id/equipe', auth, async (req, res) => {
  try {
    await connectDB();
    const { equipeId } = req.body;
    if (!equipeId) return res.status(400).json({ error: 'equipeId required' });
    let equipeNome = '';
    try {
      const eq = isConnected
        ? await Equipe.findById(equipeId)
        : memStore.equipes.find(e => (e._id || e.id) === equipeId);
      if (eq) equipeNome = eq.nome;
    } catch {}

    const agora = Date.now();

    if (isConnected) {
      // Lê OS atual para registrar equipe anterior no histórico
      const osAtual = await OS.findById(req.params.id).lean();
      if (!osAtual) return res.status(404).json({ error: 'OS not found' });

      const hist = osAtual.historicoEquipes || [];
      // Fecha entrada anterior se existir e for diferente da nova
      if (osAtual.equipeId && osAtual.equipeId !== equipeId) {
        // Verifica se já existe entrada aberta para a equipe atual
        const entradaAberta = hist.findIndex(h => h.equipeId === osAtual.equipeId && !h.ate);
        if (entradaAberta >= 0) {
          hist[entradaAberta] = { ...hist[entradaAberta], ate: agora };
        } else {
          // Cria entrada retroativa para equipe atual (caso seja a primeira troca)
          hist.push({ equipeId: osAtual.equipeId, equipeNome: osAtual.equipeNome || '', de: osAtual.createdAt || agora, ate: agora });
        }
      }
      // Abre nova entrada para a nova equipe
      const jaTemEntradaAberta = hist.some(h => h.equipeId === equipeId && !h.ate);
      if (!jaTemEntradaAberta) {
        hist.push({ equipeId, equipeNome, de: agora, ate: null });
      }

      const updated = await OS.findByIdAndUpdate(
        req.params.id,
        { equipeId, equipeNome, historicoEquipes: hist, pendente_equipe: false, updatedAt: agora },
        { new: true }
      );
      return res.json(updated);
    }

    // fallback memStore
    const os = memStore.ordens.find(x => x._id === req.params.id);
    if (!os) return res.status(404).json({ error: 'OS not found' });
    const hist = os.historicoEquipes || [];
    if (os.equipeId && os.equipeId !== equipeId) {
      const idx = hist.findIndex(h => h.equipeId === os.equipeId && !h.ate);
      if (idx >= 0) hist[idx] = { ...hist[idx], ate: agora };
      else hist.push({ equipeId: os.equipeId, equipeNome: os.equipeNome || '', de: os.createdAt || agora, ate: agora });
    }
    if (!hist.some(h => h.equipeId === equipeId && !h.ate)) {
      hist.push({ equipeId, equipeNome, de: agora, ate: null });
    }
    os.equipeId = equipeId; os.equipeNome = equipeNome; os.historicoEquipes = hist; os.updatedAt = agora;
    res.json(os);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── PDF Relatório da OS ───────────────────────────────────────────────────────

function buildOSRelatorioPdfHtml(os, contrato) {
  const fmtDate = fmtDateBR;
  const nOS = os.numero ? String(os.numero).padStart(4, '0') : '___';
  const cliente = os.cliente || '___';
  const endereco = os.endereco || '';
  const cidade = os.cidade || '';
  const garantia = contrato?.garantia || 15;
  const dataEmissao = os.concluidaEm
    ? new Date(os.concluidaEm).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
    : new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });

  const logoImg = LOGO_B64
    ? `<img src="data:image/png;base64,${LOGO_B64}" style="max-width:240px;height:auto;display:block;margin:0 auto;" alt="Vedafácil">`
    : '<div style="font-size:26px;font-weight:900;color:#e87722;text-align:center;">VEDAFÁCIL</div>';

  const FOOTER = `<div style="text-align:center;font-size:8.5px;color:#666;margin-top:14px;padding-top:8px;border-top:1px solid #ccc;">
    <strong style="color:#e87722;">Eliminamos Infiltrações Sem Quebrar!</strong>&nbsp;|&nbsp;
    CNPJ: 23.606.470/0001-07 &nbsp;|&nbsp; Tel.: (21) 99984-1127 / (24) 2106-1015
  </div>`;

  const pontos = ensureSubPontos(os.pontos || []);

  // ── Tabela de locais + sub-pontos ──
  const localRows = pontos.map(p => {
    const subs = p.subPontos || [];
    const feitos = subs.filter(sp => sp.feito).length;
    const statusBadge = (p.statusLocal || 'pendente') === 'concluido'
      ? '<span style="color:#16a34a;font-weight:bold;">✓ Concluído</span>'
      : '<span style="color:#d97706;">Em andamento</span>';
    const subsHtml = subs.map(sp => `<div style="font-size:9px;padding:1px 0;">${sp.feito ? '✅' : '⬜'} ${sp.desc}</div>`).join('');
    return `<tr>
      <td style="padding:6px 8px;font-weight:bold;vertical-align:top">${p.nome || '—'}</td>
      <td style="padding:6px 8px;font-size:9px;vertical-align:top">${subsHtml || '—'}</td>
      <td style="padding:6px 8px;text-align:center;vertical-align:top">${(p.fotosAntes||[]).length}</td>
      <td style="padding:6px 8px;text-align:center;vertical-align:top">${(p.fotosDepois||[]).length}</td>
      <td style="padding:6px 8px;text-align:center;vertical-align:top">${statusBadge}</td>
    </tr>`;
  }).join('');

  // ── Assinatura do responsável ──
  const signatarioSection = (os.nomeResponsavel || os.assinaturaResponsavel) ? `
  <div style="margin-top:20px;border:1.5px solid #e87722;border-radius:6px;padding:12px;">
    <div style="font-size:10px;font-weight:700;color:#e87722;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;">Responsável pela Liberação da Obra</div>
    <div style="display:flex;gap:20px;align-items:center;flex-wrap:wrap;">
      <div>
        <div style="font-size:11px;font-weight:bold;">${os.nomeResponsavel || ''}</div>
        <div style="font-size:10px;color:#555;">${os.cargoResponsavel || ''}</div>
        <div style="font-size:9px;color:#888;margin-top:2px;">${dataEmissao}</div>
      </div>
      ${os.assinaturaResponsavel ? `<div style="border:1px solid #ddd;border-radius:4px;padding:4px;background:#f9f9f9;">
        <img src="${os.assinaturaResponsavel}" style="max-width:180px;max-height:70px;display:block;" alt="Assinatura">
      </div>` : ''}
    </div>
  </div>` : '';

  // ── Fotos ANTES por local ──
  const antesPages = pontos.map(p => {
    const fotos = p.fotosAntes || [];
    if (!fotos.length) return '';
    return fotos.map((f, fi) => `
<div style="page-break-before:always;padding:10mm 14mm 14mm;max-width:210mm;margin:0 auto;">
  <div style="text-align:center;margin-bottom:6px;">${logoImg}</div>
  <div style="font-size:11px;font-weight:bold;margin-bottom:4px;">📷 ANTES — ${p.nome || 'Local'} (${fi + 1}/${fotos.length})</div>
  <div style="border:1px solid #ccc;padding:6px;text-align:center;">
    <img src="${f.data || f}" style="max-width:100%;max-height:190mm;object-fit:contain;" alt="">
  </div>
  ${FOOTER}
</div>`).join('');
  }).join('');

  // ── Fotos DEPOIS por local ──
  const depoisPages = pontos.map(p => {
    const fotos = p.fotosDepois || [];
    if (!fotos.length) return '';
    return fotos.map((f, fi) => `
<div style="page-break-before:always;padding:10mm 14mm 14mm;max-width:210mm;margin:0 auto;">
  <div style="text-align:center;margin-bottom:6px;">${logoImg}</div>
  <div style="font-size:11px;font-weight:bold;margin-bottom:4px;">📸 DEPOIS — ${p.nome || 'Local'} (${fi + 1}/${fotos.length})</div>
  <div style="border:1px solid #ccc;padding:6px;text-align:center;">
    <img src="${f.data || f}" style="max-width:100%;max-height:190mm;object-fit:contain;" alt="">
  </div>
  ${FOOTER}
</div>`).join('');
  }).join('');

  const progresso = calcProgressoOS(pontos);

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8">
<title>OS_${nOS}_${cliente.replace(/[^a-zA-Z0-9]/g,'_')}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#222;line-height:1.6}
.pg{padding:12mm 16mm 14mm;max-width:210mm;margin:0 auto}
.title{font-size:18px;font-weight:900;color:#e87722;text-align:center;letter-spacing:1px;margin:14px 0 4px}
.subtitle{text-align:center;font-size:11px;color:#555;margin-bottom:14px}
.divider{border:none;border-top:1px solid #ddd;margin:12px 0}
.info-grid{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin:10px 0}
.info-box{border:1px solid #e5e7eb;border-radius:4px;padding:8px 10px;font-size:10.5px}
.info-box .lbl{font-size:9px;font-weight:700;color:#e87722;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:2px}
table.locais{width:100%;border-collapse:collapse;font-size:10px;margin:10px 0}
table.locais th{background:#e87722;color:white;padding:5px 8px;text-align:center;font-weight:bold}
table.locais td{border:1px solid #ddd;vertical-align:top}
table.locais tr:nth-child(even) td{background:#fafafa}
.prog-bar{height:10px;background:#e5e7eb;border-radius:5px;overflow:hidden;margin:6px 0}
.prog-fill{height:100%;background:#16a34a;border-radius:5px}
.download-btn{position:fixed;top:12px;right:12px;z-index:9999;background:#e87722;color:white;border:none;padding:10px 20px;font-size:14px;font-weight:700;border-radius:8px;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,0.3)}
@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}@page{margin:0;size:A4}.download-btn{display:none!important}}
</style>
</head>
<body>
<button class="download-btn" onclick="window.print()">⬇ Salvar como PDF</button>
<div class="pg">
  <div style="text-align:center;margin-bottom:8px;">${logoImg}</div>
  <div class="title">Relatório de Ordem de Serviço</div>
  <div class="subtitle">Nº ${nOS} &nbsp;|&nbsp; ${os.status === 'concluida' ? '✅ Concluída' : os.status}</div>
  <hr class="divider">

  <div class="info-grid">
    <div class="info-box">
      <div class="lbl">Cliente</div>
      <div style="font-weight:bold">${cliente}</div>
      ${endereco ? `<div style="color:#555">${endereco}${cidade ? ', ' + cidade : ''}</div>` : ''}
      ${os.celular ? `<div style="color:#555">📞 ${os.celular}</div>` : ''}
    </div>
    <div class="info-box">
      <div class="lbl">Execução</div>
      <div>Equipe: <strong>${os.equipeNome || '—'}</strong></div>
      ${os.dataInicio ? `<div>Início: ${fmtDate(os.dataInicio)}</div>` : ''}
      ${os.dataTermino ? `<div>Término: ${fmtDate(os.dataTermino)}</div>` : ''}
      ${os.diasTrabalho ? `<div>Dias: ${os.diasTrabalho}</div>` : ''}
    </div>
  </div>

  <div style="margin:8px 0">
    <div style="font-size:10px;color:#555;margin-bottom:2px">Progresso: <strong>${progresso}%</strong> dos pontos executados</div>
    <div class="prog-bar"><div class="prog-fill" style="width:${progresso}%"></div></div>
  </div>

  ${os.obs ? `<div style="background:#fffbeb;border:1px solid #fde68a;border-radius:4px;padding:8px 10px;margin:8px 0;font-size:10.5px;">📝 ${os.obs}</div>` : ''}

  <div style="font-weight:bold;font-size:11px;margin:12px 0 6px;color:#1a5c9a;">Locais de Serviço</div>
  <table class="locais">
    <thead>
      <tr>
        <th style="text-align:left;width:22%">Local</th>
        <th style="text-align:left;width:38%">Pontos</th>
        <th style="width:10%">📷 Antes</th>
        <th style="width:10%">📸 Depois</th>
        <th style="width:20%">Status</th>
      </tr>
    </thead>
    <tbody>${localRows}</tbody>
  </table>

  ${signatarioSection}

  <div style="display:flex;justify-content:space-between;align-items:flex-end;margin-top:18px;">
    <div style="font-size:10.5px;">Barra Mansa, ${dataEmissao}</div>
    ${LOGO_B64 ? '' : ''}
  </div>

  ${FOOTER}
</div>

${antesPages}
${depoisPages}

<script>function downloadPDF(){window.print()}</script>
</body>
</html>`;
}

app.get('/api/ordens-servico/:id/pdf', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1] || req.query.token;
  if (!token) return res.status(401).json({ error: 'Token required' });
  try { jwt.verify(token, JWT_SECRET); }
  catch { return res.status(401).json({ error: 'Invalid token' }); }
  try {
    await connectDB();
    let os;
    if (isConnected) os = await OS.findById(req.params.id);
    else os = memStore.ordens.find(x => x._id === req.params.id);
    if (!os) return res.status(404).json({ error: 'Not found' });

    let contrato = null;
    if (os.contratoId) {
      if (isConnected) contrato = await Contrato.findOne({ _id: os.contratoId });
      else contrato = memStore.contratos.find(x => x._id === os.contratoId);
    }

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(buildOSRelatorioPdfHtml(os.toObject ? os.toObject() : os, contrato));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Seed equipes padrão A/B/C/D e adiciona senha a equipes sem senha
async function seedEquipesPadrao() {
  const SENHA_PADRAO = '123456';
  const hash = await bcrypt.hash(SENHA_PADRAO, 10);

  // Cria Equipes A/B/C/D se não existirem
  const defaults = [
    { nome: 'Equipe A', cor: '#e87722', membros: [] },
    { nome: 'Equipe B', cor: '#1a5c9a', membros: [] },
    { nome: 'Equipe C', cor: '#16a34a', membros: [] },
    { nome: 'Equipe D', cor: '#7c3aed', membros: [] },
  ];
  for (const d of defaults) {
    const existe = await Equipe.findOne({ nome: d.nome });
    if (!existe) {
      await Equipe.create({ ...d, senhaHash: hash, senhaInicial: true, ativa: true });
      log('info', `Equipe padrão criada: ${d.nome}`);
    }
  }

  // Garante senha em todas as equipes que ainda não têm senhaHash
  const semSenha = await Equipe.countDocuments({ $or: [{ senhaHash: { $exists: false } }, { senhaHash: null }, { senhaHash: '' }] });
  if (semSenha > 0) {
    await Equipe.updateMany(
      { $or: [{ senhaHash: { $exists: false } }, { senhaHash: null }, { senhaHash: '' }] },
      { $set: { senhaHash: hash, senhaInicial: true } }
    );
    log('info', `${semSenha} equipe(s) sem senha receberam senha padrão`);
  }
}

// API publica para o aplicador (sem auth JWT — usa equipeId + membro como identificacao)
app.get('/api/aplicador/equipes', async (req, res) => {
  try {
    await connectDB();
    if (isConnected) {
      await seedEquipesPadrao();
      return res.json(await Equipe.find({ ativa: true }).select('_id nome membros emailGmail cor'));
    }
    res.json(memStore.equipes.filter(e => e.ativa !== false));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Login do aplicador com senha
// Reset de todas as senhas para 123456 (admin only)
app.post('/api/equipes/reset-all-senhas', auth, adminOnly, async (req, res) => {
  try {
    await connectDB();
    if (!isConnected) return res.status(503).json({ error: 'DB offline' });
    const hash = await bcrypt.hash('123456', 10);
    const result = await Equipe.updateMany({}, { senhaHash: hash, senhaInicial: true });
    res.json({ ok: true, atualizadas: result.modifiedCount });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Login master — admin visualiza como uma equipe específica
app.post('/api/aplicador/auth/master-login', loginLimiter, async (req, res) => {
  try {
    await connectDB();
    const { masterPassword, equipeId } = req.body || {};
    if (!equipeId) return res.status(400).json({ error: 'equipeId obrigatório' });

    // Aceita DOIS modos de autenticação:
    //  1) Senha master no body (1ª autenticação)
    //  2) JWT master válido no header Authorization (troca de equipe sem redigitar senha)
    let autenticado = false;

    // Modo 2: tenta validar o JWT do header (caso o frontend já tenha sessão master)
    const authHeader = req.headers.authorization || '';
    if (authHeader.startsWith('Bearer ')) {
      try {
        const decoded = jwt.verify(authHeader.slice(7), JWT_SECRET);
        // Só aceita se for um token com masterMode (não um token de equipe comum)
        if (decoded && decoded.masterMode === true && decoded.role === 'admin') {
          autenticado = true;
        }
      } catch { /* token inválido — cai pro modo 1 */ }
    }

    // Modo 1: valida senha master se ainda não autenticado pelo JWT
    if (!autenticado) {
      if (!masterPassword) return res.status(400).json({ error: 'masterPassword obrigatório' });
      // .trim() defensivo: env vars do Vercel podem vir com \n no final
      const expectedPass = (ADMIN_PASSWORD || '').trim();
      if (String(masterPassword).trim() !== expectedPass) {
        return res.status(401).json({ error: 'Senha master incorreta' });
      }
      autenticado = true;
    }

    // Busca a equipe
    const equipe = isConnected
      ? await Equipe.findById(equipeId).lean()
      : memStore.equipes.find(e => e._id === equipeId);
    if (!equipe) return res.status(404).json({ error: 'Equipe não encontrada' });
    // Emite JWT de admin com equipeId selecionada (sempre, mesmo na troca de equipe — atualiza equipeId)
    const token = jwt.sign({ role: 'admin', masterMode: true, equipeId: String(equipe._id), equipeNome: equipe.nome, username: 'master' }, JWT_SECRET, { expiresIn: '24h' });
    res.json({ ok: true, masterMode: true, token, equipe: { _id: equipe._id, nome: equipe.nome, cor: equipe.cor } });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/aplicador/auth/login', loginLimiter, async (req, res) => {
  try {
    await connectDB();
    const { equipeId, senha } = req.body || {};
    if (!equipeId || !senha) return res.status(400).json({ error: 'equipeId e senha obrigatórios' });
    let equipe;
    if (isConnected) equipe = await Equipe.findById(equipeId);
    else equipe = memStore.equipes.find(e => e._id === equipeId);
    if (!equipe) return res.status(404).json({ error: 'Equipe não encontrada' });
    if (!equipe.senhaHash) return res.status(401).json({ error: 'Equipe sem senha configurada' });
    const ok = await bcrypt.compare(senha, equipe.senhaHash);
    if (!ok) return res.status(401).json({ error: 'Senha incorreta' });
    // Emite JWT da equipe
    const token = jwt.sign({ role: 'equipe', equipeId: String(equipe._id), equipeNome: equipe.nome }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ ok: true, token, senhaInicial: !!equipe.senhaInicial });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Troca de senha do aplicador
app.post('/api/aplicador/auth/change-password', loginLimiter, async (req, res) => {
  try {
    await connectDB();
    const { equipeId, senhaAtual, novaSenha } = req.body || {};
    if (!equipeId || !senhaAtual || !novaSenha) return res.status(400).json({ error: 'Dados incompletos' });
    if (novaSenha.length < 6) return res.status(400).json({ error: 'A nova senha deve ter pelo menos 6 caracteres' });
    if (!isConnected) return res.status(503).json({ error: 'Sem conexão com banco de dados' });
    const equipe = await Equipe.findById(equipeId);
    if (!equipe) return res.status(404).json({ error: 'Equipe não encontrada' });
    const ok = await bcrypt.compare(senhaAtual, equipe.senhaHash);
    if (!ok) return res.status(401).json({ error: 'Senha atual incorreta' });
    equipe.senhaHash = await bcrypt.hash(novaSenha, 10);
    equipe.senhaInicial = false;
    await equipe.save();
    // Emite novo token após troca
    const token = jwt.sign({ role: 'equipe', equipeId: String(equipe._id), equipeNome: equipe.nome }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ ok: true, token });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Diagnóstico de croquis (temporário) ──────────────────────────────────────
app.get('/api/croquis/diagnostico', auth, async (req, res) => {
  try {
    await connectDB();
    if (!isConnected) return res.json({ error: 'DB not connected' });
    const totalOS = await OS.countDocuments();
    const comPontos = await OS.countDocuments({ pontos: { $exists: true, $not: { $size: 0 } } });
    const comCroquiBase64 = await OS.countDocuments({ 'pontos.croquiBase64': { $exists: true, $nin: [null, ''] } });
    const comCroquiOtimizado = await OS.countDocuments({ 'pontos.croquiOtimizado': { $exists: true, $nin: [null, ''] } });
    // Pega um sample de OS com pontos para ver as chaves disponíveis
    const sample = await OS.findOne({ pontos: { $exists: true, $not: { $size: 0 } } }, { 'pontos': 1, numero: 1 }).lean();
    const samplePontoKeys = sample ? Object.keys((sample.pontos||[])[0] || {}) : [];
    const sampleCroquiBase64 = sample ? (sample.pontos||[]).map(p => ({
      nome: p.nome,
      hasCroquiBase64: !!(p.croquiBase64),
      croquiBase64Type: typeof p.croquiBase64,
      croquiBase64Len: p.croquiBase64 ? String(p.croquiBase64).length : 0,
      hasCroquiOtimizado: !!(p.croquiOtimizado),
    })) : [];
    res.json({ totalOS, comPontos, comCroquiBase64, comCroquiOtimizado, sampleOsNumero: sample?.numero, samplePontoKeys, samplePontos: sampleCroquiBase64 });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Listar todos os croquis (para a página de croquis no painel) ──────────────
app.get('/api/croquis', auth, async (req, res) => {
  try {
    await connectDB();
    let result = [];

    if (isConnected) {
      // Busca OS que tenham pelo menos um ponto com croqui salvo
      // Usa projeção por dot-notation para NÃO carregar fotos (que são base64 enormes)
      const totalOS = await OS.countDocuments();
      const comCroqui = await OS.countDocuments({ 'pontos.croquiBase64': { $exists: true, $nin: [null, ''] } });
      const comCroquiOtimizado = await OS.countDocuments({ 'pontos.croquiOtimizado': { $exists: true, $nin: [null, ''] } });
      log('info', `Croquis: ${totalOS} OS total, ${comCroqui} com croquiBase64, ${comCroquiOtimizado} com croquiOtimizado`);

      const osList = await OS.find(
        { $or: [
          { 'pontos.croquiBase64': { $exists: true, $nin: [null, ''] } },
          { 'pontos.croquiOtimizado': { $exists: true, $nin: [null, ''] } },
        ] },
        {
          numero: 1, cliente: 1, endereco: 1, bairro: 1, cidade: 1,
          status: 1, tipo: 1, equipeNome: 1, dataInicio: 1, createdAt: 1,
          'pontos.nome': 1,
          'pontos.croquiBase64': 1,
          'pontos.croquiOtimizado': 1,
          'pontos.updatedAt': 1,
        }
      ).lean();

      log('info', `Croquis: ${osList.length} OS retornadas pelo find`);

      for (const os of osList) {
        (os.pontos || []).forEach((p, idx) => {
          const imagem = p.croquiOtimizado || p.croquiBase64;
          if (!imagem) return;
          if (typeof imagem === 'string' && (imagem.includes('IMAGEM_MUITO_GRANDE') || imagem.length < 50)) return;
          result.push({
            osId:       os._id,
            osNumero:   os.numero,
            osCliente:  os.cliente,
            osEndereco: os.endereco,
            osBairro:   os.bairro   || '',
            osCidade:   os.cidade   || '',
            osStatus:   os.status,
            osTipo:     os.tipo || 'normal',
            osEquipe:   os.equipeNome || '',
            osData:     os.dataInicio || os.createdAt || 0,
            pontoIdx:   idx,
            pontoNome:  p.nome || `Local ${idx + 1}`,
            imagem,
            otimizado:  !!p.croquiOtimizado,
            updatedAt:  p.updatedAt || 0,
          });
        });
      }

      log('info', `Croquis: ${result.length} croquis encontrados`);
    } else {
      // memStore fallback — also check for croquiOtimizado
      for (const os of memStore.ordens) {
        (os.pontos || []).forEach((p, idx) => {
          const imagem = p.croquiOtimizado || p.croquiBase64;
          if (!imagem) return;
          result.push({
            osId: os._id, osNumero: os.numero, osCliente: os.cliente,
            osEndereco: os.endereco, osBairro: os.bairro || '', osCidade: os.cidade || '',
            osStatus: os.status, osTipo: os.tipo || 'normal', osEquipe: os.equipeNome || '',
            osData: os.dataInicio || os.createdAt || 0, pontoIdx: idx,
            pontoNome: p.nome || `Local ${idx + 1}`, imagem,
            otimizado: !!p.croquiOtimizado, updatedAt: p.updatedAt || 0,
          });
        });
      }
    }

    // ordenar do mais recente para o mais antigo
    result.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    // Cache-Control: no-store para evitar que o browser sirva resposta antiga
    res.set('Cache-Control', 'no-store');
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/aplicador/os', authEquipe, async (req, res) => {
  try {
    await connectDB();
    const { equipeId, historico } = req.query;
    if (!equipeId) return res.status(400).json({ error: 'equipeId required' });
    if (historico === '1') {
      // Histórico: concluídas do mês atual
      const inicioMes = new Date(); inicioMes.setDate(1); inicioMes.setHours(0,0,0,0);
      const filter = { equipeId, status: 'concluida', concluidaEm: { $gte: inicioMes.getTime() } };
      if (isConnected) return res.json(await OS.find(filter).sort({ concluidaEm: -1 }));
      return res.json(memStore.ordens.filter(o => o.equipeId === equipeId && o.status === 'concluida' && (o.concluidaEm||0) >= inicioMes.getTime()));
    }
    const statusAtivos = ['agendada', 'em_andamento', 'aguardando_assinatura'];
    const filter = { equipeId, status: { $in: statusAtivos } };
    if (isConnected) return res.json(await OS.find(filter).sort({ dataInicio: 1 }));
    res.json(memStore.ordens.filter(o => o.equipeId === equipeId && statusAtivos.includes(o.status)));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Listar OS compartilhadas com uma equipe ───────────────────────────────────
// IMPORTANT: must be before /:id so Express doesn't capture 'compartilhadas' as an id
app.get('/api/aplicador/os/compartilhadas', authEquipe, async (req, res) => {
  try {
    await connectDB();
    const { equipeId } = req.query;
    if (!equipeId) return res.status(400).json({ error: 'equipeId required' });

    if (isConnected) {
      const osList = await OS.find({
        'equipesAtribuidas.equipeId': equipeId,
        status: { $in: ['agendada', 'em_andamento', 'aguardando_assinatura', 'concluida'] }
      }).sort({ dataInicio: 1 }).lean();
      return res.json(osList.map(o => ({ ...o, pontos: ensureSubPontos(o.pontos || []) })));
    }
    const filtered = memStore.ordens.filter(o =>
      Array.isArray(o.equipesAtribuidas) && o.equipesAtribuidas.some(e => e.equipeId === equipeId)
    );
    res.json(filtered);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Histórico de reparos de uma OS original ────────────────────────────────
// IMPORTANT: must be before /:id so Express doesn't capture 'historico-reparos' as an id
app.get('/api/aplicador/os/historico-reparos', authEquipe, async (req, res) => {
  try {
    await connectDB();
    const { osOriginalId } = req.query;
    if (!osOriginalId) return res.status(400).json({ error: 'osOriginalId required' });
    let reparos;
    if (isConnected) {
      reparos = await OS.find({ osOriginalId, tipo: 'reparo' }).sort({ createdAt: 1 }).lean();
    } else {
      reparos = (memStore.ordens || []).filter(o => o.osOriginalId === osOriginalId && o.tipo === 'reparo');
    }
    // Retorna resumo leve (sem pontos completos) para não sobrecarregar
    res.json(reparos.map(r => ({
      _id: r._id,
      numero: r.numero,
      status: r.status,
      equipeNome: r.equipeNome,
      equipeOriginalNome: r.equipeOriginalNome,
      dataInicio: r.dataInicio,
      concluidaEm: r.concluidaEm,
      tipoReparo: r.tipoReparo,
      progresso: r.progresso,
      createdAt: r.createdAt,
    })));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/aplicador/os/:id', authEquipe, async (req, res) => {
  try {
    await connectDB();
    let os;
    if (isConnected) os = await OS.findById(req.params.id);
    else os = memStore.ordens.find(x => x._id === req.params.id);
    if (!os) return res.status(404).json({ error: 'Not found' });
    const osPojo = os.toObject ? os.toObject() : { ...os };
    osPojo.pontos = ensureSubPontos(osPojo.pontos);
    res.json(osPojo);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Action-based PATCH for aplicador pontos
// actions: add_foto_antes | add_foto_depois | remove_foto_antes | remove_foto_depois | toggle_subponto | iniciar | concluir
app.patch('/api/aplicador/os/:id/pontos/:idx', authEquipe, bigJson, async (req, res) => {
  try {
    await connectDB();
    const idx = Number(req.params.idx);
    const { action, foto, spIdx, membro } = req.body;

    let os, pontos;
    if (isConnected) {
      os = await OS.findById(req.params.id);
      if (!os) return res.status(404).json({ error: 'Not found' });
      pontos = ensureSubPontos(os.pontos || []);
    } else {
      os = memStore.ordens.find(x => x._id === req.params.id);
      if (!os) return res.status(404).json({ error: 'Not found' });
      pontos = ensureSubPontos(os.pontos || []);
    }

    if (!pontos[idx]) return res.status(404).json({ error: 'Ponto nao encontrado' });
    const p = pontos[idx];

    if (action === 'add_foto_antes') {
      if (!foto) return res.status(400).json({ error: 'foto required' });
      const safeAntes = sanitizeImages({ foto }, `ponto[${idx}].fotosAntes`);
      p.fotosAntes.push(safeAntes.foto);
    } else if (action === 'add_foto_depois') {
      if (!foto) return res.status(400).json({ error: 'foto required' });
      const safeDepois = sanitizeImages({ foto }, `ponto[${idx}].fotosDepois`);
      p.fotosDepois.push(safeDepois.foto);
    } else if (action === 'remove_foto_antes') {
      const fi = req.body.fi;
      if (fi === undefined || fi < 0 || fi >= (p.fotosAntes||[]).length) return res.status(400).json({ error: 'fi invalido' });
      p.fotosAntes.splice(fi, 1);
    } else if (action === 'remove_foto_depois') {
      const fi = req.body.fi;
      if (fi === undefined || fi < 0 || fi >= (p.fotosDepois||[]).length) return res.status(400).json({ error: 'fi invalido' });
      p.fotosDepois.splice(fi, 1);
    } else if (action === 'toggle_subponto') {
      if (spIdx === undefined || !p.subPontos[spIdx]) return res.status(400).json({ error: 'spIdx invalid' });
      const novoFeito = !p.subPontos[spIdx].feito;
      p.subPontos[spIdx].feito = novoFeito;
      if (novoFeito) {
        // Registra quem executou e quando
        p.subPontos[spIdx].executadoEm            = new Date().toISOString().split('T')[0];
        p.subPontos[spIdx].executadoPorEquipeId    = os.equipeId   || '';
        p.subPontos[spIdx].executadoPorEquipeNome  = os.equipeNome || '';
        p.subPontos[spIdx].executadoPorMembro      = membro        || '';
      } else {
        // Limpa rastreio ao desmarcar
        p.subPontos[spIdx].executadoEm           = null;
        p.subPontos[spIdx].executadoPorEquipeId   = null;
        p.subPontos[spIdx].executadoPorEquipeNome = null;
        p.subPontos[spIdx].executadoPorMembro     = null;
      }
    } else if (action === 'iniciar') {
      if (p.fotosAntes.length === 0) return res.status(400).json({ error: 'Adicione fotos ANTES para iniciar' });
      p.statusLocal = 'em_andamento';
      if (membro) p.membro = membro;
    } else if (action === 'concluir') {
      const osIsReparo = (os.tipo || 'normal') === 'reparo';
      // Reparo exige foto antes; obra normal exige foto depois
      if (osIsReparo && p.fotosAntes.length === 0) return res.status(400).json({ error: 'Adicione a foto do reparo antes de concluir' });
      if (!osIsReparo && p.fotosDepois.length === 0) return res.status(400).json({ error: 'Adicione fotos DEPOIS para concluir' });
      if (p.subPontos.length > 0 && !p.subPontos.every(sp => sp.feito)) {
        return res.status(400).json({ error: 'Conclua todos os sub-pontos antes de finalizar' });
      }
      p.statusLocal = 'concluido';
      p.status = 'concluido';
    } else if (action === 'reabrir') {
      // Reabre um local concluído para edição
      p.statusLocal = 'em_andamento';
      p.status = 'em_andamento';
    } else if (action === 'save_obs') {
      const { obs } = req.body;
      p.obs = typeof obs === 'string' ? obs : '';
    } else if (action === 'save_croqui') {
      const { croquiBase64, otimizado } = req.body;
      if (!croquiBase64) return res.status(400).json({ error: 'croquiBase64 required' });
      const safeCroqui = sanitizeImages({ croquiBase64 }, `ponto[${idx}].croquiBase64`);
      if (safeCroqui.croquiBase64 && safeCroqui.croquiBase64.includes('IMAGEM_MUITO_GRANDE')) {
        log('warn', `Croqui rejeitado por tamanho excessivo — OS ${req.params.id} ponto ${idx}`);
        return res.status(400).json({ error: 'Imagem muito grande. Tente limpar parte do desenho ou use qualidade menor.' });
      }
      p.croquiBase64 = safeCroqui.croquiBase64;
      p.croquiStatus = otimizado ? 'ia' : 'manual';
      if (otimizado) {
        p.croquiOtimizado = safeCroqui.croquiBase64;
      } else {
        p.croquiOtimizado = null; // limpa versão IA antiga ao salvar manualmente
      }
      log('info', `save_croqui: OS ${req.params.id} ponto ${idx} salvo (${Math.round((safeCroqui.croquiBase64?.length||0)*0.75/1024)}KB, otimizado=${!!otimizado})`);
    } else {
      return res.status(400).json({ error: 'action invalida' });
    }
    p.updatedAt = Date.now();
    pontos[idx] = p;

    const progresso = calcProgressoOS(pontos);
    const todosLocaisConcluidos = pontos.length > 0 && pontos.every(pt => (pt.statusLocal || pt.status) === 'concluido');
    const algumIniciado = pontos.some(pt => (pt.statusLocal || pt.status) !== 'pendente' || (pt.subPontos||[]).some(sp => sp.feito));
    const jaAssinada = os.status === 'concluida';
    const osIsReparo = (os.tipo || 'normal') === 'reparo';
    // Reparo → concluída diretamente quando todos locais prontos (sem etapa de assinatura)
    // Obra normal → aguardando_assinatura para colher assinatura
    const novoStatusOS = jaAssinada ? 'concluida'
      : todosLocaisConcluidos ? (osIsReparo ? 'concluida' : 'aguardando_assinatura')
      : (algumIniciado || os.status === 'em_andamento') ? 'em_andamento'
      : os.status;

    if (isConnected) {
      const updated = await OS.findByIdAndUpdate(
        req.params.id,
        { pontos, progresso, status: novoStatusOS, updatedAt: Date.now() },
        { new: true }
      );
      const updPojo = updated.toObject();
      updPojo.pontos = ensureSubPontos(updPojo.pontos);
      return res.json({ success: true, ponto: updPojo.pontos[idx], progresso: updated.progresso, status: updated.status });
    }
    os.pontos = pontos;
    os.progresso = progresso;
    os.status = novoStatusOS;
    os.updatedAt = Date.now();
    res.json({ success: true, ponto: pontos[idx], progresso, status: novoStatusOS });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Lixeira endpoints (admin only) ───────────────────────────────────────────

app.get('/api/lixeira', auth, adminOnly, async (req, res) => {
  try {
    await connectDB();
    if (isConnected) {
      // Exclui o campo `dados` (base64 pesado) da listagem — só carrega ao restaurar
      const itens = await Lixeira.find({}, { dados: 0 })
        .sort({ deletadoEm: -1 })
        .allowDiskUse(true)
        .lean();
      return res.json(itens);
    }
    res.json([...memStore.lixeira].sort((a, b) => b.deletadoEm - a.deletadoEm));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/lixeira/:id/restaurar', auth, adminOnly, async (req, res) => {
  try {
    await connectDB();
    let item;
    if (isConnected) {
      item = await Lixeira.findOne({ _id: req.params.id }).lean();
    } else {
      item = memStore.lixeira.find(x => x._id === req.params.id);
    }
    if (!item) return res.status(404).json({ error: 'Item não encontrado na lixeira' });

    const doc = item.dados;

    // Restaura na coleção original
    if (isConnected) {
      switch (item.tipo) {
        case 'medicao':   await Medicao.create(doc);  break;
        case 'orcamento': await Orcamento.create(doc); break;
        case 'contrato':  await Contrato.create(doc);  break;
        case 'os':        await OS.create(doc);        break;
        default: return res.status(400).json({ error: 'Tipo desconhecido: ' + item.tipo });
      }
      await Lixeira.findOneAndDelete({ _id: req.params.id });
    } else {
      switch (item.tipo) {
        case 'medicao':   memStore.medicoes.push(doc);  break;
        case 'orcamento': memStore.orcamentos.push(doc); break;
        case 'contrato':  memStore.contratos.push(doc);  break;
        case 'os':        memStore.ordens.push(doc);     break;
      }
      memStore.lixeira = memStore.lixeira.filter(x => x._id !== req.params.id);
    }

    res.json({ success: true, tipo: item.tipo, identificacao: item.identificacao });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/lixeira/:id', auth, adminOnly, async (req, res) => {
  await audit(req, 'permanent-delete', 'lixeira', req.params.id);
  try {
    await connectDB();
    if (isConnected) {
      await Lixeira.findOneAndDelete({ _id: req.params.id });
    } else {
      memStore.lixeira = memStore.lixeira.filter(x => x._id !== req.params.id);
    }
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Compartilhar pontos de OS com outra equipe ────────────────────────────────
app.post('/api/aplicador/os/:id/compartilhar', authEquipe, async (req, res) => {
  try {
    await connectDB();
    const { equipeId, equipeNome, pontos } = req.body; // pontos: [Number] — índices dos pontos
    if (!equipeId || !Array.isArray(pontos) || pontos.length === 0)
      return res.status(400).json({ error: 'equipeId e pontos obrigatórios' });

    let os;
    if (isConnected) os = await OS.findOne({ _id: req.params.id });
    else os = memStore.ordens.find(x => x._id === req.params.id);
    if (!os) return res.status(404).json({ error: 'OS não encontrada' });

    const osPojo = os.toObject ? os.toObject() : { ...os };
    const equipesAtribuidas = osPojo.equipesAtribuidas || [];

    // Verificar se já existe atribuição para esta equipe
    const existIdx = equipesAtribuidas.findIndex(e => e.equipeId === equipeId);
    if (existIdx >= 0) {
      // Atualizar pontos existentes (union)
      const novosIdxs = new Set([...equipesAtribuidas[existIdx].pontos, ...pontos]);
      equipesAtribuidas[existIdx].pontos = [...novosIdxs];
    } else {
      equipesAtribuidas.push({ equipeId, equipeNome: equipeNome || '', pontos, status: 'pendente', pontosExecutados: [] });
    }

    if (isConnected) {
      await OS.findOneAndUpdate({ _id: req.params.id }, { equipesAtribuidas, updatedAt: Date.now() });
    } else {
      const idx = memStore.ordens.findIndex(x => x._id === req.params.id);
      if (idx >= 0) memStore.ordens[idx].equipesAtribuidas = equipesAtribuidas;
    }

    res.json({ success: true, equipesAtribuidas });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Desempenho de equipe ──────────────────────────────────────────────────────
app.get('/api/equipes/desempenho', auth, async (req, res) => {
  try {
    await connectDB();
    const { equipeId, inicio, fim } = req.query;
    if (!equipeId) return res.status(400).json({ error: 'equipeId required' });

    const dtInicio = inicio ? new Date(inicio + 'T00:00:00').getTime() : 0;
    const dtFim    = fim    ? new Date(fim    + 'T23:59:59').getTime() : Date.now();

    let osList = [], osListCausados = [];
    if (isConnected) {
      osList = await OS.find({
        equipeId,
        $or: [{ status: 'concluida' }, { status: 'em_andamento' }],
        createdAt: { $gte: dtInicio, $lte: dtFim }
      }).lean();
      // Reparos causados pela equipe (ela era a original)
      osListCausados = await OS.find({
        equipeOriginalId: equipeId,
        tipo: 'reparo',
        createdAt: { $gte: dtInicio, $lte: dtFim }
      }).lean();
    } else {
      osList = memStore.ordens.filter(o => o.equipeId === equipeId &&
        (o.status === 'concluida' || o.status === 'em_andamento') &&
        (o.createdAt || 0) >= dtInicio && (o.createdAt || 0) <= dtFim);
      osListCausados = memStore.ordens.filter(o => o.equipeOriginalId === equipeId &&
        o.tipo === 'reparo' &&
        (o.createdAt || 0) >= dtInicio && (o.createdAt || 0) <= dtFim);
    }

    // Calcular métricas
    let totalSubPontos = 0, totalFeitos = 0, totalMetragem = 0, consumoEstim = 0, consumoReal = 0, totalReparos = 0;
    const detalhes = osList.map(os => {
      const pts = ensureSubPontos(os.pontos || []);
      let subTotal = 0, subFeitos = 0, metragem = 0;
      pts.forEach(p => {
        subTotal += (p.subPontos || []).length;
        subFeitos += (p.subPontos || []).filter(sp => sp.feito).length;
        metragem += (Number(p.trinca) || 0) + (Number(p.juntaFria) || 0) + (Number(p.juntaDilat) || 0) + (Number(p.ferragem) || 0);
      });
      totalSubPontos += subTotal;
      totalFeitos    += subFeitos;
      totalMetragem  += metragem;
      consumoEstim   += os.consumoProduto || 0;
      consumoReal    += os.totalConsumoReal || 0;
      if (os.tipo === 'reparo') totalReparos++;
      return { id: os._id, numero: os.numero, cliente: os.cliente, status: os.status, subTotal, subFeitos, metragem, consumoProduto: os.consumoProduto || 0, totalConsumoReal: os.totalConsumoReal || 0, concluidaEm: os.concluidaEm };
    });

    const totalReparosCausados = osListCausados.length;
    res.json({ equipeId, periodo: { inicio, fim }, totalOS: osList.length, totalSubPontos, totalFeitos, totalMetragem: Math.round(totalMetragem * 10) / 10, consumoEstim, consumoReal, totalReparos, totalReparosCausados, detalhes });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Ranking de equipes ────────────────────────────────────────────────────────
app.get('/api/equipes/ranking', auth, async (req, res) => {
  try {
    await connectDB();
    const { inicio, fim } = req.query;
    const dtInicio = inicio ? new Date(inicio + 'T00:00:00').getTime() : 0;
    const dtFim    = fim    ? new Date(fim    + 'T23:59:59').getTime() : Date.now();

    let equipes = [], osList = [];
    if (isConnected) {
      equipes = await Equipe.find({ ativa: true }).lean();
      osList  = await OS.find({ createdAt: { $gte: dtInicio, $lte: dtFim } }).lean();
    } else {
      equipes = memStore.equipes.filter(e => e.ativa !== false);
      osList  = memStore.ordens.filter(o => (o.createdAt || 0) >= dtInicio && (o.createdAt || 0) <= dtFim);
    }

    const ranking = equipes.map(eq => {
      const eqId = String(eq._id || eq.id);
      // OS que a equipe está executando (obras normais — exclui reparos para evitar dupla penalização)
      const osEquipe = osList.filter(o => String(o.equipeId) === eqId && o.tipo !== 'reparo');
      // Reparos causados pela equipe (obras anteriores desta equipe que geraram reparo)
      const reparosCausados = osList.filter(o => o.tipo === 'reparo' && String(o.equipeOriginalId) === eqId).length;
      // Reparos executados pela equipe (ela conserta — serviço extra prestado)
      const reparosProprios = osList.filter(o => o.tipo === 'reparo' && String(o.equipeId) === eqId).length;

      let subFeitos = 0, metragem = 0, consumoEstim = 0, consumoReal = 0;
      let scoreProduto = 0, scoreTempo = 0;
      let diasPlanejados = 0, diasAtivosTotal = 0, osComProduto = 0, osComTempo = 0;

      osEquipe.forEach(os => {
        const pts = ensureSubPontos(os.pontos || []);
        pts.forEach(p => {
          subFeitos += (p.subPontos || []).filter(sp => sp.feito).length;
          metragem  += (Number(p.trinca) || 0) + (Number(p.juntaFria) || 0) + (Number(p.juntaDilat) || 0) + (Number(p.ferragem) || 0);
        });
        consumoEstim += os.consumoProduto || 0;
        consumoReal  += os.totalConsumoReal || 0;

        // ── Eficiência de produto (só OS com estimativa) ──
        if ((os.consumoProduto || 0) > 0) {
          osComProduto++;
          const ratio = (os.totalConsumoReal || 0) / os.consumoProduto;
          if      (ratio <= 0.80) scoreProduto += 15;   // usou ≤80% — ótimo
          else if (ratio <= 0.90) scoreProduto += 10;   // usou 80-90%
          else if (ratio <= 1.00) scoreProduto += 5;    // usou 90-100% — no alvo
          else if (ratio <= 1.10) scoreProduto += 0;    // até 10% acima — tolerado
          else if (ratio <= 1.30) scoreProduto -= 5;    // 10-30% acima — atenção
          else                    scoreProduto -= 10;   // >30% acima — desperdício
        }

        // ── Eficiência de tempo (só OS concluídas com dados) ──
        const planejados = os.diasTrabalho || 0;
        const agendados  = (os.diasAtivos  || []).length;
        if (os.status === 'concluida' && planejados > 0 && agendados > 0) {
          osComTempo++;
          diasPlanejados  += planejados;
          diasAtivosTotal += agendados;
          const ratio = agendados / planejados;
          if      (ratio <= 0.80) scoreTempo += 10;   // terminou ≥20% antes do prazo
          else if (ratio <= 0.90) scoreTempo += 5;    // terminou 10-20% antes
          else if (ratio <= 1.10) scoreTempo += 2;    // dentro da margem ±10%
          else if (ratio <= 1.50) scoreTempo -= 3;    // 10-50% além do prazo
          else                    scoreTempo -= 8;    // >50% além do prazo
        }
      });

      const obrasExecutadas = osEquipe.filter(o => o.status === 'concluida').length;

      // ── Cálculo do score ──────────────────────────────────────────────────
      // Base: obras concluídas + sub-itens + metragem
      const scoreBase    = (obrasExecutadas * 10) + subFeitos + Math.round(metragem * 0.5);
      // Produto: eficiência de uso do GVF Seal (pode ser + ou -)
      const sProduto     = Math.round(scoreProduto);
      // Tempo: eficiência de execução (pode ser + ou -)
      const sTempo       = Math.round(scoreTempo);
      // Reparos: causados = penalidade; executados = bônus
      const sReparos     = (reparosCausados * -8) + (reparosProprios * 3);

      const score = scoreBase + sProduto + sTempo + sReparos;

      return {
        equipeId: eqId, equipeNome: eq.nome, cor: eq.cor,
        totalOS: osEquipe.length, obrasExecutadas, subFeitos,
        metragem: Math.round(metragem * 10) / 10,
        reparosCausados, reparosProprios,
        consumoEstim: parseFloat(consumoEstim.toFixed(1)),
        consumoReal:  parseFloat(consumoReal.toFixed(1)),
        diasPlanejados, diasAtivosTotal, osComProduto, osComTempo,
        scoreBreakdown: { base: scoreBase, produto: sProduto, tempo: sTempo, reparos: sReparos },
        score,
      };
    });

    ranking.sort((a, b) => b.score - a.score);
    res.json({ periodo: { inicio, fim }, ranking });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/aplicador/os/:id/ponto — equipe adiciona novo ponto de problema em reparo avulso
app.post('/api/aplicador/os/:id/ponto', authEquipe, bigJson, async (req, res) => {
  try {
    await connectDB();
    if (!isConnected) return res.status(503).json({ error: 'DB offline' });
    const os = await OS.findById(req.params.id);
    if (!os) return res.status(404).json({ error: 'OS não encontrada' });
    if ((os.tipo || 'normal') !== 'reparo') return res.status(400).json({ error: 'Só permitido em OS de reparo' });

    const { nome, tipoProblema, item, fotos } = req.body || {};
    if (!nome) return res.status(400).json({ error: 'Nome do local é obrigatório' });

    const novoPonto = {
      nome: nome.trim(),
      tipoProblema: tipoProblema || '',
      item: item || '',
      fotosAntes: Array.isArray(fotos) ? fotos : [],
      statusLocal: 'pendente',
      criadoPeloAplicador: true,
      subPontos: [],
    };
    os.pontos = [...(os.pontos || []), novoPonto];
    await os.save();
    res.status(201).json({ pontoIdx: os.pontos.length - 1, os: os.toObject() });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Criar reparo a partir de OS existente ─────────────────────────────────────
app.post('/api/reparos/from-os', auth, bigJson, async (req, res) => {
  try {
    await connectDB();
    const { osOriginalId, pontoIdx, pontosIdx, itensSelecionados, tipoReparo, equipeId, dataInicio, obs, fotosReparo, pontosReparo: pontosReparoNovos } = req.body;
    if (!osOriginalId) return res.status(400).json({ error: 'osOriginalId required' });
    // Suporte a seleção múltipla (pontosIdx) e seleção única legada (pontoIdx)
    const indicesSelecionados = Array.isArray(pontosIdx) && pontosIdx.length > 0
      ? pontosIdx
      : (pontoIdx !== undefined && pontoIdx !== null ? [pontoIdx] : null); // null = todos

    let osOriginal;
    if (isConnected) osOriginal = await OS.findOne({ _id: osOriginalId }).lean();
    else osOriginal = memStore.ordens.find(x => x._id === osOriginalId);
    if (!osOriginal) return res.status(404).json({ error: 'OS original não encontrada' });

    let equipeNome = '';
    if (equipeId) {
      try {
        const eq = isConnected ? await Equipe.findOne({ _id: equipeId }).lean() : memStore.equipes.find(e => (e._id || e.id) === equipeId);
        if (eq) equipeNome = eq.nome;
      } catch {}
    }

    // Herdar pontos — se indicesSelecionados especificado, só esses locais; senão todos
    const pontosOriginal = ensureSubPontos(osOriginal.pontos || []);
    const resetPonto = (p, originalIndex) => {
      let subPontos = (p.subPontos || []).map(sp => ({ ...sp, feito: false, executadoEm: null, executadoPorEquipeId: null, executadoPorEquipeNome: null, executadoPorMembro: null }));
      // Se itensSelecionados foi enviado para este ponto, filtrar subPontos pelos selecionados
      if (Array.isArray(itensSelecionados)) {
        const selecao = itensSelecionados.find(s => s.pontoIdx === originalIndex);
        if (selecao) {
          // Seleção por índice (nova — subPontosIdx) tem prioridade sobre seleção por tipo (legada — tipos)
          if (Array.isArray(selecao.subPontosIdx) && selecao.subPontosIdx.length > 0) {
            subPontos = subPontos.filter((sp, si) => selecao.subPontosIdx.includes(si));
          } else if (Array.isArray(selecao.tipos) && selecao.tipos.length > 0) {
            subPontos = subPontos.filter(sp => selecao.tipos.includes(sp.tipo));
          }
        }
      }
      // Preservar fotosMedicao/fotos para referência no reparo
      const fotosMedicaoRef = p.fotosMedicao || p.fotos || [];
      return {
        ...p,
        statusLocal: 'em_andamento',
        fotosAntes: p.fotosDepois || [],   // fotos "depois" viram "antes" no reparo
        fotosDepois: [],
        fotosMedicao: fotosMedicaoRef,     // mantém fotos da medição como referência
        subPontos,
      };
    };
    let pontosReparo;
    if (indicesSelecionados) {
      const invalidos = indicesSelecionados.filter(i => !pontosOriginal[i]);
      if (invalidos.length) return res.status(400).json({ error: `Ponto(s) não encontrado(s): ${invalidos.join(', ')}` });
      pontosReparo = indicesSelecionados.map(i => resetPonto(pontosOriginal[i], i));
    } else {
      pontosReparo = pontosOriginal.map((p, i) => resetPonto(p, i));
    }

    // Estimar consumo de GVF Seal a partir dos subPontos selecionados do reparo
    // (os campos p.trinca/juntaFria etc. podem estar zerados no ponto da OS;
    //  os valores reais ficam em subPontos[].valor + subPontos[].tipo)
    const CONSUMO_POR_TIPO = { trinca: 1.5, juntaDilat: 2.0, juntaFria: 1.0, ralo: 1.0, cortina: 2.0 };
    const consumoEstimadoReparo = pontosReparo.reduce((total, p) => {
      const subs = p.subPontos || [];
      if (subs.length > 0) {
        // Calcula pelo subPontos filtrados (reflete os itens selecionados para o reparo)
        return total + subs.reduce((s, sp) => s + (sp.valor || 0) * (CONSUMO_POR_TIPO[sp.tipo] || 0), 0);
      }
      // Fallback: usa campos diretos do ponto (compatibilidade com dados antigos)
      const trinca     = Number(p.trinca)    || 0;
      const juntaFria  = Number(p.juntaFria) || 0;
      const juntaDilat = Number(p.juntaDilat)|| 0;
      const ralo       = Number(p.ralo)      || 0;
      const cortina    = Number(p.cortina)   || 0;
      return total + trinca * 1.5 + juntaDilat * 2.0 + juntaFria * 1.0 + ralo * 1.0 + cortina * 2.0;
    }, 0);

    // OS de reparo herda o número da OS mãe e ganha um sufixo -N (1, 2, 3...)
    // Ex: OS mãe 3226 → primeiro reparo 3226-1, segundo 3226-2
    const numeroMae = osOriginal.numero || 0;
    const reparosExistentes = isConnected
      ? await OS.countDocuments({ osOriginalId, tipo: 'reparo' })
      : (memStore.ordens || []).filter(o => o.osOriginalId === osOriginalId && o.tipo === 'reparo').length;
    const numReparo = reparosExistentes + 1;
    const novaOS = {
      _id: uuidv4(),
      numero: numeroMae,            // mesmo número da OS mãe (numérico, pra ordenar)
      numReparo: numReparo,         // 1, 2, 3... — o "sufixo" do reparo
      numeroOriginalMae: numeroMae, // referência explícita para exibição
      tipo: 'reparo',
      osOriginalId,
      tipoReparo: tipoReparo || '',
      cliente: osOriginal.cliente,
      endereco: osOriginal.endereco,
      cidade: osOriginal.cidade,
      celular: osOriginal.celular,
      contratoId: osOriginal.contratoId,
      equipeId: equipeId || '',
      equipeNome: equipeNome || '',
      equipeOriginalId: osOriginal.equipeId || '',   // quem causou o problema
      equipeOriginalNome: osOriginal.equipeNome || '',
      dataInicio: dataInicio || '',
      status: 'agendada',
      pontos: [
        ...pontosReparo,
        ...(Array.isArray(pontosReparoNovos) ? pontosReparoNovos.map(p => ({
          nome: p.nome || '',
          subPontos: (p.itens || []).map(it => ({
            tipo: it.tipo || 'Outro',
            desc: [it.tipo, it.desc].filter(Boolean).join(' — '),
            feito: false,
          })),
          fotos: (p.fotos || []).map(f => ({ data: f })),
          fotosMedicao: [],
          criadoNoReparo: true,
        })) : []),
      ],
      obs: obs || '',
      fotosReparo: Array.isArray(fotosReparo) ? fotosReparo.map(f => ({ data: f })) : [],
      progresso: 0,
      consumoProduto: parseFloat(consumoEstimadoReparo.toFixed(1)),
      totalConsumoReal: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      ...creatorInfo(req),
    };

    if (isConnected) {
      await OS.create(novaOS);
      const saved = await OS.findOne({ _id: novaOS._id }).lean();
      return res.json(saved);
    } else {
      memStore.ordens.push(novaOS);
      return res.json(novaOS);
    }
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/reparos/manual — cria reparo avulso (cliente novo, sem OS pai)
// Usado quando o cliente chama por uma assistência mas não temos histórico no sistema
// (ex: serviço antigo, terceirizado, ou cliente novo trazido pelo aplicador).
app.post('/api/reparos/manual', auth, bigJson, async (req, res) => {
  try {
    await connectDB();
    const {
      cliente, endereco, bairro, cidade, celular,
      tipoReparo, equipeId, dataInicio, obs, fotosReparo,
      consumoEstimado, pontosReparo,
    } = req.body;
    if (!cliente?.trim()) return res.status(400).json({ error: 'cliente obrigatório' });
    if (!tipoReparo?.trim()) return res.status(400).json({ error: 'tipoReparo obrigatório' });

    let equipeNome = '';
    if (equipeId) {
      try {
        const eq = isConnected ? await Equipe.findOne({ _id: equipeId }).lean() : memStore.equipes.find(e => (e._id || e.id) === equipeId);
        if (eq) equipeNome = eq.nome;
      } catch {}
    }

    // Próximo número de OS (avulso — não herda de OS mãe)
    const numero = isConnected ? (await OS.countDocuments()) + 1 : memStore.ordens.length + 1;

    const novaOS = {
      _id: uuidv4(),
      numero,
      tipo: 'reparo',
      origem: 'manual',
      tipoReparo: tipoReparo.trim(),
      cliente: cliente.trim(),
      endereco: endereco || '',
      bairro: bairro || '',
      cidade: cidade || '',
      celular: celular || '',
      equipeId: equipeId || '',
      equipeNome,
      dataInicio: dataInicio || '',
      status: 'agendada',
      pontos: Array.isArray(pontosReparo) ? pontosReparo.map(p => ({
        nome: p.nome || '',
        subPontos: (p.itens || []).map(it => ({
          tipo: it.tipo || 'Outro',
          desc: [it.tipo, it.desc].filter(Boolean).join(' — '),
          feito: false,
        })),
        fotos: (p.fotos || []).map(f => ({ data: f })),
        fotosMedicao: [],
        criadoNoReparo: true,
      })) : [],
      obs: obs || '',
      fotosReparo: Array.isArray(fotosReparo) ? fotosReparo.map(f => ({ data: f })) : [],
      progresso: 0,
      consumoProduto: parseFloat(consumoEstimado) || 0,
      totalConsumoReal: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      ...creatorInfo(req),
    };

    if (isConnected) {
      await OS.create(novaOS);
      const saved = await OS.findOne({ _id: novaOS._id }).lean();
      return res.json(saved);
    }
    memStore.ordens.push(novaOS);
    res.json(novaOS);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/audit-log — histórico de ações destrutivas de admins (últimas 500)
app.get('/api/audit-log', auth, adminOnly, async (req, res) => {
  try {
    await connectDB();
    if (!isConnected) return res.json([]);
    const logs = await AuditLog.find().sort({ ts: -1 }).limit(500).lean();
    res.json(logs);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/ordens-servico/:id', auth, adminOnly, async (req, res) => {
  await audit(req, 'delete', 'ordem-servico', req.params.id);
  try {
    await connectDB();
    if (isConnected) {
      const doc = await OS.findOne({ _id: req.params.id });
      if (doc) await salvarNaLixeira('os', 'Ordem de Serviço', 'ordens', doc, req.user?.email || req.user?.username);
      await OS.findOneAndDelete({ _id: req.params.id });
      return res.json({ success: true });
    }
    const doc = memStore.ordens.find(x => x._id === req.params.id);
    if (doc) await salvarNaLixeira('os', 'Ordem de Serviço', 'ordens', doc, req.user?.email);
    memStore.ordens = memStore.ordens.filter(x => x._id !== req.params.id);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Croqui ────────────────────────────────────────────────────────────────────

app.post('/api/croqui/otimizar', expensiveLimiter, bigJson, async (req, res) => {
  try {
    const { imagem, canvasW, canvasH } = req.body;
    if (!imagem) return res.status(400).json({ error: 'imagem required' });
    // Proporções reais do canvas do cliente (para o viewBox do SVG)
    const vW = canvasW || 1000;
    const vH = canvasH || 1000;

    const GEMINI_KEY = (process.env.GEMINI_API_KEY || '').trim();
    if (!GEMINI_KEY) {
      return res.json({ fallback: true, aviso: 'Configure GEMINI_API_KEY para usar a otimização de croqui' });
    }

    const imgBase64 = imagem.replace(/^data:image\/\w+;base64,/, '');
    const mimeType  = imagem.startsWith('data:image/jpeg') ? 'image/jpeg' : 'image/png';

    // Helper: extrai e normaliza SVG de texto retornado pelo Gemini
    const extractSvg = (rawText) => {
      const cleaned = rawText
        .replace(/```[\w]*\n?/g, '').replace(/```/g, '')  // remove fences markdown
        .trim();
      const m = cleaned.match(/<svg[\s\S]*?<\/svg>/i);
      if (!m) return null;
      let svg = m[0];
      // Garante namespace xmlns obrigatório para renderizar como <img>
      if (!svg.includes('xmlns=')) {
        svg = svg.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
      }
      // Sanitiza SVG: remove <script>, on*= handlers, javascript: URIs, etc.
      svg = sanitizeSvg(svg);
      if (!svg) return null;
      return svg;
    };

    // ── Estratégia primária: SVG vetorial via texto ───────────────────────────
    // gemini-2.0-flash e gemini-1.5-flash suportam visão + saída de texto.
    // Pedimos um SVG limpo: linhas retas, círculos perfeitos, retângulos com 90°.
    const svgPrompt = `You are an expert technical drawing vectorizer specializing in waterproofing and construction floor plans.
Your task: convert this hand-drawn sketch into a CLEAN, PRECISE, PROFESSIONAL SVG technical drawing.

CRITICAL OUTPUT RULES:
- Output ONLY the raw SVG. Zero markdown, zero explanation, zero fences.
- First line of response must be: <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${vW} ${vH}">
- Last line must be: </svg>
- The SVG canvas is ${vW}×${vH} pixels — use this exact coordinate space.

DRAWING IMPROVEMENT RULES (apply aggressively):
1. LINES: Any line that looks approximately straight → make it PERFECTLY straight using <line x1 y1 x2 y2>. Snap endpoints to grid (multiples of 5px).
2. RECTANGLES: Any roughly rectangular shape → perfect <rect> with exact 90° corners.
3. CIRCLES/DRAINS (ralos): Any roughly circular shape → perfect <circle> with exact radius. Drains should be a circle with a smaller concentric circle inside (stroke only).
4. PARALLEL WALLS: If two lines appear parallel → make them exactly parallel, same length.
5. PERPENDICULAR: Walls meeting at ~90° → snap to exactly 90°.
6. SYMMETRY: If something looks symmetric → make it perfectly symmetric.
7. ALIGNMENT: Elements that appear to be on the same horizontal/vertical line → snap them to the same coordinate.
8. TEXT: Preserve ALL text labels exactly as written. Use <text font-family="Arial" font-size="18" text-anchor="middle">.
9. SYMBOLS:
   - Drain (ralo): <circle> + smaller concentric <circle>
   - Crack (trinca): <line stroke-dasharray="4,3">
   - Cold joint (junta fria): <line stroke-dasharray="8,4">
   - Expansion joint (junta dilatação): <line stroke-width="4">

STYLE:
- Background: <rect width="${vW}" height="${vH}" fill="white"/>
- Default: stroke="black" stroke-width="2" fill="none"
- Wall lines: stroke-width="2.5"
- All coordinates within 0–${vW} (x) and 0–${vH} (y), preserving original proportions exactly

The result must look like a professional CAD drawing, NOT hand-drawn.`;

    const svgReqBody = {
      contents: [{ parts: [
        { text: svgPrompt },
        { inline_data: { mime_type: mimeType, data: imgBase64 } }
      ]}]
    };

    // Cascade de modelos Gemini para SVG (texto+visão).
    // gemini-1.5-flash-latest foi descontinuado pelo Google em 2026 — removido daqui.
    // Mantemos cadeia: 2.5-flash (preferido) → 2.0-flash → flash-latest (alias).
    const SVG_MODELS = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-flash-latest'];
    let svgErr = null;
    for (const model of SVG_MODELS) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_KEY}`;
        const resp = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(svgReqBody) });
        const data = await resp.json();
        if (!resp.ok) { svgErr = `[${model}] ${data.error?.message || `HTTP ${resp.status}`}`; continue; }
        const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
        const svg = extractSvg(rawText);
        if (!svg) { svgErr = `[${model}] resposta sem SVG válido (raw: ${rawText.slice(0,120)})`; continue; }
        log('info', `Croqui vetorizado via ${model} (SVG)`);
        return res.json({ svg, fonte: 'gemini-svg', modelo: model });
      } catch (e) { svgErr = `[${model}] ${e.message}`; }
    }

    // ── Estratégia secundária: image-generation (se disponível) ──────────────
    const imgPrompt = `Redraw this hand-drawn floor plan as a clean technical drawing.
- Straighten all lines meant to be straight
- Perfect circles for drains/round elements
- Perfect 90° rectangles for rooms
- Keep all labels exactly as written
- White background, crisp black lines, no shading
- Same layout and proportions`;

    const makeImgBody = (modalities) => ({
      contents: [{ parts: [
        { text: imgPrompt },
        { inline_data: { mime_type: mimeType, data: imgBase64 } }
      ]}],
      generationConfig: { responseModalities: modalities }
    });

    // Modelos com geração de imagem (responseModalities: ['IMAGE','TEXT']).
    // Mantemos várias variações pois Google muda nomes/disponibilidade frequentemente.
    const IMG_ATTEMPTS = [
      { apiVer: 'v1beta',  model: 'gemini-2.5-flash-image-preview' },
      { apiVer: 'v1beta',  model: 'gemini-2.0-flash-preview-image-generation' },
      { apiVer: 'v1beta',  model: 'gemini-2.0-flash-exp-image-generation' },
      { apiVer: 'v1alpha', model: 'gemini-2.0-flash-exp-image-generation' },
      { apiVer: 'v1beta',  model: 'gemini-2.0-flash-exp' },
    ];
    let imgErr = null;
    for (const { apiVer, model } of IMG_ATTEMPTS) {
      try {
        const url  = `https://generativelanguage.googleapis.com/${apiVer}/models/${model}:generateContent?key=${GEMINI_KEY}`;
        const resp = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(makeImgBody(['IMAGE','TEXT'])) });
        const data = await resp.json();
        if (!resp.ok) { imgErr = `[${apiVer}/${model}] ${data.error?.message || `HTTP ${resp.status}`}`; continue; }
        const parts   = data.candidates?.[0]?.content?.parts || [];
        const imgPart = parts.find(p => p.inlineData?.mimeType?.startsWith('image/'));
        if (!imgPart) { imgErr = `[${apiVer}/${model}] resposta sem imagem`; continue; }
        log('info', `Croqui otimizado via ${apiVer}/${model} (imagem)`);
        return res.json({ imagemOtimizada: imgPart.inlineData.data, fonte: 'gemini', modelo: model });
      } catch (e) { imgErr = `[${model}] ${e.message}`; }
    }

    // ── Fallback local (informar ao cliente) ─────────────────────────────────
    log('warn', `SVG: ${svgErr} | IMG: ${imgErr}. Usando fallback local.`);
    return res.json({ fallback: true, aviso: svgErr || imgErr || 'Gemini indisponível' });
  } catch (err) {
    console.error('Croqui otimizar error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Produtos / Estoque ────────────────────────────────────────────────────────
app.get('/api/produtos/compras', auth, async (req, res) => {
  try {
    await connectDB();
    const compras = await Compra.find().sort({ data: -1 }).lean();
    res.json(compras);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/produtos/compras', auth, async (req, res) => {
  try {
    await connectDB();
    const { data, quantidade, obs } = req.body;
    if (!quantidade || isNaN(parseFloat(quantidade))) return res.status(400).json({ error: 'Informe a quantidade' });
    const compra = new Compra({ data: data ? new Date(data) : new Date(), quantidade: parseFloat(quantidade), obs: obs || '' });
    await compra.save();
    res.json(compra);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/produtos/compras/:id', auth, async (req, res) => {
  try {
    await connectDB();
    await Compra.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/produtos/dashboard', auth, async (req, res) => {
  try {
    await connectDB();
    // 1) Total comprado
    const compras = await Compra.find().sort({ data: 1 }).lean();
    const totalComprado = compras.reduce((s, c) => s + (c.quantidade || 0), 0);

    // 2) Consumo de todas as OSes (fechamentosDia[].litros)
    const todasOS = await OS.find({}, { equipeNome: 1, tipo: 1, numOS: 1, cliente: 1, status: 1, fechamentosDia: 1, totalConsumoReal: 1 }).lean();

    let totalGasto = 0;
    const porEquipe = {};
    let gastoObras = 0;
    let gastoReparos = 0;
    const osConsumo = [];

    todasOS.forEach(os => {
      const fechamentos = os.fechamentosDia || [];
      const totalOS = fechamentos.reduce((s, f) => s + (f.litros || 0), 0);
      if (totalOS === 0) return;

      totalGasto += totalOS;

      // Por equipe
      const equipe = os.equipeNome || 'Sem equipe';
      porEquipe[equipe] = (porEquipe[equipe] || 0) + totalOS;

      // Por tipo
      if (os.tipo === 'reparo') gastoReparos += totalOS;
      else gastoObras += totalOS;

      osConsumo.push({
        id: os._id,
        numOS: os.numOS || '',
        cliente: os.cliente || '',
        tipo: os.tipo || 'normal',
        equipeNome: os.equipeNome || '',
        status: os.status || '',
        litros: totalOS
      });
    });

    // Top 10 OSes por consumo
    const topOS = osConsumo.sort((a, b) => b.litros - a.litros).slice(0, 10);

    // Gasto por equipe ordenado
    const gastoPorEquipe = Object.entries(porEquipe)
      .map(([equipeNome, litros]) => ({ equipeNome, litros }))
      .sort((a, b) => b.litros - a.litros);

    const saldoAtual = totalComprado - totalGasto;

    res.json({
      totalComprado,
      totalGasto,
      saldoAtual,
      gastoObras,
      gastoReparos,
      gastoPorEquipe,
      topOS,
      compras,
      alertaBaixoEstoque: saldoAtual < 100
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Garantias Standalone (from OS) ───────────────────────────────────────────

// IMPORTANTE: /api/garantias/from-os DEVE ficar ANTES de /api/garantias/:id
app.get('/api/garantias', auth, async (req, res) => {
  try {
    await connectDB();
    const contratos  = isConnected ? await Contrato.find().sort({ numero: -1 }).lean() : (memStore.contratos || []);
    const garantias  = isConnected ? await GarantiaDoc.find().sort({ criadoEm: -1 }).lean() : [];
    const result = [
      ...contratos.map(c => ({ ...c, id: String(c._id), source: 'contrato' })),
      ...garantias.map(g => ({ ...g, id: String(g._id), source: 'garantia' }))
    ].sort((a, b) => new Date(b.criadoEm || b.dataInicio || 0) - new Date(a.criadoEm || a.dataInicio || 0));
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/garantias/from-os', auth, async (req, res) => {
  try {
    await connectDB();
    const { osIds } = req.body;
    if (!Array.isArray(osIds) || osIds.length === 0) return res.status(400).json({ error: 'osIds required' });
    const created = [];
    for (const osId of osIds) {
      if (!isConnected) continue;
      const os = await OS.findById(osId).lean();
      if (!os) continue;
      // Evitar duplicatas
      const exists = await GarantiaDoc.findOne({ osId: os._id }).lean();
      if (exists) { created.push({ ...exists, id: String(exists._id), source: 'garantia' }); continue; }
      const g = new GarantiaDoc({
        osId:         os._id,
        cliente:      os.cliente || '',
        razaoSocial:  os.cliente || '',
        endereco:     os.endereco || '',
        bairro:       os.bairro  || '',
        cidade:       os.cidade  || '',
        cep:          os.cep     || '',
        garantia:     Number(os.garantia) || 15,
        totalLiquido: os.valorTotal || 0,
        dataInicio:   os.dataInicio,
        dataTermino:  os.dataTermino
      });
      await g.save();
      created.push({ ...g.toObject(), id: String(g._id), source: 'garantia' });
    }
    res.json(created);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/garantias/:id', auth, async (req, res) => {
  try {
    await connectDB();
    const { _id, id, __v, source, osId, ...rest } = req.body;
    const g = await GarantiaDoc.findByIdAndUpdate(req.params.id, { $set: rest }, { new: true, strict: false });
    if (!g) return res.status(404).json({ error: 'Not found' });
    res.json({ ...g.toObject(), id: String(g._id), source: 'garantia' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/garantias/:id', auth, async (req, res) => {
  try {
    await connectDB();
    await GarantiaDoc.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/garantias/:id/marcar-enviada', auth, async (req, res) => {
  try {
    await connectDB();
    const ts = Date.now();
    const g = await GarantiaDoc.findByIdAndUpdate(req.params.id, { garantiaEnviadaEm: ts }, { new: true });
    if (!g) return res.status(404).json({ error: 'Not found' });
    res.json({ ...g.toObject(), id: String(g._id), source: 'garantia' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/garantias/:id/pdf', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1] || req.query.token;
  if (!token) return res.status(401).json({ error: 'Token required' });
  try { jwt.verify(token, JWT_SECRET); } catch { return res.status(401).json({ error: 'Invalid token' }); }
  try {
    await connectDB();
    const g = isConnected ? await GarantiaDoc.findById(req.params.id).lean() : null;
    if (!g) return res.status(404).json({ error: 'Not found' });

    let osPontos = [];
    if (g.osId) {
      try {
        const os = await OS.findById(g.osId).lean();
        if (os && os.pontos) {
          osPontos = os.pontos; // inclui todos os pontos — fotos e croquis filtrados dentro de buildGarantiaPdfHtml
        }
      } catch {}
    }

    const cLike = { ...g, locais: g.locais || [] };
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(buildGarantiaPdfHtml(cLike, osPontos));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Injetores / Estoque ───────────────────────────────────────────────────────
app.get('/api/produtos/injetores/compras', auth, async (req, res) => {
  try {
    await connectDB();
    const compras = await CompraInjetor.find().sort({ data: -1 }).lean();
    res.json(compras);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/produtos/injetores/compras', auth, async (req, res) => {
  try {
    await connectDB();
    const { data, quantidade, fornecedor, notaFiscal, obs } = req.body;
    if (!quantidade || isNaN(parseInt(quantidade))) return res.status(400).json({ error: 'Informe a quantidade' });
    const compra = new CompraInjetor({
      data: data ? new Date(data) : new Date(),
      quantidade: parseInt(quantidade),
      fornecedor: fornecedor || '',
      notaFiscal: notaFiscal || '',
      obs: obs || ''
    });
    await compra.save();
    res.json(compra);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/produtos/injetores/compras/:id', auth, async (req, res) => {
  try {
    await connectDB();
    await CompraInjetor.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/produtos/injetores/dashboard', auth, async (req, res) => {
  try {
    await connectDB();
    // 1) Total comprado
    const compras = await CompraInjetor.find().sort({ data: 1 }).lean();
    const totalComprado = compras.reduce((s, c) => s + (c.quantidade || 0), 0);

    // 2) Consumo de todas as OSes (fechamentosDia[].injetores)
    const todasOS = await OS.find({}, { equipeNome: 1, tipo: 1, numOS: 1, cliente: 1, status: 1, fechamentosDia: 1 }).lean();

    let totalGasto = 0;
    const porEquipe = {};
    let gastoObras = 0;
    let gastoReparos = 0;
    const osConsumo = [];

    todasOS.forEach(os => {
      const fechamentos = os.fechamentosDia || [];
      const totalOS = fechamentos.reduce((s, f) => s + (f.injetores || 0), 0);
      if (totalOS === 0) return;

      totalGasto += totalOS;

      const equipe = os.equipeNome || 'Sem equipe';
      porEquipe[equipe] = (porEquipe[equipe] || 0) + totalOS;

      if (os.tipo === 'reparo') gastoReparos += totalOS;
      else gastoObras += totalOS;

      osConsumo.push({
        id: os._id,
        numOS: os.numOS || '',
        cliente: os.cliente || '',
        tipo: os.tipo || 'normal',
        equipeNome: os.equipeNome || '',
        status: os.status || '',
        unidades: totalOS
      });
    });

    const topOS = osConsumo.sort((a, b) => b.unidades - a.unidades).slice(0, 10);
    const gastoPorEquipe = Object.entries(porEquipe)
      .map(([equipeNome, unidades]) => ({ equipeNome, unidades }))
      .sort((a, b) => b.unidades - a.unidades);

    const saldoAtual = totalComprado - totalGasto;

    res.json({
      totalComprado,
      totalGasto,
      saldoAtual,
      gastoObras,
      gastoReparos,
      gastoPorEquipe,
      topOS,
      compras,
      alertaBaixoEstoque: saldoAtual < 150
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Estoque por Equipe / Semana (painel — auth) ───────────────────────────────
// Helper: soma consumo real (fechamentosDia.litros) por equipe num intervalo de datas YYYY-MM-DD
function _somarConsumoReal(todasOS, equipeId, dataInicio, dataFim) {
  let total = 0;
  for (const os of todasOS) {
    if (os.equipeId !== equipeId) continue;
    for (const f of (os.fechamentosDia || [])) {
      if (f.data >= dataInicio && f.data <= dataFim) total += (f.litros || 0);
    }
  }
  return total;
}

// Helper: previsão de consumo da semana pra uma equipe.
// Distribui o `consumoProduto` da OS proporcionalmente aos `diasAtivos` (dias de
// trabalho efetivos que o operador agendou via WorkdayPicker).
// Exemplo: OS 100L em 10 dias agendados; semana atual tem 5 desses dias → 50L.
// Fallback: se a OS não tem diasAtivos (foi criada antes da feature), usa o
// intervalo dataInicio–dataTermino contando dias úteis.
function _preverConsumoSemana(todasOS, equipeId, weekStart, weekEnd) {
  let total = 0;
  for (const os of todasOS) {
    if (os.equipeId !== equipeId) continue;
    if (!os.consumoProduto || os.consumoProduto <= 0) continue;

    // Caminho preferido: diasAtivos definidos
    if (Array.isArray(os.diasAtivos) && os.diasAtivos.length > 0) {
      const consumoPorDia = os.consumoProduto / os.diasAtivos.length;
      const diasNaSemana = os.diasAtivos.filter(d => d >= weekStart && d <= weekEnd).length;
      total += consumoPorDia * diasNaSemana;
      continue;
    }

    // Fallback: dataInicio–dataTermino com contagem de dias úteis (seg-sex)
    if (!os.dataInicio || !os.dataTermino) continue;
    const ini = os.dataInicio > weekStart ? os.dataInicio : weekStart;
    const fim = os.dataTermino < weekEnd ? os.dataTermino : weekEnd;
    if (ini > fim) continue;

    const _contarDiasUteis = (a, b) => {
      let count = 0;
      const start = new Date(a + 'T00:00:00Z');
      const end = new Date(b + 'T00:00:00Z');
      for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
        const wd = d.getUTCDay(); // 0=dom, 6=sab
        if (wd !== 0 && wd !== 6) count++;
      }
      return Math.max(1, count);
    };
    const diasUteisSemana = _contarDiasUteis(ini, fim);
    const diasUteisObra = _contarDiasUteis(os.dataInicio, os.dataTermino);
    total += os.consumoProduto * (diasUteisSemana / diasUteisObra);
  }
  return total;
}

app.get('/api/estoque-equipes', auth, async (req, res) => {
  try {
    await connectDB();
    const semana = req.query.semana || getISOWeekStr(new Date());
    const { start, end } = getWeekDateRange(semana);
    const equipes = await Equipe.find().lean();
    // Estoques TODA HISTÓRICO da equipe (precisamos do saldo anterior)
    const todosEstoques = await EstoqueEquipeSemana.find().lean();
    // OSes — precisamos pra calcular consumo real (fechamentosDia) e previsão (consumoProduto, datas)
    const todasOS = await OS.find({}, 'equipeId fechamentosDia consumoProduto dataInicio dataTermino status').lean();

    const result = equipes.map(eq => {
      const estDaSemana = todosEstoques.find(e => e.equipeId === eq._id && e.semana === semana) || {};
      const recebidoSemana = estDaSemana.recebido || 0;
      const consumidoReal = Math.round(_somarConsumoReal(todasOS, eq._id, start, end) * 10) / 10;
      const consumidoPrevisto = Math.round(_preverConsumoSemana(todasOS, eq._id, start, end) * 10) / 10;

      // Saldo anterior: soma de (recebido - consumido real) de TODAS as semanas anteriores
      const semanasAnteriores = todosEstoques.filter(e => e.equipeId === eq._id && e.semana < semana);
      let saldoAnterior = 0;
      for (const est of semanasAnteriores) {
        const { start: s, end: en } = getWeekDateRange(est.semana);
        saldoAnterior += (est.recebido || 0) - _somarConsumoReal(todasOS, eq._id, s, en);
      }
      saldoAnterior = Math.round(saldoAnterior * 10) / 10;
      // Não permitir saldo anterior negativo — significa que a equipe lançou consumo sem ter recebido,
      // o que é um erro de registro (mostraríamos como dívida confusa pro operador).
      if (saldoAnterior < 0) saldoAnterior = 0;

      const disponivel = Math.round((saldoAnterior + recebidoSemana) * 10) / 10;
      const restante = Math.round((disponivel - consumidoReal) * 10) / 10;
      // Risco de falta: previsão > disponível
      const faltaPrevista = Math.round(Math.max(0, consumidoPrevisto - disponivel) * 10) / 10;

      return {
        equipeId: eq._id,
        equipeNome: eq.nome,
        semana,
        saldoAnterior,             // litros que sobraram de semanas anteriores
        recebido: recebidoSemana,  // litros recebidos NESTA semana
        disponivel,                // saldoAnterior + recebido (total que tem pra consumir)
        consumido: consumidoReal,  // gasto REAL (fechamentosDia)
        consumidoPrevisto,         // previsão baseada nas OSes
        restante,                  // disponivel - consumido (pode ser negativo se gastou mais que tinha)
        faltaPrevista,             // se previsão > disponível, alerta de quanto pode faltar
        riscoFalta: faltaPrevista > 0,
        lancamentos: estDaSemana.lancamentos || [],
      };
    });
    res.json({ semana, semanaRange: { start, end }, equipes: result });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/estoque-equipes/mes?mes=2026-06 — visão consolidada do mês
// Lista TODAS as semanas que tocam o mês (segunda-feira dessa semana cai no mês).
// Por equipe: arrays de semanas + totais do mês (recebido, consumido real, previsto, diferença).
app.get('/api/estoque-equipes/mes', auth, async (req, res) => {
  try {
    await connectDB();
    // Default: mês atual no SP
    const hojeSP = new Date().toLocaleString('sv-SE', { timeZone: 'America/Sao_Paulo' }).slice(0, 7);
    const mes = req.query.mes || hojeSP; // "YYYY-MM"
    if (!/^\d{4}-\d{2}$/.test(mes)) return res.status(400).json({ error: 'mes inválido (use YYYY-MM)' });
    const [year, month] = mes.split('-').map(Number);
    const mesStart = `${mes}-01`;
    const ultimoDia = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const mesEnd = `${mes}-${String(ultimoDia).padStart(2, '0')}`;

    // Lista de semanas ISO que TOCAM esse mês (segunda da semana entre mesStart e mesEnd)
    const semanas = [];
    let cursor = new Date(Date.UTC(year, month - 1, 1));
    // recua pra segunda da semana do dia 1
    const dia = cursor.getUTCDay() || 7;
    cursor.setUTCDate(cursor.getUTCDate() - dia + 1);
    while (cursor.toISOString().slice(0, 10) <= mesEnd) {
      const sIso = getISOWeekStr(cursor);
      if (!semanas.includes(sIso)) semanas.push(sIso);
      cursor.setUTCDate(cursor.getUTCDate() + 7);
    }

    const equipes = await Equipe.find().lean();
    const todosEstoques = await EstoqueEquipeSemana.find({ semana: { $in: semanas } }).lean();
    const todasOS = await OS.find({}, 'equipeId fechamentosDia consumoProduto dataInicio dataTermino').lean();

    const result = equipes.map(eq => {
      const linhasSemana = semanas.map(s => {
        const est = todosEstoques.find(e => e.equipeId === eq._id && e.semana === s) || {};
        const { start, end } = getWeekDateRange(s);
        const recebido = est.recebido || 0;
        const consumido = Math.round(_somarConsumoReal(todasOS, eq._id, start, end) * 10) / 10;
        const previsto = Math.round(_preverConsumoSemana(todasOS, eq._id, start, end) * 10) / 10;
        return { semana: s, start, end, recebido, consumido, previsto };
      });
      const totaisMes = linhasSemana.reduce(
        (acc, l) => ({
          recebido: Math.round((acc.recebido + l.recebido) * 10) / 10,
          consumido: Math.round((acc.consumido + l.consumido) * 10) / 10,
          previsto: Math.round((acc.previsto + l.previsto) * 10) / 10,
        }),
        { recebido: 0, consumido: 0, previsto: 0 }
      );
      totaisMes.diferenca = Math.round((totaisMes.consumido - totaisMes.previsto) * 10) / 10;
      return {
        equipeId: eq._id,
        equipeNome: eq.nome,
        semanas: linhasSemana,
        totaisMes,
      };
    });
    res.json({ mes, mesRange: { start: mesStart, end: mesEnd }, semanas, equipes: result });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/estoque-equipes/dia?data=YYYY-MM-DD — consumo real de cada equipe num dia específico
app.get('/api/estoque-equipes/dia', auth, async (req, res) => {
  try {
    await connectDB();
    const hojeSP = new Date().toLocaleString('sv-SE', { timeZone: 'America/Sao_Paulo' }).slice(0, 10);
    const data = req.query.data || hojeSP;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return res.status(400).json({ error: 'data inválida (use YYYY-MM-DD)' });
    const equipes = await Equipe.find().lean();
    const todasOS = await OS.find({}, 'equipeId fechamentosDia').lean();
    const result = equipes.map(eq => ({
      equipeId: eq._id,
      equipeNome: eq.nome,
      consumido: Math.round(_somarConsumoReal(todasOS, eq._id, data, data) * 10) / 10,
    }));
    res.json({ data, equipes: result });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/estoque-equipes/:equipeId', auth, async (req, res) => {
  try {
    await connectDB();
    const { semana, recebido } = req.body;
    if (!semana || recebido == null) return res.status(400).json({ error: 'semana e recebido obrigatórios' });
    const equipe = await Equipe.findById(req.params.equipeId).lean();
    if (!equipe) return res.status(404).json({ error: 'Equipe não encontrada' });
    await EstoqueEquipeSemana.findOneAndUpdate(
      { equipeId: req.params.equipeId, semana },
      { equipeId: req.params.equipeId, equipeNome: equipe.nome, semana, recebido: parseFloat(recebido), updatedAt: new Date() },
      { upsert: true, new: true }
    );
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/estoque-equipes/:equipeId/lancamento-manual
// Admin adiciona um lançamento individual ao histórico — usado pra reconstruir
// lançamentos antigos que não tinham registro (anteriores à feature de histórico).
// Body: { semana, membro, litros, ts (ISO string opcional), somarTotal (bool) }
// Se somarTotal=true, também incrementa o campo `recebido`; padrão=false (só histórico).
app.post('/api/estoque-equipes/:equipeId/lancamento-manual', auth, adminOnly, async (req, res) => {
  try {
    await connectDB();
    if (!isConnected) return res.status(503).json({ error: 'DB offline' });
    const { semana, membro, litros, ts, somarTotal } = req.body || {};
    if (!semana || !membro || !litros || isNaN(parseFloat(litros))) {
      return res.status(400).json({ error: 'semana, membro e litros obrigatórios' });
    }
    const equipe = await Equipe.findById(req.params.equipeId).lean();
    if (!equipe) return res.status(404).json({ error: 'Equipe não encontrada' });

    const lancamento = {
      membro: String(membro).trim(),
      litros: parseFloat(litros),
      ts: ts ? new Date(ts) : new Date(),
    };

    const updates = {
      equipeId: req.params.equipeId,
      equipeNome: equipe.nome,
      semana,
      updatedAt: new Date(),
    };

    // Se somarTotal=true, incrementa o recebido. Senão, só adiciona ao histórico.
    if (somarTotal) {
      const atual = await EstoqueEquipeSemana.findOne({ equipeId: req.params.equipeId, semana }).lean();
      updates.recebido = Math.round(((atual?.recebido || 0) + lancamento.litros) * 10) / 10;
    }

    const doc = await EstoqueEquipeSemana.findOneAndUpdate(
      { equipeId: req.params.equipeId, semana },
      { ...updates, $push: { lancamentos: lancamento } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    await audit(req, 'add-lancamento-manual', 'estoque-equipe', req.params.equipeId, { semana, membro, litros, somarTotal: !!somarTotal });
    res.json({ success: true, lancamento, recebido: doc.recebido });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /api/estoque-equipes/:equipeId/lancamento/:idx
// Admin remove um lançamento específico do histórico (em caso de erro)
app.delete('/api/estoque-equipes/:equipeId/lancamento/:idx', auth, adminOnly, async (req, res) => {
  try {
    await connectDB();
    if (!isConnected) return res.status(503).json({ error: 'DB offline' });
    const { semana, descontarTotal } = req.query;
    if (!semana) return res.status(400).json({ error: 'semana obrigatória' });
    const doc = await EstoqueEquipeSemana.findOne({ equipeId: req.params.equipeId, semana });
    if (!doc) return res.status(404).json({ error: 'Estoque não encontrado' });
    const idx = parseInt(req.params.idx, 10);
    if (isNaN(idx) || idx < 0 || idx >= (doc.lancamentos || []).length) {
      return res.status(400).json({ error: 'Índice inválido' });
    }
    const removido = doc.lancamentos[idx];
    doc.lancamentos.splice(idx, 1);
    if (descontarTotal === 'true' && removido?.litros) {
      doc.recebido = Math.max(0, Math.round((doc.recebido - removido.litros) * 10) / 10);
    }
    doc.updatedAt = new Date();
    await doc.save();
    await audit(req, 'delete-lancamento-manual', 'estoque-equipe', req.params.equipeId, { semana, removido, descontarTotal });
    res.json({ success: true, recebido: doc.recebido });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Resumo de estoque por equipe (semana + mês) ───────────────────────────────
app.get('/api/aplicador/estoque-summary', authEquipe, async (req, res) => {
  try {
    await connectDB();
    const { equipeId } = req.query;
    if (!equipeId) return res.status(400).json({ error: 'equipeId obrigatório' });

    const now = new Date();
    const semanaStr = getISOWeekStr(now);
    const { start: weekStart, end: weekEnd } = getWeekDateRange(semanaStr);

    // Todos os estoques desta equipe (histórico completo para saldo anterior)
    const todosEstoques = await EstoqueEquipeSemana.find({ equipeId }).lean();
    const estSemana = todosEstoques.find(e => e.semana === semanaStr) || {};
    const recebidoSemana = estSemana.recebido || 0;

    // OSes desta equipe para cálculo de consumo real
    const osList = await OS.find({ equipeId }, 'equipeId fechamentosDia').lean();

    // Gasto desta semana
    let gastoSemana = 0;
    for (const os of osList) {
      for (const f of (os.fechamentosDia || [])) {
        const data = (f.data || '').slice(0, 10);
        if (data >= weekStart && data <= weekEnd) gastoSemana += (f.litros || 0);
      }
    }

    // Saldo anterior: soma de (recebido - consumido real) de TODAS as semanas anteriores
    const semanasAnteriores = todosEstoques.filter(e => e.semana < semanaStr);
    let saldoAnterior = 0;
    for (const est of semanasAnteriores) {
      const { start: s, end: en } = getWeekDateRange(est.semana);
      saldoAnterior += (est.recebido || 0) - _somarConsumoReal(osList, equipeId, s, en);
    }
    saldoAnterior = Math.max(0, Math.round(saldoAnterior * 10) / 10);

    // Lista de equipes para a tela de transferência
    const todasEquipes = await Equipe.find().select('_id nome').lean();

    const r = v => Math.round(v * 10) / 10;
    const disponivel = r(saldoAnterior + recebidoSemana);
    const saldoAtual = r(disponivel - gastoSemana);

    const anoMes = now.toISOString().slice(0, 7);
    res.json({
      semana: {
        chave: semanaStr,
        saldoAnterior: r(saldoAnterior),
        recebido: r(recebidoSemana),
        gasto: r(gastoSemana),
        disponivel,
        saldo: saldoAtual,
      },
      // Campo mes mantido para compatibilidade com JS antigo em cache
      mes: { chave: anoMes, recebido: r(recebidoSemana), gasto: r(gastoSemana), saldo: saldoAtual },
      equipes: todasEquipes
        .filter(e => String(e._id) !== String(equipeId))
        .map(e => ({ id: e._id, nome: e.nome })),
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Equipe declara injetores recebidos do encarregado (Edson) ─────────────────
// Espelha o estoque-recebido (litros) mas pra injetores. Alimenta a comparação
// "Edson forneceu X / Equipe declarou Y" na aba Injetores do PWA Medidor.
app.post('/api/aplicador/injetores-recebidos', authEquipe, async (req, res) => {
  try {
    await connectDB();
    const { equipeId, quantidade, semana, membro } = req.body;
    if (!equipeId || !quantidade || isNaN(parseInt(quantidade, 10))) {
      return res.status(400).json({ error: 'equipeId e quantidade obrigatórios' });
    }
    const qtd = parseInt(quantidade, 10);
    const semanaStr = semana || getISOWeekStr(new Date());
    const equipe = await Equipe.findById(equipeId).lean();
    const equipeNome = equipe ? equipe.nome : '';
    const current = await EstoqueEquipeSemana.findOne({ equipeId, semana: semanaStr }).lean();
    const novoTotal = (current?.injetoresRecebidos || 0) + qtd;
    const novoLancamento = { membro: membro || 'Equipe', injetores: qtd, tipo: 'injetores', ts: new Date() };
    await EstoqueEquipeSemana.findOneAndUpdate(
      { equipeId, semana: semanaStr },
      {
        equipeId, equipeNome, semana: semanaStr,
        injetoresRecebidos: novoTotal,
        updatedAt: new Date(),
        $push: { lancamentos: novoLancamento },
      },
      { upsert: true, new: true }
    );
    res.json({ success: true, injetoresRecebidos: novoTotal, semana: semanaStr });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Lançar estoque recebido (aplicador — sem auth JWT) ────────────────────────
app.post('/api/aplicador/estoque-recebido', authEquipe, async (req, res) => {
  try {
    await connectDB();
    const { equipeId, litros, semana, membro } = req.body;
    if (!equipeId || !litros || isNaN(parseFloat(litros))) {
      return res.status(400).json({ error: 'equipeId e litros obrigatórios' });
    }
    const semanaStr = semana || getISOWeekStr(new Date());
    const equipe = await Equipe.findById(equipeId).lean();
    const equipeNome = equipe ? equipe.nome : '';
    const current = await EstoqueEquipeSemana.findOne({ equipeId, semana: semanaStr }).lean();
    const novoRecebido = Math.round(((current?.recebido || 0) + parseFloat(litros)) * 10) / 10;
    const novoLancamento = { membro: membro || 'Equipe', litros: parseFloat(litros), ts: new Date() };
    await EstoqueEquipeSemana.findOneAndUpdate(
      { equipeId, semana: semanaStr },
      {
        equipeId, equipeNome, semana: semanaStr,
        recebido: novoRecebido,
        updatedAt: new Date(),
        $push: { lancamentos: novoLancamento },
      },
      { upsert: true, new: true }
    );
    res.json({ success: true, recebido: novoRecebido, semana: semanaStr });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Transferência de produto/injetores entre equipes ─────────────────────────
app.post('/api/aplicador/transferencia', authEquipe, async (req, res) => {
  try {
    await connectDB();
    const { equipeIdDestino, quantidade, tipo, membro } = req.body;
    const equipeIdOrigem = req.equipe.equipeId;
    if (!equipeIdDestino || !quantidade || !tipo) {
      return res.status(400).json({ error: 'equipeIdDestino, quantidade e tipo obrigatórios' });
    }
    if (!['produto', 'injetores'].includes(tipo)) {
      return res.status(400).json({ error: 'tipo deve ser produto ou injetores' });
    }
    const qtd = tipo === 'produto' ? parseFloat(quantidade) : parseInt(quantidade, 10);
    if (isNaN(qtd) || qtd <= 0) return res.status(400).json({ error: 'quantidade inválida' });

    const semanaStr = getISOWeekStr(new Date());
    const equipeDestino = await Equipe.findById(equipeIdDestino).lean();
    const equipeOrigem  = await Equipe.findById(equipeIdOrigem).lean();
    if (!equipeDestino) return res.status(404).json({ error: 'Equipe destino não encontrada' });

    const campo = tipo === 'produto' ? 'recebido' : 'injetoresRecebidos';
    const tipoLanc = tipo === 'produto' ? 'produto' : 'injetores';
    const membroStr = membro || 'Equipe';

    // Debita da equipe origem (registro negativo no lancamentos, sem alterar recebido)
    // Credita na equipe destino
    const [origemDoc] = await Promise.all([
      EstoqueEquipeSemana.findOneAndUpdate(
        { equipeId: equipeIdOrigem, semana: semanaStr },
        {
          $set: { equipeId: equipeIdOrigem, equipeNome: equipeOrigem?.nome || '', semana: semanaStr, updatedAt: new Date() },
          $inc: { [campo]: -qtd },
          $push: { lancamentos: { membro: membroStr, [tipo === 'produto' ? 'litros' : 'injetores']: -qtd, tipo: tipoLanc + '_transferido', ts: new Date() } },
        },
        { upsert: true, new: true }
      ),
      EstoqueEquipeSemana.findOneAndUpdate(
        { equipeId: equipeIdDestino, semana: semanaStr },
        {
          $set: { equipeId: equipeIdDestino, equipeNome: equipeDestino?.nome || '', semana: semanaStr, updatedAt: new Date() },
          $inc: { [campo]: qtd },
          $push: { lancamentos: { membro: `transferido de ${equipeOrigem?.nome || equipeIdOrigem}`, [tipo === 'produto' ? 'litros' : 'injetores']: qtd, tipo: tipoLanc + '_recebido', ts: new Date() } },
        },
        { upsert: true, new: true }
      ),
    ]);

    const novoSaldo = origemDoc[campo] || 0;
    res.json({ success: true, novoSaldo, semana: semanaStr });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Integração de Orçamentos Legados (admin-only) ─────────────────────────────

// Helper: chama Gemini com PDF e retorna JSON parseado robustamente
async function geminiExtrairPdf(pdfBase64, prompt, maxTokens = 8192) {
  const GEMINI_KEY = (process.env.GEMINI_API_KEY || '').trim();
  if (!GEMINI_KEY) throw new Error('GEMINI_API_KEY não configurada');

  const geminiRes = await axios.post(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`,
    {
      contents: [{ parts: [
        { text: prompt },
        { inlineData: { mimeType: 'application/pdf', data: pdfBase64 } }
      ]}],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: maxTokens,
      }
    },
    { timeout: 90000 }
  );

  // Coleta texto de todas as partes (thinking models retornam múltiplas partes)
  const parts = geminiRes.data?.candidates?.[0]?.content?.parts || [];
  let rawText = parts.map(p => p.text || '').join('');

  // Strip thinking tags e markdown fences
  rawText = rawText
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim();

  // Tenta parse direto
  try { return JSON.parse(rawText); } catch {}

  // Fallback: extrai o primeiro bloco JSON {...}
  const jsonMatch = rawText.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try { return JSON.parse(jsonMatch[0]); } catch {}
  }

  throw new Error(`Gemini não retornou JSON válido. Trecho: "${rawText.slice(0, 400)}"`);
}

// Extrai dados do PDF de orçamento via Gemini
app.post('/api/integracao/extrair-orcamento', auth, bigJson, async (req, res) => {
  try {
    const { pdf } = req.body;
    if (!pdf) return res.status(400).json({ error: 'pdf (base64) obrigatório' });

    const pdfBase64 = pdf.replace(/^data:[^;]+;base64,/, '');
    const prompt = `Analise este PDF de orçamento de impermeabilização e extraia os dados. Retorne um JSON com EXATAMENTE estes campos: { "cliente": string, "endereco": string, "bairro": string, "cidade": string, "cep": string, "ac": string (síndico ou responsável), "celular": string, "garantia": number (15 ou 7), "dataOrcamento": string (formato YYYY-MM-DD) ou null, "locais": [ { "nome": string, "andar": string ou null, "trinca": number (metros), "juntaFria": number (metros), "ralo": number (unidades), "juntaDilat": number (metros), "ferragem": number (metros), "cortina": number (m2) } ], "totalBruto": number }. Use null para campos ausentes. Todos os valores numéricos devem ser números, não strings. Certifique-se que "locais" seja um array.`;

    const dados = await geminiExtrairPdf(pdfBase64, prompt, 8192);
    res.json({ success: true, dados });
  } catch (err) {
    log('error', 'integracao/extrair-orcamento:', err.message);
    res.status(err.message.includes('não configurada') ? 503 : 422).json({ error: err.message });
  }
});

// Extrai fotos e locais do Word (.docx) do relatório fotográfico via mammoth
app.post('/api/integracao/extrair-relatorio', auth, bigJson, async (req, res) => {
  try {
    if (!mammothLib) return res.status(503).json({ error: 'mammoth não disponível — instale a dependência' });
    const { docx } = req.body;
    if (!docx) return res.status(400).json({ error: 'docx (base64) obrigatório' });

    const docxBase64 = docx.replace(/^data:[^;]+;base64,/, '');
    const buffer = Buffer.from(docxBase64, 'base64');

    // Extrai HTML com imagens inline como data URIs
    const result = await mammothLib.convertToHtml(
      { buffer },
      { convertImage: mammothLib.images.inline(img =>
          img.read('base64').then(b64 => ({ src: `data:${img.contentType};base64,${b64}` }))
      )}
    );

    const html = result.value;
    // Parseia HTML para extrair locais + fotos
    // Estratégia: blocos de heading/strong antes de img → nome do local
    const locais = [];
    let localAtual = null;

    // Extrai sequências de (heading|paragraph) → (img+)
    const tokenRegex = /<(h[1-6]|p)[^>]*>(.*?)<\/\1>/gi;
    const imgRegex = /<img[^>]+src="([^"]+)"/gi;

    // Substitui entidades HTML simples
    const decodHtml = s => s
      .replace(/<[^>]+>/g, ' ')
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&nbsp;/g, ' ').replace(/&#\d+;/g, '').trim();

    // Tokeniza o HTML em blocos texto + imagem
    const tokens = [];
    let lastIdx = 0;
    const blockRe = /<(?:h[1-6]|p|img)[^>]*>(?:.*?)<\/(?:h[1-6]|p)>|<img[^>]+>/gis;
    let m;
    while ((m = blockRe.exec(html)) !== null) {
      const tag = m[0];
      if (tag.startsWith('<img')) {
        const srcM = /src="([^"]+)"/.exec(tag);
        if (srcM) tokens.push({ type: 'img', src: srcM[1] });
      } else {
        const text = decodHtml(tag);
        if (text.length > 1) tokens.push({ type: 'text', text });
      }
    }

    // Agrupa: texto seguido de imagens = local
    for (let i = 0; i < tokens.length; i++) {
      const tok = tokens[i];
      if (tok.type === 'text') {
        // Verifica se há imagem logo a seguir
        const nextImgs = [];
        let j = i + 1;
        while (j < tokens.length && tokens[j].type === 'img') {
          nextImgs.push(tokens[j].src);
          j++;
        }
        if (nextImgs.length > 0) {
          // Inicia novo local ou adiciona ao atual com mesmo nome
          const nomeNorm = tok.text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
          const existing = locais.find(l => {
            const en = l.nome.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
            return en === nomeNorm || en.includes(nomeNorm) || nomeNorm.includes(en);
          });
          if (existing) {
            existing.fotos.push(...nextImgs);
          } else {
            locais.push({ nome: tok.text, fotos: nextImgs });
          }
          i = j - 1; // pula os imgs já consumidos
        } else if (nextImgs.length === 0 && localAtual) {
          // texto sem imgs após — não cria local mas atualiza referência
        }
      }
    }

    res.json({ success: true, locais, totalFotos: locais.reduce((s, l) => s + l.fotos.length, 0) });
  } catch (err) {
    log('error', 'integracao/extrair-relatorio:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Extrai dados do PDF de contrato via Gemini
app.post('/api/integracao/extrair-contrato', auth, bigJson, async (req, res) => {
  try {
    const { pdf } = req.body;
    if (!pdf) return res.status(400).json({ error: 'pdf (base64) obrigatório' });

    const pdfBase64 = pdf.replace(/^data:[^;]+;base64,/, '');
    const prompt = `Analise este PDF de contrato de impermeabilização e extraia os dados. Retorne um JSON com EXATAMENTE estes campos: { "numeroContrato": number (número do contrato, geralmente aparece no topo como "Contrato Nº" ou "Nº" — extraia apenas o inteiro) ou null, "razaoSocial": string, "cnpjCliente": string, "cpfResponsavel": string, "rgResponsavel": string, "sindico": string, "dataAssinatura": string (YYYY-MM-DD) ou null, "dataInicio": string (YYYY-MM-DD) ou null, "dataTermino": string (YYYY-MM-DD) ou null, "prazoExecucao": number (dias úteis) ou null, "garantia": number (15 ou 7), "totalLiquido": number, "parcelas": number (inteiro), "valorParcela": number, "obsGeral": string ou null }. Use null para campos ausentes. Todos os valores numéricos devem ser números, não strings.`;

    const dados = await geminiExtrairPdf(pdfBase64, prompt, 2048);
    res.json({ success: true, dados });
  } catch (err) {
    log('error', 'integracao/extrair-contrato:', err.message);
    res.status(err.message.includes('não configurada') ? 503 : 422).json({ error: err.message });
  }
});

// Cria medição + orçamento + contrato com dados da integração
app.post('/api/integracao/criar', auth, bigJson, async (req, res) => {
  try {
    await connectDB();
    const { dadosOrcamento, dadosContrato, locaisComFotos, numeroOriginal } = req.body;
    if (!dadosOrcamento) return res.status(400).json({ error: 'dadosOrcamento obrigatório' });

    const cfg = await getConfig();
    const precos = cfg.precos || {};

    // Se foi informado um número original (contrato legado), usa ele em TODA a cadeia
    // (medição = orçamento = contrato = OS = garantia com o mesmo número)
    const usarNumeroLegado = numeroOriginal && Number.isFinite(parseInt(numeroOriginal, 10))
      ? parseInt(numeroOriginal, 10)
      : null;

    // ── 1. Criar Medição ─────────────────────────────────────────────────────
    let numMedicao;
    if (usarNumeroLegado) {
      // Usa número do contrato legado, sem mexer no contador global
      numMedicao = usarNumeroLegado;
    } else {
      numMedicao = precos.numMedicao;
      if (!numMedicao) {
        const count = await Medicao.countDocuments();
        numMedicao = count + 1;
      }
      await Config.findByIdAndUpdate('main', { 'precos.numMedicao': numMedicao + 1 });
    }

    // Mescla fotos do relatório nos locais pelo nome (matching normalizado)
    const normNome = s => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
    const locaisComFotosMap = {};
    (locaisComFotos || []).forEach(l => { locaisComFotosMap[normNome(l.nome)] = l.fotos || []; });

    const locaisMedicao = (dadosOrcamento.locais || []).map(l => {
      const nNorm = normNome(l.nome);
      // Tenta match exato, depois parcial
      let fotos = locaisComFotosMap[nNorm];
      if (!fotos) {
        const key = Object.keys(locaisComFotosMap).find(k => k.includes(nNorm) || nNorm.includes(k));
        fotos = key ? locaisComFotosMap[key] : [];
      }
      return {
        ...l,
        fotos: (fotos || []).map(f => ({ data: f })),
      };
    });

    const createdAt = dadosOrcamento.dataOrcamento
      ? new Date(dadosOrcamento.dataOrcamento + 'T12:00:00').getTime()
      : Date.now();

    const medicaoId = uuidv4();
    const medicao = await Medicao.create({
      _id: medicaoId,
      numeroMedicao: numMedicao,
      status: 'recebida',
      user: 'integracao',
      origem: 'integracao',
      createdAt,
      cliente: dadosOrcamento.cliente || '',
      endereco: dadosOrcamento.endereco || '',
      bairro: dadosOrcamento.bairro || '',
      cidade: dadosOrcamento.cidade || '',
      cep: dadosOrcamento.cep || '',
      ac: dadosOrcamento.ac || '',
      celular: dadosOrcamento.celular || '',
      garantia: String(dadosOrcamento.garantia || '15'),
      dataMedicao: dadosOrcamento.dataOrcamento || null,
      locais: locaisMedicao,
    });

    // ── 2. Criar Orçamento ────────────────────────────────────────────────────
    let numOrcamento;
    if (usarNumeroLegado) {
      numOrcamento = usarNumeroLegado;
    } else {
      numOrcamento = precos.numOrcamento || 1;
      await Config.findByIdAndUpdate('main', { $inc: { 'precos.numOrcamento': 1 } });
    }

    const totals = { trinca: 0, juntaFria: 0, ralo: 0, juntaDilat: 0, ferragem: 0, cortina: 0 };
    locaisMedicao.forEach(l => {
      totals.trinca    += Number(l.trinca)    || 0;
      totals.juntaFria += Number(l.juntaFria) || 0;
      totals.ralo      += Number(l.ralo)      || 0;
      totals.juntaDilat+= Number(l.juntaDilat)|| 0;
      totals.ferragem  += Number(l.ferragem)  || 0;
      totals.cortina   += Number(l.cortina)   || 0;
    });

    const obra = calcObra(totals);
    const itens = [
      { tipo: 'trinca',     descricao: 'Trincas',                quantidade: totals.trinca,     unidade: 'm',    valorUnit: precos.trinca     || 950,  subtotal: totals.trinca     * (precos.trinca     || 950)  },
      { tipo: 'juntaFria',  descricao: 'Juntas Frias',           quantidade: totals.juntaFria,  unidade: 'm',    valorUnit: precos.juntaFria  || 950,  subtotal: totals.juntaFria  * (precos.juntaFria  || 950)  },
      { tipo: 'ralo',       descricao: 'Ralos',                  quantidade: totals.ralo,       unidade: 'unid', valorUnit: precos.ralo       || 750,  subtotal: totals.ralo       * (precos.ralo       || 750)  },
      { tipo: 'juntaDilat', descricao: 'Juntas de Dilatação',    quantidade: totals.juntaDilat, unidade: 'm',    valorUnit: precos.juntaDilat || 950,  subtotal: totals.juntaDilat * (precos.juntaDilat || 950)  },
      { tipo: 'ferragem',   descricao: 'Tratamento de Ferragens',quantidade: totals.ferragem,   unidade: 'm',    valorUnit: precos.ferragem   || 120,  subtotal: totals.ferragem   * (precos.ferragem   || 120)  },
      { tipo: 'cortina',    descricao: 'Cortinas',               quantidade: totals.cortina,    unidade: 'm²',   valorUnit: precos.cortina    || 1020, subtotal: totals.cortina    * (precos.cortina    || 1020) },
      { tipo: 'art',        descricao: 'ART Engº',               quantidade: 1,                 unidade: 'unid', valorUnit: precos.art        || 300,  subtotal: precos.art        || 300  },
      { tipo: 'mobilizacao',descricao: 'Mobilização',            quantidade: 1,                 unidade: 'unid', valorUnit: precos.mobilizacao|| 300,  subtotal: precos.mobilizacao|| 300  },
    ];

    // Se tiver totalBruto do PDF, usa ele; senão calcula dos itens
    const totalBrutoCalculado = itens.reduce((s, i) => s + i.subtotal, 0);
    const totalBruto = dadosOrcamento.totalBruto || totalBrutoCalculado;
    const totalLiquidoOrc = dadosContrato?.totalLiquido || totalBruto;

    const orcamentoId = uuidv4();
    const orcamento = await Orcamento.create({
      _id: orcamentoId,
      numero: numOrcamento,
      medicaoId,
      numeroMedicao: numMedicao,
      status: 'aprovado',
      createdAt,
      updatedAt: Date.now(),
      origem: 'integracao',
      cliente: dadosOrcamento.cliente || '',
      endereco: dadosOrcamento.endereco || '',
      bairro: dadosOrcamento.bairro || '',
      cidade: dadosOrcamento.cidade || '',
      cep: dadosOrcamento.cep || '',
      ac: dadosOrcamento.ac || '',
      celular: dadosOrcamento.celular || '',
      dataOrcamento: dadosOrcamento.dataOrcamento
        ? new Date(dadosOrcamento.dataOrcamento).toLocaleDateString('pt-BR')
        : new Date().toLocaleDateString('pt-BR'),
      garantia: Number(dadosOrcamento.garantia) || 15,
      itens,
      totalBruto,
      desconto: 0,
      descontoTipo: 'percent',
      totalLiquido: totalLiquidoOrc,
      entrada: 0,
      saldo: totalLiquidoOrc,
      parcelas: dadosContrato?.parcelas || 1,
      valorParcela: dadosContrato?.valorParcela || totalLiquidoOrc,
      locais: locaisMedicao,
      diasTrabalho: obra.diasTrabalho,
      consumoProduto: obra.consumoProduto,
      qtdInjetores: obra.qtdInjetores,
    });

    // ── 3. Criar Contrato ─────────────────────────────────────────────────────
    const contratoId = uuidv4();
    const parcelas = dadosContrato?.parcelas || 1;
    const valorParcela = dadosContrato?.valorParcela || totalLiquidoOrc / parcelas;

    const contrato = await Contrato.create({
      _id: contratoId,
      numero: numOrcamento, // mesmo número do orçamento
      orcamentoId,
      status: 'assinado',
      createdAt,
      updatedAt: Date.now(),
      origem: 'integracao',
      cliente: dadosOrcamento.cliente || '',
      endereco: dadosOrcamento.endereco || '',
      bairro: dadosOrcamento.bairro || '',
      cidade: dadosOrcamento.cidade || '',
      cep: dadosOrcamento.cep || '',
      ac: dadosOrcamento.ac || '',
      celular: dadosOrcamento.celular || '',
      razaoSocial: dadosContrato?.razaoSocial || dadosOrcamento.cliente || '',
      cnpjCliente: dadosContrato?.cnpjCliente || '',
      cpfResponsavel: dadosContrato?.cpfResponsavel || '',
      rgResponsavel: dadosContrato?.rgResponsavel || '',
      sindico: dadosContrato?.sindico || dadosOrcamento.ac || '',
      dataAssinatura: dadosContrato?.dataAssinatura || '',
      dataInicio: dadosContrato?.dataInicio || '',
      dataTermino: dadosContrato?.dataTermino || '',
      foro: 'Rio de Janeiro',
      garantia: Number(dadosContrato?.garantia || dadosOrcamento.garantia) || 15,
      prazoExecucao: dadosContrato?.prazoExecucao || 3,
      totalBruto,
      totalLiquido: totalLiquidoOrc,
      desconto: 0,
      descontoTipo: 'percent',
      parcelas,
      valorParcela,
      parcelasContrato: [],
      locais: locaisMedicao,
      itens: itens.filter(i => i.quantidade > 0),
      cronograma: locaisMedicao.map(l => ({ local: l.nome || '', dataInicio: '', dataFim: '' })),
      diasTrabalho: obra.diasTrabalho,
      consumoProduto: obra.consumoProduto,
      qtdInjetores: obra.qtdInjetores,
      obsGeral: dadosContrato?.obsGeral || '',
      statusHistorico: [{ status: 'assinado', data: Date.now() }],
    });

    log('info', `Integração: criou medição ${numMedicao}, orçamento ${numOrcamento}, contrato ${numOrcamento}`);
    res.json({
      success: true,
      medicaoId,
      orcamentoId,
      contratoId,
      numeroMedicao: numMedicao,
      numeroOrcamento: numOrcamento,
    });
  } catch (err) {
    log('error', 'integracao/criar:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Adicionar fotos em lote a um local da medição (usado pela integração) ────
// Permite enviar fotos em chamadas pequenas, evitando o limite de 4.5MB do Vercel
app.post('/api/integracao/adicionar-fotos', auth, bigJson, async (req, res) => {
  try {
    await connectDB();
    const { medicaoId, nomeLocal, fotos } = req.body || {};
    if (!medicaoId || !nomeLocal || !Array.isArray(fotos) || fotos.length === 0) {
      return res.status(400).json({ error: 'medicaoId, nomeLocal e fotos[] obrigatórios' });
    }
    const medicao = await Medicao.findById(medicaoId);
    if (!medicao) return res.status(404).json({ error: 'Medição não encontrada' });

    const normNome = s => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
    const nNorm = normNome(nomeLocal);
    let idxLocal = (medicao.locais || []).findIndex(l => normNome(l.nome) === nNorm);
    if (idxLocal < 0) {
      idxLocal = (medicao.locais || []).findIndex(l => {
        const k = normNome(l.nome);
        return k.includes(nNorm) || nNorm.includes(k);
      });
    }
    if (idxLocal < 0) return res.status(404).json({ error: `Local "${nomeLocal}" não encontrado na medição` });

    const fotosExistentes = medicao.locais[idxLocal].fotos || [];
    const novasFotos = fotos.map(f => ({ data: f }));
    medicao.locais[idxLocal].fotos = [...fotosExistentes, ...novasFotos];
    medicao.markModified('locais');
    await medicao.save();

    res.json({ ok: true, totalFotos: medicao.locais[idxLocal].fotos.length });
  } catch (err) {
    log('error', 'integracao/adicionar-fotos:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── SPA fallback ──────────────────────────────────────────────────────────────

if (process.env.NODE_ENV === 'production') {
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    res.sendFile(path.join(__dirname, 'dist', 'index.html'));
  });
}

// ── Debug ─────────────────────────────────────────────────────────────────────
app.get('/api/debug-zapsign', (req, res) => {
  const token = process.env.ZAPSIGN_API_TOKEN || '2822110f-b238-480f-b8b6-f11c8697a2c64bb7c8fd-5888-479d-9d98-a6c3b0034950';
  res.json({
    build: 'v4-producao',
    zapsign_base: 'https://api.zapsign.com.br/api/v1',
    token_prefix: token.substring(0, 8),
    token_env: process.env.ZAPSIGN_API_TOKEN ? 'SET' : 'NOT_SET'
  });
});

// ── Agenda de Visitas ─────────────────────────────────────────────────────────

const visitaSchema = new mongoose.Schema({
  _id:             { type: String, default: () => uuidv4() },
  nomeCondominio:  { type: String, required: true },
  cep:             String,
  endereco:        String,
  bairro:          String,
  cidade:          String,
  estado:          String,
  nomeResponsavel: String,
  telefone:        String,
  observacao:      String,
  dataHora:        String,    // "YYYY-MM-DDTHH:mm"
  dataHoraFim:     String,    // opcional
  status:          { type: String, default: 'reservado' },
                              // 'reservado' | 'confirmado' | 'concluido' | 'cancelado'
  medidorEmail:       String,    // medidor que vai ao local (email do usuário medidor)
  medidorNome:        String,    // nome do medidor (desnormalizado para exibição)
  tecnicoResponsavel: String,    // técnico responsável (da lista de ConfigPage)
  criadoPor:          String,    // email do criador (admin/operador/medidor)
  criadoPorRole:      String,    // 'admin' | 'operador' | 'medidor' — usado pra decidir quem pode editar
  fotosCliente:       [String],  // fotos anexadas pelo operador (base64) — visíveis pro medidor
  concluidaEm:        Number,    // timestamp quando o medidor concluiu a medição
  medicaoId:          String,    // _id da medição criada a partir desta visita
  numeroMedicao:      Number,    // número da medição (para exibição rápida)
  createdAt:       { type: Number, default: Date.now },
  updatedAt:       { type: Number, default: Date.now },
}, { strict: false });
visitaSchema.index({ dataHora: 1 });
visitaSchema.index({ medidorEmail: 1, dataHora: 1 });
visitaSchema.index({ status: 1, dataHora: 1 });
const Visita = mongoose.models?.Visita || mongoose.model('Visita', visitaSchema);

// GET /api/visitas — lista visitas para o painel
// Acesso:
//   - admin / operador (Comercial/Orçamentos) → vê todas, pode filtrar por ?medidorEmail=
//   - medidor → só vê as suas próprias (medidorEmail === req.user.email)
// Modo 'misto': também combina eventos do Google Calendar dos medidores configurados em FollowupConexao
app.get('/api/visitas', auth, async (req, res) => {
  try {
    await connectDB();
    if (!isConnected) return res.json([]);
    const role = req.user?.role || 'medidor';
    const email = req.user?.email || '';
    const filter = {};

    if (role === 'medidor') {
      filter.medidorEmail = email;
    } else if (req.query.medidorEmail) {
      filter.medidorEmail = req.query.medidorEmail;
    }

    if (req.query.status) filter.status = req.query.status;
    if (req.query.mes) {
      const [y, m] = req.query.mes.split('-');
      const ini = `${y}-${m}-01T00:00`;
      const fim = `${y}-${String(Number(m)+1).padStart(2,'0')}-01T00:00`;
      filter.dataHora = { $gte: ini, $lt: fim };
    }
    // Corta `fotosCliente` (base64) da listagem para acelerar — economia de ~300KB.
    // Mantém um array placeholder de tamanho correto para a UI da AgendaVisitasView
    // que faz `v.fotosCliente.length > 0` continuar funcionando sem alteração.
    // Detalhe completo (com fotos reais) vem via GET /api/visitas/:id.
    const visitas = await Visita.aggregate([
      { $match: filter },
      { $sort: { dataHora: 1 } },
      { $addFields: {
        fotosClienteCount: { $size: { $ifNull: ['$fotosCliente', []] } },
      } },
      { $project: { fotosCliente: 0 } }, // remove o base64 pesado
    ]);
    const visitasComFonte = visitas.map(v => ({
      ...v,
      fonte: 'vedafacil',
      fotosCliente: v.fotosClienteCount > 0 ? new Array(v.fotosClienteCount).fill(1) : [],
    }));

    // ── Modo misto: também busca Google Calendar dos medidores configurados ─────
    let eventosGoogle = [];
    try {
      const cfg = await Config.findById('main').lean();
      if (cfg?.agendaMode === 'misto') {
        const conexoes = await FollowupConexao.find({ email: { $ne: '' } }).lean();
        // Se medidor logado, filtra só a conexão dele
        const conexoesAtivas = role === 'medidor'
          ? conexoes.filter(c => c.email === email)
          : (req.query.medidorEmail
              ? conexoes.filter(c => c.email === req.query.medidorEmail)
              : conexoes);

        // Busca eventos de cada medidor em paralelo
        const resultados = await Promise.all(conexoesAtivas.map(async c => {
          const u = await User.findById(c.email).lean();
          if (!u) return [];
          try {
            const events = await fetchCalendarEventsForUser(u, 60); // próximos 60 dias
            return events.map(e => {
              const start = e.start?.dateTime || e.start?.date || '';
              const end   = e.end?.dateTime   || e.end?.date   || '';
              return {
                _id:             'gcal_' + e.id,
                fonte:           'google',
                nomeCondominio:  e.summary || '(sem título)',
                dataHora:        start.slice(0, 16),
                dataHoraFim:     end.slice(0, 16),
                endereco:        e.location || '',
                observacao:      e.description || '',
                medidorEmail:    c.email,
                medidorNome:     c.nomeExibicao || c.tecnico,
                status:          'confirmado', // eventos Google são tratados como confirmados
                readOnly:        true, // não pode ser editado/excluído pelo painel
              };
            });
          } catch (e) { console.warn('Google Calendar fetch error:', c.email, e.message); return []; }
        }));
        eventosGoogle = resultados.flat();

        // Aplica filtro de mês também aos eventos Google
        if (req.query.mes) {
          eventosGoogle = eventosGoogle.filter(ev => (ev.dataHora || '').startsWith(req.query.mes));
        }
      }
    } catch (e) { console.warn('Erro buscando eventos Google:', e.message); }

    res.json([...visitasComFonte, ...eventosGoogle].sort((a, b) => (a.dataHora || '').localeCompare(b.dataHora || '')));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/visitas — criar visita (pelo painel: admin/operador)
app.post('/api/visitas', auth, bigJson, async (req, res) => {
  try {
    await connectDB();
    if (!isConnected) return res.status(503).json({ error: 'DB offline' });
    const dados = {
      ...req.body,
      criadoPor: req.user?.email || req.user?.username || 'painel',
      criadoPorRole: req.user?.role || 'operador',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    const visita = await Visita.create(dados);
    res.status(201).json(visita);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /api/visitas/:id — editar visita
app.put('/api/visitas/:id', auth, bigJson, async (req, res) => {
  try {
    await connectDB();
    if (!isConnected) return res.status(503).json({ error: 'DB offline' });

    const updates = { ...req.body, updatedAt: Date.now() };

    // ── REAGENDAMENTO de visita já CONCLUÍDA ────────────────────────────────
    // Se o operador mudou a dataHora pra uma data futura E a visita estava 'concluido',
    // entendemos como reagendamento: limpa a marca de conclusão e volta pra 'confirmado'
    // (caso contrário a visita ficava acinzentada no painel e nao aparecia pro medidor).
    // A medição original NÃO é deletada — ficamos com o histórico, mas o vínculo é cortado.
    let unsets = null;
    if (updates.dataHora) {
      const atual = await Visita.findById(req.params.id).lean();
      if (atual && atual.status === 'concluido') {
        // Compara em horário de Brasília (visitas são salvas como "YYYY-MM-DDTHH:mm" local)
        const agoraSP = new Date().toLocaleString('sv-SE', { timeZone: 'America/Sao_Paulo' }).replace(' ', 'T').slice(0, 16);
        if (String(updates.dataHora) >= agoraSP) {
          updates.status = 'confirmado';
          unsets = { concluidaEm: '', medicaoId: '', numeroMedicao: '' };
          // IMPORTANTE: remove esses campos do $set pra evitar conflito Mongo
          // ("Updating the path 'concluidaEm' would create a conflict at 'concluidaEm'")
          delete updates.concluidaEm;
          delete updates.medicaoId;
          delete updates.numeroMedicao;
          log('info', `Visita ${req.params.id} reagendada: ${atual.dataHora} → ${updates.dataHora} (status concluido → confirmado)`);
        }
      }
    }

    const updateOp = unsets
      ? { $set: updates, $unset: unsets }
      : { $set: updates };
    const v = await Visita.findByIdAndUpdate(req.params.id, updateOp, { new: true });
    if (!v) return res.status(404).json({ error: 'Visita não encontrada' });
    res.json(v);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PATCH /api/visitas/:id/confirmar — muda status reservado → confirmado
app.patch('/api/visitas/:id/confirmar', auth, async (req, res) => {
  try {
    await connectDB();
    if (!isConnected) return res.status(503).json({ error: 'DB offline' });
    const novoStatus = req.body.status || 'confirmado'; // permite cancelar tb
    const v = await Visita.findByIdAndUpdate(
      req.params.id,
      { $set: { status: novoStatus, updatedAt: Date.now() } },
      { new: true }
    );
    if (!v) return res.status(404).json({ error: 'Visita não encontrada' });
    res.json(v);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /api/visitas/:id — soft delete (admin ou operador)
app.delete('/api/visitas/:id', auth, async (req, res) => {
  try {
    await connectDB();
    if (!isConnected) return res.status(503).json({ error: 'DB offline' });
    await audit(req, 'delete', 'visita', req.params.id);
    const v = await Visita.findById(req.params.id).lean();
    if (v) await salvarNaLixeira('visita', 'Visita', 'visitas', v, req.user?.email || req.user?.username);
    await Visita.findByIdAndDelete(req.params.id);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Helper: identifica o email do medidor a partir do token (JWT painel ou Google) ─
// Retorna { medidorEmail } ou { error, status } pra resposta direta.
async function _identifyMedidor(req) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace(/^Bearer\s+/i, '');
  if (!token) return { error: 'Token obrigatório', status: 401 };
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    // No modo master, usa targetEmail (medidor que está sendo visualizado)
    return { medidorEmail: payload.targetEmail || payload.email || null };
  } catch {
    // Token Google direto — consulta userinfo
    const gResp = await fetch('https://www.googleapis.com/oauth2/v1/userinfo', {
      headers: { Authorization: `Bearer ${token}` }
    }).catch(() => null);
    if (!gResp || !gResp.ok) return { error: 'Token inválido', status: 401 };
    const userInfo = await gResp.json();
    return { medidorEmail: userInfo.email || null };
  }
}

// GET /api/visitas/medidor — visitas confirmadas para o PWA Medidor
// Aceita JWT do painel (admin/operador/medidor/medidor-master) ou token Google direto.
// Retorna visitas DELE + dos medidores em `agendaPara` (se ele puder agendar pra outros).
// Cada visita ganha:
//   - propria: true se for do próprio medidor logado
//   - podeEditar: true se foi criada por medidor (ele ou alguém que ele pode agendar)
app.get('/api/visitas/medidor', async (req, res) => {
  try {
    const id = await _identifyMedidor(req);
    if (id.error) return res.status(id.status).json({ error: id.error });
    if (!id.medidorEmail) return res.status(401).json({ error: 'Não foi possível identificar o medidor' });
    const medidorEmail = id.medidorEmail;

    await connectDB();
    if (!isConnected) return res.json({ visitas: [] });

    // Carrega permissões do medidor pra saber se vê visitas de colegas
    const usr = await User.findOne({ email: medidorEmail }).select('podeAgendar agendaPara').lean();
    const podeAgendar = !!usr?.podeAgendar;
    const agendaPara = Array.isArray(usr?.agendaPara) ? usr.agendaPara.filter(e => e && e !== medidorEmail) : [];
    // Lista de emails cujas visitas ele pode VER (dele + os que ele pode agendar pra)
    const emailsVisiveis = [medidorEmail, ...agendaPara];

    // Usa horário de Brasília — visitas são salvas em horário local (YYYY-MM-DDTHH:mm)
    const fmtLocal = (d) => d.toLocaleString('sv-SE', { timeZone: 'America/Sao_Paulo' }).replace(' ', 'T').slice(0, 16);
    // Mostra TODAS as visitas a partir do início do dia atual (00:00 SP) — incluindo
    // as que já passaram do horário (o medidor pode chegar atrasado, ou ainda não ter
    // concluído a medição). Antes filtrava `agora - 1h` e as visitas da manhã sumiam à tarde.
    const hoje0h = new Date();
    const hoje0hSP = hoje0h.toLocaleString('sv-SE', { timeZone: 'America/Sao_Paulo' }).slice(0, 10);
    const agora = hoje0hSP + 'T00:00';
    const limite = fmtLocal(new Date(Date.now() + 30 * 86400000));

    const visitas = await Visita.find({
      status: 'confirmado',
      medidorEmail: { $in: emailsVisiveis },
      dataHora: { $gte: agora, $lte: limite },
    }).sort({ dataHora: 1 }).lean();

    // Anota cada visita com flags de UX:
    //   - propria: se é dele
    //   - podeEditar: só medidor (não foi escritório que criou)
    //   - criadorEhEscritorio: true se criadoPorRole indica admin/operador
    const visitasAnotadas = visitas.map(v => {
      const criadorEhEscritorio = v.criadoPorRole === 'admin' || v.criadoPorRole === 'operador';
      return {
        ...v,
        fonte: 'vedafacil',
        propria: v.medidorEmail === medidorEmail,
        criadorEhEscritorio,
        podeEditar: !criadorEhEscritorio,
      };
    });

    res.json({ visitas: visitasAnotadas, fonte: 'vedafacil', medidorEmail, podeAgendar, agendaPara });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/medidor/agenda-para — info do medidor + lista de outros medidores que ele pode agendar
// Retorna: { podeAgendar, agendaPara: [{ email, name }] }
app.get('/api/medidor/agenda-para', async (req, res) => {
  try {
    const id = await _identifyMedidor(req);
    if (id.error) return res.status(id.status).json({ error: id.error });
    if (!id.medidorEmail) return res.status(401).json({ error: 'Não foi possível identificar o medidor' });

    await connectDB();
    if (!isConnected) return res.json({ podeAgendar: false, agendaPara: [] });

    const usr = await User.findOne({ email: id.medidorEmail }).select('podeAgendar agendaPara name podeGerirEquipes').lean();
    if (!usr) return res.json({ podeAgendar: false, agendaPara: [], podeGerirEquipes: false });

    // Resolve nomes dos emails em agendaPara
    const emailsExtra = Array.isArray(usr.agendaPara) ? usr.agendaPara.filter(e => e && e !== id.medidorEmail) : [];
    let outros = [];
    if (emailsExtra.length > 0) {
      const usuariosExtra = await User.find({ email: { $in: emailsExtra }, role: 'medidor' }).select('email name').lean();
      outros = usuariosExtra.map(u => ({ email: u.email, name: u.name || u.email }));
    }

    res.json({
      podeAgendar: !!usr.podeAgendar,
      podeGerirEquipes: !!usr.podeGerirEquipes,
      meuEmail: id.medidorEmail,
      meuNome: usr.name || id.medidorEmail,
      agendaPara: outros,
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/medidor/visitas — medidor cria visita (já nasce confirmada)
// Permite criar pra ele mesmo OU pra qualquer medidor em agendaPara.
app.post('/api/medidor/visitas', bigJson, async (req, res) => {
  try {
    const id = await _identifyMedidor(req);
    if (id.error) return res.status(id.status).json({ error: id.error });
    if (!id.medidorEmail) return res.status(401).json({ error: 'Não foi possível identificar o medidor' });

    await connectDB();
    if (!isConnected) return res.status(503).json({ error: 'DB offline' });

    const usr = await User.findOne({ email: id.medidorEmail }).select('podeAgendar agendaPara name role').lean();
    if (!usr || !usr.podeAgendar) {
      return res.status(403).json({ error: 'Você não tem permissão para agendar visitas. Solicite ao administrador.' });
    }

    const alvoEmail = req.body.medidorEmail || id.medidorEmail;
    const emailsPermitidos = [id.medidorEmail, ...(Array.isArray(usr.agendaPara) ? usr.agendaPara : [])];
    if (!emailsPermitidos.includes(alvoEmail)) {
      return res.status(403).json({ error: `Você não pode agendar visitas para ${alvoEmail}.` });
    }

    // Resolve nome do medidor alvo (caso seja outro)
    let medidorNome = req.body.medidorNome || '';
    if (!medidorNome) {
      if (alvoEmail === id.medidorEmail) {
        medidorNome = usr.name || id.medidorEmail;
      } else {
        const target = await User.findOne({ email: alvoEmail }).select('name').lean();
        medidorNome = target?.name || alvoEmail;
      }
    }

    const dados = {
      ...req.body,
      medidorEmail: alvoEmail,
      medidorNome,
      status: 'confirmado',                  // medidor cria já confirmado
      criadoPor: id.medidorEmail,
      criadoPorRole: 'medidor',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    const visita = await Visita.create(dados);
    res.status(201).json(visita);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /api/medidor/visitas/:id — medidor edita visita
// REGRA: só pode editar visitas criadas por medidor (não pelo escritório).
app.put('/api/medidor/visitas/:id', bigJson, async (req, res) => {
  try {
    const id = await _identifyMedidor(req);
    if (id.error) return res.status(id.status).json({ error: id.error });
    if (!id.medidorEmail) return res.status(401).json({ error: 'Não foi possível identificar o medidor' });

    await connectDB();
    if (!isConnected) return res.status(503).json({ error: 'DB offline' });

    const usr = await User.findOne({ email: id.medidorEmail }).select('podeAgendar agendaPara').lean();
    if (!usr || !usr.podeAgendar) {
      return res.status(403).json({ error: 'Você não tem permissão para agendar visitas.' });
    }

    const visita = await Visita.findById(req.params.id).lean();
    if (!visita) return res.status(404).json({ error: 'Visita não encontrada' });

    // REGRA 1: visita criada pelo escritório → bloqueia
    if (visita.criadoPorRole === 'admin' || visita.criadoPorRole === 'operador') {
      return res.status(403).json({
        error: 'Esta visita foi criada pelo escritório. Para alterar, fale com a equipe do escritório.',
        criadoPorEscritorio: true,
      });
    }

    // REGRA 2: só edita visita dele OU de quem ele pode agendar
    const emailsPermitidos = [id.medidorEmail, ...(Array.isArray(usr.agendaPara) ? usr.agendaPara : [])];
    if (!emailsPermitidos.includes(visita.medidorEmail)) {
      return res.status(403).json({ error: 'Você não tem permissão para editar esta visita.' });
    }

    // Atualiza preservando metadados críticos (criador, role, status sempre confirmado)
    const updates = {
      ...req.body,
      criadoPor: visita.criadoPor,
      criadoPorRole: visita.criadoPorRole,
      status: 'confirmado',
      updatedAt: Date.now(),
    };
    // Permite trocar o alvo (medidor) só pra quem ele pode agendar
    if (updates.medidorEmail && !emailsPermitidos.includes(updates.medidorEmail)) {
      return res.status(403).json({ error: `Você não pode atribuir esta visita para ${updates.medidorEmail}.` });
    }
    const atualizada = await Visita.findByIdAndUpdate(req.params.id, updates, { new: true }).lean();
    res.json(atualizada);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /api/medidor/visitas/:id — medidor cancela visita (vai pra lixeira)
app.delete('/api/medidor/visitas/:id', async (req, res) => {
  try {
    const id = await _identifyMedidor(req);
    if (id.error) return res.status(id.status).json({ error: id.error });
    if (!id.medidorEmail) return res.status(401).json({ error: 'Não foi possível identificar o medidor' });

    await connectDB();
    if (!isConnected) return res.status(503).json({ error: 'DB offline' });

    const usr = await User.findOne({ email: id.medidorEmail }).select('podeAgendar agendaPara').lean();
    if (!usr || !usr.podeAgendar) {
      return res.status(403).json({ error: 'Você não tem permissão para cancelar visitas.' });
    }

    const visita = await Visita.findById(req.params.id).lean();
    if (!visita) return res.status(404).json({ error: 'Visita não encontrada' });

    if (visita.criadoPorRole === 'admin' || visita.criadoPorRole === 'operador') {
      return res.status(403).json({
        error: 'Esta visita foi criada pelo escritório. Para cancelar, fale com a equipe do escritório.',
        criadoPorEscritorio: true,
      });
    }

    const emailsPermitidos = [id.medidorEmail, ...(Array.isArray(usr.agendaPara) ? usr.agendaPara : [])];
    if (!emailsPermitidos.includes(visita.medidorEmail)) {
      return res.status(403).json({ error: 'Você não tem permissão para cancelar esta visita.' });
    }

    // Soft delete via Lixeira (regra do CLAUDE.md: jamais deleta direto)
    try {
      await salvarNaLixeira('visita', 'Visita', 'visitas', visita, id.medidorEmail);
      await Visita.findByIdAndDelete(req.params.id);
    } catch (lixErr) {
      // Fallback: marca como cancelada se a lixeira falhar
      await Visita.findByIdAndUpdate(req.params.id, { status: 'cancelado', updatedAt: Date.now() });
    }
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═════════════════════════════════════════════════════════════════════════════
// ENCARREGADO (Gestão de Equipes pelo PWA Medidor) — usado pelo Edson
// Todos exigem User.podeGerirEquipes === true
// ═════════════════════════════════════════════════════════════════════════════

// Helper: identifica o medidor encarregado e valida permissão
async function _identifyEncarregado(req) {
  const id = await _identifyMedidor(req);
  if (id.error) return id;
  if (!id.medidorEmail) return { error: 'Não foi possível identificar o medidor', status: 401 };
  const usr = await User.findOne({ email: id.medidorEmail }).select('podeGerirEquipes name').lean();
  if (!usr || !usr.podeGerirEquipes) {
    return { error: 'Você não tem permissão para gerir equipes.', status: 403 };
  }
  return { medidorEmail: id.medidorEmail, nome: usr.name || id.medidorEmail };
}

// GET /api/encarregado/dashboard?semana=YYYY-Www — visão geral por equipe
app.get('/api/encarregado/dashboard', async (req, res) => {
  try {
    const enc = await _identifyEncarregado(req);
    if (enc.error) return res.status(enc.status).json({ error: enc.error });

    await connectDB();
    if (!isConnected) return res.status(503).json({ error: 'DB offline' });

    const semana = req.query.semana || getISOWeekStr(new Date());
    const { start, end } = getWeekDateRange(semana);

    const equipes = await Equipe.find().lean();
    const fornecimentos = await FornecimentoEncarregado.find({ semana }).lean();
    const estoques = await EstoqueEquipeSemana.find({ semana }).lean();
    const todasOS = await OS.find({}, 'equipeId fechamentosDia consumoProduto qtdInjetores dataInicio dataTermino diasAtivos').lean();
    // Estoques histórico (saldo anterior)
    const todosEstoques = await EstoqueEquipeSemana.find().lean();

    const result = equipes.map(eq => {
      const fornProduto    = fornecimentos.filter(f => f.equipeId === eq._id && f.tipo === 'produto');
      const fornInjetores  = fornecimentos.filter(f => f.equipeId === eq._id && f.tipo === 'injetores');
      const forneceuProduto   = Math.round(fornProduto.reduce((s, f) => s + (f.quantidade || 0), 0) * 10) / 10;
      const forneceuInjetores = Math.round(fornInjetores.reduce((s, f) => s + (f.quantidade || 0), 0));
      const est = estoques.find(e => e.equipeId === eq._id) || {};
      const equipeDeclarouRecebido = est.recebido || 0;
      const equipeDeclarouInjetores = est.injetoresRecebidos || 0;

      // Saldo anterior de produto (real)
      const semanasAnteriores = todosEstoques.filter(e => e.equipeId === eq._id && e.semana < semana);
      let saldoAnteriorProduto = 0;
      for (const e of semanasAnteriores) {
        const { start: s, end: en } = getWeekDateRange(e.semana);
        saldoAnteriorProduto += (e.recebido || 0) - _somarConsumoReal(todasOS, eq._id, s, en);
      }
      if (saldoAnteriorProduto < 0) saldoAnteriorProduto = 0;
      saldoAnteriorProduto = Math.round(saldoAnteriorProduto * 10) / 10;

      const consumidoRealProduto = Math.round(_somarConsumoReal(todasOS, eq._id, start, end) * 10) / 10;
      const previsto = Math.round(_preverConsumoSemana(todasOS, eq._id, start, end) * 10) / 10;

      const discrepanciaProduto = Math.round((forneceuProduto - equipeDeclarouRecebido) * 10) / 10;
      const discrepanciaInjetores = forneceuInjetores - equipeDeclarouInjetores;

      return {
        equipeId: eq._id,
        equipeNome: eq.nome,
        semana,
        produto: {
          forneceu: forneceuProduto,
          equipeDeclarou: equipeDeclarouRecebido,
          saldoAnterior: saldoAnteriorProduto,
          consumidoReal: consumidoRealProduto,
          previsto,
          discrepancia: discrepanciaProduto,
        },
        injetores: {
          forneceu: forneceuInjetores,
          equipeDeclarou: equipeDeclarouInjetores,
          discrepancia: discrepanciaInjetores,
        },
        lancamentosProduto: fornProduto.map(f => ({ _id: f._id, quantidade: f.quantidade, ts: f.ts })).sort((a,b) => b.ts - a.ts),
        lancamentosInjetores: fornInjetores.map(f => ({ _id: f._id, quantidade: f.quantidade, ts: f.ts })).sort((a,b) => b.ts - a.ts),
      };
    });

    res.json({ semana, semanaRange: { start, end }, equipes: result });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/encarregado/fornecimento — { semana, equipeId, tipo, quantidade }
app.post('/api/encarregado/fornecimento', bigJson, async (req, res) => {
  try {
    const enc = await _identifyEncarregado(req);
    if (enc.error) return res.status(enc.status).json({ error: enc.error });

    await connectDB();
    if (!isConnected) return res.status(503).json({ error: 'DB offline' });

    const { semana, equipeId, tipo, quantidade } = req.body || {};
    if (!semana || !equipeId || !tipo || quantidade == null) {
      return res.status(400).json({ error: 'semana, equipeId, tipo e quantidade obrigatórios' });
    }
    if (!['produto', 'injetores'].includes(tipo)) {
      return res.status(400).json({ error: 'tipo deve ser produto ou injetores' });
    }
    const eq = await Equipe.findById(equipeId).select('nome').lean();
    if (!eq) return res.status(404).json({ error: 'Equipe não encontrada' });

    const f = await FornecimentoEncarregado.create({
      semana, equipeId, equipeNome: eq.nome, tipo,
      quantidade: parseFloat(quantidade),
      encarregadoEmail: enc.medidorEmail,
      encarregadoNome: enc.nome,
    });
    res.status(201).json(f);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /api/encarregado/fornecimento/:id
app.delete('/api/encarregado/fornecimento/:id', async (req, res) => {
  try {
    const enc = await _identifyEncarregado(req);
    if (enc.error) return res.status(enc.status).json({ error: enc.error });
    await connectDB();
    if (!isConnected) return res.status(503).json({ error: 'DB offline' });
    const r = await FornecimentoEncarregado.findByIdAndDelete(req.params.id);
    if (!r) return res.status(404).json({ error: 'Lançamento não encontrado' });
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/aplicador/confirmacoes-pendentes — fornecimentos não confirmados pela equipe
app.get('/api/aplicador/confirmacoes-pendentes', authEquipe, async (req, res) => {
  try {
    await connectDB();
    if (!isConnected) return res.status(503).json({ error: 'DB offline' });
    const equipeId = String(req.equipe.equipeId);
    const pendentes = await FornecimentoEncarregado.find({
      equipeId,
      confirmado: null,
    }).sort({ ts: 1 }).lean();
    res.json({ pendentes });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/aplicador/confirmacoes-pendentes/:id/responder
// Body: { aceita: bool, qtdReal?: number, divergenciaDesc?: string }
app.post('/api/aplicador/confirmacoes-pendentes/:id/responder', authEquipe, async (req, res) => {
  try {
    await connectDB();
    if (!isConnected) return res.status(503).json({ error: 'DB offline' });
    const { aceita, qtdReal, divergenciaDesc } = req.body || {};
    const f = await FornecimentoEncarregado.findById(req.params.id);
    if (!f) return res.status(404).json({ error: 'Não encontrado' });
    if (String(f.equipeId) !== String(req.equipe.equipeId)) return res.status(403).json({ error: 'Não autorizado' });
    f.confirmado = !!aceita;
    f.tsConfirmado = Date.now();
    if (!aceita) {
      f.qtdConfirmada = qtdReal != null ? parseFloat(qtdReal) : null;
      f.divergenciaDesc = divergenciaDesc || '';
    }
    await f.save();
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/encarregado/agenda-equipes?semana=YYYY-Www — OSes da semana por equipe
app.get('/api/encarregado/agenda-equipes', async (req, res) => {
  try {
    const enc = await _identifyEncarregado(req);
    if (enc.error) return res.status(enc.status).json({ error: enc.error });
    await connectDB();
    if (!isConnected) return res.status(503).json({ error: 'DB offline' });

    const semana = req.query.semana || getISOWeekStr(new Date());
    const { start, end } = getWeekDateRange(semana);

    const equipes = await Equipe.find().lean();
    // OSes que TOCAM essa semana
    const oses = await OS.find({
      $or: [
        { dataInicio: { $gte: start, $lte: end } },
        { dataTermino: { $gte: start, $lte: end } },
        { $and: [{ dataInicio: { $lte: start } }, { dataTermino: { $gte: end } }] },
      ],
    }, 'equipeId equipeNome cliente endereco bairro cidade dataInicio dataTermino status numero tipo consumoProduto qtdInjetores diasAtivos').lean();

    const result = equipes.map(eq => ({
      equipeId: eq._id,
      equipeNome: eq.nome,
      cor: eq.cor || '#888',
      oses: oses
        .filter(os => os.equipeId === eq._id)
        .sort((a, b) => (a.dataInicio || '').localeCompare(b.dataInicio || '')),
    }));

    res.json({ semana, semanaRange: { start, end }, equipes: result });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/admin/gestao-equipes?semana=YYYY-Www — espelho do encarregado/dashboard via JWT painel
app.get('/api/admin/gestao-equipes', auth, async (req, res) => {
  try {
    await connectDB();
    if (!isConnected) return res.status(503).json({ error: 'DB offline' });
    const semana = req.query.semana || getISOWeekStr(new Date());
    const { start, end } = getWeekDateRange(semana);
    const equipes = await Equipe.find().lean();
    const fornecimentos = await FornecimentoEncarregado.find({ semana }).lean();
    const estoques = await EstoqueEquipeSemana.find({ semana }).lean();
    const todasOS = await OS.find({}, 'equipeId fechamentosDia consumoProduto dataInicio dataTermino').lean();
    const todosEstoques = await EstoqueEquipeSemana.find().lean();

    const result = equipes.map(eq => {
      const fornProduto = fornecimentos.filter(f => f.equipeId === eq._id && f.tipo === 'produto');
      const fornInjetores = fornecimentos.filter(f => f.equipeId === eq._id && f.tipo === 'injetores');
      const forneceuProduto = Math.round(fornProduto.reduce((s, f) => s + (f.quantidade || 0), 0) * 10) / 10;
      const forneceuInjetores = Math.round(fornInjetores.reduce((s, f) => s + (f.quantidade || 0), 0));
      const est = estoques.find(e => e.equipeId === eq._id) || {};
      const equipeDeclarouRecebido = est.recebido || 0;

      const semanasAnteriores = todosEstoques.filter(e => e.equipeId === eq._id && e.semana < semana);
      let saldoAnterior = 0;
      for (const e of semanasAnteriores) {
        const { start: s, end: en } = getWeekDateRange(e.semana);
        saldoAnterior += (e.recebido || 0) - _somarConsumoReal(todasOS, eq._id, s, en);
      }
      if (saldoAnterior < 0) saldoAnterior = 0;
      saldoAnterior = Math.round(saldoAnterior * 10) / 10;

      const consumidoReal = Math.round(_somarConsumoReal(todasOS, eq._id, start, end) * 10) / 10;
      const saldoAtual = Math.round((saldoAnterior + forneceuProduto - consumidoReal) * 10) / 10;

      return {
        equipeId: eq._id,
        equipeNome: eq.nome,
        produto: {
          saldoAnterior,
          forneceu: forneceuProduto,
          equipeDeclarou: equipeDeclarouRecebido,
          consumidoReal,
          saldoAtual,
          discrepancia: Math.round((forneceuProduto - equipeDeclarouRecebido) * 10) / 10,
        },
        injetores: {
          forneceu: forneceuInjetores,
          equipeDeclarou: est.injetoresRecebidos || 0,
        },
        lancamentosProduto: [
          ...fornProduto.map(f => ({
            _id: f._id, quantidade: f.quantidade, ts: f.ts,
            confirmado: f.confirmado, qtdConfirmada: f.qtdConfirmada, divergenciaDesc: f.divergenciaDesc,
            fonte: 'empresa', encarregadoNome: f.encarregadoNome || '',
          })),
          ...(est.lancamentos || [])
            .filter(l => l.tipo === 'produto_recebido' && (l.litros || 0) > 0)
            .map(l => ({
              _id: `transf_${new Date(l.ts).getTime()}`,
              quantidade: l.litros || 0,
              ts: new Date(l.ts).getTime(),
              confirmado: null, qtdConfirmada: null, divergenciaDesc: '',
              fonte: 'transferencia',
              origemEquipeNome: String(l.membro || '').replace(/^transferido de\s*/i, ''),
            })),
        ].sort((a, b) => b.ts - a.ts),
      };
    });
    res.json({ semana, semanaRange: { start, end }, equipes: result });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/config/agenda-mode — retorna modo atual da agenda
app.get('/api/config/agenda-mode', auth, async (req, res) => {
  try {
    await connectDB();
    const cfg = isConnected ? await Config.findById('main').lean() : null;
    res.json({ agendaMode: cfg?.agendaMode || 'google' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/config/agenda-mode — muda modo da agenda (admin only)
app.post('/api/config/agenda-mode', auth, adminOnly, async (req, res) => {
  try {
    await connectDB();
    const { agendaMode } = req.body || {};
    if (!['google','misto','proprio'].includes(agendaMode)) {
      return res.status(400).json({ error: 'agendaMode inválido. Use: google, misto ou proprio' });
    }
    if (isConnected) await Config.findByIdAndUpdate('main', { agendaMode }, { upsert: true });
    await audit(req, 'update-agenda-mode', 'config', 'main', { agendaMode });
    res.json({ ok: true, agendaMode });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Follow-up Agendamento ─────────────────────────────────────────────────────

const followupConexaoSchema = new mongoose.Schema({
  tecnico:      { type: String, required: true, unique: true },
  nomeExibicao: String,
  email:        String,
}, { timestamps: true });
const FollowupConexao = mongoose.models?.FollowupConexao
  || mongoose.model('FollowupConexao', followupConexaoSchema);

// Seed inicial — garante que Edson e Fernando já estão configurados com os emails corretos
async function seedFollowupConexoes() {
  const defaults = [
    { tecnico: 'edson',    nomeExibicao: 'Edson',    email: 'encarregadovedafacil@gmail.com' },
    { tecnico: 'fernando', nomeExibicao: 'Fernando', email: 'comercialvedafacilrio@gmail.com' },
  ];
  for (const d of defaults) {
    try {
      // Cria se não existe; se já existe com email vazio, preenche o email
      await FollowupConexao.findOneAndUpdate(
        { tecnico: d.tecnico },
        {
          $setOnInsert: { tecnico: d.tecnico, nomeExibicao: d.nomeExibicao, email: d.email },
        },
        { upsert: true }
      );
      // Segunda passagem: garante email preenchido caso registro já existia sem email
      await FollowupConexao.updateOne(
        { tecnico: d.tecnico, $or: [{ email: { $exists: false } }, { email: '' }, { email: null }] },
        { $set: { email: d.email, nomeExibicao: d.nomeExibicao } }
      );
    } catch (e) { console.warn('seedFollowupConexoes', d.tecnico, e.message); }
  }
}

const followupLogSchema = new mongoose.Schema({
  eventoId:    String,
  tecnico:     String,
  tipo:        String,   // '24h' | '1h'
  telefone:    String,
  titulo:      String,
  eventoInicio: Date,
  status:      String,   // 'enviado' | 'erro'
  erro:        String,
}, { timestamps: true });
const FollowupLog = mongoose.models?.FollowupLog
  || mongoose.model('FollowupLog', followupLogSchema);

function extractPhone(text) {
  if (!text) return null;
  const m = text.match(/(?:\+?55\s*)?(?:\(?\s*0?\d{2}\s*\)?\s*)?\d{4,5}[\s.\-]?\d{4}/);
  if (!m) return null;
  let p = m[0].replace(/\D/g, '');
  if (p.length === 8)  p = '2199' + p;
  if (p.length === 9)  p = '21'   + p;
  if (p.length === 10) p = '55'   + p;
  if (p.length === 11) p = '55'   + p;
  if (!p.startsWith('55')) p = '55' + p;
  return (p.length >= 12 && p.length <= 14) ? p : null;
}

async function refreshGToken(userDoc) {
  if (!userDoc.googleRefreshToken) return userDoc.googleAccessToken || null;
  try {
    const r = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        refresh_token: userDoc.googleRefreshToken,
        client_id:     (process.env.GOOGLE_CLIENT_ID     || '').trim(),
        client_secret: (process.env.GOOGLE_CLIENT_SECRET || '').trim(),
        grant_type:    'refresh_token',
      }).toString(),
    });
    const d = await r.json();
    if (d.access_token) {
      await User.findOneAndUpdate({ _id: userDoc._id }, { $set: { googleAccessToken: d.access_token } });
      return d.access_token;
    }
  } catch (e) { console.warn('refreshGToken error:', e.message); }
  return userDoc.googleAccessToken || null;
}

async function fetchCalendarEventsForUser(userDoc, days = 14) {
  // Sempre tenta renovar o token — access tokens expiram em 1h
  let token = await refreshGToken(userDoc);
  if (!token) return [];

  // timeMin = ontem (para pegar eventos de hoje que já passaram)
  const timeMin = new Date(Date.now() - 86400000);
  timeMin.setHours(0, 0, 0, 0);
  const timeMax = new Date(Date.now() + days * 86400000);

  const params = new URLSearchParams({
    timeMin: timeMin.toISOString(),
    timeMax: timeMax.toISOString(),
    maxResults: '100',
    singleEvents: 'true',
    orderBy: 'startTime',
  });

  const r = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!r.ok) {
    const errText = await r.text().catch(() => '');
    console.warn('Calendar API error', r.status, errText.slice(0, 300), 'user:', userDoc._id);
    // Token expirado — tenta forçar refresh e tentar de novo
    if (r.status === 401) {
      const newToken = await refreshGToken({ ...userDoc, googleAccessToken: null });
      if (!newToken || newToken === token) return [];
      const r2 = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`,
        { headers: { Authorization: `Bearer ${newToken}` } }
      );
      if (!r2.ok) return [];
      const d2 = await r2.json();
      return d2.items || [];
    }
    return [];
  }
  const d = await r.json();
  return d.items || [];
}

async function evolutionRequest(path, method = 'GET', body = null) {
  const base = (process.env.EVOLUTION_API_URL || '').replace(/\/$/, '');
  const key  = process.env.EVOLUTION_API_KEY  || '';
  const inst = process.env.EVOLUTION_INSTANCE || 'vedafacil';
  if (!base || !key) throw new Error('Evolution API nao configurada (EVOLUTION_API_URL / EVOLUTION_API_KEY)');
  const opts = { method, headers: { 'Content-Type': 'application/json', 'apikey': key } };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(`${base}${path.replace(':inst', inst)}`, opts);
  const text = await r.text();
  try { return JSON.parse(text); } catch { return text; }
}

function buildReminderMsg(tipo, nomeExibicao, dataOuDatetime) {
  const dateStr = String(dataOuDatetime).split('T')[0];
  const [, m, d] = dateStr.split('-');
  const dia = `${d}/${m}`;
  if (tipo === 'vespera' || tipo === '24h') {
    return `Ola! 😊 Lembramos que *amanha, dia ${dia}*, esta agendada a visita tecnica da *Vedafacil*.\n\nNosso tecnico *${nomeExibicao}* ira ate voce para fazer a sua avaliacao.\nQualquer duvida, estamos a disposicao!`;
  }
  if (tipo === '1h') {
    return `Ola! ⏰ Daqui a pouco, nosso tecnico *${nomeExibicao}* da *Vedafacil* estara ai para a visita agendada (dia ${dia}). Esteja disponivel! 😊\n\nQualquer duvida, entre em contato.`;
  }
  // tipo === 'dia'
  return `Ola! ☀️ *Hoje, dia ${dia}*, nosso tecnico *${nomeExibicao}* da *Vedafacil* tem visita agendada com voce. Esteja disponivel! 😊\n\nQualquer duvida, entre em contato.`;
}

// helper: formata data em DD/MM/YYYY (formato brasileiro) — robusto contra
// strings ambíguas (ex: "12/06/2026" que o new Date() interpretaria como
// 12 de junho no formato US, virando 06/12/2026 — exatamente o bug do PDF).
// Aceita: YYYY-MM-DD, DD/MM/YYYY, ISO strings, Date objects, timestamps.
function fmtDateBR(d) {
  if (d == null || d === '') return '';
  const s = String(d).trim();
  if (!s) return '';
  // Já em DD/MM/YYYY (com ou sem zeros) — retorna padronizado
  let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return `${m[1].padStart(2,'0')}/${m[2].padStart(2,'0')}/${m[3]}`;
  // YYYY-MM-DD — converte direto sem tocar no Date parser (que vira US)
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  // Fallback: deixa o Date parser tentar (ISO completo, timestamp)
  const dt = new Date(d instanceof Date ? d : s);
  if (isNaN(dt.getTime())) return s;
  const dd = String(dt.getDate()).padStart(2, '0');
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${dt.getFullYear()}`;
}

// helper: retorna YYYY-MM-DD no fuso BRT
function hojeStr() {
  return new Date().toLocaleDateString('fr-CA', { timeZone: 'America/Sao_Paulo' }); // fr-CA = YYYY-MM-DD
}
function amanhaStr() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toLocaleDateString('fr-CA', { timeZone: 'America/Sao_Paulo' });
}

// helper: busca OS agendadas/em_andamento nos proximos N dias
async function fetchOsEventos(dias = 14) {
  const hoje = hojeStr();
  const limite = new Date();
  limite.setDate(limite.getDate() + dias);
  const limiteStr = limite.toLocaleDateString('fr-CA', { timeZone: 'America/Sao_Paulo' });
  return OS.find({
    status: { $in: ['agendada', 'em_andamento'] },
    dataInicio: { $gte: hoje, $lte: limiteStr },
    celular: { $exists: true, $ne: '' },
  }).lean();
}

// GET /api/followup/conexoes
app.get('/api/followup/conexoes', auth, adminOnly, async (req, res) => {
  try {
    await connectDB();
    await seedFollowupConexoes();
    const conexoes = await FollowupConexao.find().lean();
    const enriched = await Promise.all(conexoes.map(async c => {
      const user = c.email ? await User.findById(c.email)
        .select('name googleAccessToken googleRefreshToken').lean() : null;
      return { ...c, nomeUsuario: user?.name || null, tokenOk: !!(user?.googleAccessToken || user?.googleRefreshToken) };
    }));
    res.json(enriched);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/followup/conexoes
app.post('/api/followup/conexoes', auth, adminOnly, async (req, res) => {
  try {
    const { tecnico, nomeExibicao, email } = req.body || {};
    if (!tecnico || !nomeExibicao) return res.status(400).json({ error: 'tecnico e nomeExibicao obrigatorios' });
    await connectDB();
    const doc = await FollowupConexao.findOneAndUpdate(
      { tecnico },
      { $set: { tecnico, nomeExibicao, email: email || '' } },
      { upsert: true, new: true }
    );
    res.json(doc);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /api/followup/conexoes/:tecnico
app.delete('/api/followup/conexoes/:tecnico', auth, adminOnly, async (req, res) => {
  try {
    await connectDB();
    await FollowupConexao.deleteOne({ tecnico: req.params.tecnico });
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/followup/usuarios — medidores com token Google (para vincular)
app.get('/api/followup/usuarios', auth, adminOnly, async (req, res) => {
  try {
    await connectDB();
    const users = await User.find({ googleRefreshToken: { $exists: true, $ne: '' } })
      .select('_id name email picture').lean();
    res.json(users);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/followup/eventos — combina OS do sistema + Google Calendar dos técnicos
app.get('/api/followup/eventos', auth, adminOnly, async (req, res) => {
  try {
    await connectDB();
    const logs = await FollowupLog.find({ eventoInicio: { $gte: new Date(Date.now() - 3 * 86400000) } }).lean();
    const logMap = {};
    logs.forEach(l => { logMap[`${l.eventoId}_${l.tipo}`] = l; });
    const allEvents = [];
    const seenIds = new Set();

    // --- FONTE 1: OS do sistema Vedafacil ---
    const osList = await fetchOsEventos(14);
    for (const os of osList) {
      if (seenIds.has(os._id)) continue;
      seenIds.add(os._id);
      const lVesp = logMap[`${os._id}_vespera`];
      const lDia  = logMap[`${os._id}_dia`];
      const telefone = (os.celular || '').replace(/\D/g, '');
      const fone = telefone.length >= 10 ? (telefone.startsWith('55') ? telefone : '55' + telefone) : null;
      allEvents.push({
        id: os._id, fonte: 'os',
        titulo: os.cliente || '(sem cliente)',
        inicio: os.dataInicio,
        local: [os.endereco, os.bairro, os.cidade].filter(Boolean).join(', '),
        telefone: fone,
        tecnico: os.tecnicoResponsavel || os.equipeNome || '',
        nomeExibicao: os.tecnicoResponsavel || os.equipeNome || 'Equipe',
        osNumero: os.numero,
        lembreteVespera: lVesp ? { status: lVesp.status, enviadoEm: lVesp.createdAt } : null,
        lembreteDia:     lDia  ? { status: lDia.status,  enviadoEm: lDia.createdAt  } : null,
        lembrete24h: lVesp ? { status: lVesp.status, enviadoEm: lVesp.createdAt } : null,
        lembrete1h:  lDia  ? { status: lDia.status,  enviadoEm: lDia.createdAt  } : null,
      });
    }

    // --- FONTE 2: Google Calendar dos técnicos ---
    const conexoes = await FollowupConexao.find({ email: { $ne: '' } }).lean();
    for (const c of conexoes) {
      const user = await User.findById(c.email).lean();
      if (!user) continue;
      const gcEvents = await fetchCalendarEventsForUser(user);
      for (const e of gcEvents) {
        const inicio = e.start?.dateTime || e.start?.date;
        if (!inicio) continue;
        if (seenIds.has(e.id)) continue;
        seenIds.add(e.id);
        const telefone = extractPhone(e.description || '');
        const lVesp = logMap[`${e.id}_vespera`] || logMap[`${e.id}_24h`];
        const lDia  = logMap[`${e.id}_dia`]     || logMap[`${e.id}_1h`];
        allEvents.push({
          id: e.id, fonte: 'google',
          titulo: e.summary || '(sem titulo)',
          inicio: inicio.split('T')[0] || inicio,
          local: e.location || '',
          descricao: e.description || '',
          telefone,
          tecnico: c.tecnico, nomeExibicao: c.nomeExibicao,
          lembreteVespera: lVesp ? { status: lVesp.status, enviadoEm: lVesp.createdAt } : null,
          lembreteDia:     lDia  ? { status: lDia.status,  enviadoEm: lDia.createdAt  } : null,
          lembrete24h: lVesp ? { status: lVesp.status, enviadoEm: lVesp.createdAt } : null,
          lembrete1h:  lDia  ? { status: lDia.status,  enviadoEm: lDia.createdAt  } : null,
        });
      }
    }

    allEvents.sort((a, b) => String(a.inicio).localeCompare(String(b.inicio)));
    res.json(allEvents);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/followup/disparar — disparo manual
app.post('/api/followup/disparar', auth, adminOnly, async (req, res) => {
  const { eventoId, tipo, telefone, titulo, inicio, tecnico, nomeExibicao } = req.body || {};
  if (!eventoId || !tipo || !telefone) return res.status(400).json({ error: 'eventoId, tipo, telefone obrigatorios' });
  await connectDB();
  try {
    const tipoReal = tipo === '24h' ? 'vespera' : tipo === '1h' ? 'dia' : tipo;
    const msg = buildReminderMsg(tipoReal, nomeExibicao || tecnico, inicio);
    await evolutionRequest('/message/sendText/:inst', 'POST', { number: telefone, text: msg });
    await FollowupLog.create({ eventoId, tecnico, tipo: tipoReal, telefone, titulo, eventoInicio: new Date(inicio + 'T00:00:00'), status: 'enviado' });
    res.json({ ok: true });
  } catch (err) {
    await FollowupLog.create({ eventoId, tecnico, tipo, telefone, titulo, eventoInicio: new Date(inicio + 'T00:00:00'), status: 'erro', erro: err.message }).catch(() => {});
    res.status(500).json({ error: err.message });
  }
});

// GET /api/followup/logs
app.get('/api/followup/logs', auth, adminOnly, async (req, res) => {
  try {
    await connectDB();
    const logs = await FollowupLog.find().sort({ createdAt: -1 }).limit(100).lean();
    res.json(logs);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/followup/debug — diagnóstico de tokens e calendário
app.get('/api/followup/debug', auth, adminOnly, async (req, res) => {
  try {
    await connectDB();
    const conexoes = await FollowupConexao.find({ email: { $ne: '' } }).lean();
    const result = [];
    for (const c of conexoes) {
      const user = await User.findById(c.email).lean();
      if (!user) { result.push({ tecnico: c.tecnico, email: c.email, erro: 'user nao encontrado no banco' }); continue; }
      const hasAccess = !!user.googleAccessToken;
      const hasRefresh = !!user.googleRefreshToken;
      const expiry = user.googleTokenExpiry;
      const tokenExpirado = expiry ? (expiry - Date.now() < 0) : 'sem expiry';
      // Tenta buscar events
      let calStatus = 'ok', calCount = 0, calErro = null;
      try {
        const events = await fetchCalendarEventsForUser(user);
        calCount = events.length;
      } catch(e) { calStatus = 'erro'; calErro = e.message; }
      result.push({ tecnico: c.tecnico, email: c.email, hasAccess, hasRefresh, tokenExpirado, calStatus, calCount, calErro });
    }
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /api/followup/logs/:id — apaga log individual para reenvio
app.delete('/api/followup/logs/:id', auth, adminOnly, async (req, res) => {
  try {
    await connectDB();
    await FollowupLog.findByIdAndDelete(req.params.id);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/followup/evolution/status
app.get('/api/followup/evolution/status', auth, adminOnly, async (req, res) => {
  try {
    const data = await evolutionRequest('/instance/connectionState/:inst');
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/followup/evolution/qr
app.get('/api/followup/evolution/qr', auth, adminOnly, async (req, res) => {
  try {
    const data = await evolutionRequest('/instance/connect/:inst');
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET + POST /api/cron/followup — disparos automáticos (cron-job.org a cada 15min)
// Lógica: lê OS agendadas do sistema e envia:
//   tipo 'vespera' → no dia anterior à OS (dataInicio = amanhã)
//   tipo 'dia'     → no dia da OS (dataInicio = hoje)
async function handleCronFollowup(req, res) {
  // Aceita secret via header (preferido) ou query (legado, será descontinuado)
  const secret = req.headers['x-cron-secret'] || req.query.secret;
  if (!process.env.CRON_SECRET) return res.status(503).json({ error: 'CRON_SECRET not configured' });
  if (secret !== process.env.CRON_SECRET) return res.status(401).json({ error: 'Unauthorized' });
  // Avisa se ainda usa query (para migrar cron-job.org)
  if (req.query.secret && !req.headers['x-cron-secret']) {
    log('warn', 'Cron usando secret via query (DEPRECATED). Migre para header X-Cron-Secret.');
  }
  await connectDB();

  // Verifica se follow-up está pausado (admin pode desligar pela UI)
  try {
    const cfg = await Config.findById('main').lean();
    if (cfg?.followupPausado === true) {
      log('info', 'Cron followup: PAUSADO pela admin — nenhuma mensagem enviada');
      return res.json({ ok: true, pausado: true, enviados: 0, erros: 0, checkedAt: new Date().toISOString() });
    }
  } catch (_) { /* segue normal se falhar */ }

  try {
    const agora  = new Date();
    const hoje   = hojeStr();
    const amanha = amanhaStr();
    let enviados = 0, erros = 0;

    // ── 1. OS do sistema: lembrete véspera (dia anterior) e dia da visita ───────
    const osList = await OS.find({
      status: { $in: ['agendada', 'em_andamento'] },
      dataInicio: { $in: [hoje, amanha] },
      celular: { $exists: true, $ne: '' },
    }).lean();

    for (const os of osList) {
      const tipo = os.dataInicio === amanha ? 'vespera' : 'dia';
      const telefone = (os.celular || '').replace(/\D/g, '');
      if (telefone.length < 10) continue;
      const fone = telefone.startsWith('55') ? telefone : '55' + telefone;

      const jaEnviou = await FollowupLog.findOne({ eventoId: String(os._id), tipo, status: 'enviado' });
      if (jaEnviou) continue;

      const nomeTecnico = os.tecnicoResponsavel || os.equipeNome || 'Equipe';
      try {
        const msg = buildReminderMsg(tipo, nomeTecnico, os.dataInicio);
        await evolutionRequest('/message/sendText/:inst', 'POST', { number: fone, text: msg });
        await FollowupLog.create({ eventoId: String(os._id), tecnico: nomeTecnico, tipo, telefone: fone, titulo: os.cliente || '', eventoInicio: new Date(os.dataInicio + 'T00:00:00'), status: 'enviado' });
        enviados++;
      } catch (err) {
        await FollowupLog.create({ eventoId: String(os._id), tecnico: nomeTecnico, tipo, telefone: fone, titulo: os.cliente || '', eventoInicio: new Date(os.dataInicio + 'T00:00:00'), status: 'erro', erro: err.message });
        erros++;
      }
    }

    // ── 2. Google Calendar: 24h antes e 1h antes do evento ──────────────────────
    // Cron roda a cada 15min → janelas maiores que 15min garantem que nenhum evento é perdido.
    // O log de dedup evita envio duplo mesmo que o evento caia em duas rodadas.
    //
    //   24h → evento começa entre agora+23h e agora+25h  (janela de 2h)
    //   1h  → evento começa entre agora+45min e agora+75min (janela de 30min)
    const MS = { h23: 23*3600000, h25: 25*3600000, m45: 45*60000, m75: 75*60000 };

    const conexoes = await FollowupConexao.find({ email: { $ne: '' } }).lean();
    for (const c of conexoes) {
      const user = await User.findById(c.email).lean();
      if (!user) continue;

      let events = [];
      try { events = await fetchCalendarEventsForUser(user, 3); }
      catch (e) { console.warn('Calendar fetch error:', c.email, e.message); continue; }

      for (const ev of events) {
        // Ignora eventos de dia inteiro (sem horário definido)
        const startRaw = ev.start?.dateTime;
        if (!startRaw) continue;

        const eventStart = new Date(startRaw);
        const diff = eventStart.getTime() - agora.getTime();

        let tipo = null;
        if (diff >= MS.h23 && diff < MS.h25) tipo = '24h';
        else if (diff >= MS.m45 && diff < MS.m75) tipo = '1h';
        if (!tipo) continue;

        // Telefone obrigatório na descrição do evento
        const fone = extractPhone(ev.description || '');
        if (!fone) continue;

        // Dedup: não manda duas vezes para o mesmo evento+tipo
        const jaEnviou = await FollowupLog.findOne({ eventoId: ev.id, tipo, status: 'enviado' });
        if (jaEnviou) continue;

        const nomeTecnico = c.nomeExibicao || c.tecnico;
        const titulo = ev.summary || '';

        try {
          const msg = buildReminderMsg(tipo, nomeTecnico, startRaw);
          await evolutionRequest('/message/sendText/:inst', 'POST', { number: fone, text: msg });
          await FollowupLog.create({ eventoId: ev.id, tecnico: nomeTecnico, tipo, telefone: fone, titulo, eventoInicio: eventStart, status: 'enviado' });
          enviados++;
        } catch (err) {
          await FollowupLog.create({ eventoId: ev.id, tecnico: nomeTecnico, tipo, telefone: fone, titulo, eventoInicio: eventStart, status: 'erro', erro: err.message });
          erros++;
        }
      }
    }

    res.json({ ok: true, enviados, erros, checkedAt: agora.toISOString(), hoje, amanha });
  } catch (err) {
    console.error('Cron followup error:', err);
    res.status(500).json({ error: err.message });
  }
}
// Aceita GET e POST (cron-job.org usa GET por padrão)
app.get('/api/cron/followup', handleCronFollowup);
app.post('/api/cron/followup', handleCronFollowup);

// GET /api/followup/status — retorna se o follow-up está ativo ou pausado
app.get('/api/followup/status', auth, adminOnly, async (req, res) => {
  try {
    await connectDB();
    const cfg = await Config.findById('main').lean();
    res.json({ pausado: cfg?.followupPausado === true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/followup/pausar — liga/desliga os disparos automáticos
app.post('/api/followup/pausar', auth, adminOnly, async (req, res) => {
  try {
    await connectDB();
    const { pausado } = req.body || {};
    const novoEstado = !!pausado;
    await Config.findByIdAndUpdate('main', { followupPausado: novoEstado }, { upsert: true });
    await audit(req, novoEstado ? 'pausar-followup' : 'ativar-followup', 'config', 'main', { pausado: novoEstado });
    res.json({ ok: true, pausado: novoEstado });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Start server (local dev) ──────────────────────────────────────────────────

const PORT = process.env.PORT || 3001;
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  app.listen(PORT, () => console.log(`Vedafácil API running on port ${PORT}`));
}

export default app;
