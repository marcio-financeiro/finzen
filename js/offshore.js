/**
 * offshore.js
 * Controle de escala offshore, certificações e horas extras — FinZen
 */

import { supabase }   from './supabaseClient.js';
import { navigate }   from './router.js';
import { emailService } from './emailService.js';
import { registrarAcao } from './eventBus.js';

// ── Auth ──────────────────────────────────────────────
const { data: sd } = await supabase.auth.getSession();
if(!sd.session){ navigate('../login.html'); throw new Error('unauthenticated'); }
const user = sd.session.user;
document.getElementById('btnVoltar').addEventListener('click', () => navigate('./dashboard.html'));

const el  = id => document.getElementById(id);
const fmt = v  => Number(v).toLocaleString('pt-BR', { style:'currency', currency:'BRL' });

let editandoCicloId = null;
let editandoCertId  = null;
let ciclos = [], certs = [], horas = [];

// ── Abas ──────────────────────────────────────────────
document.querySelectorAll('.off-tab').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.off-tab').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.off-tab-content').forEach(c => c.classList.remove('active'));
    btn.classList.add('active');
    el('tab-' + btn.dataset.tab).classList.add('active');
    if (btn.dataset.tab === 'horas')    carregarHE();
    if (btn.dataset.tab === 'historico') renderHistorico();
  });
});

// ── Utilitários ───────────────────────────────────────
function fmtData(iso) {
  if (!iso) return '—';
  const [y,m,d] = iso.split('-');
  return `${d}/${m}/${y}`;
}
function diasEntre(d1, d2) {
  if (!d1 || !d2) return 0;
  return Math.round((new Date(d2+'T00:00:00') - new Date(d1+'T00:00:00')) / 864e5);
}
function diasAteVencer(iso) {
  if (!iso) return null;
  const hoje = new Date().toISOString().split('T')[0];
  return Math.round((new Date(iso+'T00:00:00') - new Date(hoje+'T00:00:00')) / 864e5);
}

// ── Cores por status ──────────────────────────────────
const STATUS_COR = {
  planejado : '#4b84f3',
  embarcado : '#f5a623',
  concluido : '#1ec86a',
  cancelado : '#6b7094',
};

// ── Carregar tudo ─────────────────────────────────────
async function carregarTudo() {
  const anoAtual = new Date().getFullYear();

  const [
    { data: c },
    { data: ct },
    { data: h },
  ] = await Promise.all([
    supabase.from('offshore_cycles')
      .select('*').eq('user_id', user.id)
      .order('data_embarque', { ascending: false }),
    supabase.from('certifications')
      .select('*').eq('user_id', user.id)
      .order('data_vencimento', { ascending: true }),
    supabase.from('offshore_overtime')
      .select('*').eq('user_id', user.id)
      .order('data', { ascending: false }).limit(100),
  ]);

  ciclos = c || [];
  certs  = ct || [];
  horas  = h  || [];

  renderKPIs();
  renderCiclos();
  renderCerts();
}

// ── KPIs ──────────────────────────────────────────────
function renderKPIs() {
  const anoAtual  = new Date().getFullYear();
  const inicio    = `${anoAtual}-01-01`;
  const fim       = `${anoAtual}-12-31`;

  // Dias embarcado no ano
  const diasEmb = ciclos
    .filter(c => c.data_embarque >= inicio && c.data_embarque <= fim)
    .reduce((s, c) => {
      const d2 = c.data_desembarque || new Date().toISOString().split('T')[0];
      return s + Math.max(diasEntre(c.data_embarque, d2), 0);
    }, 0);

  const diasAno  = diasEntre(inicio, fim);
  const diasCasa = Math.max(diasAno - diasEmb, 0);

  const ciclosConcluidos = ciclos.filter(c => c.status === 'concluido').length;

  // Certificações
  const hoje = new Date().toISOString().split('T')[0];
  const certValidas  = certs.filter(c => c.data_vencimento >= hoje).length;
  const certAVencer  = certs.filter(c => {
    const dias = diasAteVencer(c.data_vencimento);
    return dias !== null && dias >= 0 && dias <= 90;
  }).length;

  // HE do ciclo atual (embarcado)
  const cicloAtual = ciclos.find(c => c.status === 'embarcado');
  const heAtual    = cicloAtual
    ? horas.filter(h => h.cycle_id === cicloAtual.id).reduce((s,h) => s + Number(h.horas_extras||0), 0)
    : 0;

  el('kpiDiasEmb').textContent    = diasEmb + 'd';
  el('kpiDiasCasa').textContent   = diasCasa + 'd';
  el('kpiCiclos').textContent     = ciclosConcluidos;
  el('kpiCertVal').textContent    = certValidas;
  el('kpiCertAVencer').textContent = certAVencer;
  el('kpiHE').textContent         = heAtual.toFixed(1) + 'h';
}

