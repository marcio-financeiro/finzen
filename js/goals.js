import { supabase }         from './supabaseClient.js';
import { navigate }         from './router.js';
import { formatCurrency }   from './utils.js';
import { confirmarExclusao} from './confirmModal.js';
import { registrarAcao }    from './eventBus.js';
import { notificarMetaAtingida } from './telegram.js';

const { data: sd } = await supabase.auth.getSession();
if(!sd.session){ navigate('../login.html'); }
const user = sd.session.user;
document.getElementById('userEmail').innerText = user.email;
document.getElementById('btnLogout').addEventListener('click', async()=>{ await supabase.auth.signOut(); navigate('../login.html'); });

const el  = id => document.getElementById(id);
const fmt = v  => formatCurrency(v, 'BRL');

let editandoId   = null;
let saldoContas  = 0;   // saldo disponível atual
let mediaAporteMensal = 0; // média de poupança dos últimos 3 meses

// ── Utilitários ───────────────────────────────────────
function diasRestantes(iso){
  if(!iso) return null;
  const diff = new Date(iso+'T00:00:00') - new Date(new Date().toISOString().split('T')[0]+'T00:00:00');
  return Math.ceil(diff/(1000*60*60*24));
}
function mesesRestantes(iso){
  if(!iso) return null;
  const dias = diasRestantes(iso);
  return dias !== null ? Math.max(Math.ceil(dias/30), 1) : null;
}
function fmtData(iso){
  if(!iso) return '-';
  const [a,m,d]=iso.split('-'); return `${d}/${m}/${a}`;
}
function msg(t,tipo='info'){ const e=el('mensagemMeta'); e.className=`message ${tipo}`; e.innerText=t; }

function statusMeta(pct, iso){
  if(pct>=100) return {texto:'✅ Concluída', classe:'success'};
  const dias = diasRestantes(iso);
  if(dias!==null && dias<0) return {texto:'⏰ Vencida', classe:'danger'};
  if(pct>=80) return {texto:'🔥 Avançada', classe:'success'};
  if(pct>=40) return {texto:'▶ Em andamento', classe:'neutral'};
  return {texto:'🌱 Inicial', classe:'neutral'};
}

// ── Análise de viabilidade ────────────────────────────
function analisarViabilidade(meta, mediaAporte){
  const alvo   = Number(meta.valor_alvo||0);
  const atual  = Number(meta.valor_atual||0);
  const falta  = Math.max(alvo - atual, 0);
  const meses  = mesesRestantes(meta.data_alvo);

  if(!falta || falta === 0) return null; // concluída

  const porMesNecessario = meses ? falta / meses : null;

  // Sem prazo definido — só mostra sugestão baseada na média
  if(!meses){
    const tempoComMedia = mediaAporte > 0 ? Math.ceil(falta / mediaAporte) : null;
    return {
      porMesNecessario: null,
      tempoComMedia,
      viavel: null,
      alertas: [],
      sugestaoAporte: mediaAporte > 0 ? Math.min(mediaAporte, falta) : null,
    };
  }

  const viavel = mediaAporte > 0 && porMesNecessario <= mediaAporte * 1.5;
  const alertas = [];

  if(porMesNecessario > mediaAporte * 1.5){
    alertas.push({ tipo:'danger', texto:`Ritmo atual insuficiente. Você poupa ~${fmt(mediaAporte)}/mês mas precisa de ${fmt(porMesNecessario)}/mês.` });
  } else if(porMesNecessario > mediaAporte){
    alertas.push({ tipo:'warning', texto:`Vai apertar. Precisará de ${fmt(porMesNecessario)}/mês vs sua média de ${fmt(mediaAporte)}/mês.` });
  } else {
    alertas.push({ tipo:'success', texto:`No ritmo atual você atinge a meta antes do prazo! ✓` });
  }

  // Alerta se prazo muito curto
  const diasRest = diasRestantes(meta.data_alvo);
  if(diasRest !== null && diasRest <= 30 && falta > 0){
    alertas.push({ tipo:'danger', texto:`Menos de 30 dias para o prazo com ${fmt(falta)} ainda pendente.` });
  }

  return {
    porMesNecessario,
    mesesRestantes: meses,
    viavel,
    alertas,
    sugestaoAporte: porMesNecessario ? Math.ceil(porMesNecessario) : null,
  };
}

