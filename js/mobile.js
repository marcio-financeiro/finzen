/**
 * mobile.js
 * FinZen Mobile — modo simplificado
 * Foco em: saldo, lançamentos rápidos, orçamentos e alertas
 */

import { supabase }       from './supabaseClient.js';
import { navigate }       from './router.js';
import { formatCurrency } from './utils.js';
import { registrarAcao }  from './eventBus.js';
import { notificarTransacao } from './telegram.js';

// ── Auth ──────────────────────────────────────────────
const { data: sd } = await supabase.auth.getSession();
if(!sd.session){ navigate('../login.html'); throw new Error('unauthenticated'); }
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

// ── Cache offline ─────────────────────────────────────
const CACHE_KEY = 'finzen_mobile_cache';
const CACHE_TTL = 30 * 60 * 1000; // 30 minutos

function salvarCache(dados) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ dados, ts: Date.now() }));
  } catch(_) {}
}

function carregarCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if(!raw) return null;
    const { dados, ts } = JSON.parse(raw);
    if(Date.now() - ts > CACHE_TTL) return null;
    return dados;
  } catch(_) { return null; }
}

function mostrarOfflineBanner() {
  const banner = document.createElement('div');
  banner.style.cssText = `position:fixed;top:0;left:0;right:0;padding:8px 16px;
    background:rgba(245,158,11,.9);color:#000;font-size:12px;font-weight:700;
    text-align:center;z-index:999;`;
  banner.textContent = '📵 Modo offline — dados do cache';
  document.body.appendChild(banner);
  setTimeout(() => banner.remove(), 4000);
}

// ── Pagar fatura pelo mobile ──────────────────────────
registrarAcao('pagarFaturaMobile', async (el) => {
  const idx        = el.dataset.idx;
  const cartaoId    = el.dataset.cartaoId;
  const cartaoNome  = el.dataset.cartaoNome;
  const total       = Number(el.dataset.total);
  if(!confirm(`Pagar fatura ${cartaoNome}\n${fmt(total)}\n\nSelecione a conta de débito.`)) return;

  // Mostrar select de contas
  const contasBRL = contas.filter(c=>(c.currency||'BRL')==='BRL');
  if(!contasBRL.length){ alert('Nenhuma conta BRL disponível.'); return; }

  // Criar modal simples de seleção
  const opcoes = contasBRL.map(c=>`${c.icon||'🏦'} ${c.nome} (${fmt(c.saldo_atual||0)})`).join('\n');
  const idx2 = contasBRL.findIndex(c => c.saldo_atual >= total);
  const contaEscolhida = contasBRL[idx2 >= 0 ? idx2 : 0];

  if(!confirm(`Débitar de:\n${contaEscolhida.icon||'🏦'} ${contaEscolhida.nome}\nSaldo: ${fmt(contaEscolhida.saldo_atual||0)}\n\nConfirmar pagamento de ${fmt(total)}?`)) return;

  try {
    const hoje = new Date().toISOString().split('T')[0];
    const anoMes = hoje.slice(0,7);

    // Marcar parcelas como pagas
    const { error: e1 } = await supabase.from('card_transactions')
      .update({ status: 'paga' })
      .eq('user_id', user.id)
      .eq('card_id', cartaoId)
      .eq('fatura_referencia', anoMes);
    if(e1) throw e1;

    // Debitar da conta
    const novoSaldo = Number(contaEscolhida.saldo_atual||0) - total;
    await supabase.from('accounts').update({ saldo_atual: novoSaldo })
      .eq('id', contaEscolhida.id).eq('user_id', user.id);

    // Registrar pagamento nas transações
    await supabase.from('transactions').insert({
      user_id: user.id, account_id: contaEscolhida.id,
      type: 'despesa', amount: total,
      description: `Pagamento fatura ${cartaoNome}`,
      date: hoje, status: 'pago',
    });

    // Remover alerta da tela
    document.getElementById(`alerta-${idx}`)?.remove();

    alert(`✅ Fatura ${cartaoNome} paga com sucesso!`);
    await carregar();
  } catch(e) {
    alert('Erro ao pagar: ' + e.message);
  }
});

