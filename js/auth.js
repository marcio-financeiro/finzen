import { supabase } from './supabaseClient.js';
import { navigate } from './router.js';

const loginForm  = document.getElementById('loginForm');
const emailInput = document.getElementById('email');
const senhaInput  = document.getElementById('senha');
const btnLogin    = document.getElementById('btnLogin');
const btnCadastro = document.getElementById('btnCadastro');
const btnToggle   = document.getElementById('btnTogglePassword');
const eyeIconPath = document.getElementById('eyeIconPath');
const eyeIconPupil = document.getElementById('eyeIconPupil');
const mensagem    = document.getElementById('mensagem');

function showMessage(text, type = 'info'){
  mensagem.className = `message ${type}`;
  mensagem.innerText = text;
}

const { data: sessionData } = await supabase.auth.getSession();

if(sessionData.session){
  navigate('./pages/dashboard.html');
}

// ── Mostrar/ocultar senha ──
const EYE_OPEN = 'M1 12S5 5 12 5s11 7 11 7-4 7-11 7S1 12 1 12z';
const EYE_OFF  = 'M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24';

btnToggle.addEventListener('click', () => {
  const showing = senhaInput.type === 'text';
  senhaInput.type = showing ? 'password' : 'text';
  eyeIconPath.setAttribute('d', showing ? EYE_OPEN : EYE_OFF);
  eyeIconPupil.style.display = showing ? '' : 'none';
  btnToggle.setAttribute('aria-pressed', String(!showing));
  btnToggle.setAttribute('aria-label', showing ? 'Mostrar senha' : 'Ocultar senha');
});

// ── Entrar (Enter no formulário também funciona) ──
loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  const email = emailInput.value.trim();
  const password = senhaInput.value;

  if(!email || !password){
    showMessage('Preencha e-mail e senha.', 'warning');
    return;
  }

  btnLogin.disabled = true;
  showMessage('Entrando...');

  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if(error){
    btnLogin.disabled = false;
    showMessage(error.message, 'danger');
    return;
  }

  navigate('./pages/dashboard.html');
});

btnCadastro.addEventListener('click', async () => {
  showMessage('Cadastrando...');

  const email = emailInput.value.trim();
  const password = senhaInput.value;

  if(!email || !password){
    showMessage('Preencha e-mail e senha.', 'warning');
    return;
  }

  btnCadastro.disabled = true;
  const { data, error } = await supabase.auth.signUp({ email, password });
  btnCadastro.disabled = false;

  if(error){
    showMessage(error.message, 'danger');
    return;
  }

  if(data.session){
    // Confirmação de e-mail desativada: já entra logado, segue pro onboarding
    navigate('./pages/onboarding.html');
    return;
  }

  showMessage('Cadastro realizado. Verifique seu e-mail para confirmar a conta.', 'success');
});
