/**
 * importer.js
 * Importador de extratos OFX e CSV com categorização inteligente
 * Custo zero — aprende com as correções do usuário
 */

import { supabase }       from './supabaseClient.js';
import { navigate }       from './router.js';
import { formatCurrency } from './utils.js';

// ── Auth ──────────────────────────────────────────────
const { data: sd } = await supabase.auth.getSession();
if(!sd.session){ navigate('../login.html'); throw new Error('unauthenticated'); }
const user = sd.session.user;
document.getElementById('btnLogout').addEventListener('click', async () => {
  await supabase.auth.signOut(); navigate('../login.html');
});

const el  = id => document.getElementById(id);
const fmt = v  => formatCurrency(v, 'BRL');

// ── Base de regras pré-definidas (sem IA, custo zero) ─
const REGRAS_PADRAO = [
  // Alimentação
  { pattern:'IFOOD',         tipo:'despesa', nome_cat:'Alimentação' },
  { pattern:'RAPPI',         tipo:'despesa', nome_cat:'Alimentação' },
  { pattern:'UBER EATS',     tipo:'despesa', nome_cat:'Alimentação' },
  { pattern:'MCDONALDS',     tipo:'despesa', nome_cat:'Alimentação' },
  { pattern:'BURGER KING',   tipo:'despesa', nome_cat:'Alimentação' },
  { pattern:'SUBWAY',        tipo:'despesa', nome_cat:'Alimentação' },
  { pattern:'SUPERMERCADO',  tipo:'despesa', nome_cat:'Alimentação' },
  { pattern:'MERCADO',       tipo:'despesa', nome_cat:'Alimentação' },
  { pattern:'PADARIA',       tipo:'despesa', nome_cat:'Alimentação' },
  { pattern:'ACOUGUE',       tipo:'despesa', nome_cat:'Alimentação' },
  { pattern:'HORTIFRUTI',    tipo:'despesa', nome_cat:'Alimentação' },
  { pattern:'PAO DE ACUCAR', tipo:'despesa', nome_cat:'Alimentação' },
  { pattern:'CARREFOUR',     tipo:'despesa', nome_cat:'Alimentação' },
  { pattern:'EXTRA ',        tipo:'despesa', nome_cat:'Alimentação' },
  { pattern:'ATACADAO',      tipo:'despesa', nome_cat:'Alimentação' },
  { pattern:'ASSAI',         tipo:'despesa', nome_cat:'Alimentação' },
  // Transporte
  { pattern:'UBER',          tipo:'despesa', nome_cat:'Transporte' },
  { pattern:'99 ',           tipo:'despesa', nome_cat:'Transporte' },
  { pattern:'CABIFY',        tipo:'despesa', nome_cat:'Transporte' },
  { pattern:'POSTO ',        tipo:'despesa', nome_cat:'Transporte' },
  { pattern:'COMBUSTIVEL',   tipo:'despesa', nome_cat:'Transporte' },
  { pattern:'GASOLINA',      tipo:'despesa', nome_cat:'Transporte' },
  { pattern:'ESTACIONAMENTO',tipo:'despesa', nome_cat:'Transporte' },
  { pattern:'PEDAGIO',       tipo:'despesa', nome_cat:'Transporte' },
  { pattern:'METRÔ',         tipo:'despesa', nome_cat:'Transporte' },
  { pattern:'METRO ',        tipo:'despesa', nome_cat:'Transporte' },
  // Assinaturas
  { pattern:'NETFLIX',       tipo:'despesa', nome_cat:'Assinaturas' },
  { pattern:'SPOTIFY',       tipo:'despesa', nome_cat:'Assinaturas' },
  { pattern:'AMAZON PRIME',  tipo:'despesa', nome_cat:'Assinaturas' },
  { pattern:'AMAZON*',       tipo:'despesa', nome_cat:'Assinaturas' },
  { pattern:'DISNEY',        tipo:'despesa', nome_cat:'Assinaturas' },
  { pattern:'HBO',           tipo:'despesa', nome_cat:'Assinaturas' },
  { pattern:'YOUTUBE',       tipo:'despesa', nome_cat:'Assinaturas' },
  { pattern:'APPLE',         tipo:'despesa', nome_cat:'Assinaturas' },
  { pattern:'GOOGLE ',       tipo:'despesa', nome_cat:'Assinaturas' },
  { pattern:'MICROSOFT',     tipo:'despesa', nome_cat:'Assinaturas' },
  { pattern:'DROPBOX',       tipo:'despesa', nome_cat:'Assinaturas' },
  // Saúde
  { pattern:'FARMACIA',      tipo:'despesa', nome_cat:'Saúde' },
  { pattern:'DROGASIL',      tipo:'despesa', nome_cat:'Saúde' },
  { pattern:'DROGA RAIA',    tipo:'despesa', nome_cat:'Saúde' },
  { pattern:'DROGARIA',      tipo:'despesa', nome_cat:'Saúde' },
  { pattern:'HOSPITAL',      tipo:'despesa', nome_cat:'Saúde' },
  { pattern:'CLINICA',       tipo:'despesa', nome_cat:'Saúde' },
  { pattern:'LABORATORIO',   tipo:'despesa', nome_cat:'Saúde' },
  { pattern:'PLANO DE SAUDE',tipo:'despesa', nome_cat:'Saúde' },
  { pattern:'UNIMED',        tipo:'despesa', nome_cat:'Saúde' },
  // Educação
  { pattern:'UDEMY',         tipo:'despesa', nome_cat:'Educação' },
  { pattern:'COURSERA',      tipo:'despesa', nome_cat:'Educação' },
  { pattern:'ALURA',         tipo:'despesa', nome_cat:'Educação' },
  { pattern:'ESCOLA',        tipo:'despesa', nome_cat:'Educação' },
  { pattern:'FACULDADE',     tipo:'despesa', nome_cat:'Educação' },
  { pattern:'UNIVERSIDADE',  tipo:'despesa', nome_cat:'Educação' },
  // Lazer
  { pattern:'CINEMA',        tipo:'despesa', nome_cat:'Lazer' },
  { pattern:'INGRESSO',      tipo:'despesa', nome_cat:'Lazer' },
  { pattern:'STEAM',         tipo:'despesa', nome_cat:'Lazer' },
  { pattern:'PLAYSTATION',   tipo:'despesa', nome_cat:'Lazer' },
  { pattern:'XBOX',          tipo:'despesa', nome_cat:'Lazer' },
  // Receitas comuns
  { pattern:'SALARIO',       tipo:'receita', nome_cat:'Salário' },
  { pattern:'SALÁRIO',       tipo:'receita', nome_cat:'Salário' },
  { pattern:'PAGAMENTO',     tipo:'receita', nome_cat:'Salário' },
  { pattern:'FGTS',          tipo:'receita', nome_cat:'Salário' },
  { pattern:'BONUS',         tipo:'receita', nome_cat:'Salário' },
  { pattern:'DIVIDENDO',     tipo:'receita', nome_cat:'Investimentos' },
  { pattern:'RENDIMENTO',    tipo:'receita', nome_cat:'Investimentos' },
  { pattern:'JUROS',         tipo:'receita', nome_cat:'Investimentos' },
  { pattern:'PIX RECEBIDO',  tipo:'receita', nome_cat:'Renda Extra' },
];

