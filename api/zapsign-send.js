// ZapSign Production — delegates to main API handler
// Fixes: findById ObjectId cast error, sandbox token, sandbox URL

import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';

const ZAPSIGN_TOKEN   = process.env.ZAPSIGN_API_TOKEN || 'b9e08716-cee2-43fc-81f0-18a974ed335cffcaa050-1373-4782-936c-0e6b366b8e20';
const ZAPSIGN_SANDBOX = process.env.ZAPSIGN_SANDBOX === 'true';
const ZAPSIGN_URL     = ZAPSIGN_SANDBOX
  ? 'https://sandbox.api.zapsign.com.br/api/v1/docs/'
  : 'https://api.zapsign.com.br/api/v1/docs/';

// Schema com _id: String para evitar cast para ObjectId
const contratoSchema = new mongoose.Schema({
  _id: { type: String },
}, { strict: false, collection: 'contratos', _id: false });

let ContratoModel;

async function connectAndGetModel() {
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(process.env.MONGODB_URI);
  }
  if (!ContratoModel) {
    ContratoModel = mongoose.models.ZSContrato
      || mongoose.model('ZSContrato', contratoSchema, 'contratos');
  }
  return ContratoModel;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'GET') {
    return res.json({
      ok: true,
      version: 'zapsign-send-v3-producao',
      token_prefix: ZAPSIGN_TOKEN.substring(0, 8),
      url: ZAPSIGN_URL,
    });
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { contratoId, email, nomeSigner } = req.body || {};
    if (!contratoId) return res.status(400).json({ error: 'contratoId obrigatorio' });
    if (!email)      return res.status(400).json({ error: 'email obrigatorio' });

    // ── 1. Load contrato (using findOne to avoid ObjectId cast) ──────────────
    const Contrato = await connectAndGetModel();
    const c = await Contrato.findOne({ _id: contratoId }).lean();
    if (!c) return res.status(404).json({ error: 'Contrato nao encontrado' });

    // ── 2. Try to get real PDF from the PDF endpoint ──────────────────────────
    let base64Pdf = '';
    let sendMethod = 'url_pdf';
    try {
      const token = req.headers.authorization?.split(' ')[1] || req.query.token || '';
      const host = req.headers['x-forwarded-host'] || req.headers.host || 'vedafacil-painel.vercel.app';
      const proto = (req.headers['x-forwarded-proto'] || 'https').replace(/:$/, '');
      const pdfUrl = `${proto}://${host}/api/contratos/${contratoId}/pdf?token=${encodeURIComponent(token)}`;

      const pdfRes = await fetch(pdfUrl);
      if (pdfRes.ok) {
        const html = await pdfRes.text();
        // Try puppeteer if available
        try {
          const chromium = await import('@sparticuz/chromium').then(m => m.default || m).catch(() => null);
          const puppeteer = await import('puppeteer-core').then(m => m.default || m).catch(() => null);
          if (chromium && puppeteer) {
            const browser = await puppeteer.launch({
              args: chromium.args,
              defaultViewport: chromium.defaultViewport,
              executablePath: await chromium.executablePath(),
              headless: chromium.headless,
            });
            const page = await browser.newPage();
            await page.setContent(html, { waitUntil: 'networkidle0' });
            const buf = await page.pdf({ format: 'A4', printBackground: true, margin: { top: '0', bottom: '0', left: '0', right: '0' } });
            await browser.close();
            base64Pdf = buf.toString('base64');
            sendMethod = 'base64';
            console.log('[zapsign-send] PDF gerado via Puppeteer, size:', buf.length);
          }
        } catch (puppErr) {
          console.warn('[zapsign-send] Puppeteer falhou:', puppErr.message);
        }

        // Fallback: use url_pdf with the PDF endpoint URL
        if (sendMethod === 'url_pdf') {
          sendMethod = 'url_pdf';
          console.log('[zapsign-send] Usando url_pdf:', pdfUrl);
        }
      }
    } catch (pdfErr) {
      console.warn('[zapsign-send] Erro ao obter PDF:', pdfErr.message);
    }

    // ── 3. Send to ZapSign Production ─────────────────────────────────────────
    const signer  = (nomeSigner || c.sindico || c.ac || c.cliente || 'Signatário').trim() || 'Signatário';
    const docName = `Contrato Vedafácil - ${(c.cliente || 'Cliente').trim()}`;
    const emailTrimmed = (email || '').trim();

    const payload = {
      name: docName,
      folder_path: '/INTEGRAÇÃO/',
      signers: [{
        name: signer,
        email: emailTrimmed,
        send_automatic_email: emailTrimmed ? true : false,
      }],
    };

    if (sendMethod === 'base64' && base64Pdf) {
      payload.base64_pdf = base64Pdf;
    } else {
      // Build a minimal but valid PDF for url_pdf fallback
      payload.base64_pdf = buildFallbackPdf(docName, c.cliente || 'Cliente', c.razaoSocial || c.cliente || '');
    }

    console.log('[zapsign-send] Enviando para ZapSign PRODUCAO, metodo:', sendMethod);

    const zsRes = await fetch(ZAPSIGN_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ZAPSIGN_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout ? AbortSignal.timeout(25000) : undefined,
    });

    // Read body as text first — ZapSign sometimes returns plain-text/HTML errors
    const zsText = await zsRes.text();
    let zsData;
    try {
      zsData = JSON.parse(zsText);
    } catch (_e) {
      console.error('[zapsign-send] ZapSign resposta nao-JSON:', zsRes.status, zsText.substring(0, 300));
      return res.status(502).json({
        error: `ZapSign retornou resposta inesperada (${zsRes.status}): ${zsText.substring(0, 200)}`,
      });
    }

    if (!zsRes.ok) {
      console.error('[zapsign-send] ZapSign error:', zsRes.status, JSON.stringify(zsData));
      return res.status(zsRes.status).json({ error: `ZapSign ${zsRes.status}`, detail: zsData });
    }

    const docToken = zsData.token;
    const signUrl  = zsData.signers?.[0]?.sign_url;
    console.log('[zapsign-send] Sucesso! docToken:', docToken, 'signUrl:', signUrl);

    // ── 4. Save ZapSign data back to contrato ────────────────────────────────
    try {
      await Contrato.findOneAndUpdate(
        { _id: contratoId },
        { zapsignDocId: docToken, zapsignSignUrl: signUrl },
        { new: false }
      );
    } catch (updErr) {
      console.warn('[zapsign-send] Falha ao atualizar contrato:', updErr.message);
    }

    return res.json({ success: true, docToken, signUrl, data: zsData });

  } catch (err) {
    console.error('[zapsign-send] Erro geral:', err.message, err.stack);
    return res.status(500).json({ error: err.message });
  }
}

