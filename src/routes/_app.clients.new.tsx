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
import type { CustomerDraft } from "@/modules/customers/types";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/clients/new")({
  head: () => ({ meta: [{ title: "Novo Cliente | GaragemERP" }] }),
  component: NewClient,
});

function NewClient() {
  const navigate = useNavigate();
  const [draft, setDraft] = useState<CustomerDraft>({
    type: "individual",
    name: "",
    document: "",
    phone: "",
    email: "",
    notes: "",
    primary_address: {
      zip_code: "",
      city: "",
      state: "",
      neighborhood: "",
      street: "",
      number: "",
      complement: "",
    },
  });
  const [saving, setSaving] = useState(false);
  const patchDraft = (patch: Partial<CustomerDraft>) =>
    setDraft((current) => ({ ...current, ...patch }));
  const patchAddress = (patch: Partial<CustomerDraft["primary_address"]>) =>
    setDraft((current) => ({
      ...current,
      primary_address: { ...current.primary_address, ...patch },
    }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft.name.trim()) {
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
              <Select
                value={draft.type}
                onValueChange={(v) => patchDraft({ type: v as CustomerDraft["type"] })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="individual">Pessoa Física</SelectItem>
                  <SelectItem value="company">Pessoa Jurídica</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label={draft.type === "company" ? "Razão Social" : "Nome completo"} required>
              <Input
                name="name"
                required
                value={draft.name}
                onChange={(e) => patchDraft({ name: e.target.value })}
              />
            </Field>
            <Field label={draft.type === "company" ? "CNPJ" : "CPF"} required>
              <Input
                name="document"
                required
                value={draft.document}
                onChange={(e) => patchDraft({ document: e.target.value })}
                placeholder={draft.type === "company" ? "00.000.000/0000-00" : "000.000.000-00"}
              />
            </Field>
            <Field label="Telefone" required>
              <Input
                name="phone"
                required
                value={draft.phone}
                onChange={(e) => patchDraft({ phone: e.target.value })}
                placeholder="(00) 00000-0000"
              />
            </Field>
            <Field label="E-mail" required>
              <Input
                type="email"
                name="email"
                required
                value={draft.email}
                onChange={(e) => patchDraft({ email: e.target.value })}
              />
            </Field>
          </div>
          <Field label="Observações">
            <Textarea
              rows={3}
              name="notes"
              value={draft.notes}
              onChange={(e) => patchDraft({ notes: e.target.value })}
              placeholder="Notas internas..."
            />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6 space-y-4">
          <h2 className="font-display font-semibold">Endereço principal</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Field label="CEP">
              <Input
                name="zip_code"
                value={draft.primary_address.zip_code}
                onChange={(e) => patchAddress({ zip_code: e.target.value })}
                placeholder="79000-000"
              />
            </Field>
            <Field label="Cidade">
              <Input
                name="city"
                value={draft.primary_address.city}
                onChange={(e) => patchAddress({ city: e.target.value })}
                placeholder="Campo Grande"
              />
            </Field>
            <Field label="UF">
              <Input
                name="state"
                value={draft.primary_address.state}
                onChange={(e) => patchAddress({ state: e.target.value })}
                placeholder="MS"
                maxLength={2}
              />
            </Field>
            <Field label="Bairro">
              <Input
                name="neighborhood"
                value={draft.primary_address.neighborhood}
                onChange={(e) => patchAddress({ neighborhood: e.target.value })}
                placeholder="Centro"
              />
            </Field>
            <Field label="Rua">
              <Input
                name="street"
                value={draft.primary_address.street}
                onChange={(e) => patchAddress({ street: e.target.value })}
                placeholder="Rua Exemplo"
              />
            </Field>
            <Field label="Número">
              <Input
                name="number"
                value={draft.primary_address.number}
                onChange={(e) => patchAddress({ number: e.target.value })}
                placeholder="123"
              />
            </Field>
            <Field label="Complemento">
              <Input
                name="complement"
                value={draft.primary_address.complement ?? ""}
                onChange={(e) => patchAddress({ complement: e.target.value })}
                placeholder="Sala, apto, referência..."
              />
            </Field>
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