// ── Estado ────────────────────────────────────────────
let transacoesImportadas = [];
let contas = [];
let categorias = [];
let regrasUsuario = {}; // { pattern: category_id }

// ── Inicializar ───────────────────────────────────────
async function inicializar() {
  const [{ data: c }, { data: cat }, { data: regras }] = await Promise.all([
    supabase.from('accounts').select('id,nome,currency,saldo_atual').eq('user_id', user.id).eq('active', true),
    supabase.from('categories').select('id,nome,tipo,icon').eq('user_id', user.id).eq('ativo', true),
    supabase.from('category_rules').select('pattern,category_id,tipo').eq('user_id', user.id),
  ]);

  contas     = c   || [];
  categorias = cat || [];

  // Montar mapa de regras do usuário
  (regras||[]).forEach(r => { regrasUsuario[r.pattern] = r.category_id; });

  // Popular select de conta
  el('selectConta').innerHTML = '<option value="">Selecione a conta</option>' +
    contas.map(c => `<option value="${c.id}">${escapeHtml(c.nome)}</option>`).join('');
}

// ── Parsers ───────────────────────────────────────────

function parseOFX(conteudo) {
  const txs = [];
  const blocos = conteudo.match(/<STMTTRN>([\s\S]*?)<\/STMTTRN>/gi) || [];

  blocos.forEach(bloco => {
    const get = tag => {
      const m = bloco.match(new RegExp(`<${tag}>([^<\n\r]+)`, 'i'));
      return m ? m[1].trim() : '';
    };

    const trntype = get('TRNTYPE');
    const dtposted = get('DTPOSTED');
    const valor   = parseFloat(get('TRNAMT').replace(',', '.'));
    const memo    = get('MEMO') || get('NAME') || '';
    const fitid   = get('FITID');

    if(!dtposted || isNaN(valor)) return;

    // Converter data OFX (YYYYMMDD ou YYYYMMDDHHMMSS)
    const ano = dtposted.slice(0,4);
    const mes = dtposted.slice(4,6);
    const dia = dtposted.slice(6,8);
    const data = `${ano}-${mes}-${dia}`;

    const tipo = valor >= 0 ? 'receita' : 'despesa';

    txs.push({
      id_externo: fitid,
      data,
      descricao: limparDescricao(memo),
      valor: Math.abs(valor),
      tipo,
      categoria_id: null,
      categoria_nome: null,
    });
  });

  return txs;
}

