import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Car, User, Briefcase, Calendar, Receipt, Percent } from "lucide-react";
import { Card, CardContent } from "@/shared/components/ui/card";
import { Button } from "@/shared/components/ui/button";
import { Avatar, AvatarFallback } from "@/shared/components/ui/avatar";
import { Separator } from "@/shared/components/ui/separator";
import { StatusBadge } from "@/shared/components/status-badge";
import { sales } from "@/shared/mock-data";
import { brl, fmtDate, initials } from "@/shared/lib/format";

export const Route = createFileRoute("/_app/sales/$id")({
  head: () => ({ meta: [{ title: "Venda | GaragemERP" }] }),
  component: SaleDetail,
});

function SaleDetail() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const sale = sales.find((s) => String(s.id) === id);

  if (!sale) {
    return (
      <div className="max-w-2xl mx-auto text-center py-20">
        <h2 className="font-display text-xl mb-2">Venda não encontrada</h2>
        <Button onClick={() => navigate({ to: "/sales" })}>Voltar</Button>
      </div>
    );
  }

  const commission =
    sale.employee.commission_type === "percentage"
      ? (sale.total_value * sale.employee.commission_rate) / 100
      : sale.employee.commission_rate;
  const subtotal = sale.total_value + sale.discount;
  const profit = sale.total_value - sale.vehicle.cost_price;

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/sales">
            <ArrowLeft className="h-4 w-4" /> Vendas
          </Link>
        </Button>
        <div className="flex-1">
          <div className="text-xs text-muted-foreground font-mono">VENDA #{sale.id}</div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">
            {sale.vehicle.brand} {sale.vehicle.model}
          </h1>
        </div>
        <StatusBadge kind="sale" value={sale.status} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center gap-2 mb-4 text-sm font-medium text-muted-foreground">
                <Car className="h-4 w-4" /> Veículo
              </div>
              <div className="flex items-start gap-4">
                <div className="h-20 w-28 rounded-md bg-muted flex items-center justify-center">
                  <Car className="h-8 w-8 text-muted-foreground" />
                </div>
                <div className="flex-1">
                  <div className="font-display font-semibold text-lg">
                    {sale.vehicle.brand} {sale.vehicle.model}
                  </div>
                  <div className="text-sm text-muted-foreground">{sale.vehicle.version}</div>
                  <div className="flex flex-wrap gap-3 mt-2 text-xs text-muted-foreground">
                    <span className="plate-chip">{sale.vehicle.plate}</span>
                    <span>{sale.vehicle.color}</span>
                    <span>{sale.vehicle.model_year}</span>
                    <span>{sale.vehicle.current_mileage.toLocaleString("pt-BR")} km</span>
                  </div>
                </div>
                <Button variant="outline" size="sm" asChild>
                  <Link to="/vehicles/$id" params={{ id: String(sale.vehicle.id) }}>
                    Ver veículo
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center gap-2 mb-4 text-sm font-medium text-muted-foreground">
                <Receipt className="h-4 w-4" /> Resumo financeiro
              </div>
              <div className="space-y-3 text-sm">
                <Row label="Valor bruto" value={brl(subtotal)} />
                <Row label="Desconto" value={sale.discount > 0 ? `- ${brl(sale.discount)}` : "-"} />
                <Separator />
                <Row label="Valor final" value={brl(sale.total_value)} bold />
                <Separator />
                <Row
                  label={`Comissão (${sale.employee.commission_type === "percentage"
                    ? `${sale.employee.commission_rate}%`
                    : "fixa"
                    })`}
                  value={brl(commission)}
                  muted
                />
                <Row
                  label="Custo do veículo"
                  value={brl(sale.vehicle.cost_price)}
                  muted
                />
                <Row
                  label="Lucro estimado"
                  value={brl(profit - commission)}
                  bold
                  className={profit - commission >= 0 ? "text-success" : "text-destructive"}
                />
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardContent className="p-6 space-y-4">
              <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <User className="h-4 w-4" /> Cliente
              </div>
              <Link
                to="/clients/$id"
                params={{ id: String(sale.customer.id) }}
                className="flex items-center gap-3 hover:opacity-80"
              >
                <Avatar className="h-10 w-10">
                  <AvatarFallback className="bg-primary/10 text-primary">
                    {initials(sale.customer.person.name)}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <div className="font-medium text-sm">{sale.customer.person.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {sale.customer.person.cpf ?? sale.customer.person.cnpj}
                  </div>
                </div>
              </Link>
              <Separator />
              <div className="text-xs text-muted-foreground space-y-1">
                <div>{sale.customer.person.email}</div>
                <div>{sale.customer.person.phone}</div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6 space-y-3">
              <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <Briefcase className="h-4 w-4" /> Vendedor
              </div>
              <Link
                to="/employees/$id"
                params={{ id: String(sale.employee.id) }}
                className="flex items-center gap-3 hover:opacity-80"
              >
                <Avatar className="h-10 w-10">
                  <AvatarFallback className="bg-accent/10 text-accent-foreground">
                    {initials(sale.employee.person.name)}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <div className="font-medium text-sm">{sale.employee.person.name}</div>
                  <div className="text-xs text-muted-foreground">{sale.employee.position}</div>
                </div>
              </Link>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6 space-y-2 text-sm">
              <div className="flex items-center gap-2 text-muted-foreground text-xs">
                <Calendar className="h-3.5 w-3.5" /> Data da venda
              </div>
              <div className="font-medium">{fmtDate(sale.sale_date)}</div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  bold,
  muted,
  className,
}: {
  label: string;
  value: string;
  bold?: boolean;
  muted?: boolean;
  className?: string;
}) {
  return (
    <div className={`flex items-center justify-between ${muted ? "text-muted-foreground" : ""}`}>
      <span>{label}</span>
      <span className={`${bold ? "font-display font-semibold text-base" : ""} ${className ?? ""}`}>
        {value}
      </span>
    </div>
  );
}
