const Anthropic = require('@anthropic-ai/sdk');
const { DEFINICAO_FERRAMENTAS, executarFerramenta } = require('./tools');
const fs = require('fs');
const path = require('path');

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const CLAUDE_MD = (() => {
  try {
    return fs.readFileSync(path.join(__dirname, '..', 'CLAUDE.md'), 'utf8');
  } catch {
    return '(CLAUDE.md não encontrado)';
  }
})();

const SYSTEM_PROMPT = `Você é um agente de manutenção do sistema Vedafacil, acionado via Telegram por operadores da empresa.

Seu trabalho é: entender o problema relatado, localizar o código correto, aplicar a correção, fazer commit e deploy, e reportar o resultado.

# Regras de governança (INVIOLÁVEIS)

${CLAUDE_MD}

# Comportamento esperado

1. Antes de qualquer alteração, leia os arquivos relevantes para entender o contexto.
2. Faça apenas o necessário para resolver o problema relatado — sem refatorações extras.
3. Nunca altere comportamentos não mencionados na solicitação.
4. Ao fazer commit: use a convenção Conventional Commits (feat/fix/chore etc.), em português, no imperativo. Ex: "fix(aplicador): corrigir botão de fechar dia"
5. Após o commit, rode o deploy do componente afetado (painel, medidor ou aplicador).
6. Reporte o resultado com: o que foi alterado, arquivo e linha, commit SHA, e URL de produção.

# Formato de resposta final

Ao concluir, responda com:
- ✅ O que foi corrigido (1-2 linhas)
- 📁 Arquivo(s) alterado(s) com linha
- 🔖 Commit: \`<sha curto>\` — \`<mensagem do commit>\`
- 🚀 Deploy: aguarde ~30s e acesse <URL do app afetado>

Se não conseguir resolver, responda:
- ❌ O que tentou
- 🤔 Por que não resolveu
- 💡 O que o operador deve fazer manualmente

# Contexto do projeto

- Repositório em: ${process.env.REPO_PATH || 'raiz pai desta pasta'}
- Painel (backend + frontend): pasta \`painel/\`
- PWA Medidor: pasta \`medidor-app/\`
- App Aplicador: pasta \`aplicador-app/\`
- Deploy painel: \`cd painel && npx vercel --prod\`
- Deploy medidor: \`cd medidor-app && npx vercel --prod\`
- Deploy aplicador: \`cd aplicador-app && npx vercel --prod\`
`;

async function executarAgente(mensagem, onProgresso, imageBase64) {
  // Monta o conteúdo da primeira mensagem (texto + imagem opcional)
  let conteudoInicial;
  if (imageBase64) {
    conteudoInicial = [
      { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: imageBase64 } },
      { type: 'text', text: mensagem },
    ];
  } else {
    conteudoInicial = mensagem;
  }
  const mensagens = [{ role: 'user', content: conteudoInicial }];
  let iteracoes = 0;
  const MAX_ITERACOES = 20;

  while (iteracoes < MAX_ITERACOES) {
    iteracoes++;

    const resposta = await anthropic.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 8192,
      system: SYSTEM_PROMPT,
      tools: DEFINICAO_FERRAMENTAS,
      messages: mensagens,
    });

    mensagens.push({ role: 'assistant', content: resposta.content });

    if (resposta.stop_reason === 'end_turn') {
      const textoFinal = resposta.content
        .filter(b => b.type === 'text')
        .map(b => b.text)
        .join('');
      return textoFinal;
    }

    if (resposta.stop_reason === 'tool_use') {
      const toolUseBlocks = resposta.content.filter(b => b.type === 'tool_use');
      const toolResults = [];

      for (const block of toolUseBlocks) {
        if (onProgresso) {
          onProgresso(`🔧 Executando: \`${block.name}\`(${JSON.stringify(block.input).slice(0, 80)}...)`);
        }

        const resultado = await executarFerramenta(block.name, block.input);

        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: String(resultado),
        });
      }

      mensagens.push({ role: 'user', content: toolResults });
    } else {
      // stop_reason inesperado (ex: max_tokens)
      break;
    }
  }

  return '❌ O agente atingiu o limite de iterações sem concluir. Por favor, tente novamente com uma solicitação mais específica.';
}

module.exports = { executarAgente };
