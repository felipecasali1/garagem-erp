import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Car, Building2, Calendar, Receipt } from "lucide-react";
import { Card, CardContent } from "@/shared/components/ui/card";
import { Button } from "@/shared/components/ui/button";
import { Separator } from "@/shared/components/ui/separator";
import { StatusBadge } from "@/shared/components/status-badge";
import { purchases } from "@/shared/mock-data";
import { brl, fmtDate } from "@/shared/lib/format";

export const Route = createFileRoute("/_app/purchases/$id")({
  head: () => ({ meta: [{ title: "Compra | GaragemERP" }] }),
  component: PurchaseDetail,
});

function PurchaseDetail() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const p = purchases.find((x) => String(x.id) === id);

  if (!p) {
    return (
      <div className="max-w-2xl mx-auto text-center py-20">
        <h2 className="font-display text-xl mb-2">Compra não encontrada</h2>
        <Button onClick={() => navigate({ to: "/purchases" })}>Voltar</Button>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/purchases">
            <ArrowLeft className="h-4 w-4" /> Compras
          </Link>
        </Button>
        <div className="flex-1">
          <div className="text-xs text-muted-foreground font-mono">COMPRA #{p.id}</div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">
            {p.vehicle.brand} {p.vehicle.model}
          </h1>
        </div>
        <StatusBadge kind="purchase" value={p.status} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center gap-2 mb-4 text-sm font-medium text-muted-foreground">
                <Car className="h-4 w-4" /> Veículo adquirido
              </div>
              <div className="flex items-start gap-4">
                <div className="h-20 w-28 rounded-md bg-muted flex items-center justify-center">
                  <Car className="h-8 w-8 text-muted-foreground" />
                </div>
                <div className="flex-1">
                  <div className="font-display font-semibold text-lg">
                    {p.vehicle.brand} {p.vehicle.model}
                  </div>
                  <div className="text-sm text-muted-foreground">{p.vehicle.version}</div>
                  <div className="flex flex-wrap gap-3 mt-2 text-xs text-muted-foreground">
                    <span className="plate-chip">{p.vehicle.plate}</span>
                    <span>{p.vehicle.color}</span>
                    <span>{p.vehicle.model_year}</span>
                    <span>{p.vehicle.current_mileage.toLocaleString("pt-BR")} km</span>
                  </div>
                </div>
                <Button variant="outline" size="sm" asChild>
                  <Link to="/vehicles/$id" params={{ id: String(p.vehicle.id) }}>
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
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Valor pago</span>
                  <span className="font-display font-semibold text-lg">{brl(p.total_value)}</span>
                </div>
                <Separator />
                <div className="flex items-center justify-between text-muted-foreground">
                  <span>Preço de venda projetado</span>
                  <span>{brl(p.vehicle.sale_price)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Margem projetada</span>
                  <span
                    className={
                      p.vehicle.sale_price - p.total_value >= 0
                        ? "text-success font-semibold"
                        : "text-destructive font-semibold"
                    }
                  >
                    {brl(p.vehicle.sale_price - p.total_value)}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardContent className="p-6 space-y-3">
              <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <Building2 className="h-4 w-4" /> Fornecedor
              </div>
              <div className="font-medium">{p.supplier.name}</div>
              <div className="text-xs text-muted-foreground space-y-1">
                <div>{p.supplier.cnpj ?? p.supplier.cpf}</div>
                <div>{p.supplier.email}</div>
                <div>{p.supplier.phone}</div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6 space-y-2 text-sm">
              <div className="flex items-center gap-2 text-muted-foreground text-xs">
                <Calendar className="h-3.5 w-3.5" /> Data da compra
              </div>
              <div className="font-medium">{fmtDate(p.purchase_date)}</div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
