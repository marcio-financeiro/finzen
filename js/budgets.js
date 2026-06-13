import { supabase } from './supabaseClient.js';
import { navigate } from './router.js';
import { formatCurrency } from './utils.js';

const userEmail = document.getElementById('userEmail');
const btnLogout = document.getElementById('btnLogout');
const btnSalvarOrcamento = document.getElementById('btnSalvarOrcamento');

const mesReferencia = document.getElementById('mesReferencia');
const categoriaOrcamento = document.getElementById('categoriaOrcamento');
const valorPlanejado = document.getElementById('valorPlanejado');

const mensagemOrcamento = document.getElementById('mensagemOrcamento');
const listaOrcamentos = document.getElementById('listaOrcamentos');

const totalPlanejado = document.getElementById('totalPlanejado');
const totalGasto = document.getElementById('totalGasto');
const saldoRestante = document.getElementById('saldoRestante');

let user = null;
let categorias = [];
let orcamentos = [];
let gastosPorCategoria = {};

function mostrarMensagem(texto, tipo = 'info'){
  mensagemOrcamento.className = `message ${tipo}`;
  mensagemOrcamento.innerText = texto;
}

function mesAtual(){
  const hoje = new Date();
  const ano = hoje.getFullYear();
  const mes = String(hoje.getMonth() + 1).padStart(2, '0');
  return `${ano}-${mes}`;
}

function inicioMes(mesRef){
  return `${mesRef}-01`;
}

function fimMes(mesRef){
  const [ano, mes] = mesRef.split('-').map(Number);
  const ultimoDia = new Date(ano, mes, 0).getDate();
  return `${ano}-${String(mes).padStart(2, '0')}-${String(ultimoDia).padStart(2, '0')}`;
}

function aplicarClasseSaldo(elemento, valor){
  elemento.classList.remove('positive', 'negative');

  if(valor >= 0){
    elemento.classList.add('positive');
  }else{
    elemento.classList.add('negative');
  }
}

const { data } = await supabase.auth.getSession();

if(!data.session){
  navigate('../login.html');
}

user = data.session.user;
userEmail.innerText = user.email;
mesReferencia.value = mesAtual();

btnLogout.addEventListener('click', async () => {
  await supabase.auth.signOut();
  navigate('../login.html');
});

btnSalvarOrcamento.addEventListener('click', salvarOrcamento);
mesReferencia.addEventListener('change', async () => {
  await carregarOrcamentos();
});

async function iniciar(){
  mostrarMensagem('Carregando orçamento...');
  await carregarCategorias();
  await carregarOrcamentos();
  mostrarMensagem('');
}

async function carregarCategorias(){
  const { data, error } = await supabase
    .from('categories')
    .select('*')
    .eq('user_id', user.id)
    .eq('ativo', true)
    .eq('tipo', 'despesa')
    .order('nome', { ascending:true });

  if(error){
    categoriaOrcamento.innerHTML = '<option value="">Erro ao carregar categorias</option>';
    mostrarMensagem('Erro ao carregar categorias: ' + error.message, 'danger');
    return;
  }

  categorias = data || [];

  if(categorias.length === 0){
    categoriaOrcamento.innerHTML = '<option value="">Cadastre categorias de despesa primeiro</option>';
    return;
  }

  categoriaOrcamento.innerHTML = `
    <option value="">Selecione a categoria</option>
    ${categorias.map(categoria => `
      <option value="${categoria.id}">
        ${categoria.icon || ''} ${categoria.nome}
      </option>
    `).join('')}
  `;
}

async function salvarOrcamento(){
  mostrarMensagem('Salvando orçamento...');

  const mes = mesReferencia.value;
  const categoryId = categoriaOrcamento.value;
  const valor = Number(valorPlanejado.value || 0);

  if(!mes || !categoryId || !valor){
    mostrarMensagem('Preencha mês, categoria e valor planejado.', 'warning');
    return;
  }

  const existente = orcamentos.find(item => item.category_id === categoryId);

  if(existente){
    const { error } = await supabase
      .from('budgets')
      .update({ valor_planejado: valor })
      .eq('id', existente.id)
      .eq('user_id', user.id);

    if(error){
      mostrarMensagem('Erro ao atualizar: ' + error.message, 'danger');
      return;
    }

    mostrarMensagem('Orçamento atualizado com sucesso.', 'success');
  }else{
    const { error } = await supabase
      .from('budgets')
      .insert({
        user_id:user.id,
        category_id:categoryId,
        mes_referencia:mes,
        valor_planejado:valor
      });

    if(error){
      mostrarMensagem('Erro ao salvar: ' + error.message, 'danger');
      return;
    }

    mostrarMensagem('Orçamento salvo com sucesso.', 'success');
  }

  categoriaOrcamento.value = '';
  valorPlanejado.value = '';

  await carregarOrcamentos();
}

