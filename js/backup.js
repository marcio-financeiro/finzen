import { supabase } from './supabaseClient.js';
import { navigate } from './router.js';
import { APP_VERSION } from './config.js';

// ── Auth Supabase ─────────────────────────────────────
const { data: sessionData } = await supabase.auth.getSession();
if(!sessionData.session){ navigate('../login.html'); throw new Error('unauthenticated'); }
const user = sessionData.session.user;

// ── Google Drive OAuth ────────────────────────────────
const GOOGLE_CLIENT_ID = '549570181101-vne6d1fflafenipib75caddtc2f60cs2.apps.googleusercontent.com';
const GOOGLE_SCOPE     = 'https://www.googleapis.com/auth/drive.file';
const DRIVE_FOLDER     = 'FinZen Backups';

let googleToken = null; // access_token após login Google

// ── Tabelas ───────────────────────────────────────────
const TABELAS = [
  'accounts','categories','credit_cards','budgets','goals',
  'investments','allocation_targets','transactions',
  'card_transactions','investment_transactions',
  'account_transfers','patrimony_history','user_settings',
];

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

const el  = id => document.getElementById(id);
let ultimoBackupJson = '';
let ultimoBackupNome = '';

function msg(texto, tipo='info'){
  const e = el('backupMessage');
  e.className = `message ${tipo}`;
  e.innerText = texto;
}

function hojeArquivo(){
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}-${String(d.getHours()).padStart(2,'0')}${String(d.getMinutes()).padStart(2,'0')}`;
}

// ── Google Sign-In ────────────────────────────────────
function iniciarGoogleLogin(){
  return new Promise((resolve, reject) => {
    // Usar Google Identity Services (GIS) popup
    const client = google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: GOOGLE_SCOPE,
      callback: (response) => {
        if(response.error){ reject(new Error(response.error)); return; }
        googleToken = response.access_token;
        resolve(googleToken);
      },
    });
    client.requestAccessToken({ prompt: 'consent' });
  });
}

async function garantirTokenGoogle(){
  if(googleToken) return googleToken;
  return await iniciarGoogleLogin();
}

// ── Google Drive helpers ──────────────────────────────
async function driveRequest(url, options={}){
  const token = await garantirTokenGoogle();
  const resp = await fetch(url, {
    ...options,
    headers: {
      'Authorization': `Bearer ${token}`,
      ...(options.headers||{}),
    },
  });
  if(!resp.ok){
    const err = await resp.json().catch(()=>({error:{message:resp.statusText}}));
    throw new Error(err.error?.message || `Erro Drive: ${resp.status}`);
  }
  return resp.json();
}

async function encontrarOuCriarPasta(){
  // Procurar pasta FinZen Backups
  const busca = await driveRequest(
    `https://www.googleapis.com/drive/v3/files?q=name='${DRIVE_FOLDER}' and mimeType='application/vnd.google-apps.folder' and trashed=false&fields=files(id,name)`
  );
  if(busca.files?.length){ return busca.files[0].id; }

  // Criar pasta
  const pasta = await driveRequest('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: DRIVE_FOLDER, mimeType: 'application/vnd.google-apps.folder' }),
  });
  return pasta.id;
}

async function salvarNoDrive(json, nomeArquivo){
  msg('Conectando ao Google Drive...', 'info');
  const pastaId = await encontrarOuCriarPasta();

  // Verificar se já existe arquivo com mesmo nome (para atualizar)
  const busca = await driveRequest(
    `https://www.googleapis.com/drive/v3/files?q=name='${nomeArquivo}' and '${pastaId}' in parents and trashed=false&fields=files(id)`
  );

  const blob = new Blob([json], { type:'application/json' });
  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify({
    name: nomeArquivo,
    parents: busca.files?.length ? undefined : [pastaId],
    mimeType: 'application/json',
  })], { type:'application/json' }));
  form.append('file', blob);

  const token = await garantirTokenGoogle();
  let url = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';
  let method = 'POST';

  if(busca.files?.length){
    // Atualizar arquivo existente
    url = `https://www.googleapis.com/upload/drive/v3/files/${busca.files[0].id}?uploadType=multipart`;
    method = 'PATCH';
  }

  const resp = await fetch(url, {
    method,
    headers: { 'Authorization': `Bearer ${token}` },
    body: form,
  });

  if(!resp.ok){
    const err = await resp.json().catch(()=>({error:{message:resp.statusText}}));
    throw new Error(err.error?.message || 'Erro ao salvar no Drive');
  }

  return await resp.json();
}

