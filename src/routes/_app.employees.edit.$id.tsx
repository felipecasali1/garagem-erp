import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowLeft, Save, Trash2 } from "lucide-react";
import { Card, CardContent } from "@/shared/components/ui/card";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Switch } from "@/shared/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import type { EmployeeDraft } from "@/modules/employees/types";
import { toast } from "sonner";
import { employees } from "@/shared/mock-data";

export const Route = createFileRoute("/_app/employees/edit/$id")({
  head: () => ({ meta: [{ title: "Editar Funcionário | GaragemERP" }] }),
  component: EditEmployee,
});

function EditEmployee() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const e = employees.find((x) => String(x.id) === id);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<EmployeeDraft>(() => ({
    name: e?.person.name ?? "",
    cpf: e?.person.cpf ?? "",
    phone: e?.person.phone ?? "",
    email: e?.person.email ?? "",
    primary_address: {
      zip_code: e?.person.primary_address?.zip_code ?? "",
      city: e?.person.primary_address?.city ?? "",
      state: e?.person.primary_address?.state ?? "",
      neighborhood: e?.person.primary_address?.neighborhood ?? "",
      street: e?.person.primary_address?.street ?? "",
      number: e?.person.primary_address?.number ?? "",
      complement: e?.person.primary_address?.complement ?? "",
    },
    position: e?.position ?? "",
    hired_at: e?.hired_at,
    salary: e?.salary ?? 0,
    commission_type: e?.commission_type ?? "percentage",
    commission_rate: e?.commission_rate ?? 0,
    role: "seller",
    password: "",
    active: e?.active ?? true,
  }));
  const patchDraft = (patch: Partial<EmployeeDraft>) =>
    setDraft((current) => ({ ...current, ...patch }));
  const patchAddress = (patch: Partial<EmployeeDraft["primary_address"]>) =>
    setDraft((current) => ({
      ...current,
      primary_address: { ...current.primary_address, ...patch },
    }));

  if (!e) {
    return (
      <div className="max-w-2xl mx-auto text-center py-20">
        <h2 className="font-display text-xl mb-2">Funcionário não encontrado</h2>
        <Button onClick={() => navigate({ to: "/employees" })}>Voltar</Button>
      </div>
    );
  }

  const submit = (ev: React.FormEvent) => {
    ev.preventDefault();
    setSaving(true);
    setTimeout(() => {
      toast.success("Funcionário atualizado");
      navigate({ to: "/employees/$id", params: { id } });
    }, 500);
  };

  return (
    <form onSubmit={submit} className="max-w-3xl mx-auto space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="sm" asChild type="button">
          <Link to="/employees/$id" params={{ id }}>
            <ArrowLeft className="h-4 w-4" /> Voltar
          </Link>
        </Button>
        <h1 className="font-display text-2xl font-semibold tracking-tight flex-1">
          Editar Funcionário
        </h1>
        <Button
          variant="outline"
          type="button"
          onClick={() => {
            toast.success("Funcionário removido");
            navigate({ to: "/employees" });
          }}
        >
          <Trash2 className="h-4 w-4" /> Excluir
        </Button>
        <Button type="submit" disabled={saving}>
          <Save className="h-4 w-4" /> {saving ? "Salvando..." : "Salvar"}
        </Button>
      </div>

      <Card>
        <CardContent className="p-6 space-y-4">
          <h2 className="font-display font-semibold">Dados pessoais</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Nome completo" required>
              <Input value={draft.name} onChange={(e) => patchDraft({ name: e.target.value })} required />
            </Field>
            <Field label="CPF" required>
              <Input value={draft.cpf} onChange={(e) => patchDraft({ cpf: e.target.value })} required />
            </Field>
            <Field label="Telefone" required>
              <Input value={draft.phone} onChange={(e) => patchDraft({ phone: e.target.value })} required />
            </Field>
            <Field label="E-mail" required>
              <Input type="email" value={draft.email} onChange={(e) => patchDraft({ email: e.target.value })} required />
            </Field>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6 space-y-4">
          <h2 className="font-display font-semibold">Endereço principal</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Field label="CEP">
              <Input value={draft.primary_address.zip_code} onChange={(e) => patchAddress({ zip_code: e.target.value })} placeholder="79000-000" />
            </Field>
            <Field label="Cidade">
              <Input value={draft.primary_address.city} onChange={(e) => patchAddress({ city: e.target.value })} placeholder="Campo Grande" />
            </Field>
            <Field label="UF">
              <Input value={draft.primary_address.state} onChange={(e) => patchAddress({ state: e.target.value })} placeholder="MS" maxLength={2} />
            </Field>
            <Field label="Bairro">
              <Input value={draft.primary_address.neighborhood} onChange={(e) => patchAddress({ neighborhood: e.target.value })} placeholder="Centro" />
            </Field>
            <Field label="Rua">
              <Input value={draft.primary_address.street} onChange={(e) => patchAddress({ street: e.target.value })} placeholder="Rua Exemplo" />
            </Field>
            <Field label="Número">
              <Input value={draft.primary_address.number} onChange={(e) => patchAddress({ number: e.target.value })} placeholder="123" />
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
              <Input value={draft.position} onChange={(e) => patchDraft({ position: e.target.value })} required />
            </Field>
            <Field label="Data de contratação">
              <Input type="date" value={draft.hired_at ?? ""} onChange={(e) => patchDraft({ hired_at: e.target.value })} />
            </Field>
            <Field label="Salário base">
              <Input type="number" step="0.01" value={draft.salary} onChange={(e) => patchDraft({ salary: Number(e.target.value) || 0 })} />
            </Field>
            <Field label="Tipo de comissão">
              <Select
                value={draft.commission_type}
                onValueChange={(value) =>
                  patchDraft({ commission_type: value as EmployeeDraft["commission_type"] })
                }
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="percentage">Percentual</SelectItem>
                  <SelectItem value="fixed">Valor fixo</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Comissão">
              <Input type="number" step="0.01" value={draft.commission_rate} onChange={(e) => patchDraft({ commission_rate: Number(e.target.value) || 0 })} />
            </Field>
          </div>
          <div className="flex items-center justify-between rounded-md border border-border p-4">
            <div>
              <div className="font-medium text-sm">Funcionário ativo</div>
              <div className="text-xs text-muted-foreground">
                Inativos não aparecem em novas vendas
              </div>
            </div>
            <Switch checked={draft.active} onCheckedChange={(value) => patchDraft({ active: value })} />
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