// ── Pagar lançamento pendente pelo mobile ─────────────
registrarAcao('pagarPendenteMobile', async (el) => {
  const idx     = el.dataset.idx;
  const txId    = el.dataset.txId;
  const valor   = Number(el.dataset.valor);
  const contaId = el.dataset.contaId;
  if(!confirm(`Confirmar pagamento?\n${fmt(valor)}`)) return;

  try {
    await supabase.from('transactions')
      .update({ status: 'pago' })
      .eq('id', txId).eq('user_id', user.id);

    if(contaId) {
      const conta = contas.find(c=>c.id===contaId);
      if(conta) {
        const novoSaldo = Number(conta.saldo_atual||0) - valor;
        await supabase.from('accounts').update({ saldo_atual: novoSaldo }).eq('id', contaId);
      }
    }

    document.getElementById(`alerta-${idx}`)?.remove();
    alert('✅ Lançamento marcado como pago!');
    await carregar();
  } catch(e) {
    alert('Erro: ' + e.message);
  }
});

function renderizarDados(c) {
  // Saldo
  el('mobSaldo').textContent = fmt(c.saldoBRL||0);
  el('mobSaldo').style.color = (c.saldoBRL||0) >= 0 ? 'var(--green)' : 'var(--red)';
  el('mobSaldoSub').textContent = `${c.nContas||0} conta${(c.nContas||0)!==1?'s':''} ativas`;
  // KPIs
  el('mobReceitas').textContent  = fmt(c.receitas||0);
  el('mobDespesas').textContent  = fmt(c.despesas||0);
  el('mobResultado').textContent = fmt(c.resultado||0);
  el('mobResultado').style.color = (c.resultado||0) >= 0 ? 'var(--green)' : 'var(--red)';
  el('mobFaturas').textContent   = fmt(c.totalFat||0);
  // Contas
  contas = c.contas || [];
  el('mobLoading').style.display   = 'none';
  el('mobSaldoCard').style.display = 'block';
  el('mobKpis').style.display      = 'grid';
  popularModal();
}

// ── Carregar dados ────────────────────────────────────
async function carregar() {
  const hoje    = new Date();
  const anoMes  = `${hoje.getFullYear()}-${String(hoje.getMonth()+1).padStart(2,'0')}`;
  const inicio  = `${anoMes}-01`;
  const fim     = new Date(hoje.getFullYear(), hoje.getMonth()+1, 0).toISOString().split('T')[0];
  const hojeISO = hoje.toISOString().split('T')[0];
  const em7     = new Date(Date.now()+7*864e5).toISOString().split('T')[0];

  // Tentar carregar do cache se offline
  if(!navigator.onLine) {
    const cache = carregarCache();
    if(cache) {
      mostrarOfflineBanner();
      renderizarDados(cache);
      return;
    }
  }

  const [
    { data: contasData },
    { data: txMes },
    { data: faturas },
    { data: pendentes },
    { data: orcamentos },
    { data: ultimos },
    { data: ultimosCartao },
    { data: cats },
    { data: cartoes },
  ] = await Promise.all([
    supabase.from('accounts').select('id,nome,saldo_atual,currency,icon,tipo,account_kind').eq('user_id',user.id).eq('active',true),
    supabase.from('transactions').select('type,amount,status').eq('user_id',user.id).gte('date',inicio).lte('date',fim).eq('status','pago'),
    supabase.from('card_transactions').select('valor_parcela,credit_cards:card_id(nome,vencimento_dia)').eq('user_id',user.id).in('status',['aberta','pendente']).eq('fatura_referencia',anoMes),
    supabase.from('transactions').select('description,amount,date,type').eq('user_id',user.id).eq('status','pendente').gte('date',hojeISO).lte('date',em7).order('date'),
    supabase.from('budgets').select('valor_planejado,categories:category_id(nome,icon)').eq('user_id',user.id).eq('mes_referencia',anoMes),
    supabase.from('transactions').select('type,amount,date,created_at,description,categories:category_id(nome,icon),accounts:account_id(nome)').eq('user_id',user.id).eq('status','pago').order('created_at',{ascending:false}).limit(5),
    supabase.from('card_transactions').select('descricao,valor_total,data_compra,created_at,credit_cards:card_id(nome),categories:category_id(nome,icon)').eq('user_id',user.id).eq('parcela_atual',1).order('created_at',{ascending:false}).limit(5),
    supabase.from('categories').select('id,nome,icon,tipo').eq('user_id',user.id).eq('ativo',true),
    supabase.from('credit_cards').select('id,nome,vencimento_dia').eq('user_id',user.id).eq('ativo',true),
  ]);

  contas     = contasData || [];
  categorias = cats       || [];
  window._cartoesMobile = cartoes || [];

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
        cartaoId: c.id,
        cartaoNome: c.nome,
        totalCartao,
        isFatura: true,
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
      txId: p.id,
      txValor: p.amount,
      txConta: p.account_id,
      isPendente: true,
    });
  });

  const alertasList = el('mobAlertasList');
  if(alertas.length){
    alertasList.innerHTML = alertas.map((a,i)=>`
      <div class="mob-alerta ${a.tipo}" id="alerta-${i}">
        <span class="mob-alerta-icon">${a.icon}</span>
        <div class="mob-alerta-info" onclick="location.href='${a.href}'">
          <div class="mob-alerta-titulo">${a.titulo}</div>
          <div class="mob-alerta-sub">${a.sub}</div>
        </div>
        ${a.isFatura ? `
          <button class="mob-pagar-btn" data-action="pagarFaturaMobile"
            data-idx="${i}" data-cartao-id="${a.cartaoId}" data-cartao-nome="${a.cartaoNome}" data-total="${a.totalCartao}"
            style="padding:6px 12px;border-radius:8px;border:none;background:#22c55e;color:#fff;
              font-size:12px;font-weight:700;cursor:pointer;white-space:nowrap;flex-shrink:0">
            ✓ Pagar
          </button>` : ''}
        ${a.isPendente ? `
          <button class="mob-pagar-btn" data-action="pagarPendenteMobile"
            data-idx="${i}" data-tx-id="${a.txId}" data-valor="${a.txValor}" data-conta-id="${a.txConta||''}"
            style="padding:6px 12px;border-radius:8px;border:none;background:#22c55e;color:#fff;
              font-size:12px;font-weight:700;cursor:pointer;white-space:nowrap;flex-shrink:0">
            ✓ Pagar
          </button>` : ''}
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
      const emoji = c.icon || tipoContaEmoji(c.tipo||c.kind||'');
      return `
        <div class="mob-orc-item" onclick="location.href='../pages/account-statement.html'">
          <div class="mob-orc-header">
            <span class="mob-orc-nome">${emoji} ${c.nome}</span>
            <span style="font-size:15px;font-weight:800;color:${cor}">
              ${moeda !== 'BRL' ? 'US$ ' : 'R$ '}${Math.abs(saldo).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})}
            </span>
          </div>
        </div>`;
    }).join('');
    el('mobOrcamentos').style.display = 'block';
  }

  // ── Últimos lançamentos ──────────────────────────────
  const lancList = el('mobLancamentosList');
  const cartaoNorm = (ultimosCartao||[]).map(c => ({
    type: 'despesa',
    amount: c.valor_total,
    description: c.descricao,
    date: c.data_compra,
    created_at: c.created_at,
    categories: c.categories,
    accounts: { nome: '💳 ' + (c.credit_cards?.nome || 'Cartão') },
  }));
  const todosLanc = [...(ultimos||[]), ...cartaoNorm]
    .sort((a,b) => new Date(b.created_at||0) - new Date(a.created_at||0))
    .slice(0, 5);
  if(todosLanc.length){
    lancList.innerHTML = todosLanc.map(t=>{
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

  // Salvar cache para uso offline
  try {
    salvarCache({
      saldoBRL, nContas, receitas, despesas, resultado, totalFat,
      alertas, contas, orcamentos: orcamentos||[], ultimos: ultimos||[],
      anoMes,
    });
  } catch(_) {}

  // ── Popular modal ──────────────────────────────────
  popularModal();
}

// ── Popular modal de lançamento ───────────────────────
function popularModal() {
  // Contas
  el('mobConta').innerHTML = contas
    .filter(c=>(c.currency||'BRL')==='BRL')
    .map(c=>`<option value="${c.id}">${c.icon||'🏦'} ${c.nome} (${fmt(c.saldo_atual||0)})</option>`).join('');

  // Cartões
  const cartaoSelect = el('mobCartao');
  if(cartaoSelect){
    cartaoSelect.innerHTML = '<option value="">Selecione...</option>' +
      (window._cartoesMobile||[]).map(c=>`<option value="${c.id}">${c.nome}</option>`).join('');
  }

  // Data hoje
  el('mobData').value = new Date().toISOString().split('T')[0];

  // Categorias rápidas
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
      data-action="selecionarCat" data-cat-id="${c.id}">
      <span class="mob-cat-btn-icon">${c.icon||'📌'}</span>
      <span class="mob-cat-btn-label">${c.nome.slice(0,8)}</span>
    </button>`).join('');
}

