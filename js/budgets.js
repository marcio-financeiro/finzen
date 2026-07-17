import { supabase } from './supabaseClient.js';
import { navigate } from './router.js';
import { formatCurrency } from './utils.js';
import { confirmarExclusao } from './confirmModal.js';
import { notificarOrcamentoEstourado } from './telegram.js';
import { attachMoneyMask, readMoneyValue } from './moneyMask.js';
import { escapeHtml } from './utils/escapeHtml.js';

const { data: sd } = await supabase.auth.getSession();
if(!sd.session){ navigate('../login.html'); throw new Error('unauthenticated'); }
const user = sd.session.user;
document.getElementById('btnLogout').addEventListener('click', async()=>{ await supabase.auth.signOut(); navigate('../login.html'); throw new Error('unauthenticated'); });

const el = id => document.getElementById(id);
attachMoneyMask(el('valorPlanejado'));
const MESES_ABREV = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
let categorias = [], orcamentos = [], gastos = {}, mesHerdado = null;

function mesAtual(){ const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`; }
function inicioMes(ref){ return `${ref}-01`; }
function fimMes(ref){ const [a,m]=ref.split('-').map(Number); return `${a}-${String(m).padStart(2,'0')}-${new Date(a,m,0).getDate()}`; }
function msg(t,tipo='info'){ const e=el('mensagemOrcamento'); e.className=`message ${tipo}`; e.innerText=t; }

// ── Carregar ──────────────────────────────────────────
async function carregar(){
  const ref = el('mesReferencia').value || mesAtual();

  const [{ data: cats }, { data: orcs }, { data: tx }, { data: cardTx }] = await Promise.all([
    supabase.from('categories').select('id,nome,icon,tipo').eq('user_id',user.id).eq('tipo','despesa').order('nome'),
    supabase.from('budgets').select('*,categories:category_id(nome,icon)').eq('user_id',user.id).eq('mes_referencia',ref),
    supabase.from('transactions').select('category_id,amount').eq('user_id',user.id).eq('type','despesa').eq('status','pago').gte('date',inicioMes(ref)).lte('date',fimMes(ref)),
    supabase.from('card_transactions').select('category_id,valor_parcela').eq('user_id',user.id).eq('fatura_referencia',ref),
  ]);

  categorias = cats || [];
  orcamentos = orcs || [];
  mesHerdado = null;

  // Sem orçamento configurado para este mês → herda o do mês anterior mais recente (somente leitura)
  if(!orcamentos.length){
    const { data: anteriores } = await supabase.from('budgets')
      .select('*,categories:category_id(nome,icon),mes_referencia')
      .eq('user_id',user.id).lt('mes_referencia',ref)
      .order('mes_referencia',{ascending:false}).limit(50);
    if(anteriores?.length){
      mesHerdado  = anteriores[0].mes_referencia;
      orcamentos  = anteriores.filter(o=>o.mes_referencia===mesHerdado);
    }
  }

  // Gastos reais por categoria (transações + compras no cartão)
  gastos = {};
  (tx||[]).forEach(t => { if(t.category_id) gastos[t.category_id]=(gastos[t.category_id]||0)+Number(t.amount||0); });
  (cardTx||[]).forEach(t => { if(t.category_id) gastos[t.category_id]=(gastos[t.category_id]||0)+Number(t.valor_parcela||0); });

  // Popular select de categorias
  el('categoriaOrcamento').innerHTML = '<option value="">Selecione a categoria</option>' +
    categorias.map(c=>`<option value="${c.id}">${c.icon||''} ${c.nome}</option>`).join('');

  renderKpis();
  renderLista();

  // Notificações Telegram para orçamentos estourados (não notifica sobre orçamento herdado, ainda não é real para este mês)
  if(mesHerdado) return;
  orcamentos.forEach(o => {
    const planejado = Number(o.valor_planejado||0);
    const gasto     = gastos[o.category_id]||0;
    if(planejado > 0 && gasto > planejado){
      notificarOrcamentoEstourado({
        categoria: o.categories?.nome || 'Categoria',
        gasto, limite: planejado, mes: ref,
      }).catch(()=>{});
    }
  });
}

function renderKpis(){
  const planejado = orcamentos.reduce((s,o)=>s+Number(o.valor_planejado||0),0);
  const gasto     = orcamentos.reduce((s,o)=>s+(gastos[o.category_id]||0),0);
  const restante  = planejado - gasto;
  el('totalPlanejado').innerText = formatCurrency(planejado,'BRL');
  el('totalGasto').innerText     = formatCurrency(gasto,'BRL');
  el('saldoRestante').innerText  = formatCurrency(restante,'BRL');
  el('saldoRestante').className  = restante>=0?'positive':'negative';
}

function renderLista(){
  if(!orcamentos.length){
    el('listaOrcamentos').innerHTML = '<p class="muted" style="padding:16px">Nenhum orçamento para este mês. Adicione acima.</p>';
    return;
  }

  const banner = mesHerdado
    ? `<div style="padding:10px 12px;margin-bottom:10px;border-radius:10px;background:var(--surface);border:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap">
        <span style="font-size:12px;color:var(--muted)">↻ Mostrando orçamento herdado de ${MESES_ABREV[Number(mesHerdado.split('-')[1])-1]}/${mesHerdado.split('-')[0].slice(2)}. Nada foi salvo pra este mês ainda.</span>
        <button class="btn btn-primary compact" style="font-size:12px" onclick="copiarParaEsteMes()">Copiar para este mês</button>
      </div>`
    : '';

  el('listaOrcamentos').innerHTML = banner + orcamentos.map(o => {
    const planejado = Number(o.valor_planejado||0);
    const gasto     = gastos[o.category_id]||0;
    const restante  = planejado - gasto;
    const pct       = planejado>0 ? Math.min(gasto/planejado*100,100) : 0;
    const classe    = pct>=100?'over':pct>=80?'warn':'';
    const icon      = o.categories?.icon||'';
    const nome      = o.categories?.nome||'Categoria';

    return `
      <div style="padding:14px 0;border-bottom:1px solid var(--border)">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
          <span style="font-weight:700;font-size:13px">${escapeHtml(icon)} ${escapeHtml(nome)}</span>
          <div style="display:flex;align-items:center;gap:12px">
            <span class="muted" style="font-size:12px">
              ${formatCurrency(gasto,'BRL')} / ${formatCurrency(planejado,'BRL')}
              <span class="${pct>=100?'negative':pct>=80?'':'positive'}" style="margin-left:4px;font-weight:700">${pct.toFixed(0)}%</span>
            </span>
            <span class="${restante>=0?'positive':'negative'}" style="font-family:var(--font-mono);font-size:13px">${restante>=0?'+':''}${formatCurrency(restante,'BRL')}</span>
            ${mesHerdado ? '' : `<button class="btn btn-danger compact" onclick="excluir('${o.id}','${escapeHtml(nome).replace(/'/g,'&#39;')}')">✕</button>`}
          </div>
        </div>
        <div style="height:8px;background:var(--border);border-radius:99px;overflow:hidden">
          <div style="height:8px;border-radius:99px;background:${pct>=100?'var(--danger)':pct>=80?'var(--warning,#f59e0b)':'var(--accent)'};width:${pct}%;transition:width .4s"></div>
        </div>
        ${pct>=100?`<p style="font-size:11px;color:var(--danger);margin-top:4px">Limite ultrapassado em ${formatCurrency(Math.abs(restante),'BRL')}</p>`:''}
        ${pct>=80&&pct<100?`<p style="font-size:11px;color:var(--warning,#f59e0b);margin-top:4px">Atenção: ${(100-pct).toFixed(0)}% do limite restante</p>`:''}
      </div>
    `;
  }).join('');
}

async function salvar(){
  const ref      = el('mesReferencia').value;
  const catId    = el('categoriaOrcamento').value;
  const valor    = readMoneyValue(el('valorPlanejado'));

  if(!ref || !catId || !valor){ msg('Preencha mês, categoria e valor.','warning'); return; }

  // Verificar duplicata (ignora itens herdados — eles não pertencem a este mês ainda)
  const jaExiste = !mesHerdado && orcamentos.find(o=>o.category_id===catId);
  if(jaExiste){ msg('Já existe orçamento para esta categoria neste mês. Exclua e recadastre.','warning'); return; }

  const { error } = await supabase.from('budgets').insert({
    user_id:user.id, mes_referencia:ref, category_id:catId, valor_planejado:valor
  });

  if(error){ msg('Erro: '+error.message,'danger'); return; }
  msg('Orçamento salvo!','success');
  el('categoriaOrcamento').value='';
  el('valorPlanejado').value='';
  await carregar();
}

window.excluir = async function(id, nome){
  if(!await confirmarExclusao(`Excluir orçamento de <strong>${nome}</strong>?`)) return;
  await supabase.from('budgets').delete().eq('id',id).eq('user_id',user.id);
  await carregar();
};

window.copiarParaEsteMes = async function(){
  if(!mesHerdado) return;
  const ref = el('mesReferencia').value || mesAtual();
  const { error } = await supabase.from('budgets').insert(
    orcamentos.map(o => ({ user_id:user.id, mes_referencia:ref, category_id:o.category_id, valor_planejado:o.valor_planejado }))
  );
  if(error){ msg('Erro ao copiar: '+error.message,'danger'); return; }
  msg('Orçamento copiado para este mês!','success');
  await carregar();
};

el('btnSalvarOrcamento').addEventListener('click', salvar);
el('mesReferencia').addEventListener('change', carregar);

// Definir mês atual como padrão
el('mesReferencia').value = mesAtual();
carregar();
