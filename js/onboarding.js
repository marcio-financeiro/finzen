/**
 * onboarding.js
 * Fluxo de boas-vindas para novos usuários — FinZen
 * Steps: Perfil → Conta → Categorias → Pronto
 */

import { supabase } from './supabaseClient.js';
import { navigate } from './router.js';
import { attachMoneyMask, readMoneyValue } from './moneyMask.js';

// ── Auth ──────────────────────────────────────────────
const { data: sd } = await supabase.auth.getSession();
if(!sd.session){ navigate('../login.html'); throw new Error('unauthenticated'); }
const user = sd.session.user;

// Preencher e-mail automaticamente
document.getElementById('obEmail').value = user.email || '';

const el  = id => document.getElementById(id);
attachMoneyMask(el('obContaSaldo'));
const msg = (txt, tipo='warning') => {
  el('obMsg').className = `message ${tipo}`;
  el('obMsg').textContent = txt;
  setTimeout(() => { el('obMsg').textContent = ''; }, 3000);
};

// ── Categorias sugeridas ──────────────────────────────
const CATS_DESPESA = [
  { nome:'Alimentação',    icon:'🍔', cor:'#f59e0b' },
  { nome:'Transporte',     icon:'🚗', cor:'#4b84f3' },
  { nome:'Saúde',          icon:'🏥', cor:'#f04e4e' },
  { nome:'Moradia',        icon:'🏠', cor:'#10b981' },
  { nome:'Educação',       icon:'📚', cor:'#7b5ce5' },
  { nome:'Lazer',          icon:'🎭', cor:'#06b6d4' },
  { nome:'Vestuário',      icon:'👕', cor:'#ec4899' },
  { nome:'Serviços',       icon:'💡', cor:'#f97316' },
  { nome:'Pets',           icon:'🐾', cor:'#84cc16' },
  { nome:'Academia',       icon:'💪', cor:'#f59e0b' },
  { nome:'Assinaturas',    icon:'📱', cor:'#8b5cf6' },
  { nome:'Viagem',         icon:'✈️', cor:'#22d3ee' },
];
const CATS_RECEITA = [
  { nome:'Salário',        icon:'💼', cor:'#1ec86a' },
  { nome:'Freelance',      icon:'💻', cor:'#10b981' },
  { nome:'Investimentos',  icon:'📈', cor:'#f59e0b' },
  { nome:'Outros',         icon:'➕', cor:'#6b7094' },
];

// Renderizar grid de categorias
const catGrid = el('catGrid');
const selecionadas = new Set();

[...CATS_DESPESA, ...CATS_RECEITA].forEach(cat => {
  const chip = document.createElement('div');
  chip.className = 'cat-chip';
  chip.innerHTML = `<span class="cat-icon">${cat.icon}</span>${cat.nome}`;
  chip.dataset.nome = cat.nome;
  chip.dataset.icon = cat.icon;
  chip.dataset.cor  = cat.cor;
  chip.dataset.tipo = CATS_RECEITA.find(c => c.nome === cat.nome) ? 'receita' : 'despesa';

  // Selecionar por padrão as mais comuns
  const padrao = ['Alimentação','Transporte','Saúde','Moradia','Salário','Lazer'];
  if (padrao.includes(cat.nome)) {
    chip.classList.add('selected');
    selecionadas.add(cat.nome);
  }

  chip.addEventListener('click', () => {
    chip.classList.toggle('selected');
    if (selecionadas.has(cat.nome)) selecionadas.delete(cat.nome);
    else selecionadas.add(cat.nome);
  });

  catGrid.appendChild(chip);
});

// ── Controle de steps ────────────────────────────────
let stepAtual = 1;

function irParaStep(n) {
  // Esconder todos
  document.querySelectorAll('.ob-step-content').forEach(c => c.classList.remove('active'));
  document.querySelectorAll('.ob-step').forEach(d => {
    d.classList.remove('active');
    if (parseInt(d.id.split('-')[2]) < n) d.classList.add('done');
    else d.classList.remove('done');
  });
  document.querySelectorAll('.ob-step-line').forEach(l => {
    if (parseInt(l.id.split('-')[2]) < n) l.classList.add('done');
    else l.classList.remove('done');
  });

  el(`ob-step-${n}`).classList.add('active');
  el(`step-dot-${n}`).classList.add('active');
  stepAtual = n;
}

