import { confirmarExclusao } from './confirmModal.js';
import { supabase } from './supabaseClient.js';
import { navigate } from './router.js';
import { formatCurrency } from './utils.js';

const el = id => document.getElementById(id);
const { data: sessionData } = await supabase.auth.getSession();
if(!sessionData.session){ navigate('../login.html'); }
const user = sessionData.session.user;
el('userEmail').innerText = user.email;
el('btnLogout').addEventListener('click', async () => {
  await supabase.auth.signOut(); navigate('../login.html');
});

function msg(elId, texto, tipo='info'){
  const e=el(elId); if(!e) return;
  e.className=`message ${tipo}`; e.innerText=texto;
}

// ─── ABAS ──────────────────────────────────
document.querySelectorAll('.reg-tab').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.reg-tab').forEach(b=>b.classList.remove('active'));
    document.querySelectorAll('.reg-tab-content').forEach(c=>c.classList.remove('active'));
    btn.classList.add('active');
    el('tab-'+btn.dataset.tab).classList.add('active');
  });
});

// ═══════════════════════════════════════════
// CONTAS
// ═══════════════════════════════════════════
let editandoConta = null;

async function carregarContas(){
  const {data,error} = await supabase.from('accounts').select('*')
    .eq('user_id',user.id).order('sort_order',{ascending:true}).order('nome',{ascending:true});
  if(error){ el('listaContas').innerHTML='<p class="muted">Erro ao carregar.</p>'; return; }

  if(!data?.length){ el('listaContas').innerHTML='<p class="muted">Nenhuma conta cadastrada.</p>'; return; }

  el('listaContas').innerHTML = data.map(c => `
    <div class="reg-item">
      <div class="reg-color-dot" style="background:${c.color||'#4f8ef7'}"></div>
      <div class="reg-item-info">
        <div class="reg-item-name">${c.nome}
          <span class="badge ${c.active?'success':'danger'} reg-item-badge">${c.active?'ativa':'inativa'}</span>
          ${c.account_kind==='broker'?'<span class="badge info reg-item-badge">corretora</span>':''}
        </div>
        <div class="reg-item-detail">
          ${c.bank||''} · ${c.tipo||''} · ${c.currency||'BRL'} · Saldo: ${formatCurrency(c.saldo_atual||0,c.currency||'BRL')}
        </div>
      </div>
      <div class="reg-item-actions">
        <button class="btn btn-secondary compact" data-edit-conta="${c.id}">Editar</button>
        <button class="btn btn-danger compact" data-del-conta="${c.id}" data-nome="${c.nome}">Excluir</button>
      </div>
    </div>
  `).join('');

  el('listaContas').querySelectorAll('[data-edit-conta]').forEach(b=>
    b.addEventListener('click',()=>editarConta(data.find(c=>c.id===b.dataset.editConta))));
  el('listaContas').querySelectorAll('[data-del-conta]').forEach(b=>
    b.addEventListener('click',()=>excluirConta(b.dataset.delConta,b.dataset.nome)));
}

function editarConta(c){
  editandoConta=c.id;
  el('contaNome').value=c.nome||'';
  el('contaBanco').value=c.bank||'';
  el('contaTipo').value=c.tipo||'';
  el('contaKind').value=c.account_kind||'bank';
  el('contaMoeda').value=c.currency||'BRL';
  el('contaSaldo').value=c.saldo_atual||0;
  el('contaCor').value=c.color||'#4f8ef7';
  el('contaStatus').value=String(c.active!==false);
  el('formContaTitulo').innerText='Editar Conta';
  el('btnSalvarConta').innerText='Salvar Alterações';
  el('btnCancelarConta').style.display='';
  el('formConta').scrollIntoView({behavior:'smooth'});
}

function limparFormConta(){
  editandoConta=null;
  ['contaNome','contaBanco','contaSaldo'].forEach(id=>el(id).value='');
  el('contaTipo').value=''; el('contaKind').value='bank';
  el('contaMoeda').value='BRL'; el('contaCor').value='#4f8ef7';
  el('contaStatus').value='true';
  el('formContaTitulo').innerText='Nova Conta';
  el('btnSalvarConta').innerText='Salvar Conta';
  el('btnCancelarConta').style.display='none';
}