// ── Carregar contexto financeiro ─────────────────────
async function carregarContexto(){
  const hoje   = new Date();
  const mes3   = new Date(hoje.getFullYear(), hoje.getMonth()-3, 1).toISOString().split('T')[0];
  const hojeISO = hoje.toISOString().split('T')[0];

  const [{ data: contas }, { data: txHistorico }] = await Promise.all([
    supabase.from('accounts').select('saldo_atual,currency').eq('user_id',user.id).eq('active',true),
    supabase.from('transactions').select('type,amount,date').eq('user_id',user.id)
      .gte('date', mes3).lte('date', hojeISO).eq('status','pago'),
  ]);

  // Saldo total BRL
  saldoContas = (contas||[]).filter(c=>(c.currency||'BRL')==='BRL')
    .reduce((s,c)=>s+Number(c.saldo_atual||0), 0);

  // Média de poupança mensal (receitas - despesas por mês)
  const porMes = {};
  (txHistorico||[]).forEach(t => {
    const m = t.date?.slice(0,7);
    if(!m) return;
    if(!porMes[m]) porMes[m] = { rec:0, desp:0 };
    if(t.type==='receita') porMes[m].rec  += Number(t.amount||0);
    if(t.type==='despesa') porMes[m].desp += Number(t.amount||0);
  });
  const saldosMensais = Object.values(porMes).map(m => Math.max(m.rec - m.desp, 0));
  mediaAporteMensal = saldosMensais.length
    ? saldosMensais.reduce((s,v)=>s+v,0) / saldosMensais.length
    : 0;
}

// ── Modal de Aporte ───────────────────────────────────
registrarAcao('abrirModalAporte', (el) => {
  const id       = el.dataset.metaId;
  const nome     = el.dataset.metaNome;
  const falta    = Number(el.dataset.falta);
  const sugestao = Number(el.dataset.sugestao);

  // Remove modal anterior
  document.getElementById('modalAporte')?.remove();

  const modal = document.createElement('div');
  modal.id = 'modalAporte';
  modal.innerHTML = `
    <div style="position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:9997;display:flex;align-items:center;justify-content:center;padding:16px">
      <div style="background:var(--surface);border:1px solid var(--border);border-radius:16px;width:100%;max-width:420px;padding:24px">
        <h3 style="font-size:15px;margin-bottom:4px">💰 Aportar para meta</h3>
        <p style="color:var(--muted);font-size:13px;margin-bottom:20px">${nome}</p>

        <div style="background:var(--surface-2,rgba(255,255,255,.04));border:1px solid var(--border);border-radius:10px;padding:14px;margin-bottom:16px">
          <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:6px">
            <span class="muted">Falta para a meta</span>
            <strong class="negative">${fmt(falta)}</strong>
          </div>
          <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:6px">
            <span class="muted">Saldo disponível em conta</span>
            <strong class="${saldoContas>=falta?'positive':'negative'}">${fmt(saldoContas)}</strong>
          </div>
          ${sugestao ? `
          <div style="display:flex;justify-content:space-between;font-size:12px">
            <span class="muted">Aporte sugerido/mês</span>
            <strong style="color:#f59e0b">${fmt(sugestao)}</strong>
          </div>` : ''}
        </div>

        <label style="font-size:12px;color:var(--muted);display:block;margin-bottom:6px">Valor a aportar (R$)</label>
        <input type="number" id="inputAporte" placeholder="0,00" step="0.01" min="0"
          value="${sugestao ? sugestao.toFixed(2) : ''}" inputmode="decimal"
          style="width:100%;padding:10px 14px;border:1px solid var(--border);border-radius:8px;background:var(--surface);color:var(--text);font-size:14px;margin-bottom:16px">

        <div style="display:flex;gap:8px">
          <button onclick="document.getElementById('modalAporte').remove()"
            style="flex:1;padding:10px;border:1px solid var(--border);border-radius:8px;background:transparent;color:var(--muted);cursor:pointer">
            Cancelar
          </button>
          <button data-action="confirmarAporte" data-meta-id="${id}" data-meta-nome="${nome.replace(/"/g,'&quot;')}"
            style="flex:2;padding:10px;border:none;border-radius:8px;background:linear-gradient(135deg,#22c55e,#16a34a);color:#fff;font-weight:700;cursor:pointer;font-size:13px">
            ✓ Confirmar aporte
          </button>
        </div>
      </div>
    </div>`;
  document.body.appendChild(modal);
  document.getElementById('inputAporte').focus();
  document.getElementById('inputAporte').select();
});

