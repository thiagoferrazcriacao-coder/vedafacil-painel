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

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

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
  }
}, { _id: false });

const Medicao = mongoose.model('Medicao', medicaoSchema);
const Orcamento = mongoose.model('Orcamento', orcamentoSchema);
const Contrato = mongoose.model('Contrato', contratoSchema);
const Config = mongoose.model('Config', configSchema);

// In-memory fallback (when no MongoDB)
const memStore = { medicoes: [], orcamentos: [], contratos: [], config: null };

// ── Middleware ────────────────────────────────────────────────────────────────

app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Serve Vite build in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, 'dist')));
}

// JWT auth middleware
function auth(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
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
    const token = jwt.sign({ username }, process.env.JWT_SECRET || 'dev-secret', { expiresIn: '24h' });
    return res.json({ token, user: { username } });
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

    const novoOrcamento = {
      _id: uuidv4(),
      numero: (isConnected ? await Orcamento.countDocuments() : memStore.orcamentos.length) + 1,
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
      avaliadoPor: '', acompanhadoPor: '', tecnicoResponsavel: 'Thiago Ramos Ferraz', elaboradoPor: '',
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
      return res.json(saved);
    }
    memStore.orcamentos.push(novoOrcamento);
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

function buildOrcamentoPdfHtml(o) {
  const fmt = (n) => 'R$ ' + (n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
  const rows = (o.itens || []).map((item, i) => `
    <tr>
      <td>${i + 1}</td>
      <td>${item.descricao}</td>
      <td>${item.quantidade} ${item.unidade}</td>
      <td>${fmt(item.valorUnit)}</td>
      <td>${fmt(item.subtotal)}</td>
    </tr>`).join('');

  const locaisRows = (o.locais || []).map(l => `
    <tr>
      <td>${l.nome || ''}</td>
      <td>${l.trinca || 0}m</td>
      <td>${l.juntaFria || 0}m</td>
      <td>${l.ralo || 0}</td>
      <td>${l.juntaDilat || 0}m</td>
      <td>${l.ferragem || 0}m</td>
      <td>${l.cortina || 0}m²</td>
    </tr>`).join('');

  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
  <style>
    body { font-family: Arial, sans-serif; font-size: 11px; color: #222; margin: 20px; }
    h1 { color: #1a5c9a; font-size: 18px; margin: 0; }
    h2 { color: #1a5c9a; font-size: 13px; border-bottom: 2px solid #1a5c9a; padding-bottom: 4px; }
    .header { display: flex; justify-content: space-between; margin-bottom: 20px; }
    .company { font-size: 10px; color: #666; }
    table { width: 100%; border-collapse: collapse; margin: 10px 0; }
    th { background: #1a5c9a; color: white; padding: 6px 8px; text-align: left; font-size: 10px; }
    td { padding: 5px 8px; border-bottom: 1px solid #eee; }
    tr:nth-child(even) td { background: #f9f9f9; }
    .total-row td { font-weight: bold; background: #e8f0fb; }
    .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin: 10px 0; }
    .info-item { background: #f5f5f5; padding: 6px 10px; border-radius: 4px; }
    .info-label { font-size: 9px; color: #888; }
    .info-value { font-weight: bold; }
    .technical { background: #f0f6ff; border-left: 3px solid #1a5c9a; padding: 10px; margin: 10px 0; font-size: 10px; }
    .footer { margin-top: 30px; border-top: 1px solid #ccc; padding-top: 10px; font-size: 9px; color: #888; text-align: center; }
  </style></head><body>
  <div class="header">
    <div>
      <h1>Vedafácil</h1>
      <div class="company">T. R. FERRAZ TECNOLOGIA EM IMPERMEABILIZACAO EIRELI ME<br>
      CNPJ: 23.606.470/0001-07<br>
      Rua Professora Margarida Fialho Thompson Leite, 670 — Barra Mansa/RJ</div>
    </div>
    <div style="text-align:right">
      <div style="font-size:16px;font-weight:bold;color:#1a5c9a">ORÇAMENTO Nº ${o.numero || 1}</div>
      <div>Data: ${o.dataOrcamento || new Date().toLocaleDateString('pt-BR')}</div>
      <div>Validade: ${o.validade || '30 dias'}</div>
    </div>
  </div>

  <h2>Dados do Cliente</h2>
  <div class="info-grid">
    <div class="info-item"><div class="info-label">CLIENTE / CONDOMÍNIO</div><div class="info-value">${o.cliente || ''}</div></div>
    <div class="info-item"><div class="info-label">A/C</div><div class="info-value">${o.ac || ''}</div></div>
    <div class="info-item"><div class="info-label">ENDEREÇO</div><div class="info-value">${o.endereco || ''}</div></div>
    <div class="info-item"><div class="info-label">CIDADE</div><div class="info-value">${o.cidade || ''}</div></div>
    <div class="info-item"><div class="info-label">CELULAR</div><div class="info-value">${o.celular || ''}</div></div>
    <div class="info-item"><div class="info-label">TÉCNICO RESPONSÁVEL</div><div class="info-value">${o.tecnicoResponsavel || ''}</div></div>
  </div>

  <h2>Método de Impermeabilização</h2>
  <div class="technical">
    <p>O método de injeção é a tecnologia mais moderna e avançada para eliminar qualquer tipo de infiltração em trincas e rachaduras em qualquer superfície de concreto maciço. O produto é injetado no concreto, nos pontos de infiltração, com equipamentos exclusivos, que o forçam a penetrar na estrutura vedando trincas e microfissuras até atingir a origem do vazamento. O gel hidroabsorvente GVF SEAL possui a consistência da água quando injetado, por isso percola exatamente o mesmo caminho da infiltração, mas em sentido contrário.</p>
    <p>O GVF Seal possui viscosidade ultra baixa que possui altíssima penetração em trincas capilares. Após a cura, o gel forma uma barreira flexível e impermeável que preenche trincas, rachaduras, buracos, nichos de concretagem, fissuras, etc.</p>
  </div>

  <h2>Itens e Valores</h2>
  <table>
    <thead><tr><th>#</th><th>Descrição</th><th>Quantidade</th><th>Valor Unit.</th><th>Subtotal</th></tr></thead>
    <tbody>${rows}</tbody>
    <tfoot>
      <tr class="total-row"><td colspan="4">TOTAL BRUTO</td><td>${fmt(o.totalBruto)}</td></tr>
      ${o.desconto ? `<tr><td colspan="4">Desconto (${o.descontoTipo === 'percent' ? o.desconto + '%' : fmt(o.desconto)})</td><td>- ${fmt(o.descontoTipo === 'percent' ? (o.totalBruto * o.desconto / 100) : o.desconto)}</td></tr>` : ''}
      <tr class="total-row"><td colspan="4">TOTAL LÍQUIDO</td><td>${fmt(o.totalLiquido)}</td></tr>
    </tfoot>
  </table>

  ${o.parcelas > 1 ? `
  <h2>Condições de Pagamento</h2>
  <table>
    <tr><td>Entrada (${o.entrada}%)</td><td>${fmt(o.totalLiquido * o.entrada / 100)}</td></tr>
    <tr><td>Saldo em ${o.parcelas}x</td><td>${fmt(o.valorParcela)} / parcela</td></tr>
  </table>` : ''}

  ${locaisRows ? `
  <h2>Levantamento por Local</h2>
  <table>
    <thead><tr><th>Local</th><th>Trincas</th><th>Juntas Frias</th><th>Ralos</th><th>Jta. Dilat.</th><th>Ferragens</th><th>Cortinas</th></tr></thead>
    <tbody>${locaisRows}</tbody>
  </table>` : ''}

  ${o.obsAdicionais ? `<h2>Observações</h2><p>${o.obsAdicionais}</p>` : ''}

  <div class="footer">
    Vedafácil — T. R. FERRAZ TECNOLOGIA EM IMPERMEABILIZACAO EIRELI ME — CNPJ: 23.606.470/0001-07<br>
    Thiago Ramos Ferraz — CPF: 104.589.167-30
  </div>
  </body></html>`;
}

app.post('/api/orcamentos/:id/pdf', auth, async (req, res) => {
  try {
    await connectDB();
    let o;
    if (isConnected) o = await Orcamento.findById(req.params.id);
    else o = memStore.orcamentos.find(x => x._id === req.params.id);
    if (!o) return res.status(404).json({ error: 'Not found' });

    // Return printable HTML — browser's Ctrl+P saves as PDF
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(buildOrcamentoPdfHtml(o));
  } catch (err) { res.status(500).json({ error: err.message }); }
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
