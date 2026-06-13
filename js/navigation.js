const NAV_GROUPS = [
  {
    label:'FinZen',
    items:[
      {title:'Dashboard',      icon:'🏠', href:'./dashboard.html'},
      {title:'Movimentações',  icon:'💸', href:'./movements.html'},
      {title:'Cartões',        icon:'💳', href:'./cards.html'},
      {title:'Faturas',        icon:'📄', href:'./card-bills.html'},
      {title:'Investimentos',  icon:'📈', href:'./investments.html'},
      {title:'Patrimônio',     icon:'💎', href:'./patrimony-history.html'},
      {title:'Cadastros',      icon:'⚙️', href:'./registrations.html'}
    ]
  },
  {
    label:'Sistema',
    items:[
      {title:'Busca',          icon:'🔍', href:'./search.html'},
      {title:'Backup',         icon:'💾', href:'./backup.html'},
      {title:'Restaurar',      icon:'📤', href:'./restore.html'}
    ]
  }
];

function currentFile(){
  return window.location.pathname.split('/').pop() || 'index.html';
}

function normalizeHref(href){
  return href.replace('./','');
}

function isActive(href){
  const file   = currentFile();
  const target = normalizeHref(href);

  if(file === target) return true;

  if(file === 'accounts.html'        && target === 'registrations.html')   return true;
  if(file === 'cards.html'           && target === 'cards.html')           return true;
  if(file === 'card-purchases.html'  && target === 'cards.html')           return true;
  if(file === 'card-bills.html'      && target === 'card-bills.html')      return true;
  if(file === 'categories.html'      && target === 'registrations.html')   return true;
  if(file === 'wealth-dashboard.html'&& target === 'patrimony-history.html') return true;

  return false;
}

function navHtml(){
  return NAV_GROUPS.map(group => `
    <div class="nav-section-label">${group.label}</div>
    ${group.items.map(item => `
      <a class="${isActive(item.href) ? 'active' : ''}" href="${item.href}">
        <span class="nav-icon">${item.icon}</span>
        <span>${item.title}</span>
      </a>
    `).join('')}
  `).join('');
}

function injectStyles(){
  if(document.getElementById('finzen-921-navigation-style')) return;

  const style = document.createElement('style');
  style.id = 'finzen-921-navigation-style';
  style.textContent = `
    :root{ scrollbar-color:rgba(139,144,168,.34) transparent; scrollbar-width:thin; }
    *::-webkit-scrollbar{ width:8px; height:8px; }
    *::-webkit-scrollbar-track{ background:transparent; }
    *::-webkit-scrollbar-thumb{ background:rgba(139,144,168,.28); border-radius:999px; border:2px solid transparent; background-clip:content-box; }
    *::-webkit-scrollbar-thumb:hover{ background:rgba(75,132,243,.45); border:2px solid transparent; background-clip:content-box; }

    .mobile-menu-button{
      position:fixed;
      top:calc(env(safe-area-inset-top, 0px) + 18px);
      left:18px;
      width:54px;
      height:54px;
      border-radius:18px;
      border:1px solid var(--border);
      background:rgba(16,19,32,.92);
      color:var(--text);
      font-size:26px;
      z-index:9997;
      display:none;
      cursor:pointer;
    }

    .drawer-overlay{
      position:fixed;
      inset:0;
      background:rgba(0,0,0,.55);
      opacity:0;
      pointer-events:none;
      z-index:9998;
      transition:.18s ease;
    }

    .mobile-drawer{
      position:fixed;
      top:0; left:0; bottom:0;
      width:min(320px, 82vw);
      background:var(--surface);
      border-right:1px solid var(--border);
      transform:translateX(-105%);
      z-index:9999;
      transition:.2s ease;
      overflow:auto;
      padding:18px;
    }

    .drawer-open .drawer-overlay{ opacity:1; pointer-events:auto; }
    .drawer-open .mobile-drawer{ transform:translateX(0); }

    .drawer-profile{
      display:flex;
      align-items:center;
      gap:12px;
      padding-bottom:18px;
      border-bottom:1px solid var(--border);
      margin-bottom:14px;
    }

    .drawer-avatar{
      width:42px; height:42px;
      border-radius:14px;
      display:grid; place-items:center;
      font-weight:800;
      background:var(--accent);
    }

    .drawer-name{ font-weight:900; }
    .drawer-email{ color:var(--muted); font-size:.86rem; }

    .drawer-close{
      margin-left:auto;
      border:0;
      background:transparent;
      color:var(--text);
      font-size:28px;
      cursor:pointer;
    }

    .drawer-nav a{
      display:flex;
      align-items:center;
      gap:10px;
      padding:12px 10px;
      border-radius:12px;
      color:var(--muted);
      text-decoration:none;
    }

    .sidebar-nav::before{ content:none !important; }

    .sidebar-nav .nav-section-label{
      display:block;
      box-sizing:border-box;
      width:100%;
      padding:16px 20px 6px;
      margin:0;
      font-size:10px;
      font-weight:800;
      letter-spacing:2px;
      line-height:1.2;
      text-transform:uppercase;
      color:var(--muted);
    }

    .sidebar-nav .nav-icon,
    .drawer-nav .nav-icon{
      width:20px; min-width:20px;
      text-align:center;
      display:inline-block;
    }

    .drawer-nav .nav-section-label{
      display:block;
      padding:14px 10px 6px;
      margin:0;
      font-size:10px;
      font-weight:800;
      letter-spacing:2px;
      line-height:1.2;
      text-transform:uppercase;
      color:var(--muted);
    }

    .drawer-nav a.active,
    .sidebar-nav a.active{
      background:rgba(79,142,247,.16);
      color:var(--text);
    }

    @media(max-width:820px){
      .mobile-menu-button{ display:block; }
      .content{ padding-top:88px; }
    }
  `;
  document.head.appendChild(style);
}

function ensureDesktopSidebar(){
  const shell = document.querySelector('.app-shell');
  if(!shell) return;

  let sidebar = document.querySelector('.sidebar');
  if(!sidebar){
    sidebar = document.createElement('aside');
    sidebar.className = 'sidebar';
    sidebar.innerHTML = '<div class="sidebar-brand">FinZen</div><nav class="sidebar-nav"></nav>';
    shell.prepend(sidebar);
  }

  let nav = sidebar.querySelector('.sidebar-nav');
  if(!nav){
    nav = document.createElement('nav');
    nav.className = 'sidebar-nav';
    sidebar.appendChild(nav);
  }

  nav.innerHTML = navHtml();
}

function removeOldBottomNav(){
  document.querySelectorAll('nav.mobile-nav').forEach(nav => nav.remove());
}

function ensureMobileDrawer(){
  if(document.querySelector('.mobile-drawer')) return;

  const overlay = document.createElement('div');
  overlay.className = 'drawer-overlay';

  const drawer = document.createElement('aside');
  drawer.className = 'mobile-drawer';
  drawer.innerHTML = `
    <div class="drawer-profile">
      <div class="drawer-avatar">FZ</div>
      <div>
        <div class="drawer-name">FinZen</div>
        <div class="drawer-email">Menu principal</div>
      </div>
      <button class="drawer-close" type="button" aria-label="Fechar menu">×</button>
    </div>
    <nav class="drawer-nav">${navHtml()}</nav>
  `;

  document.body.appendChild(overlay);
  document.body.appendChild(drawer);

  drawer.querySelector('.drawer-close').addEventListener('click', closeDrawer);
  overlay.addEventListener('click', closeDrawer);
}

function ensureMenuButton(){
  if(document.querySelector('.mobile-menu-button')) return;

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'mobile-menu-button';
  btn.setAttribute('aria-label','Abrir menu');
  btn.innerHTML = '☰';
  btn.addEventListener('click', openDrawer);
  document.body.appendChild(btn);
}

function openDrawer(){  document.body.classList.add('drawer-open'); }
function closeDrawer(){ document.body.classList.remove('drawer-open'); }

