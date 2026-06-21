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

// ── Redimensionar imagem para base64 (max 120px) ─────
async function resizeImagem(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = e => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        const max    = 120;
        const scale  = Math.min(max / img.width, max / img.height, 1);
        const canvas = document.createElement('canvas');
        canvas.width  = Math.round(img.width  * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

// ── Exibir avatar no card do perfil ─────────────────
function exibirAvatar(dataUrl) {
  const imgEl    = el('perfilAvatarImg');
  const inicialEl = el('perfilAvatarInicial');
  if (dataUrl && imgEl) {
    imgEl.src          = dataUrl;
    imgEl.style.display = 'block';
    if (inicialEl) inicialEl.style.display = 'none';
  } else if (inicialEl) {
    inicialEl.style.display = 'flex';
    if (imgEl) imgEl.style.display = 'none';
  }
}

let avatarDataUrl = ''; // avatar atual (data URL ou '')

// ── Carregar perfil salvo ─────────────────────────────
async function carregarPerfil() {
  const { data } = await supabase
    .from('user_settings')
    .select('setting_key,setting_value')
    .eq('user_id', user.id)
    .in('setting_key', ['perfil_nome','perfil_email_notif','perfil_regime','perfil_empresa','perfil_avatar_url']);

  const cfg = {};
  (data || []).forEach(r => { cfg[r.setting_key] = r.setting_value; });

  const nome = cfg['perfil_nome'] || '';
  el('pfNome').value       = nome;
  el('pfEmailNotif').value = cfg['perfil_email_notif'] || user.email || '';
  el('pfRegime').value     = cfg['perfil_regime']  || '14x21';
  el('pfEmpresa').value    = cfg['perfil_empresa'] || '';

  avatarDataUrl = cfg['perfil_avatar_url'] || '';

  // Exibir avatar ou inicial
  const inicial = nome ? nome[0].toUpperCase() : user.email[0].toUpperCase();
  if (el('perfilAvatarInicial')) el('perfilAvatarInicial').textContent = inicial;
  exibirAvatar(avatarDataUrl);

  el('perfilNomeDisplay').textContent  = nome || user.email;
  el('perfilEmailDisplay').textContent = cfg['perfil_email_notif'] || user.email || '';
}

// ── Upload de foto ────────────────────────────────────
el('pfAvatarInput').addEventListener('change', async e => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    avatarDataUrl = await resizeImagem(file);
    exibirAvatar(avatarDataUrl);
    msg('pfMsg', 'Foto carregada — clique em Salvar perfil para confirmar.', 'info');
  } catch(_) {
    msg('pfMsg', 'Erro ao carregar imagem.', 'danger');
  }
  e.target.value = ''; // permitir selecionar o mesmo arquivo novamente
});

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
    { user_id: user.id, setting_key: 'perfil_nome',        setting_value: nome         },
    { user_id: user.id, setting_key: 'perfil_email_notif', setting_value: emailN       },
    { user_id: user.id, setting_key: 'perfil_regime',      setting_value: regime       },
    { user_id: user.id, setting_key: 'perfil_empresa',     setting_value: empresa      },
    { user_id: user.id, setting_key: 'perfil_avatar_url',  setting_value: avatarDataUrl },
  ];

  for (const u of upserts) {
    const { error } = await supabase
      .from('user_settings')
      .upsert(u, { onConflict: 'user_id,setting_key' });
    if (error) {
      el('btnSalvarPerfil').textContent = '💾 Salvar perfil';
      msg('pfMsg', `Erro ao salvar ${u.setting_key}: ${error.message}`, 'danger');
      return;
    }
  }

  // Invalidar cache para que sidebar recarregue o nome correto
  try { sessionStorage.removeItem('finzen_profile_cache'); } catch(_) {}

  // Atualizar display
  if (el('perfilAvatarInicial')) el('perfilAvatarInicial').textContent = nome[0].toUpperCase();
  exibirAvatar(avatarDataUrl);
  el('perfilNomeDisplay').textContent  = nome;
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
