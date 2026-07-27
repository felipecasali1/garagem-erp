## Task - Consolidar cadastros base

### Objetivo

Registrar que clientes e funcionários estão em uma etapa funcional por enquanto, mas ainda precisam de pequenos ajustes de consistência para servirem como base dos próximos fluxos.

### Contexto

Clientes e funcionários já são cadastros fundamentais do sistema. Eles alimentam compras, vendas, comissões, financeiro e controle de acesso.

Por enquanto, esses módulos não devem receber grandes mudanças de escopo. O foco deve ser manter estabilidade e corrigir apenas o que impactar os próximos fluxos.

### Escopo

- Revisar listagem, detalhe, criação e edição de clientes.
- Revisar listagem, detalhe, criação e edição de funcionários.
- Confirmar que pessoas são reaproveitadas por CPF/CNPJ quando fizer sentido.
- Confirmar que funcionário e acesso ao sistema continuam separados.
- Confirmar que cliente e funcionário podem ser desativados/arquivados, mas não apagados fisicamente.

### Fora de escopo por enquanto

- Histórico completo de compras/vendas dentro do cliente.
- Histórico completo de comissões dentro do funcionário.
- Relatórios avançados por cliente ou funcionário.
- Permissões refinadas por campo.

### Critérios de aceite

- Cliente pode ser criado, editado, visualizado e arquivado/desarquivado.
- Funcionário pode ser criado, editado, visualizado e ativado/desativado.
- Funcionário inativo não aparece em seleções operacionais novas.
- Cliente arquivado não deve aparecer em seleções operacionais novas quando isso for implementado nos fluxos de venda.
- Nenhuma dessas entidades possui exclusão física na UI.

### Observação

Esta task é mais de estabilização do que de construção. Se clientes e funcionários estiverem bons o suficiente para compras/vendas, ela pode ser considerada concluída temporariamente.
