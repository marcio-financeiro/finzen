/**
 * mobile.js
 * FinZen Mobile — modo simplificado
 * Foco em: saldo, lançamentos rápidos, orçamentos e alertas
 */

import { supabase }       from './supabaseClient.js';
import { navigate }       from './router.js';
import { formatCurrency } from './utils.js';

// ── Auth ──────────────────────────────────────────────
const { data: sd } = await supabase.auth.getSession();
if(!sd.session){ navigate('../login.html'); }
const user = sd.session.user;

const el  = id => document.getElementById(id);
const fmt = v  => formatCurrency(v, 'BRL');

// ── Saudação ──────────────────────────────────────────
const hora = new Date().getHours();
const saudacao = hora < 12 ? 'Bom dia!' : hora < 18 ? 'Boa tarde!' : 'Boa noite!';
el('mobGreeting').textContent = saudacao;

// Avatar com inicial do email
const inicial = user.email?.[0]?.toUpperCase() || 'U';
el('mobAvatar').textContent = inicial;

// ── Estado ────────────────────────────────────────────
let tipoAtual    = 'despesa';
let catSelecionada = null;
let contas       = [];
let categorias   = [];

// ── Emoji por tipo de conta ───────────────────────────
function tipoContaEmoji(tipo) {
  const t = (tipo||'').toLowerCase();
  if(t.includes('corret') || t.includes('broker')) return '📈';
  if(t.includes('poupan'))  return '🏦';
  if(t.includes('carteira') || t.includes('wallet')) return '👛';
  if(t.includes('digital')) return '💜';
  if(t.includes('invest'))  return '💰';
  return '🏦';
}

