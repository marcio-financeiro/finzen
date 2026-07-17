// api/telegram-webhook.js — FinZen Assessor Telegram (multi-usuário)
// Setup: GET /api/telegram-webhook?setup=1

import { buscarCotacoes, montarResumoCarteira } from './_cotacaoResumo.js';

const BOT_TOKEN       = process.env.TELEGRAM_BOT_TOKEN;
const VERCEL_URL      = 'https://finzen-rho.vercel.app';
const SB_URL          = process.env.SUPABASE_URL;
const SB_KEY          = process.env.SUPABASE_SERVICE_KEY;
// Fallback para o usuário original (transição transparente)
const LEGACY_CHAT_ID  = process.env.TELEGRAM_CHAT_ID;
const LEGACY_USER_ID  = process.env.FINZEN_USER_ID;

// ── Supabase REST ────────────────────────────────────────────────────────────
const sbHeaders = {
  apikey: SB_KEY,
  Authorization: `Bearer ${SB_KEY}`,
  'Content-Type': 'application/json',
};

// Contexto da requisição atual (resolvido no handler, usado pelas funções)
let CHAT_ID = null;
let USER_ID = null;

async function resolveUser(chatId) {
  // 1. Buscar na tabela de vínculos
  const r = await fetch(
    `${SB_URL}/rest/v1/telegram_links?chat_id=eq.${chatId}&select=user_id`,
    { headers: sbHeaders }
  );
  const data = await r.json();
  if (data[0]?.user_id) {
    // Registrar último uso (silencioso)
    return data[0].user_id;
  }

  // 2. Fallback: usuário original (env var) — auto-vincula na primeira mensagem
  if (LEGACY_CHAT_ID && String(chatId) === String(LEGACY_CHAT_ID) && LEGACY_USER_ID) {
    // Auto-inserir o vínculo permanente
    await fetch(`${SB_URL}/rest/v1/telegram_links`, {
      method: 'POST',
      headers: { ...sbHeaders, Prefer: 'return=minimal' },
      body: JSON.stringify({ user_id: LEGACY_USER_ID, chat_id: String(chatId) }),
    }).catch(() => {});
    return LEGACY_USER_ID;
  }

  return null;
}

async function vincularBot(chatId, code) {
  // Buscar código pendente
  const r = await fetch(
    `${SB_URL}/rest/v1/telegram_pending?code=eq.${code}&select=user_id,expires_at`,
    { headers: sbHeaders }
  );
  const data = await r.json();
  if (!data[0]) {
    await enviarPara(chatId, '❌ Código inválido ou expirado. Gere um novo código no seu perfil FinZen.');
    return;
  }
  if (new Date(data[0].expires_at) < new Date()) {
    await enviarPara(chatId, '⏱ Código expirado. Gere um novo código no seu perfil FinZen.');
    return;
  }

  const userId = data[0].user_id;

  // Remover código usado
  await fetch(`${SB_URL}/rest/v1/telegram_pending?code=eq.${code}`, {
    method: 'DELETE', headers: sbHeaders,
  });

  // Remover vínculo anterior deste chat_id (se houver)
  await fetch(`${SB_URL}/rest/v1/telegram_links?chat_id=eq.${chatId}`, {
    method: 'DELETE', headers: sbHeaders,
  });

  // Criar vínculo
  await fetch(`${SB_URL}/rest/v1/telegram_links`, {
    method: 'POST',
    headers: { ...sbHeaders, Prefer: 'return=minimal' },
    body: JSON.stringify({ user_id: userId, chat_id: String(chatId) }),
  });

  await enviarPara(chatId,
    '✅ <b>Telegram vinculado com sucesso!</b>\n\n' +
    'Agora você pode usar todos os recursos do FinZen aqui.\n' +
    'Digite <code>ajuda</code> para ver os comandos disponíveis.'
  );
}

async function sbGet(table, qs = '') {
  const r = await fetch(
    `${SB_URL}/rest/v1/${table}?user_id=eq.${USER_ID}${qs ? '&' + qs : ''}`,
    { headers: sbHeaders }
  );
  return r.json();
}

async function sbPost(table, body) {
  await fetch(`${SB_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: { ...sbHeaders, Prefer: 'return=minimal' },
    body: JSON.stringify(body),
  });
}

async function sbPatch(table, id, body) {
  await fetch(`${SB_URL}/rest/v1/${table}?id=eq.${id}&user_id=eq.${USER_ID}`, {
    method: 'PATCH',
    headers: sbHeaders,
    body: JSON.stringify(body),
  });
}

// ── Telegram ─────────────────────────────────────────────────────────────────
async function enviarPara(chatId, texto) {
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text: texto, parse_mode: 'HTML' }),
  });
}

async function enviar(texto) {
  await enviarPara(CHAT_ID, texto);
}

async function responderCallback(id) {
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/answerCallbackQuery`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ callback_query_id: id }),
  });
}