registrarAcao('confirmarAporte', async (el) => {
  const id   = el.dataset.metaId;
  const nome = el.dataset.metaNome;
  const valor = parseFloat((document.getElementById('inputAporte')?.value||'0').replace(',','.'));
  if(isNaN(valor) || valor <= 0){ alert('Informe um valor válido.'); return; }

  const { data: meta } = await supabase.from('goals').select('valor_atual,valor_alvo').eq('id',id).single();
  if(!meta) return;

  const novoValor = Number(meta.valor_atual||0) + valor;
  await supabase.from('goals').update({ valor_atual: novoValor }).eq('id',id).eq('user_id',user.id);

  if(novoValor >= Number(meta.valor_alvo||0) && meta.valor_alvo > 0){
    notificarMetaAtingida({ id, nome, valor: novoValor }).catch(()=>{});
  }

  document.getElementById('modalAporte')?.remove();
  msg(`Aporte de ${fmt(valor)} registrado para "${nome}"!`, 'success');
  await carregar();
});

// ── Salvar / Editar ───────────────────────────────────
async function salvar(){
  const nome      = el('nomeMeta').value.trim();
  const descricao = el('descricaoMeta').value.trim();
  const alvo      = Number(el('valorAlvo').value||0);
  const atual     = Number(el('valorAtual').value||0);
  const dataAlvo  = el('dataAlvo').value||null;
  const categoria = el('categoriaMeta').value||'geral';
  const cor       = el('corMeta').value||'#22c55e';

  if(!nome||!alvo){ msg('Preencha nome e valor alvo.','warning'); return; }

  const payload = { user_id:user.id, nome, descricao, valor_alvo:alvo, valor_atual:atual, data_alvo:dataAlvo, categoria, cor, ativo:true };

  let error;
  if(editandoId){
    ({ error } = await supabase.from('goals').update(payload).eq('id',editandoId).eq('user_id',user.id));
  } else {
    ({ error } = await supabase.from('goals').insert(payload));
  }

  if(error){ msg('Erro: '+error.message,'danger'); return; }
  msg(editandoId?'Meta atualizada!':'Meta salva!','success');
  limpar();
  await carregar();
}

function limpar(){
  editandoId = null;
  ['nomeMeta','descricaoMeta','valorAlvo','valorAtual','dataAlvo'].forEach(id=>{ el(id).value=''; });
  el('categoriaMeta').value='geral';
  el('corMeta').value='#22c55e';
  el('btnSalvarMeta').innerText='+ Salvar Meta';
  el('btnCancelarEdicao').style.display='none';
}

registrarAcao('editarMeta', async (el) => {
  const id = el.dataset.metaId;
  const { data } = await supabase.from('goals').select('*').eq('id',id).single();
  if(!data) return;
  editandoId = id;
  el('nomeMeta').value      = data.nome||'';
  el('descricaoMeta').value = data.descricao||'';
  el('valorAlvo').value     = data.valor_alvo||'';
  el('valorAtual').value    = data.valor_atual||'';
  el('dataAlvo').value      = data.data_alvo||'';
  el('categoriaMeta').value = data.categoria||'geral';
  el('corMeta').value       = data.cor||'#22c55e';
  el('btnSalvarMeta').innerText='Salvar Alterações';
  el('btnCancelarEdicao').style.display='inline-block';
  el('nomeMeta').focus();
  el('nomeMeta').scrollIntoView({behavior:'smooth'});
});

