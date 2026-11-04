# Instalação local via Docker Compose

Este fluxo sobe a aplicação e um Supabase self-hosted para uso local pelo Docker Compose. Ele não substitui o fluxo normal de desenvolvimento: `npm run dev` continua carregando o Supabase Cloud do `.env`; `npm run selfhosted:up` usa exclusivamente o arquivo local `.env.compose`.

## Pré-requisitos

- Docker Engine ou runtime compatível com Docker Compose v2.
- Node.js 22.12.0 ou superior e dependências instaladas (`npm ci`).
- Pelo menos 2 CPUs e 4 GiB de memória disponíveis ao daemon Docker.
- Espaço em disco para baixar as imagens do Supabase e construir a aplicação.

## Iniciar

```bash
npm run selfhosted:up
```

Na primeira execução, o comando cria `.env.compose` com segredos aleatórios e permissões `0600`, valida o acesso ao Docker, constrói a imagem da aplicação e sobe os serviços. O arquivo é ignorado pelo Git. Guarde-o junto com os volumes do banco e do Storage: as credenciais são necessárias para reabrir uma instalação existente.

Quando o healthcheck passar:

- GaragemERP: <http://127.0.0.1:3101/login>
- Supabase Studio: <http://127.0.0.1:8000> — use o usuário e a senha básica registrados em `.env.compose`.

No Studio, crie o primeiro usuário em **Authentication → Users**. Depois vincule-o a `public.users` seguindo as instruções de primeiro administrador no README. O Supabase Auth está configurado para confirmação automática de e-mail local; o cadastro público permanece desativado.

O serviço de migrações aguarda Postgres, Auth e Storage ficarem saudáveis, aplica cada arquivo SQL versionado em uma transação e registra a versão em `supabase_migrations.schema_migrations`. Versões já registradas não são reaplicadas. A inicialização não executa `db reset`, não apaga nem recria os volumes.

## Verificar e parar

```bash
npm run selfhosted:healthcheck
npm run selfhosted:down
```

O comando de parada remove os containers e a rede, mas preserva os volumes `garagem-erp-db` e `garagem-erp-storage`. A próxima execução de `selfhosted:up` reinicia os serviços e verifica migrations pendentes. Não use `docker compose down -v` para uma parada normal: `-v` apagaria os dados persistidos.

As portas da aplicação e do gateway são publicadas apenas em `127.0.0.1`; o Postgres não publica porta no host. Dentro da rede Docker, a aplicação usa `http://api-gw:8000`. O navegador usa `http://127.0.0.1:8000`. O `.env` Cloud e `.env.docker` não são lidos pelo Compose. Se alterar as portas em `.env.compose`, as URLs internas e os redirecionamentos são derivados delas.

## Validar concorrência de preparação

```bash
npm run test:integration:vehicle-preparation
```

O teste inicia um projeto Compose descartável, aplica as migrations e executa cenários de venda e preparação com requisições autenticadas ao PostgREST. Ele remove o projeto e o volume temporários ao terminar e não usa `.env.compose`, as credenciais Cloud nem o volume da instalação local.

`npm run test:integration:sales` permanece como alias de compatibilidade e executa a mesma suíte combinada.

Este recorte inclui Postgres, Auth, PostgREST, Storage, Studio, gateway e aplicação. A galeria usa um bucket privado e o backend de arquivos persiste no volume `garagem-erp-storage`; as imagens são otimizadas no navegador antes do envio. Realtime, Edge Functions, pooler, imgproxy e observabilidade não são iniciados. As imagens de Supabase estão fixadas na versão da configuração self-hosted `v0.8.3` (commit `bc27d2661edd09a5d0b8d76ce33da6d4071a756e`). Os pequenos arquivos de bootstrap do banco e do gateway são adaptações da configuração oficial Supabase, licenciada sob Apache-2.0. Um backup futuro precisa copiar o volume de Storage junto com o banco para manter registros e arquivos consistentes.

## Galeria privada de veículos

