## Task - Veículos como avaliação e estoque

### Status

Concluída por enquanto. Manter este arquivo como referência de regras e pontos de estabilização.

### O que já foi construído

- Veículo pode ser cadastrado antes da compra como `Em avaliação`.
- A página de veículos cria uma nova avaliação, não uma entrada direta de estoque comprado.
- Veículo em avaliação pode receber checklist.
- Veículo em avaliação pode ser vinculado a uma compra.
- Compra concluída transforma avaliação em estoque efetivo.
- Status `in_repair` é exibido como `Em preparação`.
- Veículo em preparação pode ser finalizado e virar `Disponível` quando não houver pendências de checklist.
- Veículo só pode ser publicado quando estiver `Disponível`.
- Veículo publicado pode ser despublicado.
- Veículo pode ser arquivado sem exclusão física.
- Status do veículo é controlado pelo fluxo do sistema, não por seleção manual no formulário.
- A única mudança manual de status permitida é arquivar o veículo.
- Filtros por status incluem avaliação, disponível, reservado, vendido, preparação e arquivado.

### Regras confirmadas

- Veículo não deve ser apagado fisicamente.
- Veículo pode existir sem compra vinculada quando estiver em avaliação/prospecção.
- Veículo novo sempre nasce como `Em avaliação`.
- Compra concluída muda o veículo para `Disponível` quando não houver checklist pendente.
- Compra concluída muda o veículo para `Em preparação` quando houver checklist pendente.
- Finalização da preparação muda o veículo para `Disponível`.
- Venda pendente muda o veículo para `Reservado`.
- Venda concluída muda o veículo para `Vendido`.
- Veículo em avaliação não deve ser vendido.
- Veículo em avaliação não deve gerar impacto financeiro de compra.
- Preço de custo definitivo vem da compra concluída.
- Veículo disponível ainda não é publicado automaticamente.
- Veículo arquivado só deve ocorrer por ação manual.
- Edição cadastral do veículo deve preservar o status atual.
- Veículo reservado deve ter uma venda pendente vinculada.
- Veículo vendido deve ter uma venda concluída vinculada.
- Veículo reservado ou vendido não deve ser arquivado manualmente pela edição do veículo.

### Pontos futuros

- Exibir compra vinculada no detalhe do veículo.
- Exibir venda vinculada quando o módulo de vendas for real.
- Revisar campos obrigatórios mínimos da avaliação conforme feedback de uso.
- Avaliar se veículos arquivados devem aparecer apenas mediante filtro.
