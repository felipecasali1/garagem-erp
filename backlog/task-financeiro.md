## Task - Integrar financeiro aos fluxos reais

### Objetivo

Transformar o financeiro em reflexo dos fluxos reais do sistema, reduzindo dados mock/demo.

### Contexto

O módulo financeiro já possui telas, KPIs e ações rápidas, mas ainda usa muitos dados demonstrativos. Ele deve passar a ser alimentado por compras, vendas, comissões, salários, custos fixos e despesas operacionais.

### Escopo

- Persistir transações financeiras em Supabase.
- Gerar despesa ao concluir compra.
- Gerar receita/contas a receber ao concluir venda.
- Gerar parcelas quando venda for parcelada.
- Gerar comissão a pagar para vendedor quando aplicável.
- Permitir lançamentos manuais de receita/despesa/custo fixo.
- Revisar contas a pagar.
- Revisar KPIs do dashboard financeiro.

### Regras de negócio

- Transação financeira não deve ser apagada fisicamente.
- Transação incorreta deve ser cancelada/estornada, preservando histórico.
- Valores financeiros devem ter vínculo com compra, venda, comissão ou lançamento manual.
- Parcelas vencidas devem ser calculadas com base em data de vencimento e status.

### Decisões pendentes

- Teremos estorno explícito ou apenas status `canceled`?
- Comissões serão pagas manualmente ou automaticamente após venda concluída?
- Salário de funcionário será parte do financeiro nesta etapa ou depois?

### Critérios de aceite

- Financeiro deixa de depender majoritariamente de mocks.
- Compras e vendas concluídas geram impacto financeiro.
- Parcelas vencidas são calculadas a partir de dados reais.
- KPIs usam dados persistidos.
- Nenhuma transação é excluída fisicamente.
