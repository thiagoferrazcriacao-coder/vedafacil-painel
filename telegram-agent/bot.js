const { Telegraf } = require('telegraf');
const fs = require('fs');
const path = require('path');
const https = require('https');
const { executarAgente } = require('./agent');

const bot = new Telegraf(process.env.TELEGRAM_TOKEN, {
  handlerTimeout: Infinity,
});
const WHITELIST_PATH = path.join(__dirname, 'whitelist.json');

// Impede que erros em handlers derrubem o processo
bot.catch((err, ctx) => {
  console.error('[bot.catch] Erro ao processar update:', err.message);
  try { ctx.reply('❌ Erro interno. Tente novamente.'); } catch {}
});

function carregarWhitelist() {
  try {
    return JSON.parse(fs.readFileSync(WHITELIST_PATH, 'utf8'));
  } catch {
    return { autorizados: [] };
  }
}

function salvarWhitelist(data) {
  fs.writeFileSync(WHITELIST_PATH, JSON.stringify(data, null, 2), 'utf8');
}

function verificarAcesso(userId) {
  const wl = carregarWhitelist();
  return wl.autorizados.find(u => u.id === userId) || null;
}

function ehAdmin(userId) {
  const user = verificarAcesso(userId);
  return user && user.nivel === 'admin';
}

// /start — apresentação + ID do usuário
bot.command('start', ctx => {
  const userId = ctx.from.id;
  const user = verificarAcesso(userId);

  if (!user) {
    ctx.reply(
      `Olá! Seu ID do Telegram é: \`${userId}\`\n\n` +
      `Você não está autorizado a usar este bot.\n` +
      `Passe seu ID para o administrador pra ser adicionado.`,
      { parse_mode: 'Markdown' }
    );
    return;
  }

  ctx.reply(
    `Olá, ${user.nome}! 👋\n\n` +
    `Sou o agente de manutenção do sistema Vedafacil.\n\n` +
    `Descreva o problema ou a mudança que você precisa e eu cuido de tudo.\n\n` +
    `Exemplos:\n` +
    `• "O botão de fechar dia não está funcionando"\n` +
    `• "Adicionar o campo X no formulário Y"\n` +
    `• "A data está mostrando no formato errado"\n\n` +
    `Comandos:\n` +
    `/status — verificar status do sistema\n` +
    (ehAdmin(userId) ? `/adduser ID NOME — adicionar usuário\n/removeuser ID — remover usuário\n` : '')
  );
});

// /status — verifica git sync
bot.command('status', async ctx => {
  const userId = ctx.from.id;
  if (!verificarAcesso(userId)) {
    ctx.reply('Acesso negado.');
    return;
  }

  ctx.reply('🔍 Verificando status...');

  const { exec } = require('child_process');
  const { promisify } = require('util');
  const execAsync = promisify(exec);
  const REPO_PATH = process.env.REPO_PATH || path.join(__dirname, '..');

  try {
    const [statusOut, logOut] = await Promise.all([
      execAsync('git status --short', { cwd: REPO_PATH }),
      execAsync('git log -3 --oneline', { cwd: REPO_PATH }),
    ]);

    const status = statusOut.stdout.trim() || '(sem alterações locais)';
    const log = logOut.stdout.trim();

    ctx.reply(
      `📊 *Status do repositório*\n\n` +
      `*Alterações locais:*\n\`\`\`\n${status}\n\`\`\`\n\n` +
      `*Últimos commits:*\n\`\`\`\n${log}\n\`\`\``,
      { parse_mode: 'Markdown' }
    );
  } catch (err) {
    ctx.reply(`❌ Erro ao verificar status: ${err.message}`);
  }
});

// /adduser — admin apenas
bot.command('adduser', ctx => {
  const userId = ctx.from.id;
  if (!ehAdmin(userId)) {
    ctx.reply('Apenas admins podem adicionar usuários.');
    return;
  }

  const args = ctx.message.text.split(' ').slice(1);
  if (args.length < 2) {
    ctx.reply('Uso: /adduser <ID_TELEGRAM> <NOME>');
    return;
  }

  const novoId = parseInt(args[0]);
  const nome = args.slice(1).join(' ');

  if (isNaN(novoId)) {
    ctx.reply('ID inválido. Use apenas números.');
    return;
  }

  const wl = carregarWhitelist();
  if (wl.autorizados.find(u => u.id === novoId)) {
    ctx.reply(`Usuário ${novoId} já está na lista.`);
    return;
  }

  wl.autorizados.push({ id: novoId, nome, nivel: 'operador' });
  salvarWhitelist(wl);
  ctx.reply(`✅ ${nome} (${novoId}) adicionado como operador.`);
});

// /removeuser — admin apenas
bot.command('removeuser', ctx => {
  const userId = ctx.from.id;
  if (!ehAdmin(userId)) {
    ctx.reply('Apenas admins podem remover usuários.');
    return;
  }

  const args = ctx.message.text.split(' ').slice(1);
  if (args.length < 1) {
    ctx.reply('Uso: /removeuser <ID_TELEGRAM>');
    return;
  }

  const remId = parseInt(args[0]);
  const wl = carregarWhitelist();
  const antes = wl.autorizados.length;
  wl.autorizados = wl.autorizados.filter(u => u.id !== remId);

  if (wl.autorizados.length === antes) {
    ctx.reply(`Usuário ${remId} não encontrado.`);
    return;
  }

  salvarWhitelist(wl);
  ctx.reply(`✅ Usuário ${remId} removido.`);
});

// Baixa foto do Telegram como base64
async function baixarFotoBase64(ctx, fileId) {
  const fileInfo = await ctx.telegram.getFile(fileId);
  const url = `https://api.telegram.org/file/bot${process.env.TELEGRAM_TOKEN}/${fileInfo.file_path}`;
  return new Promise((resolve, reject) => {
    https.get(url, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks).toString('base64')));
      res.on('error', reject);
    }).on('error', reject);
  });
}

