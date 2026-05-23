import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
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
import { vehicles, customers, employees } from "@/shared/mock-data";
import { brl, initials } from "@/shared/lib/format";
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

function NewSale() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [vehicleId, setVehicleId] = useState<number | null>(null);
  const [customerId, setCustomerId] = useState<number | null>(null);
  const [employeeId, setEmployeeId] = useState<number | null>(employees[0]?.id ?? null);
  const [discount, setDiscount] = useState(0);
  const [notes, setNotes] = useState("");

  // Payment
  const [paymentMethod, setPaymentMethod] = useState("financing");
  const [paymentStatus, setPaymentStatus] = useState("pending");
  const [downPayment, setDownPayment] = useState(0);
  const [installments, setInstallments] = useState(12);
  const [paymentDate, setPaymentDate] = useState<string | undefined>(
    new Date().toISOString().slice(0, 10),
  );

  const vehicle = vehicles.find((v) => v.id === vehicleId);
  const customer = customers.find((c) => c.id === customerId);
  const employee = employees.find((e) => e.id === employeeId);
  const total = (vehicle?.sale_price ?? 0) - discount;
  const remaining = Math.max(0, total - downPayment);
  const installmentValue = installments > 0 ? remaining / installments : 0;

  const canNext =
    (step === 0 && vehicle) || (step === 1 && customer) || (step === 2 && employee) || step === 3;

  const finish = () => {
    toast.success(`Venda registrada - ${brl(total)}`);
    navigate({ to: "/sales" });
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
                className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm shrink-0 ${active
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
          {vehicles
            .filter((v) => v.status === "available")
            .map((v) => {
              const sel = v.id === vehicleId;
              return (
                <button
                  key={v.id}
                  onClick={() => setVehicleId(v.id)}
                  className={`text-left rounded-xl border-2 p-4 transition ${sel ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"
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
            })}
        </div>
      )}

      {step === 1 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {customers.map((c) => {
            const sel = c.id === customerId;
            return (
              <button
                key={c.id}
                onClick={() => setCustomerId(c.id)}
                className={`flex items-center gap-3 rounded-xl border-2 p-4 transition ${sel ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"
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
                    {c.person.cpf ?? c.person.cnpj}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {step === 2 && (
        <Card>
          <CardContent className="p-6 space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs uppercase text-muted-foreground">Vendedor</Label>
              <Select
                value={String(employeeId)}
                onValueChange={(v) => setEmployeeId(Number(v))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {employees
                    .filter((e) => e.active)
                    .map((e) => (
                      <SelectItem key={e.id} value={String(e.id)}>
                        {e.person.name} - {e.position}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs uppercase text-muted-foreground">Valor do veículo</Label>
                <Input value={brl(vehicle?.sale_price ?? 0)} readOnly />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs uppercase text-muted-foreground">Desconto</Label>
                <Input
                  type="number"
                  value={discount}
                  onChange={(e) => setDiscount(Number(e.target.value) || 0)}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs uppercase text-muted-foreground">Observações</Label>
              <Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>

            <div className="border-t border-border pt-4 space-y-4">
              <h3 className="font-display font-semibold">Pagamento</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs uppercase text-muted-foreground">Forma de pagamento</Label>
                  <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cash">À vista</SelectItem>
                      <SelectItem value="financing">Financiamento</SelectItem>
                      <SelectItem value="card">Cartão</SelectItem>
                      <SelectItem value="pix">PIX</SelectItem>
                      <SelectItem value="trade_in">Troca + diferença</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs uppercase text-muted-foreground">Status do pagamento</Label>
                  <Select value={paymentStatus} onValueChange={setPaymentStatus}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pending">Pendente</SelectItem>
                      <SelectItem value="partial">Parcial</SelectItem>
                      <SelectItem value="paid">Quitado</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs uppercase text-muted-foreground">Entrada (R$)</Label>
                  <Input type="number" value={downPayment} onChange={(e) => setDownPayment(Number(e.target.value) || 0)} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs uppercase text-muted-foreground">Parcelas</Label>
                  <Input type="number" min={1} value={installments} onChange={(e) => setInstallments(Number(e.target.value) || 1)} />
                </div>
                <div className="space-y-1.5 md:col-span-2">
                  <Label className="text-xs uppercase text-muted-foreground">Data do pagamento</Label>
                  <DatePicker value={paymentDate} onChange={setPaymentDate} />
                </div>
              </div>
            </div>

            <div className="rounded-lg bg-muted p-4 space-y-2">
              <Row label="Valor total" value={brl(total)} />
              <Row label="Entrada" value={brl(downPayment)} />
              <Row label="Saldo restante" value={brl(remaining)} />
              {installments > 1 && remaining > 0 && (
                <Row label={`${installments}x de`} value={brl(installmentValue)} />
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
            <Row label="Veículo" value={`${vehicle?.brand} ${vehicle?.model} - ${vehicle?.plate}`} />
            <Row label="Cliente" value={customer?.person.name ?? "-"} />
            <Row label="Vendedor" value={employee?.person.name ?? "-"} />
            <Row label="Desconto" value={brl(discount)} />
            <div className="border-t border-border pt-4 flex items-center justify-between">
              <span className="font-display font-semibold">Total</span>
              <span className="font-display text-2xl font-semibold text-primary">{brl(total)}</span>
            </div>
            {notes && (
              <div className="text-sm text-muted-foreground italic border-t border-border pt-3">
                "{notes}"
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
          <Button onClick={finish}>
            <Check className="h-4 w-4" /> Confirmar venda
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
