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
  cidade: String,
  cep: String,
  ac: String,
  celular: String,
  obs: String,
  locais: [mongoose.Schema.Types.Mixed],
  fotos: [mongoose.Schema.Types.Mixed],
}, { _id: false });

const orcamentoSchema = new mongoose.Schema({
  _id: { type: String, default: uuidv4 },
  numero: Number,
  medicaoId: String,
  status: { type: String, default: 'rascunho' },
  createdAt: { type: Number, default: Date.now },
  updatedAt: { type: Number, default: Date.now },
  cliente: String, endereco: String, cidade: String, cep: String, ac: String, celular: String,
  dataOrcamento: String, validade: String, avaliadoPor: String, acompanhadoPor: String,
  tecnicoResponsavel: String, elaboradoPor: String, origem: String, sigla: String,
  itens: [mongoose.Schema.Types.Mixed],
  totalBruto: { type: Number, default: 0 },
  desconto: { type: Number, default: 0 },
  descontoTipo: { type: String, default: 'percent' },
  totalLiquido: { type: Number, default: 0 },
  entrada: { type: Number, default: 0 },
  saldo: { type: Number, default: 0 },
  parcelas: { type: Number, default: 1 },
  valorParcela: { type: Number, default: 0 },
  obsAdicionais: String,
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
  cliente: String, endereco: String, cidade: String, cep: String, ac: String, celular: String,
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
}, { _id: false });

const userSchema = new mongoose.Schema({
  _id: { type: String }, // email
  email: String,
  name: String,
  picture: String,
  role: { type: String, default: 'medidor' },
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
  }
}, { _id: false });

const Medicao = mongoose.model('Medicao', medicaoSchema);
const Orcamento = mongoose.model('Orcamento', orcamentoSchema);
const Contrato = mongoose.model('Contrato', contratoSchema);
const Config = mongoose.model('Config', configSchema);

// In-memory fallback (when no MongoDB)
const memStore = { medicoes: [], orcamentos: [], contratos: [], config: null, users: [] };

// ── Middleware ────────────────────────────────────────────────────────────────

app.use(cors());
app.use(express.json({ limit: '50mb' }));

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

// ── Auth Routes ───────────────────────────────────────────────────────────────

app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  if (username === (process.env.ADMIN_USER || 'admin') &&
      password === (process.env.ADMIN_PASSWORD || 'vedafacil2025')) {
    const token = jwt.sign({ username, role: 'admin' }, process.env.JWT_SECRET || 'dev-secret', { expiresIn: '24h' });
    return res.json({ token, user: { username, role: 'admin' } });
  }
  res.status(401).json({ error: 'Credenciais inválidas' });
});

