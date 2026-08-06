import { supabase, requireAuth } from './supabaseClient.js';
import { navigate } from './router.js';
import { formatCurrency } from './utils.js';
import { escapeHtml } from './utils/escapeHtml.js';
import { refName, currentMonthRef, addMonthsRef } from './services/cardService.js';
import { registrarAcao } from './eventBus.js';

const user = await requireAuth();

const el = id => document.getElementById(id);
const fmt = v => formatCurrency(v, 'BRL');

document.getElementById('btnLogout').addEventListener('click', async () => {
  await supabase.auth.signOut();
  navigate('../login.html');
});

const filtroCartao      = el('filtroCartao');
const chkMostrarQuitadas = el('chkMostrarQuitadas');
const mensagem           = el('mensagemParcelamentos');
const resumoCards        = el('resumoCards');
const tabelaProjecao     = el('tabelaProjecao');
const listaCompras       = el('listaCompras');

let cartoes = [];
let linhas  = [];   // todas as linhas de card_transactions com parcelas > 1
let grupos  = [];   // compras agrupadas

function msg(texto, tipo = 'info'){
  mensagem.className = `message ${tipo}`;
  mensagem.innerText = texto;
}

function formatarData(dataISO){
  if(!dataISO) return '-';
  const [ano, mes, dia] = dataISO.split('-');
  return `${dia}/${mes}/${ano}`;
}

function chaveGrupo(row){
  return row.purchase_group_id || `${row.card_id}|${row.parcelas}|${row.valor_total}|${row.data_compra}|${row.descricao}`;
}

async function carregarDados(){
  const [{ data: cartoesData }, { data: rows }] = await Promise.all([
    supabase.from('credit_cards').select('id,nome').eq('user_id', user.id).order('nome'),
    supabase.from('card_transactions')
      .select('id,card_id,descricao,valor_total,valor_parcela,parcelas,parcela_atual,fatura_referencia,status,data_compra,purchase_group_id,credit_cards:card_id(nome)')
      .eq('user_id', user.id)
      .gt('parcelas', 1)
      .order('data_compra', { ascending: false }),
  ]);

  cartoes = cartoesData || [];
  linhas  = rows || [];

  filtroCartao.innerHTML = '<option value="">Todos os cartões</option>' +
    cartoes.map(c => `<option value="${c.id}">${escapeHtml(c.nome)}</option>`).join('');

  montarGrupos();
}

function montarGrupos(){
  const mapa = new Map();
  linhas.forEach(row => {
    const chave = chaveGrupo(row);
    if(!mapa.has(chave)){
      mapa.set(chave, {
        chave,
        cardId: row.card_id,
        cartaoNome: row.credit_cards?.nome || '-',
        descricao: row.descricao,
        valorTotal: Number(row.valor_total || 0),
        valorParcela: Number(row.valor_parcela || 0),
        parcelas: row.parcelas,
        dataCompra: row.data_compra,
        itens: [],
      });
    }
    mapa.get(chave).itens.push(row);
  });

  grupos = Array.from(mapa.values()).map(g => {
    g.itens.sort((a, b) => a.parcela_atual - b.parcela_atual);
    const pagas = g.itens.filter(i => i.status === 'paga').length;
    const abertas = g.itens.filter(i => i.status !== 'paga');
    g.pagas = pagas;
    g.quitada = abertas.length === 0;
    g.proxima = abertas[0] || null;
    return g;
  }).sort((a, b) => {
    if(a.quitada !== b.quitada) return a.quitada ? 1 : -1;
    return (a.proxima?.fatura_referencia || '').localeCompare(b.proxima?.fatura_referencia || '');
  });
}

function renderResumo(gruposFiltrados){
  const abertas = gruposFiltrados.flatMap(g => g.itens.filter(i => i.status !== 'paga'));
  const totalRestante = abertas.reduce((s, i) => s + Number(i.valor_parcela || 0), 0);
  const emAndamento = gruposFiltrados.filter(g => !g.quitada).length;

  const mesAtual = currentMonthRef();
  const mesProximo = addMonthsRef(mesAtual, 1);
  const somaMes = ref => abertas.filter(i => i.fatura_referencia === ref).reduce((s, i) => s + Number(i.valor_parcela || 0), 0);

  resumoCards.innerHTML = `
    <div class="panel" style="padding:16px 20px">
      <p class="muted" style="margin:0 0 4px;font-size:12px">Restante em parcelas abertas</p>
      <p style="margin:0;font-size:1.3rem;font-weight:800">${fmt(totalRestante)}</p>
    </div>
    <div class="panel" style="padding:16px 20px">
      <p class="muted" style="margin:0 0 4px;font-size:12px">Compras em andamento</p>
      <p style="margin:0;font-size:1.3rem;font-weight:800">${emAndamento}</p>
    </div>
    <div class="panel" style="padding:16px 20px">
      <p class="muted" style="margin:0 0 4px;font-size:12px">Comprometido em ${refName(mesAtual)}</p>
      <p style="margin:0;font-size:1.3rem;font-weight:800">${fmt(somaMes(mesAtual))}</p>
    </div>
    <div class="panel" style="padding:16px 20px">
      <p class="muted" style="margin:0 0 4px;font-size:12px">Comprometido em ${refName(mesProximo)}</p>
      <p style="margin:0;font-size:1.3rem;font-weight:800">${fmt(somaMes(mesProximo))}</p>
    </div>`;
}

