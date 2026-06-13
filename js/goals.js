import { supabase } from './supabaseClient.js';
import { navigate } from './router.js';
import { formatCurrency } from './utils.js';
import { confirmarExclusao } from './confirmModal.js';

const { data: sd } = await supabase.auth.getSession();
if(!sd.session){ navigate('../login.html'); }
const user = sd.session.user;
document.getElementById('userEmail').innerText = user.email;
document.getElementById('btnLogout').addEventListener('click', async()=>{ await supabase.auth.signOut(); navigate('../login.html'); });

const el = id => document.getElementById(id);
let editandoId = null;

function msg(t,tipo='info'){ const e=el('mensagemMeta'); e.className=`message ${tipo}`; e.innerText=t; }

function diasRestantes(iso){
  if(!iso) return null;
  const diff = new Date(iso+'T00:00:00') - new Date(new Date().toISOString().split('T')[0]+'T00:00:00');
  return Math.ceil(diff/(1000*60*60*24));
}

function fmtData(iso){
  if(!iso) return '-';
  const [a,m,d]=iso.split('-'); return `${d}/${m}/${a}`;
}

function statusMeta(pct, iso){
  if(pct>=100) return {texto:'✅ Concluída',classe:'success'};
  const dias = diasRestantes(iso);
  if(dias!==null && dias<0) return {texto:'⏰ Vencida',classe:'danger'};
  if(pct>=80) return {texto:'🔥 Avançada',classe:'success'};
  if(pct>=40) return {texto:'▶ Em andamento',classe:'neutral'};
  return {texto:'🌱 Inicial',classe:'neutral'};
}

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

window.editarMeta = async function(id){
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
};

window.atualizarValor = async function(id, nomeExibir){
  const novoValor = prompt(`Novo valor acumulado para "${nomeExibir}" (R$):`);
  if(novoValor===null) return;
  const valor = parseFloat(novoValor.replace(',','.'));
  if(isNaN(valor)||valor<0){ alert('Valor inválido.'); return; }
  await supabase.from('goals').update({valor_atual:valor}).eq('id',id).eq('user_id',user.id);
  await carregar();
};

window.excluirMeta = async function(id, nome){
  if(!await confirmarExclusao(`Excluir a meta <strong>${nome}</strong>?`)) return;
  await supabase.from('goals').update({ativo:false}).eq('id',id).eq('user_id',user.id);
  await carregar();
};

// ── Carregar ──────────────────────────────────────────
async function carregar(){
  const { data, error } = await supabase.from('goals').select('*').eq('user_id',user.id).eq('ativo',true).order('created_at',{ascending:false});
  if(error){ el('listaMetas').innerHTML='<p class="muted">Erro ao carregar.</p>'; return; }
  const metas = data||[];
  renderKpis(metas);
  renderMetas(metas);
}

function renderKpis(metas){
  const alvo    = metas.reduce((s,m)=>s+Number(m.valor_alvo||0),0);
  const atual   = metas.reduce((s,m)=>s+Number(m.valor_atual||0),0);
  const falta   = Math.max(alvo-atual,0);
  el('totalAlvo').innerText    = formatCurrency(alvo,'BRL');
  el('totalAtual').innerText   = formatCurrency(atual,'BRL');
  el('totalFaltante').innerText= formatCurrency(falta,'BRL');
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
    const pct    = alvo>0?Math.min(atual/alvo*100,100):0;
    const status = statusMeta(pct, m.data_alvo);
    const dias   = diasRestantes(m.data_alvo);
    const diasStr= dias===null?''
      :dias<0?`<span class="negative" style="font-size:11px">vencida há ${Math.abs(dias)} dias</span>`
      :dias===0?`<span class="negative" style="font-size:11px">vence hoje</span>`
      :`<span class="muted" style="font-size:11px">${dias} dias restantes</span>`;

    // Projeção mensal (quanto precisa poupar por mês)
    let projecao = '';
    if(dias!==null && dias>0 && falta>0){
      const meses = Math.ceil(dias/30);
      const porMes = falta/meses;
      projecao = `<span class="muted" style="font-size:11px">Poupar ${formatCurrency(porMes,'BRL')}/mês para atingir no prazo</span>`;
    }

    return `
      <div style="padding:16px 0;border-bottom:1px solid var(--border)">
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
            <button class="btn btn-secondary compact" onclick="atualizarValor('${m.id}','${m.nome.replace(/'/g,"\\'")}')">💰 Aportar</button>
            <button class="btn btn-secondary compact" onclick="editarMeta('${m.id}')">✏️</button>
            <button class="btn btn-danger compact" onclick="excluirMeta('${m.id}','${m.nome.replace(/'/g,"\\'")}')">✕</button>
          </div>
        </div>

        <!-- Barra de progresso -->
        <div style="height:10px;background:var(--border);border-radius:99px;overflow:hidden;margin-bottom:6px">
          <div style="height:10px;border-radius:99px;background:${m.cor||'#22c55e'};width:${pct}%;transition:width .4s"></div>
        </div>

        <div style="display:flex;justify-content:space-between;align-items:center;font-size:12px">
          <div style="display:flex;gap:16px">
            <span class="muted">Atual: <strong class="positive">${formatCurrency(atual,'BRL')}</strong></span>
            <span class="muted">Alvo: <strong>${formatCurrency(alvo,'BRL')}</strong></span>
            ${falta>0?`<span class="muted">Falta: <strong class="negative">${formatCurrency(falta,'BRL')}</strong></span>`:''}
          </div>
          <div style="text-align:right">
            <strong style="font-size:14px;color:${m.cor||'#22c55e'}">${pct.toFixed(1)}%</strong>
          </div>
        </div>

        ${m.data_alvo?`
          <div style="margin-top:6px;display:flex;justify-content:space-between;align-items:center;font-size:12px">
            <span class="muted">Prazo: ${fmtData(m.data_alvo)} ${diasStr}</span>
            ${projecao}
          </div>
        `:''}
      </div>
    `;
  }).join('');
}

el('btnSalvarMeta').addEventListener('click', salvar);
el('btnCancelarEdicao').addEventListener('click', limpar);

carregar();
