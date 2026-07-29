import { supabase, requireAuth } from './supabaseClient.js';
import { navigate } from './router.js';
import { formatCurrency } from './utils.js';
import { attachMoneyMask, readMoneyValue } from './moneyMask.js';
import { escapeHtml } from './utils/escapeHtml.js';
import { hojeISO } from './utils/dateUtils.js';
import { getUsdBrlRate, convertToBRL } from './services/financeService.js';
import { invoiceRef, addMonthsRef, refName, currentMonthRef } from './services/cardService.js';
import { comTrava } from './toast.js';

const user = await requireAuth();

const el = id => document.getElementById(id);
const fmt = v => formatCurrency(v, 'BRL');

document.getElementById('btnLogout').addEventListener('click', async () => {
  await supabase.auth.signOut();
  navigate('../login.html');
});

const descricaoCompra = el('descricaoCompra');
const valorCompra     = el('valorCompra');
const dataCompra      = el('dataCompra');
const formaPagamento  = el('formaPagamento');
const grupoConta      = el('grupoConta');
const grupoCartao     = el('grupoCartao');
const grupoParcelas   = el('grupoParcelas');
const contaCompra     = el('contaCompra');
const cartaoCompra    = el('cartaoCompra');
const parcelasCompra  = el('parcelasCompra');
const btnSimular      = el('btnSimular');
const mensagemCompra  = el('mensagemCompra');
const painelResultado = el('painelResultado');
const veredito        = el('veredito');
const tabelaResultado = el('tabelaResultado');

attachMoneyMask(valorCompra);
dataCompra.value = hojeISO();

let contas = [];
let cartoes = [];
let dolarAtual = 5.15;
let receitasRec = 0;
let despesasRec = 0;
let faturasAbertas = []; // { card_id, fatura_referencia, valor_parcela }
let receitasFuturasPorMes = {}; // { 'YYYY-MM': valor } — lançamentos pendentes reais já agendados
let despesasFuturasPorMes = {};

function addMesesISO(dataISO, meses){
  const [y, m, d] = dataISO.split('-').map(Number);
  const alvo = new Date(y, m - 1 + meses, d);
  return `${alvo.getFullYear()}-${String(alvo.getMonth()+1).padStart(2,'0')}-${String(alvo.getDate()).padStart(2,'0')}`;
}

function mostrarMensagem(texto, tipo = 'info'){
  mensagemCompra.className = `message ${tipo}`;
  mensagemCompra.innerText = texto;
}

function atualizarVisibilidadeCampos(){
  const forma = formaPagamento.value;
  grupoConta.style.display    = forma === 'conta' ? '' : 'none';
  grupoCartao.style.display   = forma === 'conta' ? 'none' : '';
  grupoParcelas.style.display = forma === 'cartao_parcelado' ? '' : 'none';
}
formaPagamento.addEventListener('change', atualizarVisibilidadeCampos);
atualizarVisibilidadeCampos();

// Mesmo horizonte do cron de recorrentes (api/recurring-cron.js) — só existem
// lançamentos pendentes reais gerados até 6 meses à frente, igual à Tendência
// de Gastos do dashboard.
const HORIZONTE_MESES = 6;

