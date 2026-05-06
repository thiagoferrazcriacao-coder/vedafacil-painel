import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import axios from 'axios';
import mongoose from 'mongoose';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import path from 'path';
import { createRequire } from 'module';
import { google } from 'googleapis';
import { readFileSync, existsSync } from 'fs';
import {
  log, sanitizeImages, MAX_IMG_B64_BYTES,
  calcObra, expandSubPontos, ensureSubPontos, calcProgressoOS,
  pushStatusHistorico, extenso, valorExtenso,
} from './lib/helpers.js';

let puppeteerLauncher = null;
const require = createRequire(import.meta.url);
const IS_VERCEL = !!process.env.VERCEL;
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

// MongoDB connection
let isConnected = false;
async function connectDB() {
  if (isConnected) return;
  if (!process.env.MONGODB_URI) {
    console.warn('MONGODB_URI not set — using in-memory fallback');
    return;
  }
  await mongoose.connect(process.env.MONGODB_URI);
  isConnected = true;
}

// ── Mongoose Schemas ──────────────────────────────────────────────────────────

const medicaoSchema = new mongoose.Schema({
  _id: { type: String, default: uuidv4 },
  numeroMedicao: Number,
  user: String,
  createdAt: { type: Number, default: Date.now },
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
}, { _id: false });

const orcamentoSchema = new mongoose.Schema({
  _id: { type: String, default: uuidv4 },
  numero: Number,
  medicaoId: String,
  numeroMedicao: Number,
  status: { type: String, default: 'rascunho' },
  createdAt: { type: Number, default: Date.now },
  updatedAt: { type: Number, default: Date.now },
  cliente: String, endereco: String, bairro: String, cidade: String, cep: String, ac: String, celular: String,
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
}, { _id: false });

const contratoSchema = new mongoose.Schema({
  _id: { type: String, default: uuidv4 },
  numero: Number,
  orcamentoId: String,
  status: { type: String, default: 'rascunho' },
  createdAt: { type: Number, default: Date.now },
  updatedAt: { type: Number, default: Date.now },
  cliente: String, endereco: String, bairro: String, cidade: String, cep: String, ac: String, celular: String,
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
  parcelasContrato: [{ numero: Number, data: String, valor: Number }],
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
  }
}, { _id: false });

const equipeSchema = new mongoose.Schema({
  _id: { type: String, default: uuidv4 },
  nome: { type: String, required: true },
  emailGmail: String,
  membros: [String],
  cor: { type: String, default: '#1a5c9a' },
  ativa: { type: Boolean, default: true },
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
  calendarEventId: String,
  diasTrabalho: Number,
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
  consumosDiarios: [mongoose.Schema.Types.Mixed], // [{ data, litros, membro }]
  totalConsumoReal: { type: Number, default: 0 },
  fechamentosDia: [mongoose.Schema.Types.Mixed], // [{ data:'YYYY-MM-DD', litros, membro, ts }]
  // Compartilhamento multi-equipe
  equipesAtribuidas: [mongoose.Schema.Types.Mixed], // [{ equipeId, equipeNome, pontos:[Number], status, pontosExecutados:[Number] }]
  // Reparo / Assistência Técnica
  osOriginalId: String,       // ID da OS original (se este é um reparo)
  tipoReparo: String,         // descrição do reparo
  fotosReparo: [mongoose.Schema.Types.Mixed], // fotos do problema no momento do reparo
  historicoEquipes: [mongoose.Schema.Types.Mixed], // [{ equipeId, equipeNome, de:ts, ate:ts }] — todas equipes que atuaram
  equipeOriginalId: String,   // equipe que executou o serviço original (causou o problema)
  equipeOriginalNome: String, // nome da equipe original
  fotosAntesOriginal: [mongoose.Schema.Types.Mixed], // fotos originais da OS base
  fotosDepoisOriginal: [mongoose.Schema.Types.Mixed],
  createdAt: { type: Number, default: Date.now },
  updatedAt: { type: Number, default: Date.now },
}, { _id: false });

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

// ── Middleware ────────────────────────────────────────────────────────────────

app.use(cors());
app.use(express.json({ limit: '50mb' }));

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

// JWT auth middleware
function auth(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1] || req.query.token;
  if (!token) return res.status(401).json({ error: 'Token required' });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET || 'dev-secret');
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

// ── Health ────────────────────────────────────────────────────────────────────

app.get('/api/health', async (req, res) => {
  try {
    await connectDB();
    const dbStatus = isConnected ? 'connected' : 'in-memory';
    res.json({
      status: 'ok',
      db: dbStatus,
      env: process.env.NODE_ENV || 'development',
      uptime: Math.round(process.uptime()),
      ts: new Date().toISOString(),
    });
  } catch (err) {
    res.status(503).json({ status: 'error', error: err.message });
  }
});

// Global error handler (catches unhandled async errors)
app.use((err, req, res, next) => {
  log('error', `Unhandled error on ${req.method} ${req.path}`, { error: err.message, stack: err.stack });
  res.status(500).json({ error: 'Internal server error' });
});

// ── Auth Routes ───────────────────────────────────────────────────────────────

app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  const validUser = process.env.ADMIN_USER || 'admin';
  const validPass = process.env.ADMIN_PASSWORD || 'vedafacil2025';
  const isAdmin = (username === validUser && password === validPass)
    || (username === 'admin' && password === 'vedafacil2025');
  if (isAdmin) {
    const token = jwt.sign({ username, role: 'admin' }, process.env.JWT_SECRET || 'dev-secret', { expiresIn: '24h' });
    return res.json({ token, user: { username, role: 'admin' } });
  }
  // Suporte a operadores: verifica no banco de dados de usuários
  try {
    await connectDB();
    if (isConnected) {
      const user = await User.findOne({ email: username, role: 'operador' }).lean();
      if (user && user.password) {
        // bcrypt compare se existir hash, senão testa igualdade simples (temporário)
        const ok = user.password === password || user.password === require('crypto').createHash('sha256').update(password).digest('hex');
        if (ok) {
          const mustChange = user.mustChangePassword === true;
          const pic = user.picture || '';
          const token = jwt.sign({ username: user.name || username, email: username, role: 'operador', mustChangePassword: mustChange, picture: pic }, process.env.JWT_SECRET || 'dev-secret', { expiresIn: '24h' });
          return res.json({ token, user: { username: user.name || username, email: username, role: 'operador', mustChangePassword: mustChange, picture: pic } });
        }
      }
    }
  } catch (_) { /* silently ignore DB errors during login */ }
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

// ── Proteção de tamanho de imagem ────────────────────────────────────────────
// sanitizeImages + MAX_IMG_B64_BYTES → importados de ./lib/helpers.js

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

