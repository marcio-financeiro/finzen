const desktopMenu = [
  { label:'Dashboard', href:'./dashboard.html', match:'dashboard.html' },
  { label:'Contas', href:'./accounts.html', match:'accounts.html' },
  { label:'Categorias', href:'./categories.html', match:'categories.html' },
  { label:'Lançamentos', href:'./transactions.html', match:'transactions.html' },
  { label:'Cartões', href:'./cards.html', match:'cards.html' },
  { label:'Compras no Cartão', href:'./card-purchases.html', match:'card-purchases.html' },
  { label:'Faturas', href:'./card-bills.html', match:'card-bills.html' },
  { label:'Orçamento', href:'./budgets.html', match:'budgets.html' },
  { label:'Investimentos', href:'./investments.html', match:'investments.html' }
];

const mobileMenu = [
  { label:'Início', href:'./dashboard.html', match:'dashboard.html' },
  { label:'Lançar', href:'./transactions.html', match:'transactions.html' },
  { label:'Cartões', href:'./cards.html', match:'cards.html' },
  { label:'Faturas', href:'./card-bills.html', match:'card-bills.html' }
];

function currentPage(){
  return window.location.pathname.split('/').pop();
}

function renderMenu(containerSelector, items){
  const container = document.querySelector(containerSelector);

  if(!container){
    return;
  }

  const page = currentPage();

  container.innerHTML = items.map(item => `
    <a class="${page === item.match ? 'active' : ''}" href="${item.href}">
      ${item.label}
    </a>
  `).join('');
}

renderMenu('.sidebar-nav', desktopMenu);
renderMenu('.mobile-nav', mobileMenu);
