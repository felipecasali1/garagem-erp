import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowLeft, Save } from "lucide-react";
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

export const Route = createFileRoute("/_app/clients/new")({
  head: () => ({ meta: [{ title: "Novo Cliente | GaragemERP" }] }),
  component: NewClient,
});

function NewClient() {
  const navigate = useNavigate();
  const [type, setType] = useState<"individual" | "company">("individual");
  const [saving, setSaving] = useState(false);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget as HTMLFormElement);
    if (!form.get("name")?.toString().trim()) {
      toast.error("Informe o nome do cliente");
      return;
    }
    setSaving(true);
    setTimeout(() => {
      toast.success("Cliente cadastrado");
      navigate({ to: "/clients" });
    }, 500);
  };

  return (
    <form onSubmit={submit} className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" asChild type="button">
          <Link to="/clients">
            <ArrowLeft className="h-4 w-4" /> Clientes
          </Link>
        </Button>
        <h1 className="font-display text-2xl font-semibold tracking-tight flex-1">
          Novo Cliente
        </h1>
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
              <Input name="name" required />
            </Field>
            <Field label={type === "company" ? "CNPJ" : "CPF"} required>
              <Input name="document" required placeholder={type === "company" ? "00.000.000/0000-00" : "000.000.000-00"} />
            </Field>
            <Field label="Telefone" required>
              <Input name="phone" required placeholder="(00) 00000-0000" />
            </Field>
            <Field label="E-mail" required>
              <Input type="email" name="email" required />
            </Field>
          </div>
          <Field label="Observações">
            <Textarea rows={3} name="notes" placeholder="Notas internas..." />
          </Field>
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
