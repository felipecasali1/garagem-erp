import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, Check, Car, UserCircle2, Receipt } from "lucide-react";
import { Card, CardContent } from "@/shared/components/ui/card";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Textarea } from "@/shared/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { Avatar, AvatarFallback } from "@/shared/components/ui/avatar";
import { DatePicker } from "@/shared/components/ui/date-picker";
import { StatusBadge } from "@/shared/components/status-badge";
import type { SaleDraft } from "@/modules/sales/types";
import { createSale, saleKeys } from "@/modules/sales/services/sales";
import { listVehicles, vehicleKeys } from "@/modules/vehicles/services/vehicles";
import {
  customerKeys,
  listActiveCustomers,
} from "@/modules/customers/services/customers";
import { employeeKeys, listActiveEmployees } from "@/modules/employees/services/employees";
import { brl, initials } from "@/shared/lib/format";
import { formatDocument } from "@/shared/lib/field-format";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/sales/new")({
  head: () => ({ meta: [{ title: "Nova Venda | GaragemERP" }] }),
  component: NewSale,
});

const steps = [
  { key: "vehicle", title: "Veículo", icon: Car },
  { key: "client", title: "Cliente", icon: UserCircle2 },
  { key: "details", title: "Detalhes", icon: Receipt },
  { key: "confirm", title: "Confirmação", icon: Check },
] as const;

function getPaymentStatusLabel(draft: SaleDraft, total: number) {
  if (draft.payment_method !== "financing") return "Quitado";
  if (draft.down_payment >= total && total > 0) return "Quitado";
  if (draft.down_payment > 0) return "Parcial";
  return "Pendente";
}

function getPaymentMethodLabel(method: SaleDraft["payment_method"]) {
  const labels: Record<SaleDraft["payment_method"], string> = {
    cash: "À vista",
    financing: "Financiamento",
    card: "Cartão",
    pix: "PIX",
    trade_in: "Troca + diferença",
  };
  return labels[method];
}