async function carregarDados(){
  try { dolarAtual = await getUsdBrlRate(user.id); } catch(_) {}

  const hoje = hojeISO();
  const [
    { data: contasData },
    { data: cartoesData },
    { data: recorrentes },
    { data: faturas },
    { data: pendentesFuturos },
  ] = await Promise.all([
    supabase.from('accounts').select('id,nome,currency,saldo_atual').eq('user_id', user.id).eq('active', true).order('nome'),
    supabase.from('credit_cards').select('id,nome,limite,fechamento_dia,vencimento_dia').eq('user_id', user.id).eq('ativo', true).order('nome'),
    supabase.from('transactions').select('type,amount,accounts:account_id(currency)').eq('user_id', user.id).eq('is_recurring', true).eq('recurrence_active', true),
    supabase.from('card_transactions').select('card_id,fatura_referencia,valor_parcela').eq('user_id', user.id).in('status', ['aberta', 'pendente']),
    // Lançamentos já agendados (recorrentes já materializados + qualquer outro pendente)
    // com data real — mesma fonte que a Tendência de Gastos do dashboard usa pra
    // projetar meses futuros, em vez de repetir a média de recorrentes todo mês.
    supabase.from('transactions').select('type,amount,date,accounts:account_id(currency)').eq('user_id', user.id).eq('status', 'pendente').gte('date', hoje).lte('date', addMesesISO(hoje, HORIZONTE_MESES)),
  ]);

  contas  = contasData  || [];
  cartoes = cartoesData || [];
  faturasAbertas = faturas || [];

  const valorBRL = t => convertToBRL(t.amount, t.accounts?.currency || 'BRL', dolarAtual);
  receitasRec = (recorrentes || []).filter(r => r.type === 'receita').reduce((s, r) => s + valorBRL(r), 0);
  despesasRec = (recorrentes || []).filter(r => r.type === 'despesa').reduce((s, r) => s + valorBRL(r), 0);

  receitasFuturasPorMes = {};
  despesasFuturasPorMes = {};
  (pendentesFuturos || []).forEach(t => {
    const ref = String(t.date).slice(0, 7);
    const alvo = t.type === 'despesa' ? despesasFuturasPorMes : receitasFuturasPorMes;
    alvo[ref] = (alvo[ref] || 0) + valorBRL(t);
  });

  contaCompra.innerHTML = contas.length
    ? contas.map(c => `<option value="${c.id}">${escapeHtml(c.nome)} (${fmt(c.saldo_atual)}${c.currency === 'USD' ? ' USD' : ''})</option>`).join('')
    : '<option value="">Cadastre uma conta primeiro</option>';

  cartaoCompra.innerHTML = cartoes.length
    ? cartoes.map(c => `<option value="${c.id}">${escapeHtml(c.nome)} (limite ${fmt(c.limite)})</option>`).join('')
    : '<option value="">Cadastre um cartão primeiro</option>';
}

function faturaExistente(cardId, ref){
  return faturasAbertas
    .filter(f => f.card_id === cardId && f.fatura_referencia === ref)
    .reduce((s, f) => s + Number(f.valor_parcela || 0), 0);
}

function faturaExistenteTodosCartoes(ref){
  return faturasAbertas
    .filter(f => f.fatura_referencia === ref)
    .reduce((s, f) => s + Number(f.valor_parcela || 0), 0);
}

function offsetMeses(refBase, refAlvo){
  const [ay, am] = refAlvo.split('-').map(Number);
  const [by, bm] = refBase.split('-').map(Number);
  return (ay - by) * 12 + (am - bm);
}

function simularDebitoConta(valor, contaId){
  const conta = contas.find(c => c.id === contaId);
  if(!conta) return null;

  const valorNaMoeda = conta.currency === 'USD' ? valor / dolarAtual : valor;
  const saldoApos = Number(conta.saldo_atual || 0) - valorNaMoeda;
  const reservaBRL = despesasRec > 0 ? despesasRec : 0;
  const saldoAposBRL = convertToBRL(saldoApos, conta.currency || 'BRL', dolarAtual);

  let status = 'cabe';
  if(saldoApos < 0) status = 'estoura';
  else if(reservaBRL > 0 && saldoAposBRL < reservaBRL) status = 'aperta';

  return { conta, saldoApos, status };
}

