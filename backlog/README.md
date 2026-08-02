## Backlog GaragemERP

Este backlog organiza os próximos passos por fluxo de negócio. A ideia é manter aqui apenas o que orienta construção futura ou estabilização relevante.

### Estado atual resumido

- Funcionários: funcional por enquanto, com cadastro operacional separado do acesso ao sistema.
- Clientes: funcional por enquanto, com cadastro persistido e reaproveitamento de pessoa por documento.
- Fornecedores: funcional por enquanto, como papel separado da mesma base `people`.
- Veículos: funcional como avaliação/prospecção e estoque, com status de avaliação, preparação, disponibilidade, venda e arquivamento.
- Compras: fluxo real construído. Compra usa fornecedores reais, vincula veículo em avaliação, conclui/cancela compra e gera despesa financeira ao concluir.
- Preparação/checklist: fluxo operacional construído. Veículo em preparação só pode virar disponível quando não há checklist ativo pendente.
- Vendas: fluxo real em construção, com veículos/clientes/vendedores reais, reserva, conclusão, cancelamento e pagamento contextual inicial.
- Financeiro: já recebe despesa de compra concluída e receita/comissão de venda concluída, mas ainda precisa amadurecer baixa, comissões, crediário próprio e relatórios.
- Dashboard/relatórios: parcialmente real, ainda precisa consolidar métricas depois de vendas e financeiro.
- Configurações: possui task própria em `task-configuracoes.md`.

### Próxima grande etapa

1. `task-financeiro.md`
2. `task-vendas.md`
3. `task-dashboard-e-relatorios.md`
4. `task-cadastros-base.md`
5. `task-configuracoes.md`

### Fluxos concluídos ou em estabilização

- `task-veiculos-como-estoque.md`
- `task-compras-e-fornecedores.md`
- `task-preparacao-veiculo.md`

Esses arquivos permanecem como referência de regra de negócio e pontos de estabilização, mas não são mais o foco principal de construção.

### Regra importante

Entidades operacionais não devem ser apagadas fisicamente. Clientes, fornecedores, funcionários, veículos, compras, vendas, transações e checklists devem ser preservados para histórico, cálculo, financeiro e auditoria.

A única exclusão física permitida no sistema deve ser a remoção do acesso de usuário. A exceção operacional já definida é item de checklist cancelado, que pode ser removido quando representar erro de cadastro; item concluído não deve ser apagado.
