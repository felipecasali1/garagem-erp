import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Calendar, FileText, Mail, MapPin, Phone, Tags } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { Card, CardContent } from "@/shared/components/ui/card";
import { Avatar, AvatarFallback } from "@/shared/components/ui/avatar";
import { Badge } from "@/shared/components/ui/badge";
import { formatCep, formatDocument, formatPhone } from "@/shared/lib/field-format";
import { fmtDate, initials } from "@/shared/lib/format";
import { getSupplierTypeLabel } from "@/modules/suppliers/components/supplier-form";
import { getSupplierById, supplierKeys } from "@/modules/suppliers/services/suppliers";

export const Route = createFileRoute("/_app/suppliers/$id")({
  head: () => ({ meta: [{ title: "Fornecedor | GaragemERP" }] }),
  component: SupplierDetail,
});

function SupplierDetail() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const supplierId = Number(id);
  const {
    data: supplier,
    isLoading,
    error,
  } = useQuery({
    queryKey: supplierKeys.detail(supplierId),
    queryFn: () => getSupplierById(supplierId),
    enabled: Number.isFinite(supplierId),
  });

  if (isLoading) {
    return (
      <div className="max-w-2xl mx-auto py-16 text-sm text-muted-foreground">
        Carregando fornecedor...
      </div>
    );
  }

  if (error || !supplier) {
    return (
      <div className="max-w-2xl mx-auto text-center py-20">
        <h2 className="font-display text-xl mb-2">Fornecedor não encontrado</h2>
        <Button onClick={() => navigate({ to: "/suppliers" })}>Voltar</Button>
      </div>
    );
  }

  const address = supplier.person.primary_address;

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/suppliers">
            <ArrowLeft className="h-4 w-4" /> Fornecedores
          </Link>
        </Button>
        <h1 className="font-display text-2xl font-semibold tracking-tight flex-1">
          {supplier.person.name}
        </h1>
        {!supplier.active && <Badge variant="outline">Arquivado</Badge>}
        <Button asChild>
          <Link to="/suppliers/edit/$id" params={{ id: String(supplier.id) }}>
            Editar
          </Link>
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-1">
          <CardContent className="p-6 space-y-4 text-center">
            <Avatar className="h-24 w-24 mx-auto">
              <AvatarFallback className="bg-primary text-primary-foreground text-2xl">
                {initials(supplier.person.name)}
              </AvatarFallback>
            </Avatar>
            <div>
              <div className="font-display text-lg font-semibold">{supplier.person.name}</div>
              <div className="text-xs text-muted-foreground">
                {supplier.person.type === "company" ? "Pessoa Jurídica" : "Pessoa Física"}
              </div>
            </div>
            <div className="space-y-2 text-sm text-left border-t border-border pt-4">
              <Row
                icon={FileText}
                value={
                  supplier.person.cpf || supplier.person.cnpj
                    ? formatDocument(
                        supplier.person.cpf ?? supplier.person.cnpj ?? "",
                        supplier.person.type,
                      )
                    : "-"
                }
              />
              <Row
                icon={Phone}
                value={supplier.person.phone ? formatPhone(supplier.person.phone) : "-"}
              />
              <Row icon={Mail} value={supplier.person.email || "-"} />
              <Row icon={Tags} value={getSupplierTypeLabel(supplier.supplier_type)} />
              <Row icon={Calendar} value={`Fornecedor desde ${fmtDate(supplier.created_at)}`} />
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardContent className="p-6 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-display font-semibold">Endereço principal</h2>
              <span className="text-xs text-muted-foreground">Vinculado à pessoa</span>
            </div>
            {address ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <Info icon={MapPin} label="Rua" value={address.street || "-"} />
                <Info icon={MapPin} label="Número" value={address.number || "-"} />
                <Info icon={MapPin} label="Complemento" value={address.complement || "-"} />
                <Info icon={MapPin} label="Bairro" value={address.neighborhood || "-"} />
                <Info icon={MapPin} label="Cidade" value={address.city || "-"} />
                <Info icon={MapPin} label="UF" value={address.state || "-"} />
                <Info
                  icon={MapPin}
                  label="CEP"
                  value={address.zip_code ? formatCep(address.zip_code) : "-"}
                />
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">
                Nenhum endereço principal cadastrado para este fornecedor.
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-6 space-y-3">
          <h2 className="font-display font-semibold">Observações</h2>
          <div className="text-sm text-muted-foreground">
            {supplier.notes || "Nenhuma observação cadastrada."}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Row({
  icon: Icon,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  value: string;
}) {
  return (
    <div className="flex items-center gap-2 text-muted-foreground">
      <Icon className="h-4 w-4 shrink-0" />
      <span className="text-foreground truncate">{value}</span>
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
    <div className="rounded-md border border-border p-3">
      <div className="flex items-center gap-2 text-xs text-muted-foreground uppercase tracking-wide">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <div className="mt-1 font-medium">{value}</div>
    </div>
  );
}
