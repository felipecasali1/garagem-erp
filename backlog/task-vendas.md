## Task - Consolidar fluxo real de vendas

### Objetivo

Consolidar o fluxo real de venda usando clientes, funcionários e veículos persistidos, fechando a saída do estoque e alimentando financeiro/comissões.

### Contexto

A tela de venda já está persistida no Supabase. O banco possui tabelas `sales`, `sale_payments`, `installments`, `commissions` e vínculos financeiros, e o fluxo principal já funciona sem mocks.

O sistema agora já possui o fluxo anterior necessário:

- veículo nasce como avaliação;
- compra conclui a entrada no estoque;
- checklist/preparação libera veículo para `Disponível`;
- veículo disponível pode ser publicado;
- compra concluída já gera despesa financeira.

A venda deve partir apenas de veículos realmente disponíveis, clientes ativos e vendedores ativos.

### O que já foi construído

- Nova venda usa dados reais do Supabase.
- Nova venda lista apenas veículos `available`, clientes ativos e vendedores ativos.
- Venda pode nascer como `pending` ou `completed`.
- Venda `pending` reserva o veículo.
- Venda `completed` vende o veículo, despublica e gera financeiro.
- Cancelamento de venda pendente devolve o veículo para `available`.
- Pagamento contextual inicial já funciona para:
  - à vista;
  - PIX;
  - cartão;
  - financiamento com entrada e saldo de repasse.
- Venda concluída gera:
  - receita paga ou pendente conforme forma de pagamento;
  - comissão rastreável;
  - despesa financeira de comissão com baixa manual posterior.
- Listagem de vendas e detalhe de venda usam Supabase.
- Detalhe da venda já mostra comissão real.
- Detalhe do veículo já possui atalho para iniciar nova venda com o veículo pré-selecionado.

### Regras de negócio

- Venda não deve ser apagada fisicamente.
- Venda cancelada deve permanecer no histórico.
- Veículo vendido não deve aparecer como disponível em novas vendas.
- Veículo em avaliação, preparação, reservado, vendido ou arquivado não pode ser vendido.
- Cliente arquivado não deve aparecer em nova venda.
- Funcionário inativo não deve aparecer como vendedor em nova venda.
- Venda concluída deve marcar o veículo como `sold` e `published: false`.
- Venda pendente representa uma reserva: já existe um possível cliente vinculado e um valor final de venda definido.
- Venda pendente deve marcar o veículo como `reserved` e impedir que ele apareça em novas vendas.
- Status de veículo deve ser controlado pelos fluxos do sistema; no formulário de veículo, apenas arquivamento pode alterar status manualmente.
- Venda pendente não deve gerar financeiro/comissão até ser concluída.
- Venda pendente cancelada deve voltar o veículo para `available` e manter `published: false`.
- Venda cancelada não deve contar como receita concluída.
- Comissão deve ser rastreável e vinculada à venda, vendedor e veículo.
- Comissão deve ser calculada sobre o valor final da venda por enquanto.
- Forma de pagamento deve controlar quais campos aparecem e quais valores são gravados.
- Status do pagamento deve ser calculado pelo sistema, não editado diretamente no formulário.
- À vista, PIX e cartão devem nascer como pagamento quitado nesta primeira versão.
- Financiamento pode nascer como pendente, parcial ou quitado conforme a entrada registrada.
- Financiamento deve registrar entrada e saldo financiado/repasse, mas ainda não deve gerar parcelas internas.
- Ao concluir venda financiada com entrada, o financeiro deve separar receita paga da entrada e receita pendente do repasse.
- Ao concluir venda financiada sem entrada, o financeiro deve gerar apenas receita pendente do repasse.
- Troca como forma de pagamento fica fora da primeira entrega até existir o fluxo do veículo recebido.

### Regras confirmadas do fluxo atual

- O fluxo inicial segue sem troca.
- O valor definitivo da venda é definido apenas na venda.
- O valor estimado do veículo serve como referência operacional, não como fechamento automático.
- O status do pagamento continua sendo calculado pelo sistema.
- O status do veículo continua sendo controlado pelo fluxo, não por edição manual.
- Veículo vendido continua bloqueado para edição operacional e checklist.

### Pontos futuros

- Permitir veículo usado como parte de pagamento.
- Definir se a troca cria automaticamente:
  - uma avaliação de veículo;
  - uma compra vinculada;
  - ou apenas um registro pendente para avaliação posterior.
- Garantir que a troca não distorça margem, estoque e financeiro.
- Construir crediário próprio e parcelas internas somente se a loja realmente precisar vender parcelado diretamente ao cliente.
- Exibir vínculo da venda no detalhe do veículo.
- Exibir histórico consolidado por cliente e por funcionário quando isso virar prioridade.

### Decisões definidas

- Venda `pending` deve reservar o veículo.
- Venda `completed` deve vender o veículo.
- Venda `canceled` deve liberar o veículo se ele estava apenas reservado.
- Comissão deve começar usando a regra atual do funcionário:
  - percentual sobre valor final da venda; ou
  - valor fixo, conforme cadastro.
- Comissão nasce como `pending`.
- Troca fica fora da primeira entrega.
- Venda concluída pode ter pagamento pendente/parcial quando a forma for financiamento.
- Parcelas internas não devem ser geradas na primeira versão.

### Status atual

Concluída por enquanto para o fluxo principal. Manter este arquivo como referência de regras e usar os pontos futuros apenas quando a prioridade sair de financeiro/painel e entrar em expansão do comercial.
