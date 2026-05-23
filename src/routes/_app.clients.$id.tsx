import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Mail, Phone, FileText, Calendar, ShoppingBag } from "lucide-react";
import { Card, CardContent } from "@/shared/components/ui/card";
import { Button } from "@/shared/components/ui/button";
import { Avatar, AvatarFallback } from "@/shared/components/ui/avatar";
import { StatusBadge } from "@/shared/components/status-badge";
import { customers, sales } from "@/shared/mock-data";
import { brl, fmtDate, initials } from "@/shared/lib/format";

export const Route = createFileRoute("/_app/clients/$id")({
  head: () => ({ meta: [{ title: "Cliente | GaragemERP" }] }),
  component: ClientDetail,
});

function ClientDetail() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const c = customers.find((x) => String(x.id) === id);
  if (!c) {
    return (
      <div className="max-w-2xl mx-auto text-center py-20">
        <h2 className="font-display text-xl mb-2">Cliente não encontrado</h2>
        <Button onClick={() => navigate({ to: "/clients" })}>Voltar</Button>
      </div>
    );
  }

  const cSales = sales.filter((s) => s.customer.id === c.id);

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/clients">
            <ArrowLeft className="h-4 w-4" /> Clientes
          </Link>
        </Button>
        <h1 className="font-display text-2xl font-semibold tracking-tight flex-1">
          {c.person.name}
        </h1>
        <Button asChild>
          <Link to="/clients/edit/$id" params={{ id: String(c.id) }}>Editar</Link>
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-1">
          <CardContent className="p-6 space-y-4 text-center">
            <Avatar className="h-24 w-24 mx-auto">
              <AvatarFallback className="bg-primary text-primary-foreground text-2xl">
                {initials(c.person.name)}
              </AvatarFallback>
            </Avatar>
            <div>
              <div className="font-display text-lg font-semibold">{c.person.name}</div>
              <div className="text-xs text-muted-foreground">
                {c.person.type === "company" ? "Pessoa Jurídica" : "Pessoa Física"}
              </div>
            </div>
            <div className="space-y-2 text-sm text-left border-t border-border pt-4">
              <Row icon={FileText} value={c.person.cpf ?? c.person.cnpj ?? "-"} />
              <Row icon={Phone} value={c.person.phone} />
              <Row icon={Mail} value={c.person.email} />
              <Row icon={Calendar} value={`Cliente desde ${fmtDate(c.created_at)}`} />
              <Row icon={ShoppingBag} value={`Total: ${brl(c.total_purchases)}`} />
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardContent className="p-6">
            <h2 className="font-display font-semibold mb-4">Histórico de compras</h2>
            {cSales.length === 0 ? (
              <div className="text-sm text-muted-foreground text-center py-8">
                Nenhuma venda registrada para este cliente.
              </div>
            ) : (
              <div className="divide-y divide-border">
                {cSales.map((s) => (
                  <div key={s.id} className="py-3 flex items-center justify-between">
                    <div>
                      <div className="font-medium">
                        {s.vehicle.brand} {s.vehicle.model}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Venda #{s.id} · {fmtDate(s.sale_date)}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-semibold">{brl(s.total_value)}</div>
                      <StatusBadge kind="sale" value={s.status} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
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
