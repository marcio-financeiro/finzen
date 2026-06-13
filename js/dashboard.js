import { supabase } from './supabaseClient.js';
import { navigate } from './router.js';
import { formatCurrency } from './utils.js';

const userEmail = document.getElementById('userEmail');
const btnLogout = document.getElementById('btnLogout');

const saldoTotal = document.getElementById('saldoTotal');
const receitasMes = document.getElementById('receitasMes');
const despesasMes = document.getElementById('despesasMes');
const resultadoMes = document.getElementById('resultadoMes');

const faturasAbertas = document.getElementById('faturasAbertas');
const limiteTotal = document.getElementById('limiteTotal');
const limiteUtilizado = document.getElementById('limiteUtilizado');
const limiteDisponivel = document.getElementById('limiteDisponivel');

const resumoContas = document.getElementById('resumoContas');
const resumoFaturas = document.getElementById('resumoFaturas');
const ultimosLancamentos = document.getElementById('ultimosLancamentos');

let user = null;

const { data } = await supabase.auth.getSession();

if(!data.session){
  navigate('../login.html');
}

user = data.session.user;
userEmail.innerText = user.email;

btnLogout.addEventListener('click', async () => {
  await supabase.auth.signOut();
  navigate('../login.html');
});

function primeiroDiaMesISO(){
  const hoje = new Date();
  const ano = hoje.getFullYear();
  const mes = String(hoje.getMonth() + 1).padStart(2, '0');
  return `${ano}-${mes}-01`;
}

function formatarData(dataISO){
  if(!dataISO) return '-';
  const [ano, mes, dia] = dataISO.split('-');
  return `${dia}/${mes}/${ano}`;
}

function formatarReferencia(ref){
  if(!ref || !ref.includes('-')) return ref || '-';
  const [ano, mes] = ref.split('-');
  return `${mes}/${ano}`;
}

function aplicarClasseResultado(elemento, valor){
  elemento.classList.remove('positive', 'negative');

  if(valor >= 0){
    elemento.classList.add('positive');
  }else{
    elemento.classList.add('negative');
  }
}

async function carregarDashboard(){
  await Promise.all([
    carregarContas(),
    carregarTransacoesMes(),
    carregarCartoesEFaturas(),
    carregarUltimosLancamentos()
  ]);
}

