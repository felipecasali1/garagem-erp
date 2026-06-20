import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Calendar,
  Fuel,
  Gauge,
  Pencil,
  Eye,
  EyeOff,
  Settings2,
  Hash,
} from "lucide-react";
import { Card, CardContent } from "@/shared/components/ui/card";
import { Button } from "@/shared/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/components/ui/tabs";
import { StatusBadge } from "@/shared/components/status-badge";
import { brl } from "@/shared/lib/format";
import { VehicleChecklist } from "@/modules/checklist/components/vehicle-checklist";
import { useChecklist, summarize } from "@/modules/checklist";
import {
  getVehicleById,
  setVehiclePublished,
  vehicleKeys,
} from "@/modules/vehicles/services/vehicles";

export const Route = createFileRoute("/_app/vehicles/$id")({
  head: () => ({ meta: [{ title: "Detalhe do Veículo | GaragemERP" }] }),
  component: VehicleDetail,
});

const fuelLabel: Record<string, string> = {
  flex: "Flex",
  gasoline: "Gasolina",
  diesel: "Diesel",
  electric: "Elétrico",
  hybrid: "Híbrido",
};
const transLabel: Record<string, string> = {
  manual: "Manual",
  automatic: "Automático",
  cvt: "CVT",
  dual_clutch: "DCT",
  automatized: "Automatizado",
};

