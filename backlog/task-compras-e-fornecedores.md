## Task - Compras e fornecedores

### Status

Concluída por enquanto. Manter este arquivo como referência de regras e pontos de estabilização.

### O que já foi construído

- Cadastro próprio de fornecedores em `/suppliers`.
- Fornecedor como papel separado da base comum `people`.
- Reaproveitamento de pessoa por CPF/CNPJ.
- Origem/categoria do fornecedor em `suppliers.supplier_type`.
- Categoria filtrada por tipo de pessoa:
  - Pessoa física: Particular, Troca.
  - Pessoa jurídica: Empresa, Revenda, Leilão, Troca.
- Listagem, detalhe, criação, edição e arquivamento/reativação de fornecedores.
- Registro de compra em `/purchases/new`.
- Seleção de veículo em avaliação para registrar compra.
- Cadastro rápido de fornecedor dentro do fluxo de compra.
- Listagem e detalhe de compras persistidos.
- Ações operacionais na compra:
  - concluir compra pendente;
  - cancelar compra pendente.
- Compra concluída:
  - grava custo real no veículo;
  - gera despesa financeira;
  - move veículo para `Em preparação` ou `Disponível`, conforme checklist ativo;
  - mantém veículo não publicado.
- Compra cancelada:
  - permanece no histórico;
  - mantém/devolve veículo para `Em avaliação`;
  - não gera financeiro.

### Regras confirmadas

- Fornecedor não deve ser apagado fisicamente.
- Compra não deve ser apagada fisicamente.
- Compra cancelada deve permanecer no histórico.
- Veículo avaliado antes da compra deve ser reaproveitado, sem duplicar cadastro.
- Veículo arquivado só deve ocorrer por ação manual.
- Compra concluída é o momento em que a avaliação vira estoque efetivo.
- Financeiro de compra só nasce quando a compra é concluída.

### Pontos futuros

- Exibir histórico de compras no detalhe do fornecedor.
- Exibir vínculo da compra no histórico do veículo.
- Permitir edição controlada de compra pendente, se necessário.
- Pensar estorno/reversão para compra concluída, caso o negócio precise.