// Botões de contas bancárias: tx|{t}|{valor}|{desc10}|{cat10}|{conta10}
async function enviarBotoesContas(tipo, valor, descricao, categoriaNome, contas) {
  const emoji  = tipo === 'receita' ? '💰' : '💸';
  const linhas = [];
  for (let i = 0; i < contas.length; i += 2) {
    const row = [];
    for (let j = i; j < Math.min(i + 2, contas.length); j++) {
      row.push({
        text: '🏦 ' + contas[j].nome,
        callback_data: `tx|${tipo[0]}|${valor}|${descricao.slice(0,10)}|${(categoriaNome||'').slice(0,10)}|${contas[j].nome.slice(0,10)}`,
      });
    }
    linhas.push(row);
  }
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: CHAT_ID,
      text: `${emoji} <b>R$ ${fmt(valor)} — ${descricao}</b>${categoriaNome ? `\n🏷️ ${categoriaNome}` : ''}\n\nQual conta?`,
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: linhas },
    }),
  });
}

// Botões de cartões: cc|{t}|{valor}|{desc10}|{cat10}|{data}|{parcelas}|{cartao10}
async function enviarBotoesCartoes(tipo, valor, descricao, categoriaNome, dataCompra, parcelas, cartoes) {
  const emoji  = tipo === 'receita' ? '💰' : '💸';
  const data   = dataCompra || 'ndt';
  const parc   = parcelas || 1;
  const linhas = [];
  for (let i = 0; i < cartoes.length; i += 2) {
    const row = [];
    for (let j = i; j < Math.min(i + 2, cartoes.length); j++) {
      row.push({
        text: '💳 ' + cartoes[j].nome,
        callback_data: `cc|${tipo[0]}|${valor}|${descricao.slice(0,10)}|${(categoriaNome||'').slice(0,10)}|${data}|${parc}|${cartoes[j].nome.slice(0,10)}`,
      });
    }
    linhas.push(row);
  }
  const parcLabel = parc > 1 ? ` · ${parc}x de R$ ${fmt(valor/parc)}` : '';
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: CHAT_ID,
      text: `${emoji} <b>R$ ${fmt(valor)} — ${descricao}</b>${parcLabel}${categoriaNome ? `\n🏷️ ${categoriaNome}` : ''}\n\nQual cartão?`,
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: linhas },
    }),
  });
}

// Botões de contas + cartões (usado após leitura de comprovante)
async function enviarBotoesContasECartoes(tipo, valor, descricao, categoriaNome, dataCompra, contas, cartoes) {
  const emoji = tipo === 'receita' ? '💰' : '💸';
  const data  = dataCompra || 'ndt';
  const linhas = [];

  // Contas bancárias
  for (let i = 0; i < contas.length; i += 2) {
    const row = [];
    for (let j = i; j < Math.min(i + 2, contas.length); j++) {
      row.push({
        text: '🏦 ' + contas[j].nome,
        callback_data: `tx|${tipo[0]}|${valor}|${descricao.slice(0,10)}|${(categoriaNome||'').slice(0,10)}|${contas[j].nome.slice(0,10)}`,
      });
    }
    linhas.push(row);
  }

  // Cartões de crédito (comprovante = sempre 1x)
  for (let i = 0; i < cartoes.length; i += 2) {
    const row = [];
    for (let j = i; j < Math.min(i + 2, cartoes.length); j++) {
      row.push({
        text: '💳 ' + cartoes[j].nome,
        callback_data: `cc|${tipo[0]}|${valor}|${descricao.slice(0,10)}|${(categoriaNome||'').slice(0,10)}|${data}|1|${cartoes[j].nome.slice(0,10)}`,
      });
    }
    linhas.push(row);
  }

  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: CHAT_ID,
      text: `📸 <b>Comprovante detectado</b>\n\n💵 R$ ${fmt(valor)} — ${descricao}${categoriaNome ? `\n🏷️ ${categoriaNome}` : ''}${dataCompra ? `\n📅 ${dataCompra}` : ''}\n\nLançar em:`,
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: linhas },
    }),
  });
}

// ── Groq Whisper — transcrição de voz ───────────────────────────────────────
async function transcreverVoz(fileId) {
  const infoRes = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getFile?file_id=${fileId}`);
  const { result } = await infoRes.json();
  const audioUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${result.file_path}`;

  const audioRes  = await fetch(audioUrl);
  const audioBlob = await audioRes.blob();

  const form = new FormData();
  form.append('file', audioBlob, 'voice.ogg');
  form.append('model', 'whisper-large-v3');
  form.append('language', 'pt');

  const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
    body: form,
  });
  const { text, error } = await res.json();
  if (error) throw new Error('Whisper: ' + error.message);
  return text || '';
}

