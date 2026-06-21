import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Plus, Save, Trash2, X } from "lucide-react";
import { Card, CardContent } from "@/shared/components/ui/card";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Textarea } from "@/shared/components/ui/textarea";
import { Switch } from "@/shared/components/ui/switch";
import { Badge } from "@/shared/components/ui/badge";
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
import type { VehicleDraft } from "@/modules/vehicles/types";
import {
  deleteVehicle,
  getVehicleById,
  updateVehicle,
  vehicleKeys,
} from "@/modules/vehicles/services/vehicles";
import { VehicleChecklist } from "@/modules/checklist/components/vehicle-checklist";

export const Route = createFileRoute("/_app/vehicles/edit/$id")({
  head: () => ({ meta: [{ title: "Editar Veículo | GaragemERP" }] }),
  component: EditVehicle,
});

function EditVehicle() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const numericId = Number(id);
  const queryClient = useQueryClient();
  const {
    data: v,
    isLoading,
    error,
  } = useQuery({
    queryKey: vehicleKeys.detail(numericId),
    queryFn: () => getVehicleById(numericId),
    enabled: Number.isFinite(numericId),
  });
  const [draft, setDraft] = useState<VehicleDraft | null>(null);
  const [customAcc, setCustomAcc] = useState("");
  const updateDraft = (patch: Partial<VehicleDraft>) =>
    setDraft((current) => (current ? { ...current, ...patch } : current));
  const toggleAcc = (accessory: string) =>
    setDraft((current) =>
      current
        ? {
            ...current,
            accessories: current.accessories.includes(accessory)
              ? current.accessories.filter((value) => value !== accessory)
              : [...current.accessories, accessory],
          }
        : current,
    );
  const addCustomAcc = () => {
    const value = customAcc.trim();
    if (!value) return;
    setDraft((current) =>
      current && !current.accessories.includes(value)
        ? { ...current, accessories: [...current.accessories, value] }
        : current,
    );
    setCustomAcc("");
  };

  useEffect(() => {
    if (!v) return;
    setDraft({
      plate: v.plate,
      chassis: v.chassis ?? "",
      vin: v.vin ?? "",
      brand: v.brand,
      model: v.model,
      version: v.version ?? "",
      color: v.color,
      fuel_type: v.fuel_type,
      transmission: v.transmission,
      current_mileage: v.current_mileage,
      manufacture_year: v.manufacture_year,
      model_year: v.model_year,
      cost_price: v.cost_price,
      sale_price: v.sale_price,
      published: v.published,
      status: v.status,
      notes: v.notes ?? "",
      accessories: v.accessories ?? [],
      checklist: [],
    });
  }, [v]);

  const updateMutation = useMutation({
    mutationFn: (nextDraft: VehicleDraft) => updateVehicle(numericId, nextDraft),
    onSuccess: (vehicle) => {
      queryClient.setQueryData(vehicleKeys.detail(vehicle.id), vehicle);
      void queryClient.invalidateQueries({ queryKey: vehicleKeys.all });
      toast.success("Alterações salvas");
      void navigate({ to: "/vehicles/$id", params: { id } });
    },
    onError: (mutationError) => {
      toast.error(
        mutationError instanceof Error ? mutationError.message : "Falha ao salvar alterações.",
      );
    },
  });
  const deleteMutation = useMutation({
    mutationFn: () => deleteVehicle(numericId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: vehicleKeys.all });
      toast.success("Veículo removido");
      void navigate({ to: "/vehicles" });
    },
    onError: (mutationError) => {
      toast.error(
        mutationError instanceof Error ? mutationError.message : "Falha ao remover veículo.",
      );
    },
  });

  if (isLoading || !draft) {
    return (
      <div className="max-w-4xl mx-auto py-10 text-sm text-muted-foreground">
        Carregando veículo...
      </div>
    );
  }

  if (error || !v) {
    return (
      <div className="max-w-2xl mx-auto text-center py-20">
        <h2 className="font-display text-xl mb-2">Veículo não encontrado</h2>
        <Button onClick={() => navigate({ to: "/vehicles" })}>Voltar ao estoque</Button>
      </div>
    );
  }

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    updateMutation.mutate(draft);
  };

  return (
    <form onSubmit={submit} className="max-w-4xl mx-auto space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="sm" asChild type="button">
          <Link to="/vehicles/$id" params={{ id }}>
            <ArrowLeft className="h-4 w-4" /> Voltar
          </Link>
        </Button>
        <h1 className="font-display text-2xl font-semibold tracking-tight flex-1">
          Editar Veículo
        </h1>
        <Button
          variant="outline"
          type="button"
          onClick={() => {
            deleteMutation.mutate();
          }}
          disabled={deleteMutation.isPending}
        >
          <Trash2 className="h-4 w-4" /> Excluir
        </Button>
        <Button type="submit" disabled={updateMutation.isPending}>
          <Save className="h-4 w-4" /> {updateMutation.isPending ? "Salvando..." : "Salvar"}
        </Button>
      </div>

      <Card>
        <CardContent className="p-6 space-y-4">
          <h2 className="font-display font-semibold">Identificação</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Placa" required>
              <PlateInput
                required
                value={draft.plate}
                onValueChange={(value) => updateDraft({ plate: value })}
                placeholder="ABC-1D23"
              />
            </Field>
            <Field label="Chassi">
              <Input
                value={draft.chassis}
                onChange={(e) => updateDraft({ chassis: e.target.value })}
              />
            </Field>
            <Field label="VIN">
              <Input value={draft.vin} onChange={(e) => updateDraft({ vin: e.target.value })} />
            </Field>
            <Field label="Marca" required>
              <Input
                required
                value={draft.brand}
                onChange={(e) => updateDraft({ brand: e.target.value })}
              />
            </Field>
            <Field label="Modelo" required>
              <Input
                required
                value={draft.model}
                onChange={(e) => updateDraft({ model: e.target.value })}
              />
            </Field>
            <Field label="Versão">
              <Input
                value={draft.version}
                onChange={(e) => updateDraft({ version: e.target.value })}
              />
            </Field>
            <Field label="Cor" required>
              <Input
                required
                value={draft.color}
                onChange={(e) => updateDraft({ color: e.target.value })}
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
                value={draft.fuel_type}
                onValueChange={(value) =>
                  updateDraft({ fuel_type: value as VehicleDraft["fuel_type"] })
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
                value={draft.transmission}
                onValueChange={(value) =>
                  updateDraft({ transmission: value as VehicleDraft["transmission"] })
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
                value={draft.current_mileage || ""}
                onChange={(e) => updateDraft({ current_mileage: Number(e.target.value) || 0 })}
              />
            </Field>
            <Field label="Ano fabricação">
              <Input
                type="number"
                value={draft.manufacture_year || ""}
                onChange={(e) => updateDraft({ manufacture_year: Number(e.target.value) || 0 })}
              />
            </Field>
            <Field label="Ano modelo">
              <Input
                type="number"
                value={draft.model_year || ""}
                onChange={(e) => updateDraft({ model_year: Number(e.target.value) || 0 })}
              />
            </Field>
            <Field label="Status">
              <Select
                value={draft.status}
                onValueChange={(value) => updateDraft({ status: value as VehicleDraft["status"] })}
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
          <h2 className="font-display font-semibold">Valores e publicação</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Custo de aquisição">
              <Input
                type="number"
                value={draft.cost_price || ""}
                onChange={(e) => updateDraft({ cost_price: Number(e.target.value) || 0 })}
              />
            </Field>
            <Field label="Preço de venda">
              <Input
                type="number"
                value={draft.sale_price || ""}
                onChange={(e) => updateDraft({ sale_price: Number(e.target.value) || 0 })}
              />
            </Field>
          </div>
          <div className="flex items-center justify-between rounded-md border border-border p-4">
            <div>
              <div className="font-medium text-sm">Publicado no site</div>
              <div className="text-xs text-muted-foreground">Visível para clientes externos</div>
            </div>
            <Switch
              checked={draft.published}
              onCheckedChange={(checked) => updateDraft({ published: checked })}
            />
          </div>
          <Field label="Observações">
            <Textarea
              rows={3}
              value={draft.notes}
              placeholder="Anotações internas..."
              onChange={(e) => updateDraft({ notes: e.target.value })}
            />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-display font-semibold">Acessórios</h2>
              <p className="text-xs text-muted-foreground">
                Atualize os acessórios vinculados a este veículo.
              </p>
            </div>
            <Badge variant="secondary">{draft.accessories.length} selecionado(s)</Badge>
          </div>
          <div className="flex flex-wrap gap-2">
            {DEFAULT_ACCESSORIES.map((accessory) => {
              const active = draft.accessories.includes(accessory);
              return (
                <button
                  key={accessory}
                  type="button"
                  onClick={() => toggleAcc(accessory)}
                  className={
                    "px-3 py-1.5 rounded-full text-xs border transition-colors " +
                    (active
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background text-foreground border-border hover:bg-accent")
                  }
                >
                  {accessory}
                </button>
              );
            })}
          </div>
          {draft.accessories.filter((accessory) => !DEFAULT_ACCESSORIES.includes(accessory))
            .length > 0 ? (
            <div className="flex flex-wrap gap-2 pt-2 border-t border-border">
              {draft.accessories
                .filter((accessory) => !DEFAULT_ACCESSORIES.includes(accessory))
                .map((accessory) => (
                  <Badge key={accessory} variant="outline" className="gap-1">
                    {accessory}
                    <button type="button" onClick={() => toggleAcc(accessory)}>
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
            </div>
          ) : null}
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

      <div>
        <h2 className="font-display text-lg font-semibold mb-1">Checklist de Preparação</h2>
        <p className="text-sm text-muted-foreground mb-3">
          Gerencie tarefas, reparos e inspeções deste veículo.
        </p>
        <VehicleChecklist vehicleId={v.id} />
      </div>
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
