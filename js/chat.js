/**
 * chat.js
 * Chat financeiro com IA — conectado aos dados reais do Supabase
 * Usa a Vercel Function /api/analyze como proxy da API Anthropic
 */

import { supabase }       from './supabaseClient.js';
import { navigate }       from './router.js';
import { formatCurrency } from './utils.js';
import { coletarContexto, coletarContextoInvestimentos, renderMd } from './cashflowAI.js';

// ── Auth ──────────────────────────────────────────────
const { data: sd } = await supabase.auth.getSession();
if(!sd.session){ navigate('../login.html'); }
const user = sd.session.user;
document.getElementById('userEmail').innerText = user.email;
document.getElementById('btnLogout').addEventListener('click', async () => {
  await supabase.auth.signOut(); navigate('../login.html');
});

// ── Estado ────────────────────────────────────────────
let historico    = [];   // [{role, content}]
let contexto     = null; // dados financeiros carregados
let ctxInvest    = null; // dados de investimentos carregados
let carregando   = false;

const el = id => document.getElementById(id);

// ── Carregar contexto financeiro ──────────────────────
async function inicializar() {
  el('statusContexto').textContent = '⏳ Carregando seus dados financeiros...';
  try {
    [contexto, ctxInvest] = await Promise.all([
      coletarContexto(user.id),
      coletarContextoInvestimentos(user.id),
    ]);
    el('statusContexto').textContent = '✅ Dados carregados — pode perguntar!';
    el('statusContexto').style.color = 'var(--success, #22c55e)';
    el('inputMsg').disabled    = false;
    el('btnEnviar').disabled   = false;
    el('inputMsg').placeholder = 'Pergunte sobre gastos, investimentos, metas, teses...';
  } catch(err) {
    el('statusContexto').textContent = '⚠️ Erro ao carregar dados: ' + err.message;
    el('statusContexto').style.color = 'var(--danger, #ef4444)';
  }
}