async function carregarOrcamentos(){
  const mes = mesReferencia.value || mesAtual();

  const { data, error } = await supabase
    .from('budgets')
    .select(`
      id,
      category_id,
      mes_referencia,
      valor_planejado,
      categories:category_id (
        nome,
        icon,
        cor
      )
    `)
    .eq('user_id', user.id)
    .eq('mes_referencia', mes)
    .order('created_at', { ascending:false });

  if(error){
    listaOrcamentos.innerHTML = '<p class="muted">Erro ao carregar orçamento.</p>';
    mostrarMensagem('Erro ao listar: ' + error.message, 'danger');
    return;
  }

  orcamentos = data || [];

  await carregarGastosMes(mes);
  renderizarOrcamentos();
}

async function carregarGastosMes(mes){
  gastosPorCategoria = {};

  const { data: transacoes, error: erroTransacoes } = await supabase
    .from('transactions')
    .select('category_id,amount,type,status,date')
    .eq('user_id', user.id)
    .eq('type', 'despesa')
    .eq('status', 'pago')
    .gte('date', inicioMes(mes))
    .lte('date', fimMes(mes));

  if(erroTransacoes){
    mostrarMensagem('Erro ao carregar gastos: ' + erroTransacoes.message, 'danger');
    return;
  }

  (transacoes || []).forEach(item => {
    if(!item.category_id) return;

    if(!gastosPorCategoria[item.category_id]){
      gastosPorCategoria[item.category_id] = 0;
    }

    gastosPorCategoria[item.category_id] += Number(item.amount || 0);
  });

  const { data: comprasCartao, error: erroCartao } = await supabase
    .from('card_transactions')
    .select('category_id,valor_parcela,status,fatura_referencia')
    .eq('user_id', user.id)
    .eq('status', 'aberta')
    .eq('fatura_referencia', mes);

  if(erroCartao){
    mostrarMensagem('Erro ao carregar gastos do cartão: ' + erroCartao.message, 'danger');
    return;
  }

  (comprasCartao || []).forEach(item => {
    if(!item.category_id) return;

    if(!gastosPorCategoria[item.category_id]){
      gastosPorCategoria[item.category_id] = 0;
    }

    gastosPorCategoria[item.category_id] += Number(item.valor_parcela || 0);
  });
}

function renderizarOrcamentos(){
  if(!orcamentos || orcamentos.length === 0){
    listaOrcamentos.innerHTML = '<p class="muted">Nenhum orçamento cadastrado para este mês.</p>';
    totalPlanejado.innerText = formatCurrency(0);
    totalGasto.innerText = formatCurrency(0);
    saldoRestante.innerText = formatCurrency(0);
    aplicarClasseSaldo(saldoRestante, 0);
    return;
  }

  let somaPlanejado = 0;
  let somaGasto = 0;

  listaOrcamentos.innerHTML = `
    <table class="data-table">
      <thead>
        <tr>
          <th></th>
          <th>Categoria</th>
          <th>Planejado</th>
          <th>Gasto</th>
          <th>Restante</th>
          <th>Uso</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        ${orcamentos.map(item => {
          const planejado = Number(item.valor_planejado || 0);
          const gasto = Number(gastosPorCategoria[item.category_id] || 0);
          const restante = planejado - gasto;
          const uso = planejado > 0 ? (gasto / planejado) * 100 : 0;

          somaPlanejado += planejado;
          somaGasto += gasto;

          const status = uso >= 100
            ? 'estourado'
            : uso >= 80
              ? 'atenção'
              : 'ok';

          const statusClass = uso >= 100
            ? 'danger'
            : uso >= 80
              ? 'neutral'
              : 'success';

          return `
            <tr>
              <td><span class="color-dot" style="background:${item.categories?.cor || '#4f8ef7'}"></span></td>
              <td>${item.categories?.icon || ''} ${item.categories?.nome || '-'}</td>
              <td class="money">${formatCurrency(planejado, 'BRL')}</td>
              <td class="money negative">-${formatCurrency(gasto, 'BRL')}</td>
              <td class="money ${restante >= 0 ? 'positive' : 'negative'}">
                ${formatCurrency(restante, 'BRL')}
              </td>
              <td>${uso.toFixed(0)}%</td>
              <td><span class="badge ${statusClass}">${status}</span></td>
            </tr>
          `;
        }).join('')}
      </tbody>
    </table>
  `;

  const saldo = somaPlanejado - somaGasto;

  totalPlanejado.innerText = formatCurrency(somaPlanejado, 'BRL');
  totalGasto.innerText = formatCurrency(somaGasto, 'BRL');
  saldoRestante.innerText = formatCurrency(saldo, 'BRL');
  aplicarClasseSaldo(saldoRestante, saldo);
}

iniciar();
