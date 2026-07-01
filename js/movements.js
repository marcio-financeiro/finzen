import { supabase } from './supabaseClient.js';
import { navigate } from './router.js';
import { formatCurrency } from './utils.js';
import { notificarTransacao } from './telegram.js';
import { escapeHtml } from './utils/escapeHtml.js';

// ─────────────────────────────────────────────
// ELEMENTOS DO DOM
// ─────────────────────────────────────────────
const el = id => document.getElementById(id);

const userEmail        = el('userEmail');
const btnLogout        = el('btnLogout');
const formTitle        = el('formTitle');
const movementType     = el('movementType');
const paymentMethod    = el('paymentMethod');
const movementAccount  = el('movementAccount');
const fromAccount      = el('fromAccount');
const toAccount        = el('toAccount');
const movementCard     = el('movementCard');
const movementCategory = el('movementCategory');
const movementDescription = el('movementDescription');
const movementAmount   = el('movementAmount');
const movementInstallments = el('movementInstallments');
const movementValueType = el('movementValueType');
const movementValuePreview = el('movementValuePreview');
const movementDate     = el('movementDate');
const movementInvoice  = el('movementInvoice');
const movementStatus   = el('movementStatus');
const movementRecurrence = el('movementRecurrence');
const movementRecurrenceUntil = el('movementRecurrenceUntil');
const movementNotes    = el('movementNotes');
const btnSaveMovement  = el('btnSaveMovement');
const btnCancelEdit    = el('btnCancelEdit');
const movementMessage  = el('movementMessage');
const movementList     = el('movementList');
const cashFlowMonthList = el('cashFlowMonthListFinZen');
const upcomingRecurringList = el('upcomingRecurringListFinZen');
const filterMonth      = el('filterMonth');
const btnClearFilter   = el('btnClearFilter');
const filterCategory      = el('filterCategory');
const filterCategoryTotal = el('filterCategoryTotal');

const groups = {
  paymentMethod:    el('paymentMethodGroup'),
  account:          el('accountGroup'),
  fromAccount:      el('fromAccountGroup'),
  toAccount:        el('toAccountGroup'),
  exchangeRate:     el('exchangeRateGroup'),
  exchangePreview:  el('exchangePreviewGroup'),
  card:             el('cardGroup'),
  category:         el('categoryGroup'),
  installments:     el('installmentsGroup'),
  valueType:        el('valueTypeGroup'),
  invoice:          el('invoiceGroup'),
  status:           el('statusGroup'),
  recurrence:       el('recurrenceGroup'),
  recurrenceUntil:  el('recurrenceUntilGroup'),
  notes:            el('notesGroup'),
};

const exchangeRateInput = el('exchangeRate');
const exchangePreview   = el('exchangePreview');

// ─────────────────────────────────────────────
// AUTH
// ─────────────────────────────────────────────
const { data: sessionData } = await supabase.auth.getSession();

if(!sessionData.session){
  navigate('../login.html'); throw new Error('unauthenticated');
}

const user = sessionData.session.user;

btnLogout.addEventListener('click', async () => {
  await supabase.auth.signOut();
  navigate('../login.html');
});

// ─────────────────────────────────────────────
// ESTADO
// ─────────────────────────────────────────────
let accounts = [];
let cards = [];
let categories = [];
let editingTransaction = null;

// ─────────────────────────────────────────────
// UTILITÁRIOS DE DATA
// ─────────────────────────────────────────────
function todayISO(){
  return new Date().toISOString().split('T')[0];
}

function currentMonthValue(){
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
}

function formatDate(dateISO){
  if(!dateISO) return '-';
  const [y,m,d] = dateISO.split('-');
  return `${d}/${m}/${y}`;
}

function shortDateBR(dateISO){
  return formatDate(dateISO);
}

function monthEndISO(){
  const today = new Date();
  const last = new Date(today.getFullYear(), today.getMonth()+1, 0);
  return `${last.getFullYear()}-${String(last.getMonth()+1).padStart(2,'0')}-${String(last.getDate()).padStart(2,'0')}`;
}

function currentMonthRef(){
  return currentMonthValue();
}

function addDays(dateISO, days){
  const [y,m,d] = dateISO.split('-').map(Number);
  const date = new Date(y, m-1, d+days);
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}

function addMonths(dateISO, months){
  const [y,m,d] = dateISO.split('-').map(Number);
  const target = new Date(y, m-1+months, 1);
  const last = new Date(target.getFullYear(), target.getMonth()+1, 0).getDate();
  const safeDay = Math.min(d, last);
  return `${target.getFullYear()}-${String(target.getMonth()+1).padStart(2,'0')}-${String(safeDay).padStart(2,'0')}`;
}

function addYears(dateISO, years){
  const [y,m,d] = dateISO.split('-').map(Number);
  const target = new Date(y+years, m-1, 1);
  const last = new Date(target.getFullYear(), target.getMonth()+1, 0).getDate();
  const safeDay = Math.min(d, last);
  return `${target.getFullYear()}-${String(target.getMonth()+1).padStart(2,'0')}-${String(safeDay).padStart(2,'0')}`;
}

function nextDate(dateISO, frequency){
  if(frequency === 'semanal') return addDays(dateISO, 7);
  if(frequency === 'anual')   return addYears(dateISO, 1);
  return addMonths(dateISO, 1);
}

function addMonthsRef(ref, months){
  const [y,m] = ref.split('-').map(Number);
  const date = new Date(y, m-1+months, 1);
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}`;
}

function invoiceRef(dateISO, closingDay, dueDay){
  const [y,m,d] = dateISO.split('-').map(Number);
  let date = new Date(y, m-1, 1);
  if(d > Number(closingDay || 1)){
    date = new Date(y, m, 1);
  }
  if(dueDay && Number(dueDay) < Number(closingDay)){
    date = new Date(date.getFullYear(), date.getMonth() + 1, 1);
  }
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}`;
}

function refName(ref){
  if(!ref) return '-';
  const [y,m] = ref.split('-').map(Number);
  return new Date(y, m-1, 1).toLocaleDateString('pt-BR', { month:'long', year:'numeric' });
}

function uuid(){
  return crypto?.randomUUID ? crypto.randomUUID() : String(Date.now())+Math.random().toString(16).slice(2);
}

function isCurrentMonth(dateISO){
  const now = new Date();
  const [y,m] = dateISO.split('-').map(Number);
  return y === now.getFullYear() && m === now.getMonth()+1;
}

function nextOccurrencesFromModel(model, limit=3){
  const results = [];
  let candidate = nextDate(model.date, model.recurrence_frequency || 'mensal');
  let guard = 0;
  while(results.length < limit && guard < 240){
    guard++;
    if(!candidate) break;
    if(model.recurrence_until && candidate > model.recurrence_until) break;
    if(String(candidate) > todayISO()) results.push(candidate);
    candidate = nextDate(candidate, model.recurrence_frequency || 'mensal');
  }
  return results;
}

