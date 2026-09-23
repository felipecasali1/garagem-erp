# GaragemERP

GaragemERP é um sistema de gestão para uma revenda de veículos seminovos. Seu domínio acompanha a aquisição, a preparação, a comercialização e os efeitos financeiros dos veículos ao longo do tempo.

## Language

Os termos canônicos permanecem em inglês para acompanhar o vocabulário do código; as definições ficam em português.

### People and roles

**Person**:
Registro-base de identidade de uma pessoa física ou jurídica. Uma mesma `Person` pode assumir mais de um papel de negócio.
_Avoid_: tratar `Person` como sinônimo de `Customer`, `Employee` ou `Supplier`.

**Customer**:
Pessoa ou empresa que compra um `Vehicle` da garagem.
_Avoid_: usar `User` para representar cliente.

**Employee**:
Colaborador da garagem que participa da operação interna, inclusive como responsável por uma `Sale` e por uma `Commission`.
_Avoid_: usar `User` para representar funcionário.

**Supplier**:
Pessoa ou organização da qual a garagem adquire um `Vehicle`. Pode representar uma pessoa física, empresa, revenda, leilão ou uma origem de `trade_in`.
_Avoid_: presumir que todo `Customer` é `Supplier`, embora uma mesma `Person` possa exercer os dois papéis.

**User**:
Pessoa com acesso ao sistema. `User` é um papel de acesso e não substitui o papel de `Employee` ou qualquer outro papel de negócio.
_Avoid_: usar `User` como sinônimo de pessoa ou funcionário.

### Vehicle lifecycle

**Vehicle**:
Carro físico que a garagem pode adquirir, preparar, disponibilizar e vender. O mesmo veículo pode retornar à garagem e participar de vários ciclos de estoque ao longo da sua vida.
_Avoid_: tratar o veículo como uma operação única de compra e venda.

**Purchase**:
Operação pela qual a garagem adquire um `Vehicle` de um `Supplier`. Cada nova aquisição do mesmo veículo inicia uma nova ocorrência de `Purchase`, preservando o histórico anterior.
_Avoid_: tratar `Purchase` como o cadastro permanente do veículo.

**Preparation**:
Fase em que a garagem executa as tarefas necessárias para tornar um `Vehicle` pronto para venda.
_Avoid_: reduzir `Preparation` a reparos mecânicos; ela pode incluir inspeção, documentação, limpeza, acessórios e outras tarefas operacionais.

**ChecklistItem**:
Tarefa concreta pertencente à `Preparation` de um `Vehicle`, com acompanhamento de status, prioridade, custos e, quando aplicável, um `Employee` responsável.
_Avoid_: tratar o checklist como apenas uma lista visual sem efeito no estado de preparação.

**Accessory**:
Item de catálogo que pode ser associado a um `Vehicle` e fazer parte da sua configuração comercial ou da sua preparação.

**VehiclePhoto**:
Imagem associada a um `Vehicle` para armazenamento e download pelos usuários autorizados. Ela não representa uma evidência de `Preparation` nem uma publicação pública do veículo.
_Avoid_: tratar `VehiclePhoto` como `ChecklistItem` ou como arquivo público por padrão.

### Commercial and finance

**Sale**:
Operação comercial pela qual a garagem vende um `Vehicle` a um `Customer`. Um veículo pode participar de uma nova `Sale` depois de ser readquirido em um ciclo posterior.
_Avoid_: confundir a `Sale` com o `Payment` ou com os lançamentos financeiros gerados por ela.

**Payment**:
Condições e estado do pagamento associado a uma `Sale`, incluindo a forma de pagamento, a entrada, o valor restante e a situação de quitação.
_Avoid_: usar `Payment` como sinônimo de `FinancialTransaction`.

**Installment**:
Parcela individual de um `Payment` ou de uma obrigação financeira, com valor, vencimento e estado próprios.

**Commission**:
Valor devido a um `Employee` em razão de uma `Sale`, calculado conforme a regra de comissão aplicável ao funcionário.
_Avoid_: tratar `Commission` como parte do preço do veículo ou como o próprio salário do funcionário.

**FinancialTransaction**:
Registro de uma entrada ou saída financeira relacionada a uma operação de negócio, como `Purchase`, `Sale` ou `Commission`, ou lançada de forma independente.
_Avoid_: usar `FinancialTransaction` para representar a operação comercial que originou o lançamento.