// ─── FAB — Botão flutuante de lançamento rápido ───
function ensureFAB(){
  if(document.querySelector('.finzen-fab-wrap')) return;

  const wrap = document.createElement('div');
  wrap.className = 'finzen-fab-wrap';

  wrap.innerHTML = `
    <div class="finzen-fab-menu" id="finzenFabMenu">
      <a class="finzen-fab-option" href="./movements.html?tipo=receita" data-tipo="receita">
        <span class="finzen-fab-icon" style="background:var(--success)">+</span>
        <span>Receita</span>
      </a>
      <a class="finzen-fab-option" href="./movements.html?tipo=despesa" data-tipo="despesa">
        <span class="finzen-fab-icon" style="background:var(--danger)">−</span>
        <span>Despesa</span>
      </a>
      <a class="finzen-fab-option" href="./movements.html?tipo=cartao" data-tipo="cartao">
        <span class="finzen-fab-icon" style="background:var(--accent)">💳</span>
        <span>Cartão</span>
      </a>
      <a class="finzen-fab-option" href="./movements.html?tipo=transferencia" data-tipo="transferencia">
        <span class="finzen-fab-icon" style="background:var(--purple)">⇄</span>
        <span>Transferência</span>
      </a>
    </div>

    <button class="finzen-fab-btn" id="finzenFabBtn" type="button" aria-label="Novo lançamento">
      <span class="finzen-fab-plus">＋</span>
    </button>
  `;

  document.body.appendChild(wrap);

  const btn  = wrap.querySelector('#finzenFabBtn');
  const menu = wrap.querySelector('#finzenFabMenu');

  btn.addEventListener('click', e => {
    e.stopPropagation();
    const open = wrap.classList.toggle('open');
    btn.setAttribute('aria-expanded', open);
  });

  // Fechar ao clicar fora
  document.addEventListener('click', e => {
    if(!wrap.contains(e.target)){
      wrap.classList.remove('open');
      btn.setAttribute('aria-expanded', false);
    }
  });

  // Corrigir href para páginas dentro de /pages/
  const isInPages = window.location.pathname.includes('/pages/');
  if(isInPages){
    wrap.querySelectorAll('.finzen-fab-option').forEach(a => {
      a.href = a.href; // já está relativo — ok
    });
  }else{
    wrap.querySelectorAll('.finzen-fab-option').forEach(a => {
      a.href = a.href.replace('./movements.html','./pages/movements.html');
    });
  }
}

function injectFABStyles(){
  if(document.getElementById('finzen-fab-style')) return;
  const style = document.createElement('style');
  style.id = 'finzen-fab-style';
  style.textContent = `
    .finzen-fab-wrap{
      position:fixed;
      bottom:28px;
      right:22px;
      z-index:9996;
      display:flex;
      flex-direction:column;
      align-items:flex-end;
      gap:10px;
    }

    /* Esconde no desktop */
    @media(min-width:821px){
      .finzen-fab-wrap{ display:none; }
    }

    .finzen-fab-btn{
      width:58px;
      height:58px;
      border-radius:50%;
      border:none;
      background:var(--accent);
      color:#fff;
      font-size:28px;
      line-height:1;
      box-shadow:0 8px 28px rgba(75,132,243,.45);
      cursor:pointer;
      transition:transform .2s ease, background .2s ease;
      display:flex;
      align-items:center;
      justify-content:center;
    }

    .finzen-fab-btn:active{
      transform:scale(.92);
    }

    .finzen-fab-wrap.open .finzen-fab-btn{
      background:var(--danger);
      transform:rotate(45deg);
    }

    .finzen-fab-plus{
      display:block;
      transition:transform .2s ease;
      font-weight:300;
      margin-top:-2px;
    }

    /* Menu de opções */
    .finzen-fab-menu{
      display:flex;
      flex-direction:column;
      align-items:flex-end;
      gap:8px;
      opacity:0;
      pointer-events:none;
      transform:translateY(12px) scale(.95);
      transition:opacity .18s ease, transform .18s ease;
    }

    .finzen-fab-wrap.open .finzen-fab-menu{
      opacity:1;
      pointer-events:auto;
      transform:translateY(0) scale(1);
    }

    .finzen-fab-option{
      display:flex;
      align-items:center;
      gap:10px;
      background:var(--surface);
      border:1px solid var(--border);
      border-radius:999px;
      padding:8px 16px 8px 8px;
      color:var(--text);
      font-size:14px;
      font-weight:700;
      text-decoration:none;
      box-shadow:0 4px 16px rgba(0,0,0,.3);
      white-space:nowrap;
      transition:background .15s ease, transform .1s ease;
    }

    .finzen-fab-option:active{
      transform:scale(.96);
    }

    .finzen-fab-option:hover{
      background:var(--surface-2);
    }

    .finzen-fab-icon{
      width:32px;
      height:32px;
      border-radius:50%;
      display:flex;
      align-items:center;
      justify-content:center;
      font-size:16px;
      font-weight:900;
      color:#fff;
      flex-shrink:0;
    }
  `;
  document.head.appendChild(style);
}

function initNavigation(){
  injectStyles();
  injectFABStyles();
  ensureDesktopSidebar();
  removeOldBottomNav();
  ensureMobileDrawer();
  ensureMenuButton();
  ensureFAB();
}

if(document.readyState === 'loading'){
  document.addEventListener('DOMContentLoaded', initNavigation);
}else{
  initNavigation();
}