app.get('/api/auth/me', auth, (req, res) => {
  res.json({ user: req.user });
});

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
    const data = req.body;

    if (isConnected) {
      const count = await Medicao.countDocuments();
      const medicao = await Medicao.create({ ...data, _id: data.id || uuidv4(), numeroMedicao: count + 1 });
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

app.get('/api/medicoes', auth, async (req, res) => {
  try {
    await connectDB();
    if (isConnected) {
      const medicoes = await Medicao.find().sort({ createdAt: -1 }).select('-fotos');
      return res.json(medicoes);
    }
    res.json(memStore.medicoes.map(m => { const { fotos, ...rest } = m; return rest; }));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/medicoes/:id', auth, async (req, res) => {
  try {
    await connectDB();
    if (isConnected) {
      const m = await Medicao.findById(req.params.id);
      if (!m) return res.status(404).json({ error: 'Not found' });
      return res.json(m);
    }
    const m = memStore.medicoes.find(x => x._id === req.params.id);
    if (!m) return res.status(404).json({ error: 'Not found' });
    res.json(m);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/medicoes/:id', auth, async (req, res) => {
  try {
    await connectDB();
    const allowed = ['cliente','nomeCliente','ac','endereco','cidade','cep','celular','telefone','locais','obs'];
    const update = {};
    allowed.forEach(k => { if (req.body[k] !== undefined) update[k] = req.body[k]; });
    if (isConnected) {
      const m = await Medicao.findByIdAndUpdate(req.params.id, update, { new: true });
      return res.json(m);
    }
    const idx = memStore.medicoes.findIndex(x => x._id === req.params.id);
    if (idx !== -1) Object.assign(memStore.medicoes[idx], update);
    res.json(memStore.medicoes[idx]);
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

app.delete('/api/medicoes/:id', auth, async (req, res) => {
  try {
    await connectDB();
    if (isConnected) { await Medicao.findByIdAndDelete(req.params.id); }
    else { memStore.medicoes = memStore.medicoes.filter(x => x._id !== req.params.id); }
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

// Fórmulas extraídas da planilha "3071 - Condomínio Seleto.xls", Aba 1 (Informações)
// 9m de injeção linear por dia | GVF Seal: 1.5L/m trinca, 1.0L/m junta | 4 injetores/m (1 a cada 25cm)
function calcObra(totals) {
  const linear = (totals.trinca || 0) + (totals.juntaFria || 0) + (totals.juntaDilat || 0);
  return {
    diasTrabalho: parseFloat((linear / 9).toFixed(2)),
    consumoProduto: parseFloat(((totals.trinca || 0) * 1.5 + ((totals.juntaFria || 0) + (totals.juntaDilat || 0)) * 1.0).toFixed(1)),
    qtdInjetores: Math.ceil(linear * 4),
  };
}

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
      status: 'rascunho',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      cliente: medicao?.cliente || '',
      endereco: medicao?.endereco || '',
      cidade: medicao?.cidade || '',
      cep: medicao?.cep || '',
      ac: medicao?.ac || '',
      celular: medicao?.celular || '',
      dataOrcamento: new Date().toISOString().split('T')[0],
      validade: '',
      avaliadoPor: medicao?.user || '', acompanhadoPor: '', tecnicoResponsavel: 'Thiago Ramos Ferraz', elaboradoPor: '',
      origem: '', sigla: '',
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

app.delete('/api/orcamentos/:id', auth, async (req, res) => {
  try {
    await connectDB();
    if (isConnected) { await Orcamento.findByIdAndDelete(req.params.id); }
    else { memStore.orcamentos = memStore.orcamentos.filter(x => x._id !== req.params.id); }
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

  const descontoValor = o.descontoTipo === 'percent'
    ? (o.totalBruto * (o.desconto || 0) / 100)
    : (o.desconto || 0);
  const totalLiquido = o.totalLiquido || (o.totalBruto - descontoValor);
  const parcelas = o.parcelas || 1;
  const valorParcelaBruto = parcelas > 1 ? (o.totalBruto / parcelas) : o.totalBruto;

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
    <div>${[o.ac, o.celular].filter(Boolean).join(' - ')}${o.validade ? ' - ' + fmtDate(o.validade) : ''}</div>
  </div>
  <div class="hbox-r">
    <div style="font-size:13px;font-weight:bold;text-align:right;margin-bottom:6px;">ORÇAMENTO Nº ${o.numero || 1}</div>
    <div style="display:flex;justify-content:space-between;"><span>Data Medição:</span><strong>${fmtDate(o.dataOrcamento)}</strong></div>
    <div style="display:flex;justify-content:space-between;"><span>Validade Proposta:</span><strong>${fmtDate(o.validade)}</strong></div>
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
  <div style="flex-shrink:0;width:230px;display:flex;flex-direction:column;align-items:center;">
    ${gvfLogo ? `<div>${gvfLogo}</div>` : ''}
    ${gvfGalao ? `<div>${gvfGalao}</div>` : ''}
  </div>
</div>
<div class="feats">
  <div>PRODUTO BICOMPONENTE</div><div>HIDROEXPANSIVO E HIDROABSORVENTE</div>
  <div>POSSUI ATÉ 300% DE ELONGAÇÃO</div><div>PODE SER APLICADO COM FLUXO DE ÁGUA</div>
  <div>TEMPO DE REAÇÃO 1,05-1,55min</div><div>PENETRA EM FISSURAS DE ATÉ 0,05mm</div>
</div>
${FOOTER}
</div>

<!-- PAGE 2b -->
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

<p style="text-align:center;font-weight:bold;font-size:11px;margin-bottom:4px;">Proposta</p>
<table class="pay">
  <tr>
    <td style="font-style:italic;width:55%"><em>Total Orçamento</em></td>
    <td style="text-align:right;font-weight:bold;font-size:12px;">${fmt(o.totalBruto)}</td>
  </tr>
  ${(o.desconto && Number(o.desconto) > 0) ? `
  <tr>
    <td style="font-style:italic;"><em>Desconto</em> &nbsp;&nbsp; ${o.desconto}%</td>
    <td style="text-align:right;">${fmt(descontoValor)}</td>
  </tr>
  <tr>
    <td style="font-style:italic;font-weight:bold;"><strong>Total</strong></td>
    <td style="text-align:right;font-weight:bold;font-size:12px;"><strong>${fmt(totalLiquido)}</strong></td>
  </tr>` : ''}
  <tr><td colspan="2" style="font-style:italic;font-size:10px;">${condicaoPgto1Obs}</td></tr>
</table>

<p style="text-align:center;font-size:10.5px;margin:8px 0 4px;font-weight:bold;">Proposta 2 : &nbsp;<em>(Pagamento parcelado)</em></p>
<table class="pay">
  <tr>
    <td style="font-style:italic;width:55%"><em>Qtde de parcelas</em></td>
    <td style="text-align:center;font-weight:bold;width:15%">${parcelas}</td>
    <td style="text-align:right;">${fmt(valorParcelaBruto)}</td>
  </tr>
  <tr>
    <td style="font-style:italic;font-weight:bold;"><strong>Total</strong></td>
    <td colspan="2" style="text-align:right;font-weight:bold;font-size:12px;"><strong>${fmt(o.totalBruto)}</strong></td>
  </tr>
  <tr><td colspan="3" style="font-style:italic;font-size:10px;font-weight:bold;">Observações:</td></tr>
  <tr><td colspan="3" style="font-style:italic;font-size:10px;">${condicaoPgto2Obs1}</td></tr>
  <tr><td colspan="3" style="font-style:italic;font-size:10px;">${condicaoPgto2Obs2}</td></tr>
</table>

<p style="font-style:italic;font-size:10px;margin:8px 0;">${obsGeral}</p>

${sec('8','INFORMAÇÕES ADICIONAIS')}
<p style="font-size:11px;margin:8px 0;">
  &rarr; O prazo de execução desta obra será de:
  <span style="display:inline-block;min-width:36px;border-bottom:1px solid #333;text-align:center;font-weight:bold;margin:0 6px;">${prazoExecucao}</span>
  dia (s) útil(eis).
</p>
${(o.diasTrabalho || o.consumoProduto || o.qtdInjetores) ? `
<table style="border-collapse:collapse;font-size:10.5px;margin:10px 0;">
  <thead><tr style="background:#e87722;color:white;">
    <th style="padding:5px 14px;text-align:left;">Cálculo de Obra</th>
    <th style="padding:5px 18px;text-align:center;">Qtd.</th>
    <th style="padding:5px 12px;text-align:left;">Unidade</th>
  </tr></thead>
  <tbody>
    <tr><td style="padding:4px 14px;border:1px solid #ddd;">Dias de Trabalho</td><td style="padding:4px 18px;border:1px solid #ddd;text-align:center;">${(o.diasTrabalho||0).toLocaleString('pt-BR',{minimumFractionDigits:2})}</td><td style="padding:4px 12px;border:1px solid #ddd;">dias</td></tr>
    <tr><td style="padding:4px 14px;border:1px solid #ddd;">Consumo GVF Seal</td><td style="padding:4px 18px;border:1px solid #ddd;text-align:center;">${(o.consumoProduto||0).toLocaleString('pt-BR',{minimumFractionDigits:1})}</td><td style="padding:4px 12px;border:1px solid #ddd;">litros</td></tr>
    <tr><td style="padding:4px 14px;border:1px solid #ddd;">Qtd. de Injetores</td><td style="padding:4px 18px;border:1px solid #ddd;text-align:center;">${o.qtdInjetores||0}</td><td style="padding:4px 12px;border:1px solid #ddd;">unid</td></tr>
  </tbody>
</table>` : ''}
<p style="margin:12px 0;">A <strong>VEDAFACIL</strong> agradece sua atenção e fica ao seu dispor para maiores esclarecimentos.</p>
<p style="margin-bottom:14px;">Atenciosamente,</p>

<div class="sigs">
  <div><div class="role">Departamento<br>Comercial:</div><div class="line">${o.departamentoComercial || o.elaboradoPor || 'Daniel Guimarães'}</div></div>
  <div><div class="role">Técnico<br>Responsável:</div><div class="line">${o.avaliadoPor || ''}</div></div>
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

function extenso(n) {
  if (n === 0) return 'zero';
  const unidades = ['','um','dois','três','quatro','cinco','seis','sete','oito','nove','dez','onze','doze','treze','quatorze','quinze','dezesseis','dezessete','dezoito','dezenove'];
  const dezenas = ['','','vinte','trinta','quarenta','cinquenta','sessenta','setenta','oitenta','noventa'];
  const centenas = ['','cento','duzentos','trezentos','quatrocentos','quinhentos','seiscentos','setecentos','oitocentos','novecentos'];
  if (n < 20) return unidades[n];
  if (n < 100) return dezenas[Math.floor(n/10)] + (n%10 ? ' e ' + unidades[n%10] : '');
  if (n < 1000) return (n === 100 ? 'cem' : centenas[Math.floor(n/100)] + (n%100 ? ' e ' + extenso(n%100) : ''));
  if (n < 1000000) return extenso(Math.floor(n/1000)) + (Math.floor(n/1000) > 1 ? ' mil' : ' mil') + (n%1000 ? (n%1000 < 100 ? ' e ' : ' ') + extenso(n%1000) : '');
  if (n < 1000000000) return extenso(Math.floor(n/1000000)) + (Math.floor(n/1000000) > 1 ? ' milhões' : ' milhão') + (n%1000000 ? (n%1000000 < 100 ? ' e ' : ' ') + extenso(n%1000000) : '');
  return n.toString();
}

function valorExtenso(valor) {
  const reais = Math.floor(valor);
  const centavos = Math.round((valor - reais) * 100);
  let texto = extenso(reais) + (reais === 1 ? ' real' : ' reais');
  if (centavos > 0) texto += ' e ' + extenso(centavos) + (centavos === 1 ? ' centavo' : ' centavos');
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

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
    if (isConnected) c = await Contrato.findById(req.params.id);
    else c = memStore.contratos.find(x => x._id === req.params.id);
    if (!c) return res.status(404).json({ error: 'Not found' });

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(buildContratoPdfHtml(c));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Certificado de Garantia PDF ───────────────────────────────────────────────

function buildGarantiaPdfHtml(c) {
  const fmtDate = (d) => {
    if (!d) return new Date().toLocaleDateString('pt-BR', { day:'2-digit', month:'long', year:'numeric' });
    const dt = new Date(d.includes('-') && d.length === 10 ? d + 'T12:00:00' : d);
    return isNaN(dt.getTime()) ? d : dt.toLocaleDateString('pt-BR', { day:'2-digit', month:'long', year:'numeric' });
  };

  const anos = c.garantia || 15;
  const anosExt = extenso(anos);
  const nContrato = c.numero ? String(c.numero).padStart(4, '0') : '___';
  const cliente = c.razaoSocial || c.cliente || '___';
  const endereco = c.endereco || '';
  const cidade = c.cidade || '';
  const cnpj = c.cnpjCliente || '';
  const dataEmissao = fmtDate(c.dataTermino || c.dataAssinatura || '');
  const foro = c.foro || 'Rio de Janeiro';

  // Build trabalho description from locais
  const locais = c.locais || [];
  const descLocais = locais.map(l => {
    const partes = [];
    if (l.trinca > 0) partes.push(`${l.trinca}m de trinca`);
    if (l.juntaFria > 0) partes.push(`${l.juntaFria}m de junta fria`);
    if (l.ralo > 0) partes.push(`${l.ralo} ralo(s)`);
    if (l.juntaDilat > 0) partes.push(`${l.juntaDilat}m de junta de dilatação`);
    if (l.ferragem > 0) partes.push(`${l.ferragem}m de tratamento de ferragem`);
    if (l.cortina > 0) partes.push(`${l.cortina}m² de cortina`);
    return partes.length ? `${l.nome || 'Local'}: ${partes.join(', ')}` : null;
  }).filter(Boolean).join('; ');

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

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8">
<title>Certificado_Garantia_${nContrato}_${cliente.replace(/[^a-zA-Z0-9]/g,'_')}</title>
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
.footer{text-align:center;font-size:8.5px;color:#666;margin-top:16px;padding-top:8px;border-top:1px solid #ccc}
.download-btn{position:fixed;top:12px;right:12px;z-index:9999;background:#e87722;color:white;border:none;padding:10px 20px;font-size:14px;font-weight:700;border-radius:8px;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,0.3)}
@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}@page{margin:0;size:A4}.download-btn{display:none!important}}
</style>
</head>
<body>
<button class="download-btn" onclick="window.print()">⬇ Salvar como PDF</button>
<div class="pg">
  ${logoImg}
  <div class="title">Certificado de Garantia</div>
  <div class="subtitle">Nº ${nContrato}</div>
  <hr class="divider">

  <div class="client-box">
    <strong>Contratante</strong>
    <div><b>${cliente}</b>${cnpj ? ` &nbsp;|&nbsp; CNPJ: ${cnpj}` : ''}</div>
    ${endereco ? `<div>${endereco}${cidade ? ', ' + cidade : ''}</div>` : ''}
  </div>

  <div class="clause">
    <span class="clause-num">1.</span> A empresa <strong>T. R. FERRAZ (VEDAFACIL)</strong> oferece garantia limitada por um período de
    <strong>${anos} (${anosExt}) anos</strong>, nas áreas tratadas e especificadas no Contrato de Prestação de
    Serviço nº <strong>${nContrato}</strong>, contada a partir da data de emissão desse certificado.
  </div>

  <div class="clause">
    <span class="clause-num">2.</span> <b>Trabalho realizado:</b> Serviço de hidrojateamento para selamento de trincas com problemas de
    infiltração, por meio de pressão negativa com gel calafetador de alta flexibilidade (GVF SEAL).
    ${descLocais ? `<br><span style="color:#555;font-size:10.5px;">Locais tratados: ${descLocais}.</span>` : ''}
  </div>

  <div class="clause">
    <span class="clause-num">3.</span> Cessa a garantia caso sejam realizadas obras posteriores ao tratamento e estas obras
    afetem as condições da estrutura nas regiões especificadas neste certificado.
  </div>

  <div class="clause">
    <span class="clause-num">4.</span> A garantia não cobre infiltrações em áreas não tratadas, danos causados por terceiros,
    alterações estruturais ou eventos de força maior.
  </div>

  <hr class="divider">

  <div style="display:flex;justify-content:space-between;align-items:flex-end;margin-top:20px;">
    <div>
      <p style="font-size:10.5px;">${foro}, ${dataEmissao}</p>
    </div>
    <div style="text-align:center;">
      ${seloImg}
    </div>
  </div>

  <div class="sig-block" style="margin-top:24px;">
    ${assinaturaImg}
    <div class="sig-line">Thiago Ramos Ferraz</div>
    <div style="font-size:9.5px;color:#555;">T. R. FERRAZ TECNOLOGIA EM IMPERMEABILIZAÇÃO LTDA ME</div>
    <div style="font-size:9.5px;color:#555;">CNPJ: 23.606.470/0001-07</div>
  </div>

  <div class="footer">
    <strong style="color:#e87722;">Eliminamos Infiltrações Sem Quebrar!</strong><br>
    CNPJ: 23.606.470/0001-07 &nbsp;|&nbsp; Tel.: (21) 99984-1127 / (24) 2106-1015
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
      const c = await Contrato.findByIdAndUpdate(req.params.id, { garantiaEnviadaEm: ts }, { new: true });
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
    if (isConnected) c = await Contrato.findById(req.params.id);
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
    if (isConnected) c = await Contrato.findById(req.params.id);
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
    if (isConnected) o = await Orcamento.findById(orcamentoId);
    else o = memStore.orcamentos.find(x => x._id === orcamentoId);
    if (!o) return res.status(404).json({ error: 'Orçamento not found' });

    const descontoValor = o.descontoTipo === 'percent' ? (o.totalBruto * (o.desconto || 0) / 100) : (o.desconto || 0);
    const totalLiquido = o.totalLiquido || (o.totalBruto - descontoValor);
    const parcelas = o.parcelas || 1;
    const valorParcela = parcelas > 1 ? (totalLiquido / parcelas) : totalLiquido;

    const n = (isConnected ? await Contrato.countDocuments() : memStore.contratos.length) + 1;
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
      zapsignDocId: null, zapsignSignUrl: null, assinadoEm: null,
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
      const c = await Contrato.findById(req.params.id);
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
      const c = await Contrato.findByIdAndUpdate(req.params.id, updates, { new: true });
      return res.json(c);
    }
    const idx = memStore.contratos.findIndex(x => x._id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Not found' });
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

app.delete('/api/contratos/:id', auth, async (req, res) => {
  try {
    await connectDB();
    if (isConnected) { await Contrato.findByIdAndDelete(req.params.id); }
    else { memStore.contratos = memStore.contratos.filter(x => x._id !== req.params.id); }
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/contratos/:id/zapsign', auth, async (req, res) => {
  try {
    await connectDB();
    let c;
    if (isConnected) c = await Contrato.findById(req.params.id);
    else c = memStore.contratos.find(x => x._id === req.params.id);
    if (!c) return res.status(404).json({ error: 'Not found' });

    // SANDBOX - token fixo ate contratar plano API producao
    const token = '2822110f-b238-480f-b8b6-f11c8697a2c64bb7c8fd-5888-479d-9d98-a6c3b0034950';
    const ZAPSIGN_BASE = 'https://sandbox.api.zapsign.com.br/api/v1';

    console.log('[ZapSign] Sending contrato', req.params.id, '(SANDBOX)');

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

    const docPayload = {
      name: `Contrato Vedafácil - ${c.cliente}`,
      signers: [{ name: c.sindico || c.ac || c.cliente, email: req.body.email || c.emailCliente || '' }]
    };
    if (sendMethod === 'base64') {
      docPayload.base64_pdf = base64Pdf;
    } else {
      const jwtToken = req.headers.authorization?.split(' ')[1] || '';
      docPayload.url_pdf = `${baseUrl}/api/contratos/${req.params.id}/pdf?token=${encodeURIComponent(jwtToken)}`;
    }
    console.log('[ZapSign] send method:', sendMethod);

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
      c = await Contrato.findByIdAndUpdate(req.params.id, { zapsignDocId: docToken, zapsignSignUrl: signUrl }, { new: true });
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
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI || 'https://vedafacil-painel.vercel.app/api/auth/google/callback'
  );
}

app.get('/api/auth/google', (req, res) => {
  if (!process.env.GOOGLE_CLIENT_ID) return res.status(400).json({ error: 'Google OAuth not configured' });
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
    const { email, name, role } = req.body;
    if (!email) return res.status(400).json({ error: 'Email obrigatório' });
    const userData = { _id: email, email, name: name || '', role: role || 'medidor' };
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
    build: 'v3-sandbox',
    zapsign_base: 'https://sandbox.api.zapsign.com.br/api/v1',
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