async function salvarConta(){
  const nome=el('contaNome').value.trim();
  const banco=el('contaBanco').value.trim();
  const tipo=el('contaTipo').value;
  const kind=el('contaKind').value;
  const moeda=el('contaMoeda').value;
  const saldo=Number(el('contaSaldo').value||0);
  const cor=el('contaCor').value;
  const ativo=el('contaStatus').value==='true';

  if(!nome||!tipo){ msg('msgConta','Preencha nome e tipo.','warning'); return; }

  const dados={
    nome, bank:banco, tipo, account_kind:kind,
    broker_name:kind==='broker'?(banco||nome):null,
    currency:moeda, saldo_atual:saldo, color:cor, active:ativo,
  };

  let error;
  if(editandoConta){
    ({error}=await supabase.from('accounts').update(dados).eq('id',editandoConta).eq('user_id',user.id));
  }else{
    ({error}=await supabase.from('accounts').insert({...dados,user_id:user.id}));
  }

  if(error){ msg('msgConta','Erro: '+error.message,'danger'); return; }
  msg('msgConta',editandoConta?'Conta atualizada.':'Conta criada.','success');
  limparFormConta();
  await carregarContas();
}

async function excluirConta(id,nome){
  if(!await confirmarExclusao(`Excluir a conta <strong>${nome}</strong>?`)) return;
  const {error}=await supabase.from('accounts').delete().eq('id',id).eq('user_id',user.id);
  if(error){ msg('msgConta','Erro: '+error.message,'danger'); return; }
  msg('msgConta',`Conta "${nome}" excluída.`,'success');
  await carregarContas();
}

el('btnSalvarConta').addEventListener('click',salvarConta);
el('btnCancelarConta').addEventListener('click',limparFormConta);

// Ajuste automático: tipo Corretora → kind broker
el('contaTipo').addEventListener('change',()=>{
  if(el('contaTipo').value==='Corretora') el('contaKind').value='broker';
});

// ═══════════════════════════════════════════
// CARTÕES
// ═══════════════════════════════════════════
let editandoCartao = null;

async function carregarCartoes(){
  const {data,error}=await supabase.from('credit_cards').select('*')
    .eq('user_id',user.id).order('sort_order',{ascending:true}).order('nome',{ascending:true});
  if(error){ el('listaCartoes').innerHTML='<p class="muted">Erro ao carregar.</p>'; return; }

  if(!data?.length){ el('listaCartoes').innerHTML='<p class="muted">Nenhum cartão cadastrado.</p>'; return; }

  el('listaCartoes').innerHTML = data.map(c => `
    <div class="reg-item">
      <div class="reg-color-dot" style="background:${c.color||'#8b5cf6'}"></div>
      <div class="reg-item-info">
        <div class="reg-item-name">${c.nome}
          <span class="badge ${c.ativo?'success':'danger'} reg-item-badge">${c.ativo?'ativo':'inativo'}</span>
        </div>
        <div class="reg-item-detail">
          ${c.banco||''} · ${c.bandeira||''} · Limite: ${formatCurrency(c.limite||0,'BRL')} · Fecha dia ${c.fechamento_dia||'-'} · Vence dia ${c.vencimento_dia||'-'}
        </div>
      </div>
      <div class="reg-item-actions">
        <button class="btn btn-secondary compact" data-edit-cartao="${c.id}">Editar</button>
        <button class="btn btn-danger compact" data-del-cartao="${c.id}" data-nome="${c.nome}">Excluir</button>
      </div>
    </div>
  `).join('');

  el('listaCartoes').querySelectorAll('[data-edit-cartao]').forEach(b=>
    b.addEventListener('click',()=>editarCartao(data.find(c=>c.id===b.dataset.editCartao))));
  el('listaCartoes').querySelectorAll('[data-del-cartao]').forEach(b=>
    b.addEventListener('click',()=>excluirCartao(b.dataset.delCartao,b.dataset.nome)));
}

