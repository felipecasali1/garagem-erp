import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Eye, MoreHorizontal } from "lucide-react";
import { PageHeader } from "@/shared/components/layout/page-header";
import { Card } from "@/shared/components/ui/card";
import { Button } from "@/shared/components/ui/button";
import { StatusBadge } from "@/shared/components/status-badge";
import { brl, fmtDate } from "@/shared/lib/format";
import { listPurchases, purchaseKeys } from "@/modules/purchases/services/purchases";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/components/ui/table";

export const Route = createFileRoute("/_app/purchases/")({
  head: () => ({ meta: [{ title: "Compras | GaragemERP" }] }),
  component: PurchasesPage,
});

function PurchasesPage() {
  const navigate = useNavigate();
  const { data: purchases = [], isLoading, error } = useQuery({
    queryKey: purchaseKeys.all,
    queryFn: listPurchases,
  });

  if (error) {
    return (
      <div className="max-w-[1600px] mx-auto py-10 text-sm text-destructive">
        Falha ao carregar compras: {error instanceof Error ? error.message : "erro desconhecido"}.
      </div>
    );
  }

  return (
    <div className="max-w-[1600px] mx-auto">
      <PageHeader
        title="Compras de Veículos"
        description={`${purchases.length} compras`}
        action={{ label: "Registrar Compra", onClick: () => navigate({ to: "/purchases/new" }) }}
      />
      <Card>
        {isLoading ? (
          <div className="p-8 text-sm text-muted-foreground">Carregando compras...</div>
        ) : purchases.length === 0 ? (
          <div className="p-12 text-center space-y-2">
            <h3 className="font-display font-semibold">Nenhuma compra registrada</h3>
            <p className="text-sm text-muted-foreground">
              Registre a primeira compra a partir de uma avaliação de veículo.
            </p>
            <Button onClick={() => navigate({ to: "/purchases/new" })}>Registrar Compra</Button>
          </div>
        ) : (
          <Table>
          <TableHeader>
            <TableRow>
              <TableHead>#ID</TableHead>
              <TableHead>Veículo</TableHead>
              <TableHead>Fornecedor</TableHead>
              <TableHead className="text-right">Valor Pago</TableHead>
              <TableHead>Data</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {purchases.map((p) => (
              <TableRow
                key={p.id}
                className="cursor-pointer"
                onClick={() => navigate({ to: "/purchases/$id", params: { id: String(p.id) } })}
              >
                <TableCell className="font-mono text-xs text-muted-foreground">#{p.id}</TableCell>
                <TableCell>
                  <div className="text-sm font-medium">
                    {p.vehicle.brand} {p.vehicle.model}
                  </div>
                  <span className="plate-chip">{p.vehicle.plate}</span>
                </TableCell>
                <TableCell>{p.supplier.name}</TableCell>
                <TableCell className="text-right font-semibold">{brl(p.total_value)}</TableCell>
                <TableCell className="text-muted-foreground">{fmtDate(p.purchase_date)}</TableCell>
                <TableCell>
                  <StatusBadge kind="purchase" value={p.status} />
                </TableCell>
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <div className="flex justify-end gap-1">
                    <Button size="icon" variant="ghost" aria-label={`Ver compra ${p.id}`} onClick={() => navigate({ to: "/purchases/$id", params: { id: String(p.id) } })}>
                      <Eye className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={`Mais ações para compra ${p.id}`}
                    >
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
