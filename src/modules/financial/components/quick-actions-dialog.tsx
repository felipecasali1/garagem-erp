import { useEffect, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
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
import { DatePicker } from "@/shared/components/ui/date-picker";
import {
  createManualFinancialTransaction,
  financialTransactionKeys,
  type ManualFinancialTransactionDraft,
} from "@/modules/financial/services/transactions";
import { employeeKeys, listActiveEmployees } from "@/modules/employees/services/employees";
import { brl } from "@/shared/lib/format";

export type QuickActionKind = "income" | "expense" | "fixed_cost" | "salary" | null;

type BasicStatus = "pending" | "paid";
type ExpenseCategory = "commission" | "fixed_cost" | "other";

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function parseAmount(value: string) {
  return Number(value.replace(",", "."));
}

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
    <Dialog open={open} onOpenChange={(value) => !value && onOpenChange(null)}>
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

function useCreateTransaction(onDone: () => void, successMessage: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createManualFinancialTransaction,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: financialTransactionKeys.all });
      toast.success(successMessage);
      onDone();
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Falha ao salvar lançamento.");
    },
  });
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
  const mutation = useCreateTransaction(onDone, "Receita registrada");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [status, setStatus] = useState<BasicStatus>("paid");
  const [transactionDate, setTransactionDate] = useState(todayIso());
  const [dueDate, setDueDate] = useState<string | undefined>();
  const [related, setRelated] = useState("");

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsedAmount = parseAmount(amount);
    if (!description.trim() || !transactionDate || !Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      toast.error("Preencha descrição, data e valor corretamente.");
      return;
    }

    mutation.mutate({
      type: "income",
      category: "other",
      status,
      amount: parsedAmount,
      transaction_date: transactionDate,
      due_date: status === "pending" ? dueDate : undefined,
      description,
      related,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Field label="Descrição" required>
        <Input
          required
          placeholder="Ex.: Reembolso, ajuste de caixa"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Valor (R$)" required>
          <Input
            type="number"
            step="0.01"
            min="0.01"
            required
            placeholder="0,00"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
          />
        </Field>
        <Field label="Status">
          <Select value={status} onValueChange={(value) => setStatus(value as BasicStatus)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="paid">Recebida</SelectItem>
              <SelectItem value="pending">A receber</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="Data" required>
          <DatePicker value={transactionDate} onChange={(value) => setTransactionDate(value ?? "")} required />
        </Field>
        <Field label="Vencimento">
          <DatePicker
            value={dueDate}
            onChange={setDueDate}
            placeholder={status === "pending" ? "Data prevista" : "Opcional"}
          />
        </Field>
      </div>
      <Field label="Referência">
        <Textarea
          rows={2}
          placeholder="Origem ou observação do lançamento"
          value={related}
          onChange={(event) => setRelated(event.target.value)}
        />
      </Field>
      <DialogFooter>
        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? "Salvando..." : "Salvar"}
        </Button>
      </DialogFooter>
    </form>
  );
}