function editarCartao(c){
  editandoCartao=c.id;
  el('cartaoNome').value=c.nome||'';
  el('cartaoBanco').value=c.banco||'';
  el('cartaoBandeira').value=c.bandeira||'';
  el('cartaoLimite').value=c.limite||0;
  el('cartaoFechamento').value=c.fechamento_dia||'';
  el('cartaoVencimento').value=c.vencimento_dia||'';
  el('cartaoCor').value=c.color||'#8b5cf6';
  el('cartaoAtivo').value=String(c.ativo!==false);
  el('formCartaoTitulo').innerText='Editar Cartão';
  el('btnSalvarCartao').innerText='Salvar Alterações';
  el('btnCancelarCartao').style.display='';
  el('formCartao').scrollIntoView({behavior:'smooth'});
}

function limparFormCartao(){
  editandoCartao=null;
  ['cartaoNome','cartaoBanco','cartaoLimite','cartaoFechamento','cartaoVencimento'].forEach(id=>el(id).value='');
  el('cartaoBandeira').value=''; el('cartaoCor').value='#8b5cf6'; el('cartaoAtivo').value='true';
  el('formCartaoTitulo').innerText='Novo Cartão';
  el('btnSalvarCartao').innerText='Salvar Cartão';
  el('btnCancelarCartao').style.display='none';
}

async function salvarCartao(){
  const nome=el('cartaoNome').value.trim();
  const banco=el('cartaoBanco').value.trim();
  const bandeira=el('cartaoBandeira').value;
  const limite=Number(el('cartaoLimite').value||0);
  const fechamento=Number(el('cartaoFechamento').value)||null;
  const vencimento=Number(el('cartaoVencimento').value)||null;
  const cor=el('cartaoCor').value;
  const ativo=el('cartaoAtivo').value==='true';

  if(!nome){ msg('msgCartao','Preencha o nome do cartão.','warning'); return; }

  const dados={
    nome, banco, bandeira, limite,
    fechamento_dia:fechamento, vencimento_dia:vencimento,
    color:cor, ativo,
  };

  let error;
  if(editandoCartao){
    ({error}=await supabase.from('credit_cards').update(dados).eq('id',editandoCartao).eq('user_id',user.id));
  }else{
    ({error}=await supabase.from('credit_cards').insert({...dados,user_id:user.id}));
  }

  if(error){ msg('msgCartao','Erro: '+error.message,'danger'); return; }
  msg('msgCartao',editandoCartao?'Cartão atualizado.':'Cartão criado.','success');
  limparFormCartao();
  await carregarCartoes();
}

async function excluirCartao(id,nome){
  if(!await confirmarExclusao(`Excluir o cartão <strong>${nome}</strong>?`, 'Faturas associadas serão perdidas.')) return;
  const {error}=await supabase.from('credit_cards').delete().eq('id',id).eq('user_id',user.id);
  if(error){ msg('msgCartao','Erro: '+error.message,'danger'); return; }
  msg('msgCartao',`Cartão "${nome}" excluído.`,'success');
  await carregarCartoes();
}

el('btnSalvarCartao').addEventListener('click',salvarCartao);
el('btnCancelarCartao').addEventListener('click',limparFormCartao);

// ═══════════════════════════════════════════
// CATEGORIAS
// ═══════════════════════════════════════════
let editandoCategoria = null;