// ── Carregar dados ────────────────────────────────────
async function carregar() {
  const hoje    = new Date();
  const anoMes  = `${hoje.getFullYear()}-${String(hoje.getMonth()+1).padStart(2,'0')}`;
  const inicio  = `${anoMes}-01`;
  const fim     = new Date(hoje.getFullYear(), hoje.getMonth()+1, 0).toISOString().split('T')[0];
  const hojeISO = hoje.toISOString().split('T')[0];
  const em7     = new Date(Date.now()+7*864e5).toISOString().split('T')[0];

  const [
    { data: contasData },
    { data: txMes },
    { data: faturas },
    { data: pendentes },
    { data: orcamentos },
    { data: ultimos },
    { data: cats },
    { data: cartoes },
  ] = await Promise.all([
    supabase.from('accounts').select('id,nome,saldo_atual,currency').eq('user_id',user.id).eq('active',true),
    supabase.from('transactions').select('type,amount,status').eq('user_id',user.id).gte('date',inicio).lte('date',fim).eq('status','pago'),
    supabase.from('card_transactions').select('valor_parcela,credit_cards:card_id(nome,vencimento_dia)').eq('user_id',user.id).eq('status','aberta').eq('fatura_referencia',anoMes),
    supabase.from('transactions').select('description,amount,date,type').eq('user_id',user.id).eq('status','pendente').gte('date',hojeISO).lte('date',em7).order('date'),
    supabase.from('budgets').select('valor_planejado,categories:category_id(nome,icon)').eq('user_id',user.id).eq('mes_referencia',anoMes),
    supabase.from('transactions').select('type,amount,date,description,categories:category_id(nome,icon),accounts:account_id(nome)').eq('user_id',user.id).eq('status','pago').order('date',{ascending:false}).limit(5),
    supabase.from('categories').select('id,nome,icon,tipo').eq('user_id',user.id).eq('ativo',true),
    supabase.from('credit_cards').select('id,nome,vencimento_dia').eq('user_id',user.id).eq('ativo',true),
  ]);

  contas     = contasData || [];
  categorias = cats       || [];

  // ── Saldo ──────────────────────────────────────────
  const saldoBRL = contas.filter(c=>(c.currency||'BRL')==='BRL').reduce((s,c)=>s+Number(c.saldo_atual||0),0);
  const nContas  = contas.length;
  el('mobSaldo').textContent = fmt(saldoBRL);
  el('mobSaldo').style.color = saldoBRL >= 0 ? 'var(--green)' : 'var(--red)';
  el('mobSaldoSub').textContent = `${nContas} conta${nContas!==1?'s':''} ativas`;

  // ── KPIs ──────────────────────────────────────────
  const receitas  = (txMes||[]).filter(t=>t.type==='receita').reduce((s,t)=>s+Number(t.amount||0),0);
  const despesas  = (txMes||[]).filter(t=>t.type==='despesa').reduce((s,t)=>s+Number(t.amount||0),0);
  const resultado = receitas - despesas;
  const totalFat  = (faturas||[]).reduce((s,f)=>s+Number(f.valor_parcela||0),0);

  el('mobReceitas').textContent  = fmt(receitas);
  el('mobDespesas').textContent  = fmt(despesas);
  el('mobResultado').textContent = fmt(resultado);
  el('mobResultado').style.color = resultado >= 0 ? 'var(--green)' : 'var(--red)';
  el('mobFaturas').textContent   = fmt(totalFat);

  // ── Alertas ──────────────────────────────────────
  const alertas = [];

  // Faturas próximas (3 dias)
  const hoje2 = new Date();
  ;(cartoes||[]).forEach(c => {
    if(!c.vencimento_dia) return;
    const dv = c.vencimento_dia;
    let mes = hoje2.getMonth()+1, ano = hoje2.getFullYear();
    if(dv < hoje2.getDate()){ mes++; if(mes>12){mes=1;ano++;} }
    const dataVenc = new Date(`${ano}-${String(mes).padStart(2,'0')}-${String(dv).padStart(2,'0')}`);
    const dias = Math.round((dataVenc-hoje2)/864e5);
    const totalCartao = (faturas||[]).filter(f=>f.credit_cards?.nome===c.nome).reduce((s,f)=>s+Number(f.valor_parcela||0),0);
    if(dias<=3 && totalCartao>0){
      alertas.push({
        tipo: dias<=0?'vermelho':'amarelo',
        icon: '💳',
        titulo: dias<=0?`Fatura ${c.nome} vence HOJE`:`Fatura ${c.nome} vence em ${dias} dia${dias>1?'s':''}`,
        sub: fmt(totalCartao),
        href: '../pages/card-bills.html',
      });
    }
  });

  // Pendentes
  ;(pendentes||[]).slice(0,3).forEach(p => {
    const dias = Math.round((new Date(p.date+'T00:00:00')-hoje2)/864e5);
    alertas.push({
      tipo: dias<=0?'vermelho':'amarelo',
      icon: '⏰',
      titulo: `${p.description}`,
      sub: `${dias<=0?'Hoje':dias===1?'Amanhã':`Em ${dias} dias`} • ${fmt(p.amount)}`,
      href: '../pages/movements.html',
    });
  });

  const alertasList = el('mobAlertasList');
  if(alertas.length){
    alertasList.innerHTML = alertas.map(a=>`
      <div class="mob-alerta ${a.tipo}" onclick="location.href='${a.href}'">
        <span class="mob-alerta-icon">${a.icon}</span>
        <div class="mob-alerta-info">
          <div class="mob-alerta-titulo">${a.titulo}</div>
          <div class="mob-alerta-sub">${a.sub}</div>
        </div>
      </div>`).join('');
    el('mobAlertas').style.display = 'block';
  }

  // ── Últimos lançamentos ──────────────────────────────
  const contasList = el('mobContasList');
  if(contas.length){
    contasList.innerHTML = contas.map(c => {
      const saldo = Number(c.saldo_atual||0);
      const moeda = c.currency||'BRL';
      const cor   = saldo < 0 ? 'var(--red)' : 'var(--text)';
      const emoji = tipoContaEmoji(c.tipo||c.kind||'');
      return `
        <div class="mob-orc-item" onclick="location.href='../pages/account-statement.html'">
          <div class="mob-orc-header">
            <span class="mob-orc-nome">${emoji} ${c.nome}</span>
            <span style="font-size:15px;font-weight:800;color:${cor}">
              ${moeda !== 'BRL' ? 'US$ ' : 'R$ '}${Math.abs(saldo).toLocaleString('pt-BR',{minimumFractionDigits:2})}
            </span>
          </div>
        </div>`;
    }).join('');
    el('mobOrcamentos').style.display = 'block';
  }

  // ── Últimos lançamentos ──────────────────────────────
  const lancList = el('mobLancamentosList');
  if((ultimos||[]).length){
    lancList.innerHTML = (ultimos||[]).map(t=>{
      const isRec = t.type==='receita';
      const icon  = t.categories?.icon || (isRec?'💚':'🔴');
      return `
        <div class="mob-lanc-item" onclick="location.href='../pages/movements.html'">
          <div class="mob-lanc-icon" style="background:${isRec?'rgba(34,197,94,.1)':'rgba(239,68,68,.1)'}">
            ${icon}
          </div>
          <div class="mob-lanc-info">
            <div class="mob-lanc-desc">${t.description}</div>
            <div class="mob-lanc-sub">${t.categories?.nome||'-'} • ${t.accounts?.nome||'-'}</div>
          </div>
          <div class="mob-lanc-valor" style="color:${isRec?'var(--green)':'var(--red)'}">
            ${isRec?'+':'-'}${fmt(t.amount)}
          </div>
        </div>`;
    }).join('');
    el('mobLancamentos').style.display = 'block';
  }

  // Mostrar tudo
  el('mobLoading').style.display    = 'none';
  el('mobSaldoCard').style.display  = 'block';
  el('mobKpis').style.display       = 'grid';

  // ── Popular modal ──────────────────────────────────
  popularModal();
}

