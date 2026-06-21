import { supabase } from './supabaseClient.js';
import { navigate } from './router.js';
import { formatCurrency } from './utils.js';

const userEmail = document.getElementById('userEmail');
const btnLogout = document.getElementById('btnLogout');
const btnSalvarCompra = document.getElementById('btnSalvarCompra');

const cartaoCompra = document.getElementById('cartaoCompra');
const categoriaCompra = document.getElementById('categoriaCompra');
const descricaoCompra = document.getElementById('descricaoCompra');
const valorCompra = document.getElementById('valorCompra');
const parcelasCompra = document.getElementById('parcelasCompra');
const dataCompra = document.getElementById('dataCompra');

const mensagemCompra = document.getElementById('mensagemCompra');
const listaCompras = document.getElementById('listaCompras');

let user = null;
let cartoes = [];
let categorias = [];

function mostrarMensagem(texto, tipo = 'info'){
  mensagemCompra.className = `message ${tipo}`;
  mensagemCompra.innerText = texto;
}

function hojeISO(){
  const hoje = new Date();
  const ano = hoje.getFullYear();
  const mes = String(hoje.getMonth() + 1).padStart(2, '0');
  const dia = String(hoje.getDate()).padStart(2, '0');
  return `${ano}-${mes}-${dia}`;
}

function addMeses(data, meses){
  const novaData = new Date(data);
  novaData.setMonth(novaData.getMonth() + meses);
  return novaData;
}

function referenciaFatura(dataCompraObj, fechamentoDia){
  let referencia = new Date(dataCompraObj.getFullYear(), dataCompraObj.getMonth(), 1);

  if(dataCompraObj.getDate() > fechamentoDia){
    referencia.setMonth(referencia.getMonth() + 1);
  }

  const refAno = referencia.getFullYear();
  const refMes = String(referencia.getMonth() + 1).padStart(2, '0');
  return `${refAno}-${refMes}`;
}

function formatarData(dataISO){
  if(!dataISO) return '-';
  const [ano, mes, dia] = dataISO.split('-');
  return `${dia}/${mes}/${ano}`;
}

const { data } = await supabase.auth.getSession();

if(!data.session){
  navigate('../login.html');
}

user = data.session.user;
dataCompra.value = hojeISO();

btnLogout.addEventListener('click', async () => {
  await supabase.auth.signOut();
  navigate('../login.html');
});

btnSalvarCompra.addEventListener('click', salvarCompra);

async function iniciar(){
  mostrarMensagem('Carregando dados...');
  await carregarCartoes();
  await carregarCategorias();
  await carregarCompras();
  mostrarMensagem('');
}

async function carregarCartoes(){
  const { data, error } = await supabase
    .from('credit_cards')
    .select('*')
    .eq('user_id', user.id)
    .eq('ativo', true)
    .order('nome', { ascending:true });

  if(error){
    cartaoCompra.innerHTML = '<option value="">Erro ao carregar cartões</option>';
    mostrarMensagem('Erro ao carregar cartões: ' + error.message, 'danger');
    return;
  }

  cartoes = data || [];

  if(cartoes.length === 0){
    cartaoCompra.innerHTML = '<option value="">Cadastre um cartão primeiro</option>';
    return;
  }

  cartaoCompra.innerHTML = `
    <option value="">Selecione o cartão</option>
    ${cartoes.map(cartao => `
      <option value="${cartao.id}">
        ${cartao.nome} ${cartao.banco ? '- ' + cartao.banco : ''}
      </option>
    `).join('')}
  `;
}

async function carregarCategorias(){
  const { data, error } = await supabase
    .from('categories')
    .select('*')
    .eq('user_id', user.id)
    .eq('ativo', true)
    .in('tipo', ['despesa', 'investimento'])
    .order('nome', { ascending:true });

  if(error){
    categoriaCompra.innerHTML = '<option value="">Erro ao carregar categorias</option>';
    mostrarMensagem('Erro ao carregar categorias: ' + error.message, 'danger');
    return;
  }

  categorias = data || [];

  if(categorias.length === 0){
    categoriaCompra.innerHTML = '<option value="">Cadastre categorias primeiro</option>';
    return;
  }

  categoriaCompra.innerHTML = `
    <option value="">Selecione a categoria</option>
    ${categorias.map(categoria => `
      <option value="${categoria.id}">
        ${categoria.icon || ''} ${categoria.nome}
      </option>
    `).join('')}
  `;
}

