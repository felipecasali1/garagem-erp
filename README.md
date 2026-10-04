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

* Node.js 22.12.0 ou superior (a versão mínima também está em `.nvmrc`)
* npm
* Para o caminho principal, Docker Desktop ou outro runtime compatível com a API do Docker. Se optar pelo Supabase Cloud, Docker não é necessário.
* Um projeto Supabase, que pode ser:
  * **Supabase Local self-hosted** — caminho principal, executado localmente pela Supabase CLI e Docker
  * **Supabase Cloud (remoto)** — alternativa opcional

> Docker é necessário para usar o Supabase Local, mas não para executar a aplicação apontada para um projeto Cloud.

## Configuração do Supabase

O caminho recomendado para uma instalação reproduzível é o **Supabase Local self-hosted**. O Supabase Cloud continua disponível como alternativa.

### Supabase Local self-hosted (principal)

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

Esse comando mostra as URLs e chaves geradas pela CLI. Para configurar manualmente o `.env` atual, use `API_URL` em `VITE_SUPABASE_URL` e `SUPABASE_URL`, `ANON_KEY` em `VITE_SUPABASE_ANON_KEY`, `PUBLISHABLE_KEY` em `SUPABASE_PUBLISHABLE_KEY` e `SERVICE_ROLE_KEY` em `SUPABASE_SERVICE_KEY`. Não versione `.env` nem compartilhe a saída do comando: `SERVICE_ROLE_KEY`/`SECRET_KEY` são privilegiadas e devem ficar apenas no servidor.

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

### Supabase Cloud (alternativa opcional)

Crie um projeto no [Supabase](https://supabase.com/) e use as credenciais fornecidas pelo painel. As migrations podem ser aplicadas pelo fluxo de deploy de banco de dados escolhido para o projeto.

O stack local e o projeto Cloud são ambientes separados: iniciar o Supabase Local não altera os valores de conexão da aplicação. Até a integração prevista no ticket #4, a aplicação continua usando as variáveis do `.env`; escolha as credenciais do ambiente desejado sem versionar esse arquivo.

No modo de desenvolvimento, reinicie `npm run dev` depois de alterar essas variáveis. Em produção, `VITE_*` é incorporado ao bundle, portanto é necessário executar um novo build para trocar o destino.

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

Depois de configurar o Supabase, remoto ou local, instale as dependências usando o fluxo npm do projeto:

```bash
npm ci
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

O projeto pode utilizar tanto um banco Supabase remoto quanto uma instância Supabase Local.

No Supabase Local, as migrations são aplicadas pela CLI ao iniciar o stack. Use `npm run supabase:test` para verificar a autorização/RLS localmente. Não execute `db reset` como etapa de setup: esse comando é destrutivo.

## Primeiro Usuário Interno

O login do GaragemERP utiliza o Supabase Auth em conjunto com o sistema interno de usuários da aplicação.

Para que um usuário possa acessar o sistema, é necessário existir:

* um usuário no Supabase Auth (`auth.users`)
* um usuário interno vinculado em `public.users`

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

### Supabase Cloud (alternativa)

```text
Node.js
   │
   └── GaragemERP
           │
           ▼
      Supabase Cloud
```

É uma alternativa quando for necessário desenvolver conectado a um projeto remoto. O caminho principal do projeto é o Supabase Local.

### Supabase Local self-hosted (principal)

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

O smoke test automatizado pode ser executado com `npm run smoke:production`. A distribuição em Docker com o Supabase self-hosted será tratada nos tickets seguintes; VPS, domínio e HTTPS continuam fora desta fase.

## Variáveis de Ambiente e Segurança

Nunca versione arquivos `.env` contendo credenciais reais.

Utilize o arquivo:

```text
.env.example
```

como referência para configurar o ambiente.

Credenciais sensíveis, especialmente a `SUPABASE_SERVICE_KEY`, devem ser armazenadas como variáveis de ambiente nos ambientes de desenvolvimento e produção.

A chave de serviço não deve ser enviada ao navegador, incluída no bundle do frontend ou publicada em repositórios públicos.
