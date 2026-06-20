/**
 * diarioTese.js
 * Diário de Tese de Investimento — FinZen
 *
 * Responsabilidades:
 *  - Buscar indicadores fundamentalistas via /api/quotes?fundamental=true
 *  - Salvar/carregar tese, gatilho, convicção, notas e indicadores manuais no Supabase
 *  - Renderizar painel expansível por ativo na aba Carteira (desktop only)
 *
 * API pública:
 *  diarioTese.init(supabaseClient, userId)
 *  diarioTese.renderPainel(ativoId, ticker, tipo, container)
 *  diarioTese.buscarFundamentais(tickersBR, tickersEUA)  → { TICKER: {pl,roe,dy,pvpa} }
 */

export const diarioTese = (() => {

  let _sb  = null;
  let _uid = null;

  // Cache em memória para não rebuscar na mesma sessão
  const _cacheAuto = {};   // { TICKER: {pl,roe,dy,pvpa} }
  const _cacheTese = {};   // { investment_id: { tese_entrada, ... } }

  // ── Helpers ────────────────────────────────────────────────────────────
  const fmtNum = (v, dec=2) => v != null ? Number(v).toFixed(dec) : '—';
  const fmtPct = v => v != null ? Number(v).toFixed(2) + '%' : '—';

  const CONVICAO_LABEL = { alta:'🟢 Alta', media:'🟡 Média', baixa:'🔴 Baixa' };
  const CONVICAO_COR   = { alta:'var(--success)', media:'var(--warning)', baixa:'var(--danger)' };

  // ── Buscar indicadores automáticos via /api/quotes ─────────────────────
  async function buscarFundamentais(tickersBR = [], tickersEUA = []) {
    const todos = [...tickersBR, ...tickersEUA].filter(Boolean);
    if (!todos.length) return {};

    // Checar cache
    const faltando = todos.filter(t => !_cacheAuto[t]);
    if (!faltando.length) return Object.fromEntries(todos.map(t => [t, _cacheAuto[t]]));

    try {
      const params = new URLSearchParams({ tickers: faltando.join(','), fundamental: 'true' });
      const res = await fetch(`/api/quotes?${params}`);
      if (!res.ok) return {};
      const data = await res.json();

      faltando.forEach(t => {
        const fund = data[`${t}_fund`];
        _cacheAuto[t] = fund || null;
      });
    } catch(_) {}

    return Object.fromEntries(todos.map(t => [t, _cacheAuto[t] || null]));
  }

  // ── Carregar tese do Supabase ───────────────────────────────────────────
  async function carregarTese(investmentId) {
    if (_cacheTese[investmentId]) return _cacheTese[investmentId];

    const { data } = await _sb
      .from('investments')
      .select('tese_entrada,gatilho_saida,notas_livres,convicao,ind_pl,ind_roe,ind_dy,ind_pvpa,ind_pl_auto,ind_roe_auto,ind_dy_auto,ind_pvpa_auto,ind_auto_em')
      .eq('id', investmentId)
      .eq('user_id', _uid)
      .single();

    _cacheTese[investmentId] = data || {};
    return _cacheTese[investmentId];
  }

  // ── Salvar tese no Supabase ─────────────────────────────────────────────
  async function salvarTese(investmentId, campos) {
    const { error } = await _sb
      .from('investments')
      .update(campos)
      .eq('id', investmentId)
      .eq('user_id', _uid);

    if (!error) {
      _cacheTese[investmentId] = { ..._cacheTese[investmentId], ...campos };
    }
    return !error;
  }

  // ── Renderizar painel de tese para um ativo ─────────────────────────────
  async function renderPainel(ativoId, ticker, tipo, container) {
    container.innerHTML = `<p class="muted" style="padding:12px;font-size:13px;">⏳ Carregando tese...</p>`;

    const tese = await carregarTese(ativoId);

    // Buscar automáticos se for ação/FII/ETF (não RF nem cripto)
    const isBR  = ['acao_br','acao','fii','etf_br','etf'].includes(tipo);
    const isEUA = ['acao_eua','etf_eua'].includes(tipo);
    let auto = null;

    if (isBR || isEUA) {
      const mapa = await buscarFundamentais(
        isBR  ? [ticker] : [],
        isEUA ? [ticker] : []
      );
      auto = mapa[ticker] || null;

      // Salvar cache automático se veio da API e é mais recente que 24h
      if (auto) {
        const ontem = new Date(Date.now() - 86400000).toISOString();
        if (!tese.ind_auto_em || tese.ind_auto_em < ontem) {
          await salvarTese(ativoId, {
            ind_pl_auto   : auto.pl,
            ind_roe_auto  : auto.roe,
            ind_dy_auto   : auto.dy,
            ind_pvpa_auto : auto.pvpa,
            ind_auto_em   : new Date().toISOString(),
          });
        }
      }
    }

    // Resolução final: auto > cache_auto salvo > manual
    const pl   = auto?.pl   ?? tese.ind_pl_auto   ?? tese.ind_pl   ?? null;
    const roe  = auto?.roe  ?? tese.ind_roe_auto  ?? tese.ind_roe  ?? null;
    const dy   = auto?.dy   ?? tese.ind_dy_auto   ?? tese.ind_dy   ?? null;
    const pvpa = auto?.pvpa ?? tese.ind_pvpa_auto ?? tese.ind_pvpa ?? null;

    const autoLabel = auto ? '<span style="font-size:9px;color:var(--success);margin-left:4px;">●auto</span>'
                           : '<span style="font-size:9px;color:var(--muted);margin-left:4px;">manual</span>';

    const convicao = tese.convicao || '';

    container.innerHTML = `
    <div class="tese-painel" style="
      background:var(--surface-2);border-top:1px solid var(--border);
      padding:16px 20px;display:grid;
      grid-template-columns:1fr 1fr;gap:16px;
    ">

      <!-- Col 1: Indicadores fundamentalistas -->
      <div>
        <div style="font-size:11px;font-weight:700;color:var(--muted);letter-spacing:.06em;
          text-transform:uppercase;margin-bottom:10px;">
          Indicadores ${autoLabel}
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px;">
          ${indicadorCard('P/L',    fmtNum(pl),   'Preço / Lucro — abaixo de 10 é barato no BR')}
          ${indicadorCard('ROE',    fmtPct(roe),  'Retorno sobre Patrimônio — acima de 15% é saudável')}
          ${indicadorCard('DY',     fmtPct(dy),   'Dividend Yield — rendimento em dividendos')}
          ${indicadorCard('P/VPA',  fmtNum(pvpa), 'Preço / Valor Patrimonial — abaixo de 1 é desconto')}
        </div>

        <!-- Indicadores manuais (fallback / override) -->
        <details style="margin-top:4px;">
          <summary style="font-size:11px;color:var(--muted);cursor:pointer;user-select:none;">
            ✏️ Inserir manualmente
          </summary>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px;">
            ${inputInd('pl',   'P/L',   tese.ind_pl,   ativoId)}
            ${inputInd('roe',  'ROE %', tese.ind_roe,  ativoId)}
            ${inputInd('dy',   'DY %',  tese.ind_dy,   ativoId)}
            ${inputInd('pvpa', 'P/VPA', tese.ind_pvpa, ativoId)}
          </div>
          <button type="button" class="btn btn-secondary compact"
            style="margin-top:8px;"
            onclick="diarioTeseGlobal.salvarIndicadores('${ativoId}')">
            💾 Salvar indicadores
          </button>
        </details>
      </div>

      <!-- Col 2: Narrativa -->
      <div style="display:flex;flex-direction:column;gap:10px;">

        <!-- Nível de convicção -->
        <div>
          <label style="font-size:11px;font-weight:700;color:var(--muted);
            letter-spacing:.06em;text-transform:uppercase;display:block;margin-bottom:6px;">
            Convicção
          </label>
          <div style="display:flex;gap:6px;">
            ${['alta','media','baixa'].map(v => `
              <button type="button"
                id="conv-${ativoId}-${v}"
                onclick="diarioTeseGlobal.setConvicao('${ativoId}','${v}',this)"
                style="
                  padding:5px 12px;border-radius:99px;font-size:12px;font-weight:700;
                  border:1px solid ${CONVICAO_COR[v]};cursor:pointer;
                  background:${convicao===v ? CONVICAO_COR[v]+'33' : 'transparent'};
                  color:${CONVICAO_COR[v]};transition:background .15s;
                ">${CONVICAO_LABEL[v]}</button>
            `).join('')}
          </div>
        </div>

        <!-- Tese de entrada -->
        <div>
          <label style="font-size:11px;font-weight:700;color:var(--muted);
            letter-spacing:.06em;text-transform:uppercase;display:block;margin-bottom:4px;">
            Por que comprei
          </label>
          <textarea id="tese-entrada-${ativoId}" rows="2"
            placeholder="Ex: ROE consistente acima de 20%, boa alocação de capital, dividendos crescentes..."
            style="resize:vertical;font-size:12px;line-height:1.5;"
          >${tese.tese_entrada || ''}</textarea>
        </div>

        <!-- Gatilho de saída -->
        <div>
          <label style="font-size:11px;font-weight:700;color:var(--muted);
            letter-spacing:.06em;text-transform:uppercase;display:block;margin-bottom:4px;">
            Quando sair
          </label>
          <textarea id="tese-saida-${ativoId}" rows="2"
            placeholder="Ex: ROE cair abaixo de 15% por 2 trimestres consecutivos, ou P/L > 15..."
            style="resize:vertical;font-size:12px;line-height:1.5;"
          >${tese.gatilho_saida || ''}</textarea>
        </div>

        <!-- Notas livres -->
        <div>
          <label style="font-size:11px;font-weight:700;color:var(--muted);
            letter-spacing:.06em;text-transform:uppercase;display:block;margin-bottom:4px;">
            Notas
          </label>
          <textarea id="tese-notas-${ativoId}" rows="2"
            placeholder="Observações, contexto macro, revisões..."
            style="resize:vertical;font-size:12px;line-height:1.5;"
          >${tese.notas_livres || ''}</textarea>
        </div>

        <button type="button" class="btn btn-primary compact"
          style="align-self:flex-start;"
          onclick="diarioTeseGlobal.salvarNarrativa('${ativoId}')">
          💾 Salvar tese
        </button>
        <div id="tese-msg-${ativoId}" style="font-size:12px;min-height:16px;"></div>
      </div>

    </div>`;
  }

  // ── Sub-helpers de UI ───────────────────────────────────────────────────
  function indicadorCard(label, valor, title) {
    return `<div title="${title}" style="
      background:var(--surface-3);border-radius:8px;padding:8px 10px;
      display:flex;flex-direction:column;gap:2px;
    ">
      <span style="font-size:10px;color:var(--muted);font-weight:700;">${label}</span>
      <span style="font-size:16px;font-weight:900;color:var(--text);">${valor}</span>
    </div>`;
  }

  function inputInd(campo, label, valor, ativoId) {
    return `<div>
      <label style="font-size:10px;color:var(--muted);font-weight:700;">${label}</label>
      <input type="number" id="ind-${campo}-${ativoId}" step="0.01"
        value="${valor != null ? valor : ''}" placeholder="—"
        style="padding:5px 8px;font-size:13px;">
    </div>`;
  }

  // ── Ações expostas globalmente ──────────────────────────────────────────
  const global = {

    setConvicao(ativoId, valor, btn) {
      // Atualiza visual dos botões
      ['alta','media','baixa'].forEach(v => {
        const b = document.getElementById(`conv-${ativoId}-${v}`);
        if (b) b.style.background = v === valor ? `${CONVICAO_COR[v]}33` : 'transparent';
      });
      salvarTese(ativoId, { convicao: valor });
    },

    async salvarNarrativa(ativoId) {
      const campos = {
        tese_entrada  : document.getElementById(`tese-entrada-${ativoId}`)?.value || null,
        gatilho_saida : document.getElementById(`tese-saida-${ativoId}`)?.value   || null,
        notas_livres  : document.getElementById(`tese-notas-${ativoId}`)?.value   || null,
      };
      const ok = await salvarTese(ativoId, campos);
      const msg = document.getElementById(`tese-msg-${ativoId}`);
      if (msg) {
        msg.textContent = ok ? '✅ Tese salva!' : '❌ Erro ao salvar';
        msg.style.color = ok ? 'var(--success)' : 'var(--danger)';
        setTimeout(() => { msg.textContent = ''; }, 2000);
      }
    },

    async salvarIndicadores(ativoId) {
      const g = id => {
        const v = parseFloat(document.getElementById(id)?.value);
        return isNaN(v) ? null : v;
      };
      const campos = {
        ind_pl   : g(`ind-pl-${ativoId}`),
        ind_roe  : g(`ind-roe-${ativoId}`),
        ind_dy   : g(`ind-dy-${ativoId}`),
        ind_pvpa : g(`ind-pvpa-${ativoId}`),
      };
      await salvarTese(ativoId, campos);
    },
  };

  // ── INIT ────────────────────────────────────────────────────────────────
  function init(supabaseClient, userId) {
    _sb  = supabaseClient;
    _uid = userId;
    // Expõe as ações no window para os onclick inline
    window.diarioTeseGlobal = global;
  }

  return { init, renderPainel, buscarFundamentais };

})();
