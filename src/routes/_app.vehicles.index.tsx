import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  LayoutGrid,
  List,
  Eye,
  EyeOff,
  Fuel,
  Gauge,
  Calendar,
  Search,
  MoreHorizontal,
  Pencil,
} from "lucide-react";
import { PageHeader } from "@/shared/components/layout/page-header";
import { Card, CardContent } from "@/shared/components/ui/card";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { StatusBadge } from "@/shared/components/status-badge";
import { brl } from "@/shared/lib/format";
import { toast } from "sonner";
import { useOperationalDate } from "@/modules/alerts/hooks/use-operational-date";
import {
  countVehiclesByStatus,
  listVehiclesPage,
  setVehiclePublished,
  vehicleStatuses,
  vehicleKeys,
} from "@/modules/vehicles/services/vehicles";
import { ListPagination } from "@/shared/components/list-pagination";
import {
  DEFAULT_PAGE_SIZE,
  getPageRange,
  getTotalPages,
  normalizePage,
} from "@/shared/lib/pagination";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/components/ui/table";
import type { VehicleStatus } from "@/shared/types/domain";

export const Route = createFileRoute("/_app/vehicles/")({
  head: () => ({ meta: [{ title: "Veículos | GaragemERP" }] }),
  validateSearch: (search: {
    page?: unknown;
    q?: unknown;
    status?: unknown;
    alert?: unknown;
  }): {
    page?: number;
    q?: string;
    status?: VehicleStatus;
    alert?: "checklist" | "preparation";
  } => ({
    page: normalizePage(search.page),
    q: typeof search.q === "string" && search.q.trim() ? search.q.trim() : undefined,
    status: statusOptions.includes(search.status as VehicleStatus)
      ? (search.status as VehicleStatus)
      : undefined,
    alert:
      search.alert === "checklist" || search.alert === "preparation" ? search.alert : undefined,
  }),
  component: VehiclesPage,
});

const fuelLabel: Record<string, string> = {
  flex: "Flex",
  gasoline: "Gasolina",
  diesel: "Diesel",
  electric: "Elétrico",
  hybrid: "Híbrido",
};

const statusOptions = vehicleStatuses;