async function carregarCategorias(){
  const {data,error}=await supabase.from('categories').select('*')
    .eq('user_id',user.id)
    .order('tipo',{ascending:true})
    .order('sort_order',{ascending:true})
    .order('nome',{ascending:true});
  if(error){ el('listaCategorias').innerHTML='<p class="muted">Erro ao carregar.</p>'; return; }

  if(!data?.length){ el('listaCategorias').innerHTML='<p class="muted">Nenhuma categoria cadastrada.</p>'; return; }

  // Agrupar por tipo
  const grupos = {};
  data.forEach(c => {
    const t = c.tipo||'outros';
    if(!grupos[t]) grupos[t]=[];
    grupos[t].push(c);
  });

  const tipoLabel = {receita:'💰 Receitas',despesa:'💸 Despesas',investimento:'📈 Investimentos'};

  let html='';
  for(const [tipo,itens] of Object.entries(grupos)){
    html+=`<div style="font-size:11px;font-weight:800;letter-spacing:2px;text-transform:uppercase;
      color:var(--muted);margin:16px 0 6px;">${tipoLabel[tipo]||tipo}</div>`;
    itens.forEach(c => {
      html+=`
        <div class="reg-item">
          <div class="reg-item-info">
            <div class="reg-item-name">${c.icon||'•'} ${c.nome}
              <span class="badge ${c.ativo?'success':'danger'} reg-item-badge">${c.ativo?'ativa':'inativa'}</span>
            </div>
          </div>
          <div class="reg-item-actions">
            <button class="btn btn-secondary compact" data-edit-cat="${c.id}">Editar</button>
            <button class="btn btn-danger compact" data-del-cat="${c.id}" data-nome="${c.nome}">Excluir</button>
          </div>
        </div>`;
    });
  }

  el('listaCategorias').innerHTML=html;

  el('listaCategorias').querySelectorAll('[data-edit-cat]').forEach(b=>
    b.addEventListener('click',()=>editarCategoria(data.find(c=>c.id===b.dataset.editCat))));
  el('listaCategorias').querySelectorAll('[data-del-cat]').forEach(b=>
    b.addEventListener('click',()=>excluirCategoria(b.dataset.delCat,b.dataset.nome)));
}

function editarCategoria(c){
  editandoCategoria=c.id;
  el('categoriaNome').value=c.nome||'';
  el('categoriaTipo').value=c.tipo||'';
  el('iconeCategoria').value=c.icon||'';
  const ep=document.getElementById('emojiPreview'); if(ep&&c.icon) ep.textContent=c.icon;
  el('categoriaAtivo').value=String(c.ativo!==false);
  el('formCategoriaTitulo').innerText='Editar Categoria';
  el('btnSalvarCategoria').innerText='Salvar Alterações';
  el('btnCancelarCategoria').style.display='';
  el('formCategoria').scrollIntoView({behavior:'smooth'});
}

function limparFormCategoria(){
  editandoCategoria=null;
  el('categoriaNome').value=''; el('categoriaTipo').value='';
  el('iconeCategoria').value=''; el('categoriaAtivo').value='true';
  const ep=document.getElementById('emojiPreview'); if(ep) ep.textContent='😀';
  el('formCategoriaTitulo').innerText='Nova Categoria';
  el('btnSalvarCategoria').innerText='Salvar Categoria';
  el('btnCancelarCategoria').style.display='none';
}

async function salvarCategoria(){
  const nome=el('categoriaNome').value.trim();
  const tipo=el('categoriaTipo').value;
  const icon=(el('iconeCategoria').value.trim()) || (document.getElementById('emojiPreview')?.textContent?.trim()||'');
  const ativo=el('categoriaAtivo').value==='true';

  if(!nome||!tipo){ msg('msgCategoria','Preencha nome e tipo.','warning'); return; }

  const dados={ nome, tipo, icon, ativo };

  let error;
  if(editandoCategoria){
    ({error}=await supabase.from('categories').update(dados).eq('id',editandoCategoria).eq('user_id',user.id));
  }else{
    ({error}=await supabase.from('categories').insert({...dados,user_id:user.id}));
  }

  if(error){ msg('msgCategoria','Erro: '+error.message,'danger'); return; }
  msg('msgCategoria',editandoCategoria?'Categoria atualizada.':'Categoria criada.','success');
  limparFormCategoria();
  await carregarCategorias();
}