// ── Ciclos ────────────────────────────────────────────
function renderCiclos() {
  if (!ciclos.length) {
    el('listaCiclos').innerHTML = '<p class="muted">Nenhum ciclo cadastrado. Clique em "+ Novo ciclo".</p>';
    return;
  }

  el('listaCiclos').innerHTML = ciclos.map(c => {
    const cor      = STATUS_COR[c.status] || '#6b7094';
    const dias     = c.data_desembarque ? diasEntre(c.data_embarque, c.data_desembarque) : '?';
    return `<div class="off-ciclo-card" data-id="${c.id}">
      <div class="off-ciclo-status" style="background:${cor};"></div>
      <div class="off-ciclo-info">
        <div class="off-ciclo-plat">${c.plataforma || 'Sem plataforma'}</div>
        <div class="off-ciclo-datas">
          ${fmtData(c.data_embarque)} → ${c.data_desembarque ? fmtData(c.data_desembarque) : 'Em andamento'}
          · ${dias} dias · ${c.regime || '—'}
        </div>
        ${c.empresa ? `<div style="font-size:11px;color:var(--muted);margin-top:2px;">${c.empresa}${c.contrato?' · OS: '+c.contrato:''}</div>` : ''}
        <div class="off-ciclo-badges">
          <span class="badge" style="background:${cor}22;color:${cor};font-size:10px;">${c.status}</span>
        </div>
      </div>
    </div>`;
  }).join('');

  el('listaCiclos').querySelectorAll('.off-ciclo-card').forEach(card => {
    card.addEventListener('click', () => {
      const ciclo = ciclos.find(c => c.id === card.dataset.id);
      if (ciclo) abrirModalCiclo(ciclo);
    });
  });
}

// ── Certificações ─────────────────────────────────────
function renderCerts() {
  if (!certs.length) {
    el('listaCerts').innerHTML = '<p class="muted">Nenhuma certificação cadastrada.</p>';
    return;
  }

  const hoje = new Date().toISOString().split('T')[0];

  el('listaCerts').innerHTML = certs.map(c => {
    const dias = diasAteVencer(c.data_vencimento);
    const vencida   = dias !== null && dias < 0;
    const avencer   = dias !== null && dias >= 0 && dias <= 90;
    const cor = vencida ? '#f04e4e' : avencer ? '#f5a623' : '#1ec86a';
    const label = vencida
      ? `Vencida há ${Math.abs(dias)}d`
      : dias === 0 ? 'Vence hoje!'
      : dias !== null ? `Vence em ${dias}d`
      : '—';

    return `<div class="cert-card" data-id="${c.id}">
      <div class="cert-status-bar" style="background:${cor};"></div>
      <div class="cert-info">
        <div class="cert-nome">${c.nome}</div>
        <div class="cert-sub">
          ${c.entidade ? c.entidade + ' · ' : ''}
          Emissão: ${fmtData(c.data_emissao)} · Vence: ${fmtData(c.data_vencimento)}
          ${c.numero ? ' · Nº ' + c.numero : ''}
        </div>
      </div>
      <div class="cert-dias" style="color:${cor};">${label}</div>
    </div>`;
  }).join('');

  el('listaCerts').querySelectorAll('.cert-card').forEach(card => {
    card.addEventListener('click', () => {
      const cert = certs.find(c => c.id === card.dataset.id);
      if (cert) abrirModalCert(cert);
    });
  });
}

// ── Horas Extras ──────────────────────────────────────
async function carregarHE() {
  const { data } = await supabase.from('offshore_overtime')
    .select('*').eq('user_id', user.id)
    .order('data', { ascending: false }).limit(50);
  horas = data || [];
  renderHE();
}