function VehicleDetail() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const numericId = Number(id);
  const queryClient = useQueryClient();
  const {
    data: vehicle,
    isLoading,
    error,
  } = useQuery({
    queryKey: vehicleKeys.detail(numericId),
    queryFn: () => getVehicleById(numericId),
    enabled: Number.isFinite(numericId),
  });
  const publishMutation = useMutation({
    mutationFn: ({ published }: { published: boolean }) =>
      setVehiclePublished(numericId, published),
    onSuccess: (nextVehicle) => {
      queryClient.setQueryData(vehicleKeys.detail(nextVehicle.id), nextVehicle);
      void queryClient.invalidateQueries({ queryKey: vehicleKeys.all });
    },
  });

  const checklistItems = useChecklist(vehicle?.id);

  if (isLoading) {
    return (
      <div className="max-w-[1400px] mx-auto py-10 text-sm text-muted-foreground">
        Carregando veículo...
      </div>
    );
  }

  if (error || !vehicle) {
    return (
      <div className="max-w-2xl mx-auto text-center py-20">
        <h2 className="font-display text-xl mb-2">Veículo não encontrado</h2>
        <Button onClick={() => navigate({ to: "/vehicles" })}>Voltar ao estoque</Button>
      </div>
    );
  }

  const checklistSummary = summarize(checklistItems);
  const estimatedInvested = vehicle.cost_price + checklistSummary.estimatedCost;
  const actualInvested = vehicle.cost_price + checklistSummary.actualCost;
  const margin = vehicle.sale_price - estimatedInvested;
  const marginPct = estimatedInvested > 0 ? (margin / estimatedInvested) * 100 : 0;
  return (
    <div className="max-w-[1400px] mx-auto space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/vehicles">
            <ArrowLeft className="h-4 w-4" /> Estoque
          </Link>
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="font-display text-2xl font-semibold tracking-tight truncate">
            {vehicle.brand} {vehicle.model}
          </h1>
          <div className="flex items-center gap-2 mt-1">
            <span className="plate-chip">{vehicle.plate}</span>
            <StatusBadge kind="vehicle" value={vehicle.status} />
          </div>
        </div>
        <Button variant="outline" asChild>
          <Link to="/vehicles/edit/$id" params={{ id: String(vehicle.id) }}>
            <Pencil className="h-4 w-4" /> Editar
          </Link>
        </Button>
        <Button onClick={() => publishMutation.mutate({ published: !vehicle.published })}>
          {vehicle.published ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          {vehicle.published ? "Despublicar" : "Publicar"}
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 overflow-hidden">
          <div className="aspect-[16/9] bg-gradient-to-br from-muted to-muted/40 flex items-center justify-center text-8xl opacity-20">
            🚗
          </div>
        </Card>
        <Card>
          <CardContent className="p-6 space-y-4">
            <div>
              <div className="text-xs text-muted-foreground uppercase tracking-wide">
                Preço de venda
              </div>
              <div className="font-display text-3xl font-semibold">{brl(vehicle.sale_price)}</div>
            </div>
            <div className="grid grid-cols-2 gap-3 pt-3 border-t border-border">
              <div>
                <div className="text-xs text-muted-foreground">Custo de compra</div>
                <div className="font-medium">{brl(vehicle.cost_price)}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Preparação estimada</div>
                <div className="font-medium">{brl(checklistSummary.estimatedCost)}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Preparação realizada</div>
                <div className="font-medium">{brl(checklistSummary.actualCost)}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Investido estimado</div>
                <div className="font-medium">{brl(estimatedInvested)}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Investido real</div>
                <div className="font-medium">{brl(actualInvested)}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Margem estimada</div>
                <div className={`font-medium ${margin >= 0 ? "text-success" : "text-destructive"}`}>
                  {brl(margin)}{" "}
                  <span className="text-xs text-muted-foreground">({marginPct.toFixed(1)}%)</span>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 pt-3 border-t border-border text-sm">
              <Info icon={Calendar} label="Ano modelo" value={String(vehicle.model_year)} />
              <Info
                icon={Gauge}
                label="Quilometragem"
                value={`${vehicle.current_mileage.toLocaleString("pt-BR")} km`}
              />
              <Info icon={Fuel} label="Combustível" value={fuelLabel[vehicle.fuel_type]} />
              <Info icon={Settings2} label="Câmbio" value={transLabel[vehicle.transmission]} />
              <Info icon={Hash} label="Cor" value={vehicle.color} />
              <Info icon={Calendar} label="Fabricação" value={String(vehicle.manufacture_year)} />
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="info">
        <TabsList>
          <TabsTrigger value="info">Informações</TabsTrigger>
          <TabsTrigger value="checklist">Checklist ({checklistSummary.total})</TabsTrigger>
          <TabsTrigger value="history">Histórico (0)</TabsTrigger>
          <TabsTrigger value="accessories">Acessórios</TabsTrigger>
        </TabsList>
        <TabsContent value="checklist">
          <VehicleChecklist vehicleId={vehicle.id} />
        </TabsContent>
        <TabsContent value="info">
          <Card>
            <CardContent className="p-6 grid grid-cols-1 md:grid-cols-2 gap-y-4 gap-x-8 text-sm">
              <Field label="Marca" value={vehicle.brand} />
              <Field label="Modelo" value={vehicle.model} />
              <Field label="Versão" value={vehicle.version ?? "-"} />
              <Field label="Placa" value={vehicle.plate} mono />
              <Field
                label="Ano fabricação / modelo"
                value={`${vehicle.manufacture_year} / ${vehicle.model_year}`}
              />
              <Field label="Cor" value={vehicle.color} />
              <Field label="Combustível" value={fuelLabel[vehicle.fuel_type]} />
              <Field label="Câmbio" value={transLabel[vehicle.transmission]} />
              <Field
                label="Quilometragem"
                value={`${vehicle.current_mileage.toLocaleString("pt-BR")} km`}
              />
              <Field label="Status" value={vehicle.status} />
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="history">
          <Card>
            <CardContent className="p-6 space-y-3">
              <div className="text-sm text-muted-foreground text-center py-8">
                O histórico de compras e vendas será exibido aqui quando esses módulos forem
                migrados para o Supabase.
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="accessories">
          <Card>
            <CardContent className="p-6 text-sm">
              {vehicle.accessories && vehicle.accessories.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {vehicle.accessories.map((accessory) => (
                    <span
                      key={accessory}
                      className="rounded-full border border-border bg-muted/40 px-3 py-1.5"
                    >
                      {accessory}
                    </span>
                  ))}
                </div>
              ) : (
                <div className="text-muted-foreground">
                  Nenhum acessório cadastrado para este veículo.
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Info({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-2">
      <Icon className="h-4 w-4 text-muted-foreground mt-0.5" />
      <div>
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="font-medium">{value}</div>
      </div>
    </div>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground uppercase tracking-wide">{label}</div>
      <div className={mono ? "font-mono mt-0.5" : "mt-0.5 capitalize"}>{value}</div>
    </div>
  );
}
