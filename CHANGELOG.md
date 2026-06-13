# FinZen Changelog

## 9.4.3.4 - Padronização da Sidebar
- Corrigido carregamento da navegação unificada no Dashboard.
- Adicionado `navigation.css` ao Dashboard.
- Reforçados estilos da sidebar no `navigation.js` para evitar menu desalinhado quando cache ou CSS falhar.
- Nenhuma alteração de banco de dados.

## 9.4.4A - Conversão cambial em corretoras
- Criada tabela `exchange_transactions`.
- Criada função SQL `create_currency_exchange` para conversão atômica entre contas BRL e USD.
- Adicionada tela de conversão cambial em Transferências.
- Conversão debita a conta de origem, credita a conta de destino e registra histórico auditável.
- Taxa de câmbio é informada manualmente no momento da conversão.
