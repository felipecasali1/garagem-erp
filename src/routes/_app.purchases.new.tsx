import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Car, Plus, Save, Search, UserPlus } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/shared/components/ui/card";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Textarea } from "@/shared/components/ui/textarea";
import { DatePicker } from "@/shared/components/ui/date-picker";
import {
  CepInput,
  CpfCnpjInput,
  PhoneInput,
  UfInput,
} from "@/shared/components/form/field-inputs";
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
import type { PurchaseDraft } from "@/modules/purchases/types";
import { brl, initials } from "@/shared/lib/format";
import { formatDocument, formatPhone } from "@/shared/lib/field-format";
import type { Address, PersonType, Vehicle } from "@/shared/types/domain";
import { toast } from "sonner";
import { listVehicles, vehicleKeys } from "@/modules/vehicles/services/vehicles";
import { StatusBadge } from "@/shared/components/status-badge";
import {
  createPurchase,
  purchaseKeys,
} from "@/modules/purchases/services/purchases";
import {
  createSupplier,
  type CreateSupplierInput,
  listActiveSuppliers,
  supplierKeys,
} from "@/modules/suppliers/services/suppliers";
import {
  getSupplierTypeLabel,
  getSupplierTypeOptions,
} from "@/modules/suppliers/components/supplier-form";
import type { SupplierType } from "@/modules/suppliers/types";

export const Route = createFileRoute("/_app/purchases/new")({
  head: () => ({ meta: [{ title: "Nova Compra | GaragemERP" }] }),
  validateSearch: (search: { vehicleId?: unknown }): { vehicleId?: number } => {
    const vehicleId = Number(search.vehicleId);
    return Number.isFinite(vehicleId) && vehicleId > 0 ? { vehicleId } : {};
  },
  component: NewPurchase,
});

