import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  BriefcaseBusiness,
  CircleDollarSign,
  ExternalLink,
  Mail,
  Phone,
  FileText,
  Calendar,
  Briefcase,
  Percent,
  ShoppingBag,
} from "lucide-react";
import { useMemo } from "react";
import { Card, CardContent } from "@/shared/components/ui/card";
import { Button } from "@/shared/components/ui/button";
import { Avatar, AvatarFallback } from "@/shared/components/ui/avatar";
import { StatusBadge } from "@/shared/components/status-badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/components/ui/table";
import { brl, fmtDate, initials } from "@/shared/lib/format";
import { formatCpf, formatPhone, formatCep } from "@/shared/lib/field-format";
import {
  buildEmployeeSalesHistory,
  type EmployeeSalesHistory,
} from "@/modules/employees/lib/build-employee-sales-history";
import { employeeKeys, getEmployeeById } from "@/modules/employees/services/employees";
import { listSalesByEmployee, saleKeys } from "@/modules/sales/services/sales";
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
  const {
    data: sales = [],
    isLoading: isLoadingSales,
    error: salesError,
    refetch: refetchSales,
  } = useQuery({
    queryKey: saleKeys.byEmployee(employeeId),
    queryFn: () => listSalesByEmployee(employeeId),
    enabled: Number.isFinite(employeeId),
  });
  const salesHistory = useMemo(() => buildEmployeeSalesHistory(sales), [sales]);

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
              <Row
                icon={FileText}
                value={employee.person.cpf ? formatCpf(employee.person.cpf) : "-"}
              />
              <Row
                icon={Phone}
                value={employee.person.phone ? formatPhone(employee.person.phone) : "-"}
              />
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
                {employee.user_active == null && (
                  <Button variant="outline" size="sm" className="mt-3" asChild>
                    <Link to="/settings" search={{ tab: "users" }}>
                      Criar acesso nas configurações
                    </Link>
                  </Button>
                )}
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
                  <Info label="UF" value={employee.person.primary_address.state || "-"} />
                  <Info
                    label="CEP"
                    value={
                      employee.person.primary_address.zip_code
                        ? formatCep(employee.person.primary_address.zip_code)
                        : "-"
                    }
                  />
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">Nenhum endereço cadastrado.</div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <EmployeeSalesHistorySection
        history={salesHistory}
        isLoading={isLoadingSales}
        error={salesError}
        onRetry={() => void refetchSales()}
      />
    </div>
  );
}

function EmployeeSalesHistorySection({
  history,
  isLoading,
  error,
  onRetry,
}: {
  history: EmployeeSalesHistory;
  isLoading: boolean;
  error: Error | null;
  onRetry: () => void;
}) {
  return (
    <Card>
      <CardContent className="p-6 space-y-6">
        <div className="flex items-center gap-2">
          <BriefcaseBusiness className="h-4 w-4 text-muted-foreground" />
          <div>
            <h2 className="font-display font-semibold">Histórico comercial</h2>
            <p className="text-sm text-muted-foreground">
              Vendas pendentes e concluídas atribuídas a este funcionário.
            </p>
          </div>
        </div>

        {isLoading ? (
          <div className="text-sm text-muted-foreground py-8 text-center">
            Carregando histórico comercial...
          </div>
        ) : error ? (
          <div className="space-y-3 py-8 text-center">
            <p className="text-sm text-destructive">
              Não foi possível carregar o histórico comercial.
            </p>
            <p className="text-xs text-muted-foreground">
              {error.message || "Tente novamente em instantes."}
            </p>
            <Button variant="outline" size="sm" onClick={onRetry}>
              Tentar novamente
            </Button>
          </div>
        ) : history.sales.length === 0 ? (
          <div className="py-8 text-center space-y-2">
            <ShoppingBag className="h-8 w-8 mx-auto text-muted-foreground" />
            <p className="text-sm font-medium">Nenhuma venda no histórico</p>
            <p className="text-sm text-muted-foreground">
              Este funcionário ainda não possui vendas pendentes ou concluídas.
            </p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
              <HistoryMetric
                label="Vendas concluídas"
                value={String(history.completedSalesCount)}
                icon={ShoppingBag}
              />
              <HistoryMetric
                label="Valor vendido"
                value={brl(history.completedSalesValue)}
                icon={CircleDollarSign}
              />
              <HistoryMetric
                label="Vendas pendentes"
                value={String(history.pendingSalesCount)}
                icon={BriefcaseBusiness}
              />
              <div className="rounded-lg bg-muted p-4">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <CircleDollarSign className="h-3.5 w-3.5" />
                  Comissões
                </div>
                <div className="mt-2 space-y-1 text-sm">
                  <div className="flex justify-between gap-3">
                    <span className="text-muted-foreground">Consolidadas</span>
                    <span className="font-semibold">{brl(history.consolidatedCommission)}</span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span className="text-muted-foreground">Estimadas</span>
                    <span className="font-semibold">{brl(history.estimatedCommission)}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-md border border-border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Venda</TableHead>
                    <TableHead>Veículo</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Comissão</TableHead>
                    <TableHead className="text-right">Ação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {history.sales.map((sale) => (
                    <TableRow key={sale.saleId}>
                      <TableCell>
                        <div className="font-mono text-xs">#{sale.saleId}</div>
                        <div className="text-xs text-muted-foreground">
                          {fmtDate(sale.saleDate)}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="font-medium">{sale.vehicleName}</div>
                        <span className="plate-chip">{sale.vehiclePlate}</span>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{sale.customerName}</TableCell>
                      <TableCell className="text-right font-semibold">
                        {brl(sale.totalValue)}
                      </TableCell>
                      <TableCell>
                        <StatusBadge kind="sale" value={sale.status} />
                      </TableCell>
                      <TableCell>
                        <HistoryCommission commission={sale.commission} />
                      </TableCell>
                      <TableCell className="text-right">
                        <Button size="icon" variant="ghost" asChild>
                          <Link
                            to="/sales/$id"
                            params={{ id: String(sale.saleId) }}
                            aria-label={`Ver venda ${sale.saleId}`}
                          >
                            <ExternalLink className="h-4 w-4" />
                          </Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function HistoryMetric({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="rounded-lg bg-muted p-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <div className="mt-2 font-display text-xl font-semibold">{value}</div>
    </div>
  );
}

function HistoryCommission({
  commission,
}: {
  commission: EmployeeSalesHistory["sales"][number]["commission"];
}) {
  if (commission.source === "none") {
    return <span className="text-sm text-muted-foreground">Sem comissão</span>;
  }

  return (
    <div className="space-y-1">
      <div className="text-sm font-medium">{brl(commission.amount)}</div>
      {commission.source === "estimated" ? (
        <span className="text-xs text-muted-foreground">Estimada</span>
      ) : (
        <StatusBadge kind="commission" value={commission.status} />
      )}
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