No detalhe do veículo, os papéis `admin`, `manager` e `seller` podem enviar várias fotos, selecionar uma imagem para visualização e substituir ou remover uma foto. A galeria acompanha o veículo, inclusive quando ele retorna ao estoque; não é criado um álbum por compra. O limite de 15 fotos é aplicado pelo PostgreSQL com bloqueio do veículo, inclusive em envios simultâneos. Use **Definir como principal** na foto desejada para escolher a imagem das prévias compactas de veículos, vendas e compras. A seleção é persistente e única por veículo; substituir a imagem mantém sua seleção, enquanto remover a principal deixa o veículo sem uma prévia até uma nova escolha explícita.

Cada arquivo tem seu próprio resultado e sua própria tentativa de envio. **Tentar novamente** reutiliza essa identificação para evitar duplicar fotos já confirmadas. Os formatos de entrada são JPEG, PNG e WebP; o navegador gera apenas um JPEG otimizado com até 1920 px no lado maior e 5 MB, sem guardar o original.

Se a remoção for interrompida, a foto aparece como **Remoção pendente** até **Tentar remoção** concluir a exclusão dos arquivos e do registro. Essa vaga continua ocupada enquanto a remoção não termina. Arquivos de envios ou substituições anteriores que ainda precisem de limpeza têm uma ação de verificação; ela confirma que o arquivo não está em uso antes de removê-lo.

```bash
npm run test:integration:vehicle-photos
```

O teste usa um banco e um volume de Storage descartáveis. Ele cobre os resultados por arquivo, repetição segura, concorrência na última vaga, seleção concorrente de principal, substituição, remoção interrompida, importação do campo antigo, autorização e persistência após reiniciar o Storage. As credenciais Cloud e os volumes da instalação habitual não são utilizados.

## Migração das imagens antigas

A migration `20261103100000_select_vehicle_photo_preview_and_retire_legacy_image.sql` inspeciona `vehicles.image`, preserva cada valor não vazio em `vehicle_legacy_photo_imports` e informa as contagens de referências e valores vazios. Ela atualiza os comandos transacionais de cadastro/edição antes de retirar a coluna antiga. A galeria passa a ser a única fonte de imagens exibidas pela aplicação; as referências preservadas são um registro de importação e recuperação.

Se houver uma referência, o detalhe do veículo mostra **Imagem antiga aguardando importação**. **Importar imagem antiga** busca um link HTTP(S) ou uma imagem `data:`, aplica a mesma otimização dos novos envios e salva uma única foto privada. A imagem original externa não é apagada. Repetir a importação ou retomar uma confirmação interrompida reutiliza a mesma identificação para evitar duplicações. A importação não escolhe a principal automaticamente.

Links expirados, bloqueios de CORS do servidor de origem, formatos não suportados ou uma galeria cheia mantêm a referência e o motivo da falha em estado de recuperação. Use o link de recuperação para baixar a imagem e **Selecionar arquivo para recuperação**, ou libere uma vaga e tente novamente. O download de referências antigas é limitado a 20 MB antes da otimização. A captura de referências acontece na migration; o download é iniciado pelo usuário na tela.

Para conferir referências ainda pendentes no SQL Editor:

```sql
select vehicle_id, source_kind, status, last_error, captured_at
from public.vehicle_legacy_photo_imports
where status <> 'imported'
order by vehicle_id;
```

O campo `original_value` permanece disponível nessa tabela para recuperação explícita, inclusive quando uma referência não é um link válido. Seu acesso segue as permissões de veículos. Nenhuma referência é descartada silenciosamente por falha de download ou processamento.

## Diagnóstico

- Se o preflight não acessar o daemon, inicie o Docker e confirme que seu usuário pode executar `docker info`.
- Se um serviço falhar, rode `docker compose --env-file .env.compose ps` e veja o serviço indicado com `docker compose --env-file .env.compose logs --tail=80 <serviço>`.
- Se `.env.compose` for perdido enquanto `garagem-erp-db` existir, restaure o arquivo original. O setup não gera chaves novas para um banco existente, pois isso impediria a autenticação no banco persistido.
- Se as portas 3101 ou 8000 estiverem ocupadas, altere `GARAGEM_LOCAL_APP_PORT` ou `GARAGEM_LOCAL_API_PORT` em `.env.compose`; as URLs públicas e de redirecionamento são derivadas desses valores.
