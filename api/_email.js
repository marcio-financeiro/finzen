// api/_email.js — envio de e-mail server-side via REST API do EmailJS.
// Arquivos com _ no início não viram endpoint na Vercel.
//
// js/emailService.js (client-side) usa o SDK @emailjs/browser, que depende
// de DOM/window — não funciona em serverless Node. Esta função replica o
// mesmo template/serviço via fetch cru contra a REST API do EmailJS, usando
// a Private Key (accessToken) em vez do fluxo de domínio autorizado do SDK
// browser. Exige EMAILJS_PRIVATE_KEY configurada nas env vars da Vercel e
// "Allow non-browser applications" habilitado no dashboard do EmailJS —
// sem isso, retorna {ok:false} e loga o motivo, sem lançar exceção (não
// deve derrubar o cron inteiro por causa de e-mail).

const EMAILJS_PUBLIC_KEY  = 'xdlmVD8Ie6WJcIYz-';
const EMAILJS_SERVICE_ID  = 'service_2t1x059';
const EMAILJS_TEMPLATE_ID = 'template_fpews0d';

export async function enviarEmail({ destinatario, titulo, data, hora, tipo, descricao }) {
  const privateKey = process.env.EMAILJS_PRIVATE_KEY;
  if (!privateKey) {
    console.error('[_email] EMAILJS_PRIVATE_KEY não configurada — e-mail não enviado');
    return { ok: false, erro: 'EMAILJS_PRIVATE_KEY ausente' };
  }
  if (!destinatario) {
    return { ok: false, erro: 'destinatário ausente' };
  }

  const body = {
    service_id: EMAILJS_SERVICE_ID,
    template_id: EMAILJS_TEMPLATE_ID,
    user_id: EMAILJS_PUBLIC_KEY,
    accessToken: privateKey,
    template_params: {
      titulo: titulo || 'Sem título',
      data: data || '',
      hora: hora || '',
      tipo: tipo || 'Resumo',
      descricao: descricao || '—',
      email: destinatario,
      email_destino: destinatario,
      name: 'FinZen',
    },
  };

  try {
    const r = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const texto = await r.text();
    if (!r.ok) {
      console.error('[_email] EmailJS falhou:', r.status, texto);
      return { ok: false, erro: `${r.status}: ${texto}` };
    }
    return { ok: true };
  } catch (e) {
    console.error('[_email] Erro de rede ao chamar EmailJS:', e.message);
    return { ok: false, erro: e.message };
  }
}
