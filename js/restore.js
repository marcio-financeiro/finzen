import { supabase } from './supabaseClient.js';
import { navigate } from './router.js';

const backupFile = document.getElementById('backupFile');
const backupText = document.getElementById('backupText');
const btnValidateBackup = document.getElementById('btnValidateBackup');
const btnRestoreBackup = document.getElementById('btnRestoreBackup');
const restoreMode = document.getElementById('restoreMode');
const replaceConfirmBox = document.getElementById('replaceConfirmBox');
const replaceConfirm = document.getElementById('replaceConfirm');

const restoreMessage = document.getElementById('restoreMessage');
const backupSummary = document.getElementById('backupSummary');
const restoreProgress = document.getElementById('restoreProgress');

const tableOrderInsert = [
  'accounts',
  'categories',
  'credit_cards',
  'budgets',
  'goals',
  'investments',
  'allocation_targets',
  'transactions',
  'card_transactions',
  'investment_transactions'
];

const tableOrderDelete = [
  'investment_transactions',
  'card_transactions',
  'transactions',
  'allocation_targets',
  'budgets',
  'goals',
  'investments',
  'credit_cards',
  'categories',
  'accounts'
];

const nomes = {
  accounts:'Contas',
  categories:'Categorias',
  transactions:'Lançamentos',
  credit_cards:'Cartões',
  card_transactions:'Compras/Faturas',
  budgets:'Orçamentos',
  goals:'Metas',
  investments:'Investimentos',
  investment_transactions:'Movimentações/Proventos',
  allocation_targets:'Alocação alvo'
};

let parsedBackup = null;

const { data: sessionData } = await supabase.auth.getSession();

if(!sessionData.session){
  navigate('../login.html');
}

const user = sessionData.session.user;

function mostrarMensagem(texto, tipo = 'info'){
  restoreMessage.className = `message ${tipo}`;
  restoreMessage.innerText = texto;
}

function mostrarProgresso(texto, tipo = 'info'){
  restoreProgress.className = `message ${tipo}`;
  restoreProgress.innerText = texto;
}

function normalizarBackup(raw){
  if(!raw || typeof raw !== 'object'){
    throw new Error('Arquivo inválido.');
  }

  if(raw.tables && typeof raw.tables === 'object'){
    return raw;
  }

  // Compatibilidade com backups antigos onde as tabelas ficam na raiz.
  const tables = {};
  tableOrderInsert.forEach(tabela => {
    if(Array.isArray(raw[tabela])){
      tables[tabela] = raw[tabela];
    }
  });

  return {
    app:'FinZen',
    version:'legacy',
    exported_at:null,
    user_id:null,
    tables,
    errors:[]
  };
}

async function lerArquivoComoTexto(file){
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Erro ao ler arquivo.'));

    reader.readAsText(file);
  });
}

async function obterTextoBackup(){
  const file = backupFile.files?.[0];

  if(file){
    return await lerArquivoComoTexto(file);
  }

  const texto = backupText.value.trim();

  if(texto){
    return texto;
  }

  throw new Error('Selecione um arquivo JSON ou cole o conteúdo do backup.');
}

function validarEstrutura(backup){
  if(!backup.tables || typeof backup.tables !== 'object'){
    throw new Error('Backup sem objeto tables.');
  }

  const tabelasEncontradas = Object.keys(backup.tables)
    .filter(tabela => Array.isArray(backup.tables[tabela]));

  if(!tabelasEncontradas.length){
    throw new Error('Nenhuma tabela válida encontrada no backup.');
  }

  return tabelasEncontradas;
}

function limparCamposSistema(registro){
  const clone = { ...registro };

  // Força o backup restaurado a pertencer ao usuário logado.
  clone.user_id = user.id;

  return clone;
}

function prepararRegistros(tabela, registros){
  if(!Array.isArray(registros)){
    return [];
  }

  return registros.map(limparCamposSistema);
}

