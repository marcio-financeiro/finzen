import { supabase } from './supabaseClient.js';
import { navigate } from './router.js';
import { formatCurrency } from './utils.js';

const userEmail = document.getElementById('userEmail');
const btnLogout = document.getElementById('btnLogout');

const filtroCartao = document.getElementById('filtroCartao');
const contaPagamento = document.getElementById('contaPagamento');
const mensagemFatura = document.getElementById('mensagemFatura');
const listaFaturas = document.getElementById('listaFaturas');

let user = null;
let cartoes = [];
let contas = [];
let faturas = [];

function mostrarMensagem(texto, tipo = 'info'){
  mensagemFatura.className = `message ${tipo}`;
  mensagemFatura.innerText = texto;
}

function formatarReferencia(ref){
  if(!ref || !ref.includes('-')) return ref || '-';
  const [ano, mes] = ref.split('-');
  return `${mes}/${ano}`;
}

function hojeISO(){
  const hoje = new Date();
  const ano = hoje.getFullYear();
  const mes = String(hoje.getMonth() + 1).padStart(2, '0');
  const dia = String(hoje.getDate()).padStart(2, '0');
  return `${ano}-${mes}-${dia}`;
}

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

filtroCartao.addEventListener('change', carregarFaturas);

async function iniciar(){
  mostrarMensagem('Carregando faturas...');
  await carregarCartoes();
  await carregarContas();
  await carregarFaturas();
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
    mostrarMensagem('Erro ao carregar cartões: ' + error.message, 'danger');
    return;
  }

  cartoes = data || [];

  filtroCartao.innerHTML = `
    <option value="">Todos os cartões</option>
    ${cartoes.map(cartao => `
      <option value="${cartao.id}">
        ${cartao.nome} ${cartao.banco ? '- ' + cartao.banco : ''}
      </option>
    `).join('')}
  `;
}

async function carregarContas(){
  const { data, error } = await supabase
    .from('accounts')
    .select('*')
    .eq('user_id', user.id)
    .eq('active', true)
    .order('nome', { ascending:true });

  if(error){
    mostrarMensagem('Erro ao carregar contas: ' + error.message, 'danger');
    return;
  }

  contas = data || [];

  contaPagamento.innerHTML = `
    <option value="">Selecione a conta ao pagar</option>
    ${contas.map(conta => `
      <option value="${conta.id}">
        ${conta.nome} ${conta.bank ? '- ' + conta.bank : ''}
      </option>
    `).join('')}
  `;
}

async function carregarFaturas(){
  let query = supabase
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
        id,
        nome,
        banco
      )
    `)
    .eq('user_id', user.id)
    .eq('status', 'aberta')
    .order('fatura_referencia', { ascending:true });

  if(filtroCartao.value){
    query = query.eq('card_id', filtroCartao.value);
  }

  const { data, error } = await query;

  if(error){
    listaFaturas.innerHTML = '<p class="muted">Erro ao carregar faturas.</p>';
    mostrarMensagem('Erro ao listar: ' + error.message, 'danger');
    return;
  }

  if(!data || data.length === 0){
    listaFaturas.innerHTML = '<p class="muted">Nenhuma fatura aberta.</p>';
    return;
  }

  faturas = agruparFaturas(data);
  renderizarFaturas();
}

function agruparFaturas(parcelas){
  const grupos = {};

  parcelas.forEach(parcela => {
    const chave = `${parcela.card_id}|${parcela.fatura_referencia}`;

    if(!grupos[chave]){
      grupos[chave] = {
        card_id: parcela.card_id,
        cartao: parcela.credit_cards?.nome || 'Cartão',
        banco: parcela.credit_cards?.banco || '',
        referencia: parcela.fatura_referencia,
        total: 0,
        itens: []
      };
    }

    grupos[chave].total += Number(parcela.valor_parcela || 0);
    grupos[chave].itens.push(parcela);
  });

  return Object.values(grupos).sort((a,b) => {
    if(a.referencia === b.referencia){
      return a.cartao.localeCompare(b.cartao);
    }
    return a.referencia.localeCompare(b.referencia);
  });
}

function renderizarFaturas(){
  listaFaturas.innerHTML = `
    <table class="data-table">
      <thead>
        <tr>
          <th>Fatura</th>
          <th>Cartão</th>
          <th>Itens</th>
          <th>Total</th>
          <th>Ação</th>
        </tr>
      </thead>
      <tbody>
        ${faturas.map((fatura, index) => `
          <tr>
            <td>${formatarReferencia(fatura.referencia)}</td>
            <td>${fatura.cartao}${fatura.banco ? ' - ' + fatura.banco : ''}</td>
            <td>${fatura.itens.length} parcela(s)</td>
            <td class="money negative">-${formatCurrency(fatura.total, 'BRL')}</td>
            <td>
              <button type="button" class="btn btn-primary compact" data-index="${index}">
                Pagar Fatura
              </button>
            </td>
          </tr>
          <tr>
            <td colspan="5">
              <div class="muted">
                ${fatura.itens.map(item => `
                  ${item.descricao} (${item.parcela_atual}/${item.parcelas}) - ${formatCurrency(item.valor_parcela, 'BRL')}
                `).join('<br>')}
              </div>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;

  document.querySelectorAll('[data-index]').forEach(botao => {
    botao.addEventListener('click', () => {
      pagarFatura(Number(botao.dataset.index));
    });
  });
}

async function pagarFatura(index){
  const contaId = contaPagamento.value;

  if(!contaId){
    mostrarMensagem('Selecione uma conta para pagar a fatura.', 'warning');
    return;
  }

  const fatura = faturas[index];

  if(!fatura){
    mostrarMensagem('Fatura não encontrada.', 'danger');
    return;
  }

  mostrarMensagem('Pagando fatura...');

  const conta = contas.find(item => item.id === contaId);

  if(!conta){
    mostrarMensagem('Conta não encontrada.', 'danger');
    return;
  }

  const descricao = `Pagamento fatura ${fatura.cartao} ${formatarReferencia(fatura.referencia)}`;

  const { error: erroTransacao } = await supabase
    .from('transactions')
    .insert({
      user_id:user.id,
      account_id:contaId,
      category_id:null,
      type:'despesa',
      amount:Number(fatura.total.toFixed(2)),
      description:descricao,
      date:hojeISO(),
      status:'pago',
      notes:'Pagamento de fatura de cartão de crédito'
    });

  if(erroTransacao){
    mostrarMensagem('Erro ao registrar pagamento: ' + erroTransacao.message, 'danger');
    return;
  }

  const novoSaldo = Number(conta.saldo_atual || 0) - Number(fatura.total || 0);

  const { error: erroSaldo } = await supabase
    .from('accounts')
    .update({ saldo_atual: novoSaldo })
    .eq('id', contaId)
    .eq('user_id', user.id);

  if(erroSaldo){
    mostrarMensagem('Pagamento registrado, mas erro ao atualizar saldo: ' + erroSaldo.message, 'danger');
    return;
  }

  const idsParcelas = fatura.itens.map(item => item.id);

  const { error: erroFatura } = await supabase
    .from('card_transactions')
    .update({ status:'paga' })
    .in('id', idsParcelas)
    .eq('user_id', user.id);

  if(erroFatura){
    mostrarMensagem('Pagamento registrado, mas erro ao fechar fatura: ' + erroFatura.message, 'danger');
    return;
  }

  mostrarMensagem('Fatura paga com sucesso.', 'success');

  await carregarContas();
  await carregarFaturas();
}

iniciar();
