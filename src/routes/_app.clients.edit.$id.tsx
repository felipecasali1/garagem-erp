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
import type { CustomerDraft } from "@/modules/customers/types";
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
  const [draft, setDraft] = useState<CustomerDraft>(() => ({
    type: c?.person.type ?? "individual",
    name: c?.person.name ?? "",
    document: c?.person.cpf ?? c?.person.cnpj ?? "",
    phone: c?.person.phone ?? "",
    email: c?.person.email ?? "",
    notes: c?.notes ?? "",
    primary_address: {
      zip_code: c?.person.primary_address?.zip_code ?? "",
      city: c?.person.primary_address?.city ?? "",
      state: c?.person.primary_address?.state ?? "",
      neighborhood: c?.person.primary_address?.neighborhood ?? "",
      street: c?.person.primary_address?.street ?? "",
      number: c?.person.primary_address?.number ?? "",
      complement: c?.person.primary_address?.complement ?? "",
    },
  }));
  const patchDraft = (patch: Partial<CustomerDraft>) =>
    setDraft((current) => ({ ...current, ...patch }));
  const patchAddress = (patch: Partial<CustomerDraft["primary_address"]>) =>
    setDraft((current) => ({
      ...current,
      primary_address: { ...current.primary_address, ...patch },
    }));
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
                value={draft.name}
                onChange={(e) => patchDraft({ name: e.target.value })}
                required
              />
            </Field>
            <Field label={draft.type === "company" ? "CNPJ" : "CPF"} required>
              <Input
                value={draft.document}
                onChange={(e) => patchDraft({ document: e.target.value })}
                required
              />
            </Field>
            <Field label="Telefone" required>
              <Input
                value={draft.phone}
                onChange={(e) => patchDraft({ phone: e.target.value })}
                required
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
          <Field label="Observações">
            <Textarea
              rows={3}
              value={draft.notes}
              onChange={(e) => patchDraft({ notes: e.target.value })}
              placeholder="Notas internas sobre o cliente..."
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
                value={draft.primary_address.zip_code}
                onChange={(e) => patchAddress({ zip_code: e.target.value })}
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
              <Input
                value={draft.primary_address.state}
                onChange={(e) => patchAddress({ state: e.target.value })}
                placeholder="MS"
                maxLength={2}
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
