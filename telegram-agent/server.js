require('dotenv').config();
const { bot } = require('./bot');

const required = ['TELEGRAM_TOKEN', 'ANTHROPIC_API_KEY'];
const missing = required.filter(k => !process.env[k]);

if (missing.length > 0) {
  console.error(`❌ Variáveis de ambiente faltando: ${missing.join(', ')}`);
  console.error('Crie um arquivo .env baseado no .env.example');
  process.exit(1);
}

console.log('🤖 Vedafacil Telegram Agent iniciando...');

bot.launch()
  .then(() => {
    console.log('✅ Bot online e aguardando mensagens');
    console.log(`📁 Repo: ${process.env.REPO_PATH || 'pasta pai (padrão)'}`);
  })
  .catch(err => {
    console.error('❌ Erro ao iniciar bot:', err.message);
    process.exit(1);
  });

// Graceful shutdown
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
