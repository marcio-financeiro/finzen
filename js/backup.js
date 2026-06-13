import { supabase } from './supabaseClient.js';
import { navigate } from './router.js';

const btnBackup = document.getElementById('btnBackup');
const backupInfo = document.getElementById('backupInfo');
const backupMessage = document.getElementById('backupMessage');
const backupActions = document.getElementById('backupActions');
const backupPreview = document.getElementById('backupPreview');
const btnDownloadFallback = document.getElementById('btnDownloadFallback');
const btnShareText = document.getElementById('btnShareText');
const btnCopyBackup = document.getElementById('btnCopyBackup');

const tabelas = [
  'accounts',
  'categories',
  'transactions',
  'credit_cards',
  'card_transactions',
  'budgets',
  'goals',
  'investments',
  'investment_transactions',
  'allocation_targets'
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

const { data: sessionData } = await supabase.auth.getSession();

if(!sessionData.session){
  navigate('../login.html');
}

const user = sessionData.session.user;
let ultimoBackupJson = '';
let ultimoBackupNome = '';

function mostrarMensagem(texto, tipo = 'info'){
  backupMessage.className = `message ${tipo}`;
  backupMessage.innerText = texto;
}

function hojeArquivo(){
  const agora = new Date();
  const ano = agora.getFullYear();
  const mes = String(agora.getMonth() + 1).padStart(2, '0');
  const dia = String(agora.getDate()).padStart(2, '0');
  const hora = String(agora.getHours()).padStart(2, '0');
  const minuto = String(agora.getMinutes()).padStart(2, '0');

  return `${ano}-${mes}-${dia}-${hora}${minuto}`;
}

async function buscarTabela(tabela){
  const { data, error } = await supabase
    .from(tabela)
    .select('*')
    .eq('user_id', user.id);

  if(error){
    return {
      tabela,
      data:[],
      error:error.message
    };
  }

  return {
    tabela,
    data:data || [],
    error:null
  };
}

function baixarArquivo(){
  if(!ultimoBackupJson || !ultimoBackupNome){
    mostrarMensagem('Gere o backup primeiro.', 'warning');
    return;
  }

  const blob = new Blob([ultimoBackupJson], { type:'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = url;
  link.download = ultimoBackupNome;
  link.style.display = 'none';

  document.body.appendChild(link);
  link.click();
  link.remove();

  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function compartilharTexto(){
  if(!ultimoBackupJson){
    mostrarMensagem('Gere o backup primeiro.', 'warning');
    return;
  }

  try{
    if(navigator.share){
      await navigator.share({
        title:'Backup FinZen',
        text:ultimoBackupJson
      });
      mostrarMensagem('Backup compartilhado. Salve o conteúdo em um local seguro.', 'success');
    }else{
      mostrarMensagem('Compartilhamento não disponível neste navegador. Use copiar JSON.', 'warning');
    }
  }catch(error){
    mostrarMensagem('Compartilhamento cancelado.', 'warning');
  }
}

async function copiarBackup(){
  if(!ultimoBackupJson){
    mostrarMensagem('Gere o backup primeiro.', 'warning');
    return;
  }

  try{
    await navigator.clipboard.writeText(ultimoBackupJson);
    mostrarMensagem('JSON copiado. Cole em Notas, Arquivos, Drive ou e-mail.', 'success');
  }catch(error){
    backupPreview.style.display = 'block';
    backupPreview.select();
    mostrarMensagem('Não consegui copiar automaticamente. Selecione o texto exibido e copie manualmente.', 'warning');
  }
}

async function gerarBackup(){
  mostrarMensagem('Gerando backup...');

  const resultados = await Promise.all(tabelas.map(buscarTabela));

  const backup = {
    app:'FinZen',
    version:'7.5.1.2',
    exported_at:new Date().toISOString(),
    user_id:user.id,
    tables:{},
    errors:[]
  };

  resultados.forEach(resultado => {
    backup.tables[resultado.tabela] = resultado.data;

    if(resultado.error){
      backup.errors.push({
        table:resultado.tabela,
        message:resultado.error
      });
    }
  });

  ultimoBackupNome = `finzen-backup-${hojeArquivo()}.json`;
  ultimoBackupJson = JSON.stringify(backup, null, 2);

  backupPreview.value = ultimoBackupJson;
  backupPreview.style.display = 'block';
  backupActions.style.display = 'flex';

  const blob = new Blob([ultimoBackupJson], { type:'application/json' });
  const file = new File([blob], ultimoBackupNome, { type:'application/json' });

  try{
    if(navigator.canShare && navigator.canShare({ files:[file] })){
      await navigator.share({
        title:'Backup FinZen',
        text:'Backup dos dados do FinZen',
        files:[file]
      });

      mostrarMensagem('Backup gerado. Escolha “Salvar em Arquivos” ou outro local seguro.', 'success');
      await carregarInfo();
      return;
    }
  }catch(error){
    mostrarMensagem('Compartilhamento cancelado. Use os botões abaixo: baixar, compartilhar texto ou copiar JSON.', 'warning');
    await carregarInfo();
    return;
  }

  mostrarMensagem('Backup gerado. Use os botões abaixo para baixar, compartilhar texto ou copiar JSON.', 'success');
  await carregarInfo();
}

async function carregarInfo(){
  backupInfo.innerHTML = '<p class="muted">Carregando estatísticas...</p>';

  const resultados = await Promise.all(
    tabelas.map(async tabela => {
      const { count, error } = await supabase
        .from(tabela)
        .select('*', { count:'exact', head:true })
        .eq('user_id', user.id);

      return {
        tabela,
        count:count || 0,
        error:error?.message || null
      };
    })
  );

  const total = resultados.reduce((soma, item) => soma + Number(item.count || 0), 0);

  backupInfo.innerHTML = `
    <div class="kpi-grid" style="margin-bottom:18px">
      <article class="kpi-card">
        <span>Total de registros</span>
        <strong>${total}</strong>
      </article>

      <article class="kpi-card">
        <span>Tabelas incluídas</span>
        <strong>${tabelas.length}</strong>
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
        ${resultados.map(item => `
          <tr>
            <td>${nomes[item.tabela] || item.tabela}</td>
            <td class="money">${item.count}</td>
            <td>
              <span class="badge ${item.error ? 'danger' : 'success'}">
                ${item.error ? 'erro' : 'ok'}
              </span>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

btnBackup.addEventListener('click', gerarBackup);
btnDownloadFallback.addEventListener('click', baixarArquivo);
btnShareText.addEventListener('click', compartilharTexto);
btnCopyBackup.addEventListener('click', copiarBackup);

carregarInfo();
