import { supabase } from './supabaseClient.js';
import { navigate } from './router.js';
import { formatCurrency } from './utils.js';

const { data: sd } = await supabase.auth.getSession();
if(!sd.session){ navigate('../login.html'); }
const user = sd.session.user;
document.getElementById('btnLogout').addEventListener('click', async()=>{ await supabase.auth.signOut(); navigate('../login.html'); });

const el = id => document.getElementById(id);
const fmt = v => formatCurrency(v,'BRL');

// ── Utilitários de data ───────────────────────────────
function ultimos12Meses(){
  const meses = [];
  const d = new Date();
  for(let i=11;i>=0;i--){
    const dt = new Date(d.getFullYear(), d.getMonth()-i, 1);
    meses.push(`${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}`);
  }
  return meses;
}

function labelMes(ref){
  const [a,m] = ref.split('-');
  return new Date(Number(a),Number(m)-1,1).toLocaleDateString('pt-BR',{month:'short',year:'2-digit'});
}

function inicioMes(ref){ return `${ref}-01`; }
function fimMes(ref){
  const [a,m]=ref.split('-').map(Number);
  return `${a}-${String(m).padStart(2,'0')}-${new Date(a,m,0).getDate()}`;
}

function mesAtual(){
  const d=new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
}

// ── Carregar dados ────────────────────────────────────
async function carregar(){
  const ref = el('filtroMes').value || mesAtual();
  el('periodoLabel').innerText = new Date(ref+'-15').toLocaleDateString('pt-BR',{month:'long',year:'numeric'});

  const meses12 = ultimos12Meses();
  const inicio12 = inicioMes(meses12[0]);
  const fimAtual = fimMes(ref);

  const [{ data: txMes }, { data: tx12 }, { data: parcelasMes }, { data: cats }] = await Promise.all([
    supabase.from('transactions').select('type,amount,status,category_id,categories:category_id(nome,icon,cor)').eq('user_id',user.id).eq('status','pago').gte('date',inicioMes(ref)).lte('date',fimMes(ref)),
    supabase.from('transactions').select('type,amount,status,date').eq('user_id',user.id).eq('status','pago').gte('date',inicio12).lte('date',fimAtual),
    supabase.from('card_transactions').select('valor_parcela,fatura_referencia').eq('user_id',user.id).eq('fatura_referencia',ref),
    supabase.from('categories').select('id,nome,icon,cor').eq('user_id',user.id),
  ]);

  const tx = txMes||[];
  const receitas   = tx.filter(t=>t.type==='receita').reduce((s,t)=>s+Number(t.amount||0),0);
  const despesas   = tx.filter(t=>t.type==='despesa').reduce((s,t)=>s+Number(t.amount||0),0);
  const faturas    = (parcelasMes||[]).reduce((s,p)=>s+Number(p.valor_parcela||0),0);
  const resultado  = receitas - despesas;
  const totalSaida = despesas + faturas;

  // KPIs
  el('kpiReceitas').innerText  = fmt(receitas);
  el('kpiDespesas').innerText  = fmt(despesas);
  el('kpiFaturas').innerText   = fmt(faturas);
  el('kpiResultado').innerText = fmt(resultado);
  el('kpiResultado').className = resultado>=0?'positive':'negative';

  // Gráfico de barras 12 meses
  renderGrafico12Meses(tx12||[], meses12);

  // Pizza por categoria (despesas)
  renderPizzaCategorias(tx.filter(t=>t.type==='despesa'));

  // Tabela por categoria
  renderTabelaCategorias(tx);

  // Resumo para PDF
  window._dadosRelatorio = { ref, receitas, despesas, faturas, resultado, totalSaida, tx, parcelasMes: parcelasMes||[] };
}

