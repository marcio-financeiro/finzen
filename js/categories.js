import { supabase } from './supabaseClient.js';
import { navigate } from './router.js';
import { formatCurrency } from './utils.js';

const userEmail = document.getElementById('userEmail');
const btnLogout = document.getElementById('btnLogout');
const btnSalvarCategoria = document.getElementById('btnSalvarCategoria');
const btnCriarPadrao = document.getElementById('btnCriarPadrao');
const nomeCategoria = document.getElementById('nomeCategoria');
const tipoCategoria = document.getElementById('tipoCategoria');
const iconeCategoria = document.getElementById('iconeCategoria');
const corCategoria = document.getElementById('corCategoria');
const orcamentoCategoria = document.getElementById('orcamentoCategoria');
const statusCategoria = document.getElementById('statusCategoria');
const mensagemCategoria = document.getElementById('mensagemCategoria');
const listaCategorias = document.getElementById('listaCategorias');

const { data } = await supabase.auth.getSession();

if(!data.session){
  navigate('../login.html');
}

const user = data.session.user;
userEmail.innerText = user.email;

function mostrarMensagem(texto, tipo = 'info'){
  mensagemCategoria.className = `message ${tipo}`;
  mensagemCategoria.innerText = texto;
}

btnLogout.addEventListener('click', async () => {
  await supabase.auth.signOut();
  navigate('../login.html');
});


// ── Emoji Picker ──────────────────────────────
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
  if(!preview || !btnPicker || !panel || !grid) return;

  function setEmoji(emoji){
    input.value  = emoji;
    preview.textContent = emoji;
    panel.style.display = 'none';
  }

  function renderGrid(cat){
    grid.innerHTML = (EMOJIS[cat]||[]).map(e=>
      `<button type="button" title="${e}" onclick="(function(){
        document.getElementById('iconeCategoria').value='${e}';
        document.getElementById('emojiPreview').textContent='${e}';
        document.getElementById('emojiPickerPanel').style.display='none';
      })()" style="font-size:20px;width:34px;height:34px;border:none;background:transparent;
        cursor:pointer;border-radius:6px;line-height:1;" onmouseover="this.style.background='var(--surface-3,rgba(245,158,11,.10))'"
        onmouseout="this.style.background='transparent'">${e}</button>`
    ).join('');
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

  btnPicker.addEventListener('click',()=>{
    panel.style.display = panel.style.display==='none' ? 'block' : 'none';
  });

  input.addEventListener('input',()=>{
    if(input.value) preview.textContent = input.value;
  });

  // Fechar ao clicar fora
  document.addEventListener('click',(e)=>{
    if(!panel.contains(e.target) && e.target!==btnPicker && e.target!==preview){
      panel.style.display='none';
    }
  });

  preview.addEventListener('click',()=>{
    panel.style.display = panel.style.display==='none' ? 'block' : 'none';
  });
}

initEmojiPicker();

btnSalvarCategoria.addEventListener('click', salvarCategoria);
btnCriarPadrao.addEventListener('click', criarCategoriasPadrao);

async function salvarCategoria(){
  mostrarMensagem('Salvando categoria...');

  const nome = nomeCategoria.value.trim();
  const tipo = tipoCategoria.value;
  const icon = iconeCategoria.value.trim() || document.getElementById('emojiPreview')?.textContent?.trim() || '';
  const cor = corCategoria.value || '#4f8ef7';
  const budget = orcamentoCategoria.value ? Number(orcamentoCategoria.value) : null;
  const ativo = statusCategoria.value === 'true';

  if(!nome || !tipo){
    mostrarMensagem('Preencha nome e tipo da categoria.', 'warning');
    return;
  }

  const { error } = await supabase.from('categories').insert({
    user_id:user.id,
    nome:nome,
    tipo:tipo,
    icon:icon,
    cor:cor,
    budget_amount:budget,
    ativo:ativo
  });

  if(error){
    mostrarMensagem('Erro ao salvar: ' + error.message, 'danger');
    return;
  }

  limparFormulario();
  mostrarMensagem('Categoria salva com sucesso.', 'success');
  carregarCategorias();
}

