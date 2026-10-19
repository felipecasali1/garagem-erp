# GaragemERP

GaragemERP é um sistema ERP para garagens e revendas de veículos seminovos. O sistema contempla o fluxo operacional de estoque de veículos, compras, checklists de preparação, clientes, funcionários, vendas, comissões, registros financeiros e gerenciamento de usuários internos.

## Stack

- React 19
- TanStack Start
- TanStack Router
- TanStack Query
- Vite
- TypeScript
- Tailwind CSS
- Supabase

## Requisitos

Para executar o GaragemERP localmente, você precisa de:

- Node.js 22.12.0 ou superior (a versão mínima também está em `.nvmrc`)
- npm
- Um projeto Supabase Cloud configurado no `.env` — caminho padrão para desenvolver
- Docker apenas se quiser executar o Supabase Local via CLI ou o pacote self-hosted via Compose

> No desenvolvimento normal, `npm run dev` usa o Supabase Cloud do `.env`. Não é necessário iniciar Docker nem o Supabase Local.

## Configuração do Supabase

### Supabase Cloud (padrão para desenvolvimento)

Crie ou use seu projeto no [Supabase](https://supabase.com/) e configure as credenciais do painel no `.env` (copie `.env.example` se ainda não tiver esse arquivo). As migrations podem ser aplicadas pelo fluxo de banco de dados escolhido para o projeto.

Instale as dependências e inicie a aplicação:

```bash
npm ci
npm run dev
```

Esse fluxo usa o Supabase Cloud configurado no `.env` e não requer Docker.

### Supabase Local via CLI (opcional)

O Supabase Local é uma opção separada para testes e validação local. Ele é executado pela Supabase CLI e Docker; não é necessário para o desenvolvimento diário com o Cloud e ainda não é o Compose de implantação.

Instale as dependências e inicie o ambiente:

```bash
npm ci
npm run supabase:start
```

Na primeira inicialização, o Docker baixa as imagens do stack Supabase e a CLI aplica automaticamente todas as migrations em `supabase/migrations`. Não é necessário vincular uma conta Supabase nem copiar credenciais de outra máquina.

Este stack da CLI é para desenvolvimento e validação local; não é o pacote de produção nem deve receber tráfego público. A implantação self-hosted para VPS pertence à segunda fase.

Obtenha as URLs e chaves locais:

```bash
npm run supabase:env
```

Esse comando mostra as URLs e chaves geradas pela CLI. O setup local salva esses valores em `.env.local`; não copie as chaves locais para o `.env` do Cloud. Não versione nem compartilhe a saída do comando: `SERVICE_ROLE_KEY`/`SECRET_KEY` são privilegiadas e devem ficar apenas no servidor.

O ambiente publica portas somente em `127.0.0.1`; o comando de inicialização cria e verifica uma rede Docker com esse binding. Não exponha essa instância à rede pública.

Os dados ficam em volumes Docker e persistem ao parar e iniciar novamente:

```bash
npm run supabase:stop
npm run supabase:start
```

Para validar schema, autenticação e RLS no banco local:

```bash
npm run supabase:test
```

Esse teste cria dados temporários dentro de uma transação e os reverte ao terminar.

> **Reset destrutivo:** `npx supabase db reset --local` apaga os dados do banco local e reaplica as migrations. Não faz parte do fluxo normal de inicialização.

O stack local e o projeto Cloud são ambientes separados. `npm run dev` carrega `.env` explicitamente, então o `.env.local` criado pelo setup local não troca silenciosamente o destino do desenvolvimento normal. Para apontar a aplicação ao Supabase Local, use `npm run dev:local`, que carrega `.env.local` explicitamente. Os dois arquivos são ignorados pelo Git; não versione nem compartilhe suas credenciais.

No modo de desenvolvimento, reinicie `npm run dev` depois de alterar essas variáveis. Em produção, `VITE_*` é incorporado ao bundle, portanto é necessário executar um novo build para trocar o destino.

### Supabase self-hosted via Docker Compose

Para iniciar a aplicação e o Supabase self-hosted sem instalar a Supabase CLI no host:

```bash
npm run selfhosted:up
```

O comando gera `.env.compose` separadamente, aplica as migrations versionadas e inicia o stack. A aplicação fica em `http://127.0.0.1:3101/login` e o Supabase Studio em `http://127.0.0.1:8000`. Use `npm run selfhosted:healthcheck` para verificar o ambiente e `npm run selfhosted:down` para parar os containers preservando o banco. Detalhes e diagnóstico estão em [`docs/selfhosted-compose.md`](docs/selfhosted-compose.md).

Esse fluxo não lê o `.env` Cloud nem `.env.docker`; `npm run dev` permanece apontado ao Cloud. O Compose publica apenas portas de loopback e não expõe a porta do Postgres no host. Storage/fotos, Realtime e Edge Functions não fazem parte do stack inicial.

### Supabase Local via CLI (opcional)

Para preparar o Supabase Local e a aplicação em um único fluxo, execute:

```bash
npm run setup:local
```

Esse comando valida Node.js, Docker, o daemon Docker e os recursos mínimos de CPU/memória; inicia o Supabase Local; confirma que Auth e PostgREST estão respondendo; grava as credenciais locais em `.env.local`; gera o build; inicia o servidor Node; e verifica a rota de login da aplicação. O arquivo `.env.local` é ignorado pelo Git e recebe permissões restritas no sistema operacional.

Ao terminar, acesse `http://127.0.0.1:3000/login`. O próprio comando mostra o endereço do Supabase Studio e os passos para criar o primeiro usuário Auth e vinculá-lo ao `User` interno. `Ctrl+C` encerra apenas a aplicação e preserva os dados nos volumes Docker; use `npm run supabase:stop` quando quiser parar o Supabase.

Esse fluxo usa a Supabase CLI para testes e desenvolvimento local. Ele é independente do Docker Compose de distribuição local e não deve ser exposto à internet. A implantação em VPS, incluindo proxy e HTTPS, continua sendo uma fase posterior.

### Atualizar e verificar o ambiente local

O comando de atualização atua sobre a versão do código que já está nesta cópia do repositório; ele não executa `git pull` nem conecta ao Supabase Cloud. Depois de obter a versão desejada pelo Git — e executar `npm ci` se as dependências mudaram — rode:

```bash
npm run update:local
```

O comando identifica o commit atual e valida Node, variáveis locais, CLI, Docker, daemon e recursos mínimos. Depois inicia ou confirma o Supabase Local e espera Auth e PostgREST responderem. A CLI pode aplicar migrations pendentes como parte de `supabase start` quando o stack estava parado; em seguida, o comando executa `migration up` para aplicar qualquer migration que ainda esteja pendente e confirma o histórico completo. Por fim, gera o build e inicia temporariamente a aplicação em uma porta local para verificar `/login`, Auth e PostgREST. Para manter a versão reproduzível, exige que o código executável esteja commitado; arquivos de consulta em `supabase/snippets/` não fazem parte do build e não bloqueiam a atualização. Ao final, encerra apenas esse processo temporário: não reseta nem para o banco e não remove volumes.

Para verificar separadamente um ambiente já em execução, use:

```bash
npm run healthcheck:local
```

Esse comando verifica a aplicação na porta configurada em `PORT` (por padrão, 3000), Auth, PostgREST e o histórico de migrations. Se não encontrar a aplicação nessa porta, também tenta `http://localhost:8080`, usada pelo servidor Vite em desenvolvimento. Para informar outro endereço local, defina `LOCAL_APP_URL`, por exemplo `LOCAL_APP_URL=http://localhost:8080`. O healthcheck falha com uma mensagem de diagnóstico se algum componente estiver indisponível ou se houver migrations pendentes.

#### Se a atualização falhar

- Se o preflight reclamar do Docker, inicie o daemon e confira se ele disponibiliza ao menos 2 CPUs e 4 GB de memória; depois rode `npm run update:local` novamente.
- Se Auth ou PostgREST não ficarem saudáveis, confira `docker ps` e os logs dos serviços com `docker logs <nome-do-container>`. O fluxo para antes do build. Se o stack estava parado, a CLI pode ter aplicado migrations durante `supabase start` antes desse healthcheck.
- Se uma migration falhar durante `supabase start` ou `migration up`, leia a mensagem do Postgres/Supabase e corrija a migration antes de tentar de novo. O fluxo interrompe antes do build e do healthcheck final; não use `db reset` para contornar a falha.
- Se o build ou o healthcheck final falhar, corrija o erro indicado e rode novamente. Migrations já aplicadas não são reaplicadas, e o comando não apaga nem recria os volumes.

Há também um teste reproduzível contra o Supabase Local. Com o stack local ativo, execute:

```bash
npm run test:local-update
```

O teste cria um registro fictício temporário, roda `update:local`, confirma que o registro continua no banco e o remove. Não executa `db reset`, não apaga os dados locais e não acessa um projeto remoto. No estado atual, sem migrations novas, a etapa de aplicação de migrations não altera o schema; ela só garante que versões futuras apliquem as que estiverem pendentes.

## Ambiente

Copie o arquivo de exemplo de variáveis de ambiente:

```bash
cp .env.example .env
```

A aplicação utiliza as seguintes variáveis:

```env
SUPABASE_URL=
SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SERVICE_KEY=

VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

### Variáveis do servidor

```env
SUPABASE_URL=
SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SERVICE_KEY=
```

`SUPABASE_URL` e `SUPABASE_SERVICE_KEY` são necessárias para iniciar o servidor de produção. `SUPABASE_PUBLISHABLE_KEY` é uma chave pública de compatibilidade; ela não substitui a chave de serviço.

A `SUPABASE_SERVICE_KEY` fornece acesso privilegiado aos recursos do Supabase e é utilizada em operações que exigem permissões administrativas, como o gerenciamento de usuários do Supabase Auth.

### Variáveis do cliente

```env
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

Essas variáveis são utilizadas pelo cliente executado no navegador. Em um build de produção, os valores `VITE_*` são incluídos nos arquivos JavaScript públicos e precisam estar definidos durante o build.

A chave pública/anon pode ser utilizada no código do cliente conforme o modelo de segurança do Supabase e as políticas de Row Level Security (RLS) configuradas no banco de dados.

> **Nunca exponha a `SUPABASE_SERVICE_KEY` no código do cliente ou em deployments públicos.**
>
> A `SUPABASE_SERVICE_KEY` deve permanecer exclusivamente no ambiente do servidor.

## Setup Local

Depois de configurar o Supabase Cloud no `.env`, instale as dependências usando o fluxo npm do projeto:

```bash
npm ci
```

Inicie o servidor de desenvolvimento:

```bash
npm run dev
```

`npm run dev` usa as credenciais do Supabase Cloud em `.env`, mesmo que exista um `.env.local` com credenciais locais. Se quiser desenvolver contra o Supabase Local, inicie-o com `npm run supabase:start` e use `npm run dev:local`.

A aplicação estará disponível no endereço informado pelo servidor de desenvolvimento.

Execute os testes automatizados:

```bash
npm test
```

Com o Supabase Local iniciado, valide migrations e RLS no PostgreSQL:

```bash
npm run supabase:test
```

Para validar o build e o servidor Node de produção, incluindo uma rota renderizada e seus arquivos estáticos:

```bash
npm run smoke:production
```

Esse smoke test usa as credenciais configuradas no `.env` e não altera dados no Supabase.

Comandos úteis para executar testes específicos:

```bash
npm run test:unit
npm run test:integration
```

## Setup do Banco de Dados

As migrations do banco de dados ficam em:

```text
supabase/migrations
```

O projeto pode usar o Supabase Cloud para desenvolvimento normal, o Supabase Local via CLI para testes, ou o pacote Docker Compose para uma instalação self-hosted independente.

No Supabase Local via CLI, as migrations são aplicadas pela CLI ao iniciar o stack. O Compose usa um serviço próprio para aplicar migrations versionadas sem a CLI no host. Use `npm run supabase:test` para verificar a autorização/RLS no stack da CLI. Não execute `db reset` como etapa de setup: esse comando é destrutivo.

## Primeiro Usuário Interno

O login do GaragemERP utiliza o Supabase Auth em conjunto com o sistema interno de usuários da aplicação.

Para que um usuário possa acessar o sistema, é necessário existir:

- um usuário no Supabase Auth (`auth.users`)
- um usuário interno vinculado em `public.users`

Para criar o primeiro administrador interno, primeiro crie um usuário no Supabase Auth com o e-mail desejado.

Depois, execute a função de bootstrap:

```sql
select public.bootstrap_internal_user(
  'seu-email@exemplo.com',
  'Seu Nome',
  'Administrador',
  'admin',
  true,
  'individual',
  '67999999999'
);
```

Por padrão, essa função cria os registros relacionados em:

- `people`
- `employees`
- `users`

com acesso de administrador.

Com o `.env.local` criado pelo setup, valide o fluxo completo do primeiro usuário:

```bash
npm run setup:verify-user
```

O comando solicita o e-mail e a senha somente em memória, confirma o login no Auth, verifica o vínculo com `public.users` e faz uma leitura autorizada de veículos. Para automações locais, `LOCAL_SETUP_USER_PASSWORD` pode fornecer a senha sem ser versionada.

Depois que o primeiro administrador existir, novos usuários do sistema devem ser provisionados através do fluxo:

```text
Configurações > Usuários
```

## Estrutura do Projeto

A aplicação é organizada em módulos relacionados às principais áreas do ERP, incluindo:

- Dashboard
- Veículos e estoque
- Compras
- Checklists de preparação
- Clientes
- Funcionários
- Vendas
- Comissões
- Financeiro
- Usuários e configurações

A estrutura de dados e as alterações no banco são versionadas através das migrations localizadas em:

```text
supabase/migrations
```

## Desenvolvimento

O desenvolvimento normal usa o Supabase Cloud. O Supabase Local via CLI é uma opção para testes:

### Supabase Cloud (padrão)

```text
Node.js
   │
   └── GaragemERP
           │
           ▼
      Supabase Cloud
```

`npm run dev` conecta ao projeto remoto configurado em `.env`.

### Supabase Local via CLI (opcional)

```text
Node.js
   │
   └── GaragemERP
           │
           ▼
    Supabase CLI
           │
           ▼
         Docker
           │
           ▼
    Supabase Local
```

Nesta configuração, o Docker é utilizado para executar os serviços locais do Supabase. Use `npm run dev:local` para conectar a aplicação a esse stack.

## Build e execução de produção

O alvo de produção implementado nesta fase é Node.js. Cloudflare/Wrangler não faz parte do build nem é necessário para executar a aplicação.

Com as variáveis de ambiente configuradas e as migrations aplicadas, gere e inicie o build:

```bash
npm run build
npm start
```

O comando `start` serve os arquivos estáticos e as rotas renderizadas pelo TanStack Start. Por padrão, o servidor escuta em `0.0.0.0:3000`; configure `HOST` e `PORT` para alterar isso. Ele carrega `.env` se o arquivo existir, ou pode receber as variáveis diretamente do ambiente — como em um container.

Para conferir a inicialização real pelo comando npm, execute `npm start` e abra `http://localhost:3000/login` no navegador. A página de login deve carregar junto com os arquivos JavaScript/CSS, sem erro de servidor.

As variáveis públicas do Supabase devem estar disponíveis no build. `SUPABASE_URL` e `SUPABASE_SERVICE_KEY` devem estar disponíveis no processo Node em execução; a chave de serviço é sempre exclusiva do servidor.

O smoke test automatizado pode ser executado com `npm run smoke:production`. Para iniciar a distribuição local em Docker com Supabase self-hosted, use `npm run selfhosted:up`; veja [`docs/selfhosted-compose.md`](docs/selfhosted-compose.md). A implantação em VPS, domínio e HTTPS continua fora desta fase.

## Variáveis de Ambiente e Segurança

Nunca versione arquivos `.env` contendo credenciais reais.

Utilize o arquivo:

```text
.env.example
```

como referência para configurar o ambiente.

Credenciais sensíveis, especialmente a `SUPABASE_SERVICE_KEY`, devem ser armazenadas como variáveis de ambiente nos ambientes de desenvolvimento e produção.

A chave de serviço não deve ser enviada ao navegador, incluída no bundle do frontend ou publicada em repositórios públicos.
