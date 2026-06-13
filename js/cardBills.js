import { supabase } from './supabaseClient.js';
import { navigate }  from './router.js';
import { formatCurrency } from './utils.js';

// ─── DOM ───────────────────────────────────────
const userEmail     = document.getElementById('userEmail');
const btnLogout     = document.getElementById('btnLogout');
const filtroCartao  = document.getElementById('filtroCartao');
const mensagem      = document.getElementById('mensagemFatura');
const listaFaturas  = document.getElementById('listaFaturas');

// ─── ESTADO ────────────────────────────────────
let user    = null;
let contas  = [];
let faturas = [];   // grupos já processados

// ─── AUTH ──────────────────────────────────────
const { data } = await supabase.auth.getSession();
if(!data.session){ navigate('../login.html'); }
user = data.session.user;
userEmail.innerText = user.email;

btnLogout.addEventListener('click', async () => {
  await supabase.auth.signOut();
  navigate('../login.html');
});

// ─── UTILITÁRIOS ───────────────────────────────
function msg(texto, tipo = 'info'){
  mensagem.className = `message ${tipo}`;
  mensagem.innerText = texto;
}

function hojeISO(){
  return new Date().toISOString().split('T')[0];
}

function mesAtualRef(){
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
}

function formatRef(ref){
  if(!ref || !ref.includes('-')) return ref || '-';
  const [ano, mes] = ref.split('-');
  const nomes = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
  return `${nomes[Number(mes)-1]}/${ano}`;
}

// ─── CARREGAR CARTÕES ──────────────────────────
async function carregarCartoes(){
  const { data, error } = await supabase
    .from('credit_cards').select('*')
    .eq('user_id', user.id).eq('ativo', true)
    .order('nome', { ascending: true });

  if(error){ msg('Erro ao carregar cartões: '+error.message, 'danger'); return; }

  filtroCartao.innerHTML = '<option value="">Todos os cartões</option>' +
    (data||[]).map(c => `<option value="${c.id}">${c.nome}${c.banco?' - '+c.banco:''}</option>`).join('');
}

// ─── CARREGAR CONTAS ───────────────────────────
async function carregarContas(){
  const { data, error } = await supabase
    .from('accounts').select('*')
    .eq('user_id', user.id).eq('active', true)
    .order('nome', { ascending: true });

  if(error){ msg('Erro ao carregar contas: '+error.message, 'danger'); return; }
  contas = data || [];
}

// ─── CARREGAR E AGRUPAR FATURAS ────────────────
async function carregarFaturas(){
  msg('Carregando faturas...');

  let query = supabase
    .from('card_transactions')
    .select(`
      id, card_id, valor_parcela, fatura_referencia,
      status, descricao, parcela_atual, parcelas, data_compra,
      credit_cards:card_id(id, nome, banco),
      categories:category_id(nome, icon)
    `)
    .eq('user_id', user.id)
    .eq('status', 'aberta')
    .order('fatura_referencia', { ascending: true });

  if(filtroCartao.value){
    query = query.eq('card_id', filtroCartao.value);
  }

  const { data, error } = await query;

  if(error){
    msg('Erro ao listar faturas: '+error.message, 'danger');
    listaFaturas.innerHTML = '';
    return;
  }

  if(!data || data.length === 0){
    msg('');
    listaFaturas.innerHTML = '<p class="muted" style="padding:18px">Nenhuma fatura em aberto.</p>';
    return;
  }

  // Agrupar por cartão + referência
  const grupos = {};
  data.forEach(parcela => {
    const chave = `${parcela.card_id}|${parcela.fatura_referencia}`;
    if(!grupos[chave]){
      grupos[chave] = {
        card_id:    parcela.card_id,
        cartao:     parcela.credit_cards?.nome || 'Cartão',
        banco:      parcela.credit_cards?.banco || '',
        referencia: parcela.fatura_referencia,
        total:      0,
        itens:      []
      };
    }
    grupos[chave].total += Number(parcela.valor_parcela || 0);
    grupos[chave].itens.push(parcela);
  });

  faturas = Object.values(grupos).sort((a,b) => a.referencia.localeCompare(b.referencia));

  msg('');
  renderFaturas();
}

// ─── RENDERIZAR ────────────────────────────────
function renderFaturas(){
  const atual    = mesAtualRef();
  const doMes    = faturas.filter(f => f.referencia === atual);
  const futuras  = faturas.filter(f => f.referencia >  atual);

  let html = '';

  // ── Mês atual ──
  if(doMes.length){
    html += `<p class="bills-section-title">📅 Fatura do mês atual — ${formatRef(atual)}</p>`;
    doMes.forEach((f, i) => {
      html += billCardHtml(f, `atual_${i}`, true, true);
    });
  }else{
    html += `<p class="bills-section-title">📅 Mês atual — ${formatRef(atual)}</p>
      <p class="muted" style="padding:4px 0 16px">Nenhuma fatura no mês atual.</p>`;
  }

  // ── Futuras ──
  if(futuras.length){
    html += `<p class="bills-section-title">🗓 Faturas futuras</p>`;
    futuras.forEach((f, i) => {
      html += billCardHtml(f, `futura_${i}`, false, false);
    });
  }

  listaFaturas.innerHTML = html;

  // Abre automaticamente o mês atual
  listaFaturas.querySelectorAll('.bill-card.mes-atual').forEach(card => {
    card.classList.add('open');
  });

  // Toggle de abertura/fechamento
  listaFaturas.querySelectorAll('.bill-card-header').forEach(header => {
    header.addEventListener('click', () => {
      header.closest('.bill-card').classList.toggle('open');
    });
  });

  // Botões pagar
  listaFaturas.querySelectorAll('.btn-pagar').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const key    = btn.dataset.key;
      const contaId = listaFaturas.querySelector(`#conta_${key}`)?.value;
      await pagarFatura(key, contaId);
    });
  });
}

