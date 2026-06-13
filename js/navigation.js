const NAV_GROUPS = [
  {
    label:'FinZen',
    items:[
      {title:'Dashboard',icon:'🏠',href:'./dashboard.html'},
      {title:'Movimentações',icon:'💸',href:'./movements.html'},
      {title:'Patrimônio',icon:'💎',href:'./patrimony-history.html'},
      {title:'Investimentos',icon:'📈',href:'./investments.html'},
      {title:'Cadastros',icon:'⚙️',href:'./registrations.html'}
    ]
  },
  {
    label:'Sistema',
    items:[
      {title:'Busca',icon:'🔍',href:'./search.html'},
      {title:'Backup',icon:'💾',href:'./backup.html'},
      {title:'Restaurar',icon:'📤',href:'./restore.html'}
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
  const file = currentFile();
  const target = normalizeHref(href);

  if(file === target) return true;

  if(file === 'accounts.html' && target === 'registrations.html') return true;
  if(file === 'cards.html' && target === 'registrations.html') return true;
  if(file === 'categories.html' && target === 'registrations.html') return true;
  if(file === 'wealth-dashboard.html' && target === 'patrimony-history.html') return true;
  if(file === 'patrimony-history.html' && target === 'patrimony-history.html') return true;

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
      top:0;
      left:0;
      bottom:0;
      width:min(320px, 82vw);
      background:var(--surface);
      border-right:1px solid var(--border);
      transform:translateX(-105%);
      z-index:9999;
      transition:.2s ease;
      overflow:auto;
      padding:18px;
    }

    .drawer-open .drawer-overlay{
      opacity:1;
      pointer-events:auto;
    }

    .drawer-open .mobile-drawer{
      transform:translateX(0);
    }

    .drawer-profile{
      display:flex;
      align-items:center;
      gap:12px;
      padding-bottom:18px;
      border-bottom:1px solid var(--border);
      margin-bottom:14px;
    }

    .drawer-avatar{
      width:42px;
      height:42px;
      border-radius:14px;
      display:grid;
      place-items:center;
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

    .drawer-nav a.active{
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

function openDrawer(){
  document.body.classList.add('drawer-open');
}

function closeDrawer(){
  document.body.classList.remove('drawer-open');
}

function initNavigation(){
  injectStyles();
  ensureDesktopSidebar();
  removeOldBottomNav();
  ensureMobileDrawer();
  ensureMenuButton();
}

if(document.readyState === 'loading'){
  document.addEventListener('DOMContentLoaded', initNavigation);
}else{
  initNavigation();
}