// ── System prompt com contexto financeiro + investimentos ─────────────
function buildSystemPrompt() {
  const fmt  = v => Number(v).toLocaleString('pt-BR', { style:'currency', currency:'BRL' });
  const fmtP = v => v != null ? Number(v).toFixed(2) + '%' : '—';
  const c    = contexto;
  const inv  = ctxInvest;

  const linhasClasse = inv
    ? inv.porClasse.map(cl =>
        `- ${cl.classe}: ${fmt(cl.atual)} (${cl.pct}% da carteira) | resultado: ${fmt(cl.resultado)}`
      ).join('\n')
    : '';

  const linhasTop5 = inv
    ? inv.top5.map(a => {
        const res  = a.atual - a.aplic;
        const pct  = a.aplic > 0 ? (res / a.aplic * 100).toFixed(1) : '0';
        const inds = [
          a.pl  != null ? 'P/L: '  + Number(a.pl).toFixed(1)  : null,
          a.roe != null ? 'ROE: '  + fmtP(a.roe)               : null,
          a.dy  != null ? 'DY: '   + fmtP(a.dy)                : null,
        ].filter(Boolean).join(' | ');
        const tese = a.tese    ? '\n  Tese: '  + a.tese.slice(0, 120)    : '';
        const gat  = a.gatilho ? '\n  Saída: ' + a.gatilho.slice(0, 100) : '';
        const conv = a.convicao ? ' [convicção ' + a.convicao + ']' : '';
        return '- ' + a.ticker + conv + ': ' + fmt(a.atual) + ' | ' + (res >= 0 ? '+' : '') + pct + '%' + (inds ? ' | ' + inds : '') + tese + gat;
      }).join('\n')
    : '';

  const linhasMetas = inv && inv.metas.length
    ? inv.metas.map(m =>
        '- ' + m.nome + ': ' + fmt(m.atual) + ' de ' + fmt(m.alvo) + ' (' + m.pct + '%)' + (m.prazo ? ' — prazo ' + m.prazo : '')
      ).join('\n')
    : '- Nenhuma meta cadastrada';

  const secaoInvest = inv ? [
    '',
    '## Carteira de Investimentos',
    '',
    '- Total de ativos: ' + inv.totalAtivos,
    '- Total aplicado: ' + fmt(inv.totalAplicado),
    '- Valor atual: ' + fmt(inv.totalAtual),
    '- Resultado: ' + fmt(inv.resultado) + ' (' + inv.rentabilidade + '%)',
    '- Dividendos recebidos no mês: ' + fmt(inv.divMes),
    '- Dividendos recebidos no ano: ' + fmt(inv.divAno),
    '- Yield sobre patrimônio (ano): ' + inv.yieldAno + '%',
    '- Ativos com Diário de Tese registrado: ' + inv.ativosComTese,
    '',
    '### Alocação por classe',
    linhasClasse,
    '',
    '### Top ativos (por valor atual)',
    linhasTop5,
    '',
    '### Metas financeiras',
    linhasMetas,
  ].join('\n') : '';

  const catStr = c.gastosPorCategoria?.length
    ? c.gastosPorCategoria.map(g => '- ' + (g.icone || '') + ' ' + g.categoria + ': ' + fmt(g.total)).join('\n')
    : '- Sem dados de categoria';

  const histStr = c.historico3Meses?.length
    ? c.historico3Meses.map(h => '- ' + h.mes + ': receitas ' + fmt(h.receitas) + ', despesas ' + fmt(h.despesas) + ', saldo ' + fmt(h.saldo)).join('\n')
    : '- Sem histórico disponível';

  const pendStr = c.lancamentosPendentes?.length
    ? c.lancamentosPendentes.map(p => '- [' + p.tipo + '] ' + p.descricao + ': ' + fmt(p.valor) + ' em ' + p.data).join('\n')
    : '- Nenhum lançamento pendente';

  const recStr = c.recorrentes?.length
    ? c.recorrentes.map(r => '- [' + r.tipo + '] ' + r.descricao + ': ' + fmt(r.valor) + ' (' + r.frequencia + ')').join('\n')
    : '- Nenhum recorrente';

  const orcStr = c.orcamentos?.length
    ? c.orcamentos.map(o => '- ' + o.categoria + ': planejado ' + fmt(o.planejado)).join('\n')
    : '- Sem orçamentos configurados';

  return [
    'Você é o FinZen AI, assistente financeiro pessoal integrado ao app FinZen.',
    'Você tem acesso aos dados financeiros E de investimentos reais do usuário.',
    'Responda de forma clara, objetiva e em português brasileiro.',
    'Use bullet points quando listar itens. Formate valores sempre em R$.',
    '',
    '## Dados Financeiros Atuais (' + c.mesReferencia + ')',
    '',
    '- Saldo atual em contas: ' + fmt(c.saldoAtual),
    '- Saldo previsto fim do mês: ' + fmt(c.saldoPrevisto),
    '- Receitas pagas no mês: ' + fmt(c.receitasMes),
    '- Despesas pagas no mês: ' + fmt(c.despesasMes),
    '- Saldo do mês: ' + fmt(c.receitasMes - c.despesasMes),
    '- Taxa de poupança: ' + c.taxaPoupancaMes + '%',
    '- Faturas de cartão abertas: ' + fmt(c.totalFaturas),
    '- Receitas pendentes até fim do mês: ' + fmt(c.receitasPendentes),
    '- Despesas pendentes até fim do mês: ' + fmt(c.despesasPendentes),
    '',
    '### Gastos por categoria (mês atual)',
    catStr,
    '',
    '### Histórico últimos 3 meses',
    histStr,
    '',
    '### Lançamentos pendentes',
    pendStr,
    '',
    '### Recorrentes ativos',
    recStr,
    '',
    '### Orçamentos do mês',
    orcStr,
    secaoInvest,
    '',
    '## Instruções',
    '- Responda sempre em português brasileiro',
    '- Use os dados reais acima — nunca invente números',
    '- Formate valores em R$ com vírgula decimal',
    '- Respostas concisas: prefira bullet points a parágrafos longos',
    '- Se não souber algo, diga claramente',
    '- Pode comentar sobre ativos específicos da carteira do usuário usando os dados acima',
    '- Nunca recomende comprar ou vender ativos que não estejam na carteira do usuário',
    '- Para análise de tese, baseie-se no que o usuário registrou no Diário de Tese',
  ].join('\n');
}
// ── Renderizar mensagem ───────────────────────────────
function addMsg(role, conteudo = '', animado = false) {
  const wrap = el('mensagens');

  // Remove empty state se existir
  el('emptyState')?.remove();

  const div = document.createElement('div');
  div.className = `chat-msg chat-msg-${role}`;

  const avatar = document.createElement('div');
  avatar.className = 'chat-avatar';
  avatar.textContent = role === 'ai' ? '🤖' : '👤';

  const bubble = document.createElement('div');
  bubble.className = 'chat-bubble';

  if(role === 'ai') {
    bubble.innerHTML = animado ? '<span class="chat-cursor"></span>' : renderMd(conteudo);
  } else {
    bubble.textContent = conteudo;
  }

  div.appendChild(avatar);
  div.appendChild(bubble);
  wrap.appendChild(div);
  wrap.scrollTop = wrap.scrollHeight;
  return bubble;
}

