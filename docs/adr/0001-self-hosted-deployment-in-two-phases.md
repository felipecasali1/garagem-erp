# Self-hosted deployment in two phases

O GaragemERP será distribuído inicialmente como uma instalação isolada por garagem, com o Supabase self-hosted como caminho principal. A primeira fase deve permitir executar a aplicação e o stack self-hosted localmente em Docker no notebook, para garantir uma entrega reproduzível do TCC; uma segunda fase poderá adicionar a implantação em VPS com domínio, HTTPS, backups externos e atualização versionada para um piloto real. Essa separação mantém o aprendizado de implantação dentro do projeto sem tornar a entrega acadêmica dependente de um VPS.

## Consequências

- O sistema não será multiempresa no primeiro ciclo: cada garagem terá sua própria instalação e banco.
- O stack local de desenvolvimento e a distribuição self-hosted de produção devem ser tratados como modos diferentes, embora compartilhem migrations e configuração do projeto.
- O Supabase Cloud permanece uma alternativa opcional, não uma dependência do desenho principal.
- Alta disponibilidade, Kubernetes e operação empresarial ficam fora do escopo inicial.