registrarAcao('selecionarCat', (elClicado) => {
  const id = elClicado.dataset.catId;
  catSelecionada = id;
  el('mobCatSelect').value = '';
  document.querySelectorAll('.mob-cat-btn').forEach(b=>{
    b.classList.toggle('ativo', b.dataset.catId === id);
  });
});

// ── Tipo de lançamento ────────────────────────────────
function selecionarTipo(tipo) {
  tipoAtual = tipo;
  catSelecionada = null;

  el('btnTipoDespesa').classList.toggle('ativo', tipo==='despesa');
  el('btnTipoReceita').classList.toggle('ativo', tipo==='receita');
  el('btnTipoCartao') && el('btnTipoCartao').classList.toggle('ativo', tipo==='cartao');

  // Mostrar/ocultar campos de cartão
  const isCartao = tipo === 'cartao';
  el('mobContaField').style.display   = isCartao ? 'none' : 'block';
  el('mobCartaoField').style.display  = isCartao ? 'block' : 'none';
  el('mobParcelasField').style.display= isCartao ? 'block' : 'none';

  // Categorias de despesa para cartão
  renderCategorias(tipo === 'receita' ? 'receita' : 'despesa');
}

// Ponto de entrada via clique — lê o tipo do data-attribute do botão
registrarAcao('selecionarTipo', (elClicado) => {
  selecionarTipo(elClicado.dataset.tipo);
});

// ── Modal ─────────────────────────────────────────────
registrarAcao('abrirModal', () => {
  el('mobModalOverlay').classList.add('aberto');
  setTimeout(()=>el('mobValor').focus(), 300);
});

registrarAcao('fecharModalFora', (elClicado, evento) => {
  if(evento.target === el('mobModalOverlay')) fecharModal();
});

function fecharModal() {
  el('mobModalOverlay').classList.remove('aberto');
  el('mobValor').value       = '';
  el('mobDescricao').value   = '';
  catSelecionada = null;
  el('mobCatSelect').value   = '';
  // Reset tipo para despesa
  selecionarTipo('despesa');
  renderCategorias('despesa');
}