async function criarCategoriasPadrao(){
  mostrarMensagem('Criando categorias padrão...');

  const categoriasPadrao = [
    { nome:'Salário', tipo:'receita', icon:'💼', cor:'#22c55e' },
    { nome:'Renda Extra', tipo:'receita', icon:'➕', cor:'#22c55e' },
    { nome:'Alimentação', tipo:'despesa', icon:'🍔', cor:'#ef4444' },
    { nome:'Moradia', tipo:'despesa', icon:'🏠', cor:'#f59e0b' },
    { nome:'Transporte', tipo:'despesa', icon:'🚗', cor:'#f97316' },
    { nome:'Saúde', tipo:'despesa', icon:'🏥', cor:'#ef4444' },
    { nome:'Educação', tipo:'despesa', icon:'📚', cor:'#4f8ef7' },
    { nome:'Lazer', tipo:'despesa', icon:'🎮', cor:'#7c5cfc' },
    { nome:'Investimentos', tipo:'investimento', icon:'📈', cor:'#4f8ef7' },
    { nome:'Transferência entre contas', tipo:'transferencia', icon:'🔁', cor:'#8b90a8' }
  ];

  const registros = categoriasPadrao.map(categoria => ({
    user_id:user.id,
    nome:categoria.nome,
    tipo:categoria.tipo,
    icon:categoria.icon,
    cor:categoria.cor,
    budget_amount:null,
    ativo:true
  }));

  const { error } = await supabase.from('categories').insert(registros);

  if(error){
    mostrarMensagem('Erro ao criar padrão: ' + error.message, 'danger');
    return;
  }

  mostrarMensagem('Categorias padrão criadas.', 'success');
  carregarCategorias();
}

async function carregarCategorias(){
  const { data: categorias, error } = await supabase
    .from('categories')
    .select('*')
    .eq('user_id', user.id)
    .order('tipo', { ascending:true })
    .order('nome', { ascending:true });

  if(error){
    listaCategorias.innerHTML = '<p class="muted">Erro ao carregar categorias.</p>';
    mostrarMensagem('Erro ao listar: ' + error.message, 'danger');
    return;
  }

  if(!categorias || categorias.length === 0){
    listaCategorias.innerHTML = '<p class="muted">Nenhuma categoria cadastrada.</p>';
    return;
  }

  listaCategorias.innerHTML = `
    <table class="data-table">
      <thead>
        <tr>
          <th></th>
          <th>Ícone</th>
          <th>Categoria</th>
          <th>Tipo</th>
          <th>Orçamento</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        ${categorias.map(categoria => `
          <tr>
            <td><span class="color-dot" style="background:${categoria.cor || '#4f8ef7'}"></span></td>
            <td>${categoria.icon || '-'}</td>
            <td>${categoria.nome || ''}</td>
            <td><span class="badge ${classeTipo(categoria.tipo)}">${categoria.tipo || '-'}</span></td>
            <td class="money">${categoria.budget_amount ? formatCurrency(categoria.budget_amount) : '-'}</td>
            <td><span class="badge ${categoria.ativo ? 'success' : 'danger'}">${categoria.ativo ? 'ativa' : 'inativa'}</span></td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

function classeTipo(tipo){
  if(tipo === 'receita') return 'success';
  if(tipo === 'despesa') return 'danger';
  if(tipo === 'investimento') return 'info';
  return 'neutral';
}

function limparFormulario(){
  nomeCategoria.value = '';
  tipoCategoria.value = '';
  iconeCategoria.value = '';
  const ep=document.getElementById('emojiPreview'); if(ep) ep.textContent='😀';
  corCategoria.value = '#4f8ef7';
  orcamentoCategoria.value = '';
  statusCategoria.value = 'true';
}

carregarCategorias();