registrarAcao('excluirMeta', async (el) => {
  const id   = el.dataset.metaId;
  const nome = el.dataset.metaNome;
  if(!await confirmarExclusao(`Excluir a meta <strong>${nome}</strong>?`)) return;
  await supabase.from('goals').update({ativo:false}).eq('id',id).eq('user_id',user.id);
  await carregar();
});

// ── Carregar ──────────────────────────────────────────
async function carregar(){
  const { data, error } = await supabase.from('goals').select('*')
    .eq('user_id',user.id).eq('ativo',true).order('created_at',{ascending:false});
  if(error){ el('listaMetas').innerHTML='<p class="muted">Erro ao carregar.</p>'; return; }
  const metas = data||[];
  renderKpis(metas);
  renderMetas(metas);
}

function renderKpis(metas){
  const alvo  = metas.reduce((s,m)=>s+Number(m.valor_alvo||0),0);
  const atual = metas.reduce((s,m)=>s+Number(m.valor_atual||0),0);
  const falta = Math.max(alvo-atual,0);
  el('totalAlvo').innerText     = fmt(alvo);
  el('totalAtual').innerText    = fmt(atual);
  el('totalFaltante').innerText = fmt(falta);
  el('saldoDisponivel').innerText = fmt(saldoContas);
  el('mediaAporte').innerText     = fmt(mediaAporteMensal) + '/mês';
}

