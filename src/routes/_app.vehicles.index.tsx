import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
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
import { vehicles } from "@/shared/mock-data";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/components/ui/table";

export const Route = createFileRoute("/_app/vehicles/")({
  head: () => ({ meta: [{ title: "Veículos | GaragemERP" }] }),
  component: VehiclesPage,
});

const fuelLabel: Record<string, string> = {
  flex: "Flex",
  gasoline: "Gasolina",
  diesel: "Diesel",
  electric: "Elétrico",
  hybrid: "Híbrido",
};

function VehiclesPage() {
  const [view, setView] = useState<"grid" | "table">("grid");
  const [q, setQ] = useState("");
  const navigate = useNavigate();

  const filtered = vehicles.filter(
    (v) => !q || `${v.brand} ${v.model} ${v.plate}`.toLowerCase().includes(q.toLowerCase()),
  );

  return (
    <div className="max-w-[1600px] mx-auto">
      <PageHeader
        title="Estoque de Veículos"
        description={`${filtered.length} de ${vehicles.length} veículos`}
        action={{ label: "Adicionar Veículo", onClick: () => navigate({ to: "/vehicles/new" }) }}
      />

      <Card className="mb-6">
        <CardContent className="p-4 flex flex-col md:flex-row gap-3 md:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar por placa, marca, modelo..."
              className="pl-9"
            />
          </div>
          <div className="flex gap-2">
            {(["available", "reserved", "in_repair", "sold"] as const).map((s) => (
              <button
                key={s}
                className="text-xs px-2.5 py-1.5 rounded-md border border-border hover:bg-muted transition"
              >
                <StatusBadge kind="vehicle" value={s} />
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

      {view === "grid" ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map((v) => (
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
                  className="absolute top-3 right-3 h-8 w-8 rounded-full bg-background/80 backdrop-blur flex items-center justify-center opacity-0 group-hover:opacity-100 transition"
                  title={v.published ? "Despublicar" : "Publicar"}
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
                    <div className="text-xs text-muted-foreground">Preço</div>
                    <div className="font-display font-semibold text-lg">{brl(v.sale_price)}</div>
                  </div>
                  <Button size="sm" variant="outline" asChild onClick={(e) => e.stopPropagation()}>
                    <Link to="/vehicles/$id" params={{ id: String(v.id) }}>Ver detalhes</Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
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
                <TableHead className="text-right">Valor</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((v) => (
                <TableRow key={v.id} onClick={() => navigate({ to: "/vehicles/$id", params: { id: String(v.id) } })} className="cursor-pointer">
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
                  <TableCell className="text-muted-foreground">{fuelLabel[v.fuel_type]}</TableCell>
                  <TableCell>
                    <StatusBadge kind="vehicle" value={v.status} />
                  </TableCell>
                  <TableCell>
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={v.published ? `Despublicar ${v.plate}` : `Publicar ${v.plate}`}
                    >
                      {v.published ? (
                        <Eye className="h-4 w-4" />
                      ) : (
                        <EyeOff className="h-4 w-4 text-muted-foreground" />
                      )}
                    </Button>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{brl(v.sale_price)}</TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      <Button size="icon" variant="ghost" aria-label={`Editar ${v.plate}`}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" aria-label={`Mais ações para ${v.plate}`}>
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
