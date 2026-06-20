import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  Mail,
  Phone,
  FileText,
  Calendar,
  Briefcase,
  Percent,
  Building2,
} from "lucide-react";
import { Card, CardContent } from "@/shared/components/ui/card";
import { Button } from "@/shared/components/ui/button";
import { Avatar, AvatarFallback } from "@/shared/components/ui/avatar";
import { StatusBadge } from "@/shared/components/status-badge";
import { brl, fmtDate, initials } from "@/shared/lib/format";
import { employeeKeys, getEmployeeById } from "@/modules/employees/services/employees";
import { useQuery } from "@tanstack/react-query";

export const Route = createFileRoute("/_app/employees/$id")({
  head: () => ({ meta: [{ title: "Funcionário | GaragemERP" }] }),
  loader: ({ params, context }) => {
    const employeeId = Number(params.id);
    void context.queryClient.ensureQueryData({
      queryKey: employeeKeys.detail(employeeId),
      queryFn: () => getEmployeeById(employeeId),
    });
  },
  component: EmployeeDetail,
});

function EmployeeDetail() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const employeeId = Number(id);
  const { data: employee, isLoading } = useQuery({
    queryKey: employeeKeys.detail(employeeId),
    queryFn: () => getEmployeeById(employeeId),
  });

  if (isLoading) {
    return (
      <div className="max-w-5xl mx-auto py-16 text-sm text-muted-foreground">Carregando...</div>
    );
  }

  if (!employee) {
    return (
      <div className="max-w-2xl mx-auto text-center py-20">
        <h2 className="font-display text-xl mb-2">Funcionário não encontrado</h2>
        <Button onClick={() => navigate({ to: "/employees" })}>Voltar</Button>
      </div>
    );
  }

  const commissionLabel =
    employee.commission_type === "percentage"
      ? `${employee.commission_rate}%`
      : brl(employee.commission_rate);

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/employees">
            <ArrowLeft className="h-4 w-4" /> Funcionários
          </Link>
        </Button>
        <h1 className="font-display text-2xl font-semibold tracking-tight flex-1">
          {employee.person.name}
        </h1>
        <Button asChild>
          <Link to="/employees/edit/$id" params={{ id: String(employee.id) }}>
            Editar
          </Link>
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card>
          <CardContent className="p-6 space-y-4 text-center">
            <Avatar className="h-24 w-24 mx-auto">
              <AvatarFallback className="bg-primary text-primary-foreground text-2xl">
                {initials(employee.person.name)}
              </AvatarFallback>
            </Avatar>
            <div>
              <div className="font-display text-lg font-semibold">{employee.person.name}</div>
              <div className="text-xs text-muted-foreground">{employee.position}</div>
              <div className="mt-2">
                <span
                  className={`inline-flex items-center gap-1.5 text-xs ${
                    employee.active ? "text-success" : "text-muted-foreground"
                  }`}
                >
                  <span
                    className={`h-2 w-2 rounded-full ${
                      employee.active ? "bg-success" : "bg-muted-foreground"
                    }`}
                  />
                  {employee.active ? "Ativo" : "Inativo"}
                </span>
              </div>
            </div>
            <div className="space-y-2 text-sm text-left border-t border-border pt-4">
              <Row icon={FileText} value={employee.person.cpf ?? "-"} />
              <Row icon={Phone} value={employee.person.phone} />
              <Row icon={Mail} value={employee.person.email} />
              <Row icon={Calendar} value={`Contratado em ${fmtDate(employee.hired_at)}`} />
              <Row icon={Briefcase} value={`Salário: ${brl(employee.salary)}`} />
              <Row icon={Percent} value={`Comissão: ${commissionLabel}`} />
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardContent className="p-6 space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-lg bg-muted p-4">
                <div className="text-xs text-muted-foreground">Perfil de acesso</div>
                <div className="font-display text-2xl font-semibold">
                  {employee.access_role ?? "Sem vínculo"}
                </div>
              </div>
              <div className="rounded-lg bg-muted p-4">
                <div className="text-xs text-muted-foreground">Usuário do sistema</div>
                <div className="font-display text-2xl font-semibold">
                  {employee.user_active == null
                    ? "Não"
                    : employee.user_active
                      ? "Ativo"
                      : "Inativo"}
                </div>
              </div>
            </div>

            <div>
              <h2 className="font-display font-semibold mb-3">Endereço principal</h2>
              {employee.person.primary_address ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                  <Info label="Rua" value={employee.person.primary_address.street} />
                  <Info label="Número" value={employee.person.primary_address.number} />
                  <Info
                    label="Complemento"
                    value={employee.person.primary_address.complement ?? "-"}
                  />
                  <Info label="Bairro" value={employee.person.primary_address.neighborhood} />
                  <Info label="Cidade" value={employee.person.primary_address.city} />
                  <Info label="UF" value={employee.person.primary_address.state} />
                  <Info label="CEP" value={employee.person.primary_address.zip_code} />
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">Nenhum endereço cadastrado.</div>
              )}
            </div>

            <div className="border-t border-border pt-4">
              <h2 className="font-display font-semibold mb-2">Integração com vendas</h2>
              <p className="text-sm text-muted-foreground">
                O histórico de vendas real será conectado quando o módulo de vendas deixar de usar
                mock data.
              </p>
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

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border px-3 py-2">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="font-medium">{value}</div>
    </div>
  );
}
