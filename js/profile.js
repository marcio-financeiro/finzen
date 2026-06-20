/**
 * profile.js
 * Perfil do usuário — FinZen
 * Gerencia nome, e-mail de notificação, regime offshore e senha
 */

import { supabase } from './supabaseClient.js';
import { navigate } from './router.js';
import { FINZEN_SECRET } from './apiClient.js';

// ── Auth ──────────────────────────────────────────────
const { data: sd } = await supabase.auth.getSession();
if (!sd.session) navigate('../login.html');
const user = sd.session.user;

const el  = id => document.getElementById(id);
const msg = (id, txt, tipo='success') => {
  el(id).className = `message ${tipo}`;
  el(id).textContent = txt;
  setTimeout(() => { el(id).textContent = ''; }, 3000);
};

// Preencher e-mail de login
el('pfEmailLogin').value = user.email || '';
el('userEmailSub').textContent = user.email || '';

el('btnVoltar').addEventListener('click', () => navigate('./dashboard.html'));
el('btnLogoutPerfil').addEventListener('click', async () => {
  await supabase.auth.signOut();
  navigate('../login.html');
});

// ── Carregar perfil salvo ─────────────────────────────
async function carregarPerfil() {
  const { data } = await supabase
    .from('user_settings')
    .select('setting_key,setting_value')
    .eq('user_id', user.id)
    .in('setting_key', ['perfil_nome','perfil_email_notif','perfil_regime','perfil_empresa']);

  const cfg = {};
  (data || []).forEach(r => { cfg[r.setting_key] = r.setting_value; });

  const nome = cfg['perfil_nome'] || '';
  el('pfNome').value      = nome;
  el('pfEmailNotif').value = cfg['perfil_email_notif'] || user.email || '';
  el('pfRegime').value    = cfg['perfil_regime']  || '14x21';
  el('pfEmpresa').value   = cfg['perfil_empresa'] || '';

  // Avatar e display
  const inicial = nome ? nome[0].toUpperCase() : user.email[0].toUpperCase();
  el('perfilAvatar').textContent    = inicial;
  el('perfilNomeDisplay').textContent = nome || user.email;
  el('perfilEmailDisplay').textContent = cfg['perfil_email_notif'] || user.email || '';
}

// ── Salvar perfil ─────────────────────────────────────
el('btnSalvarPerfil').addEventListener('click', async () => {
  const nome    = el('pfNome').value.trim();
  const emailN  = el('pfEmailNotif').value.trim();
  const regime  = el('pfRegime').value;
  const empresa = el('pfEmpresa').value.trim();

  if (!nome)   { msg('pfMsg', 'Informe seu nome.', 'warning'); return; }
  if (!emailN) { msg('pfMsg', 'Informe o e-mail para notificações.', 'warning'); return; }

  el('btnSalvarPerfil').textContent = 'Salvando...';

  const upserts = [
    { user_id: user.id, setting_key: 'perfil_nome',        setting_value: nome    },
    { user_id: user.id, setting_key: 'perfil_email_notif', setting_value: emailN  },
    { user_id: user.id, setting_key: 'perfil_regime',      setting_value: regime  },
    { user_id: user.id, setting_key: 'perfil_empresa',     setting_value: empresa },
  ];

  for (const u of upserts) {
    await supabase.from('user_settings').upsert(u, { onConflict: 'user_id,setting_key' });
  }

  // Atualizar display
  el('perfilAvatar').textContent     = nome[0].toUpperCase();
  el('perfilNomeDisplay').textContent = nome;
  el('perfilEmailDisplay').textContent = emailN;

  el('btnSalvarPerfil').textContent = '💾 Salvar perfil';
  msg('pfMsg', '✅ Perfil salvo com sucesso!', 'success');
});

