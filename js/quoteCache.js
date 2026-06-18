/**
 * quoteCache.js — Cache inteligente de cotações
 *
 * Dois níveis de proteção:
 * 1. Cache em memória (deduplicação): mesma requisição em voo → retorna a mesma Promise
 * 2. Cache em localStorage (TTL): cotações válidas por 15 min → não bate na API
 *
 * Indicador visual: elementos com [data-quote-status] recebem "live" ou "cache"
 * automaticamente a cada chamada.
 */

const TTL_MS       = 24 * 60 * 60 * 1000; // 24 horas — atualização diária
const CACHE_KEY    = 'finzen_quote_cache_v1';
const _emFlight    = new Map(); // deduplicação: chave → Promise em andamento

// ── Persistência localStorage ─────────────────────────────────────────────────

function lerCache() {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) || '{}');
  } catch (_) { return {}; }
}

function salvarCache(dados) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(dados));
  } catch (_) {}
}

function cacheValido(entrada) {
  return entrada && (Date.now() - entrada.ts) < TTL_MS;
}

// ── Indicador visual ──────────────────────────────────────────────────────────

function setStatus(status) {
  // status: 'live' | 'cache' | 'offline'
  document.querySelectorAll('[data-quote-status]').forEach(el => {
    el.setAttribute('data-quote-status', status);
    if (status === 'live') {
      el.title = 'Cotações ao vivo';
      el.style.color = 'var(--success)';
    } else if (status === 'cache') {
      el.title = 'Cotações em cache (atualizadas hoje)';
      el.style.color = 'var(--warning)';
    } else {
      el.title = 'Sem conexão — usando última cotação salva';
      el.style.color = 'var(--muted)';
    }
  });
}

// ── API pública ───────────────────────────────────────────────────────────────

/**
 * Busca cotações com cache inteligente.
 * @param {string[]} tickers — ex: ['PETR4', 'AAPL']
 * @param {boolean} comDolar — incluir USD-BRL
 * @param {boolean} forcar   — ignorar cache e buscar na API
 * @returns {Promise<Object>} — { TICKER: preco, 'USD-BRL': valor }
 */
export async function getCotacoes(tickers = [], comDolar = true, forcar = false) {
  const cache = lerCache();
  const resultado = {};
  const buscar   = []; // tickers que precisam ir à API

  // Verificar cache para cada ticker
  if (!forcar) {
    if (comDolar && cacheValido(cache['USD-BRL'])) {
      resultado['USD-BRL'] = cache['USD-BRL'].v;
    } else if (comDolar) {
      buscar.push('__DOLAR__');
    }

    for (const t of tickers) {
      const key = t.toUpperCase();
      if (cacheValido(cache[key])) {
        resultado[key] = cache[key].v;
      } else {
        buscar.push(key);
      }
    }
  } else {
    // Forçar tudo
    if (comDolar) buscar.push('__DOLAR__');
    buscar.push(...tickers.map(t => t.toUpperCase()));
  }

  // Se tudo veio do cache, retornar imediatamente
  if (buscar.length === 0) {
    setStatus('cache');
    return resultado;
  }

  // Montar chave de deduplicação
  const chaveVoo = buscar.sort().join(',');

  // Se já tem uma requisição em andamento com os mesmos tickers → reusar
  if (_emFlight.has(chaveVoo)) {
    const dados = await _emFlight.get(chaveVoo);
    setStatus('live');
    return { ...resultado, ...dados };
  }

  // Montar URL
  const params = new URLSearchParams();
  const tickersReais = buscar.filter(t => t !== '__DOLAR__');
  if (tickersReais.length) params.set('tickers', tickersReais.join(','));
  if (buscar.includes('__DOLAR__') || comDolar) params.set('dolar', 'true');

  // Criar Promise e registrar no mapa de voo
  const promise = fetch(`/api/quotes?${params}`)
    .then(r => r.ok ? r.json() : {})
    .catch(() => null)
    .finally(() => _emFlight.delete(chaveVoo));

  _emFlight.set(chaveVoo, promise);

  const dados = await promise;

  if (dados === null) {
    // Falha de rede — usar o que tiver no cache, mesmo vencido
    setStatus('offline');
    const cacheAntigo = lerCache();
    for (const t of tickers) {
      const key = t.toUpperCase();
      if (cacheAntigo[key]) resultado[key] = cacheAntigo[key].v;
    }
    if (comDolar && cacheAntigo['USD-BRL']) resultado['USD-BRL'] = cacheAntigo['USD-BRL'].v;
    return resultado;
  }

  // Salvar novos dados no cache
  const agora = Date.now();
  const cacheAtual = lerCache();
  for (const [k, v] of Object.entries(dados)) {
    cacheAtual[k] = { v, ts: agora };
  }
  salvarCache(cacheAtual);

  setStatus('live');
  return { ...resultado, ...dados };
}

/**
 * Busca apenas o dólar com cache.
 */
export async function getDolar(forcar = false) {
  const result = await getCotacoes([], true, forcar);
  return result['USD-BRL'] || null;
}

/**
 * Limpa o cache manualmente (ex: botão "Atualizar" forçado).
 */
export function limparCache() {
  localStorage.removeItem(CACHE_KEY);
}

/**
 * Retorna info sobre o estado do cache para debug.
 */
export function infoCacheAtual() {
  const cache = lerCache();
  const agora = Date.now();
  return Object.entries(cache).map(([k, v]) => ({
    ticker: k,
    preco: v.v,
    idadeMin: Math.floor((agora - v.ts) / 60000),
    valido: cacheValido(v),
  }));
}
