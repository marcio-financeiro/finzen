/**
 * emailService.js
 * Envio de e-mails via EmailJS — FinZen
 *
 * API pública:
 *   emailService.init()
 *   emailService.enviarLembrete({ titulo, data, hora, tipo, descricao, email })
 *   emailService.agendarLembretes(userId, supabaseClient)
 */

const EMAILJS_PUBLIC_KEY  = 'xdlmVD8Ie6WJcIYz-';
const EMAILJS_SERVICE_ID  = 'service_2t1x059';
const EMAILJS_TEMPLATE_ID = 'urtiw8g';
const EMAIL_FALLBACK      = 'info.marcio@gmail.com'; // fallback se não tiver perfil

// Cache do e-mail do usuário por sessão
let _emailCache = null;

async function getEmailUsuario(sb, userId) {
  if (_emailCache) return _emailCache;
  try {
    const { data } = await sb
      .from('user_settings')
      .select('setting_value')
      .eq('user_id', userId)
      .eq('setting_key', 'perfil_email_notif')
      .single();
    _emailCache = data?.setting_value || EMAIL_FALLBACK;
  } catch(_) {
    _emailCache = EMAIL_FALLBACK;
  }
  return _emailCache;
}

export const emailService = (() => {

  let _iniciado = false;

  // ── Carregar SDK do EmailJS ────────────────────────────────────────────
  async function init() {
    if (_iniciado) return true;
    if (typeof emailjs !== 'undefined') {
      emailjs.init({ publicKey: EMAILJS_PUBLIC_KEY });
      _iniciado = true;
      return true;
    }
    return new Promise((resolve) => {
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/@emailjs/browser@4/dist/email.min.js';
      script.onload = () => {
        emailjs.init({ publicKey: EMAILJS_PUBLIC_KEY });
        _iniciado = true;
        resolve(true);
      };
      script.onerror = () => resolve(false);
      document.head.appendChild(script);
    });
  }

  // ── Formatar data para exibição ────────────────────────────────────────
  function fmtData(iso) {
    if (!iso) return '—';
    const [y, m, d] = iso.split('-');
    return `${d}/${m}/${y}`;
  }

  function fmtHora(hora) {
    if (!hora) return '—';
    return hora.slice(0, 5);
  }

  // ── Enviar um lembrete imediato ────────────────────────────────────────
  async function enviarLembrete({ titulo, data, hora, tipo, descricao, email }) {
    const ok = await init();
    if (!ok) { console.warn('[FinZen] EmailJS não carregado'); return false; }

    try {
      await emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, {
        titulo     : titulo      || 'Sem título',
        data       : fmtData(data),
        hora       : fmtHora(hora),
        tipo       : tipo        || 'Compromisso',
        descricao  : descricao   || '—',
        email      : email       || EMAIL_DESTINO,
        name       : 'FinZen',
      });
      console.log('[FinZen] E-mail enviado:', titulo);
      return true;
    } catch(e) {
      console.error('[FinZen] Erro ao enviar e-mail:', e);
      return false;
    }
  }

  // ── Verificar e enviar lembretes pendentes ─────────────────────────────
  // Chamado uma vez por dia ao abrir o app
  async function agendarLembretes(userId, sb) {
    const CACHE_KEY  = 'finzen_email_lembrete_dia';
    const hoje       = new Date().toISOString().split('T')[0];

    if (localStorage.getItem(CACHE_KEY) === hoje) return;

    // Buscar e-mail do perfil do usuário
    const emailUsuario = await getEmailUsuario(sb, userId);

    try {
      // Buscar eventos com notif_email=true e lembrete próximo
      const { data: eventos } = await sb
        .from('calendar_events')
        .select('id,titulo,tipo,data_inicio,hora,descricao,lembrete_dias,email_destino,status')
        .eq('user_id', userId)
        .eq('notif_email', true)
        .neq('status', 'cancelado')
        .gte('data_inicio', hoje);

      // Buscar certificações com notif_email=true e vencimento próximo
      const { data: certs } = await sb
        .from('certifications')
        .select('id,nome,data_vencimento,alerta_dias,notif_email,entidade')
        .eq('user_id', userId)
        .eq('notif_email', true)
        .gte('data_vencimento', hoje);

      const paraEnviar = [];
      const hojeDate   = new Date(hoje + 'T00:00:00');

      // Eventos
      (eventos || []).forEach(ev => {
        const dataEv   = new Date(ev.data_inicio + 'T00:00:00');
        const diasAte  = Math.round((dataEv - hojeDate) / 864e5);
        const lembrete = ev.lembrete_dias ?? 1;
        if (diasAte === lembrete || diasAte === 0) {
          paraEnviar.push({
            titulo    : ev.titulo,
            data      : ev.data_inicio,
            hora      : ev.hora,
            tipo      : ev.tipo,
            descricao : ev.descricao || (diasAte === 0 ? '⏰ Evento hoje!' : `Em ${diasAte} dia(s)`),
            email     : ev.email_destino || emailUsuario,
          });
        }
      });

      // Certificações
      (certs || []).forEach(cert => {
        const dataVenc = new Date(cert.data_vencimento + 'T00:00:00');
        const diasAte  = Math.round((dataVenc - hojeDate) / 864e5);
        const alertas  = [cert.alerta_dias || 90, 60, 30, 7, 0];
        if (alertas.includes(diasAte)) {
          paraEnviar.push({
            titulo    : `Certificação: ${cert.nome}`,
            data      : cert.data_vencimento,
            hora      : null,
            tipo      : 'Certificação',
            descricao : diasAte === 0
              ? `⚠️ Certificação ${cert.nome} vence HOJE! Emitida por: ${cert.entidade || '—'}`
              : `Certificação ${cert.nome} vence em ${diasAte} dia(s). Emitida por: ${cert.entidade || '—'}`,
            email     : emailUsuario,
          });
        }
      });

      // Enviar um por um com intervalo para não sobrecarregar a API
      for (const item of paraEnviar) {
        await enviarLembrete(item);
        await new Promise(r => setTimeout(r, 500));
      }

      localStorage.setItem(CACHE_KEY, hoje);
      if (paraEnviar.length > 0) {
        console.log(`[FinZen] ${paraEnviar.length} lembrete(s) enviado(s) por e-mail`);
      }

    } catch(e) {
      console.warn('[FinZen] Erro ao verificar lembretes:', e.message);
    }
  }

  return { init, enviarLembrete, agendarLembretes };

})();
