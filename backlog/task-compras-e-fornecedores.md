## Task - Construir fluxo real de compras e fornecedores

### Objetivo

Construir o módulo de compras como a confirmação da entrada financeira e operacional do veículo no estoque.

### Contexto

Hoje existe tela de nova compra, mas o fluxo ainda usa dados mock/demo.

O sistema deve permitir que um veículo seja cadastrado antes da compra, em modo de avaliação/prospecção, para que a equipe registre checklist e observações. A compra entra depois como confirmação da negociação, vínculo com fornecedor e impacto financeiro.

### Escopo

- Criar ou finalizar persistência de fornecedores.
- Criar listagem, detalhe e cadastro/edição de fornecedores, se necessário.
- Persistir compras em Supabase.
- Registrar dados da compra:
  - fornecedor
  - veículo adquirido
  - valor de compra
  - data da compra
  - status da compra
  - observações
- Ao concluir uma compra, criar ou atualizar o veículo no estoque.
- Permitir selecionar um veículo já cadastrado em avaliação/prospecção para vincular à compra.
- Definir status do veículo após compra, saindo de `evaluating` para `in_repair` ou `available`, conforme o fluxo de preparação.
- Gerar lançamento financeiro de despesa quando a compra for concluída.

### Regras de negócio

- Fornecedor não deve ser apagado fisicamente.
- Compra não deve ser apagada fisicamente.
- Compra cancelada deve permanecer no histórico.
- Veículo originado por compra deve manter vínculo com essa compra.
- Veículo avaliado antes da compra deve poder ser reaproveitado na compra, sem duplicar cadastro.
- Compra concluída deve transformar a avaliação em estoque efetivo.
- Uma compra concluída deve impactar o custo do veículo.

### Decisões pendentes

- Quais dados mínimos do veículo são necessários para abrir uma avaliação antes da compra?
- O veículo entra direto como disponível ou precisa passar por preparação obrigatória?
- Compra pendente deve criar veículo no estoque ou só após conclusão?
- Ao cancelar uma negociação, o veículo avaliado deve ser arquivado automaticamente ou continuar como prospecção?

### Critérios de aceite

- Compras são persistidas em Supabase.
- Fornecedores são persistidos e reutilizáveis.
- Uma compra concluída cria um veículo no estoque ou vincula um veículo de avaliação já existente.
- O veículo mostra origem/vínculo com a compra.
- O financeiro recebe uma despesa relacionada à compra concluída.
- Não existe ação de excluir fornecedor ou compra; apenas cancelar/desativar/arquivar conforme o caso.
