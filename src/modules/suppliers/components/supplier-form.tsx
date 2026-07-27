import { Save } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { Card, CardContent } from "@/shared/components/ui/card";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { Textarea } from "@/shared/components/ui/textarea";
import { CepInput, CpfCnpjInput, PhoneInput, UfInput } from "@/shared/components/form/field-inputs";
import type { SupplierDraft, SupplierType } from "@/modules/suppliers/types";

const supplierTypeLabels: Record<SupplierType, string> = {
  individual: "Pessoa física",
  company: "Empresa",
  dealership: "Revenda",
  auction: "Leilão",
  trade_in: "Troca",
};

export function createEmptySupplierDraft(): SupplierDraft {
  return {
    type: "individual",
    name: "",
    document: "",
    phone: "",
    email: "",
    notes: "",
    supplier_type: "individual",
    primary_address: {
      zip_code: "",
      city: "",
      state: "",
      neighborhood: "",
      street: "",
      number: "",
      complement: "",
    },
  };
}

export function SupplierForm({
  draft,
  saving,
  submitLabel,
  onSubmit,
  onChange,
}: {
  draft: SupplierDraft;
  saving: boolean;
  submitLabel: string;
  onSubmit: () => void;
  onChange: (draft: SupplierDraft) => void;
}) {
  const patchDraft = (patch: Partial<SupplierDraft>) => onChange({ ...draft, ...patch });
  const patchAddress = (patch: Partial<SupplierDraft["primary_address"]>) =>
    patchDraft({ primary_address: { ...draft.primary_address, ...patch } });

  return (
    <>
      <Card>
        <CardContent className="p-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Tipo de pessoa">
              <Select
                value={draft.type}
                onValueChange={(value) =>
                  patchDraft({
                    type: value as SupplierDraft["type"],
                    supplier_type: value === "company" ? "company" : "individual",
                  })
                }
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
            <Field label="Perfil do fornecedor">
              <Select
                value={draft.supplier_type}
                onValueChange={(value) => patchDraft({ supplier_type: value as SupplierType })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(supplierTypeLabels).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label={draft.type === "company" ? "Razão Social" : "Nome completo"} required>
              <Input
                required
                value={draft.name}
                onChange={(event) => patchDraft({ name: event.target.value })}
              />
            </Field>
            <Field label={draft.type === "company" ? "CNPJ" : "CPF"} required>
              <CpfCnpjInput
                required
                value={draft.document}
                onValueChange={(value) => patchDraft({ document: value })}
                personType={draft.type}
                placeholder={draft.type === "company" ? "00.000.000/0000-00" : "000.000.000-00"}
              />
            </Field>
            <Field label="Telefone" required>
              <PhoneInput
                required
                value={draft.phone}
                onValueChange={(value) => patchDraft({ phone: value })}
                placeholder="(00) 00000-0000"
              />
            </Field>
            <Field label="E-mail" required>
              <Input
                type="email"
                required
                value={draft.email}
                onChange={(event) => patchDraft({ email: event.target.value })}
              />
            </Field>
          </div>
          <Field label="Observações">
            <Textarea
              rows={3}
              value={draft.notes}
              onChange={(event) => patchDraft({ notes: event.target.value })}
              placeholder="Notas internas sobre negociações, origem ou condições..."
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
                onChange={(event) => patchAddress({ city: event.target.value })}
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
                onChange={(event) => patchAddress({ neighborhood: event.target.value })}
                placeholder="Centro"
              />
            </Field>
            <Field label="Rua">
              <Input
                value={draft.primary_address.street}
                onChange={(event) => patchAddress({ street: event.target.value })}
                placeholder="Rua Exemplo"
              />
            </Field>
            <Field label="Número">
              <Input
                value={draft.primary_address.number}
                onChange={(event) => patchAddress({ number: event.target.value })}
                placeholder="123"
              />
            </Field>
            <Field label="Complemento">
              <Input
                value={draft.primary_address.complement ?? ""}
                onChange={(event) => patchAddress({ complement: event.target.value })}
                placeholder="Sala, apto, referência..."
              />
            </Field>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button type="button" disabled={saving} onClick={onSubmit}>
          <Save className="h-4 w-4" /> {saving ? "Salvando..." : submitLabel}
        </Button>
      </div>
    </>
  );
}

export function getSupplierTypeLabel(type: SupplierType) {
  return supplierTypeLabels[type];
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
