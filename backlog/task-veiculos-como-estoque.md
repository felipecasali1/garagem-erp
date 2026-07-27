## Task - Reposicionar veículos como avaliação e estoque

### Objetivo

Ajustar o módulo de veículos para permitir dois momentos do mesmo registro: avaliação pré-compra e estoque após compra concluída.

### Contexto

Veículos já são funcionais em parte: listagem, detalhe, edição, publicação, acessórios e checklist já existem com Supabase.

Existe uma solicitação importante do cliente: o sistema precisa permitir registrar um veículo de forma básica antes da compra estar totalmente realizada. Exemplo: a loja visita uma feira, encontra um carro interessante e quer anotar dados iniciais e abrir um checklist de avaliação/preparação antes de decidir comprar.

Portanto, não precisamos criar dois tipos de veículo. O mesmo registro de veículo pode começar como uma avaliação/prospecção e depois ser vinculado a uma compra quando a negociação for concluída.

### Escopo

- Manter a possibilidade de cadastro básico de veículo.
- Ajustar textos para deixar claro quando o veículo ainda é apenas avaliação/prospecção.
- Usar status específico de avaliação/prospecção para veículos cadastrados antes da compra.
- Permitir checklist em veículo ainda não comprado.
- Garantir que veículo possa ter vínculo opcional com compra.
- Quando a compra for concluída, vincular o veículo à compra e tratá-lo como estoque efetivo.
- Manter edição de dados técnicos do veículo.
- Manter publicação/despublicação.
- Manter arquivamento em vez de exclusão.
- Ajustar filtros e status do estoque.

### Regras de negócio

- Veículo não deve ser apagado fisicamente.
- Veículo pode existir sem compra vinculada quando estiver em avaliação/prospecção.
- Veículo em avaliação não deve ser vendido.
- Veículo em avaliação não deve gerar impacto financeiro de compra.
- Checklist pode ser criado antes da compra para registrar inspeção, pendências, custos estimados e observações.
- Ao concluir uma compra, o veículo avaliado pode ser reaproveitado e vinculado à compra.
- Veículo vendido deve permanecer no histórico.
- Veículo arquivado deve deixar de aparecer como item operacional principal, mas continuar consultável.
- Preço de custo definitivo deve vir da compra, não de edição livre sem rastro.
- Alterações de custo depois da compra devem ser pensadas com cuidado, pois impactam margem e financeiro.

### Decisões pendentes

- Quais campos são obrigatórios no cadastro básico pré-compra?
- Veículo em avaliação aparece na mesma listagem de estoque ou em filtro separado?
- Exibir o status interno `in_repair` como "Em preparação", porque o veículo pode estar em vistoria, limpeza, fotos ou regularização, e não necessariamente em reparo.
- Veículo arquivado deve aparecer por padrão na listagem ou apenas quando filtrado?

### Critérios de aceite

- O sistema permite cadastro básico de veículo antes da compra.
- O sistema permite abrir checklist para veículo ainda não comprado.
- Veículo sem compra vinculada fica identificado como avaliação/prospecção.
- Veículo em avaliação não aparece como disponível para venda.
- Compra concluída pode vincular/aproveitar um veículo já cadastrado em avaliação.
- A tela de veículos funciona como estoque.
- Não existe exclusão física de veículo.
- Veículos arquivados/vendidos continuam acessíveis para histórico.
- Margem usa custo de compra + preparação estimada/realizada.
