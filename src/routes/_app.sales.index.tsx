import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { Eye, MoreHorizontal, Search } from "lucide-react";
import { PageHeader } from "@/shared/components/layout/page-header";
import { Card, CardContent } from "@/shared/components/ui/card";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { StatusBadge } from "@/shared/components/status-badge";
import { brl, fmtDate, initials } from "@/shared/lib/format";
import { Avatar, AvatarFallback } from "@/shared/components/ui/avatar";
import { listSalesPage, saleKeys } from "@/modules/sales/services/sales";
import { ListPagination } from "@/shared/components/list-pagination";
import { DEFAULT_PAGE_SIZE, getPaginationState, normalizePage } from "@/shared/lib/pagination";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/components/ui/table";

export const Route = createFileRoute("/_app/sales/")({
  head: () => ({ meta: [{ title: "Vendas | GaragemERP" }] }),
  validateSearch: (search: {
    page?: unknown;
    q?: unknown;
    status?: unknown;
  }): {
    page?: number;
    q?: string;
    status?: "pending";
  } => ({
    page: normalizePage(search.page),
    q: typeof search.q === "string" && search.q.trim() ? search.q.trim() : undefined,
    status: search.status === "pending" ? "pending" : undefined,
  }),
  component: SalesPage,
});

function SalesPage() {
  const navigate = useNavigate();
  const { page: rawPage, q, status: statusFilter } = Route.useSearch();
  const page = rawPage ?? 1;
  const {
    data: salesPage,
    isLoading,
    error,
  } = useQuery({
    queryKey: saleKeys.list({ page, search: q, status: statusFilter }),
    queryFn: () => listSalesPage({ page, search: q, status: statusFilter }),
  });
  const sales = salesPage?.data ?? [];
  const total = salesPage?.total ?? 0;
  const pageSize = salesPage?.pageSize ?? DEFAULT_PAGE_SIZE;
  const { totalPages, displayPage, range } = getPaginationState(page, total, pageSize);
  const hasFilters = Boolean(q || statusFilter);

  const updateSearch = (next: { page: number; q?: string; status?: "pending" }) => {
    void navigate({ to: "/sales", search: () => next });
  };

  useEffect(() => {
    if (!salesPage || page <= totalPages) return;
    void navigate({
      to: "/sales",
      replace: true,
      search: () => ({ page: totalPages, q, status: statusFilter }),
    });
  }, [navigate, page, q, salesPage, statusFilter, totalPages]);

  if (error) {
    return (
      <div className="max-w-[1600px] mx-auto py-10 text-sm text-destructive">
        Falha ao carregar vendas: {error instanceof Error ? error.message : "erro desconhecido"}.
      </div>
    );
  }

  return (
    <div className="max-w-[1600px] mx-auto">
      <PageHeader
        title="Vendas"
        description={
          isLoading
            ? "Carregando vendas..."
            : total === 0
              ? `0 vendas${statusFilter === "pending" ? " pendentes" : " registradas"}`
              : `${range.from}–${range.to} de ${total} vendas${statusFilter === "pending" ? " pendentes" : " registradas"}`
        }
        action={{ label: "Nova Venda", onClick: () => navigate({ to: "/sales/new" }) }}
      />

      <Card className="mb-6">
        <CardContent className="p-4 flex flex-col md:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={q ?? ""}
              onChange={(event) =>
                updateSearch({ page: 1, q: event.target.value || undefined, status: statusFilter })
              }
              placeholder="Buscar por cliente ou placa..."
              className="pl-9"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant={statusFilter == null ? "secondary" : "outline"}
              onClick={() => updateSearch({ page: 1, q })}
            >
              Todas
            </Button>
            <Button
              type="button"
              size="sm"
              variant={statusFilter === "pending" ? "secondary" : "outline"}
              onClick={() => updateSearch({ page: 1, q, status: "pending" })}
            >
              Pendentes
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        {isLoading ? (
          <div className="p-8 text-sm text-muted-foreground">Carregando vendas...</div>
        ) : sales.length === 0 ? (
          <div className="p-12 text-center space-y-2">
            <h3 className="font-display font-semibold">
              {statusFilter === "pending"
                ? q
                  ? "Nenhuma venda pendente encontrada"
                  : "Nenhuma venda pendente"
                : q
                  ? "Nenhuma venda encontrada"
                  : "Nenhuma venda registrada"}
            </h3>
            <p className="text-sm text-muted-foreground">
              {hasFilters
                ? "Tente ajustar a busca ou limpar os filtros atuais."
                : "Registre a primeira venda a partir de um veículo disponível."}
            </p>
            {!hasFilters && (
              <Button onClick={() => navigate({ to: "/sales/new" })}>Nova Venda</Button>
            )}
            {hasFilters && (
              <Button variant="outline" onClick={() => updateSearch({ page: 1 })}>
                Limpar busca e filtros
              </Button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>#ID</TableHead>
                  <TableHead>Veículo</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Vendedor</TableHead>
                  <TableHead className="text-right">Valor Total</TableHead>
                  <TableHead className="text-right">Desconto</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sales.map((s) => (
                  <TableRow
                    key={s.id}
                    className="cursor-pointer"
                    onClick={() => navigate({ to: "/sales/$id", params: { id: String(s.id) } })}
                  >
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      #{s.id}
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">
                        {s.vehicle.brand} {s.vehicle.model}
                      </div>
                      <span className="plate-chip">{s.vehicle.plate}</span>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Avatar className="h-7 w-7">
                          <AvatarFallback className="text-[10px] bg-muted">
                            {initials(s.customer.person.name)}
                          </AvatarFallback>
                        </Avatar>
                        <span className="font-medium">{s.customer.person.name}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {s.employee.person.name}
                    </TableCell>
                    <TableCell className="text-right font-semibold">{brl(s.total_value)}</TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {s.discount > 0 ? `- ${brl(s.discount)}` : "-"}
                    </TableCell>
                    <TableCell>
                      <StatusBadge kind="sale" value={s.status} />
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {fmtDate(s.sale_date)}
                    </TableCell>
                    <TableCell onClick={(event) => event.stopPropagation()}>
                      <div className="flex justify-end gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label={`Ver venda ${s.id}`}
                          asChild
                        >
                          <Link to="/sales/$id" params={{ id: String(s.id) }}>
                            <Eye className="h-4 w-4" />
                          </Link>
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label={`Mais ações para venda ${s.id}`}
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        {!isLoading && !error && total > 0 && (
          <ListPagination
            page={displayPage}
            total={total}
            pageSize={pageSize}
            className="border-t px-4 sm:px-6"
            onPageChange={(nextPage) => updateSearch({ page: nextPage, q, status: statusFilter })}
          />
        )}
      </Card>
    </div>
  );
}