// ── Salvar lançamento ─────────────────────────────────
registrarAcao('salvarLancamento', async () => {
  const valor   = parseFloat((el('mobValor').value || '0').replace(',', '.'));
  const desc    = el('mobDescricao').value.trim();
  const catId   = catSelecionada || el('mobCatSelect').value || null;
  const data    = el('mobData').value;

  if(!valor || valor <= 0) { alert('Informe um valor válido.'); return; }
  if(!desc)                { alert('Informe uma descrição.'); return; }

  const btn = el('mobBtnSalvar');
  btn.disabled = true;
  btn.textContent = 'Salvando...';

  try {
    if(tipoAtual === 'cartao') {
      // Lançamento no cartão
      const cartaoId = el('mobCartao')?.value;
      const parcelas = parseInt(el('mobParcelas')?.value||'1');
      if(!cartaoId){ alert('Selecione um cartão.'); btn.disabled=false; btn.textContent='✓ Salvar lançamento'; return; }

      const cartao = (window._cartoesMobile||[]).find(c=>c.id===cartaoId);
      const diaFechamento = cartao?.fechamento_dia || 1;

      // Calcular referência da fatura
      const dataCompra = new Date(data+'T00:00:00');
      const diaCompra  = dataCompra.getDate();
      let mesRef = dataCompra.getMonth() + 1;
      let anoRef = dataCompra.getFullYear();
      if(diaCompra > diaFechamento){ mesRef++; if(mesRef>12){mesRef=1;anoRef++;} }

      const valorParcela = parseFloat((valor/parcelas).toFixed(2));
      const registros = [];
      for(let i=0;i<parcelas;i++){
        let m=mesRef+i, a=anoRef;
        while(m>12){m-=12;a++;}
        const ref=`${a}-${String(m).padStart(2,'0')}`;
        registros.push({
          user_id:user.id, card_id:cartaoId, category_id:catId,
          descricao:desc, valor_total:valor, parcelas,
          parcela_atual:i+1, valor_parcela:valorParcela,
          data_compra:data, fatura_referencia:ref, status:'aberta',
        });
      }
      const {error}=await supabase.from('card_transactions').insert(registros);
      if(error) throw error;

    } else {
      // Lançamento normal
      const contaId = el('mobConta').value;
      if(!contaId){ alert('Selecione uma conta.'); btn.disabled=false; btn.textContent='✓ Salvar lançamento'; return; }

      const {error}=await supabase.from('transactions').insert({
        user_id:user.id, account_id:contaId, category_id:catId,
        type:tipoAtual, amount:valor, description:desc,
        date:data, status:'pago',
      });
      if(error) throw error;

      // Atualizar saldo
      const conta = contas.find(c=>c.id===contaId);
      if(conta){
        const novoSaldo = Number(conta.saldo_atual||0) + (tipoAtual==='receita' ? valor : -valor);
        await supabase.from('accounts').update({saldo_atual:novoSaldo}).eq('id',contaId);
        conta.saldo_atual = novoSaldo;
      }

      notificarTransacao({ tipo:tipoAtual, descricao:desc, valor, conta:conta?.nome||'Conta' }).catch(()=>{});
    }

    fecharModal();
    await carregar();
  } catch(e) {
    alert('Erro ao salvar: ' + e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = '✓ Salvar lançamento';
  }
});

// ── Navegação ─────────────────────────────────────────
registrarAcao('scrollTop', () => {
  el('mobScroll').scrollTo({ top: 0, behavior: 'smooth' });
});

registrarAcao('irParaDashboard', () => {
  location.href = '../pages/dashboard.html';
});

registrarAcao('ativarModoAvancado', () => {
  localStorage.setItem('finzen_modo_avancado', 'true');
  location.href = '../pages/dashboard.html';
});

// ── Inicializar ───────────────────────────────────────
try {
  await carregar();
} catch(e) {
  console.error('[mobile] Erro ao carregar:', e);
  const loadEl = document.getElementById('mobLoading');
  if (loadEl) {
    loadEl.innerHTML = `<p style="color:var(--red,#ef4444);padding:16px">
      Erro ao carregar. Verifique sua conexão e recarregue a página.</p>`;
  }
}
