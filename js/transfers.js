import { confirmarExclusao } from './confirmModal.js';
import { supabase } from './supabaseClient.js';
import { navigate } from './router.js';
import { formatCurrency } from './utils.js';
import { listActiveAccounts } from './services/accountService.js';
import {
  createAccountTransfer,
  createCurrencyExchange,
  deleteAccountTransfer,
  listAccountTransfers,
  listCurrencyExchanges,
  validateCurrencyExchange,
  validateTransfer
} from './services/transferService.js';
import { attachMoneyMask, readMoneyValue } from './moneyMask.js';
import { comTrava } from './toast.js';
import { escapeHtml } from './utils/escapeHtml.js';

const userEmail = document.getElementById('userEmail');
const btnLogout = document.getElementById('btnLogout');

const fromAccount = document.getElementById('fromAccount');
const toAccount = document.getElementById('toAccount');
const transferAmount = document.getElementById('transferAmount');
attachMoneyMask(transferAmount);
const transferDate = document.getElementById('transferDate');
const transferDescription = document.getElementById('transferDescription');
const btnTransferir = document.getElementById('btnTransferir');
const transferMessage = document.getElementById('transferMessage');
const listaTransferencias = document.getElementById('listaTransferencias');

const exchangeFromAccount = document.getElementById('exchangeFromAccount');
const exchangeToAccount = document.getElementById('exchangeToAccount');
const exchangeAmount = document.getElementById('exchangeAmount');
attachMoneyMask(exchangeAmount);
const exchangeRate = document.getElementById('exchangeRate');
const exchangeDate = document.getElementById('exchangeDate');
const exchangeDescription = document.getElementById('exchangeDescription');
const exchangePreview = document.getElementById('exchangePreview');
const btnConverterCambio = document.getElementById('btnConverterCambio');
const exchangeMessage = document.getElementById('exchangeMessage');
const listaConversoes = document.getElementById('listaConversoes');

const { data: sessionData } = await supabase.auth.getSession();

if(!sessionData.session){
  navigate('../login.html'); throw new Error('unauthenticated');
}

const user = sessionData.session.user;

let contas = [];

function hojeISO(){
  return new Date().toISOString().split('T')[0];
}

function mostrarMensagem(texto, tipo = 'info'){
  transferMessage.className = `message ${tipo}`;
  transferMessage.innerText = texto;
}

function mostrarMensagemCambio(texto, tipo = 'info'){
  if(!exchangeMessage) return;
  exchangeMessage.className = `message ${tipo}`;
  exchangeMessage.innerText = texto;
}

function formatarData(dataISO){
  if(!dataISO) return '-';
  const [ano, mes, dia] = dataISO.split('-');
  return `${dia}/${mes}/${ano}`;
}

function optionConta(conta){
  return `
    <option value="${conta.id}">
      ${escapeHtml(conta.nome)} - ${formatCurrency(conta.saldo_atual || 0, conta.currency || 'BRL')}
    </option>
  `;
}

function obterConta(id){
  return contas.find(conta => conta.id === id);
}

btnLogout.addEventListener('click', async () => {
  await supabase.auth.signOut();
  navigate('../login.html');
});

btnTransferir.addEventListener('click', comTrava(btnTransferir, criarTransferencia));

if(btnConverterCambio){
  btnConverterCambio.addEventListener('click', comTrava(btnConverterCambio, criarConversaoCambio));
}

[exchangeFromAccount, exchangeToAccount, exchangeAmount, exchangeRate].forEach(element => {
  if(element){
    element.addEventListener('input', atualizarPreviaCambio);
    element.addEventListener('change', atualizarPreviaCambio);
  }
});

window.excluirTransferenciaFinZen = async function(id){
  await excluirTransferencia(id);
};

async function carregarContas(){
  try{
    contas = await listActiveAccounts(user.id);

    const options = contas.map(optionConta).join('');
    const brokerOptions = contas
      .filter(conta => conta.account_kind === 'broker')
      .map(optionConta)
      .join('');

    fromAccount.innerHTML = '<option value="">Selecione</option>' + options;
    toAccount.innerHTML = '<option value="">Selecione</option>' + options;

    if(exchangeFromAccount){
      exchangeFromAccount.innerHTML = '<option value="">Selecione</option>' + brokerOptions;
    }

    if(exchangeToAccount){
      exchangeToAccount.innerHTML = '<option value="">Selecione</option>' + brokerOptions;
    }

    transferDate.value = hojeISO();
    if(exchangeDate) exchangeDate.value = hojeISO();

    atualizarPreviaCambio();
  }catch(error){
    mostrarMensagem('Erro ao carregar contas: ' + error.message, 'danger');
    mostrarMensagemCambio('Erro ao carregar contas: ' + error.message, 'danger');
  }
}

