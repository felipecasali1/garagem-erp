## Task - Revisar configurações do sistema

### Objetivo

Revisar a tela `/settings` para que ela mostre apenas configurações úteis no estado atual do sistema. A tela deve evitar opções decorativas ou falsas, isto é, campos que parecem funcionais mas não afetam nenhuma parte real da aplicação.

### Contexto

A tela de configurações possui abas para empresa, usuários, acessórios e configurações gerais.

Atualmente, algumas partes parecem funcionais e outras parecem apenas demonstrativas. A intenção desta task é verificar cada aba, manter o que já tem utilidade real, remover ou simplificar o que ainda não tem efeito no sistema e deixar a tela preparada para evoluir conforme novos módulos forem sendo persistidos.

### Escopo

- Verificar a persistência dos dados da empresa.
- Verificar se o upload/exibição da logo funciona.
- Validar a aba de usuários.
- Validar a aba de acessórios.
- Revisar a aba geral e remover preferências que ainda não têm efeito real.
- Manter somente configurações que sejam usadas pelo sistema hoje ou que tenham implementação clara nesta task.

### 1. Aba Empresa

Objetivo: confirmar se os dados cadastrados da empresa são persistidos corretamente.

Verificar:

- Nome da empresa.
- CNPJ.
- Telefone.
- E-mail.
- Endereço.
- Logo.

Decisão esperada:

- Se os campos já persistem corretamente, manter e ajustar mensagens/validações se necessário.
- Se não persistem, implementar persistência em Supabase.
- Se a logo não funcionar, decidir entre implementar upload/persistência ou remover temporariamente o campo para não parecer funcional sem ser.

Observação:

Por enquanto, os dados da empresa não precisam ser usados em outras telas. O ponto principal é que a configuração seja salva e carregada corretamente.

### 2. Aba Usuários

Objetivo: garantir que a aba continue sendo o local correto para gerenciar acesso ao sistema.

Verificar:

- Listagem de usuários internos.
- Criação de acesso para funcionário existente.
- Ativação/desativação de acesso.
- Remoção de acesso do usuário.
- Proteção para o usuário logado não remover/desativar o próprio acesso indevidamente.

Decisão esperada:

- Manter a aba se estiver funcional.
- Ajustar textos para deixar claro que a ação gerencia acesso ao sistema, não cadastro operacional de funcionário.
- Garantir que essa continue sendo a única área onde uma exclusão física é permitida: remover `public.users` e o usuário do Supabase Auth.

### 3. Aba Acessórios

Objetivo: verificar se o catálogo de acessórios é realmente funcional.

Verificar:

- Se os acessórios cadastrados na aba são persistidos.
- Se a lista da aba conversa com os acessórios usados no cadastro/edição de veículos.
- Se remover/desativar acessório afeta corretamente apenas o catálogo, sem apagar histórico de veículos.

Decisão esperada:

- Se estiver apenas em memória/mock, implementar persistência ou simplificar a aba.
- Preferir ativar/desativar acessórios em vez de apagar fisicamente, seguindo a regra de preservação histórica.

### 4. Aba Geral

Objetivo: remover configurações que ainda não têm efeito real no sistema.

Preferências atuais a revisar:

- Mostrar margens estimadas em listagens.
- Exibir alertas de parcelas vencidas no topo.
- Notificar comissões aprovadas por e-mail.
- Tema escuro como padrão para novos usuários.
- Mensagem do dia.

Decisão esperada:

- Remover "Mensagem do dia" por enquanto.
- Remover preferências que não são aplicadas em nenhuma tela.
- Manter ou criar apenas opções que tenham efeito real no estado atual do sistema.

Sugestões de opções úteis para manter agora:

- Mostrar valores de custo/margem nas listagens de veículos, se a listagem passar a respeitar essa configuração.
- Exibir veículos arquivados na listagem, se o filtro/listagem for conectado a essa preferência.
- Preferência visual do usuário atual, se já existir integração com o tema.

Se nenhuma preferência geral tiver aplicação real imediata, a aba Geral deve ser removida ou substituída por um estado vazio simples informando que novas preferências serão adicionadas conforme os módulos forem concluídos.

### Critérios de aceite

- A tela `/settings` não deve ter botões ou campos que pareçam salvar algo sem efeito real.
- Dados da empresa devem salvar e carregar corretamente, ou a aba deve deixar claro que ainda não está ativa.
- Logo deve funcionar de ponta a ponta ou ser removida temporariamente.
- Usuários devem continuar funcionais como gerenciamento de acesso.
- Acessórios devem ser persistidos ou a aba deve ser simplificada para não parecer finalizada.
- Preferências gerais sem efeito real devem ser removidas.
- A UI deve usar textos claros e alinhados ao domínio do sistema.

### Ordem recomendada

1. Auditar o estado atual de cada aba em `/settings`.
2. Corrigir ou implementar persistência da aba Empresa.
3. Validar e ajustar textos/fluxos da aba Usuários.
4. Corrigir ou implementar persistência da aba Acessórios.
5. Simplificar a aba Geral, removendo opções demonstrativas.
6. Rodar build/testes e revisar manualmente a tela.
