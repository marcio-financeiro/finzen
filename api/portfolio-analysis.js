// api/portfolio-analysis.js — Comitê de Investimentos FinZen
// POST /api/portfolio-analysis

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', 'https://finzen-rho.vercel.app');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-finzen-secret');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const secret = req.headers['x-finzen-secret'];
  if (!secret || secret !== process.env.FINZEN_SECRET) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  try {
    const { carteira } = req.body;
    if (!carteira || !carteira.ativos?.length) {
      return res.status(400).json({ error: 'carteira é obrigatório' });
    }

    const hoje = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

    const ativosStr = carteira.ativos.map(a =>
      `${a.ticker} | ${a.classe} | ${a.nome || ''} | Qtd: ${a.quantidade} | PM: R$${a.preco_medio} | Atual: R$${a.cotacao_atual} | Valor: R$${a.valor_atual_brl} | Peso: ${a.peso_pct}% | Rent: ${a.rent_pct}% | Moeda: ${a.moeda}`
    ).join('\n');

    const distStr = Object.entries(carteira.dist_classe)
      .map(([k, v]) => `${k}: R$${v.valor.toFixed(0)} (${v.pct.toFixed(1)}%)`)
      .join('\n');

    const prompt = `Você é o Comitê de Investimentos pessoal do Márcio, um profissional offshore brasileiro.
Hoje é ${hoje}. Dólar atual: R$ ${carteira.dolar}.

CARTEIRA COMPLETA — Patrimônio Total: R$ ${carteira.patrimonio_total.toFixed(0)}
(${carteira.total_brl_brl.toFixed(0)} em BRL + ${carteira.total_brl_usd.toFixed(0)} equivalente em USD)

ATIVOS (Ticker | Classe | Nome | Qtd | Preço Médio | Cotação Atual | Valor Atual | Peso | Rentabilidade | Moeda):
${ativosStr}

DISTRIBUIÇÃO POR CLASSE:
${distStr}

Produza uma análise completa do Comitê de Investimentos em português, estruturada EXATAMENTE assim (use os títulos e emojis indicados):

## 📊 DISTRIBUIÇÃO DA CARTEIRA
Tabela com: Classe | Valor (R$) | Peso (%) | Avaliação
Inclua avaliação de cada classe (concentração, adequação ao perfil).
Adicione análise de exposição por moeda (BRL vs USD), geografia (BR vs EUA) e tipo de receita (dividendos/crescimento/renda fixa).

## 🎯 DIAGNÓSTICO — NOTAS DA CARTEIRA
Para cada dimensão, dê uma nota de 0-100 e um comentário de 1 linha:
- Diversificação
- Concentração (inversa — 100 = sem concentração excessiva)
- Qualidade dos ativos
- Segurança / Proteção
- Crescimento
- Dividendos / Renda Passiva
- Gestão de Risco
- Eficiência Patrimonial

## ⭐ SCORE GERAL DA CARTEIRA
Score: XX/100
Classificação: [Institucional (90+) / Excelente (80-89) / Muito Boa (70-79) / Boa (60-69) / Regular (50-59) / Necessita Reestruturação (<50)]
Justificativa em 2-3 linhas.

## 🚨 ALERTAS E PONTOS DE ATENÇÃO
Liste os riscos e concentrações detectadas (concentração excessiva em ativo/setor, dependência de dividendos de poucas empresas, exposição cambial, falta de diversificação etc.).

## 🏆 RANKING — 5 MELHORES DESTINOS PARA O PRÓXIMO APORTE
Para cada ativo/classe, informe: Por que aportar agora? Peso atual vs ideal estimado.

## ⚖️ REBALANCEAMENTO SUGERIDO
Ativos acima do peso ideal → reduzir aportes (não necessariamente vender).
Ativos abaixo do peso ideal → priorizar aportes.
Priorize novos aportes em vez de vendas.

## 📈 PROJEÇÃO PATRIMONIAL
Premissas: rendimento médio anual estimado, taxa de aporte mensal estimada.
Projeção em: 5 anos | 10 anos | 20 anos | 30 anos.

## 📋 PARECER DO COMITÊ DE INVESTIMENTOS
Decisão Final: [Manter / Aportar / Rebalancear / Reestruturar]
Justificativa:
Nível de Convicção: [Alta / Média / Baixa]
Principais Riscos:
Principais Oportunidades:
Plano de Ação:
Probabilidade de sucesso no longo prazo:
Gatilhos de revisão:
Eventos que invalidariam a tese:`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 4096,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      return res.status(response.status).json({ error: err });
    }

    const data = await response.json();
    const analise = data.content?.[0]?.text || '';

    return res.status(200).json({ analise });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
