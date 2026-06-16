/**
 * calendar.js
 * Calendário pessoal — FinZen
 * Visões: Mensal / Semanal / Lista
 * CRUD de eventos + lembretes por e-mail + exportação .ics
 */

import { supabase }     from './supabaseClient.js';
import { navigate }     from './router.js';
import { formatCurrency } from './utils.js';
import { emailService } from './emailService.js';

// ── Auth ──────────────────────────────────────────────
const { data: sd } = await supabase.auth.getSession();
if (!sd.session) navigate('../login.html');
const user = sd.session.user;
document.getElementById('userEmail').innerText = user.email;
document.getElementById('btnLogout').addEventListener('click', async () => {
  await supabase.auth.signOut(); navigate('../login.html');
});

// ── Estado ────────────────────────────────────────────
const el    = id => document.getElementById(id);
let hoje    = new Date();
let refData = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
let viewAtual   = 'mensal';
let eventos     = [];
let editandoId  = null;

// ── Cores e ícones por tipo ───────────────────────────
const TIPO_CONFIG = {
  financeiro  : { icon:'💰', cor:'#4b84f3', label:'Financeiro'  },
  tarefa      : { icon:'📋', cor:'#1ec86a', label:'Tarefa'      },
  saude       : { icon:'🏥', cor:'#f04e4e', label:'Saúde'       },
  offshore    : { icon:'⚓', cor:'#f5a623', label:'Offshore'    },
  manutencao  : { icon:'🔧', cor:'#6ab04c', label:'Manutenção'  },
  documento   : { icon:'📄', cor:'#7b5ce5', label:'Documento'   },
  compromisso : { icon:'🎯', cor:'#22d3ee', label:'Compromisso' },
};

function tipoCfg(tipo) {
  return TIPO_CONFIG[tipo] || { icon:'📌', cor:'#6b7094', label: tipo };
}

// ── Utilitários de data ───────────────────────────────
function toISO(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function parseISO(iso) {
  const [y,m,d] = iso.split('-').map(Number);
  return new Date(y, m-1, d);
}
function hojeISO() { return toISO(hoje); }

function fmtData(iso) {
  if (!iso) return '';
  const [y,m,d] = iso.split('-');
  return `${d}/${m}/${y}`;
}
function fmtHora(h) { return h ? h.slice(0,5) : ''; }

// Dias da semana
const DIAS_SEMANA = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
               'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

// ── Carregar eventos do Supabase ──────────────────────
async function carregarEventos(dataInicio, dataFim) {
  const { data, error } = await supabase
    .from('calendar_events')
    .select('*')
    .eq('user_id', user.id)
    .gte('data_inicio', dataInicio)
    .lte('data_inicio', dataFim)
    .order('data_inicio', { ascending: true })
    .order('hora',        { ascending: true });

  if (error) console.error('[FinZen] Erro ao carregar eventos:', error);
  eventos = data || [];
}

// ── Navegação ─────────────────────────────────────────
el('btnAnterior').addEventListener('click', () => { navegar(-1); });
el('btnProximo' ).addEventListener('click', () => { navegar(+1); });
el('btnHoje'    ).addEventListener('click', () => {
  refData = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
  renderizar();
});

function navegar(dir) {
  if (viewAtual === 'semanal') {
    refData = new Date(refData.getFullYear(), refData.getMonth(), refData.getDate() + dir * 7);
  } else {
    refData = new Date(refData.getFullYear(), refData.getMonth() + dir, 1);
  }
  renderizar();
}

// ── Toggle de visão ───────────────────────────────────
document.querySelectorAll('.cal-view-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.cal-view-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    viewAtual = btn.dataset.view;
    renderizar();
  });
});

