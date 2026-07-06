const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const REPO_PATH = process.env.REPO_PATH || path.join(__dirname, '..');
const CLAUDE_BIN = process.env.CLAUDE_PATH || 'claude';

async function executarAgente(mensagem, onProgresso, imageBase64) {
  let tempImagePath = null;
  let promptFinal = mensagem;

  // Se veio imagem, salva em temp e avisa o Claude onde está
  if (imageBase64) {
    tempImagePath = path.join(os.tmpdir(), `vf-img-${Date.now()}.jpg`);
    fs.writeFileSync(tempImagePath, Buffer.from(imageBase64, 'base64'));
    promptFinal += `\n\nO operador enviou uma imagem de referência. Use a ferramenta Read para visualizá-la: ${tempImagePath}`;
  }

  return new Promise((resolve, reject) => {
    const args = [
      '-p',
      '--permission-mode', 'bypassPermissions',
      '--add-dir', REPO_PATH,
      '--output-format', 'stream-json',
      '--no-session-persistence',
    ];

    const child = spawn(CLAUDE_BIN, args, {
      cwd: REPO_PATH,
      shell: true,
      env: { ...process.env },
    });

    let outputFinal = '';
    let buffer = '';
    let ultimoProgresso = Date.now();

    // Envia o prompt via stdin
    child.stdin.write(promptFinal, 'utf8');
    child.stdin.end();

    // Parseia stream-json para extrair texto e atualizar Telegram
    child.stdout.on('data', chunk => {
      buffer += chunk.toString();
      const linhas = buffer.split('\n');
      buffer = linhas.pop(); // última linha pode estar incompleta

      for (const linha of linhas) {
        if (!linha.trim()) continue;
        try {
          const evento = JSON.parse(linha);

          // Texto parcial do assistente
          if (evento.type === 'assistant' && Array.isArray(evento.message?.content)) {
            for (const bloco of evento.message.content) {
              if (bloco.type === 'text' && bloco.text) {
                outputFinal = bloco.text;
              }
              // Mostra qual ferramenta está usando
              if (bloco.type === 'tool_use' && Date.now() - ultimoProgresso > 5000) {
                ultimoProgresso = Date.now();
                const label = bloco.input?.command || bloco.input?.path || bloco.input?.pattern || '';
                onProgresso(`🔧 \`${bloco.name}\` ${String(label).slice(0, 60)}`);
              }
            }
          }

          // Resultado final
          if (evento.type === 'result' && evento.result) {
            outputFinal = evento.result;
          }
        } catch {
          // linha não é JSON válido, ignora
        }
      }
    });

    child.stderr.on('data', data => {
      console.error('[claude stderr]', data.toString().slice(0, 200));
    });

    child.on('close', code => {
      if (tempImagePath) { try { fs.unlinkSync(tempImagePath); } catch {} }

      if (outputFinal) {
        resolve(outputFinal);
      } else if (code === 0) {
        resolve('✅ Concluído (sem texto de saída).');
      } else {
        reject(new Error(`claude saiu com código ${code}`));
      }
    });

    child.on('error', err => {
      if (tempImagePath) { try { fs.unlinkSync(tempImagePath); } catch {} }
      reject(err);
    });

    // Timeout de 10 minutos
    setTimeout(() => {
      child.kill();
      reject(new Error('Timeout: o agente demorou mais de 10 minutos.'));
    }, 600000);
  });
}

module.exports = { executarAgente };
