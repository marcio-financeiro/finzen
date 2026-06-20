// api/telegram-webhook.js — FinZen Assessor Telegram (voz + linguagem natural)
// Setup: GET /api/telegram-webhook?setup=1

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID   = process.env.TELEGRAM_CHAT_ID;
const SB_URL    = process.env.SUPABASE_URL;
const SB_KEY    = process.env.SUPABASE_SERVICE_KEY;
const USER_ID   = process.env.FINZEN_USER_ID;

// ── Supabase REST ────────────────────────────────────────────────────────────
const sbHeaders = {
  apikey: SB_KEY,
  Authorization: `Bearer ${SB_KEY}`,
  'Content-Type': 'application/json',
};

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
async function enviar(texto) {
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: CHAT_ID, text: texto, parse_mode: 'HTML' }),
  });
}

// Callback data: tx|{t}|{valor}|{desc12}|{cat10}|{nomeConta}
async function enviarBotoesContas(tipo, valor, descricao, categoriaNome, contas) {
  const emoji  = tipo === 'receita' ? '💰' : '💸';
  const desc12 = descricao.slice(0, 12);
  const cat10  = (categoriaNome || '').slice(0, 10);

  const linhas = [];
  for (let i = 0; i < contas.length; i += 2) {
    const linha = [];
    for (let j = i; j < Math.min(i + 2, contas.length); j++) {
      linha.push({
        text: contas[j].nome,
        callback_data: `tx|${tipo[0]}|${valor}|${desc12}|${cat10}|${contas[j].nome}`,
      });
    }
    linhas.push(linha);
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

async function responderCallback(callbackQueryId) {
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/answerCallbackQuery`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ callback_query_id: callbackQueryId }),
  });
}

// ── Groq Whisper — transcrição de voz ───────────────────────────────────────
async function transcreverVoz(fileId) {
  const infoRes = await fetch(
    `https://api.telegram.org/bot${BOT_TOKEN}/getFile?file_id=${fileId}`
  );
  const { result } = await infoRes.json();
  const audioUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${result.file_path}`;

  const audioRes  = await fetch(audioUrl);
  const audioBlob = await audioRes.blob();

  const form = new FormData();
  form.append('file', audioBlob, 'voice.ogg');
  form.append('model', 'whisper-large-v3');
  form.append('language', 'pt');

  const whisperRes = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
    body: form,
  });

  const { text, error } = await whisperRes.json();
  if (error) throw new Error('Whisper: ' + error.message);
  return text || '';
}

// ── Groq Llama — interpretação + categorização ───────────────────────────────
async function interpretarComGroq(texto, contas, categorias) {
  const nomesContas = contas.map(c => c.nome).join(', ');

  const catsDespesa  = categorias.filter(c => c.tipo === 'despesa').map(c => c.nome).join(', ');
  const catsReceita  = categorias.filter(c => c.tipo === 'receita').map(c => c.nome).join(', ');

  const prompt = `Você é o assistente financeiro do FinZen. Interprete o comando em português e retorne APENAS um JSON válido, sem markdown nem texto extra.

Contas disponíveis: ${nomesContas}
Categorias de despesa: ${catsDespesa}
Categorias de receita: ${catsReceita}

Formatos de resposta:
{"acao":"lancar","tipo":"despesa","valor":NUMBER,"descricao":"STRING","conta":"NOME_EXATO_OU_NULL","categoria":"NOME_EXATO_OU_NULL"}
{"acao":"lancar","tipo":"receita","valor":NUMBER,"descricao":"STRING","conta":"NOME_EXATO_OU_NULL","categoria":"NOME_EXATO_OU_NULL"}
{"acao":"saldo"}
{"acao":"extrato"}
{"acao":"resumo"}
{"acao":"ajuda"}
{"acao":"desconhecido","mensagem":"STRING"}

Regras:
- "conta": nome exato se o usuário mencionar; null se NÃO mencionar
- "categoria": escolha a categoria mais adequada com base na descrição; null se não souber
- Valores por extenso: "cinquenta"=50, "cem"=100, "duzentos"=200, "mil"=1000
- despesa: gastei, paguei, comprei, saiu, débito
- receita: recebi, entrou, salário, renda, crédito

Exemplos de categorização:
- restaurante, almoço, jantar, café, mercado → Alimentação
- uber, táxi, gasolina, posto → Transporte
- farmácia, médico, plano de saúde → Saúde
- netflix, spotify, amazon → Assinaturas
- salário, holerite → Salário
- freelance, bico → Renda Extra

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

function hoje() {
  return new Date().toISOString().split('T')[0];
}

function normStr(s) {
  return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/^@/, '').trim();
}

function buscarCategoria(nome, lista) {
  if (!nome || nome === 'null') return null;
  return lista.find(c => normStr(c.nome) === normStr(nome))
      || lista.find(c => normStr(c.nome).includes(normStr(nome)))
      || null;
}

// ── Executores de ação ────────────────────────────────────────────────────────
async function execSaldo() {
  const contas = await sbGet('accounts', 'active=eq.true&order=sort_order.asc,nome.asc');
  if (!Array.isArray(contas) || !contas.length) { await enviar('Nenhuma conta ativa.'); return; }
  const total = contas.reduce((s, a) => s + Number(a.saldo_atual || 0), 0);
  const lista = contas.map(a => `🏦 ${a.nome}: <b>R$ ${fmt(a.saldo_atual)}</b>`).join('\n');
  await enviar(`💳 <b>Saldos</b>\n\n${lista}\n\n💰 Total: <b>R$ ${fmt(total)}</b>`);
}

async function execExtrato() {
  const txs = await sbGet('transactions', 'order=date.desc,created_at.desc&limit=10');
  if (!Array.isArray(txs) || !txs.length) { await enviar('Nenhuma movimentação encontrada.'); return; }
  const lista = txs.map(t => {
    const emoji = t.type === 'receita' ? '💰' : '💸';
    return `${emoji} ${t.date} — ${t.description} — <b>R$ ${fmt(t.amount)}</b>`;
  }).join('\n');
  await enviar(`📋 <b>Extrato recente</b>\n\n${lista}`);
}

async function execResumo() {
  const agora   = new Date();
  const ano     = agora.getFullYear();
  const mesNum  = agora.getMonth() + 1;
  const mesLabel= `${ano}-${String(mesNum).padStart(2, '0')}`;
  const inicio  = `${mesLabel}-01`;
  const proxMes = mesNum === 12 ? 1 : mesNum + 1;
  const proxAno = mesNum === 12 ? ano + 1 : ano;
  const proximo = `${proxAno}-${String(proxMes).padStart(2, '0')}-01`;

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
  // Resolver conta
  const conta = todasContas.find(c => normStr(c.nome) === normStr(nomeConta))
             || todasContas.find(c => normStr(c.nome).includes(normStr(nomeConta)))
             || todasContas.find(c => c.sort_order >= 1)
             || todasContas[0];

  // Resolver categoria
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

async function execAjuda() {
  await enviar(
    `🤖 <b>FinZen · Assessor</b>\n\n` +
    `Fale naturalmente ou use comandos:\n\n` +
    `🎙️ <i>"gastei cinquenta no almoço no nubank"</i>\n` +
    `🎙️ <i>"recebi meu salário de três mil"</i>\n` +
    `🎙️ <i>"quanto tenho na conta"</i>\n\n` +
    `<b>Comandos rápidos:</b>\n` +
    `  <code>saldo</code> · <code>extrato</code> · <code>resumo</code>\n` +
    `  <code>d 50 café @nubank</code>\n` +
    `  <code>r 1000 salário @itau</code>`
  );
}

// ── Callback de botões inline ─────────────────────────────────────────────────
async function handleCallback(callbackQuery) {
  await responderCallback(callbackQuery.id);

  const data = callbackQuery.data || '';
  if (!data.startsWith('tx|')) return;

  // formato: tx|{t}|{valor}|{desc12}|{cat10}|{nomeConta}
  const partes        = data.split('|');
  const tipoChar      = partes[1];
  const valor         = parseFloat(partes[2]);
  const descricao     = partes[3];
  const categoriaNome = partes[4];
  const nomeConta     = partes.slice(5).join('|');

  const tipo = tipoChar === 'r' ? 'receita' : 'despesa';

  const [contas, categorias] = await Promise.all([
    sbGet('accounts',   'active=eq.true&order=sort_order.asc,nome.asc'),
    sbGet('categories', 'order=nome.asc'),
  ]);

  await execLancar(
    tipo, valor, descricao, nomeConta,
    Array.isArray(contas) ? contas : [],
    categoriaNome,
    Array.isArray(categorias) ? categorias : []
  );
}

// ── Processador principal ────────────────────────────────────────────────────
async function processar(texto) {
  const t = texto.toLowerCase().trim();

  // Comandos diretos — sem IA
  if (t === 'saldo' || t === 'quanto tenho' || t === 'contas')   return execSaldo();
  if (t === 'extrato' || t === 'historico' || t === 'histórico') return execExtrato();
  if (t === 'resumo' || t === 'resumo do mes' || t === 'resumo do mês') return execResumo();
  if (t === 'ajuda' || t === 'help' || t === '/start' || t === '/help') return execAjuda();

  const [contas, categorias] = await Promise.all([
    sbGet('accounts',   'active=eq.true&order=sort_order.asc,nome.asc'),
    sbGet('categories', 'order=nome.asc'),
  ]);
  const contasValidas     = Array.isArray(contas)     ? contas     : [];
  const categoriasValidas = Array.isArray(categorias) ? categorias : [];

  const acao = await interpretarComGroq(texto, contasValidas, categoriasValidas);

  switch (acao.acao) {
    case 'lancar':
      if (!acao.valor || acao.valor <= 0) {
        await enviar('❌ Não consegui identificar o valor. Tente: "gastei 50 no café"');
        return;
      }
      if (!acao.conta || acao.conta === 'null') {
        await enviarBotoesContas(acao.tipo, acao.valor, acao.descricao || acao.tipo, acao.categoria, contasValidas);
      } else {
        await execLancar(
          acao.tipo, acao.valor, acao.descricao || acao.tipo, acao.conta,
          contasValidas, acao.categoria, categoriasValidas
        );
      }
      break;
    case 'saldo':   await execSaldo();   break;
    case 'extrato': await execExtrato(); break;
    case 'resumo':  await execResumo();  break;
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
  if (req.method === 'GET' && req.query?.setup === '1') {
    const url = `https://${req.headers.host}/api/telegram-webhook`;
    const r   = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/setWebhook?url=${url}`);
    return res.status(200).json(await r.json());
  }

  if (req.method !== 'POST') return res.status(200).json({ ok: true });

  const body = req.body || {};

  if (body.callback_query) {
    const cq = body.callback_query;
    if (String(cq.message?.chat?.id) === String(CHAT_ID)) {
      try { await handleCallback(cq); } catch (e) {
        await enviar('⚠️ Erro: ' + e.message).catch(() => {});
      }
    }
    return res.status(200).json({ ok: true });
  }

  const { message } = body;
  if (!message || String(message.chat?.id) !== String(CHAT_ID)) {
    return res.status(200).json({ ok: true });
  }

  try {
    let texto = '';

    if (message.voice) {
      await enviar('🎙️ <i>Transcrevendo áudio...</i>');
      texto = await transcreverVoz(message.voice.file_id);
      if (!texto) { await enviar('❌ Não consegui entender o áudio. Tente novamente.'); return; }
      await enviar(`📝 <i>Entendi: "${texto}"</i>`);
    } else {
      texto = (message.text || '').trim();
    }

    if (texto) await processar(texto);

  } catch (e) {
    await enviar('⚠️ Erro: ' + e.message).catch(() => {});
  }

  res.status(200).json({ ok: true });
}
