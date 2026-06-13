import { supabase } from './supabaseClient.js';
import { navigate } from './router.js';
import { formatCurrency } from './utils.js';

const userEmail = document.getElementById('userEmail');
const btnLogout = document.getElementById('btnLogout');
const btnSalvarMeta = document.getElementById('btnSalvarMeta');

const nomeMeta = document.getElementById('nomeMeta');
const descricaoMeta = document.getElementById('descricaoMeta');
const valorAlvo = document.getElementById('valorAlvo');
const valorAtual = document.getElementById('valorAtual');
const dataAlvo = document.getElementById('dataAlvo');
const categoriaMeta = document.getElementById('categoriaMeta');
const corMeta = document.getElementById('corMeta');

const mensagemMeta = document.getElementById('mensagemMeta');
const listaMetas = document.getElementById('listaMetas');
const totalAlvo = document.getElementById('totalAlvo');
const totalAtual = document.getElementById('totalAtual');
const totalFaltante = document.getElementById('totalFaltante');

const { data } = await supabase.auth.getSession();

if(!data.session){
  navigate('../login.html');
}

const user = data.session.user;
userEmail.innerText = user.email;

btnLogout.addEventListener('click', async () => {
  await supabase.auth.signOut();
  navigate('../login.html');
});

btnSalvarMeta.addEventListener('click', salvarMeta);

function mostrarMensagem(texto, tipo = 'info'){
  mensagemMeta.className = `message ${tipo}`;
  mensagemMeta.innerText = texto;
}

function formatarData(dataISO){
  if(!dataISO) return '-';
  const [ano, mes, dia] = dataISO.split('-');
  return `${dia}/${mes}/${ano}`;
}

function calcularDiasRestantes(dataISO){
  if(!dataISO) return '-';
  const hoje = new Date();
  const alvo = new Date(dataISO + 'T00:00:00');
  const dias = Math.ceil((alvo - hoje) / (1000 * 60 * 60 * 24));
  if(dias < 0) return 'vencida';
  if(dias === 0) return 'hoje';
  return `${dias} dias`;
}

function statusMeta(percentual, dataISO){
  const dias = calcularDiasRestantes(dataISO);
  if(percentual >= 100) return { texto:'concluída', classe:'success' };
  if(dias === 'vencida') return { texto:'vencida', classe:'danger' };
  if(percentual >= 80) return { texto:'avançada', classe:'success' };
  if(percentual >= 40) return { texto:'em andamento', classe:'neutral' };
  return { texto:'inicial', classe:'neutral' };
}

async function salvarMeta(){
  mostrarMensagem('Salvando meta...');

  const nome = nomeMeta.value.trim();
  const descricao = descricaoMeta.value.trim();
  const alvo = Number(valorAlvo.value || 0);
  const atual = Number(valorAtual.value || 0);
  const dataAlvoValor = dataAlvo.value || null;
  const categoria = categoriaMeta.value || 'geral';
  const cor = corMeta.value || '#22c55e';

  if(!nome || !alvo){
    mostrarMensagem('Preencha nome da meta e valor alvo.', 'warning');
    return;
  }

  const { error } = await supabase.from('goals').insert({
    user_id:user.id,
    nome,
    descricao,
    valor_alvo:alvo,
    valor_atual:atual,
    data_alvo:dataAlvoValor,
    categoria,
    cor,
    ativo:true
  });

  if(error){
    mostrarMensagem('Erro ao salvar: ' + error.message, 'danger');
    return;
  }

  limparFormulario();
  mostrarMensagem('Meta salva com sucesso.', 'success');
  await carregarMetas();
}

async function carregarMetas(){
  const { data, error } = await supabase
    .from('goals')
    .select('*')
    .eq('user_id', user.id)
    .eq('ativo', true)
    .order('created_at', { ascending:false });

  if(error){
    listaMetas.innerHTML = '<p class="muted">Erro ao carregar metas.</p>';
    mostrarMensagem('Erro ao listar: ' + error.message, 'danger');
    return;
  }

  const metas = data || [];
  renderizarResumo(metas);
  renderizarMetas(metas);
}

function renderizarResumo(metas){
  const alvo = metas.reduce((soma, meta) => soma + Number(meta.valor_alvo || 0), 0);
  const atual = metas.reduce((soma, meta) => soma + Number(meta.valor_atual || 0), 0);
  const faltante = Math.max(alvo - atual, 0);

  totalAlvo.innerText = formatCurrency(alvo, 'BRL');
  totalAtual.innerText = formatCurrency(atual, 'BRL');
  totalFaltante.innerText = formatCurrency(faltante, 'BRL');
}

function renderizarMetas(metas){
  if(!metas.length){
    listaMetas.innerHTML = '<p class="muted">Nenhuma meta cadastrada.</p>';
    return;
  }

  listaMetas.innerHTML = `
    <table class="data-table">
      <thead>
        <tr>
          <th></th>
          <th>Meta</th>
          <th>Categoria</th>
          <th>Atual</th>
          <th>Alvo</th>
          <th>Falta</th>
          <th>Progresso</th>
          <th>Data Alvo</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        ${metas.map(meta => {
          const alvo = Number(meta.valor_alvo || 0);
          const atual = Number(meta.valor_atual || 0);
          const falta = Math.max(alvo - atual, 0);
          const percentual = alvo > 0 ? Math.min((atual / alvo) * 100, 100) : 0;
          const status = statusMeta(percentual, meta.data_alvo);

          return `
            <tr>
              <td><span class="color-dot" style="background:${meta.cor || '#22c55e'}"></span></td>
              <td><strong>${meta.nome}</strong><br><span class="muted">${meta.descricao || ''}</span></td>
              <td>${meta.categoria || 'geral'}</td>
              <td class="money positive">${formatCurrency(atual, 'BRL')}</td>
              <td class="money">${formatCurrency(alvo, 'BRL')}</td>
              <td class="money">${formatCurrency(falta, 'BRL')}</td>
              <td>${percentual.toFixed(0)}%</td>
              <td>${formatarData(meta.data_alvo)}<br><span class="muted">${calcularDiasRestantes(meta.data_alvo)}</span></td>
              <td><span class="badge ${status.classe}">${status.texto}</span></td>
            </tr>
          `;
        }).join('')}
      </tbody>
    </table>
  `;
}

function limparFormulario(){
  nomeMeta.value = '';
  descricaoMeta.value = '';
  valorAlvo.value = '';
  valorAtual.value = '';
  dataAlvo.value = '';
  categoriaMeta.value = 'geral';
  corMeta.value = '#22c55e';
}

carregarMetas();