// ── Renderizar visão atual ────────────────────────────
async function renderizar() {
  const body = el('calBody');
  body.innerHTML = '<p class="muted" style="padding:24px">Carregando...</p>';

  let inicio, fim;

  if (viewAtual === 'mensal') {
    inicio = toISO(new Date(refData.getFullYear(), refData.getMonth(), 1));
    fim    = toISO(new Date(refData.getFullYear(), refData.getMonth()+1, 0));
    el('calLabel').textContent = `${MESES[refData.getMonth()]} ${refData.getFullYear()}`;
  } else if (viewAtual === 'semanal') {
    const dom = new Date(refData);
    dom.setDate(dom.getDate() - dom.getDay());
    const sab = new Date(dom); sab.setDate(sab.getDate() + 6);
    inicio = toISO(dom); fim = toISO(sab);
    el('calLabel').textContent = `${fmtData(inicio)} — ${fmtData(fim)}`;
  } else {
    inicio = toISO(new Date(refData.getFullYear(), refData.getMonth(), 1));
    fim    = toISO(new Date(refData.getFullYear(), refData.getMonth()+2, 0));
    el('calLabel').textContent = `${MESES[refData.getMonth()]} ${refData.getFullYear()}`;
  }

  await carregarEventos(inicio, fim);

  if      (viewAtual === 'mensal' ) renderMensal();
  else if (viewAtual === 'semanal') renderSemanal();
  else                              renderLista();
}

// ── Visão MENSAL ──────────────────────────────────────
function renderMensal() {
  const ano = refData.getFullYear();
  const mes = refData.getMonth();
  const primeiroDia = new Date(ano, mes, 1).getDay();
  const totalDias   = new Date(ano, mes+1, 0).getDate();
  const totalDiasAnterior = new Date(ano, mes, 0).getDate();

  // Indexar eventos por data
  const evPorDia = {};
  eventos.forEach(ev => {
    const d = ev.data_inicio;
    if (!evPorDia[d]) evPorDia[d] = [];
    evPorDia[d].push(ev);
  });

  let html = `
    <div class="cal-grid-header">
      ${DIAS_SEMANA.map(d => `<span>${d}</span>`).join('')}
    </div>
    <div class="cal-grid">
  `;

  // Dias do mês anterior
  for (let i = primeiroDia - 1; i >= 0; i--) {
    const dia = totalDiasAnterior - i;
    html += `<div class="cal-cell outro-mes"><div class="cal-dia-num">${dia}</div></div>`;
  }

  // Dias do mês atual
  for (let dia = 1; dia <= totalDias; dia++) {
    const iso    = toISO(new Date(ano, mes, dia));
    const isHoje = iso === hojeISO();
    const evs    = evPorDia[iso] || [];

    html += `<div class="cal-cell${isHoje?' hoje':''}" data-data="${iso}">
      <div class="cal-dia-num">${dia}</div>`;

    evs.slice(0, 3).forEach(ev => {
      const cfg = tipoCfg(ev.tipo);
      html += `<div class="cal-evento-pill" data-id="${ev.id}"
        style="background:${cfg.cor}22;color:${cfg.cor};"
        title="${ev.titulo}">
        ${cfg.icon} ${ev.titulo}
      </div>`;
    });

    if (evs.length > 3) {
      html += `<div class="cal-mais">+${evs.length - 3} mais</div>`;
    }

    html += `</div>`;
  }

  // Dias do próximo mês
  const totalCelulas = primeiroDia + totalDias;
  const resto = totalCelulas % 7 === 0 ? 0 : 7 - (totalCelulas % 7);
  for (let i = 1; i <= resto; i++) {
    html += `<div class="cal-cell outro-mes"><div class="cal-dia-num">${i}</div></div>`;
  }

  html += '</div>';
  el('calBody').innerHTML = html;

  // Listeners — clicar em célula abre novo evento
  el('calBody').querySelectorAll('.cal-cell[data-data]').forEach(cell => {
    cell.addEventListener('click', (e) => {
      if (e.target.closest('[data-id]')) return; // clicou em evento
      abrirModalNovo(cell.dataset.data);
    });
  });

  // Clicar em evento existente
  el('calBody').querySelectorAll('[data-id]').forEach(pill => {
    pill.addEventListener('click', (e) => {
      e.stopPropagation();
      const ev = eventos.find(x => x.id === pill.dataset.id);
      if (ev) abrirModalEditar(ev);
    });
  });
}

