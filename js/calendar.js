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
document.getElementById('btnVoltar').addEventListener('click', () => navigate('./dashboard.html'));

// ── Estado ────────────────────────────────────────────
const el    = id => document.getElementById(id);
let hoje    = new Date();
let refData = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
let viewAtual   = window.innerWidth <= 820 ? 'lista' : 'mensal';
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
  // ── 1. Eventos manuais do calendário ─────────────────
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

  // ── 2. Eventos financeiros automáticos (somente leitura) ──
  const financeiros = await carregarEventosFinanceiros(dataInicio, dataFim);
  eventos = [...eventos, ...financeiros]
    .sort((a, b) => a.data_inicio.localeCompare(b.data_inicio));
}

// ── Buscar dados financeiros e converter em eventos ───
async function carregarEventosFinanceiros(dataInicio, dataFim) {
  const evFinanc = [];

  try {
    const [
      { data: pendentes  },
      { data: cartoes    },
      { data: metas      },
      { data: certs      },
    ] = await Promise.all([
      // Lançamentos pendentes no período
      supabase.from('transactions')
        .select('id,description,amount,date,type,categories:category_id(nome,icon)')
        .eq('user_id', user.id)
        .eq('status', 'pendente')
        .gte('date', dataInicio)
        .lte('date', dataFim)
        .order('date', { ascending: true }),

      // Cartões com vencimento no período
      supabase.from('credit_cards')
        .select('id,nome,vencimento_dia')
        .eq('user_id', user.id)
        .eq('ativo', true),

      // Metas com prazo no período
      supabase.from('goals')
        .select('id,nome,valor_alvo,valor_atual,data_alvo')
        .eq('user_id', user.id)
        .eq('ativo', true)
        .gte('data_alvo', dataInicio)
        .lte('data_alvo', dataFim),

      // Certificações vencendo no período
      supabase.from('certifications')
        .select('id,nome,data_vencimento,entidade')
        .eq('user_id', user.id)
        .gte('data_vencimento', dataInicio)
        .lte('data_vencimento', dataFim),
    ]);

    // Lançamentos pendentes → eventos financeiros
    (pendentes || []).forEach(t => {
      const icon = t.categories?.icon || (t.type === 'receita' ? '💚' : '🔴');
      const sinal = t.type === 'receita' ? '+' : '-';
      const valor = Number(t.amount || 0).toLocaleString('pt-BR', { style:'currency', currency:'BRL' });
      evFinanc.push({
        id          : `fin-tx-${t.id}`,
        titulo      : `${icon} ${t.description || t.categories?.nome || 'Lançamento'}`,
        tipo        : 'financeiro',
        status      : 'pendente',
        data_inicio : t.date,
        descricao   : `${sinal}${valor} · Pendente`,
        _auto       : true,
        _origem     : 'transacao',
      });
    });

    // Faturas de cartão → calcular data de vencimento no período
    const [anoInicio, mesInicio] = dataInicio.split('-').map(Number);
    const [anoFim,    mesFim   ] = dataFim.split('-').map(Number);

    (cartoes || []).forEach(cartao => {
      if (!cartao.vencimento_dia) return;

      // Verificar vencimentos em todos os meses do período
      for (let ano = anoInicio; ano <= anoFim; ano++) {
        const mesIni = (ano === anoInicio) ? mesInicio : 1;
        const mesFinal = (ano === anoFim) ? mesFim : 12;
        for (let mes = mesIni; mes <= mesFinal; mes++) {
          const diaVenc = cartao.vencimento_dia;
          const maxDia  = new Date(ano, mes, 0).getDate();
          const dia     = Math.min(diaVenc, maxDia);
          const dataVenc = `${ano}-${String(mes).padStart(2,'0')}-${String(dia).padStart(2,'0')}`;

          if (dataVenc >= dataInicio && dataVenc <= dataFim) {
            const refFatura = `${ano}-${String(mes).padStart(2,'0')}`;
            evFinanc.push({
              id          : `fin-fat-${cartao.id}-${refFatura}`,
              titulo      : `💳 Fatura ${cartao.nome}`,
              tipo        : 'financeiro',
              status      : 'pendente',
              data_inicio : dataVenc,
              descricao   : `Vencimento fatura ${cartao.nome} — ${refFatura}`,
              _auto       : true,
              _origem     : 'fatura',
            });
          }
        }
      }
    });

    // Metas com prazo → eventos de marco
    (metas || []).forEach(m => {
      if (!m.data_alvo) return;
      const pct = m.valor_alvo > 0 ? Math.round(m.valor_atual / m.valor_alvo * 100) : 0;
      evFinanc.push({
        id          : `fin-meta-${m.id}`,
        titulo      : `🏆 Meta: ${m.nome}`,
        tipo        : 'financeiro',
        status      : pct >= 100 ? 'concluido' : 'pendente',
        data_inicio : m.data_alvo,
        descricao   : `Progresso: ${pct}% · ${Number(m.valor_atual||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})} de ${Number(m.valor_alvo||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}`,
        _auto       : true,
        _origem     : 'meta',
      });
    });

    // Certificações vencendo → alertas
    (certs || []).forEach(c => {
      evFinanc.push({
        id          : `fin-cert-${c.id}`,
        titulo      : `📄 Vence: ${c.nome}`,
        tipo        : 'documento',
        status      : 'pendente',
        data_inicio : c.data_vencimento,
        descricao   : `Certificação ${c.nome}${c.entidade ? ' — ' + c.entidade : ''} vence nesta data`,
        _auto       : true,
        _origem     : 'certificacao',
      });
    });

  } catch(e) {
    console.warn('[FinZen] Erro ao carregar eventos financeiros:', e.message);
  }

  return evFinanc;
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
      const autoStyle = ev._auto ? 'border-left:2px dashed ' + cfg.cor + ';opacity:.85;' : '';
      html += `<div class="cal-evento-pill" data-id="${ev.id}"
        style="background:${cfg.cor}22;color:${cfg.cor};${autoStyle}"
        title="${ev.titulo}${ev._auto?' (automático)':''}">
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
      if (!ev) return;
      if (ev._auto) mostrarInfoAuto(ev);
      else abrirModalEditar(ev);
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
      if (!ev) return;
      if (ev._auto) mostrarInfoAuto(ev);
      else abrirModalEditar(ev);
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
      if (!ev) return;
      if (ev._auto) mostrarInfoAuto(ev);
      else abrirModalEditar(ev);
    });
  });
}

// ── Info popup para eventos automáticos (somente leitura) ─
function mostrarInfoAuto(ev) {
  const cfg = tipoCfg(ev.tipo);
  const origemLabel = {
    transacao    : '💸 Lançamento pendente',
    fatura       : '💳 Vencimento de fatura',
    meta         : '🏆 Prazo de meta',
    certificacao : '📄 Vencimento de certificação',
  }[ev._origem] || '🔄 Automático';

  const popup = document.createElement('div');
  popup.innerHTML = `
    <div style="position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9990;" id="autoInfoBackdrop"></div>
    <div style="position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);
      z-index:9991;background:var(--surface);border:1px solid var(--border);
      border-radius:14px;padding:20px;width:90%;max-width:380px;
      box-shadow:0 20px 60px rgba(0,0,0,.5);">
      <div style="display:flex;align-items:flex-start;gap:10px;margin-bottom:14px;">
        <span style="font-size:24px;">${cfg.icon}</span>
        <div style="flex:1;">
          <div style="font-size:14px;font-weight:800;">${ev.titulo}</div>
          <div style="font-size:11px;color:var(--muted);margin-top:2px;">${origemLabel}</div>
        </div>
        <span style="font-size:11px;padding:3px 8px;border-radius:99px;
          background:rgba(107,112,148,.15);color:var(--muted);font-weight:700;">
          automático
        </span>
      </div>
      <div style="font-size:13px;color:var(--muted);margin-bottom:16px;
        padding:10px 12px;background:var(--surface-2);border-radius:8px;">
        📅 ${fmtData(ev.data_inicio)}
        ${ev.descricao ? `<br>📝 ${ev.descricao}` : ''}
      </div>
      <p style="font-size:11px;color:var(--muted);margin:0 0 14px;">
        Este evento é gerado automaticamente pelo FinZen. Para editá-lo, acesse a origem.
      </p>
      <button style="width:100%;padding:10px;border-radius:8px;background:var(--accent);
        color:#fff;border:none;cursor:pointer;font-weight:700;font-size:13px;"
        id="autoInfoFechar">Fechar</button>
    </div>`;
  document.body.appendChild(popup);
  document.getElementById('autoInfoBackdrop').addEventListener('click', () => popup.remove());
  document.getElementById('autoInfoFechar').addEventListener('click', () => popup.remove());
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
  el('evEmail').value         = _emailPerfil;
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
  el('evEmail').value         = ev.email_destino || _emailPerfil;
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
    exportarICS({ id: editandoId, titulo, data_inicio: data, data_fim: el('evDataFim').value, hora: el('evHora').value, descricao: el('evDescricao').value, local: el('evLocal').value, lembrete_dias: parseInt(el('evLembreteDias').value)||1 });
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

// ── Exportar mês inteiro para iPhone ─────────────────
el('btnExportarMes').addEventListener('click', exportarMesICS);

function exportarMesICS() {
  if (!eventos.length) {
    alert('Nenhum evento neste período para exportar.');
    return;
  }

  // Exportar apenas eventos manuais (não automáticos financeiros)
  const eventosParaExportar = eventos.filter(ev => !ev._auto);
  if (!eventosParaExportar.length) {
    alert('Nenhum evento manual neste período. Eventos financeiros automáticos não são exportados.');
    return;
  }

  const formatICS = iso => iso ? iso.replace(/-/g,'') : '';
  const now = new Date().toISOString().replace(/[-:]/g,'').split('.')[0] + 'Z';
  const mesLabel = el('calLabel').textContent.replace(/\s/g,'_');

  const linhas = ['BEGIN:VCALENDAR','VERSION:2.0',
    'PRODID:-//FinZen//Calendar//PT','CALSCALE:GREGORIAN','METHOD:REQUEST'];

  eventosParaExportar.forEach(ev => {
    const cfg    = tipoCfg(ev.tipo);
    const dtStart = ev.hora
      ? formatICS(ev.data_inicio) + 'T' + ev.hora.replace(':','').slice(0,4) + '00'
      : formatICS(ev.data_inicio);
    const dtEnd = ev.data_fim
      ? (ev.hora ? formatICS(ev.data_fim) + 'T' + ev.hora.replace(':','').slice(0,4) + '00' : formatICS(ev.data_fim))
      : dtStart;

    // UID estável = id do Supabase — garante atualização em vez de duplicata
    const uid = `${ev.id}@finzen.marcio-financeiro.github.io`;

    // SEQUENCE baseado na data de atualização — iPhone usa para saber qual é mais recente
    const seq = ev.atualizado_em
      ? Math.floor(new Date(ev.atualizado_em).getTime() / 60000)
      : 0;

    linhas.push('BEGIN:VEVENT');
    linhas.push(`UID:${uid}`);
    linhas.push(`DTSTAMP:${now}`);
    linhas.push(`SEQUENCE:${seq}`);
    linhas.push(ev.hora ? `DTSTART:${dtStart}` : `DTSTART;VALUE=DATE:${dtStart}`);
    linhas.push(ev.hora ? `DTEND:${dtEnd}`     : `DTEND;VALUE=DATE:${dtEnd}`);
    linhas.push(`SUMMARY:${cfg.icon} ${ev.titulo}`);
    if (ev.descricao) linhas.push(`DESCRIPTION:${ev.descricao.replace(/\n/g,'\\n')}`);
    if (ev.local)     linhas.push(`LOCATION:${ev.local}`);
    const alarmHoras = (ev.lembrete_dias || 1) * 24;
    linhas.push('BEGIN:VALARM');
    linhas.push(`TRIGGER:-PT${alarmHoras}H`);
    linhas.push('ACTION:DISPLAY');
    linhas.push(`DESCRIPTION:Lembrete FinZen: ${ev.titulo}`);
    linhas.push('END:VALARM');
    linhas.push('END:VEVENT');
  });

  linhas.push('END:VCALENDAR');

  const ics  = linhas.join('\r\n');
  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `FinZen_${mesLabel}.ics`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Exportar .ics para iPhone ─────────────────────────
function exportarICS({ id, titulo, data_inicio, data_fim, hora, descricao, local, lembrete_dias }) {
  const formatICS = iso => iso ? iso.replace(/-/g,'') : '';
  const dtStart = hora
    ? formatICS(data_inicio) + 'T' + hora.replace(':','') + '00'
    : formatICS(data_inicio);
  const dtEnd = data_fim
    ? formatICS(data_fim) + (hora ? 'T' + hora.replace(':','') + '00' : '')
    : dtStart;

  // UID estável: usa o id do Supabase se disponível
  const uid = id
    ? `${id}@finzen.marcio-financeiro.github.io`
    : `finzen-${Date.now()}@marcio-financeiro.github.io`;

  const now = new Date().toISOString().replace(/[-:]/g,'').split('.')[0] + 'Z';
  const alarmHoras = (lembrete_dias || 1) * 24;

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
// Buscar e-mail do perfil uma vez e salvar em variável global
let _emailPerfil = user.email || '';
supabase
  .from('user_settings')
  .select('setting_value')
  .eq('user_id', user.id)
  .eq('setting_key', 'perfil_email_notif')
  .single()
  .then(({ data }) => {
    if (data?.setting_value) _emailPerfil = data.setting_value;
  });

// Sincronizar botão ativo com a visão detectada (mobile = lista)
document.querySelectorAll('.cal-view-btn').forEach(b => {
  b.classList.toggle('active', b.dataset.view === viewAtual);
});

renderizar();

// Verificar e enviar lembretes por e-mail (uma vez por dia)
emailService.agendarLembretes(user.id, supabase);
