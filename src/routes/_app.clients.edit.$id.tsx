import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
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
import { CepInput, CpfCnpjInput, PhoneInput, UfInput } from "@/shared/components/form/field-inputs";
import { ConfirmActionDialog } from "@/shared/components/confirm-action-dialog";
import type { CustomerDraft } from "@/modules/customers/types";
import {
  customerKeys,
  deleteCustomer,
  getCustomerById,
  updateCustomer,
} from "@/modules/customers/services/customers";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/clients/edit/$id")({
  head: () => ({ meta: [{ title: "Editar Cliente | GaragemERP" }] }),
  component: EditClient,
});

function EditClient() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const customerId = Number(id);
  const { data: customer, isLoading } = useQuery({
    queryKey: customerKeys.detail(customerId),
    queryFn: () => getCustomerById(customerId),
    enabled: Number.isFinite(customerId),
  });
  const [draft, setDraft] = useState<CustomerDraft | null>(null);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  useEffect(() => {
    if (!customer) return;
    setDraft({
      type: customer.person.type,
      name: customer.person.name,
      document: customer.person.cpf ?? customer.person.cnpj ?? "",
      phone: customer.person.phone,
      email: customer.person.email,
      notes: customer.notes ?? "",
      primary_address: {
        zip_code: customer.person.primary_address?.zip_code ?? "",
        city: customer.person.primary_address?.city ?? "",
        state: customer.person.primary_address?.state ?? "",
        neighborhood: customer.person.primary_address?.neighborhood ?? "",
        street: customer.person.primary_address?.street ?? "",
        number: customer.person.primary_address?.number ?? "",
        complement: customer.person.primary_address?.complement ?? "",
      },
    });
  }, [customer]);

  const updateMutation = useMutation({
    mutationFn: (values: CustomerDraft) => updateCustomer(customerId, values),
    onSuccess: async () => {
      toast.success("Cliente atualizado");
      await navigate({ to: "/clients/$id", params: { id } });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Falha ao atualizar cliente.");
    },
  });
  const deleteMutation = useMutation({
    mutationFn: () => deleteCustomer(customerId),
    onSuccess: async () => {
      toast.success("Cliente removido");
      await navigate({ to: "/clients" });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Falha ao excluir cliente.");
    },
  });

  const patchDraft = (patch: Partial<CustomerDraft>) =>
    setDraft((current) => (current ? { ...current, ...patch } : current));
  const patchAddress = (patch: Partial<CustomerDraft["primary_address"]>) =>
    setDraft((current) =>
      current ? { ...current, primary_address: { ...current.primary_address, ...patch } } : current,
    );

  if (isLoading) {
    return (
      <div className="max-w-3xl mx-auto py-16 text-sm text-muted-foreground">
        Carregando cliente...
      </div>
    );
  }

  if (!customer || !draft) {
    return (
      <div className="max-w-2xl mx-auto text-center py-20">
        <h2 className="font-display text-xl mb-2">Cliente não encontrado</h2>
        <Button onClick={() => navigate({ to: "/clients" })}>Voltar</Button>
      </div>
    );
  }

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    updateMutation.mutate(draft);
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
        <Button variant="outline" type="button" onClick={() => setConfirmDeleteOpen(true)}>
          <Trash2 className="h-4 w-4" /> Excluir
        </Button>
        <Button type="submit" disabled={updateMutation.isPending}>
          <Save className="h-4 w-4" /> {updateMutation.isPending ? "Salvando..." : "Salvar"}
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
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
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
              <CpfCnpjInput
                value={draft.document}
                onValueChange={(value) => patchDraft({ document: value })}
                required
                personType={draft.type}
                placeholder={draft.type === "company" ? "00.000.000/0000-00" : "000.000.000-00"}
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
      <ConfirmActionDialog
        open={confirmDeleteOpen}
        onOpenChange={setConfirmDeleteOpen}
        title="Excluir cliente?"
        description="Esta ação não pode ser desfeita. O cliente será removido permanentemente do sistema."
        confirmLabel={deleteMutation.isPending ? "Excluindo..." : "Excluir"}
        confirmDisabled={deleteMutation.isPending}
        onConfirm={() => {
          setConfirmDeleteOpen(false);
          deleteMutation.mutate();
        }}
      />
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