// ── Visão SEMANAL ─────────────────────────────────────
function renderSemanal() {
  const dom = new Date(refData);
  dom.setDate(dom.getDate() - dom.getDay());

  const dias = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(dom); d.setDate(d.getDate() + i);
    dias.push(d);
  }

  const evPorDia = {};
  eventos.forEach(ev => {
    if (!evPorDia[ev.data_inicio]) evPorDia[ev.data_inicio] = [];
    evPorDia[ev.data_inicio].push(ev);
  });

  let html = `<div class="cal-semana-header">
    <div style="border-right:1px solid var(--border);"></div>
    ${dias.map(d => {
      const iso    = toISO(d);
      const isHoje = iso === hojeISO();
      return `<div class="cal-semana-header-cell${isHoje?' hoje':''}">
        <div class="dia-nome">${DIAS_SEMANA[d.getDay()]}</div>
        <div class="dia-num">${d.getDate()}</div>
      </div>`;
    }).join('')}
  </div>
  <div style="overflow-y:auto;max-height:calc(100vh - 280px);">
    <div class="cal-semana-grid">
      <div class="cal-hora-col">
        ${Array.from({length:24}, (_,h) => `
          <div class="cal-hora-label">${String(h).padStart(2,'0')}:00</div>
        `).join('')}
      </div>
      ${dias.map(d => {
        const iso = toISO(d);
        const evs = evPorDia[iso] || [];
        return `<div>
          ${Array.from({length:24}, (_,h) => {
            const evHora = evs.filter(ev => ev.hora && parseInt(ev.hora) === h);
            return `<div class="cal-semana-cell" data-data="${iso}" data-hora="${String(h).padStart(2,'0')}:00">
              ${evHora.map(ev => {
                const cfg = tipoCfg(ev.tipo);
                return `<div data-id="${ev.id}"
                  style="background:${cfg.cor}22;color:${cfg.cor};font-size:10px;
                  padding:1px 4px;border-radius:3px;border-left:2px solid ${cfg.cor};
                  cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;"
                  title="${ev.titulo}">
                  ${cfg.icon} ${ev.titulo}
                </div>`;
              }).join('')}
            </div>`;
          }).join('')}
        </div>`;
      }).join('')}
    </div>
  </div>`;

  el('calBody').innerHTML = html;

  el('calBody').querySelectorAll('.cal-semana-cell').forEach(cell => {
    cell.addEventListener('click', e => {
      if (e.target.closest('[data-id]')) return;
      abrirModalNovo(cell.dataset.data, cell.dataset.hora);
    });
  });

  el('calBody').querySelectorAll('[data-id]').forEach(pill => {
    pill.addEventListener('click', e => {
      e.stopPropagation();
      const ev = eventos.find(x => x.id === pill.dataset.id);
      if (ev) abrirModalEditar(ev);
    });
  });
}

