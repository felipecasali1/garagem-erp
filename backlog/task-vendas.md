## Task - Construir fluxo real de vendas

### Objetivo

Construir o fluxo real de venda usando clientes, funcionários e veículos persistidos.

### Contexto

A tela de venda existe, mas ainda usa dados mock/demo. O fluxo precisa passar a consumir o estoque real e gerar efeitos no veículo, comissões e financeiro.

### Escopo

- Listar veículos disponíveis para venda a partir do Supabase.
- Listar clientes ativos a partir do Supabase.
- Listar vendedores/funcionários ativos a partir do Supabase.
- Registrar venda persistida.
- Atualizar veículo para `sold` após venda concluída.
- Registrar forma de pagamento:
  - à vista
  - financiamento
  - cartão
  - pix
  - troca
- Registrar entrada, parcelas e saldo restante quando aplicável.
- Calcular comissão do vendedor.
- Gerar lançamentos financeiros relacionados à venda.

### Regras de negócio

- Venda não deve ser apagada fisicamente.
- Venda cancelada deve permanecer no histórico.
- Veículo vendido não deve aparecer como disponível em novas vendas.
- Cliente arquivado não deve ser usado em nova venda.
- Funcionário inativo não deve ser usado como vendedor em nova venda.
- A comissão deve considerar o vendedor vinculado e a regra de comissão vigente.

### Decisões pendentes

- Venda pendente deve reservar o veículo?
- Cancelar venda deve voltar veículo para disponível ou reservado?
- Troca deve criar uma compra automaticamente para o veículo recebido?
- Comissão é calculada sobre valor total, lucro ou regra configurável?

### Critérios de aceite

- Venda é persistida em Supabase.
- Venda concluída atualiza status do veículo.
- Venda gera registros financeiros esperados.
- Comissão é registrada ou calculada de forma rastreável.
- Não existe exclusão física de venda.