// ── Gerar dados de backup ─────────────────────────────
async function coletarDados(){
  const resultados = await Promise.all(
    TABELAS.map(async tabela => {
      const { data, error } = await supabase.from(tabela).select('*').eq('user_id', user.id);
      return { tabela, data: data||[], error: error?.message||null };
    })
  );

  const backup = {
    app: 'FinZen',
    version: APP_VERSION,
    exported_at: new Date().toISOString(),
    user_id: user.id,
    tables: {},
    errors: [],
  };

  let totalRegistros = 0;
  resultados.forEach(r => {
    backup.tables[r.tabela] = r.data;
    totalRegistros += r.data.length;
    if(r.error) backup.errors.push({ table: r.tabela, message: r.error });
  });

  ultimoBackupNome = `finzen-backup-${hojeArquivo()}.json`;
  ultimoBackupJson = JSON.stringify(backup, null, 2);

  return { resultados, totalRegistros };
}

// ── Ação: Download local ──────────────────────────────
async function backupLocal(){
  el('btnBackupLocal').disabled = true;
  el('btnBackupLocal').innerText = '⏳ Gerando...';
  msg('Coletando dados...');

  try{
    const { resultados, totalRegistros } = await coletarDados();

    const blob = new Blob([ultimoBackupJson], { type:'application/json;charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = ultimoBackupNome;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);

    localStorage.setItem('finzen_ultimo_backup', new Date().toISOString());
    el('backupActions').style.display = 'flex';
    el('backupStats').innerHTML = renderStats(resultados, totalRegistros);
    msg(`Download iniciado — ${totalRegistros} registros em ${TABELAS.length} tabelas.`, 'success');
    atualizarInfoUltimoBackup();
  }catch(e){
    msg('Erro: ' + e.message, 'danger');
  }finally{
    el('btnBackupLocal').disabled = false;
    el('btnBackupLocal').innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;margin-right:5px"><path d="M12 3v11"/><polyline points="8,10 12,14 16,10"/><path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/></svg>Baixar JSON';
  }
}

// ── Ação: Salvar no Google Drive ──────────────────────
async function backupDrive(){
  el('btnBackupDrive').disabled = true;
  el('btnBackupDrive').innerText = 'Salvando...';
  msg('');

  try{
    // Se ainda não coletou dados nesta sessão, coletar
    if(!ultimoBackupJson){
      msg('Coletando dados...');
      await coletarDados();
    }

    msg('Autenticando com Google...', 'info');
    const arquivo = await salvarNoDrive(ultimoBackupJson, ultimoBackupNome);

    localStorage.setItem('finzen_ultimo_backup', new Date().toISOString());
    localStorage.setItem('finzen_ultimo_backup_drive', ultimoBackupNome);
    el('backupStats').innerHTML = renderStats(
      TABELAS.map(t=>({ tabela:t, data: JSON.parse(ultimoBackupJson).tables[t]||[], error:null })),
      JSON.parse(ultimoBackupJson) && Object.values(JSON.parse(ultimoBackupJson).tables).reduce((s,a)=>s+a.length,0)
    );
    msg(`Backup salvo no Google Drive → pasta "${DRIVE_FOLDER}" → ${ultimoBackupNome}`, 'success');
    atualizarInfoUltimoBackup();
    el('driveStatus').innerHTML = `Último backup no Drive: <strong>${ultimoBackupNome}</strong>`;
    el('driveStatus').style.color = 'var(--success)';
  }catch(e){
    msg('Erro ao salvar no Drive: ' + e.message, 'danger');
  }finally{
    el('btnBackupDrive').disabled = false;
    el('btnBackupDrive').innerHTML = `<svg style="width:16px;height:16px;vertical-align:middle;margin-right:6px" viewBox="0 0 48 48">
            <path fill="#4285F4" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
            <path fill="#34A853" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
            <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
            <path fill="#EA4335" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.31-8.16 2.31-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
          </svg>
          Salvar no Drive`;
  }
}

// ── Ações alternativas ────────────────────────────────
async function compartilharTexto(){
  if(!ultimoBackupJson){ msg('Gere o backup primeiro.', 'warning'); return; }
  if(navigator.share){
    try{ await navigator.share({ title:'Backup FinZen', text:ultimoBackupJson }); }
    catch(_){ msg('Compartilhamento cancelado.', 'warning'); }
  } else { msg('Compartilhamento não disponível. Use Copiar JSON.', 'warning'); }
}

async function copiarBackup(){
  if(!ultimoBackupJson){ msg('Gere o backup primeiro.', 'warning'); return; }
  try{
    await navigator.clipboard.writeText(ultimoBackupJson);
    msg('JSON copiado para a área de transferência.', 'success');
  }catch(_){
    const ta = el('backupPreview');
    ta.value = ultimoBackupJson;
    ta.style.display = 'block';
    ta.select();
    msg('Selecione o texto abaixo e copie manualmente.', 'warning');
  }
}

function renderStats(resultados, total){
  return `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px;">
      <div class="kpi-card"><span>Total de registros</span><strong>${total}</strong></div>
      <div class="kpi-card"><span>Versão</span><strong>v${APP_VERSION}</strong></div>
    </div>
    <table class="data-table">
      <thead><tr><th>Tabela</th><th>Registros</th><th>Status</th></tr></thead>
      <tbody>
        ${resultados.map(r=>`
          <tr>
            <td>${NOMES[r.tabela]||r.tabela}</td>
            <td class="money">${r.data.length}</td>
            <td><span class="badge ${r.error?'danger':'success'}">${r.error?'erro':'ok'}</span></td>
          </tr>
        `).join('')}
      </tbody>
    </table>`;
}

function atualizarInfoUltimoBackup(){
  const ultimo = localStorage.getItem('finzen_ultimo_backup');
  const drive  = localStorage.getItem('finzen_ultimo_backup_drive');
  const e = el('ultimoBackupInfo');
  if(ultimo){
    const d = new Date(ultimo);
    e.innerText = `Último backup: ${d.toLocaleDateString('pt-BR')} às ${d.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}`;
  } else {
    e.innerText = 'Nenhum backup realizado neste dispositivo ainda.';
  }
  if(drive && el('driveStatus')){
    el('driveStatus').innerHTML = `Último no Drive: <strong>${drive}</strong>`;
  }
}

// ── Carregar contagem inicial ─────────────────────────
async function carregarInfo(){
  const resultados = await Promise.all(
    TABELAS.map(async tabela => {
      const { count } = await supabase.from(tabela).select('*',{count:'exact',head:true}).eq('user_id',user.id);
      return { tabela, data: Array(count||0).fill({}), error: null };
    })
  );
  const total = resultados.reduce((s,r)=>s+r.data.length,0);
  el('backupStats').innerHTML = renderStats(resultados, total);
  atualizarInfoUltimoBackup();
}

// ── Eventos ───────────────────────────────────────────
el('btnBackupLocal').addEventListener('click', backupLocal);
el('btnBackupDrive').addEventListener('click', backupDrive);
el('btnShareText').addEventListener('click', compartilharTexto);
el('btnCopyBackup').addEventListener('click', copiarBackup);

carregarInfo();