function simularCartao(valorTotal, parcelas, cardId, dataISO){
  const cartao = cartoes.find(c => c.id === cardId);
  if(!cartao) return null;

  const valorParcela = Number((valorTotal / parcelas).toFixed(2));
  const refBase = invoiceRef(dataISO, Number(cartao.fechamento_dia || 1), Number(cartao.vencimento_dia || 0));
  const refsParcelas = Array.from({ length: parcelas }, (_, i) => addMonthsRef(refBase, i));

  const baseOffset = Math.max(offsetMeses(currentMonthRef(), refBase), 0);
  const totalMesesSimulados = baseOffset + parcelas;

  let saldoAcumulado = contas.reduce((s, c) => s + convertToBRL(c.saldo_atual, c.currency || 'BRL', dolarAtual), 0);
  const linhas = [];

  for(let m = 0; m < totalMesesSimulados; m++){
    const ref = addMonthsRef(currentMonthRef(), m);
    const ehMesDaCompra = refsParcelas.includes(ref);
    const novaParcela = ehMesDaCompra ? valorParcela : 0;

    const faturaExistenteCartao = faturaExistente(cardId, ref);
    const faturaTotalCartao = faturaExistenteCartao + novaParcela;
    const faturasOutrosCartoes = faturaExistenteTodosCartoes(ref) - faturaExistenteCartao;

    // Usa lançamentos já agendados de verdade (mesma fonte da Tendência de Gastos
    // do dashboard) sempre que existirem pra esse mês. O saldo atual das contas já
    // reflete tudo que aconteceu até agora — por isso o mês corrente só soma o que
    // ainda falta acontecer (pendente), nunca um mês inteiro do zero. Além do
    // horizonte de 6 meses (onde não há lançamento real gerado ainda), cai pra
    // média de recorrentes como aproximação.
    const temDadosReais = (ref in receitasFuturasPorMes) || (ref in despesasFuturasPorMes);
    const receitasMes = temDadosReais ? (receitasFuturasPorMes[ref] || 0) : (m === 0 ? 0 : receitasRec);
    const despesasMes = temDadosReais ? (despesasFuturasPorMes[ref] || 0) : (m === 0 ? 0 : despesasRec);

    // Dinheiro disponível no mês ANTES de pagar a fatura deste cartão —
    // é essa sobra que precisa cobrir a fatura pra ela não ficar em aberto/atrasada.
    const disponivelParaFatura = saldoAcumulado + receitasMes - despesasMes - faturasOutrosCartoes;
    const sobraAposFatura = disponivelParaFatura - faturaTotalCartao;
    saldoAcumulado = sobraAposFatura;

    const comprometidoMes = despesasMes + faturasOutrosCartoes + faturaTotalCartao;
    const limite = Number(cartao.limite || 0);
    const limiteEstourado = limite > 0 && faturaTotalCartao > limite;
    const faturaNaoPaga = disponivelParaFatura < faturaTotalCartao;

    let status = 'cabe';
    if(faturaNaoPaga || limiteEstourado) status = 'estoura';
    else if(receitasMes > 0 ? (comprometidoMes / receitasMes) > 0.8 : sobraAposFatura < despesasRec) status = 'aperta';

    if(ehMesDaCompra || linhas.length === 0 || m === totalMesesSimulados - 1){
      linhas.push({
        ref, ehMesDaCompra, novaParcela, faturaTotalCartao,
        limite, limiteEstourado, disponivelParaFatura, faturaNaoPaga,
        comprometidoMes, saldoAcumulado: sobraAposFatura, status,
      });
    }
  }

  return { cartao, linhas };
}

function badgeStatus(status){
  const map = {
    cabe:    { texto: '✅ Cabe',    cor: 'var(--success, #3f8f63)' },
    aperta:  { texto: '⚠️ Aperta',  cor: 'var(--warning, #c08a3e)' },
    estoura: { texto: '🔴 Estoura', cor: 'var(--danger, #cf6a55)' },
  };
  const info = map[status] || map.cabe;
  return `<strong style="color:${info.cor}">${info.texto}</strong>`;
}

function tituloCompra(){
  const desc = descricaoCompra.value.trim();
  return desc ? `<p class="muted" style="margin:0 0 4px">${escapeHtml(desc)}</p>` : '';
}

function renderResultadoConta(resultado, valor){
  painelResultado.style.display = '';
  const { conta, saldoApos, status } = resultado;

  const vereditoTexto = {
    cabe:    '✅ Cabe tranquilamente — não compromete seu saldo.',
    aperta:  '⚠️ Cabe, mas deixa a conta com pouca folga (abaixo da despesa fixa mensal).',
    estoura: '🔴 Não recomendado — a conta ficaria negativa.',
  }[status];

  veredito.innerHTML = `${tituloCompra()}<p style="font-size:15px;margin:0 0 8px">${vereditoTexto}</p>`;

  tabelaResultado.innerHTML = `
    <table class="data-table" style="width:100%">
      <thead><tr><th>Conta</th><th>Saldo atual</th><th>Valor da compra</th><th>Saldo após</th><th>Status</th></tr></thead>
      <tbody>
        <tr>
          <td>${escapeHtml(conta.nome)}</td>
          <td>${fmt(conta.saldo_atual)}${conta.currency === 'USD' ? ' USD' : ''}</td>
          <td>${fmt(valor)}</td>
          <td class="${saldoApos < 0 ? 'negative' : ''}">${saldoApos.toLocaleString('pt-BR', { style:'currency', currency: conta.currency || 'BRL' })}</td>
          <td>${badgeStatus(status)}</td>
        </tr>
      </tbody>
    </table>`;
}

