import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowLeft, Save, Trash2 } from "lucide-react";
import { Card, CardContent } from "@/shared/components/ui/card";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Textarea } from "@/shared/components/ui/textarea";
import { Switch } from "@/shared/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { toast } from "sonner";
import { vehicles } from "@/shared/mock-data";
import { VehicleChecklist } from "@/modules/checklist/components/vehicle-checklist";

export const Route = createFileRoute("/_app/vehicles/edit/$id")({
  head: () => ({ meta: [{ title: "Editar Veículo | GaragemERP" }] }),
  component: EditVehicle,
});

function EditVehicle() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const v = vehicles.find((x) => String(x.id) === id);
  const [saving, setSaving] = useState(false);

  if (!v) {
    return (
      <div className="max-w-2xl mx-auto text-center py-20">
        <h2 className="font-display text-xl mb-2">Veículo não encontrado</h2>
        <Button onClick={() => navigate({ to: "/vehicles" })}>Voltar ao estoque</Button>
      </div>
    );
  }

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setTimeout(() => {
      toast.success("Alterações salvas");
      navigate({ to: "/vehicles/$id", params: { id } });
    }, 500);
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
            toast.success("Veículo removido");
            navigate({ to: "/vehicles" });
          }}
        >
          <Trash2 className="h-4 w-4" /> Excluir
        </Button>
        <Button type="submit" disabled={saving}>
          <Save className="h-4 w-4" /> {saving ? "Salvando..." : "Salvar"}
        </Button>
      </div>

      <Card>
        <CardContent className="p-6 space-y-4">
          <h2 className="font-display font-semibold">Identificação</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Placa" required>
              <Input defaultValue={v.plate} required />
            </Field>
            <Field label="Chassi">
              <Input defaultValue={(v as { chassis?: string }).chassis ?? ""} />
            </Field>
            <Field label="VIN">
              <Input defaultValue={(v as { vin?: string }).vin ?? ""} />
            </Field>
            <Field label="Marca" required>
              <Input defaultValue={v.brand} required />
            </Field>
            <Field label="Modelo" required>
              <Input defaultValue={v.model} required />
            </Field>
            <Field label="Versão">
              <Input defaultValue={v.version ?? ""} />
            </Field>
            <Field label="Cor" required>
              <Input defaultValue={v.color} required />
            </Field>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6 space-y-4">
          <h2 className="font-display font-semibold">Especificações</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Field label="Combustível">
              <Select defaultValue={v.fuel_type}>
                <SelectTrigger><SelectValue /></SelectTrigger>
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
              <Select defaultValue={v.transmission}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="manual">Manual</SelectItem>
                  <SelectItem value="automatic">Automático</SelectItem>
                  <SelectItem value="cvt">CVT</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Quilometragem">
              <Input type="number" defaultValue={v.current_mileage} />
            </Field>
            <Field label="Ano fabricação">
              <Input type="number" defaultValue={v.manufacture_year} />
            </Field>
            <Field label="Ano modelo">
              <Input type="number" defaultValue={v.model_year} />
            </Field>
            <Field label="Status">
              <Select defaultValue={v.status}>
                <SelectTrigger><SelectValue /></SelectTrigger>
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
              <Input type="number" defaultValue={v.cost_price} />
            </Field>
            <Field label="Preço de venda">
              <Input type="number" defaultValue={v.sale_price} />
            </Field>
          </div>
          <div className="flex items-center justify-between rounded-md border border-border p-4">
            <div>
              <div className="font-medium text-sm">Publicado no site</div>
              <div className="text-xs text-muted-foreground">Visível para clientes externos</div>
            </div>
            <Switch defaultChecked={v.published} />
          </div>
          <Field label="Observações">
            <Textarea rows={3} placeholder="Anotações internas..." />
          </Field>
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