function parseCSV(conteudo) {
  const txs = [];
  const linhas = conteudo.split('\n').map(l => l.trim()).filter(l => l);

  // Detectar separador
  const sep = linhas[0]?.includes(';') ? ';' : ',';

  // Pular cabeçalho
  const dados = linhas.slice(1);

  dados.forEach(linha => {
    const cols = linha.split(sep).map(c => c.replace(/^"|"$/g, '').trim());
    if(cols.length < 3) return;

    // Tentar detectar colunas automaticamente (Nubank, inter, bancos comuns)
    let data, descricao, valor, tipo;

    // Formato Nubank: Data, Descrição, Valor
    if(cols[0]?.match(/^\d{4}-\d{2}-\d{2}$/)) {
      data      = cols[0];
      descricao = cols[1] || '';
      valor     = parseFloat((cols[2] || '0').replace(',', '.').replace('R$', '').trim());
      tipo      = valor >= 0 ? 'receita' : 'despesa';
      valor     = Math.abs(valor);
    }
    // Formato DD/MM/YYYY
    else if(cols[0]?.match(/^\d{2}\/\d{2}\/\d{4}$/)) {
      const [d,m,a] = cols[0].split('/');
      data      = `${a}-${m}-${d}`;
      descricao = cols[1] || '';
      valor     = parseFloat((cols[2] || '0').replace(',', '.').replace('R$', '').trim());
      tipo      = valor >= 0 ? 'receita' : 'despesa';
      valor     = Math.abs(valor);
    } else return;

    if(!data || isNaN(valor) || !descricao) return;

    txs.push({
      id_externo: `${data}-${descricao}-${valor}`,
      data,
      descricao: limparDescricao(descricao),
      valor,
      tipo,
      categoria_id: null,
      categoria_nome: null,
    });
  });

  return txs;
}

function limparDescricao(desc) {
  return desc
    .replace(/\s+/g, ' ')
    .replace(/[*]{2,}/g, '*')
    .trim()
    .toUpperCase()
    .slice(0, 100);
}

// ── Categorização automática ──────────────────────────
function categorizarTransacao(tx) {
  const desc = tx.descricao.toUpperCase();

  // 1. Regras do usuário (aprendidas) — prioridade máxima
  for(const [pattern, catId] of Object.entries(regrasUsuario)) {
    if(desc.includes(pattern.toUpperCase())) {
      const cat = categorias.find(c => c.id === catId);
      if(cat) return { categoria_id: catId, categoria_nome: cat.nome, origem: 'aprendido' };
    }
  }

  // 2. Regras pré-definidas
  for(const regra of REGRAS_PADRAO) {
    if(desc.includes(regra.pattern.toUpperCase())) {
      // Buscar categoria do usuário pelo nome
      const cat = categorias.find(c =>
        c.nome.toLowerCase().includes(regra.nome_cat.toLowerCase()) &&
        (c.tipo === regra.tipo || c.tipo === 'despesa')
      );
      if(cat) return { categoria_id: cat.id, categoria_nome: cat.nome, origem: 'regra' };
    }
  }

  return { categoria_id: null, categoria_nome: null, origem: 'manual' };
}

