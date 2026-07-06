const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);
const REPO_PATH = process.env.REPO_PATH || path.join(__dirname, '..');

// Comandos proibidos (espelha as regras do CLAUDE.md)
const COMANDOS_PROIBIDOS = [
  'git push --force', 'git push -f', 'force-with-lease',
  'git reset --hard', 'git clean -f', 'git rebase -i',
  'git branch -D main', 'git checkout -- .',
  'db.dropDatabase', 'dropCollection', 'deleteMany({})',
  'rm -rf', 'rd /s /q',
  'vercel project rm', 'vercel remove', 'vercel env rm',
];

function validarComando(cmd) {
  const cmdLower = cmd.toLowerCase();
  for (const proibido of COMANDOS_PROIBIDOS) {
    if (cmdLower.includes(proibido.toLowerCase())) {
      throw new Error(`Comando proibido detectado: "${proibido}". Abortado por segurança.`);
    }
  }
}

function resolverCaminho(caminho) {
  const full = path.resolve(REPO_PATH, caminho);
  if (!full.startsWith(path.resolve(REPO_PATH))) {
    throw new Error(`Caminho fora do repositório: ${caminho}`);
  }
  return full;
}

const DEFINICAO_FERRAMENTAS = [
  {
    name: 'read_file',
    description: 'Lê o conteúdo de um arquivo do repositório Vedafacil',
    input_schema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Caminho relativo ao repo (ex: painel/server.js, medidor-app/index.html)'
        }
      },
      required: ['path']
    }
  },
  {
    name: 'write_file',
    description: 'Escreve ou sobrescreve um arquivo do repositório',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Caminho relativo ao repo' },
        content: { type: 'string', description: 'Conteúdo completo do arquivo' }
      },
      required: ['path', 'content']
    }
  },
  {
    name: 'list_directory',
    description: 'Lista arquivos e pastas em um diretório do repo',
    input_schema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Caminho relativo ao repo (use "." para a raiz)'
        }
      },
      required: ['path']
    }
  },
  {
    name: 'search_in_files',
    description: 'Busca um texto em arquivos do repo (equivalente ao grep)',
    input_schema: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: 'Texto ou regex a buscar' },
        directory: { type: 'string', description: 'Diretório onde buscar (ex: painel)' },
        extension: { type: 'string', description: 'Extensão de arquivo (ex: .js, .jsx) — opcional' }
      },
      required: ['pattern', 'directory']
    }
  },
  {
    name: 'run_bash',
    description: 'Executa um comando bash no repositório. Use para git, npm test, vercel deploy, etc.',
    input_schema: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'Comando a executar' },
        cwd: {
          type: 'string',
          description: 'Subdiretório onde executar (ex: "painel", "medidor-app"). Padrão: raiz do repo.'
        }
      },
      required: ['command']
    }
  },
];

async function executarFerramenta(nome, input) {
  try {
    switch (nome) {

      case 'read_file': {
        const fullPath = resolverCaminho(input.path);
        const content = fs.readFileSync(fullPath, 'utf8');
        // Limita a 500 linhas para não explodir o contexto
        const linhas = content.split('\n');
        if (linhas.length > 500) {
          return linhas.slice(0, 500).join('\n') +
            `\n\n[... ${linhas.length - 500} linhas omitidas. Use um range específico se precisar.]`;
        }
        return content;
      }

      case 'write_file': {
        const fullPath = resolverCaminho(input.path);
        fs.mkdirSync(path.dirname(fullPath), { recursive: true });
        fs.writeFileSync(fullPath, input.content, 'utf8');
        return `✅ Arquivo salvo: ${input.path}`;
      }

      case 'list_directory': {
        const fullPath = resolverCaminho(input.path);
        const items = fs.readdirSync(fullPath, { withFileTypes: true });
        return items
          .map(i => `${i.isDirectory() ? '📁' : '📄'} ${i.name}`)
          .join('\n');
      }

      case 'search_in_files': {
        const dir = resolverCaminho(input.directory);
        const ext = input.extension ? `--include="*${input.extension}"` : '';
        const { stdout } = await execAsync(
          `grep -rn "${input.pattern}" ${ext} .`,
          { cwd: dir, timeout: 30000 }
        ).catch(e => ({ stdout: e.stdout || '' }));
        return stdout || 'Nenhum resultado encontrado.';
      }

      case 'run_bash': {
        validarComando(input.command);
        const cwd = input.cwd
          ? resolverCaminho(input.cwd)
          : REPO_PATH;
        const { stdout, stderr } = await execAsync(input.command, {
          cwd,
          timeout: 180000, // 3 minutos
          env: { ...process.env, VERCEL_TOKEN: process.env.VERCEL_TOKEN }
        });
        const saida = [stdout, stderr ? `STDERR: ${stderr}` : ''].filter(Boolean).join('\n');
        return saida || '(sem saída)';
      }

      default:
        return `Ferramenta desconhecida: ${nome}`;
    }
  } catch (err) {
    return `ERRO: ${err.message}`;
  }
}

module.exports = { DEFINICAO_FERRAMENTAS, executarFerramenta };
