import { supabase } from './supabaseClient.js';
import { navigate } from './router.js';
import { formatCurrency } from './utils.js';

const { data: sessionData } = await supabase.auth.getSession();
if(!sessionData.session){ navigate('../login.html'); }
const user = sessionData.session.user;
document.getElementById('userEmail').innerText = user.email;
document.getElementById('btnLogout').addEventListener('click', async ()=>{
  await supabase.auth.signOut(); navigate('../login.html');
});

const el = id => document.getElementById(id);

// Definir mês atual como padrão
const hoje = new Date();
el('filtroMes').value = `${hoje.getFullYear()}-${String(hoje.getMonth()+1).padStart(2,'0')}`;

// Carregar contas
async function carregarContas(){
  const { data } = await supabase
    .from('accounts')
    .select('id,nome,currency,saldo_atual')
    .eq('user_id', user.id)
    .eq('active', true)
    .order('nome');

  const contas = data || [];
  el('filtroConta').innerHTML = '<option value="">Todas as contas</option>' +
    contas.map(c => `<option value="${c.id}" data-saldo="${c.saldo_atual||0}" data-currency="${c.currency||'BRL'}">${c.nome}</option>`).join('');
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
    el('kpiSaldo').innerText = '—';
    el('kpiSaldo').className = '';
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
    el('stmtLista').innerHTML = `<p class="muted" style="padding:24px">Erro ao carregar: ${error.message}</p>`;
    return;
  }

  // ── Buscar transferências da conta selecionada ────────
  let transferencias = [];
  if(contaId) {
    const [{ data: transOut }, { data: transIn }] = await Promise.all([
      supabase.from('account_transfers')
        .select('id,amount,description,date,from_account_id,to_account_id,accounts_to:to_account_id(nome)')
        .eq('user_id', user.id)
        .eq('from_account_id', contaId)
        .gte('date', mes ? `${mes.split('-')[0]}-${mes.split('-')[1]}-01` : '2000-01-01')
        .lte('date', mes ? new Date(Number(mes.split('-')[0]), Number(mes.split('-')[1]), 0).toISOString().split('T')[0] : '2099-12-31'),
      supabase.from('account_transfers')
        .select('id,amount,description,date,from_account_id,to_account_id,accounts_from:from_account_id(nome)')
        .eq('user_id', user.id)
        .eq('to_account_id', contaId)
        .gte('date', mes ? `${mes.split('-')[0]}-${mes.split('-')[1]}-01` : '2000-01-01')
        .lte('date', mes ? new Date(Number(mes.split('-')[0]), Number(mes.split('-')[1]), 0).toISOString().split('T')[0] : '2099-12-31'),
    ]);

    (transOut||[]).forEach(t => transferencias.push({
      id: t.id, date: t.date,
      description: t.description || `Transferência para ${t.accounts_to?.nome||'outra conta'}`,
      type: 'transferencia_saida',
      amount: Number(t.amount||0),
      conta: t.accounts_to?.nome || '-',
      status: 'pago',
      isTransfer: true,
    }));
    (transIn||[]).forEach(t => transferencias.push({
      id: t.id, date: t.date,
      description: t.description || `Transferência de ${t.accounts_from?.nome||'outra conta'}`,
      type: 'transferencia_entrada',
      amount: Number(t.amount||0),
      conta: t.accounts_from?.nome || '-',
      status: 'pago',
      isTransfer: true,
    }));
  }

  // Combinar e ordenar por data
  const todos = [
    ...(data||[]).map(l => ({ ...l, isTransfer: false })),
    ...transferencias,
  ].sort((a,b) => b.date?.localeCompare(a.date));

  const lancamentos = todos;

  const entradas = lancamentos.filter(l=>l.type==='receita'||l.type==='transferencia_entrada').reduce((s,l)=>s+Number(l.amount||0),0);
  const saidas   = lancamentos.filter(l=>l.type==='despesa'||l.type==='transferencia_saida').reduce((s,l)=>s+Number(l.amount||0),0);
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
          const isEntrada = l.type==='receita' || l.type==='transferencia_entrada';
          const isSaida   = l.type==='despesa' || l.type==='transferencia_saida';
          const contaNome = l.isTransfer ? l.conta : (l.accounts?.nome || '-');
          const catNome   = l.isTransfer
            ? `<span style="color:var(--muted)">🔄 Transferência</span>`
            : `${l.categories?.icon||''} ${l.categories?.nome || '-'}`;
          return `
            <tr>
              <td style="white-space:nowrap">${formatDate(l.date)}</td>
              <td>${l.description || '-'}</td>
              <td>${contaNome}</td>
              <td>${catNome}</td>
              <td><span class="badge ${l.status==='pago'||l.status==='paga'?'success':'warning'}">${l.status||'-'}</span></td>
              <td class="money ${isEntrada?'positive':'negative'}" style="text-align:right">
                ${isEntrada?'+':'-'}${formatCurrency(valor, currency)}
              </td>
            </tr>
          `;
        }).join('')}
      </tbody>
    </table>
  `;
}

await carregarContas();
await carregarExtrato();

el('btnFiltrar').addEventListener('click', carregarExtrato);
el('filtroMes').addEventListener('change', carregarExtrato);
el('filtroConta').addEventListener('change', carregarExtrato);