// ── Upload de arquivo ─────────────────────────────────
el('inputArquivo').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if(!file) return;

  const contaConta = el('selectConta').value;
  if(!contaConta) {
    mostrarMsg('Selecione a conta antes de carregar o arquivo.', 'warning');
    el('inputArquivo').value = '';
    return;
  }

  el('loadingImport').style.display = 'flex';
  el('tabelaPreview').style.display = 'none';
  el('secaoRevisao').style.display  = 'none';

  try {
    const conteudo = await file.text();
    const ext = file.name.split('.').pop().toLowerCase();

    let txs = [];
    if(ext === 'ofx' || ext === 'qfx') {
      txs = parseOFX(conteudo);
    } else if(ext === 'csv') {
      txs = parseCSV(conteudo);
    } else {
      mostrarMsg('Formato não suportado. Use OFX ou CSV.', 'danger');
      return;
    }

    if(!txs.length) {
      mostrarMsg('Nenhuma transação encontrada no arquivo.', 'warning');
      return;
    }

    // Categorizar automaticamente
    transacoesImportadas = txs.map(tx => {
      const cat = categorizarTransacao(tx);
      return { ...tx, ...cat };
    });

    renderTabela();
    el('secaoRevisao').style.display = 'block';
    mostrarMsg(`${txs.length} transações encontradas. Revise as categorias antes de importar.`, 'info');

  } catch(err) {
    mostrarMsg('Erro ao processar arquivo: ' + err.message, 'danger');
  } finally {
    el('loadingImport').style.display = 'none';
  }
});

// ── Renderizar tabela de preview ──────────────────────
function renderTabela() {
  const tbody = el('tbodyPreview');

  const reconhecidas  = transacoesImportadas.filter(t => t.categoria_id).length;
  const naoReconhecidas = transacoesImportadas.length - reconhecidas;

  el('statsImport').innerHTML = `
    <span style="color:var(--success)">${reconhecidas} categorizadas automaticamente</span>
    ${naoReconhecidas > 0 ? `<span style="color:var(--warning)">${naoReconhecidas} precisam de categoria</span>` : ''}
  `;

  tbody.innerHTML = transacoesImportadas.map((tx, i) => `
    <tr id="row-${i}" class="${tx.origem === 'manual' ? 'row-manual' : ''}">
      <td>
        <input type="checkbox" class="tx-check" data-idx="${i}" checked
          style="width:16px;height:16px;cursor:pointer">
      </td>
      <td style="white-space:nowrap;font-size:12px">${tx.data.split('-').reverse().join('/')}</td>
      <td style="font-size:12px;max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"
        title="${tx.descricao}">${tx.descricao}</td>
      <td>
        <span class="badge ${tx.tipo==='receita'?'success':'danger'}" style="font-size:10px">${tx.tipo}</span>
      </td>
      <td class="money ${tx.tipo==='receita'?'positive':'negative'}" style="font-size:13px;font-weight:700">
        ${tx.tipo==='receita'?'+':'-'}${fmt(tx.valor)}
      </td>
      <td>
        <select class="cat-select" data-idx="${i}"
          style="font-size:12px;padding:4px 8px;border:1px solid var(--border);border-radius:6px;
            background:var(--surface);color:var(--text);width:100%;max-width:180px;
            ${!tx.categoria_id ? 'border-color:var(--warning)' : ''}">
          <option value="">— Sem categoria —</option>
          ${categorias
            .filter(c => c.tipo === tx.tipo || c.tipo === 'despesa')
            .map(c => `<option value="${c.id}" ${c.id === tx.categoria_id ? 'selected' : ''}>${escapeHtml(c.icon||'')} ${escapeHtml(c.nome)}</option>`)
            .join('')}
        </select>
      </td>
      <td style="font-size:10px;color:var(--muted)">
        ${tx.origem === 'aprendido'
          ? '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3c.6 2.8 1.8 4.6 4 5.5-2.2.9-3.4 2.7-4 5.5-.6-2.8-1.8-4.6-4-5.5 2.2-.9 3.4-2.7 4-5.5z"/></svg>'
          : tx.origem === 'regra'
          ? '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M9 3h6v3H9z"/><line x1="8" y1="11" x2="16" y2="11"/><line x1="8" y1="15" x2="16" y2="15"/></svg>'
          : '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>'}
      </td>
    </tr>
  `).join('');

  el('tabelaPreview').style.display = 'table';

  // Eventos dos selects de categoria
  document.querySelectorAll('.cat-select').forEach(sel => {
    sel.addEventListener('change', (e) => {
      const i = parseInt(e.target.dataset.idx);
      transacoesImportadas[i].categoria_id = e.target.value || null;
      const cat = categorias.find(c => c.id === e.target.value);
      transacoesImportadas[i].categoria_nome = cat?.nome || null;
      // Remover destaque amarelo
      e.target.style.borderColor = '';
    });
  });

  // Checkbox selecionar tudo
  el('checkAll').addEventListener('change', (e) => {
    document.querySelectorAll('.tx-check').forEach(cb => { cb.checked = e.target.checked; });
  });
}

