/**
 * termometro.js
 * Termômetro de Alocação por Setor — FinZen
 *
 * Responsabilidades:
 *  - Ler ativos, pesos e cotações já carregados por investments.js
 *  - Ler/salvar contexto macro (Selic, IPCA, USD) em user_settings
 *  - Renderizar gauge por classe, barra de composição e leitura macro
 *
 * API pública (chamada por investments.js):
 *  termometro.init(supabaseClient, userId)
 *  termometro.render(ativos, pesos, dolarAtual)
 */

export const termometro = (() => {

  // ── referências de estado injetadas pelo investments.js ──────────────
  let _sb   = null;
  let _uid  = null;

  // ── cores por classe (consistente com o resto do app) ────────────────
  const COR = {
    'Ações BR'  : '#4b84f3',
    'FIIs'      : '#22c55e',
    'ETFs BR'   : '#06b6d4',
    'Ações EUA' : '#a855f7',
    'ETFs EUA'  : '#7b5ce5',
    'Renda Fixa': '#f59e0b',
    'Cripto'    : '#f97316',
    'Outros'    : '#6b7094',
  };

  // ── leitura de macro contextual ──────────────────────────────────────
  const MACRO_KEYS = {
    selic : 'termometro_selic',
    ipca  : 'termometro_ipca',
    dolar : 'termometro_dolar',
  };

  async function carregarMacro() {
    const keys = Object.values(MACRO_KEYS);
    const { data } = await _sb.from('user_settings')
      .select('setting_key,setting_value')
      .eq('user_id', _uid)
      .in('setting_key', keys);

    const m = {};
    (data || []).forEach(r => { m[r.setting_key] = parseFloat(r.setting_value) || 0; });
    return {
      selic : m[MACRO_KEYS.selic] || 14.75,
      ipca  : m[MACRO_KEYS.ipca]  || 4.86,
      dolar : m[MACRO_KEYS.dolar] || 5.80,
    };
  }

  async function salvarMacro(selic, ipca, dolar) {
    const upserts = [
      { user_id:_uid, setting_key:MACRO_KEYS.selic, setting_value: String(selic) },
      { user_id:_uid, setting_key:MACRO_KEYS.ipca,  setting_value: String(ipca)  },
      { user_id:_uid, setting_key:MACRO_KEYS.dolar, setting_value: String(dolar) },
    ];
    for (const u of upserts) {
      await _sb.from('user_settings')
        .upsert(u, { onConflict: 'user_id,setting_key' });
    }
  }

  // ── helpers ──────────────────────────────────────────────────────────
  const el  = id => document.getElementById(id);
  const fmt = v  => Number(v).toLocaleString('pt-BR', { style:'currency', currency:'BRL' });
  const fmtPct = v => Number(v).toLocaleString('pt-BR', { minimumFractionDigits:1, maximumFractionDigits:1 }) + '%';

  function classeKey(tipo) {
    return {
      acao_br:'Ações BR', acao:'Ações BR',
      fii:'FIIs',
      etf_br:'ETFs BR', etf:'ETFs BR',
      acao_eua:'Ações EUA',
      etf_eua:'ETFs EUA',
      renda_fixa:'Renda Fixa',
      cripto:'Cripto',
    }[tipo] || 'Outros';
  }

  function calcAtualBRL(a, dolar) {
    const qtd    = parseFloat(a.quantidade)   || 0;
    const preco  = parseFloat(a.cotacao_atual || a.preco_medio) || 0;
    const valor  = qtd * preco;
    return (a.moeda === 'USD') ? valor * dolar : valor;
  }

  // ── lógica de semáforo de Selic ──────────────────────────────────────
  function semaforoSelic(selic) {
    if (selic >= 13)  return { emoji:'🔴', label:'Alta — favorece RF e bancos' };
    if (selic >= 9)   return { emoji:'🟡', label:'Moderada — equilíbrio RF/RV' };
    return               { emoji:'🟢', label:'Baixa — favorece RV e imóveis' };
  }
  function semaforoIPCA(ipca) {
    if (ipca > 5)   return { emoji:'🔴', label:'Inflação acima da meta' };
    if (ipca > 3.5) return { emoji:'🟡', label:'Inflação na banda superior' };
    return               { emoji:'🟢', label:'Inflação dentro da meta' };
  }

  // ── recomendações macro por classe ───────────────────────────────────
  function gerarRecomendacoes(selic, ipca) {
    const selicAlta = selic >= 12;
    const ipcaAlto  = ipca  >= 4.5;

    return [
      {
        classe : 'Renda Fixa',
        icon   : '🏦',
        status : selicAlta ? 'favorável' : 'neutro',
        cor    : selicAlta ? 'var(--success)' : 'var(--muted)',
        texto  : selicAlta
          ? `Selic a ${selic}% a.a. torna a RF extremamente competitiva. Tesouro IPCA+ e CDBs de bancos médios pagam acima da inflação com baixo risco.`
          : `Selic em queda reduz o prêmio da RF. Prefira títulos longos IPCA+ para travar taxas reais antes dos cortes.`,
      },
      {
        classe : 'Ações BR',
        icon   : '📈',
        status : selicAlta ? 'atenção' : 'favorável',
        cor    : selicAlta ? 'var(--warning)' : 'var(--success)',
        texto  : selicAlta
          ? `Com Selic a ${selic}%, o custo de capital pressiona valuations. Foco em empresas com ROE > 20%, baixa dívida e geração de caixa — bancos e utilidades se destacam.`
          : `Queda de juros expande múltiplos e beneficia empresas sensíveis ao crédito (consumo, construção, varejo).`,
      },
      {
        classe : 'FIIs',
        icon   : '🏢',
        status : selicAlta ? 'atenção' : 'favorável',
        cor    : selicAlta ? 'var(--warning)' : 'var(--success)',
        texto  : selicAlta
          ? `Juros altos pressionam os preços dos FIIs, pois investidores migram para RF. Porém, FIIs de tijolo (logístico, lajes) com contratos corrigidos pelo IPCA (+${ipca}%) são mais resilientes.`
          : `Cortes de juros valorizam cotas e aumentam atratividade dos dividendos mensais.`,
      },
      {
        classe : 'Ações EUA',
        icon   : '🇺🇸',
        status : 'neutro',
        cor    : 'var(--info)',
        texto  : `Exposição em dólar serve como proteção cambial. Com USD/BRL elevado, retornos em reais são amplificados. Priorize empresas com fluxo de caixa livre positivo (S&P500 via ETF ou big techs).`,
      },
      {
        classe : 'ETFs EUA',
        icon   : '🌐',
        status : 'neutro',
        cor    : 'var(--info)',
        texto  : `ETFs internacionais (VOO, QQQ, VT) oferecem diversificação geográfica e proteção contra desvalorização do BRL. Indicados para composição de longo prazo via Nomad.`,
      },
      {
        classe : 'ETFs BR',
        icon   : '📊',
        status : 'neutro',
        cor    : 'var(--muted)',
        texto  : `ETFs de bolsa brasileira (BOVA11, IVVB11) permitem exposição ampla ao Ibovespa. ${ipcaAlto ? `Com IPCA a ${ipca}%, prefira ETFs atrelados à inflação.` : 'Boa opção para quem quer diversificação sem selecionar ativos individualmente.'}`,
      },
      {
        classe : 'Cripto',
        icon   : '₿',
        status : 'risco',
        cor    : 'var(--danger)',
        texto  : `Alta volatilidade. Em cenário de juros altos, ativos de risco sofrem mais. Se mantiver posição, limite a 5-10% da carteira total e use apenas o que tolera perder.`,
      },
    ];
  }

  // ── RENDER PRINCIPAL ─────────────────────────────────────────────────
  function render(ativos, pesos, dolarAtual, macro) {
    const CLASSES = ['Ações BR','FIIs','ETFs BR','Ações EUA','ETFs EUA','Renda Fixa','Cripto','Outros'];

    // 1. Calcular valor atual por classe
    const porClasse = {};
    CLASSES.forEach(k => { porClasse[k] = { ativos:[], total:0 }; });
    ativos.forEach(a => {
      const k = classeKey(a.tipo);
      if (!porClasse[k]) return;
      const v = calcAtualBRL(a, dolarAtual);
      porClasse[k].ativos.push(a);
      porClasse[k].total += v;
    });

    const patrimonioTotal = Object.values(porClasse).reduce((s,c) => s + c.total, 0);

    // 2. Ler metas dos pesos (salvas na aba Balancear)
    function metaClasse(classe) {
      const k = `inv_peso_classe_${classe.replace(/\s/g,'_')}`;
      return parseFloat((pesos[k]||{}).ideal || 0);
    }

    // ── Semáforos macro ──────────────────────────────────────────────
    const ss = semaforoSelic(macro.selic);
    const si = semaforoIPCA(macro.ipca);
    if (el('selicSemaforo')) el('selicSemaforo').textContent = ss.emoji;
    if (el('ipcaSemaforo'))  el('ipcaSemaforo').textContent  = si.emoji;

    // ── Alerta macro contextual ──────────────────────────────────────
    const alertaEl = el('termMacroAlerta');
    if (alertaEl) {
      const msgs = [];
      if (macro.selic >= 13) msgs.push(`🔴 Selic a ${macro.selic}%: ${ss.label}.`);
      if (macro.ipca  >= 4.5) msgs.push(`🟡 IPCA a ${macro.ipca}%: ${si.label}. Prefira ativos com proteção inflacionária.`);
      if (macro.selic >= 13 && macro.ipca >= 4.5) {
        msgs.push('💡 Cenário atual favorece Renda Fixa e empresas com alto ROE. Revise exposição a ativos de risco.');
      }
      if (msgs.length) {
        alertaEl.innerHTML = msgs.join('<br>');
        alertaEl.style.display = 'block';
      } else {
        alertaEl.style.display = 'none';
      }
    }

    // ── Gauge grid por classe ────────────────────────────────────────
    const gaugeGrid = el('termGaugeGrid');
    if (gaugeGrid) {
      const classesComDados = CLASSES.filter(k => porClasse[k].total > 0 || metaClasse(k) > 0);
      if (!classesComDados.length) {
        gaugeGrid.innerHTML = '<p class="muted">Nenhum ativo cadastrado ainda. Adicione investimentos na aba Aportar/Gerir.</p>';
      } else {
        gaugeGrid.innerHTML = classesComDados.map(classe => {
          const c      = porClasse[classe];
          const pctReal  = patrimonioTotal > 0 ? (c.total / patrimonioTotal) * 100 : 0;
          const pctMeta  = metaClasse(classe);
          const cor      = COR[classe] || '#6b7094';
          const diff     = pctReal - pctMeta;
          const temMeta  = pctMeta > 0;

          // Calcular fill do gauge: % real vs meta
          // Se não tem meta, mostra só a barra da realidade
          const barReal  = Math.min(pctReal, 100);
          const barMeta  = temMeta ? Math.min(pctMeta, 100) : 0;

          // Status
          let statusTxt, statusCor;
          if (!temMeta) {
            statusTxt = 'Sem meta definida'; statusCor = 'var(--muted)';
          } else if (Math.abs(diff) <= 1.5) {
            statusTxt = '✅ No alvo'; statusCor = 'var(--success)';
          } else if (diff > 1.5) {
            statusTxt = `▲ ${fmtPct(diff)} acima da meta`; statusCor = 'var(--warning)';
          } else {
            statusTxt = `▼ ${fmtPct(Math.abs(diff))} abaixo da meta`; statusCor = 'var(--danger)';
          }

          return `
          <div style="
            background:var(--surface);border:1px solid var(--border);
            border-radius:var(--radius-md);padding:16px;
          ">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px;">
              <div>
                <span style="font-weight:800;font-size:14px;">${classe}</span>
                <div class="muted" style="font-size:11px;margin-top:2px;">${c.ativos.length} ativo${c.ativos.length!==1?'s':''}</div>
              </div>
              <div style="text-align:right;">
                <span style="font-size:18px;font-weight:900;color:${cor};">${fmtPct(pctReal)}</span>
                ${temMeta ? `<div class="muted" style="font-size:11px;">meta: ${fmtPct(pctMeta)}</div>` : ''}
              </div>
            </div>

            <!-- Barra dupla: meta (fundo) + realidade (frente) -->
            <div style="position:relative;height:10px;background:var(--surface-2);border-radius:99px;overflow:visible;margin-bottom:8px;">
              ${temMeta ? `
                <!-- marcador de meta -->
                <div style="
                  position:absolute;top:-3px;bottom:-3px;width:2px;
                  background:rgba(255,255,255,0.35);border-radius:2px;
                  left:${Math.min(barMeta,99)}%;z-index:2;
                " title="Meta: ${fmtPct(pctMeta)}"></div>
              ` : ''}
              <!-- barra real -->
              <div style="
                height:100%;border-radius:99px;
                width:${Math.min(barReal,100)}%;
                background:${cor};
                transition:width .4s ease;
                position:relative;z-index:1;
              "></div>
            </div>

            <div style="display:flex;justify-content:space-between;align-items:center;">
              <span style="font-size:11px;color:${statusCor};font-weight:700;">${statusTxt}</span>
              <span style="font-size:12px;color:var(--muted);">${fmt(c.total)}</span>
            </div>
          </div>`;
        }).join('');
      }
    }

    // ── Barra de composição global ───────────────────────────────────
    const barraEl  = el('termBarraVisual');
    const legendaEl = el('termLegenda');
    if (barraEl && legendaEl && patrimonioTotal > 0) {
      const classesAtivas = CLASSES.filter(k => porClasse[k].total > 0);
      barraEl.innerHTML = classesAtivas.map(k => {
        const pct = (porClasse[k].total / patrimonioTotal) * 100;
        return `<div title="${k}: ${fmtPct(pct)}" style="
          width:${pct}%;background:${COR[k]||'#6b7094'};
          height:100%;transition:width .4s ease;
        "></div>`;
      }).join('');

      legendaEl.innerHTML = classesAtivas.map(k => {
        const pct = (porClasse[k].total / patrimonioTotal) * 100;
        return `<div style="display:flex;align-items:center;gap:5px;">
          <div style="width:10px;height:10px;border-radius:50%;background:${COR[k]||'#6b7094'};flex-shrink:0;"></div>
          <span style="font-size:12px;color:var(--muted);">${k}</span>
          <span style="font-size:12px;font-weight:700;">${fmtPct(pct)}</span>
        </div>`;
      }).join('');
    } else if (barraEl) {
      barraEl.innerHTML = '<div style="width:100%;background:var(--surface-3);height:100%;border-radius:8px;"></div>';
      if (legendaEl) legendaEl.innerHTML = '<span class="muted" style="font-size:12px;">Sem ativos cadastrados</span>';
    }

    // ── Recomendações por classe ──────────────────────────────────────
    const recEl = el('termRecomendacoes');
    if (recEl) {
      const recs = gerarRecomendacoes(macro.selic, macro.ipca);
      // Mostrar só classes que o usuário tem na carteira, mais RF sempre
      const classesUsuario = new Set(ativos.map(a => classeKey(a.tipo)));
      classesUsuario.add('Renda Fixa');

      recEl.innerHTML = recs
        .filter(r => classesUsuario.has(r.classe))
        .map(r => `
          <div style="
            background:var(--surface);border:1px solid var(--border);
            border-radius:var(--radius-md);padding:16px;
          ">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
              <span style="font-size:20px;">${r.icon}</span>
              <strong style="font-size:14px;">${r.classe}</strong>
              <span style="
                margin-left:auto;font-size:10px;font-weight:700;
                padding:2px 8px;border-radius:99px;
                background:${r.cor}22;color:${r.cor};text-transform:uppercase;
              ">${r.status}</span>
            </div>
            <p style="margin:0;font-size:12px;line-height:1.6;color:var(--muted);">${r.texto}</p>
          </div>
        `).join('');
    }
  }

  // ── INIT (chamado por investments.js) ─────────────────────────────────
  async function init(supabaseClient, userId) {
    _sb  = supabaseClient;
    _uid = userId;
    const macro = await carregarMacro();
    return macro;
  }

  // ── API pública ───────────────────────────────────────────────────────
  return { init, render, carregarMacro, salvarMacro };

})();