async function salvarCompra(){
  mostrarMensagem('Salvando compra...');

  const cardId = cartaoCompra.value;
  const categoryId = categoriaCompra.value || null;
  const descricao = descricaoCompra.value.trim();
  const valorTotal = Number(valorCompra.value || 0);
  const parcelas = Number(parcelasCompra.value || 1);
  const data = dataCompra.value;

  if(!cardId || !descricao || !valorTotal || !parcelas || !data){
    mostrarMensagem('Preencha cartão, descrição, valor, parcelas e data.', 'warning');
    return;
  }

  if(!categoryId){
    mostrarMensagem('Selecione uma categoria para a compra.', 'warning');
    return;
  }

  if(parcelas < 1 || parcelas > 60){
    mostrarMensagem('Parcelas deve ser entre 1 e 60.', 'warning');
    return;
  }

  const cartao = cartoes.find(item => item.id === cardId);

  if(!cartao){
    mostrarMensagem('Cartão não encontrado.', 'danger');
    return;
  }

  const valorParcela = Number((valorTotal / parcelas).toFixed(2));
  const dataBase = new Date(data + 'T00:00:00');
  const registros = [];

  for(let i = 0; i < parcelas; i++){
    const dataParcela = addMeses(dataBase, i);
    const referencia = referenciaFatura(dataParcela, Number(cartao.fechamento_dia || 1));

    registros.push({
      user_id:user.id,
      card_id:cardId,
      category_id:categoryId,
      descricao:descricao,
      valor_total:valorTotal,
      parcelas:parcelas,
      parcela_atual:i + 1,
      valor_parcela:valorParcela,
      data_compra:data,
      fatura_referencia:referencia,
      status:'aberta'
    });
  }

  const { error } = await supabase
    .from('card_transactions')
    .insert(registros);

  if(error){
    mostrarMensagem('Erro ao salvar: ' + error.message, 'danger');
    return;
  }

  limparFormulario();
  mostrarMensagem('Compra salva e parcelas geradas.', 'success');
  await carregarCompras();
}

async function carregarCompras(){
  const { data, error } = await supabase
    .from('card_transactions')
    .select(`
      id,
      descricao,
      valor_total,
      parcelas,
      parcela_atual,
      valor_parcela,
      data_compra,
      fatura_referencia,
      status,
      credit_cards:card_id (
        nome,
        banco
      ),
      categories:category_id (
        nome,
        icon
      )
    `)
    .eq('user_id', user.id)
    .order('fatura_referencia', { ascending:false })
    .order('created_at', { ascending:false })
    .limit(100);

  if(error){
    listaCompras.innerHTML = '<p class="muted">Erro ao carregar compras.</p>';
    mostrarMensagem('Erro ao listar: ' + error.message, 'danger');
    return;
  }

  if(!data || data.length === 0){
    listaCompras.innerHTML = '<p class="muted">Nenhuma compra cadastrada.</p>';
    return;
  }

  listaCompras.innerHTML = `
    <table class="data-table">
      <thead>
        <tr>
          <th>Fatura</th>
          <th>Compra</th>
          <th>Cartão</th>
          <th>Categoria</th>
          <th>Parcela</th>
          <th>Valor Parcela</th>
          <th>Data Compra</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        ${data.map(compra => `
          <tr>
            <td>${compra.fatura_referencia}</td>
            <td>${compra.descricao}</td>
            <td>${compra.credit_cards?.nome || '-'}</td>
            <td>
              ${compra.categories?.icon || ''}
              ${compra.categories?.nome || '-'}
            </td>
            <td>${compra.parcela_atual}/${compra.parcelas}</td>
            <td class="money negative">-${formatCurrency(compra.valor_parcela || 0, 'BRL')}</td>
            <td>${formatarData(compra.data_compra)}</td>
            <td>
              <span class="badge ${compra.status === 'aberta' ? 'neutral' : 'success'}">
                ${compra.status}
              </span>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

function limparFormulario(){
  cartaoCompra.value = '';
  categoriaCompra.value = '';
  descricaoCompra.value = '';
  valorCompra.value = '';
  parcelasCompra.value = '1';
  dataCompra.value = hojeISO();
}

iniciar();