// ── Claude Vision — leitura de comprovante ───────────────────────────────────
async function analisarComprovante(fileId) {
  const infoRes = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getFile?file_id=${fileId}`);
  const { result } = await infoRes.json();
  const imgUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${result.file_path}`;

  const imgRes = await fetch(imgUrl);
  const buffer = await imgRes.arrayBuffer();
  const base64 = Buffer.from(buffer).toString('base64');

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5',
      max_tokens: 300,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: 'image/jpeg', data: base64 },
          },
          {
            type: 'text',
            text: `Analise este comprovante/recibo e retorne APENAS um JSON válido, sem markdown:
{"valor":NUMBER,"descricao":"STRING","data":"YYYY-MM-DD_OU_NULL","categoria":"STRING_OU_NULL"}

- valor: valor total da transação
- descricao: nome do estabelecimento (curto, máx 20 chars)
- data: data da transação em YYYY-MM-DD, null se não visível
  IMPORTANTE: hoje é ${hoje()}. Se o comprovante mostrar uma data com ano anterior ao atual, use o ano atual (${new Date().getFullYear()}).
- categoria: Alimentação | Transporte | Saúde | Lazer | Assinaturas | Moradia | Educação | Roupa | Presentes | Cuidados Pessoais | null`,
          },
        ],
      }],
    }),
  });

  const data = await res.json();
  if (data.error) throw new Error('Claude Vision: ' + data.error.message);
  const content = data.content?.[0]?.text?.trim() || '';
  const match = content.match(/\{[\s\S]*\}/);
  return match ? JSON.parse(match[0]) : null;
}

// ── Groq Llama — interpretação de linguagem natural ──────────────────────────
async function interpretarComGroq(texto, contas, cartoes, categorias) {
  const nomesContas   = contas.map(c => c.nome).join(', ');
  const nomesCartoes  = cartoes.map(c => c.nome).join(', ');
  const catsDespesa   = categorias.filter(c => c.tipo === 'despesa').map(c => c.nome).join(', ');
  const catsReceita   = categorias.filter(c => c.tipo === 'receita').map(c => c.nome).join(', ');

  const prompt = `Você é o assistente financeiro do FinZen. Interprete o comando em português e retorne APENAS um JSON válido, sem markdown.
Hoje é ${hoje()}.

Contas bancárias: ${nomesContas}
Cartões de crédito: ${nomesCartoes}
Categorias de despesa: ${catsDespesa}
Categorias de receita: ${catsReceita}

Formatos de resposta:
{"acao":"lancar","tipo":"despesa","valor":NUMBER,"descricao":"STRING","conta":"NOME_OU_NULL","categoria":"NOME_OU_NULL"}
{"acao":"lancar","tipo":"receita","valor":NUMBER,"descricao":"STRING","conta":"NOME_OU_NULL","categoria":"NOME_OU_NULL"}
{"acao":"lancar_cartao","tipo":"despesa","valor":NUMBER,"descricao":"STRING","cartao":"NOME_OU_NULL","categoria":"NOME_OU_NULL","parcelas":NUMBER}
{"acao":"saldo"}
{"acao":"extrato"}
{"acao":"resumo"}
{"acao":"agenda_hoje"}
{"acao":"agenda_semana"}
{"acao":"offshore"}
{"acao":"marcar_evento","titulo":"STRING","data":"YYYY-MM-DD_OU_NULL","hora":"HH:MM_OU_NULL","tipo":"STRING_OU_NULL"}
{"acao":"ajuda"}
{"acao":"desconhecido","mensagem":"STRING"}

Regras:
- Use lancar_cartao quando o usuário disser "cartão", "crédito", ou o nome de um cartão
- "conta"/"cartao": nome exato se mencionado; null se não especificado
- "parcelas": número de parcelas se mencionado (ex: "3x", "em 3 vezes", "parcelado em 12"); default 1
- Valores por extenso: "cinquenta"=50, "cem"=100, "mil"=1000
- despesa: gastei, paguei, comprei, saiu
- receita: recebi, entrou, salário, renda
- agenda_hoje: hoje, tarefas, minha agenda, compromissos hoje
- agenda_semana: semana, próximos dias, agenda da semana
- offshore: embarque, plataforma, ciclo offshore, quando embarco
- marcar_evento: marcar, agendar, lembrar, compromisso, consulta, reunião
  - data: calcule a data exata (hoje=hoje, amanhã=hoje+1, "próxima sexta"=próxima sexta, etc.)
  - hora: formato HH:MM se mencionada
  - tipo: saude | compromisso | financeiro | pessoal (inferir pelo contexto)

Exemplos de categoria: restaurante→Alimentação, uber→Transporte, farmácia→Saúde, netflix→Assinaturas, salário→Salário

Comando: "${texto}"`;

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      max_tokens: 200,
      temperature: 0.1,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  const data = await res.json();
  if (data.error) throw new Error('Groq: ' + (data.error.message || JSON.stringify(data.error)));
  const content = data.choices?.[0]?.message?.content?.trim() || '';
  if (!content) throw new Error('Groq retornou resposta vazia');
  const match = content.match(/\{[\s\S]*\}/);
  return match ? JSON.parse(match[0]) : {};
}

