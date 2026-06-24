import { APP_VERSION } from './config.js';
import { supabase } from './supabaseClient.js';
import { registrarAcao } from './eventBus.js';

// ─── Sidebar rail: aplicar antes do primeiro paint (anti-flash) ───────────────
const SIDEBAR_RAIL_KEY = 'finzen_sidebar_rail';
if (localStorage.getItem(SIDEBAR_RAIL_KEY) === 'collapsed') {
  document.documentElement.classList.add('sidebar-rail');
}

// ─── SVG Sprite ───────────────────────────────────────────────────────────────
function injectSvgSprite() {
  if (document.getElementById('finzen-svg-sprite')) return;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.id = 'finzen-svg-sprite';
  svg.setAttribute('style', 'display:none');
  svg.innerHTML = `
    <symbol id="ic-dashboard"    viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" rx="1.4"/><rect x="14" y="3" width="7" height="7" rx="1.4"/><rect x="3" y="14" width="7" height="7" rx="1.4"/><rect x="14" y="14" width="7" height="7" rx="1.4"/></symbol>
    <symbol id="ic-wallet"       viewBox="0 0 24 24"><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M3 10h18"/><circle cx="16" cy="14.5" r="1.2" fill="currentColor" stroke="none"/></symbol>
    <symbol id="ic-trend"        viewBox="0 0 24 24"><polyline points="3,17 9,11 13,15 21,6"/><polyline points="15,6 21,6 21,12"/></symbol>
    <symbol id="ic-calendar"     viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 9h18M8 3v4M16 3v4"/></symbol>
    <symbol id="ic-chat"         viewBox="0 0 24 24"><path d="M4 5h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H9l-4 4v-4H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z"/></symbol>
    <symbol id="ic-settings"     viewBox="0 0 24 24"><line x1="4" y1="6" x2="20" y2="6"/><circle cx="9" cy="6" r="2" fill="currentColor" stroke="none"/><line x1="4" y1="12" x2="20" y2="12"/><circle cx="15" cy="12" r="2" fill="currentColor" stroke="none"/><line x1="4" y1="18" x2="20" y2="18"/><circle cx="7" cy="18" r="2" fill="currentColor" stroke="none"/></symbol>
    <symbol id="ic-moon"         viewBox="0 0 24 24"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></symbol>
    <symbol id="ic-sun"          viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><line x1="12" y1="2" x2="12" y2="5"/><line x1="12" y1="19" x2="12" y2="22"/><line x1="4.22" y1="4.22" x2="6.34" y2="6.34"/><line x1="17.66" y1="17.66" x2="19.78" y2="19.78"/><line x1="2" y1="12" x2="5" y2="12"/><line x1="19" y1="12" x2="22" y2="12"/><line x1="4.22" y1="19.78" x2="6.34" y2="17.66"/><line x1="17.66" y1="6.34" x2="19.78" y2="4.22"/></symbol>
    <symbol id="ic-eye"          viewBox="0 0 24 24"><path d="M1 12S5 5 12 5s11 7 11 7-4 7-11 7S1 12 1 12z"/><circle cx="12" cy="12" r="3"/></symbol>
    <symbol id="ic-eye-off"      viewBox="0 0 24 24"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></symbol>
    <symbol id="ic-chevron-left" viewBox="0 0 24 24"><polyline points="15,4 9,12 15,20"/></symbol>
    <symbol id="ic-chevron-down" viewBox="0 0 24 24"><polyline points="6,9 12,15 18,9"/></symbol>
  `;
  document.body.insertBefore(svg, document.body.firstChild);
}

function navIcon(id) {
  return `<svg class="nav-svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><use href="#${id}"/></svg>`;
}

// ─── Flyout state ─────────────────────────────────────────────────────────────
let _flyoutTimer  = null;
let _flyoutPinned = false;
let _flyoutGroup  = null;

