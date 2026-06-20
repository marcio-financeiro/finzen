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

// ── Groq Whisper — transcrição de voz ───────────────────────────────────────
async function transcreverVoz(fileId) {
  // 1. Pegar URL do arquivo no Telegram
  const infoRes = await fetch(
    `https://api.telegram.org/bot${BOT_TOKEN}/getFile?file_id=${fileId}`
  );
  const { result } = await infoRes.json();
  const audioUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${result.file_path}`;

  // 2. Baixar o áudio
  const audioRes  = await fetch(audioUrl);
  const audioBlob = await audioRes.blob();

  // 3. Enviar ao Groq Whisper (gratuito)
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

// ── Groq Llama — interpretação de linguagem natural (gratuito) ──────────────
async function interpretarComClaude(texto, contas) {
  const nomesContas = contas.map(c => c.nome).join(', ');
  const contaPadrao = contas.find(c => c.sort_order >= 1)?.nome || contas[0]?.nome || 'Itaú';

  const prompt = `Você é o assistente financeiro do FinZen. Interprete o comando em português e retorne APENAS um JSON válido, sem markdown nem texto extra.

Contas disponíveis: ${nomesContas}
Conta padrão (quando não especificada): ${contaPadrao}

Formatos de resposta:
{"acao":"lancar","tipo":"despesa","valor":NUMBER,"descricao":"STRING","conta":"NOME_EXATO"}
{"acao":"lancar","tipo":"receita","valor":NUMBER,"descricao":"STRING","conta":"NOME_EXATO"}
{"acao":"saldo"}
{"acao":"extrato"}
{"acao":"resumo"}
{"acao":"ajuda"}
{"acao":"desconhecido","mensagem":"STRING"}

Regras:
- "conta" deve ser exatamente um dos nomes disponíveis acima
- Se não mencionar conta, use ${contaPadrao}
- Valores por extenso: "cinquenta"=50, "cem"=100, "duzentos"=200, "mil"=1000
- despesa: gastei, paguei, comprei, saiu, débito
- receita: recebi, entrou, salário, renda, crédito
- saldo: saldo, quanto tenho, minhas contas
- extrato: extrato, últimas, histórico, movimentações
- resumo: resumo, mês, resultado

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

  // Groq retornou erro de API
  if (data.error) throw new Error('Groq: ' + (data.error.message || JSON.stringify(data.error)));

  const content = data.choices?.[0]?.message?.content?.trim() || '';
  if (!content) throw new Error('Groq retornou resposta vazia');

  // Extrair JSON mesmo se vier dentro de ```json ... ```
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

async function execLancar(tipo, valor, descricao, nomeConta, todasContas) {
  // Buscar conta por nome (ignora acentos, maiúsculas e @)
  const norm = s => (s || '').replace(/^@/, '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const conta = todasContas.find(c => norm(c.nome) === norm(nomeConta))
             || todasContas.find(c => norm(c.nome).includes(norm(nomeConta)))
             || todasContas.find(c => c.sort_order >= 1)
             || todasContas[0];

  await sbPost('transactions', {
    user_id: USER_ID, account_id: conta.id,
    type: tipo, amount: valor, description: descricao,
    date: hoje(), status: 'pago',
  });

  const novoSaldo = Number(conta.saldo_atual || 0) + (tipo === 'receita' ? valor : -valor);
  await sbPatch('accounts', conta.id, { saldo_atual: novoSaldo });

  const emoji = tipo === 'receita' ? '💰' : '💸';
  const sinal = tipo === 'receita' ? '+' : '-';
  await enviar(
    `${emoji} <b>Lançado!</b>\n\n` +
    `📝 ${descricao}\n` +
    `💵 R$ ${sinal}${fmt(valor)}\n` +
    `🏦 ${conta.nome}\n` +
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

// ── Processador principal ────────────────────────────────────────────────────
async function processar(texto) {
  const t = texto.toLowerCase().trim();

  // Comandos diretos — sem precisar de IA
  if (t === 'saldo' || t === 'quanto tenho' || t === 'contas')  return execSaldo();
  if (t === 'extrato' || t === 'historico' || t === 'histórico') return execExtrato();
  if (t === 'resumo' || t === 'resumo do mes' || t === 'resumo do mês') return execResumo();
  if (t === 'ajuda' || t === 'help' || t === '/start' || t === '/help') return execAjuda();

  // Carregar contas para IA e para lançamentos
  const contas = await sbGet('accounts', 'active=eq.true&order=sort_order.asc,nome.asc');
  const contasValidas = Array.isArray(contas) ? contas : [];

  // Interpretar com Groq
  const acao = await interpretarComClaude(texto, contasValidas);

  switch (acao.acao) {
    case 'lancar':
      if (!acao.valor || acao.valor <= 0) {
        await enviar('❌ Não consegui identificar o valor. Tente: "gastei 50 no café"');
        return;
      }
      await execLancar(acao.tipo, acao.valor, acao.descricao || acao.tipo, acao.conta, contasValidas);
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
  // Registrar webhook
  if (req.method === 'GET' && req.query?.setup === '1') {
    const url = `https://${req.headers.host}/api/telegram-webhook`;
    const r   = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/setWebhook?url=${url}`);
    return res.status(200).json(await r.json());
  }

  if (req.method !== 'POST') return res.status(200).json({ ok: true });

  const { message } = req.body || {};
  if (!message || String(message.chat?.id) !== String(CHAT_ID)) {
    return res.status(200).json({ ok: true });
  }

  try {
    let texto = '';

    if (message.voice) {
      // Mensagem de voz → Whisper → texto
      await enviar('🎙️ <i>Transcrevendo áudio...</i>');
      texto = await transcreverVoz(message.voice.file_id);
      if (!texto) { await enviar('❌ Não consegui entender o áudio. Tente novamente.'); }
      else { await enviar(`📝 <i>Entendi: "${texto}"</i>`); }
    } else {
      texto = (message.text || '').trim();
    }

    if (texto) await processar(texto);

  } catch (e) {
    await enviar('⚠️ Erro: ' + e.message).catch(() => {});
  }

  res.status(200).json({ ok: true });
}
