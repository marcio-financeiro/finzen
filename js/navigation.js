import { APP_VERSION } from './config.js';
import { supabase } from './supabaseClient.js';
import { registrarAcao } from './eventBus.js';
import { ICON_SPRITE_MARKUP } from './iconSprite.js';

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
  svg.innerHTML = ICON_SPRITE_MARKUP;
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
      { title: 'Movimentações',  icon: 'ic-arrows-updown', href: './movements.html' },
      { title: 'Extrato',        icon: 'ic-receipt', href: './account-statement.html' },
      { title: 'Faturas',        icon: 'ic-file-text', href: './card-bills.html' },
      { title: 'Orçamento',      icon: 'ic-target', href: './budgets.html' },
    ]
  },
  {
    label: 'Investimentos',
    icon: 'ic-trend',
    items: [
      { title: 'Carteira',       icon: 'ic-briefcase', href: './investments.html' },
      { title: 'Proventos',      icon: 'ic-coin', href: './dividends.html' },
      { title: 'Alocação',       icon: 'ic-target', href: './allocation.html' },
      { title: 'Patrimônio',     icon: 'ic-diamond', href: './patrimony-history.html' },
      { title: 'Metas',          icon: 'ic-flag', href: './goals.html' },
      { title: 'FIRE',           icon: 'ic-flame', href: './fire.html' },
      { title: 'Comparador',     icon: 'ic-scale', href: './comparador.html' },
    ]
  },
  {
    label: 'Gestão Pessoal',
    icon: 'ic-calendar',
    items: [
      { title: 'Calendário',     icon: 'ic-calendar', href: './calendar.html' },
      { title: 'Offshore',       icon: 'ic-droplet', href: './offshore.html' },
      { title: 'Viagens',        icon: 'ic-plane', href: './viagens.html' },
    ]
  },
  {
    label: 'Inteligência',
    icon: 'ic-chat',
    items: [
      { title: 'Chat IA',        icon: 'ic-chat', href: './chat.html' },
      { title: 'Relatório',      icon: 'ic-bar-chart', href: './reports.html' },
      { title: 'Analytics',      icon: 'ic-activity', href: './analytics.html' },
    ]
  },
  {
    label: 'Sistema',
    icon: 'ic-settings',
    items: [
      { title: 'Busca',          icon: 'ic-search', href: './search.html' },
      { title: 'Cadastros',      icon: 'ic-folder', href: './registrations.html' },
      { title: 'Meu Perfil',     icon: 'ic-user', href: './profile.html' },
      { title: 'Importar',       icon: 'ic-import', href: './importer.html' },
      { title: 'Notificações',   icon: 'ic-bell', href: './notifications.html' },
      { title: 'Backup',         icon: 'ic-archive', href: './backup.html' },
      { title: 'Restaurar',      icon: 'ic-rotate-ccw', href: './restore.html' },
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
    'card-purchases.html':  'movements.html',
    'cards.html':           'registrations.html',
    'transfers.html':       'movements.html',
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

  // Grupos principais abrem por padrão (menos 1 clique em quase toda navegação);
  // o usuário ainda pode fechá-los e a escolha fica salva.
  const ABERTOS_PADRAO = ['Financeiro', 'Investimentos'];
  const savedState = localStorage.getItem(storeKey);
  const collapsed  = savedState !== null
    ? savedState !== 'open'
    : !ABERTOS_PADRAO.includes(group.label);

  const itemsHtml = group.items.map(item => `
    <a class="${isActive(item.href) ? 'active' : ''}" href="${item.href}">
      <span class="nav-icon">${navIcon(item.icon)}</span>
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
  btn.innerHTML = navIcon('ic-menu');
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
  btn.innerHTML = navIcon(getPrivacy() ? 'ic-eye-off' : 'ic-eye');
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
        <span class="finzen-fab-icon" style="background:var(--accent)"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="6" width="19" height="13" rx="2.5"/><path d="M2.5 10.5h19"/></svg></span>
        <span>Cartão</span>
      </a>
      <a class="finzen-fab-option" href="${base}?tipo=transferencia">
        <span class="finzen-fab-icon" style="background:var(--info)">⇄</span>
        <span>Transferência</span>
      </a>
      <a class="finzen-fab-option" href="${base}?tipo=cambio">
        <span class="finzen-fab-icon" style="background:#e67e22"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 3v14M7 17l-3-3M7 17l3-3"/><path d="M17 21V7M17 7l3 3M17 7l-3 3"/></svg></span>
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

  // Labels sem `for` → foca o input/select/textarea irmão ao clicar
  document.addEventListener('click', e => {
    const lbl = e.target.closest('label:not([for])');
    if (!lbl) return;
    const ctrl = lbl.parentElement?.querySelector('input, select, textarea');
    if (ctrl) ctrl.focus();
  });

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