async function criarTransferencia(){
  const origem = fromAccount.value;
  const destino = toAccount.value;
  const valor = readMoneyValue(transferAmount);
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

async function criarConversaoCambio(){
  const origem = exchangeFromAccount.value;
  const destino = exchangeToAccount.value;
  const valor = readMoneyValue(exchangeAmount);
  const taxa = Number(exchangeRate.value || 0);
  const data = exchangeDate.value || hojeISO();
  const descricao = exchangeDescription.value.trim();

  try{
    validateCurrencyExchange({
      fromAccountId: origem,
      toAccountId: destino,
      sourceAmount: valor,
      exchangeRate: taxa,
      accounts: contas
    });
  }catch(error){
    mostrarMensagemCambio(error.message, 'warning');
    return;
  }

  mostrarMensagemCambio('Registrando conversão cambial...');

  try{
    await createCurrencyExchange({
      fromAccountId: origem,
      toAccountId: destino,
      sourceAmount: valor,
      exchangeRate: taxa,
      date: data,
      description: descricao || null
    });

    exchangeAmount.value = '';
    exchangeDescription.value = '';
    exchangeDate.value = hojeISO();

    mostrarMensagemCambio('Conversão registrada com sucesso.', 'success');

    await carregarContas();
    await carregarTransferencias();
    await carregarConversoesCambio();
  }catch(error){
    mostrarMensagemCambio('Erro ao converter: ' + error.message, 'danger');
  }
}

function atualizarPreviaCambio(){
  if(!exchangePreview) return;

  const origem = obterConta(exchangeFromAccount?.value);
  const destino = obterConta(exchangeToAccount?.value);
  const valor = readMoneyValue(exchangeAmount);
  const taxa = Number(exchangeRate?.value || 0);

  if(!origem || !destino || valor <= 0 || taxa <= 0){
    exchangePreview.innerText = 'Informe origem, destino, valor e taxa para ver a prévia.';
    return;
  }

  try{
    const target = validateCurrencyExchange({
      fromAccountId: origem.id,
      toAccountId: destino.id,
      sourceAmount: valor,
      exchangeRate: taxa,
      accounts: contas
    });

    exchangePreview.innerText = `${formatCurrency(valor, origem.currency || 'BRL')} → ${formatCurrency(target, destino.currency || 'BRL')}`;
  }catch(error){
    exchangePreview.innerText = error.message;
  }
}

async function excluirTransferencia(id){
  const confirmar = await confirmarExclusao(
    'Excluir esta transferência?',
    'O saldo será revertido automaticamente: a origem recebe de volta e o destino perde o valor.'
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

async function carregarConversoesCambio(){
  if(!listaConversoes) return;

  try{
    const conversoes = await listCurrencyExchanges(user.id, 50);

    if(!conversoes.length){
      listaConversoes.innerHTML = '<p class="muted" style="padding:18px">Nenhuma conversão cambial registrada.</p>';
      return;
    }

    listaConversoes.innerHTML = `
      <table class="data-table">
        <thead>
          <tr>
            <th>Data</th>
            <th>Origem</th>
            <th>Destino</th>
            <th>Taxa</th>
            <th>Valor origem</th>
            <th>Valor destino</th>
            <th>Descrição</th>
          </tr>
        </thead>
        <tbody>
          ${conversoes.map(item => `
            <tr>
              <td>${formatarData(item.date)}</td>
              <td>${item.from_account?.nome || '-'} (${item.from_currency})</td>
              <td>${item.to_account?.nome || '-'} (${item.to_currency})</td>
              <td>${Number(item.exchange_rate || 0).toLocaleString('pt-BR', { minimumFractionDigits:4, maximumFractionDigits:4 })}</td>
              <td class="money">${formatCurrency(item.source_amount || 0, item.from_currency || 'BRL')}</td>
              <td class="money">${formatCurrency(item.target_amount || 0, item.to_currency || 'USD')}</td>
              <td>${item.description || '-'}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  }catch(error){
    listaConversoes.innerHTML = '<p class="muted" style="padding:18px">Erro ao carregar conversões.</p>';
    mostrarMensagemCambio('Erro ao listar conversões: ' + error.message, 'danger');
  }
}

await carregarContas();
await carregarTransferencias();
await carregarConversoesCambio();