function showFlyout(triggerEl, group, pinned = false) {
  clearTimeout(_flyoutTimer);

  let flyout = document.getElementById('sidebarFlyout');
  if (!flyout) {
    flyout = document.createElement('div');
    flyout.id        = 'sidebarFlyout';
    flyout.className = 'sidebar-flyout';
    document.body.appendChild(flyout);
    flyout.addEventListener('mouseenter', () => clearTimeout(_flyoutTimer));
    flyout.addEventListener('mouseleave', () => { if (!_flyoutPinned) scheduleFlyoutHide(); });
  }

  _flyoutGroup  = group.label;
  _flyoutPinned = pinned;

  const rect = triggerEl.getBoundingClientRect();
  flyout.innerHTML = `
    <div class="flyout-title">${group.label}</div>
    ${group.items.map(item => `
      <a class="flyout-item${isActive(item.href) ? ' active' : ''}" href="${item.href}">${item.title}</a>
    `).join('')}
  `;

  flyout.style.top  = rect.top + 'px';
  flyout.style.left = (rect.right + 8) + 'px';
  flyout.classList.add('visible');

  requestAnimationFrame(() => {
    const r = flyout.getBoundingClientRect();
    if (r.bottom > window.innerHeight - 8) {
      flyout.style.top = (window.innerHeight - r.height - 8) + 'px';
    }
  });
}

function hideFlyout() {
  const flyout = document.getElementById('sidebarFlyout');
  if (flyout) flyout.classList.remove('visible');
  _flyoutPinned = false;
  _flyoutGroup  = null;
}

function scheduleFlyoutHide(delay = 150) {
  _flyoutTimer = setTimeout(hideFlyout, delay);
}

function toggleSidebarRail() {
  const collapsed = document.documentElement.classList.toggle('sidebar-rail');
  localStorage.setItem(SIDEBAR_RAIL_KEY, collapsed ? 'collapsed' : 'expanded');
  const btn = document.getElementById('sidebarRailToggle');
  if (btn) btn.setAttribute('aria-label', collapsed ? 'Expandir menu' : 'Recolher menu');
  hideFlyout();
}

registrarAcao('toggleSidebarRail', toggleSidebarRail);

// ─── Item solto: Dashboard (sem grupo, sem flyout) ────────────────────────────
const NAV_STANDALONE = [
  { title: 'Dashboard', icon: 'ic-dashboard', href: './dashboard.html', badge: true },
];