function renderProjecao(gruposFiltrados){
  const abertas = gruposFiltrados.flatMap(g => g.itens.filter(i => i.status !== 'paga'));
  if(!abertas.length){
    tabelaProjecao.innerHTML = '<p class="muted" style="padding:16px 20px">Nenhuma parcela em aberto.</p>';
    return;
  }

  const mesAtual = currentMonthRef();
  const meses = Array.from({ length: 12 }, (_, i) => addMonthsRef(mesAtual, i));
  const porMes = meses.map(ref => ({
    ref,
    total: abertas.filter(i => i.fatura_referencia === ref).reduce((s, i) => s + Number(i.valor_parcela || 0), 0),
  })).filter((m, idx) => m.total > 0 || idx === 0);

  tabelaProjecao.innerHTML = `
    <table class="data-table" style="width:100%">
      <thead><tr>${porMes.map(m => `<th>${refName(m.ref)}</th>`).join('')}</tr></thead>
      <tbody><tr>${porMes.map(m => `<td>${m.total > 0 ? fmt(m.total) : '-'}</td>`).join('')}</tr></tbody>
    </table>`;
}

function renderLista(gruposFiltrados){
  if(!gruposFiltrados.length){
    listaCompras.innerHTML = '<p class="muted" style="padding:16px 20px">Nenhuma compra parcelada encontrada.</p>';
    return;
  }

  listaCompras.innerHTML = gruposFiltrados.map(g => {
    const pct = Math.round((g.pagas / g.parcelas) * 100);
    const statusTexto = g.quitada
      ? 'Quitada'
      : `Próxima: ${refName(g.proxima.fatura_referencia)} (${g.proxima.status})`;

    return `
      <article class="panel installment-card" style="margin-bottom:12px;padding:0;overflow:hidden">
        <div class="installment-card-header" data-action="toggleParcelamento" data-chave="${escapeHtml(g.chave)}" style="padding:14px 18px;cursor:pointer;display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap">
          <div>
            <p style="margin:0;font-weight:800">${escapeHtml(g.descricao || '(sem descrição)')}</p>
            <p class="muted" style="margin:2px 0 0;font-size:12px">${escapeHtml(g.cartaoNome)} · ${formatarData(g.dataCompra)}</p>
          </div>
          <div style="text-align:right">
            <p style="margin:0;font-family:var(--font-mono);font-weight:800">${fmt(g.valorTotal)}</p>
            <p class="muted" style="margin:2px 0 0;font-size:12px">${g.pagas}/${g.parcelas} pagas · ${fmt(g.valorParcela)}/mês</p>
          </div>
        </div>
        <div style="height:4px;background:rgba(255,255,255,.06)">
          <div style="height:100%;width:${pct}%;background:${g.quitada ? 'var(--success,#3f8f63)' : 'var(--accent)'}"></div>
        </div>
        <div style="padding:8px 18px;font-size:12px" class="${g.quitada ? 'muted' : ''}">${statusTexto}</div>
        <div class="installment-detail" data-chave-detail="${escapeHtml(g.chave)}" style="display:none;border-top:1px solid var(--border)">
          <table class="data-table" style="width:100%">
            <thead><tr><th>Parcela</th><th>Fatura</th><th>Valor</th><th>Status</th></tr></thead>
            <tbody>
              ${g.itens.map(i => `
                <tr>
                  <td>${i.parcela_atual}/${i.parcelas}</td>
                  <td>${refName(i.fatura_referencia)}</td>
                  <td>${fmt(i.valor_parcela)}</td>
                  <td>${i.status === 'paga' ? '✅ Paga' : '⏳ Em aberto'}</td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </article>`;
  }).join('');
}

function gruposFiltradosAtuais(){
  const cardId = filtroCartao.value;
  return grupos.filter(g => {
    if(cardId && g.cardId !== cardId) return false;
    if(!chkMostrarQuitadas.checked && g.quitada) return false;
    return true;
  });
}

function render(){
  const filtrados = gruposFiltradosAtuais();
  renderResumo(filtrados);
  renderProjecao(filtrados);
  renderLista(filtrados);
}

registrarAcao('toggleParcelamento', (elClicado) => {
  const chave = elClicado.dataset.chave;
  const detalhe = listaCompras.querySelector(`[data-chave-detail="${CSS.escape(chave)}"]`);
  if(detalhe) detalhe.style.display = detalhe.style.display === 'none' ? '' : 'none';
});

filtroCartao.addEventListener('change', render);
chkMostrarQuitadas.addEventListener('change', render);

msg('Carregando dados...');
await carregarDados();
msg('');
render();