function renderHE() {
  if (!horas.length) {
    el('listaHE').innerHTML = '<p class="muted">Nenhum registro de horas extras.</p>';
    return;
  }

  const totalHE   = horas.reduce((s,h) => s + Number(h.horas_extras||0), 0);
  const totalValor = horas.reduce((s,h) => s + (Number(h.horas_extras||0) * Number(h.valor_hora||0)), 0);

  el('listaHE').innerHTML = `
    <div style="display:flex;gap:12px;margin-bottom:16px;flex-wrap:wrap;">
      <div class="off-kpi" style="flex:1;min-width:120px;"><span>Total HE</span><strong>${totalHE.toFixed(1)}h</strong></div>
      <div class="off-kpi" style="flex:1;min-width:120px;"><span>Valor estimado</span><strong style="color:var(--success);">${fmt(totalValor)}</strong></div>
    </div>
    <div class="table-wrap"><table class="data-table">
      <thead><tr><th>Data</th><th>HE</th><th>Sobreaviso</th><th>Valor/h</th><th>Total</th><th>Descrição</th></tr></thead>
      <tbody>
        ${horas.map(h => `<tr>
          <td>${fmtData(h.data)}</td>
          <td><strong>${Number(h.horas_extras||0).toFixed(1)}h</strong></td>
          <td>${h.sobreaviso ? 'Sim' : '—'}</td>
          <td>${h.valor_hora ? fmt(h.valor_hora) : '—'}</td>
          <td>${h.valor_hora ? fmt(Number(h.horas_extras||0)*Number(h.valor_hora)) : '—'}</td>
          <td>${h.descricao || '—'}</td>
        </tr>`).join('')}
      </tbody>
    </table></div>
  `;
}

// ── Histórico de plataformas ──────────────────────────
function renderHistorico() {
  if (!ciclos.length) {
    el('listaHistorico').innerHTML = '<p class="muted">Nenhum ciclo no histórico.</p>';
    return;
  }

  // Agrupar por plataforma
  const porPlat = {};
  ciclos.filter(c => c.plataforma).forEach(c => {
    if (!porPlat[c.plataforma]) porPlat[c.plataforma] = [];
    porPlat[c.plataforma].push(c);
  });

  el('listaHistorico').innerHTML = `
    <div class="table-wrap"><table class="data-table">
      <thead><tr><th>Plataforma</th><th>Empresa</th><th>Embarques</th><th>Dias total</th><th>Último embarque</th></tr></thead>
      <tbody>
        ${Object.entries(porPlat).map(([plat, cs]) => {
          const totalDias = cs.reduce((s,c) => {
            const d2 = c.data_desembarque || new Date().toISOString().split('T')[0];
            return s + Math.max(diasEntre(c.data_embarque, d2), 0);
          }, 0);
          const ultimo = cs.sort((a,b) => b.data_embarque.localeCompare(a.data_embarque))[0];
          return `<tr>
            <td><strong>${plat}</strong></td>
            <td>${ultimo.empresa || '—'}</td>
            <td>${cs.length}</td>
            <td>${totalDias}d</td>
            <td>${fmtData(ultimo.data_embarque)}</td>
          </tr>`;
        }).join('')}
      </tbody>
    </table></div>
  `;
}

// ── Modal Ciclo ───────────────────────────────────────
function abrirModalCiclo(ciclo = null) {
  editandoCicloId = ciclo?.id || null;
  el('modalCicloTitulo').textContent = ciclo ? 'Editar Ciclo' : 'Novo Ciclo';
  el('cEmbarque').value    = ciclo?.data_embarque    || '';
  el('cDesembarque').value = ciclo?.data_desembarque || '';
  el('cPlataforma').value  = ciclo?.plataforma       || '';
  el('cEmpresa').value     = ciclo?.empresa          || '';
  el('cContrato').value    = ciclo?.contrato         || '';
  el('cRegime').value      = ciclo?.regime           || '14x21';
  el('cStatus').value      = ciclo?.status           || 'planejado';
  el('cObs').value         = ciclo?.observacoes      || '';
  el('msgCiclo').textContent = '';
  el('btnExcluirCiclo').style.display = ciclo ? 'inline-flex' : 'none';
  el('modalCiclo').style.display = 'block';
}