// ─────────────────────────────────────────────
// MENSAGENS E MODAIS
// ─────────────────────────────────────────────
function showMessage(text, type='info'){
  movementMessage.className = `message ${type}`;
  movementMessage.innerText = text;
}

function showChoiceModal({ title, message, options }){
  return new Promise(resolve => {
    const existing = document.getElementById('finzenChoiceModal');
    if(existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'finzenChoiceModal';
    overlay.style.cssText = `
      position:fixed;inset:0;background:rgba(0,0,0,.62);
      z-index:99999;display:flex;align-items:center;
      justify-content:center;padding:20px;
    `;
    overlay.innerHTML = `
      <div style="width:min(440px,94vw);background:var(--surface,#111827);
        border:1px solid var(--border,#2b3148);border-radius:18px;
        box-shadow:0 24px 80px rgba(0,0,0,.45);overflow:hidden;">
        <div style="padding:18px 20px;border-bottom:1px solid var(--border,#2b3148);">
          <h2 style="margin:0;font-size:1.12rem;">${title}</h2>
          <p style="margin:8px 0 0;color:var(--muted,#8b90a8);line-height:1.4;">${message}</p>
        </div>
        <div style="padding:16px;display:flex;flex-direction:column;gap:10px;">
          ${options.map(o => `
            <button type="button" class="btn ${o.danger ? 'btn-danger' : o.primary ? 'btn-primary' : 'btn-secondary'}"
              data-choice="${o.value}">${o.label}</button>
          `).join('')}
          <button type="button" class="btn btn-secondary" data-choice="cancel">Cancelar</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    overlay.querySelectorAll('[data-choice]').forEach(btn => {
      btn.addEventListener('click', () => {
        const v = btn.getAttribute('data-choice');
        overlay.remove();
        resolve(v === 'cancel' ? null : v);
      });
    });
    overlay.addEventListener('click', e => {
      if(e.target === overlay){ overlay.remove(); resolve(null); }
    });
  });
}

async function chooseRecurringEditScope(){
  return await showChoiceModal({
    title:'Alterar recorrência',
    message:'Este lançamento faz parte de uma recorrência. Como deseja aplicar a alteração?',
    options:[
      { value:'only',   label:'Alterar somente esta ocorrência', primary:true },
      { value:'future', label:'Alterar esta e futuras' },
    ],
  });
}

async function chooseRecurringDeleteScope(){
  return await showChoiceModal({
    title:'Excluir recorrência',
    message:'Este lançamento faz parte de uma recorrência. Escolha o alcance da exclusão.',
    options:[
      { value:'only',   label:'Excluir somente esta ocorrência', primary:true },
      { value:'future', label:'Excluir esta e futuras' },
      { value:'series', label:'Excluir toda a série', danger:true },
    ],
  });
}

// ─────────────────────────────────────────────
// FORMULÁRIO — visibilidade e cálculos
// ─────────────────────────────────────────────
function setDisplay(node, visible){
  if(node) node.style.display = visible ? '' : 'none';
}

function updateFormVisibility(){
  const type   = movementType.value;
  const method = paymentMethod.value;
  const cardExpense    = type === 'despesa' && method === 'cartao';
  const accountExpense = type === 'despesa' && method === 'conta';
  const income   = type === 'receita';
  const transfer = type === 'transferencia';
  const cambio   = type === 'cambio';

  Object.values(groups).forEach(g => setDisplay(g, false));

  setDisplay(groups.paymentMethod,   type === 'despesa');
  setDisplay(groups.account,         income || accountExpense);
  setDisplay(groups.fromAccount,     transfer || cambio);
  setDisplay(groups.toAccount,       transfer || cambio);
  setDisplay(groups.exchangeRate,    cambio);
  setDisplay(groups.exchangePreview, cambio);
  setDisplay(groups.card,            cardExpense);
  setDisplay(groups.category,        income || type === 'despesa');
  setDisplay(groups.installments,    cardExpense);
  setDisplay(groups.valueType,       cardExpense);
  setDisplay(groups.invoice,         cardExpense);
  setDisplay(groups.status,          income || accountExpense);
  setDisplay(groups.recurrence,      income || accountExpense);
  setDisplay(groups.recurrenceUntil, (income || accountExpense) && movementRecurrence.value !== 'nao');
  setDisplay(groups.notes,           Boolean(type));

  fillCategories();
  fillInvoices();
  updatePreview();
  updateExchangePreview();

  const hint = el('formStepHint');
  if(hint){
    const hints = {
      '':             'Selecione o tipo para ver os campos',
      'receita':      'Informe conta, categoria e valor',
      'despesa':      method === 'cartao' ? 'Informe cartão, parcelas e categoria' : 'Informe conta, categoria e valor',
      'transferencia':'Selecione conta origem e destino',
      'cambio':       'Informe contas e taxa de câmbio',
    };
    hint.textContent = hints[type] ?? '';
  }
}

function calculateCardValues(){
  const value        = Number(movementAmount.value || 0);
  const installments = Number(movementInstallments.value || 1);
  const type         = movementValueType.value || 'total';

  if(!value || !installments) return { total:0, installment:0, installments };

  if(type === 'parcela'){
    return {
      total:       Number((value * installments).toFixed(2)),
      installment: Number(value.toFixed(2)),
      installments,
    };
  }
  return {
    total:       Number(value.toFixed(2)),
    installment: Number((value / installments).toFixed(2)),
    installments,
  };
}

function updatePreview(){
  const calc = calculateCardValues();
  if(!calc.total){
    movementValuePreview.innerText = 'Informe valor e parcelas.';
    return;
  }
  movementValuePreview.innerText =
    `${calc.installments}x de ${formatCurrency(calc.installment,'BRL')} = ${formatCurrency(calc.total,'BRL')}`;
}

function fillSelect(select, items, labelFn){
  select.innerHTML = '<option value="">Selecione</option>' +
    items.map(item => `<option value="${item.id}">${labelFn(item)}</option>`).join('');
}

function fillCategories(){
  const type = movementType.value;
  let list = categories;
  if(type === 'receita') list = categories.filter(c => c.tipo === 'receita');
  if(type === 'despesa') list = categories.filter(c => c.tipo === 'despesa' || c.tipo === 'investimento');

  // Preservar categoria selecionada antes de reconstruir o select
  const valorAtual = movementCategory.value;

  movementCategory.innerHTML = '<option value="">Selecione</option>' +
    list.map(c => `<option value="${c.id}">${c.icon || ''} ${c.nome}</option>`).join('');

  // Restaurar valor se ainda existe na nova lista
  if(valorAtual && list.some(c => c.id === valorAtual)){
    movementCategory.value = valorAtual;
  }
}

function fillInvoices(){
  const card = cards.find(c => c.id === movementCard.value);
  if(!card || !movementDate.value){
    movementInvoice.innerHTML = '<option value="">Selecione cartão e data</option>';
    return;
  }
  const base = invoiceRef(movementDate.value, card.fechamento_dia, card.vencimento_dia);
  const options = [];
  for(let i=0; i<6; i++){
    const ref = addMonthsRef(base, i);
    options.push(`<option value="${ref}">${refName(ref)} ${i===0?'(automática)':i===1?'(próxima)':''}</option>`);
  }
  movementInvoice.innerHTML = options.join('');
  movementInvoice.value = base;
}

// ─────────────────────────────────────────────
// CARREGAMENTO DE DADOS
// ─────────────────────────────────────────────
async function loadData(){
  const [acc, card, cat] = await Promise.all([
    supabase.from('accounts').select('*').eq('user_id',user.id).eq('active',true)
      .order('sort_order',{ascending:true}).order('nome',{ascending:true}),
    supabase.from('credit_cards').select('*').eq('user_id',user.id).eq('ativo',true)
      .order('sort_order',{ascending:true}).order('nome',{ascending:true}),
    supabase.from('categories').select('*').eq('user_id',user.id).eq('ativo',true)
      .order('sort_order',{ascending:true}).order('nome',{ascending:true}),
  ]);

  if(acc.error || card.error || cat.error){
    showMessage('Erro ao carregar cadastros. Verifique contas, cartões e categorias.','danger');
    return;
  }

  accounts   = acc.data  || [];
  cards      = card.data || [];
  categories = cat.data  || [];

  const categoriasOrdenadas = [...categories].sort((a,b) => a.nome.localeCompare(b.nome));
  filterCategory.innerHTML = '<option value="">Todas categorias</option>' +
    categoriasOrdenadas.map(c => `<option value="${c.id}">${c.icon || ''} ${c.nome}</option>`).join('');

  fillSelect(movementAccount, accounts, a => `${a.nome} (${formatCurrency(a.saldo_atual||0,a.currency||'BRL')})`);
  fillSelect(fromAccount,     accounts, a => `${a.nome} (${formatCurrency(a.saldo_atual||0,a.currency||'BRL')})`);
  fillSelect(toAccount,       accounts, a => `${a.nome} (${formatCurrency(a.saldo_atual||0,a.currency||'BRL')})`);
  fillSelect(movementCard,    cards,    c => `${c.nome}${c.banco?' - '+c.banco:''}`);

  fillCategories();
  fillInvoices();
}

// ─────────────────────────────────────────────
// SALDO DE CONTA
// ─────────────────────────────────────────────
async function applyAccountBalance(accountId, type, amount, mode='apply'){
  const { data, error } = await supabase
    .from('accounts').select('saldo_atual')
    .eq('id',accountId).eq('user_id',user.id).single();

  if(error){ showMessage('Erro ao ler saldo: '+error.message,'danger'); return false; }

  const current = Number(data.saldo_atual || 0);
  let next = current;

  if(mode === 'apply'){
    next = type === 'receita' ? current + amount : current - amount;
  }else{
    next = type === 'receita' ? current - amount : current + amount;
  }

  const upd = await supabase.from('accounts')
    .update({ saldo_atual:next }).eq('id',accountId).eq('user_id',user.id);

  if(upd.error){ showMessage('Erro ao atualizar saldo: '+upd.error.message,'danger'); return false; }
  return true;
}

// ─────────────────────────────────────────────
// SALVAR MOVIMENTAÇÃO
// ─────────────────────────────────────────────
async function saveMovement(){
  if(editingTransaction){ await saveTransactionEdit(); return; }

  const type        = movementType.value;
  const method      = paymentMethod.value;
  const description = movementDescription.value.trim();
  const amount      = Number(movementAmount.value || 0);
  const date        = movementDate.value;
  const notes       = movementNotes.value.trim();

  if(!type || !description || !amount || !date){
    showMessage('Preencha tipo, descrição, valor e data.','warning');
    return;
  }

  if(type === 'cambio'){           await saveCambio(description, amount, date); return; }
  if(type === 'transferencia'){    await saveTransfer(description, amount, date); return; }
  if(type === 'despesa' && method === 'cartao'){ await saveCardPurchase(description, date); return; }
  await saveAccountTransaction(description, amount, date, notes);
}

async function saveAccountTransaction(description, amount, date, notes){
  const type        = movementType.value;
  const accountId   = movementAccount.value;
  const categoryId  = movementCategory.value || null;
  const status      = movementStatus.value;
  const recurrence  = movementRecurrence.value || 'nao';
  const until       = movementRecurrenceUntil.value || null;
  const isRecurring = recurrence !== 'nao';
  const groupId     = isRecurring ? uuid() : null;

  if(!accountId){ showMessage('Selecione a conta.','warning'); return; }

  const { error } = await supabase.from('transactions').insert({
    user_id:user.id, account_id:accountId, category_id:categoryId,
    type, amount, description, date, status, notes,
    is_recurring:isRecurring,
    recurrence_frequency:isRecurring ? recurrence : null,
    recurrence_until:isRecurring ? until : null,
    recurrence_group_id:groupId,
    parent_transaction_id:null,
  });

  if(error){ showMessage('Erro ao salvar: '+error.message,'danger'); return; }

  if(status === 'pago'){
    const ok = await applyAccountBalance(accountId, type, amount, 'apply');
    if(!ok) return;
  }

  showMessage(isRecurring ? 'Movimentação salva como recorrente.' : 'Movimentação salva.','success');
  const contaNome = (accounts||[]).find(a=>a.id===accountId)?.nome || 'Conta';
  notificarTransacao({ tipo:type, descricao:description, valor:amount, conta:contaNome }).catch(()=>{});
  clearForm();
  await refreshAll();
}

async function saveTransactionEdit(){
  const original    = editingTransaction;
  const type        = movementType.value;
  const accountId   = movementAccount.value;
  const categoryId  = movementCategory.value || null;
  const description = movementDescription.value.trim();
  const amount      = Number(movementAmount.value || 0);
  const date        = movementDate.value;
  const status      = movementStatus.value;
  const notes       = movementNotes.value.trim();
  const recurrence  = movementRecurrence.value || 'nao';
  const until       = movementRecurrenceUntil.value || null;
  const isRecurring = recurrence !== 'nao';

  let scope = 'only';
  if(original.recurrence_group_id || original.is_recurring){
    scope = await chooseRecurringEditScope();
    if(!scope){ showMessage('Edição cancelada.','warning'); return; }
  }

  const targetQuery = scope === 'future'
    ? supabase.from('transactions').select('*').eq('user_id',user.id)
        .eq('recurrence_group_id', original.recurrence_group_id || original.id)
        .gte('date', original.date)
    : supabase.from('transactions').select('*').eq('user_id',user.id).eq('id',original.id);

  const { data: targets, error: targetError } = await targetQuery;
  if(targetError){ showMessage('Erro ao buscar lançamentos para edição: '+targetError.message,'danger'); return; }

  for(const old of targets || []){
    if(old.status === 'pago'){
      const reverted = await applyAccountBalance(old.account_id, old.type, Number(old.amount||0),'revert');
      if(!reverted) return;
    }
    if(status === 'pago'){
      const applied = await applyAccountBalance(accountId, type, amount,'apply');
      if(!applied) return;
    }
    const { error } = await supabase.from('transactions').update({
      account_id:accountId, category_id:categoryId, type, amount, description,
      date: scope === 'only' ? date : old.date,
      status, notes,
      is_recurring:isRecurring,
      recurrence_frequency:isRecurring ? recurrence : null,
      recurrence_until:isRecurring ? until : null,
    }).eq('id',old.id).eq('user_id',user.id);
    if(error){ showMessage('Erro ao editar lançamento: '+error.message,'danger'); return; }
  }

  showMessage(scope === 'future' ? 'Esta e futuras ocorrências foram alteradas.' : 'Lançamento alterado.','success');
  cancelEdit();
  await refreshAll();
}

async function saveTransfer(description, amount, date){
  if(!fromAccount.value || !toAccount.value){ showMessage('Selecione origem e destino.','warning'); return; }
  if(fromAccount.value === toAccount.value){ showMessage('Origem e destino não podem ser iguais.','warning'); return; }

  const { error } = await supabase.rpc('create_account_transfer',{
    p_from_account_id: fromAccount.value,
    p_to_account_id:   toAccount.value,
    p_amount:          amount,
    p_date:            date,
    p_description:     description,
  });

  if(error){ showMessage('Erro na transferência: '+error.message,'danger'); return; }

  showMessage('Transferência salva.','success');
  clearForm();
  await refreshAll();
}

function updateExchangePreview(){
  if(movementType.value !== 'cambio') return;
  const amount = Number(movementAmount.value || 0);
  const rate   = Number(exchangeRateInput.value || 0);
  if(!amount || !rate){ exchangePreview.value = 'Preencha valor e taxa'; return; }

  const fromAcc = accounts.find(a => a.id === fromAccount.value);
  const toAcc   = accounts.find(a => a.id === toAccount.value);
  const fromCur = fromAcc?.currency || 'BRL';
  const toCur   = toAcc?.currency || 'USD';

  let converted;
  if(fromCur === 'BRL' && toCur === 'USD'){
    converted = amount / rate;
    exchangePreview.value = `R$ ${amount.toFixed(2)} → US$ ${converted.toFixed(2)} (taxa ${rate.toFixed(4)})`;
  }else if(fromCur === 'USD' && toCur === 'BRL'){
    converted = amount * rate;
    exchangePreview.value = `US$ ${amount.toFixed(2)} → R$ ${converted.toFixed(2)} (taxa ${rate.toFixed(4)})`;
  }else{
    exchangePreview.value = `${fromCur} → ${toCur}: conversão não suportada`;
  }
}

async function saveCambio(description, amount, date){
  if(!fromAccount.value || !toAccount.value){
    showMessage('Selecione conta de origem e destino.','warning'); return;
  }
  if(fromAccount.value === toAccount.value){
    showMessage('Origem e destino devem ser contas diferentes.','warning'); return;
  }
  const rate = Number(exchangeRateInput.value || 0);
  if(!rate || rate <= 0){
    showMessage('Informe a taxa de câmbio.','warning'); return;
  }

  const { error } = await supabase.rpc('create_currency_exchange',{
    p_from_account_id: fromAccount.value,
    p_to_account_id:   toAccount.value,
    p_source_amount:   amount,
    p_exchange_rate:   rate,
    p_date:            date,
    p_description:     description || 'Câmbio BRL/USD',
  });

  if(error){ showMessage('Erro no câmbio: '+error.message,'danger'); return; }

  showMessage('Câmbio registrado com sucesso!','success');
  clearForm();
  await refreshAll();
}

async function saveCardPurchase(description, date){
  const cardId     = movementCard.value;
  const categoryId = movementCategory.value || null;
  const invoice    = movementInvoice.value;
  const calc       = calculateCardValues();

  if(!cardId || !invoice){ showMessage('Selecione cartão e fatura inicial.','warning'); return; }

  const registros = [];
  for(let i=0; i<calc.installments; i++){
    registros.push({
      user_id:user.id, card_id:cardId, category_id:categoryId,
      descricao:description, valor_total:calc.total,
      parcelas:calc.installments, parcela_atual:i+1,
      valor_parcela:calc.installment, data_compra:date,
      fatura_referencia:addMonthsRef(invoice, i), status:'aberta',
    });
  }

  const { error } = await supabase.from('card_transactions').insert(registros);
  if(error){ showMessage('Erro ao salvar compra no cartão: '+error.message,'danger'); return; }

  showMessage(`Compra salva: ${calc.installments}x de ${formatCurrency(calc.installment,'BRL')}.`,'success');
  clearForm();
  await refreshAll();
}

// ─────────────────────────────────────────────
// EDITAR / EXCLUIR
// ─────────────────────────────────────────────
async function editTransaction(id){
  const { data, error } = await supabase.from('transactions').select('*')
    .eq('id',id).eq('user_id',user.id).single();
  if(error){ showMessage('Erro ao abrir edição: '+error.message,'danger'); return; }

  editingTransaction = data;
  movementType.value = data.type || '';
  paymentMethod.value = 'conta';
  updateFormVisibility();
  movementAccount.value = data.account_id || '';
  movementCategory.value = data.category_id || '';
  movementDescription.value = data.description || '';
  movementAmount.value = data.amount || '';
  movementDate.value = data.date || todayISO();
  movementStatus.value = data.status || 'pendente';
  movementRecurrence.value = data.is_recurring ? (data.recurrence_frequency || 'mensal') : 'nao';
  movementRecurrenceUntil.value = data.recurrence_until || '';
  movementNotes.value = data.notes || '';
  updateFormVisibility();

  formTitle.innerText = 'Editar Movimentação';
  btnSaveMovement.innerText = 'Salvar Alterações';
  btnCancelEdit.style.display = '';
  window.scrollTo({ top:0, behavior:'smooth' });
}

async function deleteTransaction(id){
  const { data, error } = await supabase.from('transactions').select('*')
    .eq('id',id).eq('user_id',user.id).single();
  if(error){ showMessage('Erro ao localizar lançamento: '+error.message,'danger'); return; }

  let scope = 'only';
  if(data.recurrence_group_id || data.is_recurring){
    scope = await chooseRecurringDeleteScope();
    if(!scope){ showMessage('Exclusão cancelada.','warning'); return; }
  }else{
    const ok = await showChoiceModal({
      title:'Excluir lançamento',
      message:'Deseja excluir este lançamento? Se estiver pago, o saldo será revertido.',
      options:[{ value:'only', label:'Excluir lançamento', danger:true }],
    });
    if(!ok){ showMessage('Exclusão cancelada.','warning'); return; }
  }

  let query = supabase.from('transactions').select('*').eq('user_id',user.id);
  if(scope === 'only')   query = query.eq('id',data.id);
  if(scope === 'future') query = query.eq('recurrence_group_id',data.recurrence_group_id||data.id).gte('date',data.date);
  if(scope === 'series') query = query.eq('recurrence_group_id',data.recurrence_group_id||data.id);

  const { data: targets, error: targetsError } = await query;
  if(targetsError){ showMessage('Erro ao buscar lançamentos para excluir: '+targetsError.message,'danger'); return; }
  if(!targets || !targets.length){ showMessage('Nenhum lançamento encontrado para exclusão.','warning'); return; }

  for(const item of targets){
    if(item.status === 'pago'){
      const reverted = await applyAccountBalance(item.account_id, item.type, Number(item.amount||0),'revert');
      if(!reverted) return;
    }
  }

  const ids = targets.map(item => item.id);
  const del = await supabase.from('transactions').delete().eq('user_id',user.id).in('id',ids);
  if(del.error){ showMessage('Erro ao excluir: '+del.error.message,'danger'); return; }

  // Remove registros de dividendos vinculados às transações excluídas
  await supabase.from('dividends').delete().eq('user_id',user.id).in('transaction_id',ids);

  showMessage(
    scope === 'only'   ? 'Ocorrência excluída.' :
    scope === 'future' ? 'Esta e futuras ocorrências foram excluídas.' :
                         'Toda a série foi excluída.',
    'success'
  );
  await refreshAll();
}

// ─────────────────────────────────────────────
// FLUXO DO MÊS
// ─────────────────────────────────────────────
async function sumCurrentAccountBalances(){
  const { data, error } = await supabase.from('accounts')
    .select('saldo_atual').eq('user_id',user.id).eq('active',true);
  if(error) throw new Error('Erro ao calcular saldo em contas: '+error.message);
  return (data||[]).reduce((sum,item) => sum+Number(item.saldo_atual||0),0);
}

async function getPendingTransactionsUntilMonthEnd(){
  const today = todayISO();
  const end   = monthEndISO();
  const { data, error } = await supabase.from('transactions')
    .select('id,type,amount,description,date,status')
    .eq('user_id',user.id).eq('status','pendente')
    .gte('date',today).lte('date',end).order('date',{ascending:true});
  if(error) throw new Error('Erro ao calcular lançamentos pendentes: '+error.message);
  return data||[];
}

async function sumOpenCardInvoicesThisMonth(){
  const ref = currentMonthRef();
  const { data, error } = await supabase.from('card_transactions')
    .select('valor_parcela,valor_total,status,fatura_referencia')
    .eq('user_id',user.id).in('status',['aberta','pendente']).eq('fatura_referencia',ref);
  if(error) throw new Error('Erro ao calcular faturas abertas: '+error.message);
  return (data||[]).reduce((sum,item) => {
    const parcela = Number(item.valor_parcela??0);
    const total   = Number(item.valor_total??0);
    return sum+(parcela||total||0);
  },0);
}

function showFlowDetailModal(title, subtitle, items, total, totalClass=''){
  const existing = document.getElementById('flowDetailModalFinZen');
  if(existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'flowDetailModalFinZen';
  overlay.className = 'ff-detail-overlay';
  const empty = !items || !items.length;

  overlay.innerHTML = `
    <div class="ff-detail-modal">
      <div class="ff-detail-header">
        <div><h2>${title}</h2><p>${subtitle}</p></div>
        <button type="button" class="ff-detail-close" aria-label="Fechar">×</button>
      </div>
      <div class="ff-detail-body">
        ${empty ? '<p class="muted" style="padding:10px">Nenhum item encontrado.</p>'
          : items.map(item => `
            <div class="ff-detail-item">
              <div>
                <strong>${item.title}</strong>
                <span>${item.subtitle||''}</span>
              </div>
              <strong class="money ${item.valueClass||''}">${item.valueText}</strong>
            </div>
          `).join('')}
      </div>
      <div class="ff-detail-total">
        <span>Total</span>
        <span class="money ${totalClass}">${formatCurrency(total||0,'BRL')}</span>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  overlay.querySelector('.ff-detail-close').addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', e => { if(e.target===overlay) overlay.remove(); });
}

async function openFlowAccountsDetail(){
  const { data, error } = await supabase.from('accounts')
    .select('nome,bank,saldo_atual,currency').eq('user_id',user.id).eq('active',true)
    .order('sort_order',{ascending:true}).order('nome',{ascending:true});
  if(error){ showMessage('Erro ao detalhar contas: '+error.message,'danger'); return; }

  const items = (data||[]).map(item => ({
    title:item.nome, subtitle:item.bank||'Conta ativa',
    valueText:formatCurrency(Number(item.saldo_atual||0),item.currency||'BRL'),
    valueClass:Number(item.saldo_atual||0)>=0?'positive':'negative',
  }));
  const total = (data||[]).reduce((sum,item) => sum+Number(item.saldo_atual||0),0);
  showFlowDetailModal('Saldo Atual','Saldos das contas ativas',items,total,total>=0?'positive':'negative');
}

async function openFlowPendingDetail(type){
  const today = todayISO();
  const end   = monthEndISO();
  const { data, error } = await supabase.from('transactions')
    .select(`id,type,amount,description,date,status,
      accounts:account_id(nome,currency),
      categories:category_id(nome,icon)`)
    .eq('user_id',user.id).eq('status','pendente').eq('type',type)
    .gte('date',today).lte('date',end).order('date',{ascending:true});
  if(error){ showMessage('Erro ao detalhar lançamentos: '+error.message,'danger'); return; }

  const isIncome = type === 'receita';
  const items = (data||[]).map(item => ({
    title:item.description,
    subtitle:`${shortDateBR(item.date)} · ${item.accounts?.nome||'-'} · ${item.categories?.icon||''} ${item.categories?.nome||'-'}`,
    valueText:`${isIncome?'+':'-'}${formatCurrency(Number(item.amount||0),item.accounts?.currency||'BRL')}`,
    valueClass:isIncome?'positive':'negative',
  }));
  const total = (data||[]).reduce((sum,item) => sum+Number(item.amount||0),0);
  showFlowDetailModal(
    isIncome?'Receitas Pendentes':'Despesas Pendentes',
    `Até ${shortDateBR(end)}`, items, total, isIncome?'positive':'negative'
  );
}

async function openFlowCardsDetail(){
  const ref = currentMonthRef();
  const { data, error } = await supabase.from('card_transactions')
    .select(`valor_parcela,valor_total,status,fatura_referencia,descricao,credit_cards:card_id(nome)`)
    .eq('user_id',user.id).in('status',['aberta','pendente']).eq('fatura_referencia',ref);
  if(error){ showMessage('Erro ao detalhar faturas: '+error.message,'danger'); return; }

  const grouped = {};
  (data||[]).forEach(item => {
    const card  = item.credit_cards?.nome||'Cartão';
    const value = Number(item.valor_parcela??0)||Number(item.valor_total??0)||0;
    grouped[card] = (grouped[card]||0)+value;
  });
  const items = Object.entries(grouped).map(([card,value]) => ({
    title:card, subtitle:`Fatura ${ref}`,
    valueText:`-${formatCurrency(value,'BRL')}`, valueClass:'negative',
  }));
  const total = Object.values(grouped).reduce((sum,v) => sum+Number(v||0),0);
  showFlowDetailModal('Faturas Abertas',`Faturas do mês ${ref}`,items,total,'negative');
}

async function renderCashFlowMonth(){
  try{
    const [accountBalance, pendingTransactions, openCards] = await Promise.all([
      sumCurrentAccountBalances(),
      getPendingTransactionsUntilMonthEnd(),
      sumOpenCardInvoicesThisMonth(),
    ]);

    const pendingIncome  = pendingTransactions.filter(i=>i.type==='receita').reduce((s,i)=>s+Number(i.amount||0),0);
    const pendingExpense = pendingTransactions.filter(i=>i.type==='despesa').reduce((s,i)=>s+Number(i.amount||0),0);
    const freeBalance    = accountBalance+pendingIncome-pendingExpense-openCards;
    const statusClass    = freeBalance>=0?'positive':'negative';

    cashFlowMonthList.innerHTML = `
      <div class="ff-flow-grid">
        <div class="ff-flow-main">
          <span>Saldo Livre Estimado</span>
          <strong class="${statusClass}">${formatCurrency(freeBalance,'BRL')}</strong>
          <small>Estimativa até ${shortDateBR(monthEndISO())}</small>
        </div>
        <button type="button" class="ff-flow-card clickable" data-flow-detail="accounts">
          <span>Saldo Atual</span>
          <strong class="positive">${formatCurrency(accountBalance,'BRL')}</strong>
        </button>
        <button type="button" class="ff-flow-card clickable" data-flow-detail="income">
          <span>Receitas Pendentes</span>
          <strong class="positive">+${formatCurrency(pendingIncome,'BRL')}</strong>
        </button>
        <button type="button" class="ff-flow-card clickable" data-flow-detail="expense">
          <span>Despesas Pendentes</span>
          <strong class="negative">-${formatCurrency(pendingExpense,'BRL')}</strong>
        </button>
        <button type="button" class="ff-flow-card clickable" data-flow-detail="cards">
          <span>Faturas Abertas</span>
          <strong class="negative">-${formatCurrency(openCards,'BRL')}</strong>
        </button>
      </div>
    `;

    cashFlowMonthList.querySelectorAll('[data-flow-detail]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const detail = btn.getAttribute('data-flow-detail');
        if(detail==='accounts') await openFlowAccountsDetail();
        else if(detail==='income')   await openFlowPendingDetail('receita');
        else if(detail==='expense')  await openFlowPendingDetail('despesa');
        else if(detail==='cards')    await openFlowCardsDetail();
      });
    });
  }catch(error){
    cashFlowMonthList.innerHTML = '<p class="muted" style="padding:18px">Erro ao carregar movimentações.</p>';
  }
}

