# Instalação local via Docker Compose

Este fluxo sobe a aplicação e um Supabase self-hosted para uso local, sem depender da Supabase CLI no host. Ele não substitui o fluxo normal de desenvolvimento: `npm run dev` continua carregando o Supabase Cloud do `.env`; `npm run selfhosted:up` usa exclusivamente o arquivo local `.env.compose`.

## Pré-requisitos

- Docker Engine ou runtime compatível com Docker Compose v2.
- Node.js 22.12.0 ou superior e dependências instaladas (`npm ci`).
- Pelo menos 2 CPUs e 4 GiB de memória disponíveis ao daemon Docker.
- Espaço em disco para baixar as imagens do Supabase e construir a aplicação.

## Iniciar

```bash
npm run selfhosted:up
```

Na primeira execução, o comando cria `.env.compose` com segredos aleatórios e permissões `0600`, valida o acesso ao Docker, constrói a imagem da aplicação e sobe os serviços. O arquivo é ignorado pelo Git. Guarde-o junto com o volume do banco: as credenciais são necessárias para reabrir uma instalação existente.

Quando o healthcheck passar:

- GaragemERP: <http://127.0.0.1:3101/login>
- Supabase Studio: <http://127.0.0.1:8000> — use o usuário e a senha básica registrados em `.env.compose`.

No Studio, crie o primeiro usuário em **Authentication → Users**. Depois vincule-o a `public.users` seguindo as instruções de primeiro administrador no README. O Supabase Auth está configurado para confirmação automática de e-mail local; o cadastro público permanece desativado.

O serviço de migrações aguarda Postgres e Auth ficarem saudáveis, aplica cada arquivo SQL versionado em uma transação e registra a versão em `supabase_migrations.schema_migrations`. Versões já registradas não são reaplicadas. A inicialização não executa `db reset`, não apaga nem recria o volume.

## Verificar e parar

```bash
npm run selfhosted:healthcheck
npm run selfhosted:down
```

O comando de parada remove os containers e a rede, mas preserva o volume `garagem-erp-db`. A próxima execução de `selfhosted:up` reinicia os serviços e verifica migrations pendentes. Não use `docker compose down -v` para uma parada normal: `-v` apagaria os dados persistidos.

As portas da aplicação e do gateway são publicadas apenas em `127.0.0.1`; o Postgres não publica porta no host. Dentro da rede Docker, a aplicação usa `http://api-gw:8000`. O navegador usa `http://127.0.0.1:8000`. O `.env` Cloud e `.env.docker` não são lidos pelo Compose. Se alterar as portas em `.env.compose`, as URLs internas e os redirecionamentos são derivados delas.

Este recorte inclui Postgres, Auth, PostgREST, Studio, gateway e aplicação. Storage de arquivos/fotos, Realtime, Edge Functions, pooler e observabilidade não são iniciados porque não são usados pelo escopo atual do ERP. As imagens de Supabase estão fixadas na versão da configuração self-hosted `v0.8.3` (commit `bc27d2661edd09a5d0b8d76ce33da6d4071a756e`). Os pequenos arquivos de bootstrap do banco e do gateway são adaptações da configuração oficial Supabase, licenciada sob Apache-2.0.

## Diagnóstico

- Se o preflight não acessar o daemon, inicie o Docker e confirme que seu usuário pode executar `docker info`.
- Se um serviço falhar, rode `docker compose --env-file .env.compose ps` e veja o serviço indicado com `docker compose --env-file .env.compose logs --tail=80 <serviço>`.
- Se `.env.compose` for perdido enquanto `garagem-erp-db` existir, restaure o arquivo original. O setup não gera chaves novas para um banco existente, pois isso impediria a autenticação no banco persistido.
- Se as portas 3101 ou 8000 estiverem ocupadas, altere `GARAGEM_LOCAL_APP_PORT` ou `GARAGEM_LOCAL_API_PORT` em `.env.compose`; as URLs públicas e de redirecionamento são derivadas desses valores.