// ── Confirmar importação ──────────────────────────────
el('btnImportar').addEventListener('click', async () => {
  const contaId = el('selectConta').value;
  if(!contaId) { mostrarMsg('Selecione a conta.', 'warning'); return; }

  // Pegar apenas as marcadas
  const selecionadas = [];
  document.querySelectorAll('.tx-check:checked').forEach(cb => {
    selecionadas.push(transacoesImportadas[parseInt(cb.dataset.idx)]);
  });

  if(!selecionadas.length) { mostrarMsg('Nenhuma transação selecionada.', 'warning'); return; }

  el('btnImportar').disabled = true;
  el('btnImportar').textContent = 'Importando...';

  try {
    // 1. Inserir transações
    const registros = selecionadas.map(tx => ({
      user_id:     user.id,
      account_id:  contaId,
      category_id: tx.categoria_id || null,
      type:        tx.tipo,
      amount:      tx.valor,
      description: tx.descricao,
      date:        tx.data,
      status:      'pago',
      is_recurring: false,
    }));

    const { error } = await supabase.from('transactions').insert(registros);
    if(error) throw new Error(error.message);

    // 2. Aprender novas regras — salvar categorias que o usuário definiu
    const novasRegras = [];
    selecionadas.forEach(tx => {
      if(!tx.categoria_id) return;
      // Extrair palavra-chave principal da descrição (primeiras 2 palavras)
      const palavras = tx.descricao.split(' ').slice(0,2).join(' ');
      if(palavras.length < 3) return;
      novasRegras.push({
        user_id:     user.id,
        pattern:     palavras,
        category_id: tx.categoria_id,
        tipo:        tx.tipo,
      });
    });

    if(novasRegras.length) {
      await supabase.from('category_rules').upsert(novasRegras, {
        onConflict: 'user_id,pattern',
        ignoreDuplicates: false,
      });
      // Atualizar mapa local
      novasRegras.forEach(r => { regrasUsuario[r.pattern] = r.category_id; });
    }

    // 3. Atualizar saldo da conta
    const { data: conta } = await supabase.from('accounts').select('saldo_atual').eq('id', contaId).single();
    if(conta) {
      const delta = selecionadas.reduce((s, tx) =>
        s + (tx.tipo === 'receita' ? tx.valor : -tx.valor), 0);
      await supabase.from('accounts').update({
        saldo_atual: Number(conta.saldo_atual||0) + delta
      }).eq('id', contaId);
    }

    mostrarMsg(`${selecionadas.length} transações importadas com sucesso! ${novasRegras.length} regras aprendidas.`, 'success');
    el('secaoRevisao').style.display = 'none';
    el('inputArquivo').value = '';
    transacoesImportadas = [];

  } catch(err) {
    mostrarMsg('Erro ao importar: ' + err.message, 'danger');
  } finally {
    el('btnImportar').disabled = false;
    el('btnImportar').innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;margin-right:5px"><circle cx="12" cy="12" r="9"/><polyline points="8,12.5 11,15.5 16,9"/></svg>Confirmar importação';
  }
});

// ── Cancelar ──────────────────────────────────────────
el('btnCancelar').addEventListener('click', () => {
  el('secaoRevisao').style.display = 'none';
  el('inputArquivo').value = '';
  transacoesImportadas = [];
  mostrarMsg('', '');
});

// ── Helpers ───────────────────────────────────────────
function mostrarMsg(texto, tipo) {
  const m = el('msgImport');
  m.className = `message ${tipo}`;
  m.textContent = texto;
}

// ── Inicializar ───────────────────────────────────────
await inicializar();