// ── Utilitários ───────────────────────────────────────────────────────────────
function fmt(v) {
  return Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function hoje() { return new Date().toISOString().split('T')[0]; }

function normStr(s) {
  return (s || '').replace(/^@/, '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
}

function buscarCategoria(nome, lista) {
  if (!nome || nome === 'null') return null;
  return lista.find(c => normStr(c.nome) === normStr(nome))
      || lista.find(c => normStr(c.nome).includes(normStr(nome)))
      || null;
}

function calcFaturaRef(dataCompra, fechamentoDia, vencimentoDia) {
  const d = dataCompra ? new Date(dataCompra + 'T12:00:00') : new Date();
  const ref = d.getDate() > Number(fechamentoDia)
    ? new Date(d.getFullYear(), d.getMonth() + 1, 1)
    : new Date(d.getFullYear(), d.getMonth(), 1);
  if (vencimentoDia && Number(vencimentoDia) < Number(fechamentoDia)) {
    ref.setMonth(ref.getMonth() + 1);
  }
  return `${ref.getFullYear()}-${String(ref.getMonth() + 1).padStart(2, '0')}`;
}

function formatarData(dateStr) {
  if (!dateStr) return '';
  const [ano, mes, dia] = dateStr.split('-');
  const meses = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
  return `${dia}/${meses[parseInt(mes) - 1]}/${ano}`;
}

function diasEntre(a, b) {
  return Math.ceil((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 86400000);
}

// ── Executores ────────────────────────────────────────────────────────────────
async function execSaldo() {
  const contas = await sbGet('accounts', 'active=eq.true&order=sort_order.asc,nome.asc');
  if (!Array.isArray(contas) || !contas.length) { await enviar('Nenhuma conta ativa.'); return; }
  const total = contas.reduce((s, a) => s + Number(a.saldo_atual || 0), 0);
  const lista = contas.map(a => `🏦 ${a.nome}: <b>R$ ${fmt(a.saldo_atual)}</b>`).join('\n');
  await enviar(`💳 <b>Saldos</b>\n\n${lista}\n\n💰 Total: <b>R$ ${fmt(total)}</b>`);
}

async function execExtrato() {
  const [txs, cardTxs] = await Promise.all([
    sbGet('transactions', 'order=created_at.desc&limit=10'),
    sbGet('card_transactions', 'select=descricao,valor_total,data_compra,created_at&parcela_atual=eq.1&order=created_at.desc&limit=10'),
  ]);

  const normTx = (Array.isArray(txs) ? txs : []).map(t => ({
    emoji: t.type === 'receita' ? '💰' : '💸',
    date: t.date,
    description: t.description,
    amount: t.amount,
    created_at: t.created_at,
  }));

  const normCard = (Array.isArray(cardTxs) ? cardTxs : []).map(c => ({
    emoji: '💳',
    date: c.data_compra,
    description: c.descricao,
    amount: c.valor_total,
    created_at: c.created_at,
  }));

  const todos = [...normTx, ...normCard]
    .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
    .slice(0, 10);

  if (!todos.length) { await enviar('Nenhuma movimentação encontrada.'); return; }

  const lista = todos.map(t =>
    `${t.emoji} ${t.date} — ${t.description} — <b>R$ ${fmt(t.amount)}</b>`
  ).join('\n');

  await enviar(`📋 <b>Extrato recente</b>\n\n${lista}`);
}

async function execResumo() {
  const agora    = new Date();
  const ano      = agora.getFullYear();
  const mesNum   = agora.getMonth() + 1;
  const mesLabel = `${ano}-${String(mesNum).padStart(2, '0')}`;
  const inicio   = `${mesLabel}-01`;
  const proxMes  = mesNum === 12 ? 1 : mesNum + 1;
  const proxAno  = mesNum === 12 ? ano + 1 : ano;
  const proximo  = `${proxAno}-${String(proxMes).padStart(2, '0')}-01`;

  const txs = await sbGet('transactions', `date=gte.${inicio}&date=lt.${proximo}`);
  if (!Array.isArray(txs)) { await enviar('Erro ao consultar resumo.'); return; }

  const receitas = txs.filter(t => t.type === 'receita').reduce((s, t) => s + Number(t.amount || 0), 0);
  const despesas = txs.filter(t => t.type === 'despesa').reduce((s, t) => s + Number(t.amount || 0), 0);
  const saldo    = receitas - despesas;
  await enviar(
    `📊 <b>Resumo — ${mesLabel}</b>\n\n` +
    `💰 Receitas: <b>R$ ${fmt(receitas)}</b>\n` +
    `💸 Despesas: <b>R$ ${fmt(despesas)}</b>\n` +
    `${saldo >= 0 ? '✅' : '🔴'} Resultado: <b>R$ ${fmt(saldo)}</b>`
  );
}

async function execLancar(tipo, valor, descricao, nomeConta, todasContas, categoriaNome, todasCategorias) {
  const conta = todasContas.find(c => normStr(c.nome) === normStr(nomeConta))
             || todasContas.find(c => normStr(c.nome).includes(normStr(nomeConta)))
             || todasContas.find(c => c.sort_order >= 1)
             || todasContas[0];
  const categoria = buscarCategoria(categoriaNome, todasCategorias);

  const payload = {
    user_id: USER_ID, account_id: conta.id,
    type: tipo, amount: valor, description: descricao,
    date: hoje(), status: 'pago',
  };
  if (categoria) payload.category_id = categoria.id;

  await sbPost('transactions', payload);

  const novoSaldo = Number(conta.saldo_atual || 0) + (tipo === 'receita' ? valor : -valor);
  await sbPatch('accounts', conta.id, { saldo_atual: novoSaldo });

  const emoji = tipo === 'receita' ? '💰' : '💸';
  const sinal = tipo === 'receita' ? '+' : '-';
  await enviar(
    `${emoji} <b>Lançado!</b>\n\n` +
    `📝 ${descricao}\n` +
    `💵 R$ ${sinal}${fmt(valor)}\n` +
    `🏦 ${conta.nome}\n` +
    (categoria ? `🏷️ ${categoria.nome}\n` : '') +
    `💳 Novo saldo: <b>R$ ${fmt(novoSaldo)}</b>`
  );
}

async function execLancarCartao(valor, descricao, nomeCartao, categoriaNome, dataCompra, todosCartoes, todasCategorias, parcelas = 1) {
  const cartao = todosCartoes.find(c => normStr(c.nome) === normStr(nomeCartao))
              || todosCartoes.find(c => normStr(c.nome).includes(normStr(nomeCartao)))
              || todosCartoes[0];
  const categoria    = buscarCategoria(categoriaNome, todasCategorias);
  const dataStr      = (dataCompra && dataCompra !== 'ndt') ? dataCompra : hoje();
  const nParcelas    = Math.max(1, parseInt(parcelas) || 1);
  const valorParcela = Math.round((valor / nParcelas) * 100) / 100;
  const faturaBase   = calcFaturaRef(dataStr, cartao.fechamento_dia, cartao.vencimento_dia);
  const [fatAno, fatMes] = faturaBase.split('-').map(Number);

  // Cria uma linha por parcela com a fatura correta de cada mês
  for (let i = 0; i < nParcelas; i++) {
    const ref  = new Date(fatAno, fatMes - 1 + i, 1);
    const fRef = `${ref.getFullYear()}-${String(ref.getMonth() + 1).padStart(2, '0')}`;
    const desc = nParcelas > 1 ? `${descricao} (${i + 1}/${nParcelas})` : descricao;
    const payload = {
      user_id: USER_ID, card_id: cartao.id,
      descricao: desc, valor_total: valor,
      parcelas: nParcelas, parcela_atual: i + 1, valor_parcela: valorParcela,
      data_compra: dataStr, fatura_referencia: fRef, status: 'aberta',
    };
    if (categoria) payload.category_id = categoria.id;
    await sbPost('card_transactions', payload);
  }

  const parcLabel = nParcelas > 1 ? `🔄 ${nParcelas}x de R$ ${fmt(valorParcela)}\n` : '';
  const fatLabel  = nParcelas > 1
    ? `📅 Faturas: ${faturaBase} → ${fatAno}-${String((fatMes - 1 + nParcelas - 1) % 12 + 1).padStart(2,'0')}`
    : `📅 Fatura: ${faturaBase}`;

  await enviar(
    `💳 <b>Lançado no cartão!</b>\n\n` +
    `📝 ${descricao}\n` +
    `💵 R$ -${fmt(valor)}\n` +
    `💳 ${cartao.nome}\n` +
    (categoria ? `🏷️ ${categoria.nome}\n` : '') +
    parcLabel +
    fatLabel
  );
}

async function execAjuda() {
  await enviar(
    `🤖 <b>FinZen · Assessor</b>\n\n` +
    `Fale naturalmente, mande voz ou comprovante:\n\n` +
    `💸 <i>"gastei 80 no almoço no itaú"</i>\n` +
    `💳 <i>"comprei 150 no cartão nubank em 3x"</i>\n` +
    `📸 <i>envie foto do comprovante</i>\n` +
    `📅 <i>"marcar consulta médica amanhã às 14h"</i>\n\n` +
    `<b>Consultas rápidas:</b>\n` +
    `  <code>hoje</code> · <code>agenda</code> · <code>offshore</code>\n` +
    `  <code>saldo</code> · <code>extrato</code> · <code>resumo</code> · <code>carteira</code>`
  );
}

// ── Executores de agenda ──────────────────────────────────────────────────────
async function execAgendaHoje() {
  const hj = hoje();

  const [eventos, cicloAtual, pendentes] = await Promise.all([
    sbGet('calendar_events', `data_inicio=lte.${hj}&data_fim=gte.${hj}&order=hora.asc`),
    sbGet('offshore_cycles', `data_embarque=lte.${hj}&data_desembarque=gte.${hj}&limit=1`),
    sbGet('transactions',    `date=eq.${hj}&status=eq.pendente`),
  ]);

  const diasSemana = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
  const d = new Date(hj + 'T12:00:00');
  let msg = `📅 <b>${diasSemana[d.getDay()]}, ${formatarData(hj)}</b>\n\n`;

  // Status offshore
  if (Array.isArray(cicloAtual) && cicloAtual.length) {
    const c = cicloAtual[0];
    const restantes = diasEntre(hj, c.data_desembarque);
    msg += `🚢 <b>EMBARCADO</b> — ${c.plataforma}\n`;
    msg += `🏠 Desembarque em ${restantes} dia${restantes !== 1 ? 's' : ''} (${formatarData(c.data_desembarque)})\n\n`;
  } else {
    const proximo = await sbGet('offshore_cycles', `data_embarque=gt.${hj}&status=eq.planejado&order=data_embarque.asc&limit=1`);
    if (Array.isArray(proximo) && proximo.length) {
      const diasAte = diasEntre(hj, proximo[0].data_embarque);
      msg += `🏠 Em terra · embarque em <b>${diasAte} dia${diasAte !== 1 ? 's' : ''}</b> (${proximo[0].plataforma})\n\n`;
    } else {
      msg += `🏠 Em terra\n\n`;
    }
  }

  // Compromissos do dia
  if (Array.isArray(eventos) && eventos.length) {
    msg += `📋 <b>Compromissos:</b>\n`;
    for (const e of eventos) {
      const hora  = e.hora ? e.hora.slice(0, 5) + ' · ' : '';
      const check = e.status === 'concluido' ? '✅' : e.status === 'cancelado' ? '❌' : '🔹';
      msg += `${check} ${hora}${e.titulo}\n`;
    }
    msg += '\n';
  } else {
    msg += `📋 Sem compromissos hoje\n\n`;
  }

  // Contas pendentes
  if (Array.isArray(pendentes) && pendentes.length) {
    msg += `💸 <b>Contas a pagar:</b>\n`;
    for (const t of pendentes) {
      msg += `• ${t.description} — R$ ${fmt(t.amount)}\n`;
    }
  }

  await enviar(msg.trim());
}

async function execAgendaSemana() {
  const hj  = hoje();
  const fim = new Date(hj + 'T12:00:00');
  fim.setDate(fim.getDate() + 7);
  const fimStr = fim.toISOString().split('T')[0];

  const eventos = await sbGet('calendar_events', `data_inicio=gte.${hj}&data_inicio=lte.${fimStr}&order=data_inicio.asc,hora.asc`);

  if (!Array.isArray(eventos) || !eventos.length) {
    await enviar('📅 Nenhum compromisso nos próximos 7 dias.');
    return;
  }

  const diasSemana = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
  const byDate = {};
  for (const e of eventos) {
    if (!byDate[e.data_inicio]) byDate[e.data_inicio] = [];
    byDate[e.data_inicio].push(e);
  }

  let msg = '📅 <b>Agenda — próximos 7 dias</b>\n\n';
  for (const [data, evs] of Object.entries(byDate)) {
    const dw = new Date(data + 'T12:00:00');
    msg += `<b>${diasSemana[dw.getDay()]} ${formatarData(data)}</b>\n`;
    for (const e of evs) {
      const hora = e.hora ? e.hora.slice(0, 5) + ' ' : '';
      msg += `  🔹 ${hora}${e.titulo}\n`;
    }
    msg += '\n';
  }

  await enviar(msg.trim());
}

async function execMarcarEvento(titulo, data, hora, tipo) {
  const dataEvento = data || hoje();
  const tipoEvento = tipo || 'compromisso';

  await sbPost('calendar_events', {
    user_id: USER_ID,
    titulo,
    tipo: tipoEvento,
    status: 'pendente',
    data_inicio: dataEvento,
    data_fim: dataEvento,
    hora: hora || null,
    recorrente: false,
  });

  const horaStr = hora ? ` às ${hora}` : '';
  await enviar(
    `📅 <b>Evento marcado!</b>\n\n` +
    `📋 ${titulo}\n` +
    `📆 ${formatarData(dataEvento)}${horaStr}`
  );
}

async function execOffshore() {
  const hj = hoje();

  const atual = await sbGet('offshore_cycles', `data_embarque=lte.${hj}&data_desembarque=gte.${hj}&order=data_embarque.desc&limit=1`);

  if (Array.isArray(atual) && atual.length) {
    const c = atual[0];
    const restantes = diasEntre(hj, c.data_desembarque);
    await enviar(
      `🚢 <b>Ciclo Offshore</b>\n\n` +
      `📍 Plataforma: <b>${c.plataforma}</b>\n` +
      `🛳️ Embarque: ${formatarData(c.data_embarque)}\n` +
      `🏠 Desembarque: ${formatarData(c.data_desembarque)}\n` +
      `⏳ ${restantes} dia${restantes !== 1 ? 's' : ''} restante${restantes !== 1 ? 's' : ''}`
    );
    return;
  }

  const proximo = await sbGet('offshore_cycles', `data_embarque=gt.${hj}&order=data_embarque.asc&limit=1`);
  if (Array.isArray(proximo) && proximo.length) {
    const c = proximo[0];
    const diasAte = diasEntre(hj, c.data_embarque);
    await enviar(
      `🏠 <b>Em terra</b>\n\n` +
      `Próximo embarque em <b>${diasAte} dia${diasAte !== 1 ? 's' : ''}</b>\n` +
      `📍 ${c.plataforma}\n` +
      `🛳️ ${formatarData(c.data_embarque)} → ${formatarData(c.data_desembarque)}`
    );
  } else {
    await enviar('🏠 Em terra · Nenhum embarque planejado.');
  }
}

async function execFechamento() {
  const ativos = await sbGet('investments', 'ativo=eq.true&select=id,ticker,tipo,moeda,quantidade,corretora');
  const negociaveis = (Array.isArray(ativos) ? ativos : []).filter(a => a.tipo !== 'renda_fixa');
  if (!negociaveis.length) { await enviar('Nenhum ativo negociável na carteira.'); return; }

  const tickers = [...new Set(negociaveis.map(a => a.ticker.toUpperCase()))];
  let quotes;
  try {
    quotes = await buscarCotacoes(VERCEL_URL, tickers);
  } catch (e) {
    await enviar('❌ Não consegui buscar as cotações agora. Tente de novo em instantes.');
    return;
  }
  const dolar   = quotes['USD-BRL'] || 0;
  const dataFmt = new Date().toLocaleDateString('pt-BR', {
    timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric',
  });

  const { texto } = montarResumoCarteira({ ativos: negociaveis, quotes, dolar, dataFmt });
  await enviar(texto);
}

// ── Callback de botões inline ─────────────────────────────────────────────────
async function handleCallback(cq) {
  await responderCallback(cq.id);
  const data = cq.data || '';

  const [contas, cartoes, categorias] = await Promise.all([
    sbGet('accounts',    'active=eq.true&order=sort_order.asc,nome.asc'),
    sbGet('credit_cards','ativo=eq.true&order=sort_order.asc,nome.asc'),
    sbGet('categories',  'order=nome.asc'),
  ]);
  const ca = Array.isArray(contas)     ? contas     : [];
  const cr = Array.isArray(cartoes)    ? cartoes    : [];
  const ct = Array.isArray(categorias) ? categorias : [];

  if (data.startsWith('tx|')) {
    // tx|{t}|{valor}|{desc10}|{cat10}|{conta10}
    const p = data.split('|');
    const tipo  = p[1] === 'r' ? 'receita' : 'despesa';
    const valor = parseFloat(p[2]);
    await execLancar(tipo, valor, p[3], p[5], ca, p[4], ct);

  } else if (data.startsWith('cc|')) {
    // cc|{t}|{valor}|{desc10}|{cat10}|{data}|{parcelas}|{cartao10}
    const p = data.split('|');
    const valor      = parseFloat(p[2]);
    const dataCompra = p[5] !== 'ndt' ? p[5] : null;
    const parcelas   = parseInt(p[6]) || 1;
    const nomeCartao = p[7];
    await execLancarCartao(valor, p[3], nomeCartao, p[4], dataCompra, cr, ct, parcelas);
  }
}

// ── Processador principal ────────────────────────────────────────────────────
async function processar(texto) {
  const t = texto.toLowerCase().trim();

  if (t === 'saldo' || t === 'quanto tenho' || t === 'contas')   return execSaldo();
  if (t === 'extrato' || t === 'historico' || t === 'histórico') return execExtrato();
  if (t === 'resumo' || t === 'resumo do mes' || t === 'resumo do mês') return execResumo();
  if (t === 'hoje' || t === 'tarefas' || t === 'agenda hoje' || t === 'compromissos') return execAgendaHoje();
  if (t === 'agenda' || t === 'semana' || t === 'agenda da semana') return execAgendaSemana();
  if (t === 'offshore' || t === 'embarque' || t === 'ciclo') return execOffshore();
  if (t === 'fechamento' || t === 'carteira' || t === 'cotacao' || t === 'cotação') return execFechamento();
  if (t === 'ajuda' || t === 'help' || t === '/start' || t === '/help') return execAjuda();

  const [contas, cartoes, categorias] = await Promise.all([
    sbGet('accounts',    'active=eq.true&order=sort_order.asc,nome.asc'),
    sbGet('credit_cards','ativo=eq.true&order=sort_order.asc,nome.asc'),
    sbGet('categories',  'order=nome.asc'),
  ]);
  const ca = Array.isArray(contas)     ? contas     : [];
  const cr = Array.isArray(cartoes)    ? cartoes    : [];
  const ct = Array.isArray(categorias) ? categorias : [];

  const acao = await interpretarComGroq(texto, ca, cr, ct);

  switch (acao.acao) {
    case 'lancar':
      if (!acao.valor || acao.valor <= 0) {
        await enviar('❌ Não consegui identificar o valor. Tente: "gastei 50 no café"');
        return;
      }
      if (!acao.conta || acao.conta === 'null') {
        await enviarBotoesContas(acao.tipo, acao.valor, acao.descricao || acao.tipo, acao.categoria, ca);
      } else {
        await execLancar(acao.tipo, acao.valor, acao.descricao || acao.tipo, acao.conta, ca, acao.categoria, ct);
      }
      break;

    case 'lancar_cartao': {
      if (!acao.valor || acao.valor <= 0) {
        await enviar('❌ Não consegui identificar o valor.');
        return;
      }
      const parcelas = acao.parcelas || 1;
      if (!acao.cartao || acao.cartao === 'null') {
        await enviarBotoesCartoes('despesa', acao.valor, acao.descricao || 'Compra', acao.categoria, null, parcelas, cr);
      } else {
        await execLancarCartao(acao.valor, acao.descricao || 'Compra', acao.cartao, acao.categoria, null, cr, ct, parcelas);
      }
      break;
    }

    case 'saldo':        await execSaldo();       break;
    case 'extrato':      await execExtrato();     break;
    case 'resumo':       await execResumo();      break;
    case 'agenda_hoje':  await execAgendaHoje();  break;
    case 'agenda_semana':await execAgendaSemana();break;
    case 'offshore':     await execOffshore();    break;
    case 'marcar_evento':
      if (!acao.titulo) { await enviar('❌ Não identifiquei o título do evento.'); return; }
      await execMarcarEvento(acao.titulo, acao.data, acao.hora, acao.tipo);
      break;
    case 'ajuda':   await execAjuda();   break;
    default:
      await enviar(acao.mensagem
        ? `❓ ${acao.mensagem}`
        : `❓ Não entendi. Tente: <i>"gastei 50 no café"</i> ou diga <code>ajuda</code>`
      );
  }
}

// ── Handler Vercel ────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  const WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET;

  if (req.method === 'GET' && req.query?.setup === '1') {
    // Registra o webhook; com TELEGRAM_WEBHOOK_SECRET setado, o Telegram passa
    // a enviar o header X-Telegram-Bot-Api-Secret-Token em cada update.
    let url = `https://api.telegram.org/bot${BOT_TOKEN}/setWebhook?url=${encodeURIComponent(`https://${req.headers.host}/api/telegram-webhook`)}`;
    if (WEBHOOK_SECRET) url += `&secret_token=${encodeURIComponent(WEBHOOK_SECRET)}`;
    const r = await fetch(url);
    return res.status(200).json(await r.json());
  }

  if (req.method !== 'POST') return res.status(200).json({ ok: true });

  // Valida o secret quando configurado — impede updates forjados por terceiros
  if (WEBHOOK_SECRET && req.headers['x-telegram-bot-api-secret-token'] !== WEBHOOK_SECRET) {
    return res.status(403).json({ ok: false });
  }

  const body = req.body || {};

  // Determinar chatId da requisição
  const incomingChatId = String(
    body.callback_query?.message?.chat?.id ||
    body.message?.chat?.id || ''
  );
  if (!incomingChatId) return res.status(200).json({ ok: true });

  // Resolver usuário dinamicamente
  USER_ID = await resolveUser(incomingChatId);
  CHAT_ID = incomingChatId;

  // Botão inline
  if (body.callback_query) {
    const cq = body.callback_query;
    if (!USER_ID) return res.status(200).json({ ok: true }); // ignora não vinculados
    try { await handleCallback(cq); } catch (e) {
      await enviar('⚠️ Erro: ' + e.message).catch(() => {});
    }
    return res.status(200).json({ ok: true });
  }

  const { message } = body;
  if (!message) return res.status(200).json({ ok: true });

  // Usuário não vinculado — só aceita /vincular CÓDIGO
  if (!USER_ID) {
    const txt = (message.text || '').trim();
    const codigoMatch = txt.match(/^(?:\/vincular\s+)?(FZ-\d{6})$/i);
    if (codigoMatch) {
      await vincularBot(incomingChatId, codigoMatch[1].toUpperCase());
    } else {
      await enviarPara(incomingChatId,
        '👋 Olá! Para usar o FinZen aqui, vincule sua conta:\n\n' +
        '1. Acesse <b>finzen-rho.vercel.app</b>\n' +
        '2. Vá em <b>Perfil → Telegram</b>\n' +
        '3. Clique em <b>Gerar código de vinculação</b>\n' +
        '4. Envie o código aqui (ex: <code>FZ-482916</code>)'
      );
    }
    return res.status(200).json({ ok: true });
  }

  try {
    // Foto / comprovante
    if (message.photo) {
      await enviar('📸 <i>Analisando comprovante...</i>');
      const fileId = message.photo[message.photo.length - 1].file_id;
      const result = await analisarComprovante(fileId);

      if (!result || !result.valor) {
        await enviar('❌ Não consegui ler o valor no comprovante. Tente tirar uma foto mais nítida.');
        return res.status(200).json({ ok: true });
      }

      // Sanitizar ano extraído pela IA — "14:25" pode ser lido como "2025"
      if (result.data) {
        const anoExtraido = parseInt(result.data.split('-')[0], 10);
        if (anoExtraido !== new Date().getFullYear()) {
          result.data = hoje();
        }
      }

      const [contas, cartoes] = await Promise.all([
        sbGet('accounts',    'active=eq.true&order=sort_order.asc,nome.asc'),
        sbGet('credit_cards','ativo=eq.true&order=sort_order.asc,nome.asc'),
      ]);

      await enviarBotoesContasECartoes(
        'despesa', result.valor, result.descricao || 'Compra',
        result.categoria, result.data,
        Array.isArray(contas)  ? contas  : [],
        Array.isArray(cartoes) ? cartoes : []
      );
      return res.status(200).json({ ok: true });
    }

    // Voz
    let texto = '';
    if (message.voice) {
      await enviar('🎙️ <i>Transcrevendo áudio...</i>');
      texto = await transcreverVoz(message.voice.file_id);
      if (!texto) { await enviar('❌ Não consegui entender o áudio.'); return res.status(200).json({ ok: true }); }
      await enviar(`📝 <i>Entendi: "${texto}"</i>`);
    } else {
      texto = (message.text || '').trim();
      // Aceitar código de vinculação mesmo estando já vinculado (por engano)
      if (/^FZ-\d{6}$/i.test(texto)) {
        await enviar('✅ Você já está vinculado ao FinZen. Nenhuma ação necessária.');
        return res.status(200).json({ ok: true });
      }
    }

    if (texto) await processar(texto);

  } catch (e) {
    await enviar('⚠️ Erro: ' + e.message).catch(() => {});
  }

  res.status(200).json({ ok: true });
}
