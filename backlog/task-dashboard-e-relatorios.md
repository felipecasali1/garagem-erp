## Task - Atualizar dashboard e relatórios com dados reais

### Objetivo

Atualizar dashboard e relatórios para refletirem dados reais dos módulos persistidos.

### Contexto

O dashboard é útil para demonstrar o produto, mas deve evoluir para indicadores reais conforme compras, vendas, estoque e financeiro forem conectados ao Supabase.

Veículos, compras e preparação já avançaram. A consolidação do dashboard deve acontecer depois do fluxo real de vendas, porque vendas definem receita, margem realizada, comissões e giro de estoque.

### Escopo

- Revisar cards/KPIs do dashboard.
- Trocar dados mock por consultas reais. Concluído no dashboard inicial.
- Mostrar estoque por status. Concluído no dashboard inicial.
- Mostrar vendas do período. Concluído no dashboard inicial.
- Mostrar margem estimada/realizada.
- Mostrar contas vencidas. Concluído no dashboard inicial.
- Mostrar veículos em preparação. Concluído no dashboard inicial.
- Mostrar comissões pendentes, quando o módulo estiver pronto.

### Regras de negócio

- Dashboard deve refletir filtros e status reais.
- Veículos arquivados não devem distorcer métricas operacionais principais.
- Vendas canceladas não devem contar como receita concluída.
- Compras canceladas não devem contar como custo realizado.

### Dependências

- Compras reais: parcialmente atendido.
- Veículos com status consistente: parcialmente atendido.
- Vendas reais: próxima dependência principal.
- Financeiro real: depende da integração de vendas, parcelas e comissões.

### Critérios de aceite

- Indicadores principais vêm do Supabase.
- Métricas deixam claro o período analisado.
- Dados cancelados/arquivados são tratados corretamente.
- Dashboard não exibe números fixos ou demonstrativos sem identificação.

### Progresso atual

- Dashboard inicial agora usa veículos, vendas, checklist e transações financeiras reais.
- Série de receita vs despesas usa transações persistidas por mês, sem geração sintética de dias.
- Cards principais deixam explícito que o mês atual considerado é agosto de 2026.
- Ainda falta amadurecer margem realizada/estimada e comissões pendentes.