async function carregarContas(){
  const { data, error } = await supabase
    .from('accounts')
    .select('*')
    .eq('user_id', user.id)
    .eq('active', true)
    .order('nome', { ascending:true });

  if(error){
    saldoTotal.innerText = formatCurrency(0);
    resumoContas.innerHTML = '<p class="muted">Erro ao carregar contas.</p>';
    return;
  }

  const contas = data || [];

  const totalBRL = contas
    .filter(conta => (conta.currency || 'BRL') === 'BRL')
    .reduce((soma, conta) => soma + Number(conta.saldo_atual || 0), 0);

  saldoTotal.innerText = formatCurrency(totalBRL, 'BRL');

  if(contas.length === 0){
    resumoContas.innerHTML = '<p class="muted">Nenhuma conta cadastrada.</p>';
    return;
  }

  resumoContas.innerHTML = `
    <table class="data-table">
      <thead>
        <tr>
          <th></th>
          <th>Conta</th>
          <th>Moeda</th>
          <th>Saldo Atual</th>
        </tr>
      </thead>
      <tbody>
        ${contas.map(conta => `
          <tr>
            <td><span class="color-dot" style="background:${conta.color || '#4f8ef7'}"></span></td>
            <td>${conta.nome || '-'}</td>
            <td>${conta.currency || 'BRL'}</td>
            <td class="money">${formatCurrency(conta.saldo_atual || 0, conta.currency || 'BRL')}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

async function carregarTransacoesMes(){
  const dataInicio = primeiroDiaMesISO();

  const { data, error } = await supabase
    .from('transactions')
    .select('type,amount,status,date')
    .eq('user_id', user.id)
    .eq('status', 'pago')
    .gte('date', dataInicio);

  if(error){
    receitasMes.innerText = formatCurrency(0);
    despesasMes.innerText = formatCurrency(0);
    resultadoMes.innerText = formatCurrency(0);
    return;
  }

  const transacoes = data || [];

  const receitas = transacoes
    .filter(item => item.type === 'receita')
    .reduce((soma, item) => soma + Number(item.amount || 0), 0);

  const despesas = transacoes
    .filter(item => item.type === 'despesa')
    .reduce((soma, item) => soma + Number(item.amount || 0), 0);

  const resultado = receitas - despesas;

  receitasMes.innerText = formatCurrency(receitas, 'BRL');
  despesasMes.innerText = formatCurrency(despesas, 'BRL');
  resultadoMes.innerText = formatCurrency(resultado, 'BRL');

  aplicarClasseResultado(resultadoMes, resultado);
}

async function carregarCartoesEFaturas(){
  const [{ data: cartoes, error: erroCartoes }, { data: parcelas, error: erroParcelas }] =
    await Promise.all([
      supabase
        .from('credit_cards')
        .select('*')
        .eq('user_id', user.id)
        .eq('ativo', true),

      supabase
        .from('card_transactions')
        .select(`
          id,
          card_id,
          valor_parcela,
          fatura_referencia,
          status,
          descricao,
          parcela_atual,
          parcelas,
          credit_cards:card_id (
            nome,
            banco
          )
        `)
        .eq('user_id', user.id)
        .eq('status', 'aberta')
    ]);

  if(erroCartoes || erroParcelas){
    faturasAbertas.innerText = formatCurrency(0);
    limiteTotal.innerText = formatCurrency(0);
    limiteUtilizado.innerText = formatCurrency(0);
    limiteDisponivel.innerText = formatCurrency(0);
    resumoFaturas.innerHTML = '<p class="muted">Erro ao carregar cartões ou faturas.</p>';
    return;
  }

  const listaCartoes = cartoes || [];
  const listaParcelas = parcelas || [];

  const totalLimite = listaCartoes.reduce(
    (soma, cartao) => soma + Number(cartao.limite || 0),
    0
  );

  const totalFaturas = listaParcelas.reduce(
    (soma, parcela) => soma + Number(parcela.valor_parcela || 0),
    0
  );

  const disponivel = totalLimite - totalFaturas;

  faturasAbertas.innerText = formatCurrency(totalFaturas, 'BRL');
  limiteTotal.innerText = formatCurrency(totalLimite, 'BRL');
  limiteUtilizado.innerText = formatCurrency(totalFaturas, 'BRL');
  limiteDisponivel.innerText = formatCurrency(disponivel, 'BRL');

  aplicarClasseResultado(limiteDisponivel, disponivel);

  renderizarFaturas(listaParcelas);
}

function referenciasMesAtualEProximo(){
  const hoje = new Date();
  const ano = hoje.getFullYear();
  const mes = hoje.getMonth() + 1;

  const r1 = `${ano}-${String(mes).padStart(2,'0')}`;

  const proximoMes = mes === 12 ? 1 : mes + 1;
  const proximoAno = mes === 12 ? ano + 1 : ano;
  const r2 = `${proximoAno}-${String(proximoMes).padStart(2,'0')}`;

  return [r1, r2];
}

function renderizarFaturas(parcelas){
  if(!parcelas || parcelas.length === 0){
    resumoFaturas.innerHTML = '<p class="muted">Nenhuma fatura aberta.</p>';
    return;
  }

  const [refAtual, refProxima] = referenciasMesAtualEProximo();

  const parcelasFiltradas = parcelas.filter(p =>
    p.fatura_referencia === refAtual || p.fatura_referencia === refProxima
  );

  const grupos = {};

  parcelasFiltradas.forEach(parcela => {
    const chave = `${parcela.card_id}|${parcela.fatura_referencia}`;

    if(!grupos[chave]){
      grupos[chave] = {
        cartao: parcela.credit_cards?.nome || 'Cartão',
        referencia: parcela.fatura_referencia,
        total: 0,
        quantidade: 0
      };
    }

    grupos[chave].total += Number(parcela.valor_parcela || 0);
    grupos[chave].quantidade += 1;
  });

  const faturas = Object.values(grupos).sort((a,b) => a.referencia.localeCompare(b.referencia));

  if(faturas.length === 0){
    resumoFaturas.innerHTML = '<p class="muted">Nenhuma fatura no mês atual.</p>';
    return;
  }

  resumoFaturas.innerHTML = `
    <table class="data-table">
      <thead>
        <tr>
          <th>Fatura</th>
          <th>Cartão</th>
          <th>Parcelas</th>
          <th>Total</th>
        </tr>
      </thead>
      <tbody>
        ${faturas.map(fatura => `
          <tr>
            <td>${formatarReferencia(fatura.referencia)}</td>
            <td>${fatura.cartao}</td>
            <td>${fatura.quantidade}</td>
            <td class="money negative">-${formatCurrency(fatura.total, 'BRL')}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

async function carregarUltimosLancamentos(){
  const { data, error } = await supabase
    .from('transactions')
    .select(`
      id,
      type,
      amount,
      description,
      date,
      status,
      accounts:account_id (
        nome,
        currency
      ),
      categories:category_id (
        nome,
        icon
      )
    `)
    .eq('user_id', user.id)
    .order('date', { ascending:false })
    .order('created_at', { ascending:false })
    .limit(8);

  if(error){
    ultimosLancamentos.innerHTML = '<p class="muted">Erro ao carregar lançamentos.</p>';
    return;
  }

  if(!data || data.length === 0){
    ultimosLancamentos.innerHTML = '<p class="muted">Nenhum lançamento cadastrado.</p>';
    return;
  }

  ultimosLancamentos.innerHTML = `
    <table class="data-table">
      <thead>
        <tr>
          <th>Data</th>
          <th>Tipo</th>
          <th>Descrição</th>
          <th>Conta</th>
          <th>Categoria</th>
          <th>Valor</th>
        </tr>
      </thead>
      <tbody>
        ${data.map(item => `
          <tr>
            <td>${formatarData(item.date)}</td>
            <td>
              <span class="badge ${item.type === 'receita' ? 'success' : 'danger'}">
                ${item.type}
              </span>
            </td>
            <td>${item.description}</td>
            <td>${item.accounts?.nome || '-'}</td>
            <td>${item.categories?.icon || ''} ${item.categories?.nome || '-'}</td>
            <td class="money ${item.type === 'receita' ? 'positive' : 'negative'}">
              ${item.type === 'receita' ? '+' : '-'}
              ${formatCurrency(item.amount, item.accounts?.currency || 'BRL')}
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

carregarDashboard();