// ── Gráfico 12 meses ─────────────────────────────────
function renderGrafico12Meses(tx, meses){
  const porMes = {};
  meses.forEach(m => { porMes[m]={receita:0,despesa:0}; });
  tx.forEach(t => {
    const m = t.date?.substring(0,7);
    if(porMes[m]){
      if(t.type==='receita') porMes[m].receita+=Number(t.amount||0);
      if(t.type==='despesa') porMes[m].despesa+=Number(t.amount||0);
    }
  });

  const maxVal = Math.max(...meses.flatMap(m=>[porMes[m].receita,porMes[m].despesa]),1);
  const W=100/meses.length;

  el('grafico12meses').innerHTML = `
    <div style="display:flex;align-items:flex-end;gap:2px;height:120px;padding-bottom:24px;position:relative">
      ${meses.map((m,i) => {
        const r = porMes[m].receita;
        const d = porMes[m].despesa;
        const hr = (r/maxVal*100).toFixed(1);
        const hd = (d/maxVal*100).toFixed(1);
        return `
          <div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:1px;height:100%;justify-content:flex-end">
            <div style="width:45%;height:${hr}%;background:var(--success,#22c55e);border-radius:3px 3px 0 0;min-height:${r>0?2:0}px" title="Receita: ${fmt(r)}"></div>
            <div style="width:45%;height:${hd}%;background:var(--danger,#ef4444);border-radius:3px 3px 0 0;min-height:${d>0?2:0}px" title="Despesa: ${fmt(d)}"></div>
            <span style="font-size:9px;color:var(--muted);position:absolute;bottom:0;transform:translateX(0)">${labelMes(m)}</span>
          </div>
        `;
      }).join('')}
    </div>
    <div style="display:flex;gap:16px;margin-top:8px;font-size:12px">
      <span style="display:flex;align-items:center;gap:4px"><span style="width:10px;height:10px;border-radius:2px;background:var(--success,#22c55e);display:inline-block"></span>Receita</span>
      <span style="display:flex;align-items:center;gap:4px"><span style="width:10px;height:10px;border-radius:2px;background:var(--danger,#ef4444);display:inline-block"></span>Despesa</span>
    </div>
  `;
}

// ── Pizza por categoria ───────────────────────────────
const CORES = ['#f59e0b','#22c55e','#f59e0b','#ef4444','#7c5cfc','#06b6d4','#f97316','#ec4899','#84cc16','#8b5cf6'];