// ── Alterar senha ─────────────────────────────────────
el('btnAlterarSenha').addEventListener('click', async () => {
  const senha     = el('pfSenha').value;
  const senhaConf = el('pfSenhaConf').value;

  if (!senha) { msg('pfSenhaMsg', 'Informe a nova senha.', 'warning'); return; }
  if (senha.length < 6) { msg('pfSenhaMsg', 'Senha deve ter no mínimo 6 caracteres.', 'warning'); return; }
  if (senha !== senhaConf) { msg('pfSenhaMsg', 'As senhas não conferem.', 'warning'); return; }

  el('btnAlterarSenha').textContent = 'Alterando...';
  const { error } = await supabase.auth.updateUser({ password: senha });

  el('btnAlterarSenha').textContent = '🔒 Alterar senha';
  if (error) {
    msg('pfSenhaMsg', 'Erro: ' + error.message, 'danger');
  } else {
    el('pfSenha').value = '';
    el('pfSenhaConf').value = '';
    msg('pfSenhaMsg', '✅ Senha alterada com sucesso!', 'success');
  }
});

// ── Telegram ─────────────────────────────────────────
async function verificarTelegram() {
  try {
    const r = await fetch(`/api/telegram-link?user_id=${user.id}`, {
      headers: { 'x-finzen-secret': FINZEN_SECRET },
    });
    const d = await r.json();
    const dot   = el('telegramDot');
    const label = el('telegramLabel');
    const info  = el('telegramInfo');
    const btnD  = el('btnDesvincular');

    if (d.vinculado) {
      dot.style.background   = 'var(--success, #10b981)';
      label.textContent      = 'Telegram vinculado';
      const quando = d.linked_at ? new Date(d.linked_at).toLocaleDateString('pt-BR') : '';
      info.textContent = `Chat ID: ${d.chat_id}${quando ? ' · Vinculado em ' + quando : ''}`;
      info.style.display = 'block';
      btnD.style.display = 'inline-flex';
    } else {
      dot.style.background = 'var(--muted)';
      label.textContent    = 'Telegram não vinculado';
      info.style.display   = 'none';
      btnD.style.display   = 'none';
    }
  } catch (_) {}
}

el('btnGerarCodigo').addEventListener('click', async () => {
  el('btnGerarCodigo').textContent = 'Gerando...';
  try {
    const r = await fetch('/api/telegram-link', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-finzen-secret': FINZEN_SECRET },
      body: JSON.stringify({ action: 'generate', user_id: user.id }),
    });
    const d = await r.json();
    if (d.code) {
      el('codigoValor').textContent = d.code;
      el('telegramCodigo').style.display = 'block';
      msg('telegramMsg', `Envie "${d.code}" para o bot no Telegram`, 'info');
    }
  } catch (e) {
    msg('telegramMsg', 'Erro: ' + e.message, 'danger');
  }
  el('btnGerarCodigo').textContent = '📲 Gerar código de vinculação';
});

el('btnDesvincular').addEventListener('click', async () => {
  if (!confirm('Desvincular seu Telegram desta conta?')) return;
  await fetch('/api/telegram-link', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-finzen-secret': FINZEN_SECRET },
    body: JSON.stringify({ action: 'unlink', user_id: user.id }),
  });
  el('telegramCodigo').style.display = 'none';
  msg('telegramMsg', 'Telegram desvinculado.', 'success');
  await verificarTelegram();
});

window.copiarCodigo = function() {
  const code = el('codigoValor').textContent;
  navigator.clipboard.writeText(code).then(() => {
    msg('telegramMsg', `Código ${code} copiado! Cole no Telegram.`, 'success');
  });
};

// ── Inicializar ───────────────────────────────────────
await carregarPerfil();

await verificarTelegram();

// ── Exportar função para uso em outros módulos ────────
export async function getPerfilEmail(supabaseClient, userId) {
  const { data } = await supabaseClient
    .from('user_settings')
    .select('setting_value')
    .eq('user_id', userId)
    .eq('setting_key', 'perfil_email_notif')
    .single();
  return data?.setting_value || null;
}
