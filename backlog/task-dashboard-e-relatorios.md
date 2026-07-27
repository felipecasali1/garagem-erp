## Task - Atualizar dashboard e relatórios com dados reais

### Objetivo

Atualizar dashboard e relatórios para refletirem dados reais dos módulos persistidos.

### Contexto

O dashboard é útil para demonstrar o produto, mas deve evoluir para indicadores reais conforme compras, vendas, estoque e financeiro forem conectados ao Supabase.

### Escopo

- Revisar cards/KPIs do dashboard.
- Trocar dados mock por consultas reais.
- Mostrar estoque por status.
- Mostrar vendas do período.
- Mostrar margem estimada/realizada.
- Mostrar contas vencidas.
- Mostrar veículos em preparação.
- Mostrar comissões pendentes, quando o módulo estiver pronto.

### Regras de negócio

- Dashboard deve refletir filtros e status reais.
- Veículos arquivados não devem distorcer métricas operacionais principais.
- Vendas canceladas não devem contar como receita concluída.
- Compras canceladas não devem contar como custo realizado.

### Dependências

- Compras reais.
- Vendas reais.
- Financeiro real.
- Veículos com status consistente.

### Critérios de aceite

- Indicadores principais vêm do Supabase.
- Métricas deixam claro o período analisado.
- Dados cancelados/arquivados são tratados corretamente.
- Dashboard não exibe números fixos ou demonstrativos sem identificação.