function renderPizzaCategorias(despesas){
  if(!despesas.length){
    el('pizzaCategorias').innerHTML = '<p class="muted" style="font-size:13px">Nenhuma despesa no período.</p>';
    return;
  }

  const grupos = {};
  despesas.forEach(t => {
    const nome = t.categories?.nome||'Sem categoria';
    const icon = t.categories?.icon||'';
    const cor  = t.categories?.cor;
    if(!grupos[nome]) grupos[nome]={nome,icon,cor,total:0};
    grupos[nome].total+=Number(t.amount||0);
  });

  const items = Object.values(grupos).sort((a,b)=>b.total-a.total).slice(0,8);
  const total = items.reduce((s,i)=>s+i.total,0);

  const R=55,cx=65,cy=65,stroke=20,circ=2*Math.PI*R;
  let offset=0;
  const segs = items.map((item,i) => {
    const pct=item.total/total;
    const dash=pct*circ;
    item._cor=item.cor||CORES[i%CORES.length];
    const seg=`<circle cx="${cx}" cy="${cy}" r="${R}" fill="none" stroke="${item._cor}" stroke-width="${stroke}"
      stroke-dasharray="${dash} ${circ-dash}" stroke-dashoffset="${-offset}" transform="rotate(-90 ${cx} ${cy})"/>`;
    offset+=dash;
    return seg;
  });

  el('pizzaCategorias').innerHTML = `
    <div style="display:flex;gap:20px;align-items:center;flex-wrap:wrap">
      <svg width="130" height="130" viewBox="0 0 130 130" style="flex-shrink:0">
        ${segs.join('')}
        <text x="${cx}" y="${cy+4}" text-anchor="middle" fill="var(--text)" font-size="10" font-weight="800">${fmt(total)}</text>
      </svg>
      <div style="flex:1;min-width:120px">
        ${items.map(item=>`
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:7px;font-size:12px">
            <span style="width:10px;height:10px;border-radius:50%;background:${item._cor};flex-shrink:0"></span>
            <span style="flex:1">${item.icon} ${item.nome}</span>
            <span style="color:var(--muted);font-size:11px;font-weight:700">${(item.total/total*100).toFixed(1)}%</span>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

// ── Tabela por categoria ──────────────────────────────
function renderTabelaCategorias(tx){
  const grupos = {};
  tx.forEach(t => {
    const nome = t.categories?.nome||'Sem categoria';
    const icon = t.categories?.icon||'';
    if(!grupos[nome]) grupos[nome]={nome,icon,receita:0,despesa:0};
    if(t.type==='receita') grupos[nome].receita+=Number(t.amount||0);
    if(t.type==='despesa') grupos[nome].despesa+=Number(t.amount||0);
  });

  const items = Object.values(grupos).sort((a,b)=>(b.receita+b.despesa)-(a.receita+a.despesa));

  el('tabelaCategorias').innerHTML = `
    <table class="data-table">
      <thead><tr><th>Categoria</th><th style="text-align:right">Receita</th><th style="text-align:right">Despesa</th><th style="text-align:right">Saldo</th></tr></thead>
      <tbody>
        ${items.map(i=>`
          <tr>
            <td>${i.icon} ${i.nome}</td>
            <td class="money positive" style="text-align:right">${i.receita>0?fmt(i.receita):'-'}</td>
            <td class="money negative" style="text-align:right">${i.despesa>0?'-'+fmt(i.despesa):'-'}</td>
            <td class="money ${i.receita-i.despesa>=0?'positive':'negative'}" style="text-align:right">${fmt(i.receita-i.despesa)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

// ── Exportar PDF ──────────────────────────────────────
async function exportarPDF(){
  const d = window._dadosRelatorio;
  if(!d){ alert('Carregue o relatório primeiro.'); return; }

  const ref = d.ref;
  const periodo = new Date(ref+'-15').toLocaleDateString('pt-BR',{month:'long',year:'numeric'});

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
  <title>Relatório FinZen — ${periodo}</title>
  <style>
    body{font-family:Arial,sans-serif;color:#1a1a2e;padding:32px;max-width:800px;margin:0 auto}
    h1{color:#f59e0b;margin-bottom:4px}
    .sub{color:#888;font-size:13px;margin-bottom:24px}
    .kpi-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:24px}
    .kpi{border:1px solid #e0e0e0;border-radius:10px;padding:14px;text-align:center}
    .kpi span{display:block;font-size:11px;color:#888;margin-bottom:4px}
    .kpi strong{font-size:17px;font-weight:800}
    .positive{color:#22c55e} .negative{color:#ef4444}
    h2{font-size:14px;font-weight:800;margin:20px 0 10px;border-bottom:2px solid #f59e0b;padding-bottom:4px}
    table{width:100%;border-collapse:collapse;font-size:13px}
    th{background:#f5f5f5;padding:8px 10px;text-align:left;font-weight:700}
    td{padding:8px 10px;border-bottom:1px solid #eee}
    .right{text-align:right}
    .footer{margin-top:32px;font-size:11px;color:#aaa;text-align:center}
  </style></head><body>
  <h1>Relatório Financeiro — FinZen</h1>
  <p class="sub">Período: ${periodo} · Gerado em ${new Date().toLocaleString('pt-BR')}</p>

  <div class="kpi-grid">
    <div class="kpi"><span>Receitas</span><strong class="positive">${fmt(d.receitas)}</strong></div>
    <div class="kpi"><span>Despesas</span><strong class="negative">${fmt(d.despesas)}</strong></div>
    <div class="kpi"><span>Faturas Cartão</span><strong class="negative">${fmt(d.faturas)}</strong></div>
    <div class="kpi"><span>Resultado</span><strong class="${d.resultado>=0?'positive':'negative'}">${fmt(d.resultado)}</strong></div>
  </div>

  <h2>Lançamentos por Categoria</h2>
  <table>
    <thead><tr><th>Categoria</th><th class="right">Receita</th><th class="right">Despesa</th><th class="right">Saldo</th></tr></thead>
    <tbody>
      ${(() => {
        const grupos={};
        (d.tx||[]).forEach(t=>{
          const nome=t.categories?.nome||'Sem categoria';
          if(!grupos[nome]) grupos[nome]={nome,receita:0,despesa:0};
          if(t.type==='receita') grupos[nome].receita+=Number(t.amount||0);
          if(t.type==='despesa') grupos[nome].despesa+=Number(t.amount||0);
        });
        return Object.values(grupos).map(i=>`
          <tr>
            <td>${i.nome}</td>
            <td class="right ${i.receita>0?'positive':''}">${i.receita>0?fmt(i.receita):'-'}</td>
            <td class="right ${i.despesa>0?'negative':''}">${i.despesa>0?fmt(i.despesa):'-'}</td>
            <td class="right ${i.receita-i.despesa>=0?'positive':'negative'}">${fmt(i.receita-i.despesa)}</td>
          </tr>
        `).join('');
      })()}
    </tbody>
  </table>

  <div class="footer">FinZen · Relatório gerado automaticamente</div>
  </body></html>`;

  const win = window.open('','_blank');
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(()=>{ win.print(); }, 500);
}

// ── Eventos ───────────────────────────────────────────
el('filtroMes').addEventListener('change', carregar);
el('btnExportarPDF').addEventListener('click', exportarPDF);

el('filtroMes').value = mesAtual();
carregar();
