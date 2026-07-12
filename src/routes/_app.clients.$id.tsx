import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Mail, Phone, FileText, Calendar, MapPin, ShoppingBag } from "lucide-react";
import { Card, CardContent } from "@/shared/components/ui/card";
import { Button } from "@/shared/components/ui/button";
import { Avatar, AvatarFallback } from "@/shared/components/ui/avatar";
import { brl, fmtDate, initials } from "@/shared/lib/format";
import { formatDocument, formatPhone, formatCep } from "@/shared/lib/field-format";
import { customerKeys, getCustomerById } from "@/modules/customers/services/customers";

export const Route = createFileRoute("/_app/clients/$id")({
  head: () => ({ meta: [{ title: "Cliente | GaragemERP" }] }),
  component: ClientDetail,
});

function ClientDetail() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const customerId = Number(id);
  const {
    data: customer,
    isLoading,
    error,
  } = useQuery({
    queryKey: customerKeys.detail(customerId),
    queryFn: () => getCustomerById(customerId),
    enabled: Number.isFinite(customerId),
  });

  if (isLoading) {
    return (
      <div className="max-w-2xl mx-auto py-16 text-sm text-muted-foreground">
        Carregando cliente...
      </div>
    );
  }

  if (error || !customer) {
    return (
      <div className="max-w-2xl mx-auto text-center py-20">
        <h2 className="font-display text-xl mb-2">Cliente não encontrado</h2>
        <Button onClick={() => navigate({ to: "/clients" })}>Voltar</Button>
      </div>
    );
  }

  const address = customer.person.primary_address;

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/clients">
            <ArrowLeft className="h-4 w-4" /> Clientes
          </Link>
        </Button>
        <h1 className="font-display text-2xl font-semibold tracking-tight flex-1">
          {customer.person.name}
        </h1>
        <Button asChild>
          <Link to="/clients/edit/$id" params={{ id: String(customer.id) }}>
            Editar
          </Link>
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-1">
          <CardContent className="p-6 space-y-4 text-center">
            <Avatar className="h-24 w-24 mx-auto">
              <AvatarFallback className="bg-primary text-primary-foreground text-2xl">
                {initials(customer.person.name)}
              </AvatarFallback>
            </Avatar>
            <div>
              <div className="font-display text-lg font-semibold">{customer.person.name}</div>
              <div className="text-xs text-muted-foreground">
                {customer.person.type === "company" ? "Pessoa Jurídica" : "Pessoa Física"}
              </div>
            </div>
            <div className="space-y-2 text-sm text-left border-t border-border pt-4">
              <Row
                icon={FileText}
                value={
                  customer.person.cpf || customer.person.cnpj
                    ? formatDocument(
                        customer.person.cpf ?? customer.person.cnpj ?? "",
                        customer.person.type,
                      )
                    : "-"
                }
              />
              <Row
                icon={Phone}
                value={customer.person.phone ? formatPhone(customer.person.phone) : "-"}
              />
              <Row icon={Mail} value={customer.person.email} />
              <Row icon={Calendar} value={`Cliente desde ${fmtDate(customer.created_at)}`} />
              <Row icon={ShoppingBag} value={`Total: ${brl(customer.total_purchases)}`} />
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
                Nenhum endereço principal cadastrado para este cliente.
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-6 space-y-3">
          <h2 className="font-display font-semibold">Histórico de compras</h2>
          <div className="text-sm text-muted-foreground text-center py-8">
            O histórico de compras será exibido quando o módulo de vendas estiver conectado ao
            Supabase.
          </div>
          <div className="flex items-center justify-between rounded-md border border-border px-4 py-3 text-sm">
            <span>Total acumulado</span>
            <span className="font-semibold">{brl(customer.total_purchases)}</span>
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