function ExpenseForm({ onDone }: { onDone: () => void }) {
  const mutation = useCreateTransaction(onDone, "Despesa registrada");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState<ExpenseCategory>("other");
  const [status, setStatus] = useState<BasicStatus>("pending");
  const [transactionDate, setTransactionDate] = useState(todayIso());
  const [dueDate, setDueDate] = useState<string | undefined>();
  const [related, setRelated] = useState("");

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsedAmount = parseAmount(amount);
    if (!description.trim() || !transactionDate || !Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      toast.error("Preencha descrição, data e valor corretamente.");
      return;
    }

    mutation.mutate({
      type: "expense",
      category,
      status,
      amount: parsedAmount,
      transaction_date: transactionDate,
      due_date: dueDate,
      description,
      related,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Field label="Descrição" required>
        <Input
          required
          placeholder="Ex.: Material de limpeza"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Valor (R$)" required>
          <Input
            type="number"
            step="0.01"
            min="0.01"
            required
            placeholder="0,00"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
          />
        </Field>
        <Field label="Categoria">
          <Select value={category} onValueChange={(value) => setCategory(value as ExpenseCategory)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="fixed_cost">Custo fixo</SelectItem>
              <SelectItem value="commission">Comissão</SelectItem>
              <SelectItem value="other">Outros</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="Status">
          <Select value={status} onValueChange={(value) => setStatus(value as BasicStatus)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="pending">A pagar</SelectItem>
              <SelectItem value="paid">Paga</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="Data" required>
          <DatePicker value={transactionDate} onChange={(value) => setTransactionDate(value ?? "")} required />
        </Field>
        <Field label="Vencimento">
          <DatePicker value={dueDate} onChange={setDueDate} placeholder="Opcional" />
        </Field>
      </div>
      <Field label="Referência">
        <Textarea
          rows={2}
          placeholder="Fornecedor, origem ou observação"
          value={related}
          onChange={(event) => setRelated(event.target.value)}
        />
      </Field>
      <DialogFooter>
        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? "Salvando..." : "Salvar"}
        </Button>
      </DialogFooter>
    </form>
  );
}

function FixedCostForm({ onDone }: { onDone: () => void }) {
  const mutation = useCreateTransaction(onDone, "Custo fixo registrado");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [status, setStatus] = useState<BasicStatus>("pending");
  const [transactionDate, setTransactionDate] = useState(todayIso());
  const [dueDate, setDueDate] = useState<string | undefined>();
  const [related, setRelated] = useState("");

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsedAmount = parseAmount(amount);
    if (!description.trim() || !transactionDate || !Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      toast.error("Preencha descrição, data e valor corretamente.");
      return;
    }

    mutation.mutate({
      type: "expense",
      category: "fixed_cost",
      status,
      amount: parsedAmount,
      transaction_date: transactionDate,
      due_date: dueDate,
      description,
      related,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Field label="Descrição" required>
        <Select value={description} onValueChange={setDescription}>
          <SelectTrigger>
            <SelectValue placeholder="Selecione o custo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="Aluguel">Aluguel</SelectItem>
            <SelectItem value="Energia">Energia</SelectItem>
            <SelectItem value="Água">Água</SelectItem>
            <SelectItem value="Internet">Internet</SelectItem>
            <SelectItem value="Outros custos fixos">Outros</SelectItem>
          </SelectContent>
        </Select>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Valor (R$)" required>
          <Input
            type="number"
            step="0.01"
            min="0.01"
            required
            placeholder="0,00"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
          />
        </Field>
        <Field label="Status">
          <Select value={status} onValueChange={(value) => setStatus(value as BasicStatus)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="pending">A pagar</SelectItem>
              <SelectItem value="paid">Pago</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="Data" required>
          <DatePicker value={transactionDate} onChange={(value) => setTransactionDate(value ?? "")} required />
        </Field>
        <Field label="Vencimento">
          <DatePicker value={dueDate} onChange={setDueDate} placeholder="Opcional" />
        </Field>
      </div>
      <Field label="Referência">
        <Textarea
          rows={2}
          placeholder="Ex.: competência, fornecedor ou observação"
          value={related}
          onChange={(event) => setRelated(event.target.value)}
        />
      </Field>
      <DialogFooter>
        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? "Salvando..." : "Salvar"}
        </Button>
      </DialogFooter>
    </form>
  );
}

function SalaryForm({ onDone }: { onDone: () => void }) {
  const mutation = useCreateTransaction(onDone, "Salário registrado");
  const { data: employees = [], isLoading } = useQuery({
    queryKey: employeeKeys.active,
    queryFn: listActiveEmployees,
  });
  const [employeeId, setEmployeeId] = useState("");
  const [amount, setAmount] = useState("");
  const [referenceMonth, setReferenceMonth] = useState(todayIso().slice(0, 7));
  const [transactionDate, setTransactionDate] = useState(todayIso());
  const [related, setRelated] = useState("");
  const currentEmployeeId = employeeId || String(employees[0]?.id ?? "");
  const employee = employees.find((entry) => String(entry.id) === currentEmployeeId);

  useEffect(() => {
    if (!employee || amount) return;
    setAmount(String(employee.salary));
  }, [amount, employee]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsedAmount = parseAmount(amount);
    if (!employee || !transactionDate || !Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      toast.error("Selecione um funcionário e preencha o valor corretamente.");
      return;
    }

    mutation.mutate({
      type: "expense",
      category: "salary",
      status: "paid",
      amount: parsedAmount,
      transaction_date: transactionDate,
      description: `Salário - ${employee.person.name}`,
      related: related || `Referência ${referenceMonth}`,
      employee_id: employee.id,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Field label="Funcionário" required>
        <Select
          value={currentEmployeeId}
          onValueChange={(value) => {
            setEmployeeId(value);
            const selected = employees.find((entry) => String(entry.id) === value);
            setAmount(selected ? String(selected.salary) : "");
          }}
          disabled={isLoading || employees.length === 0}
        >
          <SelectTrigger>
            <SelectValue placeholder={isLoading ? "Carregando..." : "Selecione"} />
          </SelectTrigger>
          <SelectContent>
            {employees.map((entry) => (
              <SelectItem key={entry.id} value={String(entry.id)}>
                {entry.person.name} - {entry.position}
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
            min="0.01"
            required
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            placeholder="0,00"
          />
        </Field>
        <Field label="Mês de referência" required>
          <Input
            type="month"
            required
            value={referenceMonth}
            onChange={(event) => setReferenceMonth(event.target.value)}
          />
        </Field>
        <Field label="Data de pagamento" required>
          <DatePicker value={transactionDate} onChange={(value) => setTransactionDate(value ?? "")} required />
        </Field>
      </div>
      <div className="rounded-lg bg-muted p-3 text-sm flex justify-between">
        <span className="text-muted-foreground">Salário cadastrado</span>
        <span className="font-semibold">{brl(employee?.salary ?? 0)}</span>
      </div>
      <Field label="Observações">
        <Textarea
          rows={2}
          value={related}
          onChange={(event) => setRelated(event.target.value)}
          placeholder="Observação opcional"
        />
      </Field>
      <DialogFooter>
        <Button type="submit" disabled={mutation.isPending || !employee}>
          {mutation.isPending ? "Salvando..." : "Confirmar pagamento"}
        </Button>
      </DialogFooter>
    </form>
  );
}
