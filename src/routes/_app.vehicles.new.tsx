import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Save, Plus, X, Trash2 } from "lucide-react";
import { Card, CardContent } from "@/shared/components/ui/card";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Textarea } from "@/shared/components/ui/textarea";
import { Badge } from "@/shared/components/ui/badge";
import { DatePicker } from "@/shared/components/ui/date-picker";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { toast } from "sonner";
import { DEFAULT_ACCESSORIES } from "@/shared/lib/accessories";
import { PlateInput } from "@/shared/components/form/field-inputs";
import {
  CATEGORY_LABEL,
  PRIORITY_META,
  type ChecklistCategory,
  type ChecklistPriority,
} from "@/modules/checklist";
import type { VehicleChecklistDraft, VehicleDraft } from "@/modules/vehicles/types";
import { createVehicle, vehicleKeys } from "@/modules/vehicles/services/vehicles";
import { brl } from "@/shared/lib/format";

export const Route = createFileRoute("/_app/vehicles/new")({
  head: () => ({ meta: [{ title: "Novo Veículo | GaragemERP" }] }),
  component: NewVehicle,
});

function NewVehicle() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [vehicleDraft, setVehicleDraft] = useState<VehicleDraft>({
    plate: "",
    chassis: "",
    vin: "",
    brand: "",
    model: "",
    version: "",
    color: "",
    fuel_type: "flex",
    transmission: "automatic",
    current_mileage: 0,
    manufacture_year: new Date().getFullYear(),
    model_year: new Date().getFullYear(),
    cost_price: 0,
    sale_price: 0,
    published: false,
    status: "available",
    notes: "",
    accessories: [],
    checklist: [],
  });
  const [customAcc, setCustomAcc] = useState("");
  const patchVehicleDraft = (patch: Partial<VehicleDraft>) =>
    setVehicleDraft((current) => ({ ...current, ...patch }));
  const toggleAcc = (a: string) =>
    setVehicleDraft((current) => ({
      ...current,
      accessories: current.accessories.includes(a)
        ? current.accessories.filter((x) => x !== a)
        : [...current.accessories, a],
    }));
  const addCustomAcc = () => {
    const v = customAcc.trim();
    if (!v) return;
    if (!vehicleDraft.accessories.includes(v)) {
      setVehicleDraft((current) => ({
        ...current,
        accessories: [...current.accessories, v],
      }));
    }
    setCustomAcc("");
  };

  const [checklistDraft, setChecklistDraft] = useState<VehicleChecklistDraft>({
    id: "",
    title: "",
    category: "mechanical",
    priority: "medium",
    estimated_cost: 0,
    due_date: undefined,
  });
  const addChecklist = () => {
    if (!checklistDraft.title.trim()) {
      toast.error("Informe o título da tarefa");
      return;
    }
    setVehicleDraft((current) => ({
      ...current,
      checklist: [...current.checklist, { ...checklistDraft, id: `d_${Date.now()}` }],
    }));
    setChecklistDraft({
      id: "",
      title: "",
      category: "mechanical",
      priority: "medium",
      estimated_cost: 0,
      due_date: undefined,
    });
  };
  const removeChecklist = (id: string) =>
    setVehicleDraft((current) => ({
      ...current,
      checklist: current.checklist.filter((x) => x.id !== id),
    }));

  const totalEstimated = vehicleDraft.checklist.reduce((s, x) => s + (x.estimated_cost || 0), 0);

  const createMutation = useMutation({
    mutationFn: createVehicle,
    onSuccess: (vehicle) => {
      void queryClient.invalidateQueries({ queryKey: vehicleKeys.all });
      queryClient.setQueryData(vehicleKeys.detail(vehicle.id), vehicle);
      toast.success("Veículo cadastrado no Supabase");
      void navigate({ to: "/vehicles/$id", params: { id: String(vehicle.id) } });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Falha ao salvar veículo.");
    },
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate(vehicleDraft);
  };

  return (
    <form onSubmit={submit} className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" asChild type="button">
          <Link to="/vehicles">
            <ArrowLeft className="h-4 w-4" /> Estoque
          </Link>
        </Button>
        <h1 className="font-display text-2xl font-semibold tracking-tight flex-1">
          Adicionar Veículo
        </h1>
        <Button type="submit" disabled={createMutation.isPending}>
          <Save className="h-4 w-4" /> {createMutation.isPending ? "Salvando..." : "Salvar"}
        </Button>
      </div>

      <Card>
        <CardContent className="p-6 space-y-4">
          <h2 className="font-display font-semibold">Identificação</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Placa" required>
              <PlateInput
                placeholder="ABC-1D23"
                required
                value={vehicleDraft.plate}
                onValueChange={(value) => patchVehicleDraft({ plate: value })}
              />
            </Field>
            <Field label="Chassi">
              <Input
                placeholder="9BWZZZ377VT004251"
                value={vehicleDraft.chassis}
                onChange={(e) => patchVehicleDraft({ chassis: e.target.value })}
              />
            </Field>
            <Field label="VIN">
              <Input
                placeholder="1HGBH41JXMN109186"
                value={vehicleDraft.vin}
                onChange={(e) => patchVehicleDraft({ vin: e.target.value })}
              />
            </Field>
            <Field label="Marca" required>
              <Input
                placeholder="Toyota"
                required
                value={vehicleDraft.brand}
                onChange={(e) => patchVehicleDraft({ brand: e.target.value })}
              />
            </Field>
            <Field label="Modelo" required>
              <Input
                placeholder="Corolla"
                required
                value={vehicleDraft.model}
                onChange={(e) => patchVehicleDraft({ model: e.target.value })}
              />
            </Field>
            <Field label="Versão">
              <Input
                placeholder="XEi 2.0"
                value={vehicleDraft.version}
                onChange={(e) => patchVehicleDraft({ version: e.target.value })}
              />
            </Field>
            <Field label="Cor" required>
              <Input
                placeholder="Prata"
                required
                value={vehicleDraft.color}
                onChange={(e) => patchVehicleDraft({ color: e.target.value })}
              />
            </Field>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6 space-y-4">
          <h2 className="font-display font-semibold">Especificações</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Field label="Combustível">
              <Select
                value={vehicleDraft.fuel_type}
                onValueChange={(value) =>
                  patchVehicleDraft({ fuel_type: value as VehicleDraft["fuel_type"] })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="flex">Flex</SelectItem>
                  <SelectItem value="gasoline">Gasolina</SelectItem>
                  <SelectItem value="diesel">Diesel</SelectItem>
                  <SelectItem value="electric">Elétrico</SelectItem>
                  <SelectItem value="hybrid">Híbrido</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Câmbio">
              <Select
                value={vehicleDraft.transmission}
                onValueChange={(value) =>
                  patchVehicleDraft({ transmission: value as VehicleDraft["transmission"] })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="manual">Manual</SelectItem>
                  <SelectItem value="automatic">Automático</SelectItem>
                  <SelectItem value="cvt">CVT</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Quilometragem">
              <Input
                type="number"
                placeholder="0"
                value={vehicleDraft.current_mileage || ""}
                onChange={(e) =>
                  patchVehicleDraft({ current_mileage: Number(e.target.value) || 0 })
                }
              />
            </Field>
            <Field label="Ano fabricação">
              <Input
                type="number"
                placeholder="2024"
                value={vehicleDraft.manufacture_year || ""}
                onChange={(e) =>
                  patchVehicleDraft({ manufacture_year: Number(e.target.value) || 0 })
                }
              />
            </Field>
            <Field label="Ano modelo">
              <Input
                type="number"
                placeholder="2024"
                value={vehicleDraft.model_year || ""}
                onChange={(e) => patchVehicleDraft({ model_year: Number(e.target.value) || 0 })}
              />
            </Field>
            <Field label="Status">
              <Select
                value={vehicleDraft.status}
                onValueChange={(value) =>
                  patchVehicleDraft({ status: value as VehicleDraft["status"] })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="available">Disponível</SelectItem>
                  <SelectItem value="reserved">Reservado</SelectItem>
                  <SelectItem value="in_repair">Em reparo</SelectItem>
                  <SelectItem value="sold">Vendido</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6 space-y-4">
          <h2 className="font-display font-semibold">Valores</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Custo de aquisição">
              <Input
                type="number"
                placeholder="0,00"
                value={vehicleDraft.cost_price || ""}
                onChange={(e) => patchVehicleDraft({ cost_price: Number(e.target.value) || 0 })}
              />
            </Field>
            <Field label="Preço de venda">
              <Input
                type="number"
                placeholder="0,00"
                value={vehicleDraft.sale_price || ""}
                onChange={(e) => patchVehicleDraft({ sale_price: Number(e.target.value) || 0 })}
              />
            </Field>
          </div>
          <Field label="Observações">
            <Textarea
              rows={3}
              placeholder="Anotações internas..."
              value={vehicleDraft.notes}
              onChange={(e) => patchVehicleDraft({ notes: e.target.value })}
            />
          </Field>
        </CardContent>
      </Card>

      {/* Accessories */}
      <Card>
        <CardContent className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-display font-semibold">Acessórios</h2>
              <p className="text-xs text-muted-foreground">
                Selecione os acessórios presentes no veículo.
              </p>
            </div>
            <Badge variant="secondary">{vehicleDraft.accessories.length} selecionado(s)</Badge>
          </div>
          <div className="flex flex-wrap gap-2">
            {DEFAULT_ACCESSORIES.map((a) => {
              const active = vehicleDraft.accessories.includes(a);
              return (
                <button
                  key={a}
                  type="button"
                  onClick={() => toggleAcc(a)}
                  className={
                    "px-3 py-1.5 rounded-full text-xs border transition-colors " +
                    (active
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background text-foreground border-border hover:bg-accent")
                  }
                >
                  {a}
                </button>
              );
            })}
          </div>
          {vehicleDraft.accessories.filter((a) => !DEFAULT_ACCESSORIES.includes(a)).length > 0 && (
            <div className="flex flex-wrap gap-2 pt-2 border-t border-border">
              {vehicleDraft.accessories
                .filter((a) => !DEFAULT_ACCESSORIES.includes(a))
                .map((a) => (
                  <Badge key={a} variant="outline" className="gap-1">
                    {a}
                    <button type="button" onClick={() => toggleAcc(a)}>
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
            </div>
          )}
          <div className="flex gap-2">
            <Input
              placeholder="Adicionar acessório personalizado..."
              value={customAcc}
              onChange={(e) => setCustomAcc(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addCustomAcc();
                }
              }}
            />
            <Button type="button" variant="outline" onClick={addCustomAcc}>
              <Plus className="h-4 w-4" /> Adicionar
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Preparation checklist */}
      <Card>
        <CardContent className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-display font-semibold">Checklist de Preparação</h2>
              <p className="text-xs text-muted-foreground">
                Cadastre tarefas iniciais (reparos, vistoria, fotos, etc).
              </p>
            </div>
            <div className="text-sm">
              Custo estimado: <span className="font-semibold">{brl(totalEstimated)}</span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-12 gap-2 items-end">
            <div className="md:col-span-4">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                Título
              </Label>
              <Input
                placeholder="Ex.: Polimento"
                value={checklistDraft.title}
                onChange={(e) => setChecklistDraft({ ...checklistDraft, title: e.target.value })}
              />
            </div>
            <div className="md:col-span-3">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                Categoria
              </Label>
              <Select
                value={checklistDraft.category}
                onValueChange={(v) =>
                  setChecklistDraft({ ...checklistDraft, category: v as ChecklistCategory })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(CATEGORY_LABEL).map(([k, label]) => (
                    <SelectItem key={k} value={k}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="md:col-span-2">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                Prioridade
              </Label>
              <Select
                value={checklistDraft.priority}
                onValueChange={(v) =>
                  setChecklistDraft({ ...checklistDraft, priority: v as ChecklistPriority })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(PRIORITY_META).map(([k, m]) => (
                    <SelectItem key={k} value={k}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="md:col-span-2">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                Custo est.
              </Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={checklistDraft.estimated_cost || ""}
                onChange={(e) =>
                  setChecklistDraft({
                    ...checklistDraft,
                    estimated_cost: Number(e.target.value) || 0,
                  })
                }
              />
            </div>
            <div className="md:col-span-1">
              <Button type="button" className="w-full" onClick={addChecklist}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            <div className="md:col-span-4">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">Prazo</Label>
              <DatePicker
                value={checklistDraft.due_date}
                onChange={(v) => setChecklistDraft({ ...checklistDraft, due_date: v })}
              />
            </div>
          </div>

          {vehicleDraft.checklist.length === 0 ? (
            <div className="text-sm text-muted-foreground border border-dashed border-border rounded-md p-6 text-center">
              Nenhum item adicionado ao checklist ainda.
            </div>
          ) : (
            <div className="space-y-2">
              {vehicleDraft.checklist.map((c) => (
                <div
                  key={c.id}
                  className="flex items-center gap-3 rounded-md border border-border p-3"
                >
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm truncate">{c.title}</div>
                    <div className="text-xs text-muted-foreground flex flex-wrap gap-2 mt-0.5">
                      <span>{CATEGORY_LABEL[c.category]}</span>
                      <span>•</span>
                      <span>{PRIORITY_META[c.priority].label}</span>
                      {c.due_date && (
                        <>
                          <span>•</span>
                          <span>Prazo: {c.due_date}</span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="text-sm font-medium">{brl(c.estimated_cost)}</div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => removeChecklist(c.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
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
