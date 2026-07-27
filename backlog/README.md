## Backlog GaragemERP

Este backlog organiza os próximos passos do sistema por fluxo de negócio, não apenas por tela.

### Estado atual resumido

- Funcionários: funcional por enquanto, com cadastro operacional separado do acesso ao sistema.
- Clientes: funcional por enquanto, com cadastro persistido e reaproveitamento de pessoa por documento.
- Veículos: parcialmente funcional. O sistema deve permitir cadastro básico para avaliação/checklist antes da compra ser concluída, mas a entrada definitiva no estoque financeiro deve acontecer quando a compra for registrada/concluída.
- Compras: ainda precisa ser construída como fluxo real persistido.
- Vendas: ainda depende de estoque real disponível e deve gerar efeitos financeiros.
- Financeiro: ainda usa muito dado demonstrativo e precisa ser alimentado por compras, vendas, comissões e lançamentos manuais.
- Configurações: possui task própria em `task-configuracoes.md`.

### Ordem sugerida

1. `task-veiculos-como-estoque.md`
2. `task-preparacao-veiculo.md`
3. `task-compras-e-fornecedores.md`
4. `task-vendas.md`
5. `task-financeiro.md`
6. `task-dashboard-e-relatorios.md`
7. `task-cadastros-base.md`

### Regra importante

Entidades operacionais não devem ser apagadas fisicamente. Clientes, fornecedores, funcionários, veículos, compras, vendas, transações e checklists devem ser preservados para histórico, cálculo, financeiro e auditoria. A única exclusão física permitida no sistema deve ser a remoção do acesso de usuário.
