import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowLeft, Save } from "lucide-react";
import { Card, CardContent } from "@/shared/components/ui/card";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Switch } from "@/shared/components/ui/switch";
import { DatePicker } from "@/shared/components/ui/date-picker";
import { toast } from "sonner";
import { createEmployee } from "@/modules/employees/services/employees";
import type { EmployeeDraft } from "@/modules/employees/types";
import { CepInput, CpfCnpjInput, PhoneInput, UfInput } from "@/shared/components/form/field-inputs";

export const Route = createFileRoute("/_app/employees/new")({
  head: () => ({ meta: [{ title: "Novo Funcionário | GaragemERP" }] }),
  component: NewEmployee,
});

function NewEmployee() {
  const navigate = useNavigate();
  const [draft, setDraft] = useState<EmployeeDraft>({
    name: "",
    cpf: "",
    phone: "",
    email: "",
    primary_address: {
      zip_code: "",
      city: "",
      state: "",
      neighborhood: "",
      street: "",
      number: "",
      complement: "",
    },
    position: "",
    hired_at: new Date().toISOString().slice(0, 10),
    salary: 0,
    commission_type: "percentage",
    commission_rate: 0,
    active: true,
  });

  const createMutation = useMutation({
    mutationFn: createEmployee,
    onSuccess: async (employee) => {
      toast.success("Funcionário cadastrado");
      await navigate({ to: "/employees/$id", params: { id: String(employee.id) } });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Falha ao cadastrar funcionário.");
    },
  });

  const patchDraft = (patch: Partial<EmployeeDraft>) =>
    setDraft((current) => ({ ...current, ...patch }));
  const patchAddress = (patch: Partial<EmployeeDraft["primary_address"]>) =>
    setDraft((current) => ({
      ...current,
      primary_address: { ...current.primary_address, ...patch },
    }));

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    createMutation.mutate(draft);
  };

  return (
    <form onSubmit={submit} className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" asChild type="button">
          <Link to="/employees">
            <ArrowLeft className="h-4 w-4" /> Funcionários
          </Link>
        </Button>
        <h1 className="font-display text-2xl font-semibold tracking-tight flex-1">
          Novo Funcionário
        </h1>
        <Button type="submit" disabled={createMutation.isPending}>
          <Save className="h-4 w-4" /> {createMutation.isPending ? "Salvando..." : "Salvar"}
        </Button>
      </div>

      <Card>
        <CardContent className="p-6 space-y-4">
          <h2 className="font-display font-semibold">Dados pessoais</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Nome completo" required>
              <Input
                value={draft.name}
                onChange={(e) => patchDraft({ name: e.target.value })}
                required
              />
            </Field>
            <Field label="CPF" required>
              <CpfCnpjInput
                value={draft.cpf}
                onValueChange={(value) => patchDraft({ cpf: value })}
                required
                personType="individual"
                placeholder="000.000.000-00"
              />
            </Field>
            <Field label="Telefone" required>
              <PhoneInput
                value={draft.phone}
                onValueChange={(value) => patchDraft({ phone: value })}
                required
                placeholder="(00) 00000-0000"
              />
            </Field>
            <Field label="E-mail" required>
              <Input
                type="email"
                value={draft.email}
                onChange={(e) => patchDraft({ email: e.target.value })}
                required
              />
            </Field>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6 space-y-4">
          <h2 className="font-display font-semibold">Endereço principal</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Field label="CEP">
              <CepInput
                value={draft.primary_address.zip_code}
                onValueChange={(value) => patchAddress({ zip_code: value })}
                placeholder="79000-000"
              />
            </Field>
            <Field label="Cidade">
              <Input
                value={draft.primary_address.city}
                onChange={(e) => patchAddress({ city: e.target.value })}
                placeholder="Campo Grande"
              />
            </Field>
            <Field label="UF">
              <UfInput
                value={draft.primary_address.state}
                onValueChange={(value) => patchAddress({ state: value })}
                placeholder="MS"
              />
            </Field>
            <Field label="Bairro">
              <Input
                value={draft.primary_address.neighborhood}
                onChange={(e) => patchAddress({ neighborhood: e.target.value })}
                placeholder="Centro"
              />
            </Field>
            <Field label="Rua">
              <Input
                value={draft.primary_address.street}
                onChange={(e) => patchAddress({ street: e.target.value })}
                placeholder="Rua Exemplo"
              />
            </Field>
            <Field label="Número">
              <Input
                value={draft.primary_address.number}
                onChange={(e) => patchAddress({ number: e.target.value })}
                placeholder="123"
              />
            </Field>
            <Field label="Complemento">
              <Input
                value={draft.primary_address.complement ?? ""}
                onChange={(e) => patchAddress({ complement: e.target.value })}
                placeholder="Sala, apto, referência..."
              />
            </Field>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6 space-y-4">
          <h2 className="font-display font-semibold">Cargo e remuneração</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Cargo" required>
              <Input
                value={draft.position}
                onChange={(e) => patchDraft({ position: e.target.value })}
                required
                placeholder="Vendedor, Gerente..."
              />
            </Field>
            <Field label="Data de contratação">
              <DatePicker
                value={draft.hired_at}
                onChange={(value) => patchDraft({ hired_at: value })}
                name="hired_at"
              />
            </Field>
            <Field label="Salário base">
              <Input
                type="number"
                step="0.01"
                value={draft.salary || ""}
                onChange={(e) => patchDraft({ salary: Number(e.target.value) || 0 })}
                placeholder="0,00"
              />
            </Field>
            <Field label="Tipo de comissão">
              <select
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={draft.commission_type}
                onChange={(e) =>
                  patchDraft({
                    commission_type: e.target.value as EmployeeDraft["commission_type"],
                  })
                }
              >
                <option value="percentage">Percentual</option>
                <option value="fixed">Valor fixo</option>
              </select>
            </Field>
            <Field
              label={draft.commission_type === "percentage" ? "Comissão (%)" : "Comissão (R$)"}
            >
              <Input
                type="number"
                step="0.01"
                value={draft.commission_rate || ""}
                onChange={(e) => patchDraft({ commission_rate: Number(e.target.value) || 0 })}
                placeholder="0"
              />
            </Field>
          </div>
          <div className="flex items-center justify-between rounded-md border border-border p-4">
            <div>
              <div className="font-medium text-sm">Funcionário ativo</div>
              <div className="text-xs text-muted-foreground">
                Inativos não aparecem em novas vendas nem nos responsáveis
              </div>
            </div>
            <Switch
              checked={draft.active}
              onCheckedChange={(value) => patchDraft({ active: value })}
            />
          </div>
        </CardContent>
      </Card>
    </form>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
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
