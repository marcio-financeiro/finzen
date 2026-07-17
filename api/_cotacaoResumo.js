// api/_cotacaoResumo.js — lógica compartilhada de resumo de carteira.
// Usado por api/cotacao-cron.js (broadcast diário automático) e pelo comando
// "fechamento" do bot interativo (api/telegram-webhook.js), sob demanda.
// Prefixo _ : não vira rota HTTP na Vercel.

export const TIPOS_BR  = ['acao_br', 'fii', 'etf_br'];
export const TIPOS_EUA = ['acao_eua', 'etf_eua'];
export function isBR(tipo)  { return TIPOS_BR.includes(tipo); }
export function isEUA(tipo) { return TIPOS_EUA.includes(tipo); }

export function fmt(v, dec = 2) {
  return Number(v).toLocaleString('pt-BR', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

export function varEmoji(pct) {
  if (pct > 0.05)  return '📈';
  if (pct < -0.05) return '📉';
  return '➡️';
}

/** Busca cotações via o proxy /api/quotes (BR + EUA + dólar em uma chamada). */
export async function buscarCotacoes(vercelUrl, tickers) {
  const params = new URLSearchParams({ tickers: tickers.join(','), dolar: 'true', change: 'true' });
  const r = await fetch(`${vercelUrl}/api/quotes?${params}`, {
    headers: { 'User-Agent': 'FinZen-Cotacoes/1.0' },
  });
  if (!r.ok) throw new Error(`Proxy cotações ${r.status}`);
  return r.json();
}

/**
 * Monta o texto do resumo de carteira (agrupado por corretora, com o
 * ganho/perda do dia separado em Nacional vs EUA). Não faz nenhum efeito
 * colateral (sem gravar no banco, sem enviar mensagem) — só formata.
 */
export function montarResumoCarteira({ ativos, quotes, dolar, dataFmt }) {
  const grupos = {};
  let deltaBR = 0, deltaEUA = 0;
  let deltaValidoBR = true, deltaValidoEUA = true;
  let temBR = false, temEUA = false;
  const semCotacao = [];

  for (const a of ativos) {
    const key = a.ticker.toUpperCase();
    if (isEUA(a.tipo)) temEUA = true; else temBR = true;

    const novaCotacao = quotes[key];
    if (!novaCotacao) { semCotacao.push(key); continue; }

    const changePct = quotes[`${key}_chg`] ?? null;
    const moeda     = a.moeda || 'BRL';
    const fx        = moeda === 'USD' ? (dolar || 1) : 1;
    const qtd       = Number(a.quantidade);

    if (changePct !== null && dolar > 0) {
      const delta = (changePct / 100) * novaCotacao * qtd * fx;
      if (isEUA(a.tipo)) deltaEUA += delta; else deltaBR += delta;
    } else {
      if (isEUA(a.tipo)) deltaValidoEUA = false; else deltaValidoBR = false;
    }

    const corretora = a.corretora || 'Outros';
    if (!grupos[corretora]) grupos[corretora] = [];
    grupos[corretora].push({ ticker: key, cotacao: novaCotacao, moeda, changePct });
  }

  const linhas = [`📊 <b>Carteira — ${dataFmt}</b>`];
  if (dolar > 0) linhas.push(`💵 USD/BRL: R$ ${fmt(dolar, 4)}`);
  linhas.push('');

  for (const corretora of Object.keys(grupos).sort()) {
    linhas.push(`<b>${corretora}</b>`);
    for (const a of grupos[corretora].sort((x, y) => x.ticker.localeCompare(y.ticker))) {
      const simbolo = a.moeda === 'USD' ? 'US$' : 'R$';
      const cotStr  = `${simbolo} ${fmt(a.cotacao)}`;
      const varStr  = a.changePct !== null
        ? `${varEmoji(a.changePct)} ${a.changePct >= 0 ? '+' : ''}${fmt(a.changePct)}%`
        : '➡️ —';
      linhas.push(`• ${a.ticker}  ${cotStr}  ${varStr}`);
    }
    linhas.push('');
  }

  const linhaDelta = (label, delta) => {
    const sinal = delta >= 0 ? '+' : '';
    const emoji = delta > 0 ? '📈' : delta < 0 ? '📉' : '➡️';
    return `${emoji} <b>Hoje ${label}: ${sinal}R$ ${fmt(Math.abs(delta))}</b>`;
  };
  if (deltaValidoBR && temBR)   linhas.push(linhaDelta('Nacional', deltaBR));
  if (deltaValidoEUA && temEUA) linhas.push(linhaDelta('EUA', deltaEUA));

  // Avisa quais ativos ficaram sem cotação hoje (falha momentânea da API de
  // cotações) em vez de eles simplesmente sumirem da lista sem explicação
  if (semCotacao.length) {
    linhas.push('');
    linhas.push(`⚠️ Sem cotação hoje: ${semCotacao.join(', ')}`);
  }

  return { texto: linhas.join('\n').trim(), semCotacao, deltaBR, deltaEUA };
}
