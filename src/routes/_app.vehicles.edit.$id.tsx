import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Archive, ArrowLeft, Plus, Save, X } from "lucide-react";
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
import { ConfirmActionDialog } from "@/shared/components/confirm-action-dialog";
import { StatusBadge } from "@/shared/components/status-badge";
import { DEFAULT_ACCESSORIES } from "@/shared/lib/accessories";
import { brl } from "@/shared/lib/format";
import { PlateInput } from "@/shared/components/form/field-inputs";
import { accessoryKeys, listActiveAccessories } from "@/modules/settings/services/accessories";
import type { VehicleDraft } from "@/modules/vehicles/types";
import {
  archiveVehicle,
  getVehicleById,
  updateVehicle,
  vehicleKeys,
} from "@/modules/vehicles/services/vehicles";
import { VehicleChecklist } from "@/modules/checklist/components/vehicle-checklist";
import { StaleRecordError } from "@/shared/lib/stale-record";
import { StaleRecordConflictDialog } from "@/shared/components/stale-record-conflict-dialog";
import type { Vehicle } from "@/shared/types/domain";
import { vehicleStatusLabel } from "@/modules/vehicles/lib/vehicle-status-label";

export const Route = createFileRoute("/_app/vehicles/edit/$id")({
  head: () => ({ meta: [{ title: "Editar Veículo | GaragemERP" }] }),
  component: EditVehicle,
});