function NewSale() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: vehicles = [], isLoading: loadingVehicles } = useQuery({
    queryKey: vehicleKeys.all,
    queryFn: listVehicles,
  });
  const { data: customers = [], isLoading: loadingCustomers } = useQuery({
    queryKey: customerKeys.all,
    queryFn: listActiveCustomers,
  });
  const { data: employees = [], isLoading: loadingEmployees } = useQuery({
    queryKey: employeeKeys.active,
    queryFn: listActiveEmployees,
  });
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<SaleDraft>({
    vehicle_id: null,
    customer_id: null,
    employee_id: null,
    status: "pending",
    sale_date: new Date().toISOString().slice(0, 10),
    discount: 0,
    notes: "",
    payment_method: "pix",
    payment_status: "paid",
    down_payment: 0,
    installments_count: 1,
    payment_date: new Date().toISOString().slice(0, 10),
  });

  const patchDraft = (patch: Partial<SaleDraft>) =>
    setDraft((current) => ({ ...current, ...patch }));

  useEffect(() => {
    if (draft.employee_id || employees.length === 0) return;
    patchDraft({ employee_id: employees[0].id });
  }, [draft.employee_id, employees]);

  const createMutation = useMutation({
    mutationFn: createSale,
    onSuccess: async (saleId) => {
      await queryClient.invalidateQueries({ queryKey: saleKeys.all });
      await queryClient.invalidateQueries({ queryKey: vehicleKeys.all });
      await queryClient.invalidateQueries({ queryKey: customerKeys.all });
      toast.success(`Venda registrada - ${brl(total)}`);
      await navigate({ to: "/sales/$id", params: { id: String(saleId) } });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Falha ao registrar venda.");
    },
  });

  const availableVehicles = vehicles.filter((v) => v.status === "available");
  const vehicle = vehicles.find((v) => v.id === draft.vehicle_id);
  const customer = customers.find((c) => c.id === draft.customer_id);
  const employee = employees.find((e) => e.id === draft.employee_id);
  const total = (vehicle?.sale_price ?? 0) - draft.discount;
  const showFinancingFields = draft.payment_method === "financing";
  const normalizedDownPayment = showFinancingFields ? Math.min(draft.down_payment, total) : total;
  const remaining = showFinancingFields ? Math.max(0, total - normalizedDownPayment) : 0;
  const paymentStatusLabel = getPaymentStatusLabel(draft, total);

  const canNext =
    (step === 0 && vehicle) || (step === 1 && customer) || (step === 2 && employee) || step === 3;

  const finish = () => {
    if (!vehicle || !customer || !employee) {
      toast.error("Selecione veículo, cliente e vendedor.");
      return;
    }
    if (draft.discount > vehicle.sale_price) {
      toast.error("O desconto não pode ser maior que o valor do veículo.");
      return;
    }
    if (draft.payment_method === "financing" && draft.down_payment > total) {
      toast.error("A entrada não pode ser maior que o valor final da venda.");
      return;
    }
    createMutation.mutate({
      vehicleId: vehicle.id,
      customerId: customer.id,
      employeeId: employee.id,
      status: draft.status,
      saleDate: draft.sale_date,
      discount: draft.discount,
      notes: draft.notes,
      paymentMethod: draft.payment_method,
      paymentStatus:
        draft.payment_method !== "financing"
          ? "paid"
          : draft.down_payment >= total
            ? "paid"
            : draft.down_payment > 0
              ? "partial"
              : "pending",
      downPayment: draft.payment_method === "financing" ? draft.down_payment : total,
      installmentsCount: 1,
      paymentDate: draft.payment_date,
    });
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/sales">
            <ArrowLeft className="h-4 w-4" /> Vendas
          </Link>
        </Button>
        <h1 className="font-display text-2xl font-semibold tracking-tight">Nova Venda</h1>
      </div>

      <Card>
        <CardContent className="p-4 flex gap-2 overflow-x-auto">
          {steps.map((s, i) => {
            const active = i === step;
            const done = i < step;
            return (
              <div
                key={s.key}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm shrink-0 ${
                  active
                    ? "bg-primary text-primary-foreground"
                    : done
                      ? "bg-success/10 text-success"
                      : "text-muted-foreground"
                }`}
              >
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-background/20 text-xs">
                  {done ? <Check className="h-3 w-3" /> : i + 1}
                </span>
                {s.title}
              </div>
            );
          })}
        </CardContent>
      </Card>

      {step === 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {loadingVehicles ? (
            <div className="col-span-full rounded-md border border-border p-6 text-sm text-muted-foreground">
              Carregando veículos disponíveis...
            </div>
          ) : availableVehicles.length === 0 ? (
            <div className="col-span-full rounded-md border border-border p-6 text-sm text-muted-foreground">
              Nenhum veículo disponível para venda.
            </div>
          ) : (
            availableVehicles.map((v) => {
              const sel = v.id === draft.vehicle_id;
              return (
                <button
                  key={v.id}
                  onClick={() => patchDraft({ vehicle_id: v.id })}
                  className={`text-left rounded-xl border-2 p-4 transition ${
                    sel ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"
                  }`}
                >
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <div className="font-display font-semibold">
                        {v.brand} {v.model}
                      </div>
                      <div className="text-xs text-muted-foreground">{v.version}</div>
                    </div>
                    <StatusBadge kind="vehicle" value={v.status} />
                  </div>
                  <div className="flex items-center justify-between mt-3">
                    <span className="plate-chip">{v.plate}</span>
                    <span className="font-semibold">{brl(v.sale_price)}</span>
                  </div>
                </button>
              );
            })
          )}
        </div>
      )}

      {step === 1 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {loadingCustomers ? (
            <div className="col-span-full rounded-md border border-border p-6 text-sm text-muted-foreground">
              Carregando clientes ativos...
            </div>
          ) : customers.length === 0 ? (
            <div className="col-span-full rounded-md border border-border p-6 text-sm text-muted-foreground">
              Nenhum cliente ativo disponível para venda.
            </div>
          ) : (
            customers.map((c) => {
            const sel = c.id === draft.customer_id;
            return (
              <button
                key={c.id}
                onClick={() => patchDraft({ customer_id: c.id })}
                className={`flex items-center gap-3 rounded-xl border-2 p-4 transition ${
                  sel ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"
                }`}
              >
                <Avatar>
                  <AvatarFallback className="bg-muted text-xs">
                    {initials(c.person.name)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 text-left min-w-0">
                  <div className="font-medium truncate">{c.person.name}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {formatDocument(c.person.cpf ?? c.person.cnpj ?? "", c.person.type)}
                  </div>
                </div>
              </button>
            );
          })
          )}
        </div>
      )}

      {step === 2 && (
        <Card>
          <CardContent className="p-6 space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs uppercase text-muted-foreground">Vendedor</Label>
              <Select
                value={String(draft.employee_id)}
                onValueChange={(v) => patchDraft({ employee_id: Number(v) })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {employees
                    .map((e) => (
                      <SelectItem key={e.id} value={String(e.id)}>
                        {e.person.name} - {e.position}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              {loadingEmployees && (
                <div className="text-xs text-muted-foreground">Carregando vendedores...</div>
              )}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs uppercase text-muted-foreground">Status da venda</Label>
                <Select
                  value={draft.status}
                  onValueChange={(value) =>
                    patchDraft({ status: value as SaleDraft["status"] })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">Pendente / reservar veículo</SelectItem>
                    <SelectItem value="completed">Concluída / vender veículo</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs uppercase text-muted-foreground">Data da venda</Label>
                <DatePicker
                  value={draft.sale_date}
                  onChange={(value) =>
                    patchDraft({ sale_date: value ?? new Date().toISOString().slice(0, 10) })
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs uppercase text-muted-foreground">Valor do veículo</Label>
                <Input value={brl(vehicle?.sale_price ?? 0)} readOnly />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs uppercase text-muted-foreground">Desconto</Label>
                <Input
                  type="number"
                  value={draft.discount || ""}
                  onChange={(e) => patchDraft({ discount: Number(e.target.value) || 0 })}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs uppercase text-muted-foreground">Observações</Label>
              <Textarea
                rows={3}
                value={draft.notes}
                onChange={(e) => patchDraft({ notes: e.target.value })}
              />
            </div>

            <div className="border-t border-border pt-4 space-y-4">
              <h3 className="font-display font-semibold">Pagamento</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs uppercase text-muted-foreground">
                    Forma de pagamento
                  </Label>
                  <Select
                    value={draft.payment_method}
                    onValueChange={(value) =>
                      patchDraft({
                        payment_method: value as SaleDraft["payment_method"],
                        payment_status: value === "financing" ? "pending" : "paid",
                        down_payment: 0,
                        installments_count: 1,
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cash">À vista</SelectItem>
                      <SelectItem value="financing">Financiamento</SelectItem>
                      <SelectItem value="card">Cartão</SelectItem>
                      <SelectItem value="pix">PIX</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {showFinancingFields && (
                  <div className="space-y-1.5">
                    <Label className="text-xs uppercase text-muted-foreground">Entrada (R$)</Label>
                    <Input
                      type="number"
                      value={draft.down_payment || ""}
                      onChange={(e) => patchDraft({ down_payment: Number(e.target.value) || 0 })}
                    />
                  </div>
                )}
                <div className="space-y-1.5 md:col-span-2">
                  <Label className="text-xs uppercase text-muted-foreground">
                    {showFinancingFields ? "Data prevista do repasse" : "Data do pagamento"}
                  </Label>
                  <DatePicker
                    value={draft.payment_date}
                    onChange={(value) => patchDraft({ payment_date: value })}
                  />
                </div>
              </div>
            </div>

            <div className="rounded-lg bg-muted p-4 space-y-2">
              <Row label="Valor total" value={brl(total)} />
              <Row label="Forma de pagamento" value={getPaymentMethodLabel(draft.payment_method)} />
              {showFinancingFields && (
                <>
                  <Row label="Status do pagamento" value={paymentStatusLabel} />
                  <Row label="Entrada" value={brl(normalizedDownPayment)} />
                  <Row label="Saldo financiado/repasse" value={brl(remaining)} />
                </>
              )}
              <div className="border-t border-border/60 pt-2 flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Total da venda</span>
                <span className="font-display text-2xl font-semibold">{brl(total)}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 3 && (
        <Card>
          <CardContent className="p-6 space-y-4">
            <h2 className="font-display font-semibold text-lg">Resumo da venda</h2>
            <Row
              label="Veículo"
              value={`${vehicle?.brand} ${vehicle?.model} - ${vehicle?.plate}`}
            />
            <Row label="Cliente" value={customer?.person.name ?? "-"} />
            <Row label="Vendedor" value={employee?.person.name ?? "-"} />
            <Row
              label="Status"
              value={draft.status === "completed" ? "Concluída" : "Pendente / reservado"}
            />
            <Row
              label="Pagamento"
              value={
                showFinancingFields
                  ? `${getPaymentMethodLabel(draft.payment_method)} - ${paymentStatusLabel}`
                  : getPaymentMethodLabel(draft.payment_method)
              }
            />
            <Row label="Desconto" value={brl(draft.discount)} />
            <div className="border-t border-border pt-4 flex items-center justify-between">
              <span className="font-display font-semibold">Total</span>
              <span className="font-display text-2xl font-semibold text-primary">{brl(total)}</span>
            </div>
            {draft.notes && (
              <div className="text-sm text-muted-foreground italic border-t border-border pt-3">
                "{draft.notes}"
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <div className="flex justify-between">
        <Button
          variant="outline"
          disabled={step === 0}
          onClick={() => setStep((s) => Math.max(0, s - 1))}
        >
          <ArrowLeft className="h-4 w-4" /> Voltar
        </Button>
        {step < steps.length - 1 ? (
          <Button disabled={!canNext} onClick={() => setStep((s) => s + 1)}>
            Próximo <ArrowRight className="h-4 w-4" />
          </Button>
        ) : (
          <Button onClick={finish} disabled={createMutation.isPending}>
            <Check className="h-4 w-4" />{" "}
            {createMutation.isPending ? "Salvando..." : "Confirmar venda"}
          </Button>
        )}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
