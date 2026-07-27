## Task - Controle de acesso e preservação histórica

### Objetivo

Consolidar o controle de acesso do sistema sem misturar cadastro operacional com login, aplicar permissões reais por `access_role` e definir uma política de preservação histórica: registros operacionais não devem ser apagados, pois podem afetar cálculos, financeiro, auditoria e histórico do negócio.

### Escopo

- Finalizar o fluxo de provisionamento de acesso para funcionários existentes.
- Concluir a navegação baseada em `access_role` para esconder e bloquear áreas administrativas conforme o perfil.
- Remover ações de exclusão de entidades operacionais relacionadas ao negócio.
- Manter exclusão apenas para acesso de usuário do sistema, pois remover o login não altera cálculos, financeiro ou histórico operacional.

### 1. Provisionamento de acesso

O cadastro de funcionário deve continuar sendo operacional. Criar um funcionário não deve criar login automaticamente.

Plano:

- Renomear textos de UI de "Novo usuário" para algo mais explícito, como "Criar acesso".
- Garantir que a tela de usuários liste apenas funcionários ainda sem acesso ao criar um novo acesso.
- Melhorar mensagens quando o funcionário selecionado não tiver e-mail cadastrado.
- Manter validação no serviço para impedir acesso duplicado por `person_id` ou `employee_id`.
- Tratar exclusão de usuário como remoção de acesso ao sistema, preservando funcionário, pessoa e histórico.
- Avaliar CTA na tela de detalhes do funcionário para criar acesso quando ele ainda não tiver usuário vinculado.

Critérios de aceite:

- Criar funcionário não cria login automaticamente.
- Criar acesso exige funcionário existente com e-mail.
- Excluir usuário remove Supabase Auth + `public.users`, mas preserva funcionário e histórico.
- Funcionário sem acesso continua existindo normalmente como cadastro operacional, mas não consegue logar.

### 2. Controle de navegação por `access_role`

Hoje parte da UI diferencia apenas admin versus nao-admin. O sistema deve usar os perfis reais: `admin`, `manager`, `seller` e `financial`.

Plano:

- Criar uma matriz central de permissões, por exemplo em `src/shared/auth/access-control.ts`.
- Definir permissões por rota e por item de menu.
- Fazer o sidebar esconder itens de menu conforme `accessRole`.
- Fazer o layout bloquear acesso manual por URL, redirecionando usuários sem permissão.
- Revisar áreas administrativas, especialmente funcionários, usuários/configurações e preferências da empresa.
- Evitar espalhar checagens manuais de `isAdmin`; preferir helpers como `canAccessRoute(...)` ou `hasRole(...)`.

Sugestão inicial de perfis:

- `admin`: acesso completo.
- `manager`: dashboard, veículos, clientes, compras, vendas e parte do financeiro.
- `seller`: dashboard, veículos, clientes e vendas.
- `financial`: dashboard, financeiro e, se necessário, clientes em modo consultivo.

Critérios de aceite:

- Usuário sem permissão não vê o item no menu.
- Usuário sem permissão que digitar a URL manualmente é redirecionado.
- `admin`, `manager`, `seller` e `financial` têm comportamentos distintos.
- A matriz de acesso fica centralizada e fácil de justificar/documentar.

### 3. Exclusão versus arquivamento

Registros operacionais não devem ser apagados. Mesmo quando ainda não houver vínculo aparente, esses registros fazem parte do histórico administrativo do sistema e podem impactar cálculos, financeiro, relatórios, auditoria ou telas futuras.

A única exclusão permitida deve ser a remoção do acesso de usuário do sistema, isto é, excluir o vínculo de login em `public.users` e o usuário correspondente no Supabase Auth. Essa operação não deve excluir funcionário, pessoa ou qualquer histórico operacional.

Para todos os demais casos, usar ações de domínio como desativar, arquivar, cancelar ou marcar como inativo.

Estado atual observado:

- `employees` já possui `active`.
- `suppliers` já possui `active` no schema.
- `customers` ainda não possui `active`.
- `purchases.supplier_id` já usa `on delete restrict`.
- veículos possuem fluxos operacionais e histórico futuro de compra, preparação, venda e financeiro.
- checklists de preparação impactam custos estimados/realizados e margem do veículo.

Plano:

- Adicionar migration com `customers.active boolean not null default true`.
- Ajustar serviços e listagens de clientes para lidar com clientes ativos/inativos.
- Remover ações de excluir cliente na UI e nos fluxos de serviço; substituir por "Arquivar" ou "Desativar".
- Para funcionários, manter "Desativar" como caminho principal e remover ações de exclusão.
- Para fornecedores, aplicar o mesmo padrão quando o módulo real de fornecedores estiver persistido.
- Para veículos, remover ações de exclusão e substituir por status adequado, como inativo, arquivado, cancelado ou indisponível, conforme o domínio definido.
- Para checklists, remover exclusão física de itens; substituir por status como `cancelled` quando um item não deve mais compor o trabalho ativo.
- Revisar outros módulos relacionados a cálculo, financeiro ou histórico para remover deletes físicos.
- Atualizar diálogos e mensagens para não usar "Excluir" em entidades operacionais.
- Avaliar funções RPC para operações atômicas quando a regra depender de múltiplas tabelas.
- Revisar migrations, FKs e RLS para reforçar a regra no banco quando possível.

Critérios de aceite:

- Clientes, fornecedores, funcionários, veículos, checklists e demais entidades operacionais relacionadas não possuem ação de exclusão física na UI.
- Serviços do frontend não expõem funções de delete para entidades operacionais.
- O usuário recebe ações claras de arquivar, desativar, cancelar ou marcar como inativo conforme o tipo de registro.
- Registros inativos não aparecem em seleções operacionais normais.
- Registros inativos continuam disponíveis em detalhes e históricos já existentes.
- Itens cancelados de checklist deixam de contar como trabalho ativo, mas continuam registrados.
- A remoção de acesso do usuário continua permitida e remove apenas Supabase Auth + `public.users`.
- O banco continua protegendo integridade por FKs/RLS, não apenas pela UI.

### Ordem recomendada

1. Implementar a matriz central de permissões por `access_role`.
2. Aplicar a matriz no sidebar e no bloqueio de rotas.
3. Refinar o fluxo de provisionamento de acesso para funcionários existentes.
4. Implementar a política de preservação histórica, removendo deletes físicos de entidades operacionais e substituindo por arquivar/desativar/cancelar.