// Lógica comum: recebe solicitação (texto + foto opcional) e aciona o agente
async function enviarTexto(ctx, texto) {
  const MAX = 4000;
  const pedacos = [];
  for (let i = 0; i < texto.length; i += MAX) pedacos.push(texto.slice(i, i + MAX));
  for (const pedaco of pedacos) {
    try {
      await ctx.reply(pedaco, { parse_mode: 'Markdown' });
    } catch {
      // Markdown inválido (backtick/underscore sem fechar) — tenta texto puro
      try { await ctx.reply(pedaco); } catch (e2) {
        console.error('[bot] Falha ao enviar mensagem:', e2.message);
      }
    }
  }
}

// Envia mensagem para todos os admins (exceto o próprio remetente)
async function notificarAdmins(telegram, texto, excluirUserId) {
  const wl = carregarWhitelist();
  const admins = wl.autorizados.filter(u => u.nivel === 'admin' && u.id !== excluirUserId);
  for (const admin of admins) {
    try {
      await telegram.sendMessage(admin.id, texto, { parse_mode: 'Markdown' });
    } catch (e) {
      console.error(`[bot] Falha ao notificar admin ${admin.id}:`, e.message);
    }
  }
}

async function acionarAgente(ctx, user, solicitacao, imageBase64) {
  const ehOperador = user.nivel !== 'admin';

  // Notifica admins quando um operador faz um pedido
  if (ehOperador) {
    const temFoto = imageBase64 ? ' 📷 _(com imagem)_' : '';
    await notificarAdmins(
      ctx.telegram,
      `📩 *Pedido de ${user.nome}:*${temFoto}\n\n${solicitacao}`,
      ctx.from.id
    );
  }

  const msgEspera = await ctx.reply(
    `⏳ Entendi, ${user.nome}! Analisando o problema...\n\n` +
    `Isso pode levar alguns minutos. Avisarei assim que pronto.`
  );

  let progressoAtual = '';
  let msgJaApagada = false;

  const onProgresso = async (passo) => {
    progressoAtual += `\n${passo}`;
    if (msgJaApagada) return;
    try {
      await ctx.telegram.editMessageText(
        ctx.chat.id, msgEspera.message_id, undefined,
        `⏳ Trabalhando...\n${progressoAtual.slice(-500)}`
      );
    } catch { }
  };

  // Heartbeat a cada 60s para o usuário saber que ainda está rodando
  const heartbeat = setInterval(async () => {
    if (msgJaApagada) { clearInterval(heartbeat); return; }
    try {
      await ctx.telegram.editMessageText(
        ctx.chat.id, msgEspera.message_id, undefined,
        `⏳ Ainda trabalhando... (pode demorar mais um pouco)\n${progressoAtual.slice(-400)}`
      );
    } catch { }
  }, 60000);

  try {
    const resultado = await executarAgente(
      `Solicitação do operador ${user.nome}:\n\n${solicitacao}`,
      onProgresso,
      imageBase64
    );

    clearInterval(heartbeat);
    msgJaApagada = true;
    await ctx.telegram.deleteMessage(ctx.chat.id, msgEspera.message_id).catch(() => {});

    await enviarTexto(ctx, resultado);

    // Notifica admins com o resultado
    if (ehOperador) {
      const resumo = resultado.slice(0, 1500);
      await notificarAdmins(
        ctx.telegram,
        `✅ *Concluído para ${user.nome}:*\n\n${resumo}${resultado.length > 1500 ? '\n\n_(resposta truncada)_' : ''}`,
        ctx.from.id
      );
    }
  } catch (err) {
    clearInterval(heartbeat);
    msgJaApagada = true;
    await ctx.telegram.deleteMessage(ctx.chat.id, msgEspera.message_id).catch(() => {});
    await enviarTexto(ctx, `❌ Erro ao processar: ${err.message}\n\nTente novamente ou contate o admin.`);
    console.error('[bot] Erro no agente:', err);

    // Notifica admins do erro
    if (ehOperador) {
      await notificarAdmins(
        ctx.telegram,
        `❌ *Erro no pedido de ${user.nome}:*\n\`${err.message}\``,
        ctx.from.id
      );
    }
  }
}

// Mensagens de texto — aciona o agente
bot.on('text', async ctx => {
  const userId = ctx.from.id;
  const user = verificarAcesso(userId);

  if (!user) {
    ctx.reply(`Acesso negado. Seu ID é: ${userId}\nPeça ao administrador para te adicionar.`);
    return;
  }

  const solicitacao = ctx.message.text;
  if (solicitacao.startsWith('/')) {
    ctx.reply('Comando desconhecido. Use /start para ver os comandos disponíveis.');
    return;
  }

  await acionarAgente(ctx, user, solicitacao, null);
});

// Fotos — baixa e passa pro agente junto com a legenda
bot.on('photo', async ctx => {
  const userId = ctx.from.id;
  const user = verificarAcesso(userId);

  if (!user) {
    ctx.reply(`Acesso negado. Seu ID é: ${userId}\nPeça ao administrador para te adicionar.`);
    return;
  }

  const caption = ctx.message.caption || '(sem descrição — analise a imagem e identifique o problema)';
  const foto = ctx.message.photo[ctx.message.photo.length - 1]; // maior resolução

  let imageBase64 = null;
  try {
    imageBase64 = await baixarFotoBase64(ctx, foto.file_id);
  } catch (e) {
    console.error('[bot] Erro ao baixar foto:', e.message);
  }

  await acionarAgente(ctx, user, caption, imageBase64);
});

module.exports = { bot };
