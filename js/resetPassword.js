import { supabase } from './supabaseClient.js';

const stepRequest      = document.getElementById('stepRequest');
const stepNewPassword  = document.getElementById('stepNewPassword');

const requestForm      = document.getElementById('requestForm');
const emailInput       = document.getElementById('email');
const btnEnviar        = document.getElementById('btnEnviar');
const mensagemRequest  = document.getElementById('mensagemRequest');

const newPasswordForm    = document.getElementById('newPasswordForm');
const novaSenhaInput     = document.getElementById('novaSenha');
const confirmarSenhaInput= document.getElementById('confirmarSenha');
const btnSalvarSenha     = document.getElementById('btnSalvarSenha');
const mensagemNewPassword= document.getElementById('mensagemNewPassword');
const btnToggle          = document.getElementById('btnTogglePassword');
const eyeIconPath        = document.getElementById('eyeIconPath');
const eyeIconPupil       = document.getElementById('eyeIconPupil');

function showMessage(el, text, type = 'info'){
  el.className = `message ${type}`;
  el.innerText = text;
}

// ── Etapa 1: pedir e-mail de recuperação ──
requestForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = emailInput.value.trim();
  if(!email){
    showMessage(mensagemRequest, 'Preencha seu e-mail.', 'warning');
    return;
  }

  btnEnviar.disabled = true;
  showMessage(mensagemRequest, 'Enviando...');

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin + '/reset-password.html'
  });

  btnEnviar.disabled = false;

  if(error){
    showMessage(mensagemRequest, error.message, 'danger');
    return;
  }

  showMessage(mensagemRequest, 'Se esse e-mail estiver cadastrado, você vai receber um link de recuperação.', 'success');
  requestForm.reset();
});

// ── Mostrar/ocultar senha (etapa 2) ──
const EYE_OPEN = 'M1 12S5 5 12 5s11 7 11 7-4 7-11 7S1 12 1 12z';
const EYE_OFF  = 'M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24';

btnToggle.addEventListener('click', () => {
  const showing = novaSenhaInput.type === 'text';
  novaSenhaInput.type = showing ? 'password' : 'text';
  eyeIconPath.setAttribute('d', showing ? EYE_OPEN : EYE_OFF);
  eyeIconPupil.style.display = showing ? '' : 'none';
  btnToggle.setAttribute('aria-pressed', String(!showing));
  btnToggle.setAttribute('aria-label', showing ? 'Mostrar senha' : 'Ocultar senha');
});

// ── Etapa 2: salvar nova senha ──
newPasswordForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  const novaSenha = novaSenhaInput.value;
  const confirmarSenha = confirmarSenhaInput.value;

  if(novaSenha.length < 6){
    showMessage(mensagemNewPassword, 'A senha precisa ter pelo menos 6 caracteres.', 'warning');
    return;
  }
  if(novaSenha !== confirmarSenha){
    showMessage(mensagemNewPassword, 'As senhas não coincidem.', 'warning');
    return;
  }

  btnSalvarSenha.disabled = true;
  showMessage(mensagemNewPassword, 'Salvando...');

  const { error } = await supabase.auth.updateUser({ password: novaSenha });

  btnSalvarSenha.disabled = false;

  if(error){
    showMessage(mensagemNewPassword, error.message, 'danger');
    return;
  }

  showMessage(mensagemNewPassword, 'Senha atualizada! Redirecionando...', 'success');
  newPasswordForm.reset();
  setTimeout(() => { window.location.href = './pages/dashboard.html'; }, 1500);
});

// ── Detectar link de recuperação vindo do e-mail (evento PASSWORD_RECOVERY) ──
supabase.auth.onAuthStateChange((event) => {
  if(event === 'PASSWORD_RECOVERY'){
    stepRequest.style.display = 'none';
    stepNewPassword.style.display = 'block';
  }
});