function renderResumo(backup){
  const tabelas = tableOrderInsert.filter(tabela => Array.isArray(backup.tables[tabela]));
  const total = tabelas.reduce((soma, tabela) => soma + backup.tables[tabela].length, 0);

  backupSummary.innerHTML = `
    <div class="kpi-grid" style="margin-bottom:18px">
      <article class="kpi-card">
        <span>Total de registros</span>
        <strong>${total}</strong>
      </article>

      <article class="kpi-card">
        <span>Tabelas no backup</span>
        <strong>${tabelas.length}</strong>
      </article>

      <article class="kpi-card">
        <span>Versão</span>
        <strong>${backup.version || '-'}</strong>
      </article>
    </div>

    <table class="data-table">
      <thead>
        <tr>
          <th>Tabela</th>
          <th>Registros</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        ${tabelas.map(tabela => `
          <tr>
            <td>${nomes[tabela] || tabela}</td>
            <td class="money">${backup.tables[tabela].length}</td>
            <td><span class="badge success">ok</span></td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

async function validarBackup(){
  try{
    mostrarMensagem('Validando backup...');
    mostrarProgresso('');

    const texto = await obterTextoBackup();
    const raw = JSON.parse(texto);
    const backup = normalizarBackup(raw);

    validarEstrutura(backup);

    parsedBackup = backup;
    btnRestoreBackup.disabled = false;

    renderResumo(backup);
    mostrarMensagem('Backup validado com sucesso.', 'success');
  }catch(error){
    parsedBackup = null;
    btnRestoreBackup.disabled = true;
    backupSummary.innerHTML = '<p class="muted">Nenhum backup válido carregado.</p>';
    mostrarMensagem('Erro ao validar: ' + error.message, 'danger');
  }
}

async function apagarDadosAtuais(){
  for(const tabela of tableOrderDelete){
    mostrarProgresso(`Apagando ${nomes[tabela] || tabela}...`);

    const { error } = await supabase
      .from(tabela)
      .delete()
      .eq('user_id', user.id);

    if(error){
      throw new Error(`Erro ao apagar ${tabela}: ${error.message}`);
    }
  }
}

async function inserirTabela(tabela, registros){
  if(!registros.length){
    return;
  }

  mostrarProgresso(`Restaurando ${nomes[tabela] || tabela}...`);

  const loteTamanho = 100;

  for(let i = 0; i < registros.length; i += loteTamanho){
    const lote = registros.slice(i, i + loteTamanho);

    const { error } = await supabase
      .from(tabela)
      .upsert(lote, { onConflict:'id' });

    if(error){
      throw new Error(`Erro ao restaurar ${tabela}: ${error.message}`);
    }
  }
}

async function restaurarBackup(){
  try{
    if(!parsedBackup){
      mostrarProgresso('Valide um backup antes de restaurar.', 'warning');
      return;
    }

    const modo = restoreMode.value;

    if(modo === 'replace' && replaceConfirm.value.trim() !== 'RESTAURAR'){
      mostrarProgresso('Para substituir tudo, digite RESTAURAR.', 'warning');
      return;
    }

    btnRestoreBackup.disabled = true;

    if(modo === 'replace'){
      await apagarDadosAtuais();
    }

    for(const tabela of tableOrderInsert){
      const registros = prepararRegistros(tabela, parsedBackup.tables[tabela] || []);
      await inserirTabela(tabela, registros);
    }

    mostrarProgresso('Backup restaurado com sucesso.', 'success');
  }catch(error){
    mostrarProgresso(error.message, 'danger');
  }finally{
    btnRestoreBackup.disabled = false;
  }
}

restoreMode.addEventListener('change', () => {
  replaceConfirmBox.style.display = restoreMode.value === 'replace' ? 'block' : 'none';
});

btnValidateBackup.addEventListener('click', validarBackup);
btnRestoreBackup.addEventListener('click', restaurarBackup);
