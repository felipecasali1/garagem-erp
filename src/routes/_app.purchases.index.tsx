import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Eye, MoreHorizontal } from "lucide-react";
import { PageHeader } from "@/shared/components/layout/page-header";
import { Card } from "@/shared/components/ui/card";
import { Button } from "@/shared/components/ui/button";
import { StatusBadge } from "@/shared/components/status-badge";
import { brl, fmtDate } from "@/shared/lib/format";
import { purchases } from "@/shared/mock-data";
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
  return (
    <div className="max-w-[1600px] mx-auto">
      <PageHeader
        title="Compras de Veículos"
        description={`${purchases.length} compras`}
        action={{ label: "Registrar Compra", onClick: () => navigate({ to: "/purchases/new" }) }}
      />
      <Card>
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
      </Card>
    </div>
  );
}
