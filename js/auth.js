import { supabase } from './supabaseClient.js';
import { navigate } from './router.js';

const emailInput = document.getElementById('email');
const senhaInput = document.getElementById('senha');
const btnLogin = document.getElementById('btnLogin');
const btnCadastro = document.getElementById('btnCadastro');
const mensagem = document.getElementById('mensagem');

function showMessage(text, type = 'info'){
  mensagem.className = `message ${type}`;
  mensagem.innerText = text;
}

const { data: sessionData } = await supabase.auth.getSession();

if(sessionData.session){
  navigate('./pages/dashboard.html');
}

btnLogin.addEventListener('click', async () => {
  showMessage('Entrando...');

  const email = emailInput.value.trim();
  const password = senhaInput.value;

  if(!email || !password){
    showMessage('Preencha e-mail e senha.', 'warning');
    return;
  }

  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if(error){
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

  const { error } = await supabase.auth.signUp({ email, password });

  showMessage(
    error ? error.message : 'Cadastro realizado. Verifique seu e-mail, se necessário.',
    error ? 'danger' : 'success'
  );
});