app.post('/api/medicao', async (req, res) => {
  try {
    await connectDB();
    const secret = process.env.WEBHOOK_SECRET;
    if (secret && req.headers['x-webhook-secret'] !== secret) {
      return res.status(401).json({ error: 'Invalid webhook secret' });
    }
    // Sanitize oversized base64 images before persisting
    const data = sanitizeImages(req.body, 'medicao');

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
      const medicao = await Medicao.create({ ...data, _id: data.id || uuidv4(), numeroMedicao: numero, status: 'recebida' });
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
app.post('/api/medicoes/manual', auth, async (req, res) => {
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
    const medicao = await Medicao.create({
      ...data,
      _id: id,
      id,
      numeroMedicao: numero,
      status: 'recebida',
      user: req.user?.email || req.user?.username || 'manual',
      createdAt: Date.now(),
    });
    return res.json({ success: true, id: medicao._id, numeroMedicao: numero, ...medicao.toObject() });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/medicoes', auth, async (req, res) => {
  try {
    await connectDB();
    let medicoes;
    if (isConnected) {
      medicoes = await Medicao.find().sort({ createdAt: -1 }).select('-fotos').lean();
    } else {
      medicoes = memStore.medicoes.map(m => { const { fotos, ...rest } = m; return rest; });
    }
    // Attach orcamento info
    if (isConnected && medicoes.length > 0) {
      const ids = medicoes.map(m => m._id);
      const orcs = await Orcamento.find({ medicaoId: { $in: ids } }).select('_id medicaoId numero').lean();
      const orcByMedicao = {};
      orcs.forEach(o => { orcByMedicao[o.medicaoId] = { orcamentoId: o._id, numeroOrcamento: o.numero }; });
      medicoes = medicoes.map(m => ({
        ...m,
        temOrcamento: !!orcByMedicao[m._id],
        orcamentoId: orcByMedicao[m._id]?.orcamentoId || null,
        numeroOrcamento: orcByMedicao[m._id]?.numeroOrcamento || null,
      }));
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

app.put('/api/medicoes/:id', auth, async (req, res) => {
  try {
    await connectDB();
    // Verifica se já gerou orçamento
    if (isConnected) {
      const orc = await Orcamento.findOne({ medicaoId: req.params.id });
      if (orc) return res.status(400).json({ error: 'Esta medição já gerou um orçamento e não pode ser alterada.' });
      const data = sanitizeImages(req.body, 'medicao-put');
      const m = await Medicao.findByIdAndUpdate(
        req.params.id,
        { ...data, status: 'recebida', updatedAt: new Date() },
        { new: true, runValidators: true }
      );
      if (!m) return res.status(404).json({ error: 'Medição não encontrada.' });
      return res.json(m);
    }
    // memStore fallback
    const orc = memStore.orcamentos.find(o => o.medicaoId === req.params.id);
    if (orc) return res.status(400).json({ error: 'Esta medição já gerou um orçamento e não pode ser alterada.' });
    const idx = memStore.medicoes.findIndex(x => x._id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Medição não encontrada.' });
    const data = sanitizeImages(req.body, 'medicao-put');
    memStore.medicoes[idx] = { ...memStore.medicoes[idx], ...data, status: 'recebida', updatedAt: new Date() };
    res.json(memStore.medicoes[idx]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/medicoes/:id', auth, adminOnly, async (req, res) => {
  try {
    await connectDB();
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
    if (isConnected) return res.json(await Orcamento.find().sort({ createdAt: -1 }));
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
      ac: medicao?.ac || '',
      celular: medicao?.celular || '',
      dataOrcamento: new Date().toISOString().split('T')[0],
      validade: '',
      avaliadoPor: medicao?.avaliadoPor || '', acompanhadoPor: '', tecnicoResponsavel: 'Thiago Ramos Ferraz', elaboradoPor: '',
      origem: '', sigla: '',
      garantia: Number(medicao?.garantia) || 15,
      andaime: medicao?.andaime || 'nao',
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
      dataOrcamento: new Date().toISOString().split('T')[0],
      // Limpar vínculos com medição/contrato originais
      medicaoId: orig.medicaoId || null,
      zapsignDocId: undefined,
      zapsignSignUrl: undefined,
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

app.put('/api/orcamentos/:id', auth, async (req, res) => {
  try {
    await connectDB();
    const updates = { ...req.body, updatedAt: Date.now() };
    if (isConnected) {
      const o = await Orcamento.findByIdAndUpdate(req.params.id, updates, { new: true });
      return res.json(o);
    }
    const idx = memStore.orcamentos.findIndex(x => x._id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Not found' });
    memStore.orcamentos[idx] = { ...memStore.orcamentos[idx], ...updates };
    res.json(memStore.orcamentos[idx]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/orcamentos/:id', auth, adminOnly, async (req, res) => {
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
    res.json(o);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── PDF Generation ────────────────────────────────────────────────────────────


export function buildOrcamentoPdfHtml(o) {
  const fmt = (n) => 'R$ ' + (n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
  const fmtDate = (d) => {
    if (!d) return '';
    const date = new Date(d.includes && d.includes('-') && d.length === 10 ? d + 'T12:00:00' : d);
    if (isNaN(date.getTime())) return d;
    return date.toLocaleDateString('pt-BR', { day:'2-digit', month:'short', year:'2-digit' }).replace('.','');
  };
  const fmtNum = (n) => (n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
  // Formata validade: "30" → "30 dias"; date string → data formatada
  const fmtValidade = (v) => {
    if (!v) return '';
    if (/^\d+$/.test(String(v))) return String(v) + ' dias';
    return fmtDate(String(v));
  };

  // ── ORÇAMENTO MÍNIMO — versão simplificada ────────────────────────────────
  if (o.orcMinimo) {
    const totalMin = o.totalMinimo || o.totalLiquido || 0;
    const locaisMin = (o.locais || []);
    const logoImg = LOGO_B64
      ? `<img src="data:image/png;base64,${LOGO_B64}" style="max-width:260px;height:auto;display:block;margin:0 auto;" alt="Vedafácil">`
      : `<div style="font-size:28px;font-weight:900;color:#e87722;text-align:center;">VEDAFÁCIL</div>`;
    return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
<title>Orcamento_Minimo_${o.numero||1}</title>
<style>
* { box-sizing:border-box; margin:0; padding:0; }
body { font-family:Arial,sans-serif; font-size:11px; color:#222; }
.pg { padding:12mm 16mm 16mm; max-width:210mm; margin:0 auto; }
.footer { text-align:center; font-size:8.5px; color:#666; margin-top:20px; padding-top:8px; border-top:1px solid #ccc; }
.download-btn { position:fixed; top:12px; right:12px; z-index:9999; background:#e87722; color:white; border:none; padding:10px 20px; font-size:14px; font-weight:700; border-radius:8px; cursor:pointer; }
@media print { @page { margin:0; size:A4; } .download-btn { display:none !important; } body { -webkit-print-color-adjust:exact; print-color-adjust:exact; } }
</style></head><body>
<button class="download-btn" onclick="window.print()">⬇ Salvar como PDF</button>
<div class="pg">
  <div style="text-align:center;margin-bottom:16px;">${logoImg}</div>
  <div style="display:grid;grid-template-columns:1fr 1fr;border:1px solid #999;margin-bottom:18px;">
    <div style="padding:10px 14px;border-right:1px solid #999;">
      <strong style="font-size:13px;display:block;margin-bottom:4px;">${o.cliente||''}</strong>
      ${o.endereco ? `<div>${o.endereco}${o.cidade?', '+o.cidade:''}</div>` : ''}
      ${o.ac ? `<div>${o.ac}${o.celular?' — '+o.celular:''}</div>` : (o.celular ? `<div>${o.celular}</div>` : '')}
    </div>
    <div style="padding:10px 14px;">
      <div style="font-size:14px;font-weight:bold;text-align:right;margin-bottom:6px;">ORÇAMENTO MÍNIMO Nº ${o.numero||1}</div>
      <div style="display:flex;justify-content:space-between;"><span>Data:</span><strong>${fmtDate(o.dataOrcamento)}</strong></div>
      <div style="display:flex;justify-content:space-between;"><span>Validade:</span><strong>${fmtValidade(o.validade)}</strong></div>
    </div>
  </div>

  <p style="margin-bottom:16px;">Prezado(a) ${o.ac||o.cliente||''},</p>
  <p style="margin-bottom:20px;">Apresentamos orçamento mínimo para serviços de impermeabilização nos locais abaixo relacionados:</p>

  <div style="background:#fff8f0;border:1.5px solid #e87722;border-radius:4px;padding:14px;margin-bottom:20px;">
    <div style="font-size:12px;font-weight:bold;color:#e87722;text-transform:uppercase;margin-bottom:10px;letter-spacing:0.5px;">ELIMINAR INFILTRAÇÕES EM:</div>
    ${locaisMin.length > 0
      ? locaisMin.map((l, i) => `<div style="padding:6px 0;border-bottom:1px solid #f5e0c8;display:flex;align-items:center;gap:8px;">
          <span style="background:#e87722;color:white;border-radius:50%;width:18px;height:18px;display:inline-flex;align-items:center;justify-content:center;font-size:9px;font-weight:bold;flex-shrink:0;">${i+1}</span>
          <span style="font-weight:600;">${l.nome||l.local||`Local ${i+1}`}</span>
        </div>`).join('')
      : '<div style="color:#888;font-style:italic;">Nenhum local cadastrado</div>'
    }
  </div>

  <div style="border:2px solid #e87722;border-radius:6px;padding:16px;text-align:center;margin-bottom:20px;">
    <div style="font-size:11px;color:#666;margin-bottom:4px;">VALOR TOTAL DOS SERVIÇOS</div>
    <div style="font-size:26px;font-weight:900;color:#e87722;">${fmt(totalMin)}</div>
    ${o.prazoExecucao ? `<div style="font-size:10px;color:#888;margin-top:6px;">Prazo de execução: ${o.prazoExecucao} dias úteis</div>` : ''}
    ${o.validade ? `<div style="font-size:10px;color:#888;margin-top:4px;">Validade da proposta: ${fmtValidade(o.validade)}</div>` : ''}
  </div>

  <div style="background:#f9f9f9;border:1px solid #ddd;border-radius:4px;padding:12px 14px;margin-bottom:20px;">
    <div style="font-size:11px;font-weight:bold;margin-bottom:8px;color:#333;">CONDIÇÕES DE PAGAMENTO</div>
    <div style="font-size:10.5px;margin-bottom:4px;">• ${o.condicaoPgto1Obs || 'Pgto à vista, na assinatura do contrato.'}</div>
    <div style="font-size:10.5px;margin-bottom:4px;">• ${o.condicaoPgto2Obs1 || '1ª parcela de entrada na assinatura do contrato.'}</div>
    ${o.condicaoPgto2Obs2 ? `<div style="font-size:10.5px;">• ${o.condicaoPgto2Obs2}</div>` : ''}
  </div>

  ${o.obsAdicionais ? `<div style="border:1px solid #ccc;padding:10px 14px;border-radius:4px;margin-bottom:16px;font-size:10.5px;"><strong>Observações:</strong> ${o.obsAdicionais}</div>` : ''}

  <div style="margin-top:32px;display:grid;grid-template-columns:1fr 1fr;gap:20px;text-align:center;">
    <div style="border-top:1px solid #333;padding-top:6px;font-size:10px;">Vedafácil</div>
    <div style="border-top:1px solid #333;padding-top:6px;font-size:10px;">${o.cliente||'Cliente'}</div>
  </div>

  <div class="footer">
    <strong style="color:#e87722;">Eliminamos Infiltrações Sem Quebrar!</strong><br>
    CNPJ: 23.606.470/0001-07 &nbsp;|&nbsp; Tel.: (21) 99984-1127 / (24) 2106-1015
  </div>
</div>
</body></html>`;
  }
  // ── FIM ORÇAMENTO MÍNIMO ──────────────────────────────────────���───────────

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

  const locais = o.locais || [];
  const locaisRows = locais.map(l => `
    <tr>
      <td class="td-local">${l.nome || ''}</td>
      <td>${l.trinca > 0 ? fmtNum(l.trinca) : ''}</td>
      <td>${l.juntaFria > 0 ? fmtNum(l.juntaFria) : ''}</td>
      <td>${l.ralo > 0 ? l.ralo : ''}</td>
      <td>${l.juntaDilat > 0 ? fmtNum(l.juntaDilat) : ''}</td>
      <td>${l.ferragem > 0 ? fmtNum(l.ferragem) : ''}</td>
      <td></td><td></td>
      <td>${l.cortina > 0 ? fmtNum(l.cortina) : ''}</td>
    </tr>`).join('');

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

  const LOGO_HTML = `<div style="text-align:center;margin-bottom:8px;">${logoImg}</div>`;

  const FOOTER = `<div style="text-align:center;font-size:8.5px;color:#666;margin-top:12px;padding-top:5px;border-top:1px solid #ccc;">
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
    <div style="page-break-before:always;padding:10mm 14mm 14mm;max-width:210mm;margin:0 auto;">
      ${LOGO_HTML}
      <div style="font-size:11px;margin-bottom:10px;font-weight:bold;">${l.nome || ''}</div>
      <div style="border:1px solid #ccc;padding:8px;">
        <img src="${f.data || f}" style="width:100%;max-height:200mm;object-fit:contain;" alt="">
        <div style="text-align:center;font-size:9px;color:#555;margin-top:4px;">${l.nome || ''}</div>
      </div>
      ${FOOTER}
    </div>`).join('')
  ).join('');

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>Orcamento_${o.numero || 1}_${(o.cliente || 'cliente').replace(/[^a-zA-Z0-9 ]/g,'').replace(/\s+/g,'_')}</title>
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: Arial, Helvetica, sans-serif; font-size: 11px; color: #222; }
.pg { padding: 10mm 14mm 14mm; max-width: 210mm; margin: 0 auto; }
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
@media print { body { -webkit-print-color-adjust:exact; print-color-adjust:exact; } @page { margin:0; size:A4; } .download-btn { display:none !important; } }
</style>
</head>
<body>

<button class="download-btn" onclick="downloadPDF()">⬇ Salvar como PDF</button>

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
    <div style="display:flex;justify-content:space-between;"><span>Validade da Proposta:</span><strong>${fmtValidade(o.validade) || '—'}</strong></div>
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
${FOOTER}
</div>

<!-- PAGE 2 -->
<div class="pg pb">
${LOGO_HTML}

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
</div>

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
</table>

${sec('7','CONDIÇÕES DE PAGAMENTO')}

<p style="text-align:center;font-weight:bold;font-size:11px;margin:6px 0 4px;">Proposta 1 : &nbsp;<em>(Pagamento à vista)</em></p>
<table class="pay">
  <tr>
    <td style="font-style:italic;width:55%"><em>Total à Vista</em></td>
    <td colspan="2" style="text-align:right;font-weight:bold;font-size:12px;">${fmt(totalProposta1)}</td>
  </tr>
  <tr><td colspan="3" style="font-style:italic;font-size:10px;">${condicaoPgto1Obs}</td></tr>
</table>

<p style="text-align:center;font-size:10.5px;margin:10px 0 4px;font-weight:bold;">Proposta 2 : &nbsp;<em>(Pagamento Parcelado)</em></p>
<table class="pay">
  <tr>
    <td style="font-style:italic;width:45%"><em>Total Parcelado</em></td>
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

${obsGeral ? `<div class="obs-box" style="margin-top:10px;font-size:10px;font-style:italic;">${obsGeral}</div>` : ''}

${sec('8','INFORMAÇÕES ADICIONAIS')}
<p style="font-size:11px;margin:8px 0;">
  &rarr; O prazo de execução desta obra será de:
  <span style="display:inline-block;min-width:36px;border-bottom:1px solid #333;text-align:center;font-weight:bold;margin:0 6px;">${prazoExecucao}</span>
  dias úteis.
</p>
${(o.andaime === 'sim' || o.andaime === true) ? `<p style="font-size:11px;margin:8px 0;">
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

<script>
function downloadPDF() {
  window.print();
}
<\/script>
</body></html>`;
}app.get('/api/orcamentos/:id/pdf', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1] || req.query.token;
  if (!token) return res.status(401).json({ error: 'Token required' });
  try { jwt.verify(token, process.env.JWT_SECRET || 'dev-secret'); }
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

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(buildOrcamentoPdfHtml(o));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Contrato PDF ─────────────────────────────────────────────────────────────

// extenso, valorExtenso → importados de ./lib/helpers.js

function buildContratoPdfHtml(c) {
  const fmt = (n) => 'R$ ' + (n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
  const fmtDate = (d) => { if (!d) return '___'; const date = new Date(d.includes('-') && d.length === 10 ? d + 'T12:00:00' : d); return isNaN(date.getTime()) ? d : date.toLocaleDateString('pt-BR', { day:'2-digit', month:'long', year:'numeric' }); };

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
  const issPercent = c.issPercent || 3;
  const prazo = c.prazoExecucao || 3;
  const foro = c.foro || 'Rio de Janeiro';
  const dataAssinatura = c.dataAssinatura ? fmtDate(c.dataAssinatura) : '___';
  const dataInicio = c.dataInicio ? fmtDate(c.dataInicio) : '';
  const dataTermino = c.dataTermino ? fmtDate(c.dataTermino) : '';
  const nOrc = c.numero ? String(c.numero).padStart(4, '0') : '___';
  const valorExt = valorExtenso(totalLiquido);

  const itensFiltrados = (c.itens || []).filter(i => i.quantidade > 0);
  const itemRows = itensFiltrados.map((i, n) => `<tr><td>${n+1}</td><td>${i.descricao}</td><td style="text-align:center">${i.unidade || '-'}</td><td style="text-align:center">${i.quantidade}</td><td style="text-align:right">${fmt(i.valorUnit)}</td><td style="text-align:right">${fmt(i.subtotal)}</td></tr>`).join('');

  const parcelasContrato = c.parcelasContrato && c.parcelasContrato.length > 0 ? c.parcelasContrato : [];
  const parcelaRows = parcelasContrato.map((p, i) => `<tr><td style="text-align:center">${p.numero || i+1}</td><td style="text-align:center">${p.data || '___'}</td><td style="text-align:right">${fmt(p.valor || 0)}</td></tr>`).join('');

  const cronograma = c.cronograma || [];
  const cronogramaRows = cronograma.map((cr, i) => `<tr><td style="text-align:center;width:30px">${i+1}</td><td>${cr.local || '___'}</td><td style="text-align:center">${cr.dataInicio || '___'}</td><td style="text-align:center">${cr.dataFim || '___'}</td></tr>`).join('');

  const locais = c.locais || [];
  const locaisStr = locais.map((l, i) => `${i+1}- ${l.nome || '___'}`).join(', ');

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8">
<title>Contrato_Vedafacil_${nOrc}_${(razaoSocial||'cliente').replace(/[^a-zA-Z0-9 ]/g,'').replace(/\s+/g,'_')}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:Arial,Helvetica,sans-serif;font-size:10.5px;color:#222;line-height:1.6}
.pg{padding:12mm 16mm;max-width:210mm;margin:0 auto}
.pb{page-break-before:always}
h2.clause-title{background:#e87722;color:white;padding:5px 10px;margin:14px 0 8px;font-size:11px;font-weight:bold;border-radius:2px}
.clause{margin:6px 0;text-align:justify;font-size:10.5px}
.clause p{margin-bottom:6px;text-indent:20px}
.clause p:first-child{text-indent:0}
.clause .sub{margin-left:20px;margin-top:4px}
.clause strong.org{color:#e87722}
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
.sig{display:grid;grid-template-columns:1fr 1fr;gap:40px;margin-top:40px;text-align:center;font-size:10px}
.sig .line{border-top:1px solid #333;padding-top:5px;font-weight:bold}
.sig .role{color:#555;margin-bottom:20px;font-size:9.5px}
.foot{text-align:center;font-size:8.5px;color:#666;margin-top:12px;padding-top:5px;border-top:1px solid #ccc}
.download-btn{position:fixed;top:12px;right:12px;z-index:9999;background:#e87722;color:white;border:none;padding:10px 20px;font-size:14px;font-weight:700;border-radius:8px;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.3)}
.download-btn:hover{background:#d06a1b}
@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}@page{margin:0;size:A4}.download-btn{display:none!important}}
</style>
</head><body>
<button class="download-btn" onclick="window.print()">⬇ Salvar como PDF</button>

<div class="pg" style="text-align:center;padding-top:6mm">
<h1 style="color:#e87722;font-size:16px;margin-bottom:4px">INSTRUMENTO PARTICULAR DE CONTRATO DE PRESTAÇÃO DE SERVIÇOS</h1>
<div style="font-size:10px;color:#666;margin-bottom:14px">Correspondente ao Orçamento Nº ${nOrc}</div>
</div>

<div class="pg pb">
<p style="text-align:justify;font-size:10.5px;margin-bottom:10px">Contrato de Prestação de serviços para fornecimento das tarefas de hidrojateamento, calafetação e selado de infiltrações utilizando o sistema de injeção que entre si celebram por um lado:</p>

<p style="font-size:10.5px;text-align:justify;margin-bottom:8px"><strong>CONTRATADA:</strong> ${contratada} sita à Rua Professora Margarida Fialho Thompson Leite, 670, Residencial Cristo Redentor na cidade de Barra Mansa estado RJ, CEP 27323-755, inscrita no CNPJ sob número 23.606.470/0001-07, representado por Thiago Ramos Ferraz, inscrito no CPF sob n° 104.589.167-30 doravante denominada <strong style="color:#e87722">CONTRATADA</strong>.</p>

<p style="font-size:10.5px;text-align:justify;margin-bottom:8px">E do outro lado <strong>${razaoSocial}</strong>${cnpjCliente ? ', inscrit' + (cnpjCliente.match(/^0{3}/) ? 'o' : 'a') + ' no CNPJ sob número ' + cnpjCliente : ''} sito à ${endereco}, na cidade de ${cidade}${cep ? ', CEP ' + cep : ''}${sindico ? ', presentado por ' + sindico : ''}${cpfResp && cpfResp !== '___' ? ', legalmente instituído em autos e com poderes de firma' : ''}${cpfResp && cpfResp !== '___' ? ', e inscrito no CPF sob n° ' + cpfResp : ''}${rgResp ? ', RG: ' + rgResp : ''}, doravante denominada <strong style="color:#e87722">CONTRATANTE</strong>.</p>

<p style="font-size:10.5px;text-align:justify">O serviço será executado na garagem do(a) ${razaoSocial} sito à ${endereco}${cidade ? ', ' + cidade : ''}, estado RJ, conforme orçamento anexo.</p>

<h2 class="clause-title">Cláusula 1ª - Objeto</h2>
<div class="clause">
<p>1.1 - Por este Instrumento Particular e na melhor forma de direito, a CONTRATANTE contrata com a CONTRATADA, a prestação dos serviços de fornecimento de material e mão de obra para hidrojateamento, calafetação e selado de infiltrações exclusivamente em estruturas de concreto maciço, utilizando o método de injeção.</p>
</div>

<h2 class="clause-title">Cláusula 2ª - Documentos Integrantes e Forma de Execução</h2>
<div class="clause">
<p>2.1 – Os serviços serão executados pela CONTRATADA em estrita conformidade com as Condições indicadas no Orçamento anexo, pontos 1. até o 9. que passa a formar parte deste contrato.</p>
<p>2.2 – Passarão a integrar este Instrumento Particular, desde que assinadas pelas partes, ou por seus representantes autorizados, as atas de reuniões, novos orçamentos para eventuais extensões dos serviços e outros documentos posteriores à assinatura deste Instrumento.</p>
</div>

<h2 class="clause-title">Cláusula 3ª - Escopo dos Serviços</h2>
<div class="clause">
<p>3.1 - A CONTRATADA deverá realizar os serviços, com aplicação do produto, ora pactuados, observado as disposições contidas no orçamento anexo que dá origem a este Instrumento Particular e que passa a formar parte integrante do mesmo.</p>
<p>3.2 - Os serviços serão realizados nas regiões delimitadas no ponto 6.- denominado Localização, no orçamento anexo.</p>
</div>

<h2 class="clause-title">Cláusula 4ª - Valor dos Serviços</h2>
<div class="clause">
<p>4.1- A CONTRATANTE aceita pagar pelo serviço contratado um valor total de: <strong>${fmt(totalLiquido)}</strong></p>
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
<tr><td style="font-style:italic;font-weight:bold"><strong>TOTAL</strong></td><td></td><td style="text-align:right;font-weight:bold;font-size:12px"><strong>${fmt(totalLiquido)}</strong></td></tr>
</table>` : `<table class="pay">
<tr><td style="font-style:italic;width:55%"><em>Total Orçamento</em></td><td style="text-align:right;font-weight:bold;font-size:12px">${fmt(totalLiquido)}</td></tr>
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
<p>9.1 - A CONTRATADA oferece garantia limitada por <strong>${garantia} (${garantia === 1 ? 'um' : extenso(garantia)}) ${garantia === 1 ? 'ano' : 'anos'}</strong>, nos locais tratados e especificados no ponto 6 do orçamento anexo e integrante deste contrato.</p>
<p>9.2 - A CONTRATANTE declara estar ciente de que a garantia concedida contempla apenas o local mapeado, conforme orçamento e croqui anexos a este contrato (croqui será enviado após a finalização da obra). Infiltrações próximas ao local trabalhado serão tratadas como ponto novo, o qual a CONTRATANTE deverá solicitar a CONTRATADA novo orçamento.</p>
<p>9.2.1 - Caso seja identificado infiltrações na área em período de garantia, a CONTRATADA deverá prestar o atendimento necessário para a regularização do problema. Outrossim obriga-se a CONTRATANTE comunicar à CONTRATADA sobre a existência de possível assistência técnica registrado por meio de nossos canais de comunicação como telefone, email, whatsapp. Caso isso não ocorra, a CONTRATANTE isenta a CONTRATADA de quaisquer responsabilidades de danos causados decorrentes do problema.</p>
<p>9.3 - A CONTRATADA informará a data do agendamento de execução de garantia no prazo de até 5 (cinco) dias úteis, e a mesma se dará mediante disponibilidade de sua programação e agenda, num prazo de até 60 (sessenta) dias para execução.</p>
<p>9.4 - A CONTRATADA somente executará trabalhos de impermeabilização em áreas de concreto maciço, dentro da área contratada. Caso constate-se, durante a execução, outro tipo de estrutura que seja diferente de concreto maciço, a CONTRATADA ficará isenta de prosseguir qualquer reparo bem como fornecer garantia.</p>
<p>9.5 - Em ocorrências de assistência técnica, será de responsabilidade da CONTRATANTE, sem ônus a CONTRATADA, providenciar a retirada e recolocação de forro, locação de andaimes ou realização da pintura, caso seja necessário.</p>
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

<p style="text-align:center;margin-top:20px">${cidade || foro}, ${dataAssinatura}</p>

<div class="sig">
  <div>
    <div class="role">CONTRATANTE</div>
    <div class="line">${razaoSocial}<br>${sindico}${cpfResp && cpfResp !== '___' ? '<br>CPF: ' + cpfResp : ''}</div>
  </div>
  <div>
    <div class="role">CONTRATADA</div>
    <div class="line">VEDAFACIL TECNOLOGIA EM IMPERMEABILIZAÇÃO<br>Thiago Ramos Ferraz<br>CPF: 104.589.167-30</div>
  </div>
</div>

<div class="foot"><strong style="color:#e87722">Eliminamos Infiltrações Sem Quebrar!</strong><br>CNPJ: 23.606.470/0001-07 · Tel.: (21) 99984-1127 / (24) 2106-1015</div>
</div></body></html>`;
}

app.get('/api/contratos/:id/pdf', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1] || req.query.token;
  if (token) {
    try { jwt.verify(token, process.env.JWT_SECRET || 'dev-secret'); }
    catch { return res.status(401).json({ error: 'Invalid token' }); }
  }

  try {
    await connectDB();
    let c;
    if (isConnected) c = await Contrato.findOne({ _id: req.params.id });
    else c = memStore.contratos.find(x => x._id === req.params.id);
    if (!c) return res.status(404).json({ error: 'Not found' });

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(buildContratoPdfHtml(c));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Certificado de Garantia PDF ───────────────────────────────────────────────

function buildGarantiaPdfHtml(c) {
  // ── helpers ────────────────────────────────────────────────────────────────
  const fmtDate = (d) => {
    if (!d) return '';
    let dt;
    if (typeof d === 'number') {
      if (d < 1000000) return ''; // parece ser 0 ou valor inválido
      dt = new Date(d);
    } else {
      const s = String(d);
      dt = new Date(s.length === 10 && s.includes('-') ? s + 'T12:00:00' : s);
    }
    if (isNaN(dt.getTime()) || dt.getFullYear() < 2000) return '';
    return dt.toLocaleDateString('pt-BR', { day:'2-digit', month:'long', year:'numeric' });
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
  const dataEmissao = fmtDate(c.dataTermino) || fmtDate(c.dataAssinatura) || new Date().toLocaleDateString('pt-BR', { day:'2-digit', month:'long', year:'numeric' });

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
@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}@page{margin:0;size:A4}.download-btn{display:none!important}}
</style>
</head>
<body>
<button class="download-btn" onclick="window.print()">⬇ Salvar como PDF</button>
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
  try { jwt.verify(token, process.env.JWT_SECRET || 'dev-secret'); }
  catch { return res.status(401).json({ error: 'Invalid token' }); }
  try {
    await connectDB();
    let c;
    if (isConnected) c = await Contrato.findOne({ _id: req.params.id });
    else c = memStore.contratos.find(x => x._id === req.params.id);
    if (!c) return res.status(404).json({ error: 'Not found' });
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(buildGarantiaPdfHtml(c));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── ART PDF ───────────────────────────────────────────────────────────────────

function buildArtPdfHtml(c) {
  const fmtDate = (d) => {
    if (!d) return '___';
    const dt = new Date(d.includes('-') && d.length === 10 ? d + 'T12:00:00' : d);
    return isNaN(dt.getTime()) ? d : dt.toLocaleDateString('pt-BR');
  };
  const fmt = (n) => 'R$ ' + (n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });

  const nContrato = c.numero ? String(c.numero).padStart(4, '0') : '___';
  const cliente = c.razaoSocial || c.cliente || '___';
  const cnpj = c.cnpjCliente || '___';
  const endereco = c.endereco || '___';
  const cidade = c.cidade || '___';
  const cep = c.cep || '___';
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
  try { jwt.verify(token, process.env.JWT_SECRET || 'dev-secret'); }
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
    if (isConnected) return res.json(await Contrato.find().sort({ createdAt: -1 }));
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
      ac: o.ac || '', celular: o.celular || '',
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

app.put('/api/contratos/:id', auth, async (req, res) => {
  try {
    await connectDB();
    const updates = { ...req.body, updatedAt: Date.now() };
    if (isConnected) {
      const docAtual = await Contrato.findOne({ _id: req.params.id }).lean();
      pushStatusHistorico(updates, updates.status, docAtual);
      const c = await Contrato.findOneAndUpdate({ _id: req.params.id }, updates, { new: true });
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
    if (isConnected) {
      const doc = await Contrato.findOne({ _id: req.params.id }).lean();
      if (!doc) return res.status(404).json({ error: 'Not found' });
      const hist = [...(doc.statusHistorico || []), { status, data: Date.now() }];
      const updated = await Contrato.findOneAndUpdate(
        { _id: req.params.id },
        { status, statusHistorico: hist, updatedAt: Date.now() },
        { new: true }
      ).lean();
      return res.json(updated);
    }
    const c = memStore.contratos.find(x => x._id === req.params.id);
    if (!c) return res.status(404).json({ error: 'Not found' });
    c.status = status;
    c.statusHistorico = [...(c.statusHistorico || []), { status, data: Date.now() }];
    res.json(c);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/contratos/:id', auth, adminOnly, async (req, res) => {
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
      process.env.JWT_SECRET || 'dev-secret',
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

app.get('/api/calendar/events', auth, async (req, res) => {
  try {
    // Use access token from JWT directly — no DB lookup needed
    const accessToken = req.user.googleAccessToken;
    if (!accessToken) return res.json([]);

    const now = new Date();
    const maxTime = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const params = new URLSearchParams({
      timeMin: now.toISOString(),
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

app.get('/api/usuarios', auth, adminOnly, async (req, res) => {
  try {
    await connectDB();
    if (isConnected) {
      const users = await User.find().select('-googleAccessToken -googleRefreshToken -googleTokenExpiry');
      return res.json(users.map(u => ({ id: u._id, email: u.email, name: u.name, role: u.role, picture: u.picture })));
    }
    res.json(memStore.users.map(u => ({ id: u._id || u.email, email: u.email, name: u.name, role: u.role, picture: u.picture })));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/usuarios', auth, adminOnly, async (req, res) => {
  try {
    await connectDB();
    const { email, name, role, password } = req.body;
    if (!email) return res.status(400).json({ error: 'Email obrigatório' });
    const isOperador = (role || 'medidor') === 'operador';
    const userData = {
      _id: email, email, name: name || '', role: role || 'medidor',
      ...(isOperador ? { password: password || '123456', mustChangePassword: true } : {}),
    };
    if (isConnected) {
      const existing = await User.findById(email);
      if (existing) return res.status(409).json({ error: 'Usuário já existe' });
      const created = await User.create(userData);
      return res.json({ id: created._id, email: created.email, name: created.name, role: created.role });
    }
    if (memStore.users.find(u => u._id === email || u.email === email)) {
      return res.status(409).json({ error: 'Usuário já existe' });
    }
    memStore.users.push(userData);
    res.json({ id: email, email, name: userData.name, role: userData.role });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/usuarios/:email', auth, adminOnly, async (req, res) => {
  try {
    await connectDB();
    const { email } = req.params;
    const { name, role } = req.body;
    const updates = {};
    if (name !== undefined) updates.name = name;
    if (role !== undefined) updates.role = role;
    if (isConnected) {
      const updated = await User.findByIdAndUpdate(email, updates, { new: true });
      if (!updated) return res.status(404).json({ error: 'Usuário não encontrado' });
      return res.json({ id: updated._id, email: updated.email, name: updated.name, role: updated.role });
    }
    const u = memStore.users.find(x => x._id === email || x.email === email);
    if (!u) return res.status(404).json({ error: 'Usuário não encontrado' });
    Object.assign(u, updates);
    res.json({ id: u._id || u.email, email: u.email, name: u.name, role: u.role });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/usuarios/:email', auth, adminOnly, async (req, res) => {
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
      const token = jwt.sign({ username: user.name || email, email, role: 'operador', mustChangePassword: false, picture: pic }, process.env.JWT_SECRET || 'dev-secret', { expiresIn: '24h' });
      return res.json({ success: true, token, user: { username: user.name || email, email, role: 'operador', mustChangePassword: false, picture: pic } });
    }
    // memStore fallback
    const u = memStore.users.find(x => x._id === email || x.email === email);
    if (!u) return res.status(404).json({ error: 'Usuário não encontrado' });
    const crypto = require('crypto');
    const novoHash = crypto.createHash('sha256').update(novaSenha).digest('hex');
    u.password = novoHash; u.mustChangePassword = false;
    const pic = u.picture || '';
    const token = jwt.sign({ username: u.name || email, email, role: 'operador', mustChangePassword: false, picture: pic }, process.env.JWT_SECRET || 'dev-secret', { expiresIn: '24h' });
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
    const token = jwt.sign(payload, process.env.JWT_SECRET || 'dev-secret', { expiresIn: '24h' });
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

app.delete('/api/equipes/:id', auth, adminOnly, async (req, res) => {
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
      const todasOS = await OS.find({})
        .select('consumoProduto totalConsumoReal consumosDiarios createdAt status tipo').lean();

      const osAtivasNorm = todasOS.filter(o => (o.tipo || 'normal') === 'normal');
      const osAtivasRep  = todasOS.filter(o => o.tipo === 'reparo');

      const estimadoObras  = osAtivasNorm.reduce((s, o) => s + (o.consumoProduto || 0), 0);
      const realObras      = osAtivasNorm.reduce((s, o) => s + (o.totalConsumoReal || 0), 0);
      const estimadoRep    = osAtivasRep.reduce((s, o) => s + (o.consumoProduto || 0), 0);
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
    const filter = equipeId ? { equipeId } : {};
    if (tipoFilter) filter.tipo = tipoFilter;
    if (isConnected) return res.json(await OS.find(tipoFilter ? { ...filter, tipo: tipoFilter } : filter).sort({ createdAt: -1 }).lean());
    let list = memStore.ordens;
    if (equipeId) list = list.filter(o => o.equipeId === equipeId);
    if (tipoFilter) list = list.filter(o => (o.tipo || 'normal') === tipoFilter);
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
    const data = { ...req.body, _id: uuidv4(), numero, createdAt: Date.now(), updatedAt: Date.now() };

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
    if (isConnected) {
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

  const dataEmissao = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });

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
  try { jwt.verify(token, process.env.JWT_SECRET || 'dev-secret'); }
  catch { return res.status(401).json({ error: 'Invalid token' }); }
  try {
    await connectDB();
    let os;
    if (isConnected) os = await OS.findById(req.params.id);
    else os = memStore.ordens.find(x => x._id === req.params.id);
    if (!os) return res.status(404).json({ error: 'Not found' });

    // Try to load contrato for garantia years
    let contrato = null;
    if (os.contratoId) {
      if (isConnected) contrato = await Contrato.findOne({ _id: os.contratoId });
      else contrato = memStore.contratos.find(x => x._id === os.contratoId);
    }

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(buildRelatorioGarantiaOS(os, contrato));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Finalizar OS (aplicador — sem auth JWT) ───────────────────────────────────
// Recebe: { nomeResponsavel, cargoResponsavel, assinaturaBase64 }
app.patch('/api/aplicador/os/:id/finalizar', async (req, res) => {
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
app.patch('/api/aplicador/os/:id/consumo', async (req, res) => {
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
app.patch('/api/aplicador/os/:id/fechar-dia', async (req, res) => {
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

// ── Alterar status da OS pelo aplicador (sem auth JWT — reabrir, etc.) ──────────
app.patch('/api/aplicador/os/:id/status', async (req, res) => {
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
        { equipeId, equipeNome, historicoEquipes: hist, updatedAt: agora },
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
  const nOS = os.numero ? String(os.numero).padStart(4, '0') : '___';
  const cliente = os.cliente || '___';
  const endereco = os.endereco || '';
  const cidade = os.cidade || '';
  const garantia = contrato?.garantia || 15;
  const dataEmissao = os.concluidaEm
    ? new Date(os.concluidaEm).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })
    : new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });

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
      ${os.dataInicio ? `<div>Início: ${os.dataInicio}</div>` : ''}
      ${os.dataTermino ? `<div>Término: ${os.dataTermino}</div>` : ''}
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
  try { jwt.verify(token, process.env.JWT_SECRET || 'dev-secret'); }
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

// API publica para o aplicador (sem auth JWT — usa equipeId + membro como identificacao)
app.get('/api/aplicador/equipes', async (req, res) => {
  try {
    await connectDB();
    if (isConnected) return res.json(await Equipe.find({ ativa: true }).select('_id nome membros emailGmail cor'));
    res.json(memStore.equipes.filter(e => e.ativa !== false));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Listar todos os croquis (para a página de croquis no painel) ──────────────
app.get('/api/croquis', auth, async (req, res) => {
  try {
    await connectDB();
    let result = [];
    const osList = isConnected
      ? await OS.find({ 'pontos.croquiBase64': { $exists: true } })
          .select('_id numero cliente endereco bairro cidade status tipo pontos equipeId equipeNome dataInicio createdAt')
          .lean()
      : memStore.ordens;

    for (const os of osList) {
      const pts = (os.pontos || []);
      pts.forEach((p, idx) => {
        const imagem = p.croquiOtimizado || p.croquiBase64;
        if (!imagem) return;
        // Rejeita imagens inválidas (truncadas pelo sanitizeImages por excesso de tamanho)
        if (typeof imagem === 'string' && imagem.includes('IMAGEM_MUITO_GRANDE')) return;
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
    // ordenar do mais recente para o mais antigo
    result.sort((a, b) => b.updatedAt - a.updatedAt);
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/aplicador/os', async (req, res) => {
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
app.get('/api/aplicador/os/compartilhadas', async (req, res) => {
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
app.get('/api/aplicador/os/historico-reparos', async (req, res) => {
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

app.get('/api/aplicador/os/:id', async (req, res) => {
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
app.patch('/api/aplicador/os/:id/pontos/:idx', async (req, res) => {
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
    } else if (action === 'save_croqui') {
      const { croquiBase64 } = req.body;
      if (!croquiBase64) return res.status(400).json({ error: 'croquiBase64 required' });
      const safeCroqui = sanitizeImages({ croquiBase64 }, `ponto[${idx}].croquiBase64`);
      p.croquiBase64 = safeCroqui.croquiBase64;
      p.croquiStatus = 'manual';
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
      const itens = await Lixeira.find().sort({ deletadoEm: -1 }).lean();
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
app.post('/api/aplicador/os/:id/compartilhar', async (req, res) => {
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
      // Reparos causados pela equipe (onde ela foi a executora do serviço original)
      const reparosCausados = osList.filter(o => o.tipo === 'reparo' && String(o.equipeOriginalId) === eqId).length;
      // Reparos em execução pela equipe (ela está consertando — não penaliza)
      const reparosEmExecucao = osList.filter(o => o.tipo === 'reparo' && String(o.equipeId) === eqId).length;
      let subFeitos = 0, metragem = 0, consumoEstim = 0, consumoReal = 0;
      osEquipe.forEach(os => {
        const pts = ensureSubPontos(os.pontos || []);
        pts.forEach(p => {
          subFeitos += (p.subPontos || []).filter(sp => sp.feito).length;
          metragem  += (Number(p.trinca) || 0) + (Number(p.juntaFria) || 0) + (Number(p.juntaDilat) || 0) + (Number(p.ferragem) || 0);
        });
        consumoEstim += os.consumoProduto || 0;
        consumoReal  += os.totalConsumoReal || 0;
      });
      // Obras concluídas vs total
      const obrasExecutadas = osEquipe.filter(o => o.status === 'concluida').length;
      // Reparos próprios (equipe executa reparo de outra equipe = serviço extra prestado)
      const reparosProprios = reparosEmExecucao;
      // Score melhorado: +10 por obra concluída, +2 por sub-ponto, +1 por metro, -5 por reparo CAUSADO, +3 por reparo próprio executado, ±variação consumo
      const varConsumo = consumoEstim > 0 ? Math.abs((consumoReal - consumoEstim) / consumoEstim) : 0;
      const bonusConsumo = varConsumo < 0.1 ? 5 : varConsumo < 0.2 ? 2 : 0;
      const score = (obrasExecutadas * 10) + (subFeitos * 2) + Math.round(metragem) + (reparosCausados * -5) + (reparosProprios * 3) + bonusConsumo;
      return { equipeId: eqId, equipeNome: eq.nome, cor: eq.cor, totalOS: osEquipe.length, obrasExecutadas, subFeitos, metragem: Math.round(metragem * 10) / 10, reparosCausados, reparosEmExecucao, reparosProprios, consumoEstim, consumoReal, score };
    });

    ranking.sort((a, b) => b.score - a.score);
    res.json({ periodo: { inicio, fim }, ranking });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Criar reparo a partir de OS existente ─────────────────────────────────────
app.post('/api/reparos/from-os', auth, async (req, res) => {
  try {
    await connectDB();
    const { osOriginalId, pontoIdx, pontosIdx, itensSelecionados, tipoReparo, equipeId, dataInicio, obs, fotosReparo } = req.body;
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

    const count = isConnected ? await OS.countDocuments() : memStore.ordens.length;
    const novaOS = {
      _id: uuidv4(),
      numero: count + 1,
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
      pontos: pontosReparo,
      obs: obs || '',
      fotosReparo: Array.isArray(fotosReparo) ? fotosReparo.map(f => ({ data: f })) : [],
      progresso: 0,
      consumoProduto: 0,
      totalConsumoReal: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
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

app.delete('/api/ordens-servico/:id', auth, adminOnly, async (req, res) => {
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

app.post('/api/croqui/otimizar', async (req, res) => {
  try {
    const { imagem } = req.body;
    if (!imagem) return res.status(400).json({ error: 'imagem required' });

    const GEMINI_KEY = (process.env.GEMINI_API_KEY || '').trim();
    if (!GEMINI_KEY) {
      return res.json({ imagemOtimizada: imagem, fonte: 'original', aviso: 'Configure GEMINI_API_KEY para usar a otimização de croqui' });
    }

    // Use Gemini 2.0 Flash image generation via REST
    const prompt = 'Transforme este croqui de planta baixa em um desenho técnico limpo e apresentável de impermeabilização. Mantenha proporções, labels e referências. Fundo branco, linhas pretas, estilo planta baixa técnica arquitetônica.';

    const body = {
      contents: [{
        parts: [
          { text: prompt },
          { inline_data: { mime_type: 'image/png', data: imagem.replace(/^data:image\/\w+;base64,/, '') } }
        ]
      }],
      generationConfig: { responseModalities: ['IMAGE', 'TEXT'] }
    };

    const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-preview-image-generation:generateContent?key=${GEMINI_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error?.message || 'Gemini error');

    // Extract image from response
    const parts = data.candidates?.[0]?.content?.parts || [];
    const imgPart = parts.find(p => p.inlineData?.mimeType?.startsWith('image/'));
    if (!imgPart) throw new Error('Gemini não retornou imagem');

    return res.json({ imagemOtimizada: imgPart.inlineData.data, fonte: 'gemini' });
  } catch (err) {
    console.error('Croqui otimizar error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── SPA fallback ──────────────────────────────────────────────────────────────

if (process.env.NODE_ENV === 'production') {
  app.get('*', (req, res) => {
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

// ── Start server (local dev) ──────────────────────────────────────────────────

const PORT = process.env.PORT || 3001;
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  app.listen(PORT, () => console.log(`Vedafácil API running on port ${PORT}`));
}

export default app;
