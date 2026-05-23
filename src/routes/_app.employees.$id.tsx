import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Mail, Phone, FileText, Calendar, Briefcase, Percent } from "lucide-react";
import { Card, CardContent } from "@/shared/components/ui/card";
import { Button } from "@/shared/components/ui/button";
import { Avatar, AvatarFallback } from "@/shared/components/ui/avatar";
import { StatusBadge } from "@/shared/components/status-badge";
import { employees, sales } from "@/shared/mock-data";
import { brl, fmtDate, initials } from "@/shared/lib/format";

export const Route = createFileRoute("/_app/employees/$id")({
  head: () => ({ meta: [{ title: "Funcionário | GaragemERP" }] }),
  component: EmployeeDetail,
});

function EmployeeDetail() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const e = employees.find((x) => String(x.id) === id);
  if (!e) {
    return (
      <div className="max-w-2xl mx-auto text-center py-20">
        <h2 className="font-display text-xl mb-2">Funcionário não encontrado</h2>
        <Button onClick={() => navigate({ to: "/employees" })}>Voltar</Button>
      </div>
    );
  }

  const eSales = sales.filter((s) => s.employee.id === e.id);
  const totalSold = eSales
    .filter((s) => s.status === "completed")
    .reduce((sum, s) => sum + s.total_value, 0);

  const commissionLabel =
    e.commission_type === "percentage" ? `${e.commission_rate}%` : brl(e.commission_rate);

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/employees">
            <ArrowLeft className="h-4 w-4" /> Funcionários
          </Link>
        </Button>
        <h1 className="font-display text-2xl font-semibold tracking-tight flex-1">
          {e.person.name}
        </h1>
        <Button asChild>
          <Link to="/employees/edit/$id" params={{ id: String(e.id) }}>Editar</Link>
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card>
          <CardContent className="p-6 space-y-4 text-center">
            <Avatar className="h-24 w-24 mx-auto">
              <AvatarFallback className="bg-primary text-primary-foreground text-2xl">
                {initials(e.person.name)}
              </AvatarFallback>
            </Avatar>
            <div>
              <div className="font-display text-lg font-semibold">{e.person.name}</div>
              <div className="text-xs text-muted-foreground">{e.position}</div>
              <div className="mt-2">
                <span
                  className={`inline-flex items-center gap-1.5 text-xs ${e.active ? "text-success" : "text-muted-foreground"
                    }`}
                >
                  <span
                    className={`h-2 w-2 rounded-full ${e.active ? "bg-success" : "bg-muted-foreground"
                      }`}
                  />
                  {e.active ? "Ativo" : "Inativo"}
                </span>
              </div>
            </div>
            <div className="space-y-2 text-sm text-left border-t border-border pt-4">
              <Row icon={FileText} value={e.person.cpf ?? "-"} />
              <Row icon={Phone} value={e.person.phone} />
              <Row icon={Mail} value={e.person.email} />
              <Row icon={Calendar} value={`Contratado em ${fmtDate(e.hired_at)}`} />
              <Row icon={Briefcase} value={`Salário: ${brl(e.salary)}`} />
              <Row icon={Percent} value={`Comissão: ${commissionLabel}`} />
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardContent className="p-6 space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-lg bg-muted p-4">
                <div className="text-xs text-muted-foreground">Vendas concluídas</div>
                <div className="font-display text-2xl font-semibold">
                  {eSales.filter((s) => s.status === "completed").length}
                </div>
              </div>
              <div className="rounded-lg bg-muted p-4">
                <div className="text-xs text-muted-foreground">Total vendido</div>
                <div className="font-display text-2xl font-semibold text-success">
                  {brl(totalSold)}
                </div>
              </div>
            </div>
            <div>
              <h2 className="font-display font-semibold mb-3">Vendas</h2>
              {eSales.length === 0 ? (
                <div className="text-sm text-muted-foreground text-center py-8">
                  Nenhuma venda registrada.
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {eSales.map((s) => (
                    <div key={s.id} className="py-3 flex items-center justify-between">
                      <div>
                        <div className="font-medium text-sm">
                          {s.vehicle.brand} {s.vehicle.model}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {s.customer.person.name} · {fmtDate(s.sale_date)}
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
            </div>
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