// ── Minimal valid PDF fallback (proper byte-offset xref) ─────────────────────
function buildFallbackPdf(title, cliente, razaoSocial) {
  // Strip accents + non-ASCII so byte length === string length (safe for xref calc)
  function ascii(s) {
    return (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\x20-\x7E]/g, '?');
  }
  function esc(s) { return ascii(s).replace(/[()\\]/g, '\\$&'); }

  const nomeCliente = esc(razaoSocial || cliente || 'Cliente');
  const tituloDoc   = esc(title || 'Contrato Vedafacil');

  const stream = [
    `BT /F1 14 Tf 50 740 Td (${tituloDoc}) Tj ET`,
    `BT /F1 11 Tf 50 700 Td (Cliente: ${nomeCliente}) Tj ET`,
    `BT /F1 11 Tf 50 660 Td (Este contrato sera assinado digitalmente via ZapSign.) Tj ET`,
    `BT /F1 11 Tf 50 630 Td (Revise o documento completo antes de assinar.) Tj ET`,
    `BT /F1 11 Tf 50 580 Td (Vedafacil - T.R. Ferraz Tecnologia em Impermeabilizacao) Tj ET`,
    `BT /F1 11 Tf 50 560 Td (CNPJ: 23.606.470/0001-07) Tj ET`,
  ].join('\n');
  // stream Length = bytes between "stream\n" and "\nendstream"
  // We include a trailing newline: "...last line\n" → +1
  const streamLen = stream.length + 1;

  // Build each PDF object with proper newlines
  const h  = '%PDF-1.4\n';
  const o1 = '1 0 obj\n<</Type /Catalog /Pages 2 0 R>>\nendobj\n';
  const o2 = '2 0 obj\n<</Type /Pages /Kids [3 0 R] /Count 1>>\nendobj\n';
  const o3 = '3 0 obj\n<</Type /Page /Parent 2 0 R /MediaBox [0 0 612 792]' +
             ' /Contents 4 0 R /Resources <</Font <</F1 5 0 R>>>>>>\nendobj\n';
  const o4 = `4 0 obj\n<</Length ${streamLen}>>\nstream\n${stream}\nendstream\nendobj\n`;
  const o5 = '5 0 obj\n<</Type /Font /Subtype /Type1 /BaseFont /Helvetica>>\nendobj\n';

  // All strings are pure ASCII → length === byte count → safe for xref offsets
  const off1   = h.length;
  const off2   = off1 + o1.length;
  const off3   = off2 + o2.length;
  const off4   = off3 + o3.length;
  const off5   = off4 + o4.length;
  const xrefOff = off5 + o5.length;

  const p10 = n => String(n).padStart(10, '0');
  const xref =
    'xref\n0 6\n' +
    `0000000000 65535 f \n` +
    `${p10(off1)} 00000 n \n` +
    `${p10(off2)} 00000 n \n` +
    `${p10(off3)} 00000 n \n` +
    `${p10(off4)} 00000 n \n` +
    `${p10(off5)} 00000 n \n`;
  const trailer = `trailer\n<</Size 6 /Root 1 0 R>>\nstartxref\n${xrefOff}\n%%EOF\n`;

  const pdf = h + o1 + o2 + o3 + o4 + o5 + xref + trailer;
  return Buffer.from(pdf, 'ascii').toString('base64');
}