// ── STEP 1: Salvar perfil ─────────────────────────────
el('btnOb1').addEventListener('click', async () => {
  const nome  = el('obNome').value.trim();
  const email = el('obEmail').value.trim();

  if (!nome) { msg('Informe como quer ser chamado.'); return; }
  if (!email) { msg('Informe seu e-mail para lembretes.'); return; }

  el('btnOb1').textContent = 'Salvando...';

  // Salvar em user_settings
  const upserts = [
    { user_id: user.id, setting_key: 'perfil_nome',           setting_value: nome  },
    { user_id: user.id, setting_key: 'perfil_email_notif',    setting_value: email },
    { user_id: user.id, setting_key: 'onboarding_concluido',  setting_value: 'true' },
  ];

  for (const u of upserts) {
    await supabase.from('user_settings').upsert(u, { onConflict: 'user_id,setting_key' });
  }

  // Atualizar saudação no step 4
  el('ob4Sub').textContent = `Olá, ${nome}! Seu FinZen está configurado. Explore todas as funcionalidades do seu assessor pessoal.`;

  el('btnOb1').textContent = 'Continuar →';
  irParaStep(2);
});

// ── STEP 2: Criar conta bancária ──────────────────────
el('btnOb2Back').addEventListener('click', () => irParaStep(1));
el('skipConta').addEventListener('click', () => irParaStep(3));

el('btnOb2').addEventListener('click', async () => {
  const nome   = el('obContaNome').value.trim();
  const tipo   = el('obContaTipo').value;
  const moeda  = el('obContaMoeda').value;
  const saldo  = readMoneyValue(el('obContaSaldo'));

  if (!nome) { msg('Informe o nome da conta.'); return; }

  el('btnOb2').textContent = 'Criando...';

  const { error } = await supabase.from('accounts').insert({
    user_id      : user.id,
    nome,
    tipo,
    currency     : moeda,
    saldo_atual  : saldo,
    active       : true,
  });

  if (error) { msg('Erro ao criar conta: ' + error.message, 'danger'); el('btnOb2').textContent = 'Continuar →'; return; }

  el('btnOb2').textContent = 'Continuar →';
  irParaStep(3);
});

// ── STEP 3: Criar categorias ──────────────────────────
el('btnOb3Back').addEventListener('click', () => irParaStep(2));
el('skipCats').addEventListener('click', () => irParaStep(4));

el('btnOb3').addEventListener('click', async () => {
  if (!selecionadas.size) { irParaStep(4); return; }

  el('btnOb3').textContent = 'Criando...';

  const chips = [...document.querySelectorAll('.cat-chip.selected')];
  const inserts = chips.map(c => ({
    user_id : user.id,
    nome    : c.dataset.nome,
    icon    : c.dataset.icon,
    cor     : c.dataset.cor,
    tipo    : c.dataset.tipo,
    ativo   : true,
  }));

  const { error } = await supabase.from('categories').insert(inserts);
  if (error) { msg('Erro ao criar categorias: ' + error.message, 'danger'); el('btnOb3').textContent = 'Continuar →'; return; }

  el('btnOb3').textContent = 'Continuar →';
  irParaStep(4);
});

// ── STEP 4: Ir para Dashboard ─────────────────────────
el('btnOb4').addEventListener('click', () => navigate('./dashboard.html'));

// ── Pular tudo ────────────────────────────────────────
el('skipAll').addEventListener('click', async () => {
  // Marcar onboarding como concluído mesmo sem preencher nada
  await supabase.from('user_settings').upsert(
    { user_id: user.id, setting_key: 'onboarding_concluido', setting_value: 'true' },
    { onConflict: 'user_id,setting_key' }
  );
  navigate('./dashboard.html');
});
