// api/telegram-webhook.js — FinZen Assessor Telegram
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

// Botões de cartões: cc|{t}|{valor}|{desc10}|{cat10}|{data}|{cartao10}
async function enviarBotoesCartoes(tipo, valor, descricao, categoriaNome, dataCompra, cartoes) {
  const emoji  = tipo === 'receita' ? '💰' : '💸';
  const data   = dataCompra || 'ndt';
  const linhas = [];
  for (let i = 0; i < cartoes.length; i += 2) {
    const row = [];
    for (let j = i; j < Math.min(i + 2, cartoes.length); j++) {
      row.push({
        text: '💳 ' + cartoes[j].nome,
        callback_data: `cc|${tipo[0]}|${valor}|${descricao.slice(0,10)}|${(categoriaNome||'').slice(0,10)}|${data}|${cartoes[j].nome.slice(0,10)}`,
      });
    }
    linhas.push(row);
  }
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: CHAT_ID,
      text: `${emoji} <b>R$ ${fmt(valor)} — ${descricao}</b>${categoriaNome ? `\n🏷️ ${categoriaNome}` : ''}\n\nQual cartão?`,
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

  // Cartões de crédito
  for (let i = 0; i < cartoes.length; i += 2) {
    const row = [];
    for (let j = i; j < Math.min(i + 2, cartoes.length); j++) {
      row.push({
        text: '💳 ' + cartoes[j].nome,
        callback_data: `cc|${tipo[0]}|${valor}|${descricao.slice(0,10)}|${(categoriaNome||'').slice(0,10)}|${data}|${cartoes[j].nome.slice(0,10)}`,
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

Contas bancárias: ${nomesContas}
Cartões de crédito: ${nomesCartoes}
Categorias de despesa: ${catsDespesa}
Categorias de receita: ${catsReceita}

Formatos de resposta:
{"acao":"lancar","tipo":"despesa","valor":NUMBER,"descricao":"STRING","conta":"NOME_OU_NULL","categoria":"NOME_OU_NULL"}
{"acao":"lancar","tipo":"receita","valor":NUMBER,"descricao":"STRING","conta":"NOME_OU_NULL","categoria":"NOME_OU_NULL"}
{"acao":"lancar_cartao","tipo":"despesa","valor":NUMBER,"descricao":"STRING","cartao":"NOME_OU_NULL","categoria":"NOME_OU_NULL"}
{"acao":"saldo"}
{"acao":"extrato"}
{"acao":"resumo"}
{"acao":"ajuda"}
{"acao":"desconhecido","mensagem":"STRING"}

Regras:
- Use lancar_cartao quando o usuário disser "cartão", "crédito", ou o nome de um cartão
- "conta"/"cartao": nome exato se mencionado; null se não especificado
- Valores por extenso: "cinquenta"=50, "cem"=100, "mil"=1000
- despesa: gastei, paguei, comprei, saiu
- receita: recebi, entrou, salário, renda

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

function calcFaturaRef(dataCompra, fechamentoDia) {
  const d = dataCompra ? new Date(dataCompra + 'T12:00:00') : new Date();
  const ref = d.getDate() > fechamentoDia
    ? new Date(d.getFullYear(), d.getMonth() + 1, 1)
    : new Date(d.getFullYear(), d.getMonth(), 1);
  return `${ref.getFullYear()}-${String(ref.getMonth() + 1).padStart(2, '0')}`;
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
  const txs = await sbGet('transactions', 'order=date.desc,created_at.desc&limit=10');
  if (!Array.isArray(txs) || !txs.length) { await enviar('Nenhuma movimentação encontrada.'); return; }
  const lista = txs.map(t => {
    const emoji = t.type === 'receita' ? '💰' : '💸';
    return `${emoji} ${t.date} — ${t.description} — <b>R$ ${fmt(t.amount)}</b>`;
  }).join('\n');
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

async function execLancarCartao(valor, descricao, nomeCartao, categoriaNome, dataCompra, todosCartoes, todasCategorias) {
  const cartao = todosCartoes.find(c => normStr(c.nome) === normStr(nomeCartao))
              || todosCartoes.find(c => normStr(c.nome).includes(normStr(nomeCartao)))
              || todosCartoes[0];
  const categoria = buscarCategoria(categoriaNome, todasCategorias);

  const dataStr    = (dataCompra && dataCompra !== 'ndt') ? dataCompra : hoje();
  const faturaRef  = calcFaturaRef(dataStr, cartao.fechamento_dia);

  const payload = {
    user_id: USER_ID, card_id: cartao.id,
    descricao, valor_total: valor,
    parcelas: 1, parcela_atual: 1, valor_parcela: valor,
    data_compra: dataStr, fatura_referencia: faturaRef, status: 'pendente',
  };
  if (categoria) payload.category_id = categoria.id;

  await sbPost('card_transactions', payload);

  await enviar(
    `💳 <b>Lançado no cartão!</b>\n\n` +
    `📝 ${descricao}\n` +
    `💵 R$ -${fmt(valor)}\n` +
    `💳 ${cartao.nome}\n` +
    (categoria ? `🏷️ ${categoria.nome}\n` : '') +
    `📅 Fatura: ${faturaRef}`
  );
}

async function execAjuda() {
  await enviar(
    `🤖 <b>FinZen · Assessor</b>\n\n` +
    `Fale naturalmente, mande voz ou comprovante:\n\n` +
    `🎙️ <i>"gastei 80 no almoço no itaú"</i>\n` +
    `🎙️ <i>"comprei 150 na amazon no cartão nubank"</i>\n` +
    `📸 <i>envie foto do comprovante</i>\n\n` +
    `<b>Comandos:</b>\n` +
    `  <code>saldo</code> · <code>extrato</code> · <code>resumo</code> · <code>ajuda</code>`
  );
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
    // cc|{t}|{valor}|{desc10}|{cat10}|{data}|{cartao10}
    const p = data.split('|');
    const valor = parseFloat(p[2]);
    const dataCompra = p[5] !== 'ndt' ? p[5] : null;
    await execLancarCartao(valor, p[3], p[6], p[4], dataCompra, cr, ct);
  }
}

// ── Processador principal ────────────────────────────────────────────────────
async function processar(texto) {
  const t = texto.toLowerCase().trim();

  if (t === 'saldo' || t === 'quanto tenho' || t === 'contas')   return execSaldo();
  if (t === 'extrato' || t === 'historico' || t === 'histórico') return execExtrato();
  if (t === 'resumo' || t === 'resumo do mes' || t === 'resumo do mês') return execResumo();
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

    case 'lancar_cartao':
      if (!acao.valor || acao.valor <= 0) {
        await enviar('❌ Não consegui identificar o valor.');
        return;
      }
      if (!acao.cartao || acao.cartao === 'null') {
        await enviarBotoesCartoes('despesa', acao.valor, acao.descricao || 'Compra', acao.categoria, null, cr);
      } else {
        await execLancarCartao(acao.valor, acao.descricao || 'Compra', acao.cartao, acao.categoria, null, cr, ct);
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

  // Botão inline
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
    // Foto / comprovante
    if (message.photo) {
      await enviar('📸 <i>Analisando comprovante...</i>');
      const fileId  = message.photo[message.photo.length - 1].file_id; // maior resolução
      const result  = await analisarComprovante(fileId);

      if (!result || !result.valor) {
        await enviar('❌ Não consegui ler o valor no comprovante. Tente tirar uma foto mais nítida.');
        return res.status(200).json({ ok: true });
      }

      const [contas, cartoes, categorias] = await Promise.all([
        sbGet('accounts',    'active=eq.true&order=sort_order.asc,nome.asc'),
        sbGet('credit_cards','ativo=eq.true&order=sort_order.asc,nome.asc'),
        sbGet('categories',  'order=nome.asc'),
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
      if (!texto) { await enviar('❌ Não consegui entender o áudio. Tente novamente.'); return res.status(200).json({ ok: true }); }
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
