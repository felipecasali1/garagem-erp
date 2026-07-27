# GaragemERP

GaragemERP é um sistema ERP para garagens e revendas de veículos seminovos. O sistema contempla o fluxo operacional de estoque de veículos, compras, checklists de preparação, clientes, funcionários, vendas, comissões, registros financeiros e gerenciamento de usuários internos.

## Stack

* React 19
* TanStack Start
* TanStack Router
* TanStack Query
* Vite
* TypeScript
* Tailwind CSS
* Supabase

## Requisitos

Para executar o GaragemERP localmente, você precisa de:

* Node.js 22 ou superior
* npm
* Um projeto Supabase, que pode ser:

  * **Supabase Cloud (remoto)** — recomendado para desenvolvimento e utilizado no ambiente de desenvolvimento do projeto
  * **Supabase Local** — opcional, executado localmente através da Supabase CLI e Docker

> **Docker não é obrigatório para executar o GaragemERP.** Ele é necessário apenas caso você escolha utilizar uma instância local do Supabase.

## Configuração do Supabase

O projeto permite escolher entre utilizar um projeto **Supabase remoto** ou uma instância **Supabase Local**.

### Opção 1 — Supabase Cloud (recomendado)

Esta é a opção recomendada para a maioria dos desenvolvedores e é a configuração utilizada durante o desenvolvimento do GaragemERP.

Crie um projeto no [Supabase](https://supabase.com/) e utilize as credenciais fornecidas pelo projeto.

O fluxo geral é:

```text
GaragemERP
    │
    │ API / Supabase SDK
    ▼
Supabase Cloud
    ├── PostgreSQL
    ├── Auth
    └── outros serviços utilizados pela aplicação
```

### Opção 2 — Supabase Local

Também é possível executar o ambiente do Supabase localmente para desenvolvimento.

Para isso, é necessário instalar a [Supabase CLI](https://supabase.com/docs/guides/cli) e o [Docker](https://docs.docker.com/).

Após instalar as ferramentas necessárias:

```bash
supabase start
```

O Supabase CLI iniciará os serviços locais necessários utilizando Docker.

Para aplicar as migrations ao banco local:

```bash
supabase db push
```

Depois de executar `supabase start`, utilize as credenciais e URLs fornecidas pelo CLI para configurar o arquivo `.env`.

> O uso do Supabase Local é opcional. Você pode rodar o GaragemERP utilizando um projeto Supabase Cloud.

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

Essas variáveis são utilizadas pelo código executado no servidor.

A `SUPABASE_SERVICE_KEY` fornece acesso privilegiado aos recursos do Supabase e é utilizada em operações que exigem permissões administrativas, como o gerenciamento de usuários do Supabase Auth.

### Variáveis do cliente

```env
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

Essas variáveis são utilizadas pelo cliente da aplicação executado no navegador.

A chave pública/anon pode ser utilizada no código do cliente conforme o modelo de segurança do Supabase e as políticas de Row Level Security (RLS) configuradas no banco de dados.

> **Nunca exponha a ****`SUPABASE_SERVICE_KEY`**** no código do cliente ou em deployments públicos.**
>
> A `SUPABASE_SERVICE_KEY` deve permanecer exclusivamente no ambiente do servidor.

## Setup Local

Depois de configurar o Supabase, remoto ou local, instale as dependências:

```bash
npm install
```

Inicie o servidor de desenvolvimento:

```bash
npm run dev
```

A aplicação estará disponível no endereço informado pelo servidor de desenvolvimento.

Execute os testes automatizados:

```bash
npm test
```

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

O projeto pode utilizar tanto um banco Supabase remoto quanto uma instância Supabase Local.

### Supabase Cloud

Ao utilizar um projeto Supabase remoto, aplique as migrations utilizando a Supabase CLI ou o fluxo de deploy de banco de dados adotado pelo projeto.

### Supabase Local

Para utilizar o Supabase Local, inicie os serviços:

```bash
supabase start
```

Depois, aplique as migrations:

```bash
supabase db push
```

As credenciais necessárias para configurar o `.env` podem ser obtidas através do próprio CLI do Supabase.

> Recomenda-se utilizar o Supabase Local quando for necessário trabalhar sem depender de uma conexão com o projeto remoto ou quando for desejável manter um ambiente de desenvolvimento completamente local.

## Primeiro Usuário Interno

O login do GaragemERP utiliza o Supabase Auth em conjunto com o sistema interno de usuários da aplicação.

Para que um usuário possa acessar o sistema, é necessário existir:

* um usuário no Supabase Auth (`auth.users`)
* um usuário interno vinculado em `public.users`

Para criar o primeiro administrador interno, primeiro crie um usuário no Supabase Auth com o e-mail desejado.

Depois, execute a função de bootstrap:

```sql
select public.bootstrap_internal_user(
  'admin@example.com',
  'Administrador'
);
```

Por padrão, essa função cria os registros relacionados em:

* `people`
* `employees`
* `users`

com acesso de administrador.

Depois que o primeiro administrador existir, novos usuários do sistema devem ser provisionados através do fluxo:

```text
Configurações > Usuários
```

## Estrutura do Projeto

A aplicação é organizada em módulos relacionados às principais áreas do ERP, incluindo:

* Dashboard
* Veículos e estoque
* Compras
* Checklists de preparação
* Clientes
* Funcionários
* Vendas
* Comissões
* Financeiro
* Usuários e configurações

A estrutura de dados e as alterações no banco são versionadas através das migrations localizadas em:

```text
supabase/migrations
```

## Desenvolvimento

O GaragemERP pode ser desenvolvido utilizando uma das seguintes configurações:

### Supabase Cloud

```text
Node.js
   │
   └── GaragemERP
           │
           ▼
      Supabase Cloud
```

Esta é a configuração recomendada e utilizada no desenvolvimento atual do projeto.

### Supabase Local

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

Nesta configuração, o Docker é utilizado para executar os serviços locais do Supabase.

## Produção

A arquitetura de produção pode ser definida independentemente do ambiente de desenvolvimento.

É possível utilizar:

* Frontend hospedado em uma plataforma de deploy compatível com TanStack Start
* Supabase Cloud como infraestrutura de banco de dados e serviços
* Ou uma infraestrutura própria com Supabase self-hosted, caso necessário

O uso do Supabase Local é destinado principalmente ao desenvolvimento e não deve ser confundido com uma infraestrutura de produção.

## Variáveis de Ambiente e Segurança

Nunca versione arquivos `.env` contendo credenciais reais.

Utilize o arquivo:

```text
.env.example
```

como referência para configurar o ambiente.

Credenciais sensíveis, especialmente a `SUPABASE_SERVICE_KEY`, devem ser armazenadas como variáveis de ambiente nos ambientes de desenvolvimento e produção.

A chave de serviço não deve ser enviada ao navegador, incluída no bundle do frontend ou publicada em repositórios públicos.