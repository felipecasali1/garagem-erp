## Task - Integrar financeiro aos fluxos reais

### Objetivo

Transformar o financeiro em reflexo dos fluxos reais do sistema, reduzindo dados mock/demo e usando compras/vendas como origem principal dos lançamentos.

### Contexto

O módulo financeiro já possui telas, KPIs e ações rápidas, mas ainda usa muitos dados demonstrativos.

Compras concluídas já geram despesa financeira real. Vendas concluídas já geram receita e comissão, mas o financeiro ainda precisa amadurecer baixa de recebimentos, contas pendentes, comissões e relatórios.

### Escopo

- Persistir transações financeiras em Supabase.
- Criar serviço real para listar transações financeiras. Concluído.
- Trocar `/financial/transactions` para consumir `financial_transactions`. Concluído.
- Trocar `/financial/transactions/$id` para detalhe real da transação. Concluído.
- Permitir marcar transação pendente como paga. Concluído.
- Trocar `/financial/bills` para listar contas a pagar reais. Concluído.
- Revisar/validar despesa gerada ao concluir compra.
- Gerar receita/contas a receber ao concluir venda.
- Tratar financiamento como receita pendente/parcial conforme entrada e saldo de repasse.
- Deixar parcelas internas para uma etapa futura de crediário próprio.
- Gerar comissão a pagar para vendedor quando aplicável.
- Permitir lançamentos manuais de receita/despesa/custo fixo. Concluído nas ações rápidas.
- Permitir registrar pagamento de salário com funcionário real. Concluído nas ações rápidas.
- Revisar contas a pagar. Concluído em `/financial/bills`.
- Revisar contas a receber. Concluído em `/financial/receivables`.
- Revisar KPIs do dashboard financeiro. Parcialmente concluído em `/financial`.

### Regras de negócio

- Transação financeira não deve ser apagada fisicamente.
- Transação incorreta deve ser cancelada/estornada, preservando histórico.
- Valores financeiros devem ter vínculo com compra, venda, comissão ou lançamento manual.
- Parcelas vencidas devem ser calculadas com base em data de vencimento e status.
- À vista, PIX e cartão em venda devem gerar receita paga.
- Financiamento em venda deve gerar receita paga para a entrada e receita pendente para o saldo de repasse.
- Parcelas internas só devem existir quando houver fluxo de crediário próprio.

### Decisões pendentes

- Teremos estorno explícito ou apenas status `canceled`?
- Comissões serão pagas manualmente ou automaticamente após venda concluída?
- Salário de funcionário será parte do financeiro nesta etapa ou depois?

### Fora do escopo por enquanto

- Crediário próprio.
- Parcelas internas para vendas financiadas por banco/financeira.
- Recorrência automática de custos fixos.
- Parcelamento manual de despesas.
- Troca como forma de pagamento.

### Ordem de construção

1. Serviço real de transações financeiras. Concluído.
2. Listagem real em `/financial/transactions`. Concluído.
3. Detalhe real em `/financial/transactions/$id`. Concluído.
4. Baixa manual de transação pendente. Concluído.
5. KPIs reais em `/financial`. Parcialmente concluído.
6. Contas a pagar reais em `/financial/bills`. Concluído.
7. Contas a receber reais em `/financial/receivables`. Concluído.
8. Lançamentos manuais pelas ações rápidas. Concluído.

### Critérios de aceite

- Financeiro deixa de depender majoritariamente de mocks.
- `/financial/transactions` lista dados reais do Supabase.
- `/financial/transactions/$id` mostra dados reais do Supabase.
- `/financial/bills` lista despesas reais do Supabase e permite baixa manual.
- `/financial/receivables` lista receitas reais do Supabase e permite baixa manual.
- Compras concluídas geram despesa financeira.
- Vendas concluídas geram receita/contas a receber.
- Receitas de venda respeitam a forma de pagamento.
- Venda financiada com entrada separa caixa recebido de saldo a receber.
- Visão geral financeira calcula KPIs a partir de transações reais.
- Ações rápidas criam lançamentos reais no Supabase.
- Pagamento de salário usa funcionários ativos reais.
- Parcelas vencidas são calculadas a partir de dados reais quando o fluxo de crediário próprio existir.
- KPIs usam dados persistidos.
- Nenhuma transação é excluída fisicamente.
