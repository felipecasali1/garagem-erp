## Task - Preparação e checklist do veículo

### Status

Concluída por enquanto. Manter este arquivo como referência de regras e pontos de estabilização.

### O que já foi construído

- Checklist funciona em veículo ainda em avaliação/prospecção.
- Checklist funciona em veículo comprado e em preparação.
- Resumo do veículo mostra:
  - preparação estimada;
  - preparação realizada;
  - investido estimado;
  - investido real;
  - margem estimada.
- Item cancelado não conta como tarefa ativa.
- Item concluído permanece como histórico operacional.
- Veículo `Em preparação` mostra aviso operacional na tela de detalhe.
- Veículo em preparação só pode virar `Disponível` quando não houver item pendente, em andamento ou aguardando peça.
- Ação `Finalizar preparação` move veículo para `Disponível` e mantém `published: false`.

### Regras confirmadas

- Item de checklist concluído não deve ser apagado.
- Item de checklist cancelado pode ser apagado quando representar erro de cadastro ou correção operacional.
- Checklist pré-compra não gera impacto financeiro automaticamente.
- Custo estimado ajuda a projetar margem.
- Custo real ajuda a apurar resultado.
- Veículo com checklist ativo pendente não deve ser liberado como disponível pela preparação.

### Pontos futuros

- Definir se custo real de checklist deve gerar lançamento financeiro automático.
- Criar modelos padrão de checklist por tipo/categoria de veículo, se fizer sentido.
- Exibir histórico de alterações do checklist.
- Avaliar se checklist concluído deve travar edição de custos ou permitir ajuste com rastro.
