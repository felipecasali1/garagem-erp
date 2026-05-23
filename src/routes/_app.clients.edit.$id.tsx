import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowLeft, Save, Trash2 } from "lucide-react";
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
import { toast } from "sonner";
import { customers } from "@/shared/mock-data";

export const Route = createFileRoute("/_app/clients/edit/$id")({
  head: () => ({ meta: [{ title: "Editar Cliente | GaragemERP" }] }),
  component: EditClient,
});

function EditClient() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const c = customers.find((x) => String(x.id) === id);
  const [saving, setSaving] = useState(false);
  const [type, setType] = useState<"individual" | "company">(c?.person.type ?? "individual");

  if (!c) {
    return (
      <div className="max-w-2xl mx-auto text-center py-20">
        <h2 className="font-display text-xl mb-2">Cliente não encontrado</h2>
        <Button onClick={() => navigate({ to: "/clients" })}>Voltar</Button>
      </div>
    );
  }

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setTimeout(() => {
      toast.success("Cliente atualizado");
      navigate({ to: "/clients/$id", params: { id } });
    }, 500);
  };

  return (
    <form onSubmit={submit} className="max-w-3xl mx-auto space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="sm" asChild type="button">
          <Link to="/clients/$id" params={{ id }}>
            <ArrowLeft className="h-4 w-4" /> Voltar
          </Link>
        </Button>
        <h1 className="font-display text-2xl font-semibold tracking-tight flex-1">
          Editar Cliente
        </h1>
        <Button
          variant="outline"
          type="button"
          onClick={() => {
            toast.success("Cliente removido");
            navigate({ to: "/clients" });
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
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Tipo">
              <Select value={type} onValueChange={(v) => setType(v as typeof type)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="individual">Pessoa Física</SelectItem>
                  <SelectItem value="company">Pessoa Jurídica</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label={type === "company" ? "Razão Social" : "Nome completo"} required>
              <Input defaultValue={c.person.name} required />
            </Field>
            <Field label={type === "company" ? "CNPJ" : "CPF"} required>
              <Input defaultValue={c.person.cpf ?? c.person.cnpj ?? ""} required />
            </Field>
            <Field label="Telefone" required>
              <Input defaultValue={c.person.phone} required />
            </Field>
            <Field label="E-mail" required>
              <Input type="email" defaultValue={c.person.email} required />
            </Field>
          </div>
          <Field label="Observações">
            <Textarea rows={3} defaultValue={c.notes ?? ""} placeholder="Notas internas sobre o cliente..." />
          </Field>
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