registrarAcao('abrirNovoCiclo', () => abrirModalCiclo());
registrarAcao('fecharModalCiclo', () => { el('modalCiclo').style.display = 'none'; });

registrarAcao('salvarCiclo', async () => {
  const embarque = el('cEmbarque').value;
  if (!embarque) { el('msgCiclo').className='message warning'; el('msgCiclo').textContent='Informe a data de embarque.'; return; }

  const payload = {
    user_id          : user.id,
    data_embarque    : embarque,
    data_desembarque : el('cDesembarque').value || null,
    plataforma       : el('cPlataforma').value.trim() || null,
    empresa          : el('cEmpresa').value.trim()    || null,
    contrato         : el('cContrato').value.trim()   || null,
    regime           : el('cRegime').value,
    status           : el('cStatus').value,
    observacoes      : el('cObs').value.trim()        || null,
  };

  let error;
  if (editandoCicloId) {
    ({ error } = await supabase.from('offshore_cycles').update(payload).eq('id', editandoCicloId).eq('user_id', user.id));
  } else {
    ({ error } = await supabase.from('offshore_cycles').insert(payload));
  }

  if (error) { el('msgCiclo').className='message danger'; el('msgCiclo').textContent='Erro: '+error.message; return; }

  // Registrar automaticamente no calendário
  const plat = el('cPlataforma').value.trim() || 'Offshore';
  const calPayload = {
    user_id     : user.id,
    titulo      : `Embarque — ${plat}`,
    tipo        : 'offshore',
    status      : payload.status === 'concluido' ? 'concluido' : 'pendente',
    data_inicio : payload.data_embarque,
    data_fim    : payload.data_desembarque || null,
    descricao   : `Regime: ${payload.regime || '—'}${payload.empresa ? ' · ' + payload.empresa : ''}${payload.contrato ? ' · OS: ' + payload.contrato : ''}`,
    local       : plat,
    notif_email : true,
    lembrete_dias: 3,
    email_destino: 'info.marcio@gmail.com',
  };
  // Só insere se for ciclo novo (não edição)
  if (!editandoCicloId) {
    await supabase.from('calendar_events').insert(calPayload);
  } else {
    // Atualiza o evento do calendário vinculado (pelo título + data)
    await supabase.from('calendar_events')
      .update({ data_inicio: payload.data_embarque, data_fim: payload.data_desembarque || null, status: calPayload.status, descricao: calPayload.descricao })
      .eq('user_id', user.id)
      .eq('tipo', 'offshore')
      .eq('data_inicio', ciclos.find(c => c.id === editandoCicloId)?.data_embarque || payload.data_embarque);
  }

  el('modalCiclo').style.display = 'none';
  await carregarTudo();
});

registrarAcao('excluirCiclo', async () => {
  if (!editandoCicloId || !confirm('Excluir este ciclo?')) return;
  await supabase.from('offshore_cycles').delete().eq('id', editandoCicloId).eq('user_id', user.id);
  el('modalCiclo').style.display = 'none';
  await carregarTudo();
});

// ── Modal Certificação ────────────────────────────────
window._offCertNomeChange = (val) => {
  el('certNomeOutroDiv').style.display = val === 'outro' ? 'block' : 'none';
};

function abrirModalCert(cert = null) {
  editandoCertId = cert?.id || null;
  el('modalCertTitulo').textContent = cert ? 'Editar Certificação' : 'Nova Certificação';
  if (cert) {
    const opcaoExiste = [...el('certNomeSel').options].some(o => o.value === cert.nome);
    el('certNomeSel').value = opcaoExiste ? cert.nome : 'outro';
    el('certNomeOutro').value = opcaoExiste ? '' : cert.nome;
    el('certNomeOutroDiv').style.display = opcaoExiste ? 'none' : 'block';
  } else {
    el('certNomeSel').value = '';
    el('certNomeOutro').value = '';
    el('certNomeOutroDiv').style.display = 'none';
  }
  el('certNumero').value      = cert?.numero         || '';
  el('certEntidade').value    = cert?.entidade       || '';
  el('certEmissao').value     = cert?.data_emissao   || '';
  el('certVencimento').value  = cert?.data_vencimento|| '';
  el('certAlertaDias').value  = String(cert?.alerta_dias || 90);
  el('certNotifEmail').checked= cert?.notif_email !== false;
  el('certObs').value         = cert?.observacoes    || '';
  el('msgCert').textContent   = '';
  el('btnExcluirCert').style.display = cert ? 'inline-flex' : 'none';
  el('modalCert').style.display = 'block';
}