function addTyping() {
  el('emptyState')?.remove();
  const wrap = el('mensagens');
  const div = document.createElement('div');
  div.className = 'chat-msg chat-msg-ai';
  div.id = 'typingIndicator';

  const avatar = document.createElement('div');
  avatar.className = 'chat-avatar';
  avatar.textContent = '🤖';

  const bubble = document.createElement('div');
  bubble.className = 'chat-bubble';
  bubble.innerHTML = '<div class="chat-dots"><span></span><span></span><span></span></div>';

  div.appendChild(avatar);
  div.appendChild(bubble);
  wrap.appendChild(div);
  wrap.scrollTop = wrap.scrollHeight;
  return div;
}

// ── Enviar mensagem ───────────────────────────────────
async function enviar() {
  if(carregando || !contexto) return;

  const input   = el('inputMsg');
  const mensagem = input.value.trim();
  if(!mensagem) return;

  carregando = true;
  input.value = '';
  input.style.height = 'auto';
  el('btnEnviar').disabled = true;

  // Mostra mensagem do usuário
  addMsg('user', mensagem);

  // Adiciona ao histórico
  historico.push({ role:'user', content: mensagem });

  // Indicador de digitação
  const typing = addTyping();

  let textoAcumulado = '';
  let bubble = null;
  let primeiroChunk = true;

  try {
    const systemPrompt = buildSystemPrompt();

    const resp = await fetch('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: mensagem,
        system: systemPrompt,
        history: historico.slice(-10), // últimas 10 trocas
      }),
    });

    if(!resp.ok) throw new Error(`Erro ${resp.status}`);

    const reader  = resp.body.getReader();
    const decoder = new TextDecoder();
    let buffer    = '';

    while(true) {
      const { done, value } = await reader.read();
      if(done) break;

      buffer += decoder.decode(value, { stream: true });
      const linhas = buffer.split('\n');
      buffer = linhas.pop();

      for(const linha of linhas) {
        if(!linha.startsWith('data: ')) continue;
        const raw = linha.slice(6).trim();
        if(raw === '[DONE]') continue;
        try {
          const json  = JSON.parse(raw);
          const delta = json?.delta?.text || '';
          if(delta) {
            if(primeiroChunk) {
              typing.remove();
              bubble = addMsg('ai', '', true);
              primeiroChunk = false;
            }
            textoAcumulado += delta;
            bubble.innerHTML = renderMd(textoAcumulado) + '<span class="chat-cursor"></span>';
            el('mensagens').scrollTop = el('mensagens').scrollHeight;
          }
        } catch(_) {}
      }
    }

    // Finaliza
    if(bubble) bubble.innerHTML = renderMd(textoAcumulado);
    historico.push({ role:'assistant', content: textoAcumulado });

    // Mantém só últimas 20 mensagens no histórico
    if(historico.length > 20) historico.splice(0, 2);

  } catch(err) {
    typing?.remove();
    addMsg('ai', `⚠️ Erro ao processar sua mensagem: ${err.message}`);
  } finally {
    carregando = false;
    el('btnEnviar').disabled = false;
    input.focus();
  }
}

// ── Sugestões rápidas ─────────────────────────────────
window.usarSugestao = function(texto) {
  el('inputMsg').value = texto;
  enviar();
};

// ── Limpar conversa ───────────────────────────────────
window.limparChat = function() {
  historico = [];
  const wrap = el('mensagens');
  wrap.innerHTML = `
    <div id="emptyState" class="chat-empty">
      <div class="chat-empty-icon">🤖</div>
      <h3>Olá! Sou o FinZen AI</h3>
      <p>Tenho acesso aos seus dados financeiros. Pergunte o que quiser sobre seus gastos, receitas, investimentos e metas.</p>
    </div>`;
};

// ── Auto-resize textarea ──────────────────────────────
el('inputMsg').addEventListener('input', function() {
  this.style.height = 'auto';
  this.style.height = Math.min(this.scrollHeight, 120) + 'px';
});

el('inputMsg').addEventListener('keydown', function(e) {
  if(e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    enviar();
  }
});

el('btnEnviar').addEventListener('click', enviar);
el('btnEnviar').addEventListener('touchend', (e) => {
  e.preventDefault();
  if (!el('btnEnviar').disabled) enviar();
});

// ── Inicializar ───────────────────────────────────────
inicializar();