function billCardHtml(fatura, key, isAtual, startOpen){
  const contasOptions = contas.map(c =>
    `<option value="${c.id}">${c.nome}${c.bank?' - '+c.bank:''} (${formatCurrency(c.saldo_atual||0, c.currency||'BRL')})</option>`
  ).join('');

  const itensHtml = fatura.itens.map(item => {
    const cat = item.categories ? `${item.categories.icon||''} ${item.categories.nome}` : '-';
    return `
      <tr>
        <td>${item.descricao}</td>
        <td>${cat}</td>
        <td style="text-align:center">${item.parcela_atual}/${item.parcelas}</td>
        <td class="money negative" style="text-align:right">-${formatCurrency(item.valor_parcela,'BRL')}</td>
      </tr>
    `;
  }).join('');

  return `
    <div class="bill-card${isAtual?' mes-atual':''}${startOpen?' open':''}" data-key="${key}">
      <div class="bill-card-header">
        <div class="bill-card-left">
          <span class="bill-badge-mes${isAtual?' atual':''}">${formatRef(fatura.referencia)}</span>
          <div>
            <div class="bill-card-name">${fatura.cartao}${fatura.banco?' · '+fatura.banco:''}</div>
            <div class="bill-card-count">${fatura.itens.length} parcela${fatura.itens.length>1?'s':''}</div>
          </div>
        </div>
        <div class="bill-card-right">
          <span class="bill-total">-${formatCurrency(fatura.total,'BRL')}</span>
          <span class="bill-chevron">▾</span>
        </div>
      </div>

      <div class="bill-items">
        <table class="bill-items-table">
          <thead>
            <tr>
              <th>Descrição</th>
              <th>Categoria</th>
              <th style="text-align:center">Parcela</th>
              <th style="text-align:right">Valor</th>
            </tr>
          </thead>
          <tbody>${itensHtml}</tbody>
        </table>

        ${isAtual ? `
          <div class="bill-pay-bar">
            <select id="conta_${key}">
              <option value="">Selecione a conta para pagar</option>
              ${contasOptions}
            </select>
            <button type="button" class="btn btn-primary btn-pagar" data-key="${key}">
              Pagar fatura — ${formatCurrency(fatura.total,'BRL')}
            </button>
          </div>
        ` : `
          <div class="bill-pay-bar">
            <span class="muted" style="font-size:13px">Fatura futura — disponível para pagamento em ${formatRef(fatura.referencia)}</span>
          </div>
        `}
      </div>
    </div>
  `;
}

// ─── PAGAR FATURA ──────────────────────────────
async function pagarFatura(key, contaId){
  if(!contaId){
    msg('Selecione uma conta para pagar.', 'warning');
    return;
  }

  const fatura = faturas.find((_, i) => `atual_${i}` === key);
  if(!fatura){ msg('Fatura não encontrada.', 'danger'); return; }

  const conta = contas.find(c => c.id === contaId);
  if(!conta){ msg('Conta não encontrada.', 'danger'); return; }

  msg('Registrando pagamento...');

  // 1. Lança despesa na conta
  const descricao = `Fatura ${fatura.cartao} ${formatRef(fatura.referencia)}`;
  const { error: erroTx } = await supabase.from('transactions').insert({
    user_id:    user.id,
    account_id: contaId,
    category_id:null,
    type:       'despesa',
    amount:     Number(fatura.total.toFixed(2)),
    description:descricao,
    date:       hojeISO(),
    status:     'pago',
    notes:      'Pagamento de fatura de cartão de crédito'
  });

  if(erroTx){ msg('Erro ao registrar pagamento: '+erroTx.message, 'danger'); return; }

  // 2. Debita saldo da conta
  const novoSaldo = Number(conta.saldo_atual||0) - Number(fatura.total||0);
  const { error: erroSaldo } = await supabase.from('accounts')
    .update({ saldo_atual: novoSaldo })
    .eq('id', contaId).eq('user_id', user.id);

  if(erroSaldo){ msg('Pagamento registrado, mas erro ao atualizar saldo: '+erroSaldo.message, 'danger'); return; }

  // 3. Marca parcelas como pagas
  const ids = fatura.itens.map(i => i.id);
  const { error: erroFatura } = await supabase.from('card_transactions')
    .update({ status: 'paga' })
    .in('id', ids).eq('user_id', user.id);

  if(erroFatura){ msg('Pagamento registrado, mas erro ao fechar fatura: '+erroFatura.message, 'danger'); return; }

  msg(`Fatura ${fatura.cartao} ${formatRef(fatura.referencia)} paga com sucesso!`, 'success');
  await carregarContas();
  await carregarFaturas();
}

// ─── EVENTOS E INÍCIO ──────────────────────────
filtroCartao.addEventListener('change', carregarFaturas);

await carregarCartoes();
await carregarContas();
await carregarFaturas();
