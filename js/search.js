import { supabase } from './supabaseClient.js';
import { navigate } from './router.js';
import { formatCurrency } from './utils.js';
import { escapeHtml } from './utils/escapeHtml.js';

const { data: sessionData } = await supabase.auth.getSession();
if(!sessionData.session){ navigate('../login.html'); throw new Error('unauthenticated'); }
const user = sessionData.session.user;

const searchInput = document.getElementById('searchInput');
const results     = document.getElementById('results');

function formatDate(iso){
  if(!iso) return '-';
  const [y,m,d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function badge(texto, classe='neutral'){
  return `<span class="badge ${classe}" style="font-size:10px">${texto}</span>`;
}

let debounce;
searchInput.addEventListener('input', () => {
  clearTimeout(debounce);
  debounce = setTimeout(buscar, 280);
});

async function buscar(){
  const termo = searchInput.value.trim().toLowerCase();

  if(termo.length < 2){
    results.innerHTML = '<p class="muted" style="padding:16px">Digite pelo menos 2 caracteres para buscar.</p>';
    return;
  }

  results.innerHTML = '<p class="muted" style="padding:16px">Buscando...</p>';

  // Buscar em paralelo em todas as fontes
  const [
    { data: transactions },
    { data: cardTx },
    { data: transfers },
    { data: dividends },
    { data: investments },
    { data: accounts },
    { data: categories },
  ] = await Promise.all([
    supabase.from('transactions')
      .select('id,type,amount,description,date,status,categories:category_id(nome,icon),accounts:account_id(nome,currency)')
      .eq('user_id', user.id)
      .ilike('description', `%${termo}%`)
      .order('date', { ascending: false })
      .limit(30),

    supabase.from('card_transactions')
      .select('id,descricao,valor_total,valor_parcela,parcelas,parcela_atual,fatura_referencia,status,categories:category_id(nome,icon),credit_cards:card_id(nome)')
      .eq('user_id', user.id)
      .ilike('descricao', `%${termo}%`)
      .order('fatura_referencia', { ascending: false })
      .limit(30),

    supabase.from('account_transfers')
      .select('id,amount,description,transfer_date,accounts_from:from_account_id(nome),accounts_to:to_account_id(nome)')
      .eq('user_id', user.id)
      .ilike('description', `%${termo}%`)
      .order('transfer_date', { ascending: false })
      .limit(20),

    supabase.from('investment_transactions')
      .select('id,tipo,valor_total,data_movimento,observacao,investments:investment_id(ticker,nome)')
      .eq('user_id', user.id)
      .in('tipo', ['dividendo','jcp','rendimento_fii'])
      .or(`observacao.ilike.%${termo}%`)
      .order('data_movimento', { ascending: false })
      .limit(20),

    supabase.from('investments')
      .select('id,ticker,nome,tipo,quantidade,cotacao_atual')
      .eq('user_id', user.id)
      .eq('ativo', true)
      .or(`ticker.ilike.%${termo}%,nome.ilike.%${termo}%`),

    supabase.from('accounts')
      .select('id,nome,currency,saldo_atual')
      .eq('user_id', user.id)
      .ilike('nome', `%${termo}%`),

    supabase.from('categories')
      .select('id,nome,tipo,icon')
      .eq('user_id', user.id)
      .ilike('nome', `%${termo}%`),
  ]);

  let html = '';
  let total = 0;

  // ── Transações ──────────────────────────────
  if(transactions?.length){
    total += transactions.length;
    html += `<div class="panel" style="margin-bottom:12px">
      <div class="panel-header"><h2><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;margin-right:5px"><path d="M7 3v14M7 17l-3-3M7 17l3-3"/><path d="M17 21V7M17 7l3 3M17 7l-3 3"/></svg>Movimentações <span class="muted" style="font-size:13px;font-weight:400">(${transactions.length})</span></h2></div>
      <div class="table-wrap"><table class="data-table"><thead><tr>
        <th>Data</th><th>Tipo</th><th>Descrição</th><th>Conta</th><th>Categoria</th><th>Status</th><th style="text-align:right">Valor</th>
      </tr></thead><tbody>`;
    transactions.forEach(t => {
      const currency = t.accounts?.currency || 'BRL';
      html += `<tr>
        <td style="white-space:nowrap">${formatDate(t.date)}</td>
        <td>${badge(t.type, t.type==='receita'?'success':'danger')}</td>
        <td>${highlight(t.description, termo)}</td>
        <td>${escapeHtml(t.accounts?.nome)||'-'}</td>
        <td>${t.categories?.icon||''} ${escapeHtml(t.categories?.nome)||'-'}</td>
        <td>${badge(t.status||'-', t.status==='pago'?'success':'warning')}</td>
        <td class="money ${t.type==='receita'?'positive':'negative'}" style="text-align:right">
          ${t.type==='receita'?'+':'-'}${formatCurrency(t.amount||0, currency)}
        </td>
      </tr>`;
    });
    html += '</tbody></table></div></div>';
  }

  // ── Compras no Cartão ────────────────────────
  if(cardTx?.length){
    total += cardTx.length;
    html += `<div class="panel" style="margin-bottom:12px">
      <div class="panel-header"><h2><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;margin-right:5px"><rect x="2.5" y="6" width="19" height="13" rx="2.5"/><path d="M2.5 10.5h19"/></svg>Compras no Cartão <span class="muted" style="font-size:13px;font-weight:400">(${cardTx.length})</span></h2></div>
      <div class="table-wrap"><table class="data-table"><thead><tr>
        <th>Descrição</th><th>Cartão</th><th>Categoria</th><th>Fatura</th><th>Parcela</th><th style="text-align:right">Valor Parcela</th>
      </tr></thead><tbody>`;
    cardTx.forEach(c => {
      html += `<tr>
        <td>${highlight(c.descricao||'-', termo)}</td>
        <td>${escapeHtml(c.credit_cards?.nome)||'-'}</td>
        <td>${c.categories?.icon||''} ${escapeHtml(c.categories?.nome)||'-'}</td>
        <td>${c.fatura_referencia||'-'}</td>
        <td>${c.parcela_atual||1}/${c.parcelas||1}</td>
        <td class="money negative" style="text-align:right">-${formatCurrency(c.valor_parcela||0,'BRL')}</td>
      </tr>`;
    });
    html += '</tbody></table></div></div>';
  }

  // ── Transferências ───────────────────────────
  if(transfers?.length){
    total += transfers.length;
    html += `<div class="panel" style="margin-bottom:12px">
      <div class="panel-header"><h2><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;margin-right:5px"><path d="M4 4v6h6"/><path d="M4.5 13a8 8 0 1 0 2.5-6.5L4 10"/></svg>Transferências <span class="muted" style="font-size:13px;font-weight:400">(${transfers.length})</span></h2></div>
      <div class="table-wrap"><table class="data-table"><thead><tr>
        <th>Data</th><th>Descrição</th><th>Origem</th><th>Destino</th><th style="text-align:right">Valor</th>
      </tr></thead><tbody>`;
    transfers.forEach(t => {
      html += `<tr>
        <td style="white-space:nowrap">${formatDate(t.transfer_date)}</td>
        <td>${highlight(t.description||'-', termo)}</td>
        <td>${escapeHtml(t.accounts_from?.nome)||'-'}</td>
        <td>${escapeHtml(t.accounts_to?.nome)||'-'}</td>
        <td class="money" style="text-align:right">${formatCurrency(t.amount||0,'BRL')}</td>
      </tr>`;
    });
    html += '</tbody></table></div></div>';
  }

  // ── Dividendos ───────────────────────────────
  if(dividends?.length){
    total += dividends.length;
    html += `<div class="panel" style="margin-bottom:12px">
      <div class="panel-header"><h2><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;margin-right:5px"><circle cx="12" cy="12" r="9"/><path d="M9 15.5c.5 1 1.7 1.5 3 1.5 2 0 3.2-1 3.2-2.3 0-3-6-1.4-6-4.2 0-1.3 1.2-2.3 3-2.3 1.3 0 2.4.5 3 1.4"/><line x1="12" y1="6" x2="12" y2="8"/><line x1="12" y1="16" x2="12" y2="18"/></svg>Dividendos <span class="muted" style="font-size:13px;font-weight:400">(${dividends.length})</span></h2></div>
      <div class="table-wrap"><table class="data-table"><thead><tr>
        <th>Data</th><th>Ativo</th><th>Tipo</th><th>Observação</th><th style="text-align:right">Valor</th>
      </tr></thead><tbody>`;
    dividends.forEach(d => {
      html += `<tr>
        <td style="white-space:nowrap">${formatDate(d.data_movimento)}</td>
        <td><strong>${escapeHtml(d.investments?.ticker)||'-'}</strong></td>
        <td>${badge(d.tipo,'success')}</td>
        <td>${highlight(d.observacao||'-', termo)}</td>
        <td class="money positive" style="text-align:right">+${formatCurrency(d.valor_total||0,'BRL')}</td>
      </tr>`;
    });
    html += '</tbody></table></div></div>';
  }

  // ── Investimentos ────────────────────────────
  if(investments?.length){
    total += investments.length;
    html += `<div class="panel" style="margin-bottom:12px">
      <div class="panel-header"><h2><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;margin-right:5px"><polyline points="3,17 9,11 13,15 21,6"/><polyline points="15,6 21,6 21,12"/></svg>Ativos <span class="muted" style="font-size:13px;font-weight:400">(${investments.length})</span></h2></div>
      <div class="table-wrap"><table class="data-table"><thead><tr>
        <th>Ticker</th><th>Nome</th><th>Tipo</th><th style="text-align:right">Qtd</th><th style="text-align:right">Cotação</th>
      </tr></thead><tbody>`;
    investments.forEach(i => {
      html += `<tr>
        <td><strong>${highlight(i.ticker, termo)}</strong></td>
        <td>${highlight(i.nome||'-', termo)}</td>
        <td>${badge(i.tipo||'-')}</td>
        <td style="text-align:right">${Number(i.quantidade||0).toLocaleString('pt-BR',{maximumFractionDigits:4})}</td>
        <td class="money" style="text-align:right">${formatCurrency(i.cotacao_atual||0,'BRL')}</td>
      </tr>`;
    });
    html += '</tbody></table></div></div>';
  }

  // ── Contas ───────────────────────────────────
  if(accounts?.length){
    total += accounts.length;
    html += `<div class="panel" style="margin-bottom:12px">
      <div class="panel-header"><h2><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;margin-right:5px"><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M3 10h18"/><circle cx="16" cy="14.5" r="1.2" fill="currentColor" stroke="none"/></svg>Contas <span class="muted" style="font-size:13px;font-weight:400">(${accounts.length})</span></h2></div>
      <div class="table-wrap"><table class="data-table"><thead><tr>
        <th>Conta</th><th>Moeda</th><th style="text-align:right">Saldo</th>
      </tr></thead><tbody>`;
    accounts.forEach(a => {
      html += `<tr>
        <td>${highlight(a.nome, termo)}</td>
        <td>${a.currency||'BRL'}</td>
        <td class="money" style="text-align:right">${formatCurrency(a.saldo_atual||0, a.currency||'BRL')}</td>
      </tr>`;
    });
    html += '</tbody></table></div></div>';
  }

  // ── Categorias ───────────────────────────────
  if(categories?.length){
    total += categories.length;
    html += `<div class="panel" style="margin-bottom:12px">
      <div class="panel-header"><h2><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;margin-right:5px"><path d="M20.6 12L12 20.6a2 2 0 0 1-2.8 0l-7.8-7.8a2 2 0 0 1 0-2.8L9 1.4 20.6 12z"/><circle cx="7.5" cy="7.5" r="1.5" fill="currentColor" stroke="none"/></svg>Categorias <span class="muted" style="font-size:13px;font-weight:400">(${categories.length})</span></h2></div>
      <div class="table-wrap"><table class="data-table"><thead><tr>
        <th>Ícone</th><th>Nome</th><th>Tipo</th>
      </tr></thead><tbody>`;
    categories.forEach(c => {
      html += `<tr>
        <td>${c.icon||'-'}</td>
        <td>${highlight(c.nome, termo)}</td>
        <td>${badge(c.tipo||'-', c.tipo==='receita'?'success':c.tipo==='despesa'?'danger':'neutral')}</td>
      </tr>`;
    });
    html += '</tbody></table></div></div>';
  }

  if(!total){
    results.innerHTML = `<p class="muted" style="padding:24px;text-align:center">
      Nenhum resultado para "<strong>${escapeHtml(termo)}</strong>".
    </p>`;
    return;
  }

  results.innerHTML = `<p class="muted" style="padding:0 0 12px;font-size:13px">
    ${total} resultado(s) para "<strong>${escapeHtml(termo)}</strong>"
  </p>` + html;
}

function highlight(texto, termo){
  if(!texto || !termo) return escapeHtml(texto) || '';
  const safe = escapeHtml(String(texto));
  const re = new RegExp(`(${escapeHtml(termo).replace(/[.*+?^${}()|[\]\\]/g,'\\$&')})`, 'gi');
  return safe.replace(re, '<mark style="background:rgba(245,158,11,.3);border-radius:3px;padding:0 2px">$1</mark>');
}
