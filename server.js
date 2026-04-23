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
  status: { type: String, default: 'aguardando_assinatura' },
  createdAt: { type: Number, default: Date.now },
  updatedAt: { type: Number, default: Date.now },
  cliente: String, endereco: String, cidade: String, cep: String, ac: String, celular: String,
  cnpjCliente: String, cpfResponsavel: String, rgResponsavel: String,
  dataAssinatura: String, dataInicio: String, dataTermino: String,
  foro: { type: String, default: 'Barra Mansa' },
  zapsignDocId: String, zapsignSignUrl: String, assinadoEm: Number,
  itens: [mongoose.Schema.Types.Mixed],
  totalLiquido: { type: Number, default: 0 },
  parcelas: { type: Number, default: 1 },
  valorParcela: { type: Number, default: 0 },
  locais: [mongoose.Schema.Types.Mixed],
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
  if (username === (process.env.ADMIN_USER || 'daniel') &&
      password === (process.env.ADMIN_PASSWORD || 'vedafacil2024')) {
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
    ? `<img src="data:image/png;base64,${GVF_SEAL_LOGO_B64}" style="width:120px;height:auto;display:block;margin:0 auto 4px;" alt="GVF SEAL">`
    : '';
  const gvfGalao = GVF_GALAO_B64
    ? `<img src="data:image/png;base64,${GVF_GALAO_B64}" style="width:100%;max-width:320px;height:auto;display:block;margin:0 auto;border-radius:6px;" alt="GVF SEAL Galão">`
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
  <div style="flex-shrink:0;width:220px;display:flex;flex-direction:column;align-items:center;gap:6px;">
    ${gvfLogo ? `<div>${gvfLogo}</div>` : ''}
    ${gvfGalao ? `<div>${gvfGalao.replace('max-width:320px','max-width:220px')}</div>` : ''}
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

function buildContratoPdfHtml(c) {
  const fmt = (n) => 'R$ ' + (n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
  const today = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
  const dataAssinatura = c.dataAssinatura ? new Date(c.dataAssinatura + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' }) : today;
  const itensFiltrados = (c.itens || []).filter(i => i.quantidade > 0);

  const itemRows = itensFiltrados.map((i, n) => `
    <tr>
      <td>${n+1}</td>
      <td>${i.descricao}</td>
      <td style="text-align:center">${i.quantidade} ${i.unidade}</td>
      <td style="text-align:right">${fmt(i.valorUnit)}</td>
      <td style="text-align:right"><strong>${fmt(i.subtotal)}</strong></td>
    </tr>`).join('');

  const entradaValor = c.totalLiquido * (Number(c.entrada) || 0) / 100;
  const saldo = c.saldo || c.totalLiquido;
  const parcelas = c.parcelas || 1;
  const valorParcela = c.valorParcela || saldo;

  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
  <title>Contrato Vedafácil #${c.numero || 1}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, sans-serif; font-size: 11px; color: #222; line-height: 1.55; }
    .page { padding: 20mm 18mm; max-width: 210mm; margin: 0 auto; }
    h1 { color: #e87722; font-size: 18px; }
    h2 { color: #e87722; font-size: 11px; border-bottom: 2px solid #e87722; padding-bottom: 3px; margin: 14px 0 7px; text-transform: uppercase; letter-spacing: .5px; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #e87722; padding-bottom: 10px; margin-bottom: 14px; }
    .doc-num { font-size: 16px; font-weight: bold; color: #e87722; text-align: right; }
    .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 5px 20px; background: #f5f5f5; padding: 8px 10px; border-radius: 4px; margin: 6px 0 10px; font-size: 10.5px; }
    .info-label { color: #888; font-size: 9px; text-transform: uppercase; }
    table { width: 100%; border-collapse: collapse; margin: 8px 0; font-size: 10px; }
    th { background: #e87722; color: white; padding: 5px 6px; text-align: left; }
    td { padding: 4px 6px; border-bottom: 1px solid #eee; }
    tr:nth-child(even) td { background: #f9f9f9; }
    .total-row td { background: #e8f0fb !important; font-weight: bold; }
    .grand-total td { background: #e87722 !important; color: white !important; font-weight: bold; font-size: 12px; }
    .clause { margin: 6px 0; font-size: 10.5px; }
    .clause strong { color: #e87722; }
    .payment-grid { display: grid; grid-template-columns: repeat(3,1fr); gap: 8px; background: #f0f6ff; border-radius: 4px; padding: 10px; margin: 8px 0; text-align: center; }
    .payment-item .label { font-size: 9px; color: #888; }
    .payment-item .value { font-weight: bold; font-size: 13px; color: #e87722; }
    .signature-area { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 35px; }
    .sig-line { border-top: 1px solid #333; padding-top: 5px; text-align: center; font-size: 10px; }
    .footer { margin-top: 16px; border-top: 1px solid #ccc; padding-top: 8px; font-size: 9px; color: #888; text-align: center; }
    @media print { @page { margin: 15mm; } body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
  </style>
  </head><body><div class="page">

  <div class="header">
    <div>
      <h1>Vedafácil</h1>
      <div style="font-size:9.5px;color:#555;margin-top:3px">T. R. FERRAZ TECNOLOGIA EM IMPERMEABILIZACAO EIRELI ME<br>
      CNPJ: 23.606.470/0001-07 · Rua Profª Margarida F. T. Leite, 670 · Barra Mansa/RJ</div>
    </div>
    <div class="doc-num">
      CONTRATO DE PRESTAÇÃO DE SERVIÇOS<br>
      Nº ${String(c.numero || 1).padStart(4,'0')}
    </div>
  </div>

  <h2>Das Partes</h2>
  <div class="clause">
    <strong>CONTRATADA:</strong> T. R. FERRAZ TECNOLOGIA EM IMPERMEABILIZACAO EIRELI ME, inscrita no CNPJ sob nº 23.606.470/0001-07, com sede na Rua Professora Margarida Fialho Thompson Leite, 670, Barra Mansa/RJ, doravante denominada simplesmente <strong>VEDAFÁCIL</strong>.
  </div>
  <div class="clause" style="margin-top:6px">
    <strong>CONTRATANTE:</strong> ${c.cliente || ''}${c.cnpjCliente ? ', inscrito no CNPJ sob nº ' + c.cnpjCliente : ''}${c.cpfResponsavel ? ', A/C ' + (c.ac || c.cliente) + ', portador do CPF nº ' + c.cpfResponsavel + (c.rgResponsavel ? ' e RG nº ' + c.rgResponsavel : '') : ''}, com endereço em ${c.endereco || ''}${c.cidade ? ', ' + c.cidade : ''}, doravante denominado simplesmente <strong>CONTRATANTE</strong>.
  </div>

  <h2>Do Objeto</h2>
  <div class="clause">
    O presente contrato tem como objeto a prestação de serviços especializados de impermeabilização e tratamento de infiltrações, mediante a aplicação de tecnologia de injeção de gel hidroabsorvente <strong>GVF SEAL</strong>, nas áreas especificadas abaixo.
  </div>

  ${itensFiltrados.length > 0 ? `
  <table>
    <thead><tr><th>#</th><th>Descrição do Serviço</th><th style="text-align:center">Quantidade</th><th style="text-align:right">Valor Unit.</th><th style="text-align:right">Subtotal</th></tr></thead>
    <tbody>${itemRows}</tbody>
    <tfoot>
      <tr class="grand-total"><td colspan="4">VALOR TOTAL DO CONTRATO</td><td style="text-align:right">${fmt(c.totalLiquido)}</td></tr>
    </tfoot>
  </table>` : ''}

  <h2>Do Valor e Condições de Pagamento</h2>
  <div class="payment-grid">
    <div class="payment-item"><div class="label">Valor Total</div><div class="value">${fmt(c.totalLiquido)}</div></div>
    <div class="payment-item"><div class="label">Entrada${entradaValor > 0 ? ' (' + (c.entrada || 0) + '%)' : ''}</div><div class="value">${fmt(entradaValor)}</div></div>
    <div class="payment-item"><div class="label">Saldo${parcelas > 1 ? ' (' + parcelas + 'x)' : ''}</div><div class="value">${fmt(valorParcela)}</div></div>
  </div>
  <div class="clause">A entrada deverá ser paga na assinatura do contrato. ${parcelas > 1 ? `O saldo remanescente de ${fmt(saldo)} será dividido em ${parcelas} parcelas de ${fmt(valorParcela)}.` : `O saldo de ${fmt(saldo)} deverá ser pago na conclusão dos serviços.`}</div>

  ${c.dataInicio || c.dataTermino ? `
  <h2>Do Prazo</h2>
  <div class="clause">
    ${c.dataInicio ? `Início previsto: <strong>${new Date(c.dataInicio + 'T12:00:00').toLocaleDateString('pt-BR')}</strong>.` : ''}
    ${c.dataTermino ? ` Término previsto: <strong>${new Date(c.dataTermino + 'T12:00:00').toLocaleDateString('pt-BR')}</strong>.` : ''}
    O prazo poderá ser alterado em caso de condições climáticas adversas, força maior ou alteração do escopo contratado.
  </div>` : ''}

  <h2>Das Obrigações da Contratada</h2>
  <div class="clause">A VEDAFÁCIL compromete-se a: (a) executar os serviços com mão de obra qualificada e materiais de primeira linha; (b) zelar pela segurança dos profissionais e do local de trabalho; (c) fornecer ART de engenharia quando aplicável; (d) garantir os serviços executados pelo prazo estipulado na cláusula de garantia.</div>

  <h2>Das Obrigações do Contratante</h2>
  <div class="clause">O CONTRATANTE compromete-se a: (a) proporcionar acesso livre ao local de execução dos serviços; (b) efetuar os pagamentos nas datas acordadas; (c) informar previamente sobre eventuais restrições de horário ou acesso; (d) manter o local vistoriado devidamente desocupado durante a execução.</div>

  <h2>Da Garantia</h2>
  <div class="clause">Os serviços de impermeabilização por injeção executados pela VEDAFÁCIL têm <strong>garantia de 5 (cinco) anos</strong>, a contar da data de conclusão dos serviços, contra infiltrações nas regiões tratadas, desde que observadas as condições normais de uso e ausência de danos estruturais supervenientes não relacionados ao escopo contratado.</div>

  <h2>Do Foro</h2>
  <div class="clause">As partes elegem o Foro da Comarca de <strong>${c.foro || 'Barra Mansa'}/RJ</strong> para dirimir quaisquer dúvidas ou litígios decorrentes deste contrato, com expressa renúncia de qualquer outro, por mais privilegiado que seja.</div>

  <div class="clause" style="margin-top:14px;text-align:center">
    Por estarem assim justas e contratadas, as partes assinam o presente instrumento em 2 (duas) vias de igual teor e forma.<br>
    <strong>${c.cidade || 'Barra Mansa'}, ${dataAssinatura}.</strong>
  </div>

  <div class="signature-area">
    <div class="sig-line">
      Vedafácil — Thiago Ramos Ferraz<br>CPF: 104.589.167-30<br>CONTRATADA
    </div>
    <div class="sig-line">
      ${c.cliente || ''}<br>${c.ac ? 'A/C: ' + c.ac + (c.cpfResponsavel ? ' · CPF: ' + c.cpfResponsavel : '') : (c.cpfResponsavel ? 'CPF: ' + c.cpfResponsavel : '')}<br>CONTRATANTE
    </div>
  </div>

  <div class="footer">Vedafácil · T. R. FERRAZ TECNOLOGIA EM IMPERMEABILIZACAO EIRELI ME · CNPJ: 23.606.470/0001-07 · Barra Mansa/RJ</div>
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

    const novoContrato = {
      _id: uuidv4(),
      numero: (isConnected ? await Contrato.countDocuments() : memStore.contratos.length) + 1,
      orcamentoId,
      status: 'aguardando_assinatura',
      createdAt: Date.now(), updatedAt: Date.now(),
      cliente: o.cliente, endereco: o.endereco, cidade: o.cidade, cep: o.cep, ac: o.ac, celular: o.celular,
      cnpjCliente: '', cpfResponsavel: '', rgResponsavel: '',
      dataAssinatura: '', dataInicio: '', dataTermino: '',
      foro: 'Barra Mansa',
      zapsignDocId: null, zapsignSignUrl: null, assinadoEm: null,
      itens: o.itens, totalLiquido: o.totalLiquido,
      parcelas: o.parcelas, valorParcela: o.valorParcela,
      locais: o.locais,
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

    const token = process.env.ZAPSIGN_API_TOKEN;
    if (!token) return res.status(400).json({ error: 'ZAPSIGN_API_TOKEN not configured' });

    const pdfUrl = `${req.protocol}://${req.get('host')}/api/contratos/${req.params.id}/pdf`;
    const response = await axios.post('https://app.zapsign.com.br/api/v1/docs/', {
      name: `Contrato Vedafácil - ${c.cliente}`,
      url_pdf: pdfUrl,
      signers: [{ name: c.ac || c.cliente, email: req.body.email || '' }]
    }, { headers: { Authorization: `Bearer ${token}` } });

    const docToken = response.data.token;
    const signUrl = response.data.signers?.[0]?.sign_url;

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

// ── Start server (local dev) ──────────────────────────────────────────────────

const PORT = process.env.PORT || 3001;
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  app.listen(PORT, () => console.log(`Vedafácil API running on port ${PORT}`));
}

export default app;
