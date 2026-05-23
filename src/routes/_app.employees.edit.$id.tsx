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
              <Input defaultValue={e.person.name} required />
            </Field>
            <Field label="CPF" required>
              <Input defaultValue={e.person.cpf ?? ""} required />
            </Field>
            <Field label="Telefone" required>
              <Input defaultValue={e.person.phone} required />
            </Field>
            <Field label="E-mail" required>
              <Input type="email" defaultValue={e.person.email} required />
            </Field>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6 space-y-4">
          <h2 className="font-display font-semibold">Cargo e remuneração</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Cargo" required>
              <Input defaultValue={e.position} required />
            </Field>
            <Field label="Data de contratação">
              <Input type="date" defaultValue={e.hired_at} />
            </Field>
            <Field label="Salário base">
              <Input type="number" step="0.01" defaultValue={e.salary} />
            </Field>
            <Field label="Tipo de comissão">
              <Select defaultValue={e.commission_type}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="percentage">Percentual</SelectItem>
                  <SelectItem value="fixed">Valor fixo</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Comissão">
              <Input type="number" step="0.01" defaultValue={e.commission_rate} />
            </Field>
          </div>
          <div className="flex items-center justify-between rounded-md border border-border p-4">
            <div>
              <div className="font-medium text-sm">Funcionário ativo</div>
              <div className="text-xs text-muted-foreground">
                Inativos não aparecem em novas vendas
              </div>
            </div>
            <Switch defaultChecked={e.active} />
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
