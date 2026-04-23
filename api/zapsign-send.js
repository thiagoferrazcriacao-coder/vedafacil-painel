// ZapSign Sandbox - Funcao dedicada e isolada
// Criada para contornar cache de funcao serverless antiga

import mongoose from 'mongoose';

const ZAPSIGN_TOKEN = '2822110f-b238-480f-b8b6-f11c8697a2c64bb7c8fd-5888-479d-9d98-a6c3b0034950';
const ZAPSIGN_URL = 'https://sandbox.api.zapsign.com.br/api/v1/docs/';

// Schema minimo do Contrato (somente o que precisamos ler)
const contratoSchema = new mongoose.Schema({}, { strict: false, collection: 'contratos' });
let ContratoModel;

async function getContrato(id) {
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(process.env.MONGODB_URI);
  }
  if (!ContratoModel) {
    ContratoModel = mongoose.models.Contrato || mongoose.model('Contrato', contratoSchema);
  }
  return ContratoModel.findById(id).lean();
}

// PDF simples em base64 (1 pagina em branco com texto) - placeholder ate Puppeteer funcionar
function buildMinimalPdfBase64(title, cliente) {
  const content = `Contrato Vedafacil - ${cliente}\n\n${title}\n\nEste documento sera assinado digitalmente via ZapSign.`;
  const pdfHeader = '%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n4 0 obj\n<< /Length ' + (content.length + 50) + ' >>\nstream\nBT /F1 12 Tf 50 750 Td (' + content.replace(/\n/g, ') Tj 0 -20 Td (') + ') Tj ET\nendstream\nendobj\n5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\nxref\n0 6\n0000000000 65535 f\n0000000009 00000 n\n0000000058 00000 n\n0000000115 00000 n\n0000000229 00000 n\n0000000328 00000 n\ntrailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n400\n%%EOF';
  return Buffer.from(pdfHeader).toString('base64');
}

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'GET') {
    return res.json({
      ok: true,
      version: 'zapsign-send-v1',
      token_prefix: ZAPSIGN_TOKEN.substring(0, 12),
      url: ZAPSIGN_URL,
      message: 'Funcao ZapSign dedicada ativa. Faca POST com { contratoId, email, nomeSigner } para enviar.'
    });
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { contratoId, email, nomeSigner } = req.body || {};
    if (!contratoId) return res.status(400).json({ error: 'contratoId obrigatorio' });
    if (!email) return res.status(400).json({ error: 'email obrigatorio' });

    const c = await getContrato(contratoId);
    if (!c) return res.status(404).json({ error: 'Contrato nao encontrado' });

    const base64Pdf = buildMinimalPdfBase64('Contrato de Prestacao de Servicos', c.cliente || 'Cliente');

    const payload = {
      name: `Contrato Vedafacil - ${c.cliente || 'Cliente'}`,
      base64_pdf: base64Pdf,
      signers: [{ name: nomeSigner || c.sindico || c.ac || c.cliente || 'Signatario', email }]
    };

    const response = await fetch(ZAPSIGN_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ZAPSIGN_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        error: `ZapSign ${response.status}`,
        detail: data
      });
    }

    // Atualiza o contrato com o token e URL de assinatura
    const docToken = data.token;
    const signUrl = data.signers?.[0]?.sign_url;
    try {
      await ContratoModel.findByIdAndUpdate(contratoId, {
        zapsignDocId: docToken,
        zapsignSignUrl: signUrl
      });
    } catch (updErr) {
      console.warn('Falha ao atualizar contrato:', updErr.message);
    }

    return res.json({
      success: true,
      docToken,
      signUrl,
      data
    });

  } catch (err) {
    console.error('[zapsign-send] erro:', err);
    return res.status(500).json({ error: err.message, stack: err.stack });
  }
}
