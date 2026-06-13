# FinZen Changelog

## 9.4.3.3 - Consolidação Arquitetural
- Criada pasta `js/services/`.
- Centralizadas funções financeiras em `financeService.js`.
- Centralizadas regras de contas em `accountService.js`.
- Centralizadas regras de transferências em `transferService.js`.
- Centralizadas regras de investimentos em `investmentService.js`.
- `transfers.js` passou a chamar serviços em vez de acessar RPCs diretamente.
- `investments.js` passou a usar serviços para dólar, corretoras, posições e exclusão lógica.
- `utils.js` passou a reexportar `formatCurrency` a partir do serviço financeiro.
- Dashboard padronizado para carregar `navigation.js`.

## 9.4.3.2
- Correções em investimentos, corretoras e ativos em dólar.

## Cleanup
- Remoção de arquivos legados e páginas duplicadas.