function VehiclesPage() {
  const [view, setView] = useState<"grid" | "table">("grid");
  const { page: rawPage, q, status: statusFilter, alert: alertFilter } = Route.useSearch();
  const page = rawPage ?? 1;
  const today = useOperationalDate();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const {
    data: vehiclesPage,
    isLoading,
    error,
  } = useQuery({
    queryKey: vehicleKeys.list({
      page,
      search: q,
      status: statusFilter,
      alert: alertFilter,
      today,
    }),
    queryFn: () =>
      listVehiclesPage({ page, search: q, status: statusFilter, alert: alertFilter, today }),
  });
  const { data: statusCounts } = useQuery({
    queryKey: vehicleKeys.statusCounts,
    queryFn: countVehiclesByStatus,
  });
  const vehicles = vehiclesPage?.data ?? [];
  const total = vehiclesPage?.total ?? 0;
  const totalPages = getTotalPages(total, vehiclesPage?.pageSize ?? DEFAULT_PAGE_SIZE);
  const displayPage = Math.min(page, totalPages);

  const updateSearch = (next: { page: number; q?: string; status?: VehicleStatus }) => {
    void navigate({
      to: "/vehicles",
      search: () => ({ ...next, alert: alertFilter }),
    });
  };

  useEffect(() => {
    if (!vehiclesPage) return;
    const pageCount = getTotalPages(vehiclesPage.total, vehiclesPage.pageSize);
    if (page > pageCount) {
      void navigate({
        to: "/vehicles",
        replace: true,
        search: () => ({ page: pageCount, q, status: statusFilter, alert: alertFilter }),
      });
    }
  }, [alertFilter, navigate, page, q, statusFilter, vehiclesPage]);

  const publishMutation = useMutation({
    mutationFn: ({ id, published }: { id: number; published: boolean }) =>
      setVehiclePublished(id, published),
    onSuccess: (vehicle) => {
      queryClient.setQueryData(vehicleKeys.detail(vehicle.id), vehicle);
      void queryClient.invalidateQueries({ queryKey: vehicleKeys.all });
    },
    onError: (mutationError) => {
      toast.error(
        mutationError instanceof Error ? mutationError.message : "Falha ao atualizar publicação.",
      );
    },
  });

  if (isLoading) {
    return (
      <div className="max-w-[1600px] mx-auto py-10 text-sm text-muted-foreground">
        Carregando veículos do Supabase...
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-[1600px] mx-auto py-10 text-sm text-destructive">
        Falha ao carregar veículos: {error instanceof Error ? error.message : "erro desconhecido"}.
      </div>
    );
  }

  return (
    <div className="max-w-[1600px] mx-auto">
      <PageHeader
        title="Estoque de Veículos"
        description={
          total === 0
            ? "0 veículos"
            : (() => {
                const range = getPageRange(displayPage, total, vehiclesPage?.pageSize);
                return `${range.from}–${range.to} de ${total} veículos`;
              })()
        }
        action={{ label: "Nova avaliação", onClick: () => navigate({ to: "/vehicles/new" }) }}
      />

      <Card className="mb-6">
        <CardContent className="p-4 flex flex-col md:flex-row gap-3 md:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={q ?? ""}
              onChange={(e) =>
                updateSearch({
                  q: e.target.value || undefined,
                  status: statusFilter,
                  page: 1,
                })
              }
              placeholder="Buscar por placa, marca, modelo..."
              className="pl-9"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => updateSearch({ q, status: undefined, page: 1 })}
              aria-pressed={statusFilter == null}
              className={`text-xs px-2.5 py-1.5 rounded-md border transition ${
                statusFilter == null
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border hover:bg-muted"
              }`}
            >
              Todos
            </button>
            {statusOptions.map((s) => (
              <button
                type="button"
                key={s}
                onClick={() =>
                  updateSearch({
                    q,
                    status: statusFilter === s ? undefined : s,
                    page: 1,
                  })
                }
                aria-pressed={statusFilter === s}
                className={`text-xs px-2.5 py-1.5 rounded-md border transition inline-flex items-center gap-1.5 ${
                  statusFilter === s
                    ? "border-primary bg-primary/10"
                    : "border-border hover:bg-muted"
                }`}
              >
                <StatusBadge kind="vehicle" value={s} />
                <span className="text-muted-foreground">{statusCounts?.[s] ?? 0}</span>
              </button>
            ))}
          </div>
          <div className="flex gap-1 p-1 rounded-md bg-muted ml-auto">
            <button
              onClick={() => setView("grid")}
              className={`h-8 w-8 cursor-pointer rounded flex items-center justify-center ${view === "grid" ? "bg-background shadow-sm" : "text-muted-foreground"}`}
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
            <button
              onClick={() => setView("table")}
              className={`h-8 w-8 cursor-pointer rounded flex items-center justify-center ${view === "table" ? "bg-background shadow-sm" : "text-muted-foreground"}`}
            >
              <List className="h-4 w-4" />
            </button>
          </div>
        </CardContent>
      </Card>

      {vehicles.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <h2 className="font-display font-semibold">Nenhum veículo encontrado</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Ajuste os filtros ou cadastre uma nova avaliação para começar.
            </p>
          </CardContent>
        </Card>
      ) : view === "grid" ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {vehicles.map((v) => (
            <Card
              key={v.id}
              onClick={() => navigate({ to: "/vehicles/$id", params: { id: String(v.id) } })}
              className="overflow-hidden hover:shadow-md transition-shadow group cursor-pointer"
            >
              <div className="relative aspect-[16/10] bg-gradient-to-br from-muted to-muted/50 flex items-center justify-center">
                <div className="absolute top-3 left-3">
                  <StatusBadge kind="vehicle" value={v.status} />
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    publishMutation.mutate({ id: v.id, published: !v.published });
                  }}
                  disabled={!v.published && v.status !== "available"}
                  className="absolute top-3 right-3 h-8 w-8 rounded-full bg-background/80 backdrop-blur flex items-center justify-center opacity-0 group-hover:opacity-100 transition"
                  title={
                    v.published
                      ? "Despublicar"
                      : v.status === "available"
                        ? "Publicar"
                        : "Apenas disponíveis podem ser publicados"
                  }
                >
                  {v.published ? (
                    <Eye className="h-4 w-4" />
                  ) : (
                    <EyeOff className="h-4 w-4 text-muted-foreground" />
                  )}
                </button>
                <div className="text-5xl opacity-20">🚗</div>
              </div>
              <CardContent className="p-4 space-y-3">
                <div>
                  <div className="font-display font-semibold leading-tight">
                    {v.brand} {v.model}
                  </div>
                  <div className="text-xs text-muted-foreground">{v.version}</div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="plate-chip">{v.plate}</span>
                  <span className="text-xs text-muted-foreground">{v.color}</span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-xs text-muted-foreground border-t pt-3">
                  <div className="flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    {v.model_year}
                  </div>
                  <div className="flex items-center gap-1">
                    <Gauge className="h-3 w-3" />
                    {(v.current_mileage / 1000).toFixed(0)}k km
                  </div>
                  <div className="flex items-center gap-1">
                    <Fuel className="h-3 w-3" />
                    {fuelLabel[v.fuel_type]}
                  </div>
                </div>
                <div className="flex items-end justify-between pt-1">
                  <div>
                    <div className="text-xs text-muted-foreground">Valor estimado de venda</div>
                    <div className="font-display font-semibold text-lg">{brl(v.sale_price)}</div>
                  </div>
                  <Button size="sm" variant="outline" asChild onClick={(e) => e.stopPropagation()}>
                    <Link to="/vehicles/$id" params={{ id: String(v.id) }}>
                      Ver detalhes
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Placa</TableHead>
                  <TableHead>Veículo</TableHead>
                  <TableHead>Ano</TableHead>
                  <TableHead>Km</TableHead>
                  <TableHead>Cor</TableHead>
                  <TableHead>Combustível</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Publicado</TableHead>
                  <TableHead className="text-right">Valor estimado</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {vehicles.map((v) => (
                  <TableRow
                    key={v.id}
                    onClick={() => navigate({ to: "/vehicles/$id", params: { id: String(v.id) } })}
                    className="cursor-pointer"
                  >
                    <TableCell>
                      <span className="plate-chip">{v.plate}</span>
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">
                        {v.brand} {v.model}
                      </div>
                      <div className="text-xs text-muted-foreground">{v.version}</div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{v.model_year}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {v.current_mileage.toLocaleString("pt-BR")}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{v.color}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {fuelLabel[v.fuel_type]}
                    </TableCell>
                    <TableCell>
                      <StatusBadge kind="vehicle" value={v.status} />
                    </TableCell>
                    <TableCell>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={(e) => {
                          e.stopPropagation();
                          publishMutation.mutate({ id: v.id, published: !v.published });
                        }}
                        disabled={!v.published && v.status !== "available"}
                        aria-label={v.published ? `Despublicar ${v.plate}` : `Publicar ${v.plate}`}
                      >
                        {v.published ? (
                          <Eye className="h-4 w-4" />
                        ) : (
                          <EyeOff className="h-4 w-4 text-muted-foreground" />
                        )}
                      </Button>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="font-medium">{brl(v.sale_price)}</div>
                      <div className="text-xs text-muted-foreground">venda</div>
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          asChild
                          aria-label={`Editar ${v.plate}`}
                        >
                          <Link
                            to="/vehicles/edit/$id"
                            params={{ id: String(v.id) }}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Pencil className="h-4 w-4" />
                          </Link>
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label={`Mais ações para ${v.plate}`}
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}

      <ListPagination
        page={displayPage}
        total={total}
        pageSize={vehiclesPage?.pageSize}
        onPageChange={(nextPage) => updateSearch({ page: nextPage, q, status: statusFilter })}
      />
    </div>
  );
}