// ── Visão LISTA ───────────────────────────────────────
function renderLista() {
  if (!eventos.length) {
    el('calBody').innerHTML = '<p class="muted" style="padding:24px;text-align:center;">Nenhum evento neste período.</p>';
    return;
  }

  // Agrupar por data
  const grupos = {};
  eventos.forEach(ev => {
    if (!grupos[ev.data_inicio]) grupos[ev.data_inicio] = [];
    grupos[ev.data_inicio].push(ev);
  });

  let html = '<div class="cal-lista">';
  Object.entries(grupos).sort().forEach(([data, evs]) => {
    const isHoje = data === hojeISO();
    html += `<div class="cal-lista-grupo">
      <div class="cal-lista-data" style="${isHoje?'color:var(--accent);':''}"
        >${isHoje ? '📍 HOJE — ' : ''}${fmtData(data)}</div>`;

    evs.forEach(ev => {
      const cfg = tipoCfg(ev.tipo);
      const statusCls = `status-${ev.status}`;
      html += `<div class="cal-lista-item" data-id="${ev.id}">
        <div class="cal-lista-icon">${cfg.icon}</div>
        <div class="cal-lista-info">
          <div class="cal-lista-titulo">${ev.titulo}</div>
          <div class="cal-lista-sub">
            ${ev.hora ? fmtHora(ev.hora) + ' · ' : ''}
            ${cfg.label}
            ${ev.local ? ' · 📍 ' + ev.local : ''}
            ${ev.descricao ? '<br>' + ev.descricao.slice(0,80) + (ev.descricao.length>80?'...':'') : ''}
          </div>
        </div>
        <div class="cal-lista-status">
          <span class="badge ${statusCls}" style="font-size:10px;">${ev.status}</span>
        </div>
      </div>`;
    });

    html += '</div>';
  });
  html += '</div>';

  el('calBody').innerHTML = html;

  el('calBody').querySelectorAll('.cal-lista-item').forEach(item => {
    item.addEventListener('click', () => {
      const ev = eventos.find(x => x.id === item.dataset.id);
      if (ev) abrirModalEditar(ev);
    });
  });
}

// ── Modal: Novo Evento ────────────────────────────────
function abrirModalNovo(data = '', hora = '') {
  editandoId = null;
  el('calModalTitulo').textContent = 'Novo Evento';
  el('evTitulo').value      = '';
  el('evTipo').value        = 'compromisso';
  el('evStatus').value      = 'pendente';
  el('evDataInicio').value  = data;
  el('evDataFim').value     = '';
  el('evHora').value        = hora;
  el('evLocal').value       = '';
  el('evDescricao').value   = '';
  el('evNotifEmail').checked  = false;
  el('evIcsExport').checked   = false;
  el('evLembreteDias').value  = '1';
  el('evEmail').value         = 'info.marcio@gmail.com';
  el('evNotifOpcoes').style.display = 'none';
  el('btnExcluirEvento').style.display = 'none';
  el('evMsg').textContent = '';
  el('calModalEvento').style.display = 'block';
}

// ── Modal: Editar Evento ──────────────────────────────
function abrirModalEditar(ev) {
  editandoId = ev.id;
  el('calModalTitulo').textContent = 'Editar Evento';
  el('evTitulo').value      = ev.titulo || '';
  el('evTipo').value        = ev.tipo   || 'compromisso';
  el('evStatus').value      = ev.status || 'pendente';
  el('evDataInicio').value  = ev.data_inicio || '';
  el('evDataFim').value     = ev.data_fim    || '';
  el('evHora').value        = ev.hora ? ev.hora.slice(0,5) : '';
  el('evLocal').value       = ev.local       || '';
  el('evDescricao').value   = ev.descricao   || '';
  el('evNotifEmail').checked  = ev.notif_email  || false;
  el('evIcsExport').checked   = false;
  el('evLembreteDias').value  = String(ev.lembrete_dias ?? 1);
  el('evEmail').value         = ev.email_destino || 'info.marcio@gmail.com';
  el('evNotifOpcoes').style.display = ev.notif_email ? 'block' : 'none';
  el('btnExcluirEvento').style.display = 'inline-flex';
  el('evMsg').textContent = '';
  el('calModalEvento').style.display = 'block';
}

// Toggle opções de notificação
el('evNotifEmail').addEventListener('change', () => {
  el('evNotifOpcoes').style.display = el('evNotifEmail').checked ? 'block' : 'none';
});

// Fechar modal
function fecharModal() {
  el('calModalEvento').style.display = 'none';
}
el('btnCancelarEvento').addEventListener('click', fecharModal);
el('calModalBackdrop').addEventListener('click', fecharModal);

