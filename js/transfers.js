import { supabase } from './supabaseClient.js';
import { navigate } from './router.js';
import { formatCurrency } from './utils.js';
import { listActiveAccounts } from './services/accountService.js';
import { createAccountTransfer, deleteAccountTransfer, listAccountTransfers, validateTransfer } from './services/transferService.js';

const userEmail = document.getElementById('userEmail');
const btnLogout = document.getElementById('btnLogout');

const fromAccount = document.getElementById('fromAccount');
const toAccount = document.getElementById('toAccount');
const transferAmount = document.getElementById('transferAmount');
const transferDate = document.getElementById('transferDate');
const transferDescription = document.getElementById('transferDescription');
const btnTransferir = document.getElementById('btnTransferir');
const transferMessage = document.getElementById('transferMessage');
const listaTransferencias = document.getElementById('listaTransferencias');

const { data: sessionData } = await supabase.auth.getSession();

if(!sessionData.session){
  navigate('../login.html');
}

const user = sessionData.session.user;
userEmail.innerText = user.email;

let contas = [];

function hojeISO(){
  return new Date().toISOString().split('T')[0];
}

function mostrarMensagem(texto, tipo = 'info'){
  transferMessage.className = `message ${tipo}`;
  transferMessage.innerText = texto;
}

function formatarData(dataISO){
  if(!dataISO) return '-';
  const [ano, mes, dia] = dataISO.split('-');
  return `${dia}/${mes}/${ano}`;
}

btnLogout.addEventListener('click', async () => {
  await supabase.auth.signOut();
  navigate('../login.html');
});

btnTransferir.addEventListener('click', criarTransferencia);

window.excluirTransferenciaFinZen = async function(id){
  await excluirTransferencia(id);
};

async function carregarContas(){
  try{
    contas = await listActiveAccounts(user.id);

    const options = contas.map(conta => `
      <option value="${conta.id}">
        ${conta.nome} - ${formatCurrency(conta.saldo_atual || 0, conta.currency || 'BRL')}
      </option>
    `).join('');

    fromAccount.innerHTML = '<option value="">Selecione</option>' + options;
    toAccount.innerHTML = '<option value="">Selecione</option>' + options;

    transferDate.value = hojeISO();
  }catch(error){
    mostrarMensagem('Erro ao carregar contas: ' + error.message, 'danger');
  }
}

async function criarTransferencia(){
  const origem = fromAccount.value;
  const destino = toAccount.value;
  const valor = Number(transferAmount.value || 0);
  const data = transferDate.value || hojeISO();
  const descricao = transferDescription.value.trim();

  try{
    validateTransfer({
      fromAccountId: origem,
      toAccountId: destino,
      amount: valor,
      accounts: contas
    });
  }catch(error){
    mostrarMensagem(error.message, 'warning');
    return;
  }

  mostrarMensagem('Registrando transferência...');

  try{
    await createAccountTransfer({
      fromAccountId: origem,
      toAccountId: destino,
      amount: valor,
      date: data,
      description: descricao || null
    });

    transferAmount.value = '';
    transferDescription.value = '';
    transferDate.value = hojeISO();

    mostrarMensagem('Transferência registrada com sucesso.', 'success');

    await carregarContas();
    await carregarTransferencias();
  }catch(error){
    mostrarMensagem('Erro ao transferir: ' + error.message, 'danger');
  }
}

async function excluirTransferencia(id){
  const confirmar = confirm(
    'Excluir esta transferência?\n\nO saldo será revertido automaticamente: a origem recebe de volta e o destino perde o valor.'
  );

  if(!confirmar){
    return;
  }

  mostrarMensagem('Excluindo transferência e revertendo saldos...');

  try{
    await deleteAccountTransfer(id);

    mostrarMensagem('Transferência excluída e saldos revertidos.', 'success');
    await carregarContas();
    await carregarTransferencias();
  }catch(error){
    mostrarMensagem('Erro ao excluir transferência: ' + error.message, 'danger');
  }
}

async function carregarTransferencias(){
  try{
    const transferencias = await listAccountTransfers(user.id, 50);

    if(!transferencias.length){
      listaTransferencias.innerHTML = '<p class="muted" style="padding:18px">Nenhuma transferência registrada.</p>';
      return;
    }

    listaTransferencias.innerHTML = `
      <table class="data-table">
        <thead>
          <tr>
            <th>Data</th>
            <th>Origem</th>
            <th>Destino</th>
            <th>Descrição</th>
            <th>Valor</th>
            <th>Ações</th>
          </tr>
        </thead>
        <tbody>
          ${transferencias.map(item => {
            const moeda = item.from_account?.currency || item.to_account?.currency || 'BRL';

            return `
              <tr>
                <td>${formatarData(item.date)}</td>
                <td>${item.from_account?.nome || '-'}</td>
                <td>${item.to_account?.nome || '-'}</td>
                <td>${item.description || '-'}</td>
                <td class="money">${formatCurrency(item.amount || 0, moeda)}</td>
                <td>
                  <button
                    type="button"
                    class="btn btn-danger compact"
                    onclick="window.excluirTransferenciaFinZen('${item.id}')">
                    Excluir
                  </button>
                </td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    `;
  }catch(error){
    listaTransferencias.innerHTML = '<p class="muted" style="padding:18px">Erro ao carregar transferências.</p>';
    mostrarMensagem('Erro ao listar transferências: ' + error.message, 'danger');
  }
}

await carregarContas();
await carregarTransferencias();
