import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Briefcase,
  Calendar,
  Car,
  CheckCircle2,
  Receipt,
  User,
  XCircle,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Card, CardContent } from "@/shared/components/ui/card";
import { Button } from "@/shared/components/ui/button";
import { Avatar, AvatarFallback } from "@/shared/components/ui/avatar";
import { Separator } from "@/shared/components/ui/separator";
import { StatusBadge } from "@/shared/components/status-badge";
import { ConfirmActionDialog } from "@/shared/components/confirm-action-dialog";
import { cancelSale, completeSale, getSaleById, saleKeys } from "@/modules/sales/services/sales";
import { vehicleKeys } from "@/modules/vehicles/services/vehicles";
import { brl, fmtDate, initials } from "@/shared/lib/format";
import { formatDocument, formatPhone } from "@/shared/lib/field-format";
import type { PaymentMethod, PaymentStatus } from "@/shared/types/domain";

export const Route = createFileRoute("/_app/sales/$id")({
  head: () => ({ meta: [{ title: "Venda | GaragemERP" }] }),
  component: SaleDetail,
});

const paymentMethodLabel: Record<PaymentMethod, string> = {
  cash: "À vista",
  financing: "Financiamento",
  card: "Cartão",
  pix: "PIX",
  trade_in: "Troca + diferença",
};

const paymentStatusLabel: Record<PaymentStatus, string> = {
  pending: "Pendente",
  partial: "Parcial",
  paid: "Quitado",
};

function SaleDetail() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const saleId = Number(id);
  const [confirmAction, setConfirmAction] = useState<"complete" | "cancel" | null>(null);
  const { data: sale, isLoading, error } = useQuery({
    queryKey: saleKeys.detail(saleId),
    queryFn: () => getSaleById(saleId),
    enabled: Number.isFinite(saleId),
  });

  const refreshSale = async (vehicleId?: number) => {
    await queryClient.invalidateQueries({ queryKey: saleKeys.all });
    await queryClient.invalidateQueries({ queryKey: saleKeys.detail(saleId) });
    if (vehicleId) {
      await queryClient.invalidateQueries({ queryKey: vehicleKeys.all });
      await queryClient.invalidateQueries({ queryKey: vehicleKeys.detail(vehicleId) });
    }
  };

  const completeMutation = useMutation({
    mutationFn: completeSale,
    onSuccess: async () => {
      await refreshSale(sale?.vehicle.id);
      setConfirmAction(null);
      toast.success("Venda concluída");
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Falha ao concluir venda.");
    },
  });

  const cancelMutation = useMutation({
    mutationFn: cancelSale,
    onSuccess: async () => {
      await refreshSale(sale?.vehicle.id);
      setConfirmAction(null);
      toast.success("Venda cancelada");
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Falha ao cancelar venda.");
    },
  });

  if (isLoading) {
    return (
      <div className="max-w-2xl mx-auto py-16 text-sm text-muted-foreground">
        Carregando venda...
      </div>
    );
  }

  if (error || !sale) {
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
  const isPending = sale.status === "pending";
  const customerDocument = sale.customer.person.cpf ?? sale.customer.person.cnpj ?? "";

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex flex-wrap items-center gap-3">
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
        {isPending && (
          <>
            <Button
              variant="outline"
              onClick={() => setConfirmAction("cancel")}
              disabled={completeMutation.isPending || cancelMutation.isPending}
            >
              <XCircle className="h-4 w-4" /> Cancelar
            </Button>
            <Button
              onClick={() => setConfirmAction("complete")}
              disabled={completeMutation.isPending || cancelMutation.isPending}
            >
              <CheckCircle2 className="h-4 w-4" /> Concluir venda
            </Button>
          </>
        )}
      </div>

      {isPending && (
        <Card className="border-warning/30 bg-warning/5">
          <CardContent className="p-4 text-sm text-muted-foreground">
            Esta venda está pendente e o veículo fica reservado para este cliente. O financeiro e a
            comissão serão consolidados quando a venda for concluída.
          </CardContent>
        </Card>
      )}

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

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center gap-2 mb-4 text-sm font-medium text-muted-foreground">
                <Receipt className="h-4 w-4" /> Pagamento
              </div>
              {sale.payment ? (
                <div className="space-y-3 text-sm">
                  <Row
                    label="Forma"
                    value={paymentMethodLabel[sale.payment.payment_method]}
                  />
                  <Row
                    label="Status"
                    value={paymentStatusLabel[sale.payment.payment_status]}
                    className={
                      sale.payment.payment_status === "paid"
                        ? "text-success"
                        : sale.payment.payment_status === "partial"
                          ? "text-warning"
                          : "text-muted-foreground"
                    }
                  />
                  <Separator />
                  <Row label="Entrada / recebido" value={brl(sale.payment.down_payment)} />
                  <Row
                    label={
                      sale.payment.payment_method === "financing"
                        ? "Saldo financiado/repasse"
                        : "Saldo restante"
                    }
                    value={brl(sale.payment.remaining_amount)}
                  />
                  <Row
                    label={
                      sale.payment.payment_method === "financing"
                        ? "Data prevista do repasse"
                        : "Data do pagamento"
                    }
                    value={sale.payment.payment_date ? fmtDate(sale.payment.payment_date) : "-"}
                    muted
                  />
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">
                  Nenhuma informação de pagamento registrada para esta venda.
                </div>
              )}
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
                    {customerDocument
                      ? formatDocument(customerDocument, sale.customer.person.type)
                      : "-"}
                  </div>
                </div>
              </Link>
              <Separator />
              <div className="text-xs text-muted-foreground space-y-1">
                <div>{sale.customer.person.email || "-"}</div>
                <div>
                  {sale.customer.person.phone ? formatPhone(sale.customer.person.phone) : "-"}
                </div>
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

      <ConfirmActionDialog
        open={confirmAction === "complete"}
        onOpenChange={(open) => {
          if (!open) setConfirmAction(null);
        }}
        title="Concluir venda?"
        description="O veículo será marcado como vendido, sairá de publicação, a receita será lançada no financeiro e a comissão do vendedor será gerada quando aplicável."
        confirmLabel={completeMutation.isPending ? "Concluindo..." : "Concluir venda"}
        confirmDisabled={completeMutation.isPending}
        confirmVariant="default"
        onConfirm={() => completeMutation.mutate({ saleId: sale.id })}
      />

      <ConfirmActionDialog
        open={confirmAction === "cancel"}
        onOpenChange={(open) => {
          if (!open) setConfirmAction(null);
        }}
        title="Cancelar venda?"
        description="A venda será marcada como cancelada e o veículo voltará para disponível. Nada será apagado."
        confirmLabel={cancelMutation.isPending ? "Cancelando..." : "Cancelar venda"}
        confirmDisabled={cancelMutation.isPending}
        onConfirm={() => cancelMutation.mutate({ saleId: sale.id })}
      />
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