// ── Emoji Picker ──────────────────────────────────────
const EMOJIS = {
  common:    ['😀','😊','🙂','❤️','⭐','✅','🔥','💡','📌','🎯','🏆','💎','🌟','✨','🎁','📅','📊','📋','🔑','🔒'],
  money:     ['💰','💵','💳','🏦','📈','📉','💹','🪙','💸','🤑','💼','🧾','📑','🏧','💴','💶','💷','🪙','📊','🏠'],
  food:      ['🍔','🍕','🍣','🥗','🍱','☕','🍺','🛒','🍎','🥩','🍰','🍜','🌮','🥪','🍷','🧃','🫕','🥘','🍿','🎂'],
  home:      ['🏠','🏡','💊','🏥','👕','✂️','🪴','🐶','🐱','👶','🎓','📚','🧹','🛋️','🔌','💻','📱','🪑','🛁','🧺'],
  transport: ['🚗','🚕','🚌','✈️','🚂','⛽','🛵','🚲','🚁','🛳️','🚚','🏎️','🛺','🚡','⚓','🛣️','🪂','🚦','🅿️','🗺️'],
  fun:       ['🎮','🎬','🎵','🎸','🏖️','⚽','🎭','🎨','🎲','🃏','🎳','🏋️','🧘','🎪','🎠','🎡','🎢','🤿','🪁','🧩'],
};

function initEmojiPicker(){
  const preview   = document.getElementById('emojiPreview');
  const input     = document.getElementById('iconeCategoria');
  const btnPicker = document.getElementById('btnEmojiPicker');
  const panel     = document.getElementById('emojiPickerPanel');
  const grid      = document.getElementById('emojiGrid');
  if(!preview||!btnPicker||!panel||!grid) return;

  function renderGrid(cat){
    grid.innerHTML=(EMOJIS[cat]||[]).map(e=>
      `<button type="button" title="${e}"
        style="font-size:20px;width:36px;height:36px;border:none;background:transparent;
          cursor:pointer;border-radius:6px;line-height:1;"
        onmouseover="this.style.background='rgba(79,132,243,.15)'"
        onmouseout="this.style.background='transparent'"
        data-emoji="${e}">${e}</button>`
    ).join('');
    grid.querySelectorAll('button[data-emoji]').forEach(btn=>{
      btn.addEventListener('click',()=>{
        input.value=btn.dataset.emoji;
        preview.textContent=btn.dataset.emoji;
        panel.style.display='none';
      });
    });
  }

  renderGrid('common');

  document.querySelectorAll('.emoji-cat-btn').forEach(btn=>{
    btn.addEventListener('click',()=>{
      document.querySelectorAll('.emoji-cat-btn').forEach(b=>{
        b.style.background='var(--surface)'; b.style.color='var(--text)';
      });
      btn.style.background='var(--accent)'; btn.style.color='#fff';
      renderGrid(btn.dataset.cat);
    });
  });

  btnPicker.addEventListener('click',(e)=>{
    e.stopPropagation();
    panel.style.display=panel.style.display==='none'?'block':'none';
  });

  input.addEventListener('input',()=>{ if(input.value) preview.textContent=input.value; });

  document.addEventListener('click',(e)=>{
    if(!panel.contains(e.target)&&e.target!==btnPicker&&e.target!==preview){
      panel.style.display='none';
    }
  });

  preview.addEventListener('click',(e)=>{
    e.stopPropagation();
    panel.style.display=panel.style.display==='none'?'block':'none';
  });
}

initEmojiPicker();

async function excluirCategoria(id,nome){
  if(!await confirmarExclusao(`Excluir a categoria <strong>${nome}</strong>?`)) return;
  const {error}=await supabase.from('categories').delete().eq('id',id).eq('user_id',user.id);
  if(error){ msg('msgCategoria','Erro: '+error.message,'danger'); return; }
  msg('msgCategoria',`Categoria "${nome}" excluída.`,'success');
  await carregarCategorias();
}

el('btnSalvarCategoria').addEventListener('click',salvarCategoria);
el('btnCancelarCategoria').addEventListener('click',limparFormCategoria);

// ═══════════════════════════════════════════
// INICIALIZAÇÃO
// ═══════════════════════════════════════════
await Promise.all([carregarContas(), carregarCartoes(), carregarCategorias()]);