function renderMetas(metas){
  if(!metas.length){
    el('listaMetas').innerHTML='<p class="muted" style="padding:16px">Nenhuma meta cadastrada.</p>';
    return;
  }

  el('listaMetas').innerHTML = metas.map(m => {
    const alvo   = Number(m.valor_alvo||0);
    const atual  = Number(m.valor_atual||0);
    const falta  = Math.max(alvo-atual,0);
    const pct    = alvo>0 ? Math.min(atual/alvo*100,100) : 0;
    const status = statusMeta(pct, m.data_alvo);
    const dias   = diasRestantes(m.data_alvo);
    const analise = analisarViabilidade(m, mediaAporteMensal);

    const diasStr = dias===null ? ''
      : dias<0  ? `<span class="negative" style="font-size:11px">vencida há ${Math.abs(dias)} dias</span>`
      : dias===0 ? `<span class="negative" style="font-size:11px">vence hoje</span>`
      : `<span class="muted" style="font-size:11px">${dias} dias restantes</span>`;

    // Bloco de inteligência
    let blocoInteligencia = '';
    if(analise && falta > 0){
      const alertasHtml = analise.alertas.map(a => `
        <div style="display:flex;align-items:flex-start;gap:8px;padding:8px 10px;border-radius:8px;
          background:${a.tipo==='success'?'rgba(34,197,94,.08)':a.tipo==='warning'?'rgba(245,158,11,.08)':'rgba(239,68,68,.08)'};
          border:1px solid ${a.tipo==='success'?'rgba(34,197,94,.2)':a.tipo==='warning'?'rgba(245,158,11,.2)':'rgba(239,68,68,.2)'};
          margin-bottom:6px;font-size:12px;color:var(--text)">
          ${a.tipo==='success'?'✅':a.tipo==='warning'?'⚠️':'🔴'} ${a.texto}
        </div>`).join('');

      const projecaoHtml = analise.porMesNecessario ? `
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px">
          <div style="background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:10px;text-align:center">
            <div style="font-size:10px;color:var(--muted);margin-bottom:2px">Necessário/mês</div>
            <strong style="color:#f59e0b;font-size:14px">${fmt(analise.porMesNecessario)}</strong>
          </div>
          <div style="background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:10px;text-align:center">
            <div style="font-size:10px;color:var(--muted);margin-bottom:2px">Sua média atual</div>
            <strong style="color:${mediaAporteMensal>=analise.porMesNecessario?'#22c55e':'#ef4444'};font-size:14px">${fmt(mediaAporteMensal)}</strong>
          </div>
        </div>` : '';

      const tempoSemPrazoHtml = analise.tempoComMedia ? `
        <p style="font-size:12px;color:var(--muted);margin-bottom:8px">
          📅 No ritmo atual você atingiria essa meta em aproximadamente
          <strong style="color:var(--text)">${analise.tempoComMedia} ${analise.tempoComMedia===1?'mês':'meses'}</strong>
        </p>` : '';

      blocoInteligencia = `
        <div style="margin-top:12px;padding:12px;background:var(--surface-2,rgba(255,255,255,.03));border:1px solid var(--border);border-radius:10px">
          <p style="font-size:11px;font-weight:800;color:var(--muted);letter-spacing:.04em;margin-bottom:8px">📊 ANÁLISE INTELIGENTE</p>
          ${projecaoHtml}
          ${tempoSemPrazoHtml}
          ${alertasHtml}
        </div>`;
    }

    return `
      <div style="padding:16px 0;border-bottom:1px solid var(--border)">
        <!-- Cabeçalho -->
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px;gap:12px">
          <div style="flex:1">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:2px">
              <span style="width:12px;height:12px;border-radius:50%;background:${m.cor||'#22c55e'};display:inline-block;flex-shrink:0"></span>
              <strong style="font-size:14px">${m.nome}</strong>
              <span class="badge ${status.classe}" style="font-size:10px">${status.texto}</span>
            </div>
            ${m.descricao?`<p class="muted" style="font-size:12px;margin:2px 0 0 20px">${m.descricao}</p>`:''}
          </div>
          <div style="display:flex;gap:6px;flex-shrink:0">
            ${falta>0?`<button class="btn btn-primary compact"
              data-action="abrirModalAporte" data-meta-id="${m.id}" data-meta-nome="${m.nome.replace(/"/g,'&quot;')}" data-falta="${falta}" data-sugestao="${analise?.sugestaoAporte||0}">
              💰 Aportar</button>`:''}
            <button class="btn btn-secondary compact" data-action="editarMeta" data-meta-id="${m.id}">✏️</button>
            <button class="btn btn-danger compact" data-action="excluirMeta" data-meta-id="${m.id}" data-meta-nome="${m.nome.replace(/"/g,'&quot;')}">✕</button>
          </div>
        </div>

        <!-- Barra de progresso -->
        <div style="height:10px;background:var(--border);border-radius:99px;overflow:hidden;margin-bottom:6px">
          <div style="height:10px;border-radius:99px;background:${m.cor||'#22c55e'};width:${pct}%;transition:width .4s"></div>
        </div>

        <!-- Valores -->
        <div style="display:flex;justify-content:space-between;align-items:center;font-size:12px">
          <div style="display:flex;gap:16px;flex-wrap:wrap">
            <span class="muted">Atual: <strong class="positive">${fmt(atual)}</strong></span>
            <span class="muted">Alvo: <strong>${fmt(alvo)}</strong></span>
            ${falta>0?`<span class="muted">Falta: <strong class="negative">${fmt(falta)}</strong></span>`:''}
          </div>
          <strong style="font-size:14px;color:${m.cor||'#22c55e'}">${pct.toFixed(1)}%</strong>
        </div>

        ${m.data_alvo?`
          <div style="margin-top:6px;font-size:12px;color:var(--muted)">
            Prazo: ${fmtData(m.data_alvo)} ${diasStr}
          </div>`:''
        }

        ${blocoInteligencia}
      </div>`;
  }).join('');
}


el('btnSalvarMeta').addEventListener('click', salvar);
el('btnCancelarEdicao').addEventListener('click', limpar);

// Inicializar
await carregarContexto();
await carregar();