// ─── Grupos colapsáveis ───────────────────────────────────────────────────────
const NAV_GROUPS = [
  {
    label: 'Financeiro',
    icon: 'ic-wallet',
    items: [
      { title: 'Movimentações',  icon: '💸', href: './movements.html' },
      { title: 'Extrato',        icon: '🧾', href: './account-statement.html' },
      { title: 'Cartões',        icon: '💳', href: './cards.html' },
      { title: 'Faturas',        icon: '📄', href: './card-bills.html' },
      { title: 'Orçamento',      icon: '🎯', href: './budgets.html' },
    ]
  },
  {
    label: 'Investimentos',
    icon: 'ic-trend',
    items: [
      { title: 'Carteira',       icon: '📈', href: './investments.html' },
      { title: 'Proventos',      icon: '💰', href: './dividends.html' },
      { title: 'Alocação',       icon: '🎯', href: './allocation.html' },
      { title: 'Patrimônio',     icon: '💎', href: './patrimony-history.html' },
      { title: 'Metas',          icon: '🏆', href: './goals.html' },
      { title: 'FIRE',           icon: '🔥', href: './fire.html' },
      { title: 'Comparador',     icon: '⚖️', href: './comparador.html' },
    ]
  },
  {
    label: 'Gestão Pessoal',
    icon: 'ic-calendar',
    items: [
      { title: 'Calendário',     icon: '📅', href: './calendar.html' },
      { title: 'Offshore',       icon: '🛢️', href: './offshore.html' },
    ]
  },
  {
    label: 'Inteligência',
    icon: 'ic-chat',
    items: [
      { title: 'Chat IA',        icon: '💬', href: './chat.html' },
      { title: 'Relatório',      icon: '📊', href: './reports.html' },
      { title: 'Analytics',      icon: '📉', href: './analytics.html' },
    ]
  },
  {
    label: 'Sistema',
    icon: 'ic-settings',
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
    'allocation.html':      'investments.html',
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

// ─── Profile card: nome, avatar e stats ──────────────────────────────────────
const PROFILE_CACHE_KEY = 'finzen_profile_cache';

async function carregarProfileCard() {
  try {
    const { data: sd } = await supabase.auth.getSession();
    if (!sd?.session) return;
    const user = sd.session.user;

    // Tentar cache de sessão para evitar query repetida entre páginas
    let profileData = null;
    try { profileData = JSON.parse(sessionStorage.getItem(PROFILE_CACHE_KEY) || 'null'); } catch(_) {}

    if (!profileData) {
      const { data } = await supabase
        .from('user_settings')
        .select('setting_key,setting_value')
        .eq('user_id', user.id)
        .in('setting_key', ['perfil_nome', 'perfil_avatar_url']);

      const cfg = {};
      (data || []).forEach(r => { cfg[r.setting_key] = r.setting_value; });

      profileData = {
        name:      cfg['perfil_nome']      || user.email?.split('@')[0] || 'Usuário',
        avatarUrl: cfg['perfil_avatar_url'] || '',
      };
      try { sessionStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(profileData)); } catch(_) {}
    }

    const { name, avatarUrl } = profileData;
    const initial = name.charAt(0).toUpperCase();

    // Atualizar avatar na sidebar
    const initEl = document.getElementById('sidebarAvatarInitial');
    const imgEl  = document.getElementById('sidebarAvatarImg');
    if (avatarUrl && imgEl) {
      imgEl.src = avatarUrl;
      imgEl.style.display = 'block';
      if (initEl) initEl.style.display = 'none';
    } else if (initEl) {
      initEl.textContent   = initial;
      initEl.style.display = 'flex';
    }

    // Atualizar nome na sidebar, topbar e drawer
    const els = {
      sidebarUserName: document.getElementById('sidebarUserName'),
      userEmail:       document.getElementById('userEmail'),
      drawerUserName:  document.getElementById('drawerUserName'),
    };
    if (els.sidebarUserName) els.sidebarUserName.textContent = name;
    if (els.userEmail)       els.userEmail.textContent       = name;
    if (els.drawerUserName)  els.drawerUserName.textContent  = name;

    // Stats: saldo / cartões / metas
    const [
      { data: contas },
      { count: numCartoes },
      { count: numMetas },
    ] = await Promise.all([
      supabase.from('accounts').select('saldo_atual,currency').eq('user_id', user.id).eq('active', true),
      supabase.from('credit_cards').select('*', { count: 'exact', head: true }).eq('user_id', user.id).eq('ativo', true),
      supabase.from('goals').select('*', { count: 'exact', head: true }).eq('user_id', user.id).eq('ativo', true),
    ]);

    const saldo = (contas || [])
      .filter(c => (c.currency || 'BRL') === 'BRL')
      .reduce((s, c) => s + Number(c.saldo_atual || 0), 0);

    const fmtSaldo = saldo >= 1000
      ? `R$${(saldo / 1000).toFixed(1)}k`
      : `R$${saldo.toFixed(0)}`;

    const saldoEl   = document.getElementById('statSaldo');
    const cartoesEl = document.getElementById('statCartoes');
    const metasEl   = document.getElementById('statMetas');
    if (saldoEl)   saldoEl.textContent   = fmtSaldo;
    if (cartoesEl) cartoesEl.textContent = numCartoes || 0;
    if (metasEl)   metasEl.textContent   = numMetas   || 0;
  } catch (_) {}
}

// ─── Toggle de tema (claro / escuro) ─────────────────────────────────────────
const THEME_KEY = 'finzen_theme';

function getTheme() {
  return localStorage.getItem(THEME_KEY) || 'dark';
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  document.querySelectorAll('.theme-toggle-btn').forEach(btn => {
    const use = btn.querySelector('use');
    if (use) use.setAttribute('href', `#${theme === 'light' ? 'ic-moon' : 'ic-sun'}`);
    else btn.textContent = theme === 'light' ? '🌙' : '☀️';
    btn.title = theme === 'light' ? 'Modo escuro' : 'Modo claro';
    btn.setAttribute('aria-pressed', theme === 'light' ? 'true' : 'false');
  });
}

function toggleTheme() {
  const next = getTheme() === 'dark' ? 'light' : 'dark';
  localStorage.setItem(THEME_KEY, next);
  applyTheme(next);
}

registrarAcao('toggleTheme', toggleTheme);

function themeBtnHtml() {
  const theme  = getTheme();
  const iconId = theme === 'light' ? 'ic-moon' : 'ic-sun';
  return `<button
    class="theme-toggle-btn sidebar-icon-btn"
    type="button"
    data-action="toggleTheme"
    title="${theme === 'light' ? 'Modo escuro' : 'Modo claro'}"
    aria-pressed="${theme === 'light' ? 'true' : 'false'}"
  >${navIcon(iconId)}</button>`;
}

// ─── Toggle de privacidade (ocultar/mostrar valores) ─────────────────────────
const PRIVACY_KEY = 'finzen_privacy';

function getPrivacy() {
  return localStorage.getItem(PRIVACY_KEY) === 'on';
}

function applyPrivacy(hidden) {
  document.documentElement.setAttribute('data-privacy', hidden ? 'on' : 'off');
  document.querySelectorAll('.privacy-toggle-btn').forEach(btn => {
    const use = btn.querySelector('use');
    if (use) use.setAttribute('href', `#${hidden ? 'ic-eye-off' : 'ic-eye'}`);
    else btn.textContent = hidden ? '🙈' : '👁️';
    btn.title = hidden ? 'Mostrar valores' : 'Ocultar valores';
    btn.setAttribute('aria-pressed', hidden ? 'true' : 'false');
  });
}

function togglePrivacy() {
  const next = !getPrivacy();
  localStorage.setItem(PRIVACY_KEY, next ? 'on' : 'off');
  applyPrivacy(next);
}

registrarAcao('togglePrivacy', togglePrivacy);

function privacyBtnHtml() {
  const hidden = getPrivacy();
  const iconId = hidden ? 'ic-eye-off' : 'ic-eye';
  return `<button
    class="privacy-toggle-btn sidebar-icon-btn"
    type="button"
    data-action="togglePrivacy"
    title="${hidden ? 'Mostrar valores' : 'Ocultar valores'}"
    aria-pressed="${hidden ? 'true' : 'false'}"
  >${navIcon(iconId)}</button>`;
}

// ─── HTML dos grupos de navegação ─────────────────────────────────────────────
function groupHtml(group, forDrawer = false) {
  const prefix   = forDrawer ? 'drawer' : 'sidebar';
  const active   = isGroupActive(group);
  const storeKey = `nav_collapsed_v3_${group.label}`;

  // Grupos só abrem se o usuário os abriu manualmente; padrão é fechado
  const savedState = localStorage.getItem(storeKey);
  const collapsed  = savedState !== 'open';

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
        <span class="nav-group-icon">${navIcon(group.icon)}</span>
        <span class="nav-group-label">${group.label}</span>
        <span class="nav-group-arrow">${navIcon('ic-chevron-down')}</span>
      </button>
      <div class="nav-group-items">${itemsHtml}</div>
    </div>`;
}

function navHtml(forDrawer = false) {
  const standalone = NAV_STANDALONE.map(item => `
    <a class="nav-standalone ${isActive(item.href) ? 'active' : ''}" href="${item.href}">
      <span class="nav-icon">${navIcon(item.icon)}</span>
      <span class="nav-item-text">${item.title}</span>
      ${item.badge ? '<span class="nav-badge nav-dashboard-badge" style="display:none">0</span>' : ''}
    </a>
  `).join('');
  const groups = NAV_GROUPS.map(g => groupHtml(g, forDrawer)).join('');
  return standalone + groups;
}

// ─── Toggle de grupo (accordion) ─────────────────────────────────────────────
registrarAcao('toggleNavGroup', (el) => {
  // Em modo rail o flyout assume — não colapsar grupos
  if (document.documentElement.classList.contains('sidebar-rail')) return;

  const groupLabel  = el.dataset.groupLabel;
  const storeKey    = `nav_collapsed_v3_${groupLabel}`;
  const elements    = document.querySelectorAll(`.nav-group[data-group="${groupLabel}"]`);
  const isCollapsed = elements[0]?.classList.contains('collapsed');

  elements.forEach(elGrupo => elGrupo.classList.toggle('collapsed'));
  localStorage.setItem(storeKey, isCollapsed ? 'open' : 'closed');

  // Accordion: ao abrir um grupo, fechar todos os outros
  if (isCollapsed) {
    NAV_GROUPS.forEach(g => {
      if (g.label === groupLabel) return;
      document.querySelectorAll(`.nav-group[data-group="${g.label}"]`)
        .forEach(elGrupo => elGrupo.classList.add('collapsed'));
      localStorage.setItem(`nav_collapsed_v3_${g.label}`, 'closed');
    });
  }
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

    .nav-group-icon {
      display: flex; align-items: center; justify-content: center;
      width: 18px; height: 18px; flex-shrink: 0;
    }

    .nav-group-label {
      flex: 1;
      font-size: 10px; font-weight: 800;
      letter-spacing: 2px; text-transform: uppercase;
      color: var(--muted);
    }

    .nav-group-arrow {
      display: flex; align-items: center; justify-content: center;
      transition: transform .2s ease;
      color: var(--muted); opacity: .6;
    }

    .nav-group.collapsed .nav-group-arrow { transform: rotate(-90deg); }

    /* ── nav-icon padrão (subitens) ── */
    .nav-svg-icon { width: 18px; height: 18px; flex-shrink: 0; }

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

    /* ── Botões de privacidade e tema ── */
    .privacy-toggle-btn,
    .theme-toggle-btn {
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
    .privacy-toggle-btn:hover,
    .theme-toggle-btn:hover {
      border-color: var(--accent);
      background: var(--accent-dim);
    }

    /* ── Efeito blur nos valores sensíveis ── */
    [data-privacy="on"] .money,
    [data-privacy="on"] .positive,
    [data-privacy="on"] .negative,
    [data-privacy="on"] .kpi-card strong,
    [data-privacy="on"] .dash-kpi strong,
    [data-privacy="on"] .kpi-value,
    [data-privacy="on"] .inv-kpi strong,
    [data-privacy="on"] .bill-total,
    [data-privacy="on"] .stmt-kpi strong,
    [data-privacy="on"] .stmt-amount,
    [data-privacy="on"] .fire-kpi strong,
    [data-privacy="on"] .fire-resultado-valor,
    [data-privacy="on"] .an-kpi strong,
    [data-privacy="on"] .previsao-kpi strong,
    [data-privacy="on"] .alerta-valor,
    [data-privacy="on"] .wlt-kpi strong,
    [data-privacy="on"] .exec-kpi strong,
    [data-privacy="on"] .goal-amount,
    [data-privacy="on"] .bal-total,
    [data-privacy="on"] .bill-card-right .bill-total,
    [data-privacy="on"] [data-sensitive] {
      filter: blur(6px);
      user-select: none;
      transition: filter .25s ease;
    }
    [data-privacy="off"] .money,
    [data-privacy="off"] .positive,
    [data-privacy="off"] .negative,
    [data-privacy="off"] .kpi-card strong,
    [data-privacy="off"] .dash-kpi strong,
    [data-privacy="off"] .kpi-value,
    [data-privacy="off"] .inv-kpi strong,
    [data-privacy="off"] .bill-total,
    [data-privacy="off"] .stmt-kpi strong,
    [data-privacy="off"] .stmt-amount,
    [data-privacy="off"] .fire-kpi strong,
    [data-privacy="off"] .fire-resultado-valor,
    [data-privacy="off"] .an-kpi strong,
    [data-privacy="off"] .previsao-kpi strong,
    [data-privacy="off"] .alerta-valor,
    [data-privacy="off"] .wlt-kpi strong,
    [data-privacy="off"] .exec-kpi strong,
    [data-privacy="off"] .goal-amount,
    [data-privacy="off"] .bal-total,
    [data-privacy="off"] .bill-card-right .bill-total,
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
  brand.innerHTML = `
    <div class="sidebar-logo-mark">VY</div>
    <div class="sidebar-logo-text">
      <span class="sidebar-logo-name">VYN</span>
      <span class="sidebar-logo-sub">ASSESSOR PESSOAL</span>
    </div>
  `;

  // Card de perfil
  let profileCard = sidebar.querySelector('.sidebar-profile');
  if (!profileCard) {
    profileCard = document.createElement('div');
    profileCard.className = 'sidebar-profile';
    profileCard.innerHTML = `
      <div class="sidebar-avatar-ring">
        <img id="sidebarAvatarImg" class="sidebar-avatar-img" src="" alt="Avatar" style="display:none">
        <div class="sidebar-avatar" id="sidebarAvatarInitial">?</div>
      </div>
      <div class="sidebar-profile-info">
        <div class="sidebar-profile-name" id="sidebarUserName">Vyn</div>
        <div class="sidebar-profile-sub">Assessor Pessoal</div>
      </div>
      <div class="sidebar-profile-stats" id="sidebarProfileStats">
        <div class="sidebar-stat"><span class="sidebar-stat-val" id="statSaldo">—</span><span class="sidebar-stat-lbl">Saldo</span></div>
        <div class="sidebar-stat"><span class="sidebar-stat-val" id="statCartoes">—</span><span class="sidebar-stat-lbl">Cartões</span></div>
        <div class="sidebar-stat"><span class="sidebar-stat-val" id="statMetas">—</span><span class="sidebar-stat-lbl">Metas</span></div>
      </div>
    `;
  }

  // Nav
  let nav = sidebar.querySelector('.sidebar-nav');
  if (!nav) {
    nav = document.createElement('nav');
    nav.className = 'sidebar-nav';
    sidebar.appendChild(nav);
  }

  // Inserir profile card entre brand e nav
  if (!sidebar.querySelector('.sidebar-profile')) {
    sidebar.insertBefore(profileCard, nav);
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
    <div class="footer-btns">
      ${privacyBtnHtml()}
      ${themeBtnHtml()}
    </div>
    <span class="nav-version" style="padding:0;opacity:.45">v${APP_VERSION}</span>
  `;

  // Botão toggle rail (fixo na borda direita da sidebar)
  if (!document.getElementById('sidebarRailToggle')) {
    const railToggle = document.createElement('button');
    railToggle.id        = 'sidebarRailToggle';
    railToggle.className = 'sidebar-rail-toggle';
    railToggle.type      = 'button';
    railToggle.setAttribute('aria-label',
      localStorage.getItem(SIDEBAR_RAIL_KEY) === 'collapsed' ? 'Expandir menu' : 'Recolher menu');
    railToggle.innerHTML = `<svg class="nav-svg-icon rail-toggle-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><use href="#ic-chevron-left"/></svg>`;
    railToggle.addEventListener('click', toggleSidebarRail);
    document.body.appendChild(railToggle);
  }

  // Flyout: listeners nos botões de grupo (hover + clique)
  nav.querySelectorAll('.nav-group-toggle').forEach(btn => {
    const label = btn.dataset.groupLabel;
    const group = NAV_GROUPS.find(g => g.label === label);
    if (!group) return;

    btn.addEventListener('mouseenter', () => {
      if (document.documentElement.classList.contains('sidebar-rail')) showFlyout(btn, group);
    });
    btn.addEventListener('mouseleave', () => {
      if (document.documentElement.classList.contains('sidebar-rail')) scheduleFlyoutHide();
    });
    btn.addEventListener('click', e => {
      if (!document.documentElement.classList.contains('sidebar-rail')) return;
      e.preventDefault();
      e.stopPropagation();
      if (_flyoutPinned && _flyoutGroup === label) hideFlyout();
      else showFlyout(btn, group, true);
    });
  });
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
      <div class="drawer-avatar">VY</div>
      <div class="drawer-user">
        <div class="drawer-name" id="drawerUserName">Vyn</div>
        <div class="drawer-sub" id="drawerUserSub">Assessor Pessoal</div>
      </div>
      <button class="drawer-close" type="button" aria-label="Fechar menu">×</button>
    </div>
    <nav class="drawer-nav">${navHtml(true)}</nav>
    <div class="drawer-footer">
      <div style="display:flex;gap:6px;align-items:center">
        ${privacyBtnHtml('font-size:18px;')}
        ${themeBtnHtml('font-size:18px;')}
      </div>
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

  // Preencher nome do usuário no drawer (usa cache se disponível)
  supabase.auth.getSession().then(({ data: sd }) => {
    if (!sd?.session) return;
    const u = sd.session.user;
    let name = u.email?.split('@')[0] || 'Usuário';
    try {
      const cached = JSON.parse(sessionStorage.getItem(PROFILE_CACHE_KEY) || 'null');
      if (cached?.name) name = cached.name;
    } catch(_) {}
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

function openDrawer() {
  // Colapsar todos os grupos ao abrir — usuário escolhe o que expandir
  document.querySelectorAll('.mobile-drawer .nav-group').forEach(g => g.classList.add('collapsed'));
  document.body.classList.add('drawer-open');
}
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
  // Primeiro acesso: redirecionar para o Dashboard
  const FIRST_VISIT_KEY = 'finzen_visited';
  if (!localStorage.getItem(FIRST_VISIT_KEY)) {
    localStorage.setItem(FIRST_VISIT_KEY, '1');
    const isDashboard = currentFile() === 'dashboard.html';
    if (!isDashboard) {
      const base = window.location.pathname.includes('/pages/') ? './' : './pages/';
      window.location.replace(base + 'dashboard.html');
      return;
    }
  }

  // Limpar localStorage de versões antigas do nav
  const oldKeys = Object.keys(localStorage).filter(k =>
    k.startsWith('nav_collapsed_') && !k.startsWith('nav_collapsed_v3_')
  );
  oldKeys.forEach(k => localStorage.removeItem(k));

  injectSvgSprite();
  injectStyles();
  ensureDesktopSidebar();

  // Aplicar nome correto imediatamente (sem esperar query async)
  try {
    const _pc = JSON.parse(sessionStorage.getItem(PROFILE_CACHE_KEY) || 'null');
    if (_pc?.name) {
      const _uel = document.getElementById('userEmail');
      if (_uel) _uel.textContent = _pc.name;
    }
  } catch(_) {}

  carregarProfileCard().catch(() => {});
  removeOldBottomNav();
  ensureMobileDrawer();
  ensureMenuButton();
  ensureMobilePrivacyBtn();
  ensureFAB();

  // Aplicar tema imediatamente
  applyTheme(getTheme());

  // Aplicar estado de privacidade imediatamente
  applyPrivacy(getPrivacy());

  // Fechar flyout ao clicar fora (capture para pegar antes dos outros handlers)
  document.addEventListener('click', e => {
    if (!_flyoutPinned) return;
    const flyout  = document.getElementById('sidebarFlyout');
    const sidebar = document.querySelector('.sidebar');
    if (flyout  && flyout.contains(e.target))  return;
    if (sidebar && sidebar.contains(e.target)) return;
    hideFlyout();
  }, true);

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