// ── Salvar Evento ─────────────────────────────────────
el('btnSalvarEvento').addEventListener('click', async () => {
  const titulo = el('evTitulo').value.trim();
  const data   = el('evDataInicio').value;

  if (!titulo) { el('evMsg').className='message warning'; el('evMsg').textContent='Informe o título.'; return; }
  if (!data)   { el('evMsg').className='message warning'; el('evMsg').textContent='Informe a data.'; return; }

  const payload = {
    user_id       : user.id,
    titulo,
    tipo          : el('evTipo').value,
    status        : el('evStatus').value,
    data_inicio   : data,
    data_fim      : el('evDataFim').value    || null,
    hora          : el('evHora').value       || null,
    local         : el('evLocal').value.trim() || null,
    descricao     : el('evDescricao').value.trim() || null,
    notif_email   : el('evNotifEmail').checked,
    lembrete_dias : parseInt(el('evLembreteDias').value) || 1,
    email_destino : el('evEmail').value.trim() || null,
    atualizado_em : new Date().toISOString(),
  };

  let error;
  if (editandoId) {
    ({ error } = await supabase.from('calendar_events').update(payload).eq('id', editandoId).eq('user_id', user.id));
  } else {
    ({ error } = await supabase.from('calendar_events').insert(payload));
  }

  if (error) {
    el('evMsg').className = 'message danger';
    el('evMsg').textContent = 'Erro ao salvar: ' + error.message;
    return;
  }

  // Exportar para iPhone (.ics)
  if (el('evIcsExport').checked) {
    exportarICS({ titulo, data_inicio: data, data_fim: el('evDataFim').value, hora: el('evHora').value, descricao: el('evDescricao').value, local: el('evLocal').value });
  }

  fecharModal();
  renderizar();
});

// ── Excluir Evento ────────────────────────────────────
el('btnExcluirEvento').addEventListener('click', async () => {
  if (!editandoId) return;
  if (!confirm('Excluir este evento?')) return;
  await supabase.from('calendar_events').delete().eq('id', editandoId).eq('user_id', user.id);
  fecharModal();
  renderizar();
});

// ── Botão novo evento ─────────────────────────────────
el('btnNovoEvento').addEventListener('click', () => abrirModalNovo(hojeISO()));

// ── Exportar .ics para iPhone ─────────────────────────
function exportarICS({ titulo, data_inicio, data_fim, hora, descricao, local }) {
  const formatICS = iso => iso.replace(/-/g,'');
  const dtStart = hora
    ? formatICS(data_inicio) + 'T' + hora.replace(':','') + '00'
    : formatICS(data_inicio);
  const dtEnd = data_fim
    ? formatICS(data_fim) + (hora ? 'T' + hora.replace(':','') + '00' : '')
    : dtStart;

  const uid = `finzen-${Date.now()}@marcio-financeiro.github.io`;
  const now = new Date().toISOString().replace(/[-:]/g,'').split('.')[0] + 'Z';

  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//FinZen//Calendar//PT',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${now}`,
    hora ? `DTSTART:${dtStart}` : `DTSTART;VALUE=DATE:${dtStart}`,
    hora ? `DTEND:${dtEnd}`     : `DTEND;VALUE=DATE:${dtEnd}`,
    `SUMMARY:${titulo}`,
    descricao ? `DESCRIPTION:${descricao.replace(/\n/g,'\\n')}` : '',
    local     ? `LOCATION:${local}` : '',
    'BEGIN:VALARM',
    'TRIGGER:-PT24H',
    'ACTION:DISPLAY',
    `DESCRIPTION:Lembrete: ${titulo}`,
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ].filter(Boolean).join('\r\n');

  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `${titulo.replace(/\s+/g,'_')}.ics`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Inicialização ─────────────────────────────────────
renderizar();

// Verificar e enviar lembretes por e-mail (uma vez por dia)
emailService.agendarLembretes(user.id, supabase);
