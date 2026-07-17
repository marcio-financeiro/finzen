import { supabase } from './supabaseClient.js';
import { navigate } from './router.js';
import { escapeHtml } from './utils/escapeHtml.js';

// ── Auth ──────────────────────────────────────────────
const { data: sessionData } = await supabase.auth.getSession();
if(!sessionData.session){ navigate('../login.html'); throw new Error('unauthenticated'); }
const user = sessionData.session.user;

const TABELAS_INSERT = [
  'accounts','categories','credit_cards','budgets','goals',
  'investments','allocation_targets','transactions',
  'card_transactions','investment_transactions',
  'account_transfers','patrimony_history','user_settings',
];
const TABELAS_DELETE = [...TABELAS_INSERT].reverse();

const NOMES = {
  accounts:'Contas', categories:'Categorias', transactions:'Lançamentos',
  credit_cards:'Cartões', card_transactions:'Compras/Faturas',
  budgets:'Orçamentos', goals:'Metas', investments:'Investimentos',
  investment_transactions:'Movimentações/Proventos',
  allocation_targets:'Alocação alvo',
  account_transfers:'Transferências entre contas',
  patrimony_history:'Histórico patrimonial',
  user_settings:'Configurações',
};

const el = id => document.getElementById(id);
let parsedBackup = null;

function msgValidar(texto, tipo='info'){
  const e = el('validateMessage');
  e.className = `message ${tipo}`;
  e.innerText = texto;
}

function msgRestore(texto, tipo='info'){
  const e = el('restoreMessage');
  e.className = `message ${tipo}`;
  e.innerText = texto;
}

function setProgress(pct, label){
  el('progressBar').style.width = pct + '%';
  el('progressLabel').innerText = label;
  el('progressWrap').style.display = 'block';
}

function normalizarBackup(raw){
  if(!raw || typeof raw !== 'object') throw new Error('Arquivo inválido.');
  if(raw.tables && typeof raw.tables === 'object') return raw;
  // Compatibilidade com backups antigos (tabelas na raiz)
  const tables = {};
  TABELAS_INSERT.forEach(t => { if(Array.isArray(raw[t])) tables[t] = raw[t]; });
  return { app:'FinZen', version:'legado', exported_at:null, user_id:null, tables, errors:[] };
}

async function lerArquivo(file){
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(new Error('Erro ao ler arquivo.'));
    r.readAsText(file);
  });
}

async function obterTexto(){
  const file = el('backupFile').files?.[0];
  if(file) return await lerArquivo(file);
  const texto = el('backupText').value.trim();
  if(texto) return texto;
  throw new Error('Selecione um arquivo JSON ou cole o conteúdo do backup.');
}

function renderResumo(backup){
  const tabelas = TABELAS_INSERT.filter(t => Array.isArray(backup.tables[t]) && backup.tables[t].length > 0);
  const total   = tabelas.reduce((s,t) => s + backup.tables[t].length, 0);
  const exportedAt = backup.exported_at
    ? new Date(backup.exported_at).toLocaleString('pt-BR')
    : 'Data desconhecida';

  el('backupSummary').innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:16px;">
      <div class="kpi-card"><span>Registros</span><strong>${total}</strong></div>
      <div class="kpi-card"><span>Versão</span><strong>${escapeHtml(backup.version||'-')}</strong></div>
      <div class="kpi-card"><span>Exportado em</span><strong style="font-size:11px">${exportedAt}</strong></div>
    </div>
    <table class="data-table">
      <thead><tr><th>Tabela</th><th>Registros</th></tr></thead>
      <tbody>
        ${tabelas.map(t=>`
          <tr>
            <td>${NOMES[t]||t}</td>
            <td class="money">${backup.tables[t].length}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

async function validarBackup(){
  try{
    msgValidar('Validando...');
    el('backupSummary').innerHTML = '';
    el('restoreSection').style.display = 'none';

    const texto  = await obterTexto();
    const raw    = JSON.parse(texto);
    const backup = normalizarBackup(raw);

    const tabelas = TABELAS_INSERT.filter(t => Array.isArray(backup.tables[t]));
    if(!tabelas.length) throw new Error('Nenhuma tabela válida encontrada.');

    parsedBackup = backup;
    renderResumo(backup);
    el('restoreSection').style.display = 'block';
    msgValidar('Backup válido. Escolha o modo de restauração abaixo.', 'success');
  }catch(e){
    parsedBackup = null;
    el('backupSummary').innerHTML = '<p class="muted">Nenhum backup válido carregado.</p>';
    msgValidar('Erro: ' + e.message, 'danger');
  }
}

async function restaurarBackup(){
  if(!parsedBackup){ msgRestore('Valide um backup antes de restaurar.', 'warning'); return; }

  const modo = el('restoreMode').value;
  if(modo === 'replace'){
    const confirmacao = el('replaceConfirm').value.trim();
    if(confirmacao !== 'RESTAURAR'){
      msgRestore('Digite RESTAURAR no campo de confirmação para continuar.', 'warning');
      return;
    }
  }

  el('btnRestore').disabled = true;
  el('progressWrap').style.display = 'block';
  msgRestore('');

  try{
    const tabelasNoBackup = TABELAS_INSERT.filter(t => Array.isArray(parsedBackup.tables[t]));
    let passo = 0;
    const totalPassos = (modo === 'replace' ? TABELAS_DELETE.length : 0) + tabelasNoBackup.length;

    if(modo === 'replace'){
      for(const tabela of TABELAS_DELETE){
        passo++;
        setProgress(Math.round(passo/totalPassos*100), `Apagando ${NOMES[tabela]||tabela}...`);
        const { error } = await supabase.from(tabela).delete().eq('user_id', user.id);
        if(error) throw new Error(`Erro ao apagar ${tabela}: ${error.message}`);
      }
    }

    for(const tabela of tabelasNoBackup){
      passo++;
      const registros = (parsedBackup.tables[tabela]||[]).map(r => ({ ...r, user_id: user.id }));
      if(!registros.length) continue;

      setProgress(Math.round(passo/totalPassos*100), `Restaurando ${NOMES[tabela]||tabela} (${registros.length} registros)...`);

      // Inserir em lotes de 100
      for(let i = 0; i < registros.length; i += 100){
        const lote = registros.slice(i, i+100);
        const { error } = await supabase.from(tabela).upsert(lote, { onConflict:'id' });
        if(error) throw new Error(`Erro ao restaurar ${tabela}: ${error.message}`);
      }
    }

    setProgress(100, 'Concluído!');
    msgRestore(`Backup restaurado com sucesso no modo "${modo === 'replace' ? 'Substituir tudo' : 'Mesclar'}"!`, 'success');

  }catch(e){
    msgRestore('Erro durante a restauração: ' + e.message, 'danger');
  }finally{
    el('btnRestore').disabled = false;
  }
}

// Mostrar/ocultar confirmação de substituição
el('restoreMode').addEventListener('change', () => {
  el('replaceConfirmBox').style.display = el('restoreMode').value === 'replace' ? 'block' : 'none';
});

el('btnValidate').addEventListener('click', validarBackup);
el('btnRestore').addEventListener('click', restaurarBackup);

// Auto-validar ao selecionar arquivo
el('backupFile').addEventListener('change', () => {
  if(el('backupFile').files?.[0]) validarBackup();
});