function vehicleToDraft(vehicle: Vehicle): VehicleDraft {
  return {
    plate: vehicle.plate,
    chassis: vehicle.chassis ?? "",
    vin: vehicle.vin ?? "",
    brand: vehicle.brand,
    model: vehicle.model,
    version: vehicle.version ?? "",
    color: vehicle.color,
    fuel_type: vehicle.fuel_type,
    transmission: vehicle.transmission,
    current_mileage: vehicle.current_mileage,
    manufacture_year: vehicle.manufacture_year,
    model_year: vehicle.model_year,
    cost_price: vehicle.cost_price,
    sale_price: vehicle.sale_price,
    published: vehicle.published,
    status: vehicle.status,
    notes: vehicle.notes ?? "",
    accessories: vehicle.accessories ?? [],
    checklist: [],
  };
}

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
  const { data: catalogAccessories = [] } = useQuery({
    queryKey: accessoryKeys.active,
    queryFn: listActiveAccessories,
  });
  const suggestedAccessories =
    catalogAccessories.length > 0
      ? catalogAccessories.map((accessory) => accessory.name)
      : DEFAULT_ACCESSORIES;
  const [draft, setDraft] = useState<VehicleDraft | null>(null);
  const [baselineUpdatedAt, setBaselineUpdatedAt] = useState<string | null>(null);
  const updateAttemptRef = useRef<{ fingerprint: string; key: string } | null>(null);
  const [conflict, setConflict] = useState<{
    current: Vehicle | null;
    action: "save" | "archive";
  } | null>(null);
  const [customAcc, setCustomAcc] = useState("");
  const [confirmArchiveOpen, setConfirmArchiveOpen] = useState(false);
  const [confirmAccessoryRemove, setConfirmAccessoryRemove] = useState<string | null>(null);
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
    setDraft((current) => current ?? vehicleToDraft(v));
    setBaselineUpdatedAt((current) => current ?? v.updated_at);
  }, [v]);

  const createUpdateCommand = (nextDraft: VehicleDraft, expectedUpdatedAt: string) => {
    const fingerprint = JSON.stringify({ nextDraft, expectedUpdatedAt });
    if (updateAttemptRef.current?.fingerprint !== fingerprint) {
      updateAttemptRef.current = { fingerprint, key: crypto.randomUUID() };
    }
    return {
      nextDraft,
      expectedUpdatedAt,
      idempotencyKey: updateAttemptRef.current.key,
    };
  };

  const updateMutation = useMutation({
    mutationFn: ({
      nextDraft,
      expectedUpdatedAt,
      idempotencyKey,
    }: {
      nextDraft: VehicleDraft;
      expectedUpdatedAt: string;
      idempotencyKey: string;
    }) => updateVehicle(numericId, nextDraft, expectedUpdatedAt, idempotencyKey),
    onSuccess: (vehicle, variables) => {
      if (updateAttemptRef.current?.key === variables.idempotencyKey) {
        updateAttemptRef.current = null;
      }
      queryClient.setQueryData(vehicleKeys.detail(vehicle.id), vehicle);
      void queryClient.invalidateQueries({ queryKey: vehicleKeys.all });
      toast.success("Alterações salvas");
      void navigate({ to: "/vehicles/$id", params: { id } });
    },
    onError: (mutationError) => {
      if (mutationError instanceof StaleRecordError) {
        setConflict({ current: mutationError.current as Vehicle | null, action: "save" });
        return;
      }
      toast.error(
        mutationError instanceof Error ? mutationError.message : "Falha ao salvar alterações.",
      );
    },
  });
  const archiveMutation = useMutation({
    mutationFn: (expectedUpdatedAt: string) => archiveVehicle(numericId, expectedUpdatedAt),
    onSuccess: (vehicle) => {
      queryClient.setQueryData(vehicleKeys.detail(vehicle.id), vehicle);
      void queryClient.invalidateQueries({ queryKey: vehicleKeys.all });
      toast.success("Veículo arquivado");
      void navigate({ to: "/vehicles" });
    },
    onError: (mutationError) => {
      if (mutationError instanceof StaleRecordError) {
        setConflict({ current: mutationError.current as Vehicle | null, action: "archive" });
        return;
      }
      toast.error(
        mutationError instanceof Error ? mutationError.message : "Falha ao arquivar veículo.",
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

  if (v.status === "sold") {
    return (
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="ghost" size="sm" asChild type="button">
            <Link to="/vehicles/$id" params={{ id }}>
              <ArrowLeft className="h-4 w-4" /> Voltar
            </Link>
          </Button>
          <h1 className="font-display text-2xl font-semibold tracking-tight flex-1">
            Veículo vendido
          </h1>
          <StatusBadge kind="vehicle" value={v.status} />
        </div>

        <Card className="border-warning/30 bg-warning/5">
          <CardContent className="p-6">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-1 h-5 w-5 shrink-0 text-warning" />
              <div className="space-y-2">
                <h2 className="font-display text-lg font-semibold">Edição bloqueada</h2>
                <p className="text-sm text-muted-foreground">
                  Este veículo já foi vendido. Dados operacionais, valores, acessórios e checklist
                  ficam preservados como histórico para não alterar margem, relatórios ou leitura
                  financeira da venda.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="grid grid-cols-1 gap-4 p-6 text-sm md:grid-cols-2">
            <ReadonlyField label="Veículo" value={`${v.brand} ${v.model}`} />
            <ReadonlyField label="Placa" value={v.plate} />
            <ReadonlyField label="Valor estimado de venda" value={String(v.sale_price)} money />
            <ReadonlyField label="Custo de aquisição" value={String(v.cost_price)} money />
          </CardContent>
        </Card>
      </div>
    );
  }

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!baselineUpdatedAt) return;
    updateMutation.mutate(createUpdateCommand(draft, baselineUpdatedAt));
  };
  const isEvaluation = draft.status === "evaluating";
  const isSaleManagedStatus = draft.status === "reserved" || draft.status === "sold";

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
          onClick={() => setConfirmArchiveOpen(true)}
          disabled={archiveMutation.isPending || draft.status === "archived" || isSaleManagedStatus}
        >
          <Archive className="h-4 w-4" /> Arquivar
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
      <ConfirmActionDialog
        open={confirmArchiveOpen}
        onOpenChange={setConfirmArchiveOpen}
        title="Arquivar veículo?"
        description="O veículo será preservado no histórico, despublicado e marcado como arquivado."
        confirmLabel={archiveMutation.isPending ? "Arquivando..." : "Arquivar"}
        confirmDisabled={archiveMutation.isPending}
        onConfirm={() => {
          setConfirmArchiveOpen(false);
          if (baselineUpdatedAt) archiveMutation.mutate(baselineUpdatedAt);
        }}
      />
      <ConfirmActionDialog
        open={confirmAccessoryRemove != null}
        onOpenChange={(open) => {
          if (!open) setConfirmAccessoryRemove(null);
        }}
        title="Remover acessório?"
        description="Este acessório personalizado será removido da lista deste veículo."
        confirmLabel="Remover"
        onConfirm={() => {
          if (!confirmAccessoryRemove) return;
          const accessory = confirmAccessoryRemove;
          setConfirmAccessoryRemove(null);
          setDraft((current) =>
            current
              ? {
                  ...current,
                  accessories: current.accessories.filter((value) => value !== accessory),
                }
              : current,
          );
          toast.success("Acessório removido");
        }}
      />

      <StaleRecordConflictDialog
        open={conflict !== null}
        onOpenChange={(open) => !open && setConflict(null)}
        description={
          conflict?.current
            ? "O salvamento foi interrompido para evitar sobrescrever uma alteração mais recente. Escolha carregar a versão atual ou reaplicar explicitamente sua alteração."
            : "O registro mudou ou foi removido. Seu rascunho continua nesta tela; atualize os dados antes de tentar novamente."
        }
        currentSummary={
          conflict?.current
            ? [
                `${conflict.current.brand} ${conflict.current.model} · ${conflict.current.plate}`,
                `Status: ${vehicleStatusLabel(conflict.current.status)}`,
                `Custo: ${brl(conflict.current.cost_price)}`,
              ]
            : undefined
        }
        draftSummary={
          draft
            ? [`Status: ${vehicleStatusLabel(draft.status)}`, `Custo: ${brl(draft.cost_price)}`]
            : undefined
        }
        canReapply={Boolean(conflict?.current)}
        onReload={() => {
          const current = conflict?.current;
          if (!current) return;
          setDraft(vehicleToDraft(current));
          setBaselineUpdatedAt(current.updated_at);
          queryClient.setQueryData(vehicleKeys.detail(current.id), current);
        }}
        onReapply={() => {
          const currentConflict = conflict;
          const current = currentConflict?.current;
          if (!current || !draft || !currentConflict) return;
          if (currentConflict.action === "archive") {
            archiveMutation.mutate(current.updated_at);
          } else {
            updateMutation.mutate(createUpdateCommand(draft, current.updated_at));
          }
        }}
      />

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
            <Field label="Status atual">
              <div className="flex h-10 items-center">
                <StatusBadge kind="vehicle" value={draft.status} />
              </div>
            </Field>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6 space-y-4">
          <h2 className="font-display font-semibold">Valores e publicação</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label={isEvaluation ? "Custo estimado de aquisição" : "Custo de aquisição"}>
              <Input
                type="number"
                value={draft.cost_price || ""}
                onChange={(e) => updateDraft({ cost_price: Number(e.target.value) || 0 })}
              />
            </Field>
            <Field label="Valor estimado de venda">
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
              <div className="text-xs text-muted-foreground">
                Apenas veículos disponíveis podem ficar visíveis para clientes externos
              </div>
            </div>
            <Switch
              checked={draft.status === "available" && draft.published}
              disabled={draft.status !== "available"}
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
            {suggestedAccessories.map((accessory) => {
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
          {draft.accessories.filter((accessory) => !suggestedAccessories.includes(accessory))
            .length > 0 ? (
            <div className="flex flex-wrap gap-2 pt-2 border-t border-border">
              {draft.accessories
                .filter((accessory) => !suggestedAccessories.includes(accessory))
                .map((accessory) => (
                  <Badge key={accessory} variant="outline" className="gap-1">
                    {accessory}
                    <button type="button" onClick={() => setConfirmAccessoryRemove(accessory)}>
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

function ReadonlyField({ label, value, money }: { label: string; value: string; money?: boolean }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 font-medium">{money ? brl(Number(value)) : value}</div>
    </div>
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
