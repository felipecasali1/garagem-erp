import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/shared/components/ui/dialog";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Button } from "@/shared/components/ui/button";
import { Textarea } from "@/shared/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { Switch } from "@/shared/components/ui/switch";
import { DatePicker } from "@/shared/components/ui/date-picker";
import { employees } from "@/shared/mock-data";
import { brl } from "@/shared/lib/format";
import { toast } from "sonner";

export type QuickActionKind = "income" | "expense" | "fixed_cost" | "salary" | null;

export function FinancialActionDialog({
  kind,
  onOpenChange,
}: {
  kind: QuickActionKind;
  onOpenChange: (k: QuickActionKind) => void;
}) {
  const open = kind !== null;
  const titles: Record<Exclude<QuickActionKind, null>, string> = {
    income: "Registrar Receita",
    expense: "Registrar Despesa",
    fixed_cost: "Registrar Custo Fixo",
    salary: "Pagar Salário",
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onOpenChange(null)}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{kind ? titles[kind] : ""}</DialogTitle>
        </DialogHeader>
        {kind === "income" && <IncomeForm onDone={() => onOpenChange(null)} />}
        {kind === "expense" && <ExpenseForm onDone={() => onOpenChange(null)} />}
        {kind === "fixed_cost" && <FixedCostForm onDone={() => onOpenChange(null)} />}
        {kind === "salary" && <SalaryForm onDone={() => onOpenChange(null)} />}
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  children,
  required,
}: {
  label: string;
  children: React.ReactNode;
  required?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs uppercase tracking-wide text-muted-foreground">
        {label} {required && <span className="text-destructive">*</span>}
      </Label>
      {children}
    </div>
  );
}

function IncomeForm({ onDone }: { onDone: () => void }) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        toast.success("Receita registrada");
        onDone();
      }}
      className="space-y-4"
    >
      <Field label="Descrição" required>
        <Input required placeholder="Ex.: Venda à vista veículo" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Valor (R$)" required>
          <Input type="number" step="0.01" required placeholder="0,00" />
        </Field>
        <Field label="Categoria">
          <Select defaultValue="vehicle_sale">
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="vehicle_sale">Venda de veículo</SelectItem>
              <SelectItem value="other">Outros</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="Data" required>
          <DatePicker required />
        </Field>
        <Field label="Vencimento">
          <DatePicker />
        </Field>
      </div>
      <Field label="Observações">
        <Textarea rows={2} />
      </Field>
      <DialogFooter>
        <Button type="submit">Salvar</Button>
      </DialogFooter>
    </form>
  );
}

function ExpenseForm({ onDone }: { onDone: () => void }) {
  const [installments, setInstallments] = useState(false);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        toast.success("Despesa registrada");
        onDone();
      }}
      className="space-y-4"
    >
      <Field label="Descrição" required>
        <Input required />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Valor (R$)" required>
          <Input type="number" step="0.01" required placeholder="0,00" />
        </Field>
        <Field label="Categoria">
          <Select defaultValue="other">
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="fixed_cost">Custo fixo</SelectItem>
              <SelectItem value="vehicle_purchase">Compra de veículo</SelectItem>
              <SelectItem value="commission">Comissão</SelectItem>
              <SelectItem value="other">Outros</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="Data" required>
          <DatePicker required />
        </Field>
        <Field label="Vencimento">
          <DatePicker />
        </Field>
      </div>
      <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
        <span className="text-sm">Parcelar pagamento</span>
        <Switch checked={installments} onCheckedChange={setInstallments} />
      </div>
      {installments && (
        <Field label="Número de parcelas">
          <Input type="number" min={2} max={36} placeholder="2" />
        </Field>
      )}
      <DialogFooter>
        <Button type="submit">Salvar</Button>
      </DialogFooter>
    </form>
  );
}

function FixedCostForm({ onDone }: { onDone: () => void }) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        toast.success("Custo fixo registrado");
        onDone();
      }}
      className="space-y-4"
    >
      <Field label="Descrição" required>
        <Select defaultValue="rent">
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="rent">Aluguel</SelectItem>
            <SelectItem value="energy">Energia</SelectItem>
            <SelectItem value="water">Água</SelectItem>
            <SelectItem value="internet">Internet</SelectItem>
            <SelectItem value="other">Outros</SelectItem>
          </SelectContent>
        </Select>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Valor (R$)" required>
          <Input type="number" step="0.01" required placeholder="0,00" />
        </Field>
        <Field label="Dia do mês" required>
          <Input type="number" min={1} max={31} required placeholder="1" />
        </Field>
      </div>
      <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
        <span className="text-sm">Recorrência mensal</span>
        <Switch defaultChecked />
      </div>
      <DialogFooter>
        <Button type="submit">Salvar</Button>
      </DialogFooter>
    </form>
  );
}

function SalaryForm({ onDone }: { onDone: () => void }) {
  const [employeeId, setEmployeeId] = useState(String(employees[0].id));
  const employee = employees.find((e) => String(e.id) === employeeId);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        toast.success(`Salário de ${employee?.person.name} pago`);
        onDone();
      }}
      className="space-y-4"
    >
      <Field label="Funcionário" required>
        <Select value={employeeId} onValueChange={setEmployeeId}>
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
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Valor (R$)" required>
          <Input
            type="number"
            step="0.01"
            required
            defaultValue={employee?.salary ?? undefined}
            key={employeeId}
            placeholder="0,00"
          />
        </Field>
        <Field label="Mês de referência" required>
          <Input type="month" required />
        </Field>
      </div>
      <div className="rounded-lg bg-muted p-3 text-sm flex justify-between">
        <span className="text-muted-foreground">Total a pagar</span>
        <span className="font-semibold">{brl(employee?.salary ?? 0)}</span>
      </div>
      <Field label="Observações">
        <Textarea rows={2} />
      </Field>
      <DialogFooter>
        <Button type="submit">Confirmar pagamento</Button>
      </DialogFooter>
    </form>
  );
}
