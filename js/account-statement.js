import { supabase } from './supabaseClient.js';
import { navigate } from './router.js';
import { formatCurrency } from './utils.js';
import { escapeHtml } from './utils/escapeHtml.js';
import { getUsdBrlRate, convertToBRL } from './services/financeService.js';

const { data: sessionData } = await supabase.auth.getSession();
if(!sessionData.session){ navigate('../login.html'); throw new Error('unauthenticated'); }
const user = sessionData.session.user;
document.getElementById('btnLogout').addEventListener('click', async ()=>{
  await supabase.auth.signOut(); navigate('../login.html');
});

const el = id => document.getElementById(id);

// Definir mês atual como padrão
const hoje = new Date();
el('filtroMes').value = `${hoje.getFullYear()}-${String(hoje.getMonth()+1).padStart(2,'0')}`;

let dolarAtual = 5.15;
let contasAtivas = [];

// Carregar contas
async function carregarContas(){
  const { data } = await supabase
    .from('accounts')
    .select('id,nome,currency,saldo_atual')
    .eq('user_id', user.id)
    .eq('active', true)
    .order('nome');

  contasAtivas = data || [];
  el('filtroConta').innerHTML = '<option value="">Todas as contas</option>' +
    contasAtivas.map(c => `<option value="${c.id}" data-saldo="${c.saldo_atual||0}" data-currency="${c.currency||'BRL'}">${escapeHtml(c.nome)}</option>`).join('');
}

function formatDate(iso){
  if(!iso) return '-';
  const [y,m,d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

async function carregarExtrato(){
  const contaId  = el('filtroConta').value;
  const mes      = el('filtroMes').value;
  const tipo     = el('filtroTipo').value;
  const status   = el('filtroStatus').value;

  // KPI saldo da conta selecionada
  if(contaId){
    const opt = el('filtroConta').options[el('filtroConta').selectedIndex];
    const saldo = parseFloat(opt.dataset.saldo || 0);
    const currency = opt.dataset.currency || 'BRL';
    el('kpiSaldo').innerText = formatCurrency(saldo, currency);
    el('kpiSaldo').className = saldo >= 0 ? 'positive' : 'negative';
  } else {
    const totalBRL = contasAtivas.reduce((sum,c) => sum+convertToBRL(c.saldo_atual, c.currency, dolarAtual), 0);
    el('kpiSaldo').innerText = formatCurrency(totalBRL, 'BRL');
    el('kpiSaldo').className = totalBRL >= 0 ? 'positive' : 'negative';
  }

  let query = supabase
    .from('transactions')
    .select(`
      id, type, amount, description, date, status,
      accounts:account_id(nome, currency),
      categories:category_id(nome, icon)
    `)
    .eq('user_id', user.id)
    .order('date', { ascending: false })
    .order('created_at', { ascending: false });

  if(contaId) query = query.eq('account_id', contaId);
  if(tipo)    query = query.eq('type', tipo);
  if(status)  query = query.eq('status', status);

  if(mes){
    const [ano, m] = mes.split('-');
    const inicio = `${ano}-${m}-01`;
    const fim    = new Date(Number(ano), Number(m), 0).toISOString().split('T')[0];
    query = query.gte('date', inicio).lte('date', fim);
    el('stmtPeriodo').innerText = new Date(Number(ano), Number(m)-1, 1)
      .toLocaleDateString('pt-BR', { month:'long', year:'numeric' });
  } else {
    el('stmtPeriodo').innerText = 'Todos os períodos';
  }

  const { data, error } = await query;

  if(error){
    el('stmtLista').innerHTML = '<p class="muted" style="padding:24px">Erro ao carregar extratos.</p>';
    return;
  }

  const lancamentos = data || [];

  const entradas = lancamentos.filter(l=>l.type==='receita').reduce((s,l)=>s+Number(l.amount||0),0);
  const saidas   = lancamentos.filter(l=>l.type==='despesa').reduce((s,l)=>s+Number(l.amount||0),0);
  const resultado = entradas - saidas;

  el('kpiEntradas').innerText = formatCurrency(entradas, 'BRL');
  el('kpiSaidas').innerText   = formatCurrency(saidas, 'BRL');
  el('kpiResultado').innerText = formatCurrency(resultado, 'BRL');
  el('kpiResultado').className = resultado >= 0 ? 'positive' : 'negative';
  el('kpiQtd').innerText = lancamentos.length;

  if(!lancamentos.length){
    el('stmtLista').innerHTML = '<p class="stmt-empty">Nenhum lançamento encontrado para os filtros selecionados.</p>';
    return;
  }

  el('stmtLista').innerHTML = `
    <table class="data-table">
      <thead>
        <tr>
          <th>Data</th>
          <th>Descrição</th>
          <th>Conta</th>
          <th>Categoria</th>
          <th>Status</th>
          <th style="text-align:right">Valor</th>
        </tr>
      </thead>
      <tbody>
        ${lancamentos.map(l => {
          const currency = l.accounts?.currency || 'BRL';
          const valor = Number(l.amount || 0);
          return `
            <tr>
              <td style="white-space:nowrap">${formatDate(l.date)}</td>
              <td>${escapeHtml(l.description) || '-'}</td>
              <td>${escapeHtml(l.accounts?.nome) || '-'}</td>
              <td>${l.categories?.icon||''} ${escapeHtml(l.categories?.nome) || '-'}</td>
              <td><span class="badge ${l.status==='pago'?'success':'warning'}">${l.status||'-'}</span></td>
              <td class="money ${l.type==='receita'?'positive':'negative'}" style="text-align:right">
                ${l.type==='receita'?'+':'-'}${formatCurrency(valor, currency)}
              </td>
            </tr>
          `;
        }).join('')}
      </tbody>
    </table>
  `;
}

await carregarContas();
try { dolarAtual = await getUsdBrlRate(user.id); } catch(_) {}

// Pré-filtrar por conta via URL (clique no dashboard)
const urlParams = new URLSearchParams(window.location.search);
const contaParam = urlParams.get('conta');
if(contaParam){
  el('filtroConta').value = contaParam;
  window.history.replaceState({}, '', window.location.pathname);
}

await carregarExtrato();

el('btnFiltrar').addEventListener('click', carregarExtrato);
el('filtroMes').addEventListener('change', carregarExtrato);
el('filtroConta').addEventListener('change', carregarExtrato);
