/**
 * rebalancePopup.js
 * Popup de alerta de rebalanceamento de carteira — FinZen
 *
 * Exibe uma vez por dia ao abrir o dashboard quando alguma
 * classe de ativo estiver defasada mais de X% da meta definida
 * na aba Balancear (salva em user_settings como inv_peso_classe_*).
 *
 * API pública:
 *   rebalancePopup.verificar(supabaseClient, userId)
 */

export const rebalancePopup = (() => {

  const THRESHOLD   = 5;    // % de diferença para disparar alerta
  const CACHE_KEY   = 'finzen_rebalance_popup_data';
  const VISTO_KEY   = 'finzen_rebalance_visto';

  // ── Helpers ──────────────────────────────────────────────────────────
  const fmt    = v  => Number(v).toLocaleString('pt-BR', { style:'currency', currency:'BRL' });
  const fmtPct = v  => Number(v).toFixed(1) + '%';

  function classeKey(tipo) {
    return {
      acao_br:'Ações_BR', acao:'Ações_BR', fii:'FIIs',
      etf_br:'ETFs_BR', etf:'ETFs_BR',
      acao_eua:'Ações_EUA', etf_eua:'ETFs_EUA',
      renda_fixa:'Renda_Fixa', cripto:'Cripto',
    }[tipo] || 'Outros';
  }

  function classeLabel(key) {
    return key.replace(/_/g, ' ');
  }

  // ── Verificar se já foi visto hoje ───────────────────────────────────
  function jaViuHoje() {
    const visto = localStorage.getItem(VISTO_KEY);
    if (!visto) return false;
    return visto === new Date().toISOString().split('T')[0];
  }

  function marcarComoVisto() {
    localStorage.setItem(VISTO_KEY, new Date().toISOString().split('T')[0]);
  }

  // ── Buscar dados e calcular defasagens ───────────────────────────────
  async function calcularDefasagens(sb, userId) {
    const [
      { data: ativos },
      { data: pesos  },
    ] = await Promise.all([
      sb.from('investments')
        .select('tipo,quantidade,preco_medio,cotacao_atual,moeda')
        .eq('user_id', userId).eq('ativo', true),

      sb.from('user_settings')
        .select('setting_key,setting_value')
        .eq('user_id', userId)
        .like('setting_key', 'inv_peso_classe_%'),
    ]);

    if (!ativos?.length || !pesos?.length) return [];

    // Calcular valor atual por classe
    const porClasse = {};
    let totalAtual  = 0;

    (ativos || []).forEach(a => {
      const qtd   = Number(a.quantidade  || 0);
      const cot   = Number(a.cotacao_atual || a.preco_medio || 0);
      const valor = qtd * cot;
      // Simplificado: não converte USD (usa cotação bruta)
      const ck = classeKey(a.tipo);
      porClasse[ck] = (porClasse[ck] || 0) + valor;
      totalAtual   += valor;
    });

    if (totalAtual <= 0) return [];

    // Comparar com metas salvas
    const defasagens = [];

    (pesos || []).forEach(p => {
      // setting_key = inv_peso_classe_Ações_BR → classe = Ações_BR
      const classe  = p.setting_key.replace('inv_peso_classe_', '');
      const meta    = parseFloat(JSON.parse(p.setting_value || '{}').ideal || 0);
      if (meta <= 0) return;

      const valorAtual = porClasse[classe] || 0;
      const pctReal    = totalAtual > 0 ? (valorAtual / totalAtual) * 100 : 0;
      const diff       = pctReal - meta;

      if (Math.abs(diff) >= THRESHOLD) {
        defasagens.push({
          classe  : classeLabel(classe),
          meta,
          pctReal : parseFloat(pctReal.toFixed(1)),
          diff    : parseFloat(diff.toFixed(1)),
          valor   : valorAtual,
          status  : diff > 0 ? 'acima' : 'abaixo',
        });
      }
    });

    // Ordena por maior defasagem absoluta
    return defasagens.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
  }

  // ── Renderizar e exibir o popup ──────────────────────────────────────
  function exibir(defasagens) {
    // Remover popup anterior se existir
    document.getElementById('finzen-rebalance-popup')?.remove();

    const corDiff = d => d > 0 ? 'var(--warning)' : 'var(--danger)';
    const iconDiff = d => d > 0 ? '▲' : '▼';

    const linhas = defasagens.map(d => `
      <div style="
        display:flex;justify-content:space-between;align-items:center;
        padding:10px 0;border-bottom:1px solid var(--border);
      ">
        <div>
          <strong style="font-size:13px;">${d.classe}</strong>
          <div style="font-size:11px;color:var(--muted);margin-top:2px;">
            Meta: ${fmtPct(d.meta)} · Atual: ${fmtPct(d.pctReal)} · ${fmt(d.valor)}
          </div>
        </div>
        <span style="
          font-size:13px;font-weight:800;color:${corDiff(d.diff)};
          white-space:nowrap;margin-left:12px;
        ">${iconDiff(d.diff)} ${fmtPct(Math.abs(d.diff))}</span>
      </div>
    `).join('');

    const total = defasagens.length;
    const acima  = defasagens.filter(d => d.status === 'acima').length;
    const abaixo = defasagens.filter(d => d.status === 'abaixo').length;

    const popup = document.createElement('div');
    popup.id = 'finzen-rebalance-popup';
    popup.innerHTML = `
      <div id="frp-backdrop" style="
        position:fixed;inset:0;background:rgba(0,0,0,.6);
        z-index:9990;animation:frpFade .2s ease;
      "></div>
      <div style="
        position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);
        z-index:9991;background:var(--surface);border:1px solid var(--border);
        border-radius:16px;padding:24px;width:90%;max-width:440px;
        box-shadow:0 24px 64px rgba(0,0,0,.5);
        animation:frpSlide .2s ease;
      ">
        <!-- Header -->
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px;">
          <div>
            <div style="font-size:22px;margin-bottom:4px;">⚖️</div>
            <h2 style="margin:0;font-size:16px;font-weight:800;">Rebalanceamento necessário</h2>
            <p style="margin:4px 0 0;font-size:12px;color:var(--muted);">
              ${total} classe${total > 1 ? 's' : ''} fora da meta
              ${acima  ? `· <span style="color:var(--warning)">${acima} acima</span>` : ''}
              ${abaixo ? `· <span style="color:var(--danger)">${abaixo} abaixo</span>` : ''}
            </p>
          </div>
          <button id="frp-fechar" style="
            background:none;border:none;color:var(--muted);font-size:20px;
            cursor:pointer;padding:0;line-height:1;margin-left:8px;
          ">×</button>
        </div>

        <!-- Linhas de defasagem -->
        <div style="max-height:260px;overflow-y:auto;margin-bottom:16px;">
          ${linhas}
        </div>

        <!-- Rodapé -->
        <div style="font-size:11px;color:var(--muted);margin-bottom:16px;">
          Threshold de alerta: diferença ≥ ${THRESHOLD}% da meta
        </div>

        <!-- Botões -->
        <div style="display:flex;gap:10px;">
          <a href="./investments.html" style="
            flex:1;padding:11px;border-radius:10px;text-align:center;font-size:13px;
            font-weight:800;background:var(--accent);color:#fff;text-decoration:none;
            display:block;
          ">⚖️ Ir para Balancear</a>
          <button id="frp-ignorar" style="
            padding:11px 16px;border-radius:10px;font-size:13px;font-weight:700;
            background:var(--surface-2);border:1px solid var(--border);
            color:var(--muted);cursor:pointer;
          ">Ignorar hoje</button>
        </div>
      </div>
      <style>
        @keyframes frpFade  { from{opacity:0} to{opacity:1} }
        @keyframes frpSlide { from{opacity:0;transform:translate(-50%,-46%)} to{opacity:1;transform:translate(-50%,-50%)} }
      </style>
    `;

    document.body.appendChild(popup);

    // Fechar
    function fechar() {
      popup.style.opacity = '0';
      popup.style.transition = 'opacity .15s';
      setTimeout(() => popup.remove(), 150);
      marcarComoVisto();
    }

    document.getElementById('frp-fechar')?.addEventListener('click', fechar);
    document.getElementById('frp-ignorar')?.addEventListener('click', fechar);
    document.getElementById('frp-backdrop')?.addEventListener('click', fechar);
    document.addEventListener('keydown', function esc(e) {
      if (e.key === 'Escape') { fechar(); document.removeEventListener('keydown', esc); }
    });
  }

  // ── API pública ───────────────────────────────────────────────────────
  async function verificar(sb, userId) {
    // Só mostra uma vez por dia
    if (jaViuHoje()) return;

    try {
      const defasagens = await calcularDefasagens(sb, userId);
      if (defasagens.length > 0) {
        // Pequeno delay para o dashboard carregar primeiro
        setTimeout(() => exibir(defasagens), 1200);
      } else {
        // Marca como visto mesmo sem defasagens para não buscar de novo hoje
        marcarComoVisto();
      }
    } catch(e) {
      console.warn('[FinZen] rebalancePopup erro:', e.message);
    }
  }

  return { verificar };

})();