function renderResultadoCartao(resultado){
  painelResultado.style.display = '';
  const { linhas } = resultado;

  const mesSemDinheiro = linhas.find(l => l.faturaNaoPaga);
  const mesLimiteEstourado = linhas.find(l => l.limiteEstourado);
  const piorStatus = linhas.some(l => l.status === 'estoura') ? 'estoura'
    : linhas.some(l => l.status === 'aperta') ? 'aperta' : 'cabe';

  let vereditoTexto = {
    cabe:   '✅ Cabe tranquilamente no fluxo de caixa dos próximos meses — sobra dinheiro pra pagar a fatura em todos os meses.',
    aperta: '⚠️ Dá pra pagar a fatura, mas o orçamento fica apertado em algum mês.',
  }[piorStatus];

  if(piorStatus === 'estoura'){
    if(mesSemDinheiro){
      vereditoTexto = `🔴 Não vai sobrar dinheiro suficiente pra pagar a fatura de ${refName(mesSemDinheiro.ref)} — faltariam ${fmt(mesSemDinheiro.faturaTotalCartao - mesSemDinheiro.disponivelParaFatura)}.`;
    } else if(mesLimiteEstourado){
      vereditoTexto = `🔴 A fatura de ${refName(mesLimiteEstourado.ref)} passaria do limite do cartão em ${fmt(mesLimiteEstourado.faturaTotalCartao - mesLimiteEstourado.limite)}.`;
    }
  }

  veredito.innerHTML = `${tituloCompra()}<p style="font-size:15px;margin:0 0 8px">${vereditoTexto}</p>`;

  tabelaResultado.innerHTML = `
    <table class="data-table" style="width:100%">
      <thead>
        <tr>
          <th>Fatura</th><th>Parcela desta compra</th><th>Fatura total do cartão</th>
          <th>Limite</th><th>Disponível p/ pagar a fatura</th><th>Sobra após pagar</th><th>Status</th>
        </tr>
      </thead>
      <tbody>
        ${linhas.map(l => `
          <tr>
            <td>${refName(l.ref)}</td>
            <td>${l.ehMesDaCompra ? fmt(l.novaParcela) : '-'}</td>
            <td class="${l.limiteEstourado ? 'negative' : ''}">${fmt(l.faturaTotalCartao)}</td>
            <td>${l.limite > 0 ? fmt(l.limite) : '-'}</td>
            <td class="${l.faturaNaoPaga ? 'negative' : ''}">${fmt(l.disponivelParaFatura)}</td>
            <td class="${l.saldoAcumulado < 0 ? 'negative' : ''}">${fmt(l.saldoAcumulado)}</td>
            <td>${badgeStatus(l.status)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>`;
}

async function simular(){
  const valor = readMoneyValue(valorCompra);
  const data  = dataCompra.value || hojeISO();
  const forma = formaPagamento.value;

  if(!valor){
    mostrarMensagem('Informe o valor da compra.', 'warning');
    return;
  }

  mostrarMensagem('');
  painelResultado.style.display = 'none';

  if(forma === 'conta'){
    const contaId = contaCompra.value;
    if(!contaId){ mostrarMensagem('Selecione uma conta.', 'warning'); return; }
    const resultado = simularDebitoConta(valor, contaId);
    if(!resultado){ mostrarMensagem('Conta não encontrada.', 'danger'); return; }
    renderResultadoConta(resultado, valor);
    return;
  }

  const cardId = cartaoCompra.value;
  if(!cardId){ mostrarMensagem('Selecione um cartão.', 'warning'); return; }

  const parcelas = forma === 'cartao_parcelado' ? Math.max(2, Math.min(60, Number(parcelasCompra.value || 2))) : 1;
  const resultado = simularCartao(valor, parcelas, cardId, data);
  if(!resultado){ mostrarMensagem('Cartão não encontrado.', 'danger'); return; }
  renderResultadoCartao(resultado);
}

btnSimular.addEventListener('click', comTrava(btnSimular, simular));

mostrarMensagem('Carregando dados...');
await carregarDados();
mostrarMensagem('');