el('btnNovaCert').addEventListener('click', () => abrirModalCert());
el('btnCancelarCert').addEventListener('click', () => el('modalCert').style.display = 'none');
el('modalCertBackdrop').addEventListener('click', () => el('modalCert').style.display = 'none');

el('btnSalvarCert').addEventListener('click', async () => {
  const nomeSel  = el('certNomeSel').value;
  const nome     = nomeSel === 'outro' ? el('certNomeOutro').value.trim() : nomeSel;
  const venc     = el('certVencimento').value;
  if (!nome) { el('msgCert').className='message warning'; el('msgCert').textContent='Informe o nome.'; return; }
  if (!venc) { el('msgCert').className='message warning'; el('msgCert').textContent='Informe o vencimento.'; return; }

  const payload = {
    user_id         : user.id,
    nome,
    numero          : el('certNumero').value.trim()   || null,
    entidade        : el('certEntidade').value.trim() || null,
    data_emissao    : el('certEmissao').value         || null,
    data_vencimento : venc,
    alerta_dias     : parseInt(el('certAlertaDias').value) || 90,
    notif_email     : el('certNotifEmail').checked,
    observacoes     : el('certObs').value.trim()      || null,
  };

  let error;
  if (editandoCertId) {
    ({ error } = await supabase.from('certifications').update(payload).eq('id', editandoCertId).eq('user_id', user.id));
  } else {
    ({ error } = await supabase.from('certifications').insert(payload));
  }

  if (error) { el('msgCert').className='message danger'; el('msgCert').textContent='Erro: '+error.message; return; }
  el('modalCert').style.display = 'none';
  await carregarTudo();
});

el('btnExcluirCert').addEventListener('click', async () => {
  if (!editandoCertId || !confirm('Excluir esta certificação?')) return;
  await supabase.from('certifications').delete().eq('id', editandoCertId).eq('user_id', user.id);
  el('modalCert').style.display = 'none';
  await carregarTudo();
});

// ── Modal Horas Extras ────────────────────────────────
function preencherSelectCiclos() {
  const opts = ciclos.map(c =>
    `<option value="${c.id}">${c.plataforma||'Sem plataforma'} — ${c.data_embarque}</option>`
  ).join('');
  el('heCiclo').innerHTML = '<option value="">Sem vínculo</option>' + opts;
}

el('btnNovaHE').addEventListener('click', () => {
  preencherSelectCiclos();
  el('heData').value      = new Date().toISOString().split('T')[0];
  el('heHoras').value     = '';
  el('heValorHora').value = '';
  el('heSobreaviso').checked = false;
  el('heDesc').value      = '';
  el('msgHE').textContent = '';
  el('modalHE').style.display = 'block';
});
el('btnCancelarHE').addEventListener('click', () => el('modalHE').style.display = 'none');
el('modalHEBackdrop').addEventListener('click', () => el('modalHE').style.display = 'none');

el('btnSalvarHE').addEventListener('click', async () => {
  const data = el('heData').value;
  if (!data) { el('msgHE').className='message warning'; el('msgHE').textContent='Informe a data.'; return; }

  const payload = {
    user_id     : user.id,
    cycle_id    : el('heCiclo').value || null,
    data,
    horas_extras: parseFloat(el('heHoras').value)     || 0,
    valor_hora  : parseFloat(el('heValorHora').value) || null,
    sobreaviso  : el('heSobreaviso').checked,
    descricao   : el('heDesc').value.trim() || null,
  };

  const { error } = await supabase.from('offshore_overtime').insert(payload);
  if (error) { el('msgHE').className='message danger'; el('msgHE').textContent='Erro: '+error.message; return; }
  el('modalHE').style.display = 'none';
  await carregarHE();
  renderKPIs();
});

// ── Init ──────────────────────────────────────────────
await carregarTudo();
emailService.agendarLembretes(user.id, supabase);