// ── Popular modal de lançamento ───────────────────────
function popularModal() {
  // Contas
  el('mobConta').innerHTML = contas
    .filter(c=>(c.currency||'BRL')==='BRL')
    .map(c=>`<option value="${c.id}">${c.nome} (${fmt(c.saldo_atual||0)})</option>`).join('');

  // Data hoje
  el('mobData').value = new Date().toISOString().split('T')[0];

  // Categorias rápidas (8 mais comuns por tipo)
  renderCategorias('despesa');

  // Select completo
  el('mobCatSelect').innerHTML = '<option value="">Selecionar outra...</option>' +
    categorias.map(c=>`<option value="${c.id}">${c.icon||''} ${c.nome}</option>`).join('');

  el('mobCatSelect').addEventListener('change', e => {
    if(e.target.value) {
      catSelecionada = e.target.value;
      document.querySelectorAll('.mob-cat-btn').forEach(b=>b.classList.remove('ativo'));
    }
  });
}

function renderCategorias(tipo) {
  const lista = categorias.filter(c=>c.tipo===tipo).slice(0,8);
  el('mobCatsGrid').innerHTML = lista.map(c=>`
    <button class="mob-cat-btn ${catSelecionada===c.id?'ativo':''}"
      onclick="selecionarCat('${c.id}')">
      <span class="mob-cat-btn-icon">${c.icon||'📌'}</span>
      <span class="mob-cat-btn-label">${c.nome.slice(0,8)}</span>
    </button>`).join('');
}

window.selecionarCat = function(id) {
  catSelecionada = id;
  el('mobCatSelect').value = '';
  document.querySelectorAll('.mob-cat-btn').forEach(b=>{
    b.classList.toggle('ativo', b.getAttribute('onclick')?.includes(`'${id}'`));
  });
};

// ── Tipo de lançamento ────────────────────────────────
window.selecionarTipo = function(tipo) {
  tipoAtual = tipo;
  catSelecionada = null;
  el('btnTipoDespesa').classList.toggle('ativo', tipo==='despesa');
  el('btnTipoReceita').classList.toggle('ativo', tipo==='receita');
  renderCategorias(tipo);
};

// ── Modal ─────────────────────────────────────────────
window.abrirModal = function() {
  el('mobModalOverlay').classList.add('aberto');
  setTimeout(()=>el('mobValor').focus(), 300);
};

window.fecharModalFora = function(e) {
  if(e.target === el('mobModalOverlay')) fecharModal();
};

function fecharModal() {
  el('mobModalOverlay').classList.remove('aberto');
  el('mobValor').value       = '';
  el('mobDescricao').value   = '';
  catSelecionada = null;
  el('mobCatSelect').value   = '';
  renderCategorias(tipoAtual);
}

// ── Salvar lançamento ─────────────────────────────────
window.salvarLancamento = async function() {
  const valor   = parseFloat(el('mobValor').value || '0');
  const desc    = el('mobDescricao').value.trim();
  const contaId = el('mobConta').value;
  const catId   = catSelecionada || el('mobCatSelect').value || null;
  const data    = el('mobData').value;

  if(!valor || valor <= 0) { alert('Informe um valor válido.'); return; }
  if(!desc)                { alert('Informe uma descrição.'); return; }
  if(!contaId)             { alert('Selecione uma conta.'); return; }

  const btn = el('mobBtnSalvar');
  btn.disabled = true;
  btn.textContent = 'Salvando...';

  try {
    // Inserir transação
    const { error } = await supabase.from('transactions').insert({
      user_id:     user.id,
      account_id:  contaId,
      category_id: catId,
      type:        tipoAtual,
      amount:      valor,
      description: desc,
      date:        data,
      status:      'pago',
    });
    if(error) throw error;

    // Atualizar saldo
    const conta = contas.find(c=>c.id===contaId);
    if(conta){
      const novoSaldo = Number(conta.saldo_atual||0) + (tipoAtual==='receita' ? valor : -valor);
      await supabase.from('accounts').update({saldo_atual:novoSaldo}).eq('id',contaId);
      conta.saldo_atual = novoSaldo;
    }

    fecharModal();
    await carregar();
  } catch(e) {
    alert('Erro ao salvar: ' + e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = '✓ Salvar lançamento';
  }
};

// ── Navegação ─────────────────────────────────────────
window.scrollTop = function() {
  el('mobScroll').scrollTo({ top: 0, behavior: 'smooth' });
};

window.irParaDashboard = function() {
  location.href = '../pages/dashboard.html';
};

window.ativarModoAvancado = function() {
  localStorage.setItem('finzen_modo_avancado', 'true');
  location.href = '../pages/dashboard.html';
};

// ── Inicializar ───────────────────────────────────────
await carregar();
