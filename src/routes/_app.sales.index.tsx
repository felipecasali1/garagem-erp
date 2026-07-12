import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Eye, MoreHorizontal, Search } from "lucide-react";
import { PageHeader } from "@/shared/components/layout/page-header";
import { Card, CardContent } from "@/shared/components/ui/card";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { StatusBadge } from "@/shared/components/status-badge";
import { brl, fmtDate, initials } from "@/shared/lib/format";
import { sales } from "@/shared/mock-data";
import { Avatar, AvatarFallback } from "@/shared/components/ui/avatar";
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
  component: SalesPage,
});

function SalesPage() {
  const navigate = useNavigate();
  return (
    <div className="max-w-[1600px] mx-auto">
      <PageHeader
        title="Vendas"
        description={`${sales.length} vendas registradas`}
        action={{ label: "Nova Venda", onClick: () => navigate({ to: "/sales/new" }) }}
      />

      <Card className="mb-6">
        <CardContent className="p-4 flex flex-col md:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar por cliente ou placa..." className="pl-9" />
          </div>
        </CardContent>
      </Card>

      <Card>
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
                <TableCell className="font-mono text-xs text-muted-foreground">#{s.id}</TableCell>
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
                <TableCell className="text-muted-foreground">{s.employee.person.name}</TableCell>
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
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <div className="flex justify-end gap-1">
                    <Button size="icon" variant="ghost" aria-label={`Ver venda ${s.id}`} onClick={() => navigate({ to: "/sales/$id", params: { id: String(s.id) } })}>
                      <Eye className="h-4 w-4" />
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
      </Card>
    </div>
  );
}
