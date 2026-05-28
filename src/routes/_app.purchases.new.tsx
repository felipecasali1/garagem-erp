import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ArrowLeft, Plus, Save, Search, UserPlus } from "lucide-react";
import { Card, CardContent } from "@/shared/components/ui/card";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Textarea } from "@/shared/components/ui/textarea";
import { DatePicker } from "@/shared/components/ui/date-picker";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/shared/components/ui/dialog";
import { Avatar, AvatarFallback } from "@/shared/components/ui/avatar";
import type { PurchaseDraft, SupplierOption } from "@/modules/purchases/types";
import { customers as initialCustomers } from "@/shared/mock-data";
import { initials } from "@/shared/lib/format";
import type { Address, PersonType } from "@/shared/types/domain";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/purchases/new")({
  head: () => ({ meta: [{ title: "Nova Compra | GaragemERP" }] }),
  component: NewPurchase,
});

function NewPurchase() {
  const navigate = useNavigate();
  const [suppliers, setSuppliers] = useState<SupplierOption[]>(
    initialCustomers.map((c) => ({
      id: c.id,
      name: c.person.name,
      cpf: c.person.cpf,
      cnpj: c.person.cnpj,
      phone: c.person.phone,
      email: c.person.email,
      type: c.person.type,
      primary_address: c.person.primary_address,
    })),
  );
  const [draft, setDraft] = useState<PurchaseDraft>({
    supplier_id: null,
    vehicle: {
      plate: "",
      model_label: "",
      model_year: null,
      current_mileage: null,
    },
    total_value: 0,
    purchase_date: new Date().toISOString().slice(0, 10),
    status: "pending",
    notes: "",
  });
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const patchDraft = (patch: Partial<PurchaseDraft>) =>
    setDraft((current) => ({ ...current, ...patch }));
  const patchVehicle = (patch: Partial<PurchaseDraft["vehicle"]>) =>
    setDraft((current) => ({
      ...current,
      vehicle: { ...current.vehicle, ...patch },
    }));

  const filtered = useMemo(
    () =>
      suppliers.filter((s) =>
        s.name.toLowerCase().includes(search.toLowerCase()) ||
        `${s.cpf ?? ""}${s.cnpj ?? ""}`.includes(search),
      ),
    [suppliers, search],
  );

  const selected = suppliers.find((s) => s.id === draft.supplier_id);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected) {
      toast.error("Selecione um fornecedor");
      return;
    }
    setSaving(true);
    setTimeout(() => {
      toast.success("Compra registrada");
      navigate({ to: "/purchases" });
    }, 500);
  };

  const handleNewSupplier = (data: Omit<SupplierOption, "id">) => {
    const s: SupplierOption = { id: Date.now(), ...data };
    setSuppliers((arr) => [s, ...arr]);
    patchDraft({ supplier_id: s.id });
    setCreateOpen(false);
    toast.success(`Fornecedor "${s.name}" criado`);
  };

  return (
    <form onSubmit={submit} className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" asChild type="button">
          <Link to="/purchases">
            <ArrowLeft className="h-4 w-4" /> Compras
          </Link>
        </Button>
        <h1 className="font-display text-2xl font-semibold tracking-tight flex-1">Registrar Compra</h1>
        <Button type="submit" disabled={saving}>
          <Save className="h-4 w-4" /> {saving ? "Salvando..." : "Salvar"}
        </Button>
      </div>

      <Card>
        <CardContent className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-display font-semibold">Fornecedor</h2>
            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
              <DialogTrigger asChild>
                <Button type="button" variant="outline" size="sm">
                  <UserPlus className="h-4 w-4" /> Novo fornecedor
                </Button>
              </DialogTrigger>
              <NewSupplierDialog onCreate={handleNewSupplier} />
            </Dialog>
          </div>

          {selected ? (
            <div className="flex items-center gap-3 rounded-lg border border-primary/30 bg-primary/5 p-3">
              <Avatar><AvatarFallback className="bg-muted text-xs">{initials(selected.name)}</AvatarFallback></Avatar>
              <div className="flex-1 min-w-0">
                <div className="font-medium">{selected.name}</div>
                <div className="text-xs text-muted-foreground truncate">
                  {selected.cpf ?? selected.cnpj} · {selected.phone}
                </div>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => patchDraft({ supplier_id: null })}
              >
                Trocar
              </Button>
            </div>
          ) : (
            <>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por nome ou documento..."
                  className="pl-9"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <div className="max-h-64 overflow-y-auto divide-y divide-border rounded-md border border-border">
                {filtered.length === 0 ? (
                  <div className="p-6 text-center text-sm text-muted-foreground">
                    Nenhum fornecedor encontrado.
                    <Button type="button" variant="link" onClick={() => setCreateOpen(true)}>
                      Criar novo
                    </Button>
                  </div>
                ) : (
                  filtered.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => patchDraft({ supplier_id: s.id })}
                      className="w-full flex items-center gap-3 p-3 text-left hover:bg-muted/40 cursor-pointer"
                    >
                      <Avatar className="h-8 w-8">
                        <AvatarFallback className="text-xs bg-muted">{initials(s.name)}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{s.name}</div>
                        <div className="text-xs text-muted-foreground truncate">
                          {s.cpf ?? s.cnpj}
                        </div>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6 space-y-4">
          <h2 className="font-display font-semibold">Veículo adquirido</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Placa" required>
              <Input
                required
                placeholder="ABC-1D23"
                value={draft.vehicle.plate}
                onChange={(e) => patchVehicle({ plate: e.target.value })}
              />
            </Field>
            <Field label="Marca / Modelo" required>
              <Input
                required
                placeholder="Toyota Corolla"
                value={draft.vehicle.model_label}
                onChange={(e) => patchVehicle({ model_label: e.target.value })}
              />
            </Field>
            <Field label="Ano modelo">
              <Input
                type="number"
                value={draft.vehicle.model_year ?? ""}
                onChange={(e) =>
                  patchVehicle({ model_year: e.target.value ? Number(e.target.value) : null })
                }
              />
            </Field>
            <Field label="Quilometragem">
              <Input
                type="number"
                value={draft.vehicle.current_mileage ?? ""}
                onChange={(e) =>
                  patchVehicle({
                    current_mileage: e.target.value ? Number(e.target.value) : null,
                  })
                }
              />
            </Field>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6 space-y-4">
          <h2 className="font-display font-semibold">Dados financeiros</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Field label="Valor pago" required>
              <Input
                type="number"
                required
                placeholder="0,00"
                value={draft.total_value}
                onChange={(e) => patchDraft({ total_value: Number(e.target.value) || 0 })}
              />
            </Field>
            <Field label="Data da compra" required>
              <DatePicker
                value={draft.purchase_date}
                onChange={(value) => patchDraft({ purchase_date: value })}
                required
                name="purchase_date"
              />
            </Field>
            <Field label="Status">
              <Select
                value={draft.status}
                onValueChange={(value) => patchDraft({ status: value as PurchaseDraft["status"] })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">Pendente</SelectItem>
                  <SelectItem value="completed">Concluída</SelectItem>
                  <SelectItem value="canceled">Cancelada</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>
          <Field label="Observações">
            <Textarea
              rows={3}
              value={draft.notes}
              onChange={(e) => patchDraft({ notes: e.target.value })}
            />
          </Field>
        </CardContent>
      </Card>
    </form>
  );
}

function NewSupplierDialog({ onCreate }: { onCreate: (s: Omit<SupplierOption, "id">) => void }) {
  const [name, setName] = useState("");
  const [document, setDocument] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [type, setType] = useState<PersonType>("company");
  const [address, setAddress] = useState<Address>({
    zip_code: "",
    city: "",
    state: "",
    neighborhood: "",
    street: "",
    number: "",
    complement: "",
  });
  const patchAddress = (patch: Partial<Address>) =>
    setAddress((current) => ({ ...current, ...patch }));
  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Novo Fornecedor</DialogTitle>
      </DialogHeader>
      <div className="space-y-4">
        <Field label="Tipo">
          <Select value={type} onValueChange={(value) => setType(value as PersonType)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="individual">Pessoa Física</SelectItem>
              <SelectItem value="company">Pessoa Jurídica</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="Nome / Razão social" required>
          <Input value={name} onChange={(e) => setName(e.target.value)} required />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={type === "company" ? "CNPJ" : "CPF"}>
            <Input value={document} onChange={(e) => setDocument(e.target.value)} />
          </Field>
          <Field label="Telefone"><Input value={phone} onChange={(e) => setPhone(e.target.value)} /></Field>
        </div>
        <Field label="E-mail"><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="CEP">
            <Input
              placeholder="79000-000"
              value={address.zip_code}
              onChange={(e) => patchAddress({ zip_code: e.target.value })}
            />
          </Field>
          <Field label="Cidade">
            <Input
              placeholder="Campo Grande"
              value={address.city}
              onChange={(e) => patchAddress({ city: e.target.value })}
            />
          </Field>
          <Field label="UF">
            <Input
              placeholder="MS"
              maxLength={2}
              value={address.state}
              onChange={(e) => patchAddress({ state: e.target.value })}
            />
          </Field>
          <Field label="Bairro">
            <Input
              placeholder="Centro"
              value={address.neighborhood}
              onChange={(e) => patchAddress({ neighborhood: e.target.value })}
            />
          </Field>
          <Field label="Rua">
            <Input
              placeholder="Rua Exemplo"
              value={address.street}
              onChange={(e) => patchAddress({ street: e.target.value })}
            />
          </Field>
          <Field label="Número">
            <Input
              placeholder="123"
              value={address.number}
              onChange={(e) => patchAddress({ number: e.target.value })}
            />
          </Field>
          <Field label="Complemento">
            <Input
              placeholder="Sala, apto, referência..."
              value={address.complement ?? ""}
              onChange={(e) => patchAddress({ complement: e.target.value })}
            />
          </Field>
        </div>
      </div>
      <DialogFooter>
        <Button
          type="button"
          onClick={() => {
            if (!name.trim()) {
              toast.error("Nome obrigatório");
              return;
            }
            onCreate({
              name,
              cpf: type === "individual" ? document || undefined : undefined,
              cnpj: type === "company" ? document || undefined : undefined,
              phone,
              email,
              type,
              primary_address: Object.values(address).some(Boolean) ? address : undefined,
            });
          }}
        >
          <Plus className="h-4 w-4" /> Criar fornecedor
        </Button>
      </DialogFooter>
    </DialogContent>
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
