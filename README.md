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
- Docker apenas para executar o pacote self-hosted via Compose

> No desenvolvimento, `npm run dev` usa o Supabase Cloud do `.env`. Não é necessário iniciar Docker.

## Configuração do Supabase

### Supabase Cloud (padrão para desenvolvimento)

Crie ou use seu projeto no [Supabase](https://supabase.com/) e configure as credenciais do painel no `.env` (copie `.env.example` se ainda não tiver esse arquivo). As migrations podem ser aplicadas pelo fluxo de banco de dados escolhido para o projeto.

Instale as dependências e inicie a aplicação:

```bash
npm ci
npm run dev
```

Esse fluxo usa o Supabase Cloud configurado no `.env` e não requer Docker.

No modo de desenvolvimento, reinicie `npm run dev` depois de alterar as variáveis do `.env`. Em produção, `VITE_*` é incorporado ao bundle, portanto é necessário executar um novo build para trocar o destino.

### Supabase self-hosted via Docker Compose

Para iniciar a aplicação e o Supabase self-hosted pelo Docker Compose:

```bash
npm run selfhosted:up
```

O comando gera `.env.compose` separadamente, aplica as migrations versionadas e inicia o stack. A aplicação fica em `http://127.0.0.1:3101/login` e o Supabase Studio em `http://127.0.0.1:8000`. Use `npm run selfhosted:healthcheck` para verificar o ambiente e `npm run selfhosted:down` para parar os containers preservando o banco. Detalhes e diagnóstico estão em [`docs/selfhosted-compose.md`](docs/selfhosted-compose.md).

Esse fluxo não lê o `.env` Cloud nem `.env.docker`; `npm run dev` permanece apontado ao Cloud. O Compose publica apenas portas de loopback e não expõe a porta do Postgres no host. Storage/fotos, Realtime e Edge Functions não fazem parte do stack inicial.

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

`npm run dev` usa as credenciais do Supabase Cloud configuradas em `.env`.

A aplicação estará disponível no endereço informado pelo servidor de desenvolvimento.

Execute os testes automatizados:

```bash
npm test
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

As migrations versionadas do banco de dados ficam em:

```text
supabase/migrations
```

O desenvolvimento normal usa o Supabase Cloud. No pacote self-hosted, o serviço `migrations` do Docker Compose aplica as migrations pendentes antes de iniciar a aplicação. As migrations devem ser aplicadas ao projeto Cloud pelo fluxo de banco escolhido para esse ambiente.

## Primeiro Usuário Interno

O login do GaragemERP utiliza o Supabase Auth em conjunto com o sistema interno de usuários da aplicação.

Para que um usuário possa acessar o sistema, é necessário existir:

- um usuário no Supabase Auth (`auth.users`)
- um usuário interno vinculado em `public.users`

Para criar o primeiro administrador interno, crie um usuário no Supabase Auth e execute a função abaixo no SQL Editor do ambiente correspondente (Cloud ou Studio local).

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

O desenvolvimento normal usa o Supabase Cloud configurado no `.env`:

### Supabase Cloud (padrão)

```text
Node.js
   │
   └── GaragemERP
           │
           ▼
      Supabase Cloud
```

`npm run dev` conecta ao projeto Cloud configurado em `.env`. O pacote self-hosted é um ambiente independente, iniciado com `npm run selfhosted:up` e servido em containers pelo Docker Compose.

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