// ─────────────────────────────────────────────
// PRÓXIMAS RECORRÊNCIAS
// ─────────────────────────────────────────────
async function loadUpcomingRecurring(){
  const { data: models, error } = await supabase.from('transactions')
    .select(`id,type,amount,description,date,recurrence_frequency,recurrence_until,recurrence_active,
      accounts:account_id(nome,currency),
      categories:category_id(nome,icon)`)
    .eq('user_id',user.id).eq('is_recurring',true).eq('recurrence_active',true)
    .is('parent_transaction_id',null).order('date',{ascending:true});

  if(error){
    upcomingRecurringList.innerHTML = '<p class="muted" style="padding:18px">Erro ao carregar próximas recorrências.</p>';
    return;
  }

  // Filtro de mês
  const filtroMes = el('filterRecorrencia')?.value || '';

  const previews = [];
  for(const model of models||[]){
    nextOccurrencesFromModel(model, filtroMes ? 12 : 3).forEach(date => {
      // Se tem filtro, só inclui datas do mês selecionado
      if(filtroMes && String(date).slice(0,7) !== filtroMes) return;
      previews.push({
        date, type:model.type, description:model.description,
        amount:Number(model.amount||0),
        account:model.accounts?.nome||'-',
        currency:model.accounts?.currency||'BRL',
        category:`${model.categories?.icon||''} ${model.categories?.nome||'-'}`.trim(),
        frequency:model.recurrence_frequency||'mensal',
      });
    });
  }
  previews.sort((a,b) => String(a.date).localeCompare(String(b.date)));

  if(!previews.length){
    upcomingRecurringList.innerHTML = `<p class="muted" style="padding:18px">${filtroMes ? `Nenhuma recorrência prevista para ${filtroMes.split('-').reverse().join('/')}.` : 'Nenhuma próxima recorrência prevista.'}</p>`;
    return;
  }

  // Totalizar por tipo
  const totalReceitas = previews.filter(p=>p.type==='receita').reduce((s,p)=>s+p.amount,0);
  const totalDespesas = previews.filter(p=>p.type==='despesa').reduce((s,p)=>s+p.amount,0);
  const resumo = filtroMes ? `
    <div style="display:flex;gap:16px;padding:12px 16px;font-size:12px;border-bottom:1px solid var(--border);flex-wrap:wrap">
      <span>📅 <strong>${previews.length}</strong> recorrências</span>
      <span class="positive">↑ Receitas: <strong>${formatCurrency(totalReceitas,'BRL')}</strong></span>
      <span class="negative">↓ Despesas: <strong>${formatCurrency(totalDespesas,'BRL')}</strong></span>
      <span>💰 Saldo previsto: <strong class="${totalReceitas-totalDespesas>=0?'positive':'negative'}">${formatCurrency(totalReceitas-totalDespesas,'BRL')}</strong></span>
    </div>` : '';

  upcomingRecurringList.innerHTML = resumo + `
    <div class="ff-desktop-table">
      <table class="data-table">
        <thead><tr>
          <th>Data prevista</th><th>Descrição</th><th>Conta</th>
          <th>Categoria</th><th>Frequência</th><th>Valor</th>
        </tr></thead>
        <tbody>
          ${previews.slice(0, filtroMes ? 999 : 12).map(item => `
            <tr>
              <td>${shortDateBR(item.date)}</td>
              <td>${escapeHtml(item.description)}</td>
              <td>${escapeHtml(item.account)}</td>
              <td>${escapeHtml(item.category)||'-'}</td>
              <td><span class="badge neutral">${item.frequency}</span></td>
              <td class="money ${item.type==='receita'?'positive':'negative'}">
                ${item.type==='receita'?'+':'-'}${formatCurrency(item.amount,item.currency)}
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
    <div class="ff-mobile-list">
      ${previews.slice(0, filtroMes ? 999 : 12).map(item => `
        <article class="ff-mobile-card">
          <div class="ff-mobile-card-title">
            <strong>${escapeHtml(item.description)}</strong>
            <strong class="${item.type==='receita'?'positive':'negative'}">
              ${item.type==='receita'?'+':'-'}${formatCurrency(item.amount,item.currency)}
            </strong>
          </div>
          <div class="ff-mobile-card-meta">
            <div><span>Data</span><br>${shortDateBR(item.date)}</div>
            <div><span>Conta</span><br>${escapeHtml(item.account)}</div>
            <div><span>Categoria</span><br>${escapeHtml(item.category)||'-'}</div>
            <div><span>Frequência</span><br><span class="badge neutral">${item.frequency}</span></div>
          </div>
        </article>
      `).join('')}
    </div>
  `;
}

// ─────────────────────────────────────────────
// LISTA DE MOVIMENTAÇÕES (com filtro de mês)
// ─────────────────────────────────────────────
async function loadMovements(){
  const monthFilter    = filterMonth.value; // "2026-06" ou vazio
  const categoryFilter = filterCategory.value; // id da categoria ou vazio
  const limit = (monthFilter || categoryFilter) ? 200 : 25;

  // Build date range when filter is active
  let dateGte = null, dateLte = null;
  if(monthFilter){
    const [y,m] = monthFilter.split('-').map(Number);
    dateGte = `${y}-${String(m).padStart(2,'0')}-01`;
    const lastDay = new Date(y, m, 0).getDate();
    dateLte = `${y}-${String(m).padStart(2,'0')}-${String(lastDay).padStart(2,'0')}`;
  }

  let txQuery = supabase.from('transactions')
    .select(`id,type,amount,description,date,status,is_recurring,recurrence_frequency,
      accounts:account_id(nome,currency),
      categories:category_id(nome,icon)`)
    .eq('user_id',user.id).order('date',{ascending:false}).limit(limit);

  let trQuery = supabase.from('account_transfers')
    .select(`id,amount,date,description,
      from_account:from_account_id(nome,currency),
      to_account:to_account_id(nome,currency)`)
    .eq('user_id',user.id).order('date',{ascending:false}).limit(monthFilter ? 200 : 10);

  let cardQuery = supabase.from('card_transactions')
    .select(`id,descricao,valor_total,valor_parcela,parcelas,parcela_atual,
      data_compra,fatura_referencia,status,
      credit_cards:card_id(nome),
      categories:category_id(nome,icon)`)
    .eq('user_id',user.id).order('created_at',{ascending:false}).limit(monthFilter ? 200 : 25);

  if(dateGte){
    txQuery   = txQuery.gte('date',dateGte).lte('date',dateLte);
    trQuery   = trQuery.gte('date',dateGte).lte('date',dateLte);
    cardQuery = cardQuery.gte('data_compra',dateGte).lte('data_compra',dateLte);
  }

  if(categoryFilter){
    txQuery   = txQuery.eq('category_id',categoryFilter);
    cardQuery = cardQuery.eq('category_id',categoryFilter);
  }

  // Transferências não têm categoria — não entram em resultados filtrados por categoria
  const [transactions, transfers, cardTx] = await Promise.all([
    txQuery, categoryFilter ? Promise.resolve({data:[]}) : trQuery, cardQuery,
  ]);

  const rows = [];

  (transactions.data||[]).forEach(t => rows.push({
    source:'transaction', id:t.id, date:t.date, kind:t.type,
    desc:t.description, account:t.accounts?.nome||'-',
    category:`${t.categories?.icon||''} ${t.categories?.nome||'-'}`,
    value:t.amount,
    sign:t.type==='receita'?'+':'-',
    status:t.status,
    isRecurring:t.is_recurring,
    recurrenceFreq:t.recurrence_frequency,
  }));

  (transfers.data||[]).forEach(t => rows.push({
    source:'transfer', id:t.id, date:t.date, kind:'transferência',
    desc:t.description||'Transferência',
    account:`${t.from_account?.nome||'-'} → ${t.to_account?.nome||'-'}`,
    category:'🔁 Transferência',
    value:t.amount, sign:'', status:'concluída',
    isRecurring:false,
  }));

  (cardTx.data||[]).forEach(c => {
    if(c.parcela_atual !== 1) return;
    const isRefund = Number(c.valor_total||0) < 0;
    rows.push({
      source:'card', id:c.id, date:c.data_compra, kind:'cartão',
      desc:c.descricao, account:c.credit_cards?.nome||'-',
      category:isRefund?'↩️ Estorno':`${c.categories?.icon||''} ${c.categories?.nome||'-'}`,
      value:Math.abs(c.valor_total||0), sign:isRefund?'+':'-',
      status:`${c.parcelas}x · ${refName(c.fatura_referencia)}`,
      isRecurring:false,
    });
  });

  rows.sort((a,b) => String(b.date).localeCompare(String(a.date)));

  if(categoryFilter){
    const total = rows.reduce((s,r) => s + Number(r.value||0), 0);
    const nomeCategoria = filterCategory.options[filterCategory.selectedIndex]?.textContent || '';
    filterCategoryTotal.style.display = '';
    filterCategoryTotal.textContent = `${nomeCategoria}: ${rows.length} lançamento${rows.length===1?'':'s'} · total ${formatCurrency(total,'BRL')}`;
  } else {
    filterCategoryTotal.style.display = 'none';
  }

  if(!rows.length){
    movementList.innerHTML = '<p class="muted" style="padding:18px">Nenhuma movimentação encontrada.</p>';
    return;
  }

  const badgeStatus = (r) => {
    if(r.status === 'pendente') return `<span class="badge pendente">pendente</span>`;
    if(r.status === 'pago')     return `<span class="badge success">pago</span>`;
    return `<span class="badge neutral">${r.status}</span>`;
  };

  movementList.innerHTML = `
    <div class="ff-desktop-table">
      <table class="data-table">
        <thead><tr>
          <th>Data</th><th>Tipo</th><th>Descrição</th>
          <th>Conta/Cartão</th><th>Categoria</th>
          <th>Status</th><th>Valor</th><th>Ações</th>
        </tr></thead>
        <tbody>
          ${rows.map(r => `
            <tr class="${r.status==='pendente'?'row-pendente':''}">
              <td>${formatDate(r.date)}</td>
              <td><span class="badge neutral">${r.kind}</span></td>
              <td>${escapeHtml(r.desc)}</td>
              <td>${escapeHtml(r.account)}</td>
              <td>${escapeHtml(r.category)}</td>
              <td>${badgeStatus(r)}</td>
              <td class="money ${r.sign==='+'?'positive':r.sign==='-'?'negative':''}">
                ${r.sign}${formatCurrency(r.value,'BRL')}
              </td>
              <td style="white-space:nowrap">
                ${r.source==='transaction' ? `
                  ${r.status==='pendente' ? `
                  <button type="button" class="btn btn-primary compact"
                    onclick="window.pagarMovimentoFinZen('${r.id}')"
                    style="background:#22c55e;border-color:#22c55e;padding:6px 8px" title="Marcar como pago">✓</button>
                  ` : ''}
                  <button type="button" class="btn btn-secondary compact"
                    onclick="window.editMovementFinZen('${r.id}')"
                    style="padding:6px 8px" title="Editar">✏️</button>
                  <button type="button" class="btn btn-danger compact"
                    onclick="window.deleteMovementFinZen('${r.id}')"
                    style="padding:6px 8px" title="Excluir">🗑️</button>
                ` : '<span class="muted">-</span>'}
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>

    <div class="ff-mobile-list">
      ${rows.map(r => `
        <article class="ff-mobile-card ${r.status==='pendente'?'pendente':''}">
          <div class="ff-mobile-card-title">
            <div>
              <strong>${escapeHtml(r.desc)}</strong><br>
              <span>${formatDate(r.date)} · ${r.kind}</span>
            </div>
            <strong class="${r.sign==='+'?'positive':r.sign==='-'?'negative':''}">
              ${r.sign}${formatCurrency(r.value,'BRL')}
            </strong>
          </div>
          <div class="ff-mobile-card-meta">
            <div><span>Conta/Cartão</span><br>${escapeHtml(r.account)}</div>
            <div><span>Categoria</span><br>${escapeHtml(r.category)}</div>
            <div><span>Status</span><br>${badgeStatus(r)}</div>
            <div><span>Tipo</span><br><span class="badge neutral">${r.kind}</span></div>
          </div>
          ${r.source==='transaction' ? `
            <div class="ff-mobile-card-actions">
              ${r.status==='pendente' ? `
              <button type="button" class="btn compact"
                onclick="window.pagarMovimentoFinZen('${r.id}')"
                style="background:#22c55e;border-color:#22c55e;color:#fff;flex:2">✓ Pagar</button>
              ` : ''}
              <button type="button" class="btn btn-secondary compact"
                onclick="window.editMovementFinZen('${r.id}')">Editar</button>
              <button type="button" class="btn btn-danger compact"
                onclick="window.deleteMovementFinZen('${r.id}')">Excluir</button>
            </div>
          ` : ''}
        </article>
      `).join('')}
    </div>
  `;
}

// ─────────────────────────────────────────────
// FORMULÁRIO — limpar / cancelar
// ─────────────────────────────────────────────
function clearForm(){
  movementType.value = '';
  paymentMethod.value = 'conta';
  movementAccount.value = '';
  fromAccount.value = '';
  toAccount.value = '';
  movementCard.value = '';
  movementCategory.innerHTML = '<option value="">Selecione</option>';
  movementDescription.value = '';
  movementAmount.value = '';
  movementInstallments.value = '1';
  movementValueType.value = 'total';
  movementDate.value = todayISO();
  movementStatus.value = 'pago';
  movementRecurrence.value = 'nao';
  movementRecurrenceUntil.value = '';
  movementNotes.value = '';
  updateFormVisibility();
}

function cancelEdit(){
  editingTransaction = null;
  formTitle.innerText = 'Nova Movimentação';
  btnSaveMovement.innerText = 'Salvar Movimentação';
  btnCancelEdit.style.display = 'none';
  clearForm();
}

// ─────────────────────────────────────────────
// REFRESH COMPLETO
// ─────────────────────────────────────────────
async function refreshAll(){
  await Promise.all([
    loadData(),
    renderCashFlowMonth(),
    loadUpcomingRecurring(),
    loadMovements(),
  ]);
}

// ─────────────────────────────────────────────
// EXPOR FUNÇÕES GLOBAIS (onclick no HTML)
// ─────────────────────────────────────────────
window.editMovementFinZen   = editTransaction;
window.deleteMovementFinZen = deleteTransaction;

// ── Dar baixa em lançamento pendente com 1 clique ────
window.pagarMovimentoFinZen = async function(id) {
  try {
    // Buscar transação
    const { data: tx, error } = await supabase
      .from('transactions')
      .select('*,accounts:account_id(saldo_atual,currency)')
      .eq('id', id).eq('user_id', user.id).single();

    if(error || !tx) { showMessage('Lançamento não encontrado.', 'danger'); return; }
    if(tx.status === 'pago') { showMessage('Lançamento já está pago.', 'info'); return; }

    // Marcar como pago
    await supabase.from('transactions')
      .update({ status: 'pago' })
      .eq('id', id).eq('user_id', user.id);

    // Atualizar saldo da conta
    if(tx.account_id && tx.accounts) {
      const saldoAtual = Number(tx.accounts.saldo_atual || 0);
      const valor      = Number(tx.amount || 0);
      const novoSaldo  = tx.type === 'receita'
        ? saldoAtual + valor
        : saldoAtual - valor;

      await supabase.from('accounts')
        .update({ saldo_atual: novoSaldo })
        .eq('id', tx.account_id).eq('user_id', user.id);
    }

    showMessage(`✓ "${tx.description}" marcado como pago!`, 'success');
    await loadMovements();
  } catch(e) {
    showMessage('Erro ao dar baixa: ' + e.message, 'danger');
  }
};

// ─────────────────────────────────────────────
// EVENTOS
// ─────────────────────────────────────────────
movementDate.value = todayISO();
filterMonth.value  = currentMonthValue();

movementType.addEventListener('change', updateFormVisibility);
paymentMethod.addEventListener('change', updateFormVisibility);
movementCard.addEventListener('change', updateFormVisibility);
movementDate.addEventListener('change', updateFormVisibility);
if(exchangeRateInput){
  exchangeRateInput.addEventListener('input', updateExchangePreview);
  movementAmount.addEventListener('input', updateExchangePreview);
  fromAccount.addEventListener('change', updateExchangePreview);
  toAccount.addEventListener('change', updateExchangePreview);
}
movementInstallments.addEventListener('input', updatePreview);
movementAmount.addEventListener('input', updatePreview);
movementValueType.addEventListener('change', updatePreview);
movementRecurrence.addEventListener('change', updateFormVisibility);
btnSaveMovement.addEventListener('click', saveMovement);
btnCancelEdit.addEventListener('click', cancelEdit);

filterMonth.addEventListener('change', loadMovements);
filterCategory.addEventListener('change', loadMovements);
btnClearFilter.addEventListener('click', () => {
  filterMonth.value = '';
  filterCategory.value = '';
  loadMovements();
});

// Filtro de recorrências
const filterRecorrencia  = el('filterRecorrencia');
const btnClearRecorrencia = el('btnClearRecorrencia');
if(filterRecorrencia){
  filterRecorrencia.value = currentMonthValue();
  filterRecorrencia.addEventListener('change', loadUpcomingRecurring);
  btnClearRecorrencia?.addEventListener('click', () => {
    filterRecorrencia.value = '';
    loadUpcomingRecurring();
  });
}

// ─────────────────────────────────────────────
// INICIALIZAÇÃO
// ─────────────────────────────────────────────
await loadData();
updateFormVisibility();
await renderCashFlowMonth();
await loadUpcomingRecurring();
await loadMovements();

// Pré-selecionar tipo via URL (FAB do mobile)
const urlParams = new URLSearchParams(window.location.search);
const tipoParam = urlParams.get('tipo');
if(tipoParam){
  if(tipoParam === 'cartao'){
    movementType.value = 'despesa';
    updateFormVisibility();
    paymentMethod.value = 'cartao';
    updateFormVisibility();
  }else{
    movementType.value = tipoParam;
    updateFormVisibility();
  }
  // Foca no campo descrição para lançamento rápido
  movementDescription.focus();
  // Limpa o param da URL sem recarregar
  window.history.replaceState({}, '', window.location.pathname);
}
