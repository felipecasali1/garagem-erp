## Task - Consolidar preparação e checklist do veículo

### Objetivo

Consolidar o checklist de preparação como parte real do custo e da disponibilidade do veículo para venda.

### Contexto

O checklist já existe e possui status, responsáveis, custo estimado e custo real. Ele deve ser tratado como histórico operacional, pois influencia avaliação de compra, margem e preparação do estoque.

O checklist também deve funcionar antes da compra ser concluída. Isso atende ao caso em que a equipe avalia um carro em feira, loja parceira ou negociação externa e precisa registrar pendências antes de decidir comprar.

### Escopo

- Definir política de exclusão por status do item de checklist.
- Permitir checklist em veículo cadastrado apenas para avaliação/prospecção.
- Usar `cancelled` para itens que não devem mais contar como tarefa ativa.
- Validar cálculo de custo estimado e custo real.
- Exibir claramente impacto da preparação na margem do veículo.
- Definir quando um veículo está pronto para venda.
- Avaliar se veículo com checklist pendente pode ser vendido.

### Regras de negócio

- Item de checklist concluído não pode ser apagado, pois já faz parte do histórico operacional e pode impactar custos/margem.
- Item de checklist cancelado pode ser apagado quando representar erro de cadastro ou correção operacional.
- Item cancelado não conta como trabalho ativo.
- Item pendente/em andamento/aguardando peças deve preferencialmente ser cancelado antes de qualquer remoção.
- Checklist pré-compra não gera impacto financeiro automaticamente.
- Custo estimado deve ajudar a projetar margem.
- Custo real deve ajudar a apurar resultado.
- Funcionário responsável inativo deve continuar aparecendo no histórico do item, mas não deve ser opção para novos itens.

### Decisões pendentes

- Venda deve ser bloqueada se checklist ativo não estiver concluído?
- Custo real deve gerar lançamento financeiro automático?
- Checklist deve nascer automaticamente com itens padrão por tipo de veículo?
- Checklist pré-compra deve ter categorias específicas de avaliação, inspeção e negociação?

### Critérios de aceite

- Checklist persiste em Supabase.
- Checklist funciona para veículo ainda sem compra vinculada.
- Itens concluídos ficam protegidos contra exclusão.
- Itens cancelados podem ser excluídos quando necessário para corrigir erro do usuário.
- Resumo do checklist ignora itens cancelados como tarefas ativas.
- Detalhe do veículo mostra custo de preparação e impacto na margem.
- Seleção de responsável usa apenas funcionários ativos para novos itens.
