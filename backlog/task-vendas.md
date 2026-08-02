## Task - Construir fluxo real de vendas

### Objetivo

Construir o fluxo real de venda usando clientes, funcionários e veículos persistidos, fechando a saída do estoque e alimentando financeiro/comissões.

### Contexto

A tela de venda existe, mas ainda usa dados mock/demo. O banco já possui tabelas para `sales`, `sale_payments`, `installments`, `commissions` e vínculos financeiros.

O sistema agora já possui o fluxo anterior necessário:

- veículo nasce como avaliação;
- compra conclui a entrada no estoque;
- checklist/preparação libera veículo para `Disponível`;
- veículo disponível pode ser publicado;
- compra concluída já gera despesa financeira.

A venda deve partir apenas de veículos realmente disponíveis, clientes ativos e vendedores ativos.

### Escopo da primeira entrega

- Trocar mocks da tela de nova venda por dados reais do Supabase.
- Listar apenas veículos com status `available`.
- Listar apenas clientes ativos.
- Listar apenas funcionários/vendedores ativos.
- Registrar venda persistida em `sales`.
- Registrar pagamento em `sale_payments`.
- Ao concluir venda:
  - atualizar veículo para `sold`;
  - despublicar veículo;
  - gerar receita ou conta a receber no financeiro;
  - gerar comissão do vendedor, quando aplicável.
- Criar listagem real de vendas.
- Criar detalhe real de venda.
- Remover dependência dos mocks no fluxo principal de vendas.

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

### Fase 1 - Venda simples persistida

Construir primeiro o fluxo sem troca de veículo:

- Selecionar veículo disponível.
- Selecionar cliente ativo.
- Selecionar vendedor ativo.
- Informar desconto, data e observações.
- Informar forma de pagamento.
- Calcular status do pagamento automaticamente conforme a forma escolhida, sem exibir campo editável para o usuário.
- Salvar venda como `pending` ou `completed`.
- Se `pending`, marcar veículo como reservado para o cliente escolhido.
- Se `completed`, marcar veículo como vendido e gerar financeiro/comissão.
- Permitir concluir ou cancelar uma venda pendente pela tela de detalhe.

### Fase 2 - Pagamento contextual

Regras da primeira versão:

- À vista:
  - não exibir entrada;
  - não exibir parcelas;
  - status do pagamento: quitado internamente;
  - financeiro: receita paga.
- PIX:
  - não exibir entrada;
  - não exibir parcelas;
  - status do pagamento: quitado internamente;
  - financeiro: receita paga.
- Cartão:
  - não exibir entrada;
  - não exibir parcelas internas;
  - status do pagamento: quitado internamente;
  - financeiro: receita paga.
- Financiamento:
  - exibir entrada;
  - não exibir quantidade de parcelas nesta fase;
  - status do pagamento:
    - sem entrada: pendente;
    - com entrada menor que o total: parcial;
      - entrada igual ao total: quitado;
  - financeiro:
    - entrada registrada como receita paga;
    - saldo financiado/repasse registrado como receita pendente.
- Troca + diferença:
  - não exibir na primeira versão;
  - construir depois junto com o fluxo de recebimento do veículo da troca.

### Fase 3 - Crediário próprio e parcelas internas

Construir somente se a loja precisar vender parcelado diretamente para o cliente:

- Adicionar forma de pagamento específica para crediário próprio, se necessário.
- Exibir entrada e quantidade de parcelas apenas para esse caso.
- Gerar parcelas na tabela `installments`.
- Parcelas devem nascer como `pending`.
- Baixa de parcelas deve ser feita pelo financeiro.

### Fase 4 - Troca

Construir depois da venda simples estar estável:

- Permitir veículo usado como parte de pagamento.
- Definir se a troca cria automaticamente:
  - uma avaliação de veículo;
  - uma compra vinculada;
  - ou apenas um registro pendente para avaliação posterior.
- Garantir que a troca não distorça margem, estoque e financeiro.

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

### Critérios de aceite

- Nova venda usa dados reais.
- Listagem de vendas usa Supabase.
- Detalhe da venda usa Supabase.
- Venda concluída atualiza status do veículo para `sold`.
- Venda concluída despublica o veículo.
- Venda concluída gera registros financeiros esperados.
- Comissão é registrada de forma rastreável.
- Pagamento da venda respeita a forma escolhida e não mostra campos desnecessários.
- À vista, PIX e cartão gravam pagamento quitado.
- Financiamento grava entrada e saldo restante sem gerar parcelas internas.
- Financiamento gera lançamentos financeiros separados para entrada paga e repasse pendente.
- Venda pendente reserva o veículo para o cliente informado.
- Venda pendente pode ser concluída ou cancelada pela tela de detalhe.
- Venda cancelada libera o veículo para voltar ao estoque disponível.
- Venda cancelada permanece no histórico.
- Não existe exclusão física de venda.
