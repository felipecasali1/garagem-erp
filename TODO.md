## Baixa Prioridade

- arrumar tabelas
    - arrumar o "publicado"
- arrumar ponteiro do mouse em lugares clicáveis
- facilitar edições rápidas de status e publicação
- ajustar os inputs de data conforme o do cadastro de novo funcionário

## Média Prioridade

- adaptar frontend para receber os dados do Supabase nas tabelas, estatísticas e outros
- clientes e endereços já estão com persistência real; próximo passo é conectar vendas/purchases para fechar o histórico
- definir a questão dos níveis de acesso e como isso será feito no Supabase
- finalizar o fluxo de provisionamento de acesso para funcionários existentes, sem misturar cadastro operacional com login do sistema
- concluir a navegação baseada em `access_role` para esconder e limitar áreas administrativas conforme o perfil
- consolidar a política de exclusão versus arquivamento para clientes, fornecedores e funcionários usados em vendas/compras para não perder histórico, priorizando desativação quando houver vínculo com vendas ou compras

## Alta Prioridade

- proteger as rotas com autenticação dependendo do nivel de acesso
