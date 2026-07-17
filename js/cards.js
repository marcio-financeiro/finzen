import { supabase } from './supabaseClient.js';
import { navigate } from './router.js';
import { formatCurrency } from './utils.js';
import { attachMoneyMask, readMoneyValue } from './moneyMask.js';
import { escapeHtml } from './utils/escapeHtml.js';

const userEmail = document.getElementById('userEmail');
const btnLogout = document.getElementById('btnLogout');
const btnSalvarCartao = document.getElementById('btnSalvarCartao');

const nomeCartao = document.getElementById('nomeCartao');
const bancoCartao = document.getElementById('bancoCartao');
const limiteCartao = document.getElementById('limiteCartao');
attachMoneyMask(limiteCartao);
const fechamentoCartao = document.getElementById('fechamentoCartao');
const vencimentoCartao = document.getElementById('vencimentoCartao');
const bandeiraCartao = document.getElementById('bandeiraCartao');
const corCartao = document.getElementById('corCartao');
const statusCartao = document.getElementById('statusCartao');

const mensagemCartao = document.getElementById('mensagemCartao');
const listaCartoes = document.getElementById('listaCartoes');

const { data } = await supabase.auth.getSession();

if(!data.session){
  navigate('../login.html'); throw new Error('unauthenticated');
}

const user = data.session.user;

function mostrarMensagem(texto, tipo = 'info'){
  mensagemCartao.className = `message ${tipo}`;
  mensagemCartao.innerText = texto;
}

btnLogout.addEventListener('click', async () => {
  await supabase.auth.signOut();
  navigate('../login.html'); throw new Error('unauthenticated');
});

btnSalvarCartao.addEventListener('click', salvarCartao);

async function salvarCartao(){
  mostrarMensagem('Salvando cartão...');

  const nome = nomeCartao.value.trim();
  const banco = bancoCartao.value.trim();
  const limite = readMoneyValue(limiteCartao);
  const fechamento = Number(fechamentoCartao.value || 0);
  const vencimento = Number(vencimentoCartao.value || 0);
  const bandeira = bandeiraCartao.value;
  const cor = corCartao.value || '#7c5cfc';
  const ativo = statusCartao.value === 'true';

  if(!nome || !fechamento || !vencimento){
    mostrarMensagem('Preencha nome, fechamento e vencimento.', 'warning');
    return;
  }

  if(fechamento < 1 || fechamento > 31 || vencimento < 1 || vencimento > 31){
    mostrarMensagem('Fechamento e vencimento devem ser entre 1 e 31.', 'warning');
    return;
  }

  const { error } = await supabase
    .from('credit_cards')
    .insert({
      user_id:user.id,
      nome:nome,
      banco:banco,
      limite:limite,
      fechamento_dia:fechamento,
      vencimento_dia:vencimento,
      bandeira:bandeira,
      cor:cor,
      ativo:ativo
    });

  if(error){
    mostrarMensagem('Erro ao salvar: ' + error.message, 'danger');
    return;
  }

  limparFormulario();
  mostrarMensagem('Cartão salvo com sucesso.', 'success');
  await carregarCartoes();
}

async function carregarCartoes(){
  const { data: cartoes, error } = await supabase
    .from('credit_cards')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending:false });

  if(error){
    listaCartoes.innerHTML = '<p class="muted">Erro ao carregar cartões.</p>';
    mostrarMensagem('Erro ao listar: ' + error.message, 'danger');
    return;
  }

  if(!cartoes || cartoes.length === 0){
    listaCartoes.innerHTML = '<p class="muted">Nenhum cartão cadastrado.</p>';
    return;
  }

  listaCartoes.innerHTML = `
    <table class="data-table">
      <thead>
        <tr>
          <th></th>
          <th>Cartão</th>
          <th>Banco</th>
          <th>Bandeira</th>
          <th>Limite</th>
          <th>Fechamento</th>
          <th>Vencimento</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        ${cartoes.map(cartao => `
          <tr>
            <td><span class="color-dot" style="background:${cartao.cor || '#7c5cfc'}"></span></td>
            <td>${escapeHtml(cartao.nome || '')}</td>
            <td>${escapeHtml(cartao.banco || '-')}</td>
            <td>${escapeHtml(cartao.bandeira || '-')}</td>
            <td class="money">${formatCurrency(cartao.limite || 0, 'BRL')}</td>
            <td>Dia ${cartao.fechamento_dia}</td>
            <td>Dia ${cartao.vencimento_dia}</td>
            <td>
              <span class="badge ${cartao.ativo ? 'success' : 'danger'}">
                ${cartao.ativo ? 'ativo' : 'inativo'}
              </span>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

function limparFormulario(){
  nomeCartao.value = '';
  bancoCartao.value = '';
  limiteCartao.value = '';
  fechamentoCartao.value = '';
  vencimentoCartao.value = '';
  bandeiraCartao.value = '';
  corCartao.value = '#7c5cfc';
  statusCartao.value = 'true';
}

carregarCartoes();