function NewPurchase() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { vehicleId: initialVehicleId } = Route.useSearch();
  const { data: vehicles = [], isLoading: loadingVehicles } = useQuery({
    queryKey: vehicleKeys.all,
    queryFn: listVehicles,
  });
  const { data: suppliers = [], isLoading: loadingSuppliers } = useQuery({
    queryKey: supplierKeys.all,
    queryFn: listActiveSuppliers,
  });
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
  const [vehicleSearch, setVehicleSearch] = useState("");
  const [selectedVehicleId, setSelectedVehicleId] = useState<number | null>(
    initialVehicleId ?? null,
  );
  const [createOpen, setCreateOpen] = useState(false);

  const patchDraft = (patch: Partial<PurchaseDraft>) =>
    setDraft((current) => ({ ...current, ...patch }));

  const filtered = useMemo(
    () =>
      suppliers.filter(
        (s) =>
          s.person.name.toLowerCase().includes(search.toLowerCase()) ||
          `${s.person.cpf ?? ""}${s.person.cnpj ?? ""}`.includes(search),
      ),
    [suppliers, search],
  );

  const selected = suppliers.find((s) => s.id === draft.supplier_id);
  const selectedVehicle = vehicles.find((vehicle) => vehicle.id === selectedVehicleId);
  const evaluationVehicles = vehicles.filter((vehicle) => vehicle.status === "evaluating");
  const filteredEvaluationVehicles = evaluationVehicles.filter(
    (vehicle) =>
      !vehicleSearch ||
      `${vehicle.brand} ${vehicle.model} ${vehicle.plate}`
        .toLowerCase()
        .includes(vehicleSearch.toLowerCase()),
  );

  useEffect(() => {
    if (!selectedVehicle) return;
    patchDraft({
      vehicle: {
        plate: selectedVehicle.plate,
        model_label: `${selectedVehicle.brand} ${selectedVehicle.model}`.trim(),
        model_year: selectedVehicle.model_year,
        current_mileage: selectedVehicle.current_mileage,
      },
      total_value: selectedVehicle.cost_price || draft.total_value,
    });
  }, [selectedVehicle?.id]);

  const createMutation = useMutation({
    mutationFn: createPurchase,
    onSuccess: async (purchaseId) => {
      await queryClient.invalidateQueries({ queryKey: purchaseKeys.all });
      await queryClient.invalidateQueries({ queryKey: vehicleKeys.all });
      if (selectedVehicleId) {
        await queryClient.invalidateQueries({ queryKey: vehicleKeys.detail(selectedVehicleId) });
      }
      toast.success("Compra registrada");
      await navigate({ to: "/purchases/$id", params: { id: String(purchaseId) } });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Falha ao registrar compra.");
    },
  });

  const supplierMutation = useMutation({
    mutationFn: createSupplier,
    onSuccess: async (supplierId, variables) => {
      await queryClient.invalidateQueries({ queryKey: supplierKeys.all });
      patchDraft({ supplier_id: supplierId });
      setCreateOpen(false);
      toast.success(`Fornecedor "${variables.name}" criado`);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Falha ao criar fornecedor.");
    },
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedVehicle) {
      toast.error("Selecione um veículo em avaliação para registrar a compra.");
      return;
    }
    if (!selected) {
      toast.error("Selecione um fornecedor");
      return;
    }
    createMutation.mutate({
      supplierId: selected.id,
      vehicleId: selectedVehicle.id,
      totalValue: draft.total_value,
      purchaseDate: draft.purchase_date ?? new Date().toISOString().slice(0, 10),
      status: draft.status,
      notes: draft.notes,
    });
  };

  return (
    <form onSubmit={submit} className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" asChild type="button">
          <Link to="/purchases">
            <ArrowLeft className="h-4 w-4" /> Compras
          </Link>
        </Button>
        <h1 className="font-display text-2xl font-semibold tracking-tight flex-1">
          Registrar Compra
        </h1>
        <Button type="submit" disabled={createMutation.isPending}>
          <Save className="h-4 w-4" /> {createMutation.isPending ? "Salvando..." : "Salvar"}
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
              <NewSupplierDialog
                isSaving={supplierMutation.isPending}
                onCreate={(supplier) => supplierMutation.mutate(supplier)}
              />
            </Dialog>
          </div>

          {selected ? (
            <div className="flex items-center gap-3 rounded-lg border border-primary/30 bg-primary/5 p-3">
              <Avatar>
                <AvatarFallback className="bg-muted text-xs">
                  {initials(selected.person.name)}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <div className="font-medium">{selected.person.name}</div>
                <div className="text-xs text-muted-foreground truncate">
                  {formatDocument(
                    selected.person.cpf ?? selected.person.cnpj ?? "",
                    selected.person.type,
                  )}{" "}
                  · {formatPhone(selected.person.phone)}
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
                {loadingSuppliers ? (
                  <div className="p-6 text-center text-sm text-muted-foreground">
                    Carregando fornecedores...
                  </div>
                ) : filtered.length === 0 ? (
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
                        <AvatarFallback className="text-xs bg-muted">
                          {initials(s.person.name)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{s.person.name}</div>
                        <div className="text-xs text-muted-foreground truncate">
                          {formatDocument(
                            s.person.cpf ?? s.person.cnpj ?? "",
                            s.person.type,
                          )}
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
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="font-display font-semibold">Veículo da compra</h2>
              <p className="text-xs text-muted-foreground">
                Selecione uma avaliação existente ou cadastre uma nova avaliação antes de concluir a
                compra.
              </p>
            </div>
            <Button type="button" variant="outline" size="sm" asChild>
              <Link to="/vehicles/new">
                <Plus className="h-4 w-4" /> Nova avaliação
              </Link>
            </Button>
          </div>

          {selectedVehicle ? (
            <SelectedVehicleCard
              vehicle={selectedVehicle}
              onChange={() => setSelectedVehicleId(null)}
            />
          ) : (
            <div className="space-y-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar avaliação por placa, marca ou modelo..."
                  className="pl-9"
                  value={vehicleSearch}
                  onChange={(event) => setVehicleSearch(event.target.value)}
                />
              </div>
              {loadingVehicles ? (
                <div className="rounded-md border border-border p-6 text-sm text-muted-foreground">
                  Carregando avaliações...
                </div>
              ) : filteredEvaluationVehicles.length === 0 ? (
                <div className="rounded-md border border-border p-6 text-center text-sm text-muted-foreground">
                  Nenhum veículo em avaliação encontrado.
                  <Button type="button" variant="link" asChild>
                    <Link to="/vehicles/new">Cadastrar nova avaliação</Link>
                  </Button>
                </div>
              ) : (
                <div className="max-h-72 overflow-y-auto divide-y divide-border rounded-md border border-border">
                  {filteredEvaluationVehicles.map((vehicle) => (
                    <button
                      key={vehicle.id}
                      type="button"
                      onClick={() => setSelectedVehicleId(vehicle.id)}
                      className="flex w-full items-center gap-3 p-3 text-left transition hover:bg-muted/40"
                    >
                      <div className="flex h-10 w-10 items-center justify-center rounded-md bg-muted text-muted-foreground">
                        <Car className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="font-medium truncate">
                          {vehicle.brand} {vehicle.model}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {vehicle.plate} · {vehicle.model_year} ·{" "}
                          {vehicle.current_mileage.toLocaleString("pt-BR")} km
                        </div>
                      </div>
                      <div className="hidden text-right text-xs text-muted-foreground md:block">
                        <div>{brl(vehicle.cost_price)} custo est.</div>
                        <div>{brl(vehicle.sale_price)} venda est.</div>
                      </div>
                      <StatusBadge kind="vehicle" value={vehicle.status} />
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
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
                value={draft.total_value || ""}
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
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
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

function SelectedVehicleCard({
  vehicle,
  onChange,
}: {
  vehicle: Vehicle;
  onChange: () => void;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-primary/30 bg-primary/5 p-4 md:flex-row md:items-center">
      <div className="flex h-11 w-11 items-center justify-center rounded-md bg-background text-primary">
        <Car className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <div className="font-medium">
            {vehicle.brand} {vehicle.model}
          </div>
          <StatusBadge kind="vehicle" value={vehicle.status} />
        </div>
        <div className="mt-1 text-xs text-muted-foreground">
          {vehicle.plate} · Ano {vehicle.model_year} ·{" "}
          {vehicle.current_mileage.toLocaleString("pt-BR")} km
        </div>
        <div className="mt-1 text-xs text-muted-foreground">
          Custo estimado: {brl(vehicle.cost_price)} · Venda estimada: {brl(vehicle.sale_price)}
        </div>
      </div>
      <Button type="button" variant="ghost" size="sm" onClick={onChange}>
        Trocar
      </Button>
    </div>
  );
}

function NewSupplierDialog({
  isSaving,
  onCreate,
}: {
  isSaving: boolean;
  onCreate: (supplier: CreateSupplierInput) => void;
}) {
  const [name, setName] = useState("");
  const [document, setDocument] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [type, setType] = useState<PersonType>("company");
  const [supplierType, setSupplierType] = useState<SupplierType>("company");
  const [address, setAddress] = useState<Address>({
    zip_code: "",
    city: "",
    state: "",
    neighborhood: "",
    street: "",
    number: "",
    complement: "",
  });
  const supplierTypeOptions = getSupplierTypeOptions(type);
  const patchAddress = (patch: Partial<Address>) =>
    setAddress((current) => ({ ...current, ...patch }));
  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Novo Fornecedor</DialogTitle>
      </DialogHeader>
      <div className="space-y-4">
        <Field label="Tipo de pessoa">
          <Select
            value={type}
            onValueChange={(value) => {
              const nextType = value as PersonType;
              setType(nextType);
              setSupplierType(nextType === "company" ? "company" : "individual");
            }}
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
        <Field label="Origem / categoria">
          <Select
            value={supplierType}
            onValueChange={(value) => setSupplierType(value as SupplierType)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {supplierTypeOptions.map((value) => (
                <SelectItem key={value} value={value}>
                  {getSupplierTypeLabel(value)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Nome / Razão social" required>
          <Input value={name} onChange={(e) => setName(e.target.value)} required />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={type === "company" ? "CNPJ" : "CPF"}>
            <CpfCnpjInput value={document} onValueChange={setDocument} personType={type} />
          </Field>
          <Field label="Telefone">
            <PhoneInput value={phone} onValueChange={setPhone} />
          </Field>
        </div>
        <Field label="E-mail">
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="CEP">
            <CepInput
              placeholder="79000-000"
              value={address.zip_code}
              onValueChange={(value) => patchAddress({ zip_code: value })}
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
            <UfInput
              placeholder="MS"
              value={address.state}
              onValueChange={(value) => patchAddress({ state: value })}
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
              document,
              phone,
              email,
              type,
              supplier_type: supplierType,
              primary_address: Object.values(address).some(Boolean) ? address : undefined,
            });
          }}
        >
          <Plus className="h-4 w-4" /> {isSaving ? "Criando..." : "Criar fornecedor"}
        </Button>
      </DialogFooter>
    </DialogContent>
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
