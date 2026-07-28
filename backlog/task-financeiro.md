## Task - Integrar financeiro aos fluxos reais

### Objetivo

Transformar o financeiro em reflexo dos fluxos reais do sistema, reduzindo dados mock/demo e usando compras/vendas como origem principal dos lançamentos.

### Contexto

O módulo financeiro já possui telas, KPIs e ações rápidas, mas ainda usa muitos dados demonstrativos.

Compras concluídas já geram despesa financeira real. Vendas concluídas já geram receita e comissão, mas o financeiro ainda precisa amadurecer baixa de recebimentos, contas pendentes, comissões e relatórios.

### Escopo

- Persistir transações financeiras em Supabase.
- Revisar/validar despesa gerada ao concluir compra.
- Gerar receita/contas a receber ao concluir venda.
- Tratar financiamento como receita pendente/parcial conforme entrada e saldo de repasse.
- Deixar parcelas internas para uma etapa futura de crediário próprio.
- Gerar comissão a pagar para vendedor quando aplicável.
- Permitir lançamentos manuais de receita/despesa/custo fixo.
- Revisar contas a pagar.
- Revisar KPIs do dashboard financeiro.

### Regras de negócio

- Transação financeira não deve ser apagada fisicamente.
- Transação incorreta deve ser cancelada/estornada, preservando histórico.
- Valores financeiros devem ter vínculo com compra, venda, comissão ou lançamento manual.
- Parcelas vencidas devem ser calculadas com base em data de vencimento e status.
- À vista, PIX e cartão em venda devem gerar receita paga.
- Financiamento em venda deve gerar receita pendente quando houver saldo restante.
- Parcelas internas só devem existir quando houver fluxo de crediário próprio.

### Decisões pendentes

- Teremos estorno explícito ou apenas status `canceled`?
- Comissões serão pagas manualmente ou automaticamente após venda concluída?
- Salário de funcionário será parte do financeiro nesta etapa ou depois?
- Crediário próprio será necessário para a loja ou financiamento bancário cobre o parcelamento?

### Critérios de aceite

- Financeiro deixa de depender majoritariamente de mocks.
- Compras concluídas geram despesa financeira.
- Vendas concluídas geram receita/contas a receber.
- Receitas de venda respeitam a forma de pagamento.
- Parcelas vencidas são calculadas a partir de dados reais quando o fluxo de crediário próprio existir.
- KPIs usam dados persistidos.
- Nenhuma transação é excluída fisicamente.
