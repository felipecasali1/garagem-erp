import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowLeft, Save } from "lucide-react";
import { Card, CardContent } from "@/shared/components/ui/card";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Switch } from "@/shared/components/ui/switch";
import { DatePicker } from "@/shared/components/ui/date-picker";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/employees/new")({
  head: () => ({ meta: [{ title: "Novo Funcionário | GaragemERP" }] }),
  component: NewEmployee,
});

function NewEmployee() {
  const navigate = useNavigate();
  const [active, setActive] = useState(true);
  const [hiredAt, setHiredAt] = useState<string | undefined>(new Date().toISOString().slice(0, 10));
  const [commissionType, setCommissionType] = useState<"percentage" | "fixed">("percentage");
  const [role, setRole] = useState("seller");
  const [saving, setSaving] = useState(false);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget as HTMLFormElement);
    if (!form.get("name")?.toString().trim()) {
      toast.error("Nome obrigatório");
      return;
    }
    if (!form.get("position")?.toString().trim()) {
      toast.error("Cargo obrigatório");
      return;
    }
    setSaving(true);
    setTimeout(() => {
      toast.success("Funcionário cadastrado");
      navigate({ to: "/employees" });
    }, 500);
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
        <Button type="submit" disabled={saving}>
          <Save className="h-4 w-4" /> {saving ? "Salvando..." : "Salvar"}
        </Button>
      </div>

      <Card>
        <CardContent className="p-6 space-y-4">
          <h2 className="font-display font-semibold">Dados pessoais</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Nome completo" required><Input name="name" required /></Field>
            <Field label="CPF" required><Input name="cpf" required placeholder="000.000.000-00" /></Field>
            <Field label="Telefone" required><Input name="phone" required placeholder="(00) 00000-0000" /></Field>
            <Field label="E-mail" required><Input type="email" name="email" required /></Field>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6 space-y-4">
          <h2 className="font-display font-semibold">Cargo e remuneração</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Cargo" required><Input name="position" required placeholder="Vendedor, Gerente..." /></Field>
            <Field label="Data de contratação">
              <DatePicker value={hiredAt} onChange={setHiredAt} name="hired_at" />
            </Field>
            <Field label="Salário base"><Input type="number" step="0.01" name="salary" placeholder="0,00" /></Field>
            <Field label="Tipo de comissão">
              <Select value={commissionType} onValueChange={(v) => setCommissionType(v as typeof commissionType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="percentage">Percentual</SelectItem>
                  <SelectItem value="fixed">Valor fixo</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label={commissionType === "percentage" ? "Comissão (%)" : "Comissão (R$)"}>
              <Input type="number" step="0.01" name="commission_rate" placeholder="0" />
            </Field>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6 space-y-4">
          <h2 className="font-display font-semibold">Acesso ao sistema</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Perfil de acesso">
              <Select value={role} onValueChange={setRole}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Administrador</SelectItem>
                  <SelectItem value="manager">Gerente</SelectItem>
                  <SelectItem value="seller">Vendedor</SelectItem>
                  <SelectItem value="financial">Financeiro</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Senha temporária"><Input type="password" name="password" placeholder="Mínimo 8 caracteres" /></Field>
          </div>
          <div className="flex items-center justify-between rounded-md border border-border p-4">
            <div>
              <div className="font-medium text-sm">Funcionário ativo</div>
              <div className="text-xs text-muted-foreground">Inativos não aparecem em novas vendas</div>
            </div>
            <Switch checked={active} onCheckedChange={setActive} />
          </div>
        </CardContent>
      </Card>
    </form>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs uppercase tracking-wide text-muted-foreground">
        {label} {required && <span className="text-destructive">*</span>}
      </Label>
      {children}
    </div>
  );
}
