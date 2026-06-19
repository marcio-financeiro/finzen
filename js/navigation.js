import { APP_VERSION } from './config.js';
import { supabase } from './supabaseClient.js';
import { registrarAcao } from './eventBus.js';

// ─── Estrutura de navegação em 6 grupos colapsáveis ───────────────────────────
const NAV_GROUPS = [
  {
    label: 'Financeiro',
    icon: '💰',
    items: [
      { title: 'Dashboard',      icon: '🏠', href: './dashboard.html',        badge: true },
      { title: 'Movimentações',  icon: '💸', href: './movements.html' },
      { title: 'Extrato',        icon: '🧾', href: './account-statement.html' },
      { title: 'Cartões',        icon: '💳', href: './cards.html' },
      { title: 'Faturas',        icon: '📄', href: './card-bills.html' },
      { title: 'Orçamento',      icon: '🎯', href: './budgets.html' },
    ]
  },
  {
    label: 'Investimentos',
    icon: '📈',
    items: [
      { title: 'Carteira',       icon: '📈', href: './investments.html' },
      { title: 'Patrimônio',     icon: '💎', href: './patrimony-history.html' },
      { title: 'Metas',          icon: '🏆', href: './goals.html' },
      { title: 'FIRE',           icon: '🔥', href: './fire.html' },
      { title: 'Comparador',     icon: '⚖️', href: './comparador.html' },
    ]
  },
  {
    label: 'Gestão Pessoal',
    icon: '📅',
    items: [
      { title: 'Calendário',     icon: '📅', href: './calendar.html' },
      { title: 'Offshore',       icon: '🛢️', href: './offshore.html' },
    ]
  },
  {
    label: 'Inteligência',
    icon: '🤖',
    items: [
      { title: 'Chat IA',        icon: '💬', href: './chat.html' },
      { title: 'Relatório',      icon: '📊', href: './reports.html' },
      { title: 'Analytics',      icon: '📉', href: './analytics.html' },
    ]
  },
  {
    label: 'Sistema',
    icon: '⚙️',
    items: [
      { title: 'Busca',          icon: '🔍', href: './search.html' },
      { title: 'Cadastros',      icon: '⚙️', href: './registrations.html' },
      { title: 'Meu Perfil',     icon: '👤', href: './profile.html' },
      { title: 'Importar',       icon: '📥', href: './importer.html' },
      { title: 'Notificações',   icon: '🔔', href: './notifications.html' },
      { title: 'Backup',         icon: '💾', href: './backup.html' },
      { title: 'Restaurar',      icon: '📤', href: './restore.html' },
    ]
  }
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function currentFile() {
  return window.location.pathname.split('/').pop() || 'index.html';
}

function normalizeHref(href) {
  return href.replace('./', '');
}

function isActive(href) {
  const file   = currentFile();
  const target = normalizeHref(href);

  if (file === target) return true;

  // Aliases: páginas filhas que ativam o item pai
  const aliases = {
    'accounts.html':        'registrations.html',
    'categories.html':      'registrations.html',
    'card-purchases.html':  'cards.html',
    'wealth-dashboard.html':'patrimony-history.html',
    'asset-transactions.html': 'investments.html',
    'dividends.html':       'investments.html',
    'transfers.html':       'account-statement.html',
  };
  if (aliases[file] === target) return true;

  return false;
}

function isGroupActive(group) {
  return group.items.some(i => isActive(i.href));
}

// ─── Badge de notificações no Dashboard ───────────────────────────────────────
async function carregarBadges() {
  try {
    const { data: sd } = await supabase.auth.getSession();
    if (!sd?.session) return;
    const user = sd.session.user;
    const hoje = new Date().toISOString().split('T')[0];
    const em7  = new Date(Date.now() + 7 * 864e5).toISOString().split('T')[0];
    const ref  = hoje.substring(0, 7);

    const [{ count: pendentes }, { count: faturas }] = await Promise.all([
      supabase.from('transactions').select('*', { count: 'exact', head: true })
        .eq('user_id', user.id).eq('status', 'pendente').gte('date', hoje).lte('date', em7),
      supabase.from('card_transactions').select('*', { count: 'exact', head: true })
        .eq('user_id', user.id).eq('status', 'aberta').eq('fatura_referencia', ref),
    ]);

    const total = (pendentes || 0) + (faturas > 0 ? 1 : 0);
    if (total > 0) {
      document.querySelectorAll('.nav-dashboard-badge').forEach(el => {
        el.textContent = total;
        el.style.display = 'inline-flex';
      });
    }
  } catch (_) {}
}

// ─── Toggle de privacidade (ocultar/mostrar valores) ─────────────────────────
const PRIVACY_KEY = 'finzen_privacy';

function getPrivacy() {
  return localStorage.getItem(PRIVACY_KEY) === 'on';
}

function applyPrivacy(hidden) {
  document.documentElement.setAttribute('data-privacy', hidden ? 'on' : 'off');
  // Atualiza todos os botões de toggle presentes na página
  document.querySelectorAll('.privacy-toggle-btn').forEach(btn => {
    btn.textContent    = hidden ? '🙈' : '👁️';
    btn.title          = hidden ? 'Mostrar valores' : 'Ocultar valores';
    btn.setAttribute('aria-pressed', hidden ? 'true' : 'false');
  });
}

function togglePrivacy() {
  const next = !getPrivacy();
  localStorage.setItem(PRIVACY_KEY, next ? 'on' : 'off');
  applyPrivacy(next);
}

registrarAcao('togglePrivacy', togglePrivacy);

function privacyBtnHtml(extraStyle = '') {
  const hidden = getPrivacy();
  return `<button
    class="privacy-toggle-btn"
    type="button"
    data-action="togglePrivacy"
    title="${hidden ? 'Mostrar valores' : 'Ocultar valores'}"
    aria-pressed="${hidden ? 'true' : 'false'}"
    style="${extraStyle}"
  >${hidden ? '🙈' : '👁️'}</button>`;
}

// ─── HTML dos grupos de navegação ─────────────────────────────────────────────
function groupHtml(group, forDrawer = false) {
  const prefix   = forDrawer ? 'drawer' : 'sidebar';
  const active   = isGroupActive(group);
  const storeKey = `nav_collapsed_v3_${group.label}`;

  // Grupos com página ativa ficam sempre abertos
  // Outros: lê preferência salva; padrão é aberto
  const savedState = localStorage.getItem(storeKey);
  const collapsed  = active ? false : (savedState === 'closed');

  const itemsHtml = group.items.map(item => `
    <a class="${isActive(item.href) ? 'active' : ''}" href="${item.href}">
      <span class="nav-icon">${item.icon}</span>
      <span>${item.title}</span>
      ${item.badge ? '<span class="nav-badge nav-dashboard-badge" style="display:none">0</span>' : ''}
    </a>
  `).join('');

  return `
    <div class="nav-group ${collapsed ? 'collapsed' : ''}" data-group="${group.label}" data-prefix="${prefix}">
      <button class="nav-group-toggle" type="button"
        data-action="toggleNavGroup" data-group-label="${group.label}">
        <span class="nav-group-icon">${group.icon}</span>
        <span class="nav-group-label">${group.label}</span>
        <span class="nav-group-arrow">▾</span>
      </button>
      <div class="nav-group-items">${itemsHtml}</div>
    </div>`;
}

function navHtml(forDrawer = false) {
  const groups = NAV_GROUPS.map(g => groupHtml(g, forDrawer)).join('');
  return groups;
}

// ─── Toggle de grupo ──────────────────────────────────────────────────────────
registrarAcao('toggleNavGroup', (el) => {
  const groupLabel = el.dataset.groupLabel;
  const storeKey   = `nav_collapsed_v3_${groupLabel}`;
  const elements   = document.querySelectorAll(`.nav-group[data-group="${groupLabel}"]`);
  const isCollapsed = elements[0]?.classList.contains('collapsed');

  elements.forEach(elGrupo => elGrupo.classList.toggle('collapsed'));
  localStorage.setItem(storeKey, isCollapsed ? 'open' : 'closed');
});

// ─── Injeção de estilos globais ───────────────────────────────────────────────
function injectStyles() {
  if (document.getElementById('finzen-nav-style')) return;

  const style = document.createElement('style');
  style.id = 'finzen-nav-style';
  style.textContent = `

    /* ── Scrollbar ── */
    :root { scrollbar-color: rgba(139,144,168,.34) transparent; scrollbar-width: thin; }
    *::-webkit-scrollbar { width: 8px; height: 8px; }
    *::-webkit-scrollbar-track { background: transparent; }
    *::-webkit-scrollbar-thumb {
      background: rgba(139,144,168,.28); border-radius: 999px;
      border: 2px solid transparent; background-clip: content-box;
    }
    *::-webkit-scrollbar-thumb:hover {
      background: rgba(245,158,11,.45); border: 2px solid transparent;
      background-clip: content-box;
    }

    /* ── Badge ── */
    .nav-badge {
      display: inline-flex; align-items: center; justify-content: center;
      background: var(--danger, #ef4444); color: #fff;
      font-size: 9px; font-weight: 800; border-radius: 99px;
      padding: 1px 5px; margin-left: 6px; min-width: 16px; height: 16px;
      vertical-align: middle; line-height: 1;
    }

    /* ── Versão ── */
    .nav-version {
      padding: 10px 16px 4px;
      font-size: 10px; color: var(--muted); opacity: .5; letter-spacing: .5px;
    }

    /* ── Grupos colapsáveis ── */
    .nav-group { display: flex; flex-direction: column; }

    .nav-group-toggle {
      display: flex; align-items: center; gap: 8px;
      width: 100%; padding: 12px 20px 6px;
      background: transparent; border: none; cursor: pointer;
      color: var(--muted); text-align: left;
    }

    .nav-group-icon { font-size: 13px; }

    .nav-group-label {
      flex: 1;
      font-size: 10px; font-weight: 800;
      letter-spacing: 2px; text-transform: uppercase;
      color: var(--muted);
    }

    .nav-group-arrow {
      font-size: 11px;
      transition: transform .2s ease;
      color: var(--muted);
      opacity: .6;
    }

    .nav-group.collapsed .nav-group-arrow { transform: rotate(-90deg); }

    .nav-group-items {
      overflow: hidden;
      max-height: 800px;
      transition: max-height .25s ease, opacity .2s ease;
      opacity: 1;
    }

    .nav-group.collapsed .nav-group-items {
      max-height: 0;
      opacity: 0;
    }

    /* ── Links sidebar ── */
    .sidebar-nav a {
      position: relative; display: flex; align-items: center;
      gap: 10px; padding: 9px 20px;
      color: var(--muted); font-size: 13px;
      transition: background .15s ease, color .15s ease;
    }
    .sidebar-nav a:hover { background: rgba(255,255,255,.03); color: var(--text); }
    .sidebar-nav a.active {
      background: var(--accent-dim); color: var(--accent);
    }
    .sidebar-nav a.active::before {
      content: ""; position: absolute; left: 0; top: 4px; bottom: 4px;
      width: 3px; background: var(--accent); border-radius: 0 2px 2px 0;
    }

    /* ── Links drawer ── */
    .drawer-nav a {
      display: flex; align-items: center; gap: 10px;
      padding: 12px 10px; border-radius: 12px;
      color: var(--muted); text-decoration: none;
    }
    .drawer-nav a.active { background: var(--accent-dim); color: var(--accent); }

    /* ── Separador de grupos ── */
    .nav-group + .nav-group { border-top: 1px solid rgba(255,255,255,.04); }

    /* ── Footer do sidebar: privacidade + versão ── */
    .sidebar-footer {
      margin-top: auto;
      padding: 12px 16px 16px;
      border-top: 1px solid var(--border);
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    }

    /* ── Botão de privacidade ── */
    .privacy-toggle-btn {
      background: transparent;
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 5px 10px;
      font-size: 16px;
      cursor: pointer;
      transition: border-color .15s, background .15s;
      line-height: 1;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .privacy-toggle-btn:hover {
      border-color: var(--accent);
      background: var(--accent-dim);
    }

    /* ── Efeito blur nos valores sensíveis ── */
    [data-privacy="on"] .money,
    [data-privacy="on"] .kpi-card strong,
    [data-privacy="on"] .dash-kpi strong,
    [data-privacy="on"] .kpi-value,
    [data-privacy="on"] [data-sensitive] {
      filter: blur(6px);
      user-select: none;
      transition: filter .25s ease;
    }
    [data-privacy="off"] .money,
    [data-privacy="off"] .kpi-card strong,
    [data-privacy="off"] .dash-kpi strong,
    [data-privacy="off"] .kpi-value,
    [data-privacy="off"] [data-sensitive] {
      filter: none;
      transition: filter .25s ease;
    }

    /* ── Botão menu mobile ── */
    .mobile-menu-button {
      position: fixed;
      top: calc(env(safe-area-inset-top, 0px) + 16px);
      left: 16px;
      width: 48px; height: 48px;
      border-radius: 14px;
      border: 1px solid var(--border);
      background: rgba(16,19,32,.92);
      color: var(--text);
      font-size: 22px;
      z-index: 9997;
      display: none;
      cursor: pointer;
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
    }

    /* Botão privacidade mobile — topbar direito */
    .mobile-privacy-btn {
      position: fixed;
      top: calc(env(safe-area-inset-top, 0px) + 16px);
      right: 16px;
      width: 48px; height: 48px;
      border-radius: 14px;
      border: 1px solid var(--border);
      background: rgba(16,19,32,.92);
      font-size: 20px;
      z-index: 9997;
      display: none;
      cursor: pointer;
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
      align-items: center;
      justify-content: center;
    }

    /* ── Drawer overlay ── */
    .drawer-overlay {
      position: fixed; inset: 0;
      background: rgba(0,0,0,.55);
      opacity: 0; pointer-events: none;
      z-index: 9998; transition: .18s ease;
    }

    /* ── Drawer mobile ── */
    .mobile-drawer {
      position: fixed; top: 0; left: 0; bottom: 0;
      width: min(300px, 82vw);
      background: var(--surface);
      border-right: 1px solid var(--border);
      transform: translateX(-105%);
      z-index: 9999; transition: .2s ease;
      overflow-y: auto; overflow-x: hidden;
      display: flex; flex-direction: column;
      padding-bottom: env(safe-area-inset-bottom, 0px);
    }

    .drawer-open .drawer-overlay { opacity: 1; pointer-events: auto; }
    .drawer-open .mobile-drawer  { transform: translateX(0); }

    /* ── Drawer header ── */
    .drawer-header {
      display: flex; align-items: center; gap: 12px;
      padding: 18px 16px 14px;
      border-bottom: 1px solid var(--border);
      flex-shrink: 0;
    }

    .drawer-avatar {
      width: 40px; height: 40px; border-radius: 12px;
      display: grid; place-items: center;
      font-weight: 800; font-size: 15px;
      background: var(--accent-dim); color: var(--accent);
      border: 1px solid rgba(245,158,11,.2);
      flex-shrink: 0;
    }

    .drawer-user { flex: 1; min-width: 0; }
    .drawer-name { font-weight: 800; font-size: 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .drawer-sub  { color: var(--muted); font-size: 11px; margin-top: 1px; }

    .drawer-close {
      margin-left: auto; border: 0;
      background: transparent; color: var(--muted);
      font-size: 24px; cursor: pointer;
      padding: 4px; line-height: 1;
      flex-shrink: 0;
    }
    .drawer-close:hover { color: var(--text); }

    /* ── Nav dentro do drawer ── */
    .drawer-nav {
      flex: 1; padding: 8px 8px 16px;
    }

    .drawer-nav .nav-group-toggle { padding: 10px 12px 6px; }
    .drawer-nav .nav-group + .nav-group { border-top: 1px solid rgba(255,255,255,.04); }

    /* ── Footer do drawer: privacidade ── */
    .drawer-footer {
      padding: 12px 16px;
      border-top: 1px solid var(--border);
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-shrink: 0;
    }

    .drawer-footer-version {
      font-size: 10px;
      color: var(--muted);
      opacity: .5;
    }

    /* ── Responsivo ── */
    @media (max-width: 820px) {
      .mobile-menu-button { display: flex; align-items: center; justify-content: center; }
      .mobile-privacy-btn { display: flex; }
      .content { padding-top: 80px; }
    }

    /* ── FAB ── */
    .finzen-fab-wrap {
      position: fixed; bottom: 28px; right: 22px;
      z-index: 9996;
      display: flex; flex-direction: column; align-items: flex-end; gap: 10px;
    }
    @media (min-width: 821px) { .finzen-fab-wrap { display: none; } }

    .finzen-fab-btn {
      width: 58px; height: 58px; border-radius: 50%;
      border: none; background: var(--accent); color: #000;
      font-size: 28px; line-height: 1;
      box-shadow: 0 8px 28px rgba(245,158,11,.45);
      cursor: pointer;
      transition: transform .2s ease, background .2s ease;
      display: flex; align-items: center; justify-content: center;
    }
    .finzen-fab-btn:active { transform: scale(.92); }
    .finzen-fab-wrap.open .finzen-fab-btn { background: var(--danger); transform: rotate(45deg); }

    .finzen-fab-plus { display: block; transition: transform .2s ease; font-weight: 300; margin-top: -2px; }

    .finzen-fab-menu {
      display: flex; flex-direction: column; align-items: flex-end; gap: 8px;
      opacity: 0; pointer-events: none;
      transform: translateY(12px) scale(.95);
      transition: opacity .18s ease, transform .18s ease;
    }
    .finzen-fab-wrap.open .finzen-fab-menu { opacity: 1; pointer-events: auto; transform: translateY(0) scale(1); }

    .finzen-fab-option {
      display: flex; align-items: center; gap: 10px;
      background: var(--surface); border: 1px solid var(--border);
      border-radius: 999px; padding: 8px 16px 8px 8px;
      color: var(--text); font-size: 14px; font-weight: 700;
      text-decoration: none;
      box-shadow: 0 4px 16px rgba(0,0,0,.3);
      white-space: nowrap;
      transition: background .15s ease, transform .1s ease;
    }
    .finzen-fab-option:active { transform: scale(.96); }
    .finzen-fab-option:hover  { background: var(--surface-2); }

    .finzen-fab-icon {
      width: 32px; height: 32px; border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      font-size: 16px; font-weight: 900; color: #fff; flex-shrink: 0;
    }

    /* ── nav-icon padrão ── */
    .nav-icon { width: 20px; min-width: 20px; text-align: center; display: inline-block; }
  `;
  document.head.appendChild(style);
}

// ─── Sidebar desktop ──────────────────────────────────────────────────────────
function ensureDesktopSidebar() {
  const shell = document.querySelector('.app-shell');
  if (!shell) return;

  let sidebar = document.querySelector('.sidebar');
  if (!sidebar) {
    sidebar = document.createElement('aside');
    sidebar.className = 'sidebar';
    shell.prepend(sidebar);
  }

  // Brand
  let brand = sidebar.querySelector('.sidebar-brand');
  if (!brand) {
    brand = document.createElement('div');
    brand.className = 'sidebar-brand';
    sidebar.prepend(brand);
  }
  brand.textContent = 'FinZen';

  // Nav
  let nav = sidebar.querySelector('.sidebar-nav');
  if (!nav) {
    nav = document.createElement('nav');
    nav.className = 'sidebar-nav';
    sidebar.appendChild(nav);
  }
  nav.innerHTML = navHtml(false);

  // Footer: toggle privacidade + versão
  let footer = sidebar.querySelector('.sidebar-footer');
  if (!footer) {
    footer = document.createElement('div');
    footer.className = 'sidebar-footer';
    sidebar.appendChild(footer);
  }
  footer.innerHTML = `
    ${privacyBtnHtml()}
    <div style="display:flex;flex-direction:column;align-items:flex-end;gap:2px">
      <span class="nav-version" style="padding:0;opacity:.45">v${APP_VERSION}</span>
    </div>
  `;
}

// ─── Drawer mobile ────────────────────────────────────────────────────────────
function ensureMobileDrawer() {
  if (document.querySelector('.mobile-drawer')) return;

  const overlay = document.createElement('div');
  overlay.className = 'drawer-overlay';
  overlay.addEventListener('click', closeDrawer);

  const drawer = document.createElement('aside');
  drawer.className = 'mobile-drawer';
  drawer.innerHTML = `
    <div class="drawer-header">
      <div class="drawer-avatar">FZ</div>
      <div class="drawer-user">
        <div class="drawer-name" id="drawerUserName">FinZen</div>
        <div class="drawer-sub" id="drawerUserSub">Assessor Pessoal</div>
      </div>
      <button class="drawer-close" type="button" aria-label="Fechar menu">×</button>
    </div>
    <nav class="drawer-nav">${navHtml(true)}</nav>
    <div class="drawer-footer">
      ${privacyBtnHtml('font-size:18px;')}
      <span class="drawer-footer-version">v${APP_VERSION}</span>
    </div>
  `;

  document.body.appendChild(overlay);
  document.body.appendChild(drawer);

  drawer.querySelector('.drawer-close').addEventListener('click', closeDrawer);

  // Fechar ao navegar
  drawer.querySelectorAll('a').forEach(a => {
    a.addEventListener('click', closeDrawer);
  });

  // Preencher nome do usuário no drawer
  supabase.auth.getSession().then(({ data: sd }) => {
    if (!sd?.session) return;
    const u    = sd.session.user;
    const name = u.user_metadata?.full_name || u.email?.split('@')[0] || 'Usuário';
    const nameEl = document.getElementById('drawerUserName');
    const subEl  = document.getElementById('drawerUserSub');
    if (nameEl) nameEl.textContent = name;
    if (subEl)  subEl.textContent  = u.email || '';
  }).catch(() => {});
}

// ─── Botão hamburguer mobile ──────────────────────────────────────────────────
function ensureMenuButton() {
  if (document.querySelector('.mobile-menu-button')) return;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'mobile-menu-button';
  btn.setAttribute('aria-label', 'Abrir menu');
  btn.innerHTML = '☰';
  btn.addEventListener('click', openDrawer);
  document.body.appendChild(btn);
}

// ─── Botão privacidade mobile (canto superior direito) ────────────────────────
function ensureMobilePrivacyBtn() {
  if (document.querySelector('.mobile-privacy-btn')) return;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'mobile-privacy-btn privacy-toggle-btn';
  btn.setAttribute('aria-label', 'Ocultar valores');
  btn.setAttribute('aria-pressed', getPrivacy() ? 'true' : 'false');
  btn.title = getPrivacy() ? 'Mostrar valores' : 'Ocultar valores';
  btn.textContent = getPrivacy() ? '🙈' : '👁️';
  btn.addEventListener('click', togglePrivacy);
  document.body.appendChild(btn);
}

function openDrawer()  { document.body.classList.add('drawer-open'); }
function closeDrawer() { document.body.classList.remove('drawer-open'); }

// ─── FAB ──────────────────────────────────────────────────────────────────────
function ensureFAB() {
  if (document.querySelector('.finzen-fab-wrap')) return;

  const isInPages = window.location.pathname.includes('/pages/');
  const base      = isInPages ? './movements.html' : './pages/movements.html';

  const wrap = document.createElement('div');
  wrap.className = 'finzen-fab-wrap';
  wrap.innerHTML = `
    <div class="finzen-fab-menu" id="finzenFabMenu">
      <a class="finzen-fab-option" href="${base}?tipo=receita">
        <span class="finzen-fab-icon" style="background:var(--success)">+</span>
        <span>Receita</span>
      </a>
      <a class="finzen-fab-option" href="${base}?tipo=despesa">
        <span class="finzen-fab-icon" style="background:var(--danger)">−</span>
        <span>Despesa</span>
      </a>
      <a class="finzen-fab-option" href="${base}?tipo=cartao">
        <span class="finzen-fab-icon" style="background:var(--accent)">💳</span>
        <span>Cartão</span>
      </a>
      <a class="finzen-fab-option" href="${base}?tipo=transferencia">
        <span class="finzen-fab-icon" style="background:var(--purple)">⇄</span>
        <span>Transferência</span>
      </a>
      <a class="finzen-fab-option" href="${base}?tipo=cambio">
        <span class="finzen-fab-icon" style="background:#e67e22">💱</span>
        <span>Câmbio</span>
      </a>
    </div>
    <button class="finzen-fab-btn" id="finzenFabBtn" type="button" aria-label="Novo lançamento">
      <span class="finzen-fab-plus">＋</span>
    </button>
  `;
  document.body.appendChild(wrap);

  const btn  = wrap.querySelector('#finzenFabBtn');
  btn.addEventListener('click', e => {
    e.stopPropagation();
    const open = wrap.classList.toggle('open');
    btn.setAttribute('aria-expanded', open);
  });

  document.addEventListener('click', e => {
    if (!wrap.contains(e.target)) {
      wrap.classList.remove('open');
      btn.setAttribute('aria-expanded', 'false');
    }
  });
}

// ─── Remove nav inferior legada ───────────────────────────────────────────────
function removeOldBottomNav() {
  document.querySelectorAll('nav.mobile-nav').forEach(nav => nav.remove());
}

// ─── Init ─────────────────────────────────────────────────────────────────────
function initNavigation() {
  // Limpar localStorage de versões antigas do nav
  const oldKeys = Object.keys(localStorage).filter(k =>
    k.startsWith('nav_collapsed_') && !k.startsWith('nav_collapsed_v3_')
  );
  oldKeys.forEach(k => localStorage.removeItem(k));

  injectStyles();
  ensureDesktopSidebar();
  removeOldBottomNav();
  ensureMobileDrawer();
  ensureMenuButton();
  ensureMobilePrivacyBtn();
  ensureFAB();

  // Aplicar estado de privacidade imediatamente
  applyPrivacy(getPrivacy());

  // Carregar badges async
  carregarBadges().catch(() => {});

  // Service Worker + Notificações
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('../sw.js', { scope: '../' })
      .then(async () => {
        if (Notification.permission === 'granted') {
          const { supabase: sb } = await import('./supabaseClient.js');
          const { data: sd } = await sb.auth.getSession();
          if (sd?.session) {
            const { agendarAlertas } = await import('./notifications.js');
            agendarAlertas(sd.session.user.id).catch(() => {});
          }
        }
      }).catch(() => {});
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initNavigation);
} else {
  initNavigation();
}
