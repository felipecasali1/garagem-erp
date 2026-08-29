import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Car,
  CheckCircle2,
  ChevronRight,
  DollarSign,
  ShoppingBag,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Wallet,
  Wrench,
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Avatar, AvatarFallback } from "@/shared/components/ui/avatar";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { StatusBadge } from "@/shared/components/status-badge";
import { brl, fmtDate, initials, relTime } from "@/shared/lib/format";
import { useChecklist, summarize } from "@/modules/checklist";
import { financialTransactionKeys, listFinancialTransactions } from "@/modules/financial/services/transactions";
import { saleKeys, listSales } from "@/modules/sales/services/sales";
import { listVehicles, vehicleKeys } from "@/modules/vehicles/services/vehicles";

export const Route = createFileRoute("/_app/")({
  head: () => ({ meta: [{ title: "Painel | GaragemERP" }] }),
  component: Dashboard,
});

const inventoryColors: Record<string, string> = {
  evaluating: "var(--warning)",
  available: "var(--success)",
  reserved: "var(--warning)",
  sold: "var(--info)",
  in_repair: "#f97316",
};

const periods = [
  { key: "3m", label: "3M", months: 3 },
  { key: "6m", label: "6M", months: 6 },
  { key: "1a", label: "12M", months: 12 },
] as const;

function monthKey(date: string) {
  return date.slice(0, 7);
}

function monthLabel(key: string) {
  const [year, month] = key.split("-").map(Number);
  return new Intl.DateTimeFormat("pt-BR", { month: "short" }).format(
    new Date(year, month - 1, 1),
  );
}

function currentMonthYearLabel() {
  return new Intl.DateTimeFormat("pt-BR", {
    month: "long",
    year: "numeric",
  }).format(new Date());
}

function currentFullDateLabel() {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date());
}

function isCurrentMonth(date: string) {
  const now = new Date();
  const currentKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  return monthKey(date) === currentKey;
}

function buildFinancialSeries(
  transactions: Awaited<ReturnType<typeof listFinancialTransactions>>,
  monthsBack: number,
) {
  const now = new Date();
  const months = Array.from({ length: monthsBack }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth() - (monthsBack - 1 - index), 1);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    return { key, month: monthLabel(key), receita: 0, despesas: 0 };
  });
  const byKey = new Map(months.map((entry) => [entry.key, entry]));

  for (const transaction of transactions) {
    if (transaction.status === "canceled") continue;
    const entry = byKey.get(monthKey(transaction.transaction_date));
    if (!entry) continue;
    if (transaction.type === "income") {
      entry.receita += transaction.amount;
    } else {
      entry.despesas += transaction.amount;
    }
  }

  return months;
}

function Dashboard() {
  const navigate = useNavigate();
  const [period, setPeriod] = useState<(typeof periods)[number]["key"]>("6m");
  const { data: vehicles = [], isLoading: loadingVehicles } = useQuery({
    queryKey: vehicleKeys.all,
    queryFn: listVehicles,
  });
  const { data: sales = [], isLoading: loadingSales } = useQuery({
    queryKey: saleKeys.all,
    queryFn: listSales,
  });
  const { data: transactions = [], isLoading: loadingTransactions } = useQuery({
    queryKey: financialTransactionKeys.all,
    queryFn: listFinancialTransactions,
  });
  const allChecklist = useChecklist();

  const filteredVehicles = vehicles.filter((vehicle) => vehicle.status !== "archived");
  const completedSales = sales.filter((sale) => sale.status === "completed");
  const currentMonthCompletedSales = completedSales.filter((sale) => isCurrentMonth(sale.sale_date));
  const currentMonthRevenue = currentMonthCompletedSales.reduce(
    (sum, sale) => sum + sale.total_value,
    0,
  );
  const currentMonthPaidExpenses = transactions
    .filter(
      (transaction) =>
        transaction.type === "expense" &&
        transaction.status === "paid" &&
        isCurrentMonth(transaction.transaction_date),
    )
    .reduce((sum, transaction) => sum + transaction.amount, 0);
  const currentMonthPaidIncome = transactions
    .filter(
      (transaction) =>
        transaction.type === "income" &&
        transaction.status === "paid" &&
        isCurrentMonth(transaction.transaction_date),
    )
    .reduce((sum, transaction) => sum + transaction.amount, 0);

  const inventoryData = (
    ["evaluating", "available", "reserved", "sold", "in_repair"] as const
  ).map((status) => ({
    name:
      status === "evaluating"
        ? "Em avaliação"
        : status === "available"
          ? "Disponível"
          : status === "reserved"
            ? "Reservado"
            : status === "sold"
              ? "Vendido"
              : "Em preparação",
    value: filteredVehicles.filter((vehicle) => vehicle.status === status).length,
    key: status,
  }));

  const prep = useMemo(() => {
    const byVehicle = new Map<number, ReturnType<typeof summarize>>();
    for (const vehicle of filteredVehicles) {
      byVehicle.set(
        vehicle.id,
        summarize(allChecklist.filter((item) => item.vehicle_id === vehicle.id)),
      );
    }

    const withPending = filteredVehicles.filter((vehicle) => {
      const summary = byVehicle.get(vehicle.id);
      if (!summary) return false;
      return summary.pending + summary.inProgress + summary.waitingParts > 0;
    });
    const ready = filteredVehicles.filter((vehicle) => {
      const summary = byVehicle.get(vehicle.id);
      if (!summary) return false;
      return summary.total > 0 && summary.readyForSale && vehicle.status !== "sold";
    });
    const inMaintenance = filteredVehicles.filter(
      (vehicle) =>
        vehicle.status === "in_repair" || (byVehicle.get(vehicle.id)?.inProgress ?? 0) > 0,
    );
    const totalPrepCost = allChecklist.reduce((sum, item) => sum + (item.actual_cost || 0), 0);

    return { withPending, ready, inMaintenance, totalPrepCost };
  }, [allChecklist, filteredVehicles]);

  const chartData = useMemo(() => {
    const selected = periods.find((entry) => entry.key === period) ?? periods[1];
    return buildFinancialSeries(transactions, selected.months);
  }, [period, transactions]);
  const currentMonthLabel = currentMonthYearLabel();
  const currentDateLabel = currentFullDateLabel();

  const recentSales = completedSales
    .slice()
    .sort((a, b) => b.sale_date.localeCompare(a.sale_date))
    .slice(0, 5);

  const recentActivity = useMemo(() => {
    const salesActivity = sales.map((sale) => ({
      id: `sale-${sale.id}`,
      label: `Venda ${sale.status === "completed" ? "concluída" : sale.status === "pending" ? "reservada" : "cancelada"} - ${sale.vehicle.brand} ${sale.vehicle.model}`,
      time: `${sale.sale_date}T12:00:00`,
      href: `/sales/${sale.id}`,
      icon: ShoppingBag,
    }));
    const financialActivity = transactions.map((transaction) => ({
      id: `transaction-${transaction.id}`,
      label: `${transaction.type === "income" ? "Receita" : "Despesa"} - ${transaction.description}`,
      time: `${transaction.transaction_date}T12:00:00`,
      href: `/financial/transactions/${transaction.id}`,
      icon: transaction.type === "income" ? TrendingUp : Wallet,
    }));

    return [...salesActivity, ...financialActivity]
      .sort((a, b) => b.time.localeCompare(a.time))
      .slice(0, 6);
  }, [sales, transactions]);

  const alerts = useMemo(() => {
    const overdueFinancial = transactions.filter((transaction) => transaction.status === "overdue");
    const reservedVehicles = filteredVehicles.filter((vehicle) => vehicle.status === "reserved");
    const preparingVehicles = filteredVehicles.filter((vehicle) => vehicle.status === "in_repair");
    const items: Array<{ type: "danger" | "warning"; label: string; href: string }> = [];

    if (overdueFinancial.length > 0) {
      items.push({
        type: "danger",
        label: `${overdueFinancial.length} conta(s) vencida(s) no financeiro`,
        href: "/financial/transactions",
      });
    }
    if (reservedVehicles.length > 0) {
      items.push({
        type: "warning",
        label: `${reservedVehicles.length} veículo(s) reservado(s) aguardando definição`,
        href: "/sales",
      });
    }
    if (preparingVehicles.length > 0) {
      items.push({
        type: "warning",
        label: `${preparingVehicles.length} veículo(s) em preparação`,
        href: "/vehicles",
      });
    }

    return items;
  }, [filteredVehicles, transactions]);

  const stats = [
    {
      label: "Veículos disponíveis",
      value: filteredVehicles.filter((vehicle) => vehicle.status === "available").length.toString(),
      sub: "Estoque pronto para venda",
      delta: `${filteredVehicles.filter((vehicle) => vehicle.status === "evaluating").length} em avaliação`,
      deltaType: "up" as const,
      icon: Car,
      accent: "text-info bg-info/10",
    },
    {
      label: "Vendas no mês",
      value: currentMonthCompletedSales.length.toString(),
      sub: brl(currentMonthRevenue),
      delta: `${sales.filter((sale) => sale.status === "pending").length} pendente(s)`,
      deltaType: "up" as const,
      icon: ShoppingBag,
      accent: "text-success bg-success/10",
    },
    {
      label: "Receita recebida",
      value: brl(currentMonthPaidIncome),
      sub: `Pagamentos confirmados em ${currentMonthLabel}`,
      delta: `${transactions.filter((transaction) => transaction.type === "income" && transaction.status === "pending").length} a receber`,
      deltaType: "up" as const,
      icon: DollarSign,
      accent: "text-success bg-success/10",
    },
    {
      label: "Despesas pagas",
      value: brl(currentMonthPaidExpenses),
      sub: `Saídas confirmadas em ${currentMonthLabel}`,
      delta: `${transactions.filter((transaction) => transaction.type === "expense" && transaction.status === "pending").length} a pagar`,
      deltaType: "down" as const,
      icon: TrendingDown,
      accent: "text-destructive bg-destructive/10",
    },
    {
      label: "Resultado do mês",
      value: brl(currentMonthPaidIncome - currentMonthPaidExpenses),
      sub: "Entradas pagas menos saídas pagas",
      delta: `${transactions.filter((transaction) => transaction.status === "overdue").length} vencida(s)`,
      deltaType: "up" as const,
      icon: TrendingUp,
      accent: "text-warning bg-warning/10",
    },
  ];

  const loading = loadingVehicles || loadingSales || loadingTransactions;

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto">
      <div>
        <h1 className="text-2xl font-display font-semibold tracking-tight">Visão Geral</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Painel consolidado com dados reais da operação em {currentDateLabel}.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
        {stats.map((stat) => (
          <Card key={stat.label} className="overflow-hidden">
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">{stat.label}</p>
                  <p className="text-2xl font-display font-semibold tracking-tight">
                    {loading ? "..." : stat.value}
                  </p>
                  <p className="text-xs text-muted-foreground">{stat.sub}</p>
                </div>
                <div className={`h-10 w-10 rounded-full flex items-center justify-center ${stat.accent}`}>
                  <stat.icon className="h-5 w-5" />
                </div>
              </div>
              <div className="flex items-center gap-1 mt-3 text-xs">
                {stat.deltaType === "up" ? (
                  <ArrowUpRight className="h-3.5 w-3.5 text-success" />
                ) : (
                  <ArrowDownRight className="h-3.5 w-3.5 text-destructive" />
                )}
                <span className={stat.deltaType === "up" ? "text-success" : "text-destructive"}>
                  {loading ? "..." : stat.delta}
                </span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <PrepCard
          icon={Wrench}
          accent="text-warning bg-warning/10"
          label="Veículos com pendências"
          value={loading ? "..." : prep.withPending.length}
          to="/vehicles"
        />
        <PrepCard
          icon={Sparkles}
          accent="text-success bg-success/10"
          label="Prontos para venda"
          value={loading ? "..." : prep.ready.length}
          to="/vehicles"
        />
        <PrepCard
          icon={CheckCircle2}
          accent="text-info bg-info/10"
          label="Em preparação"
          value={loading ? "..." : prep.inMaintenance.length}
          to="/vehicles"
        />
        <PrepCard
          icon={Wallet}
          accent="text-orange-500 bg-orange-500/10"
          label="Custos de preparação"
          value={loading ? "..." : brl(prep.totalPrepCost)}
          to="/vehicles"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <Card className="lg:col-span-3">
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle className="text-base">Receita vs Despesas</CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">Transações persistidas por mês</p>
            </div>
            <div className="flex gap-1 p-1 rounded-md bg-muted text-xs">
              {periods.map((entry) => (
                <button
                  type="button"
                  key={entry.key}
                  onClick={() => setPeriod(entry.key)}
                  className={`px-2.5 py-1 rounded cursor-pointer transition-colors ${period === entry.key ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                >
                  {entry.label}
                </button>
              ))}
            </div>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={chartData} margin={{ top: 5, right: 8, left: -10, bottom: 0 }}>
                <defs>
                  <linearGradient id="receita" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--success)" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="var(--success)" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="despesas" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--destructive)" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="var(--destructive)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="month"
                  stroke="var(--muted-foreground)"
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  stroke="var(--muted-foreground)"
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(value) => `${Number(value) / 1000}k`}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "var(--popover)",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                  formatter={(value) => brl(Number(value))}
                />
                <Area
                  type="monotone"
                  dataKey="receita"
                  stroke="var(--success)"
                  strokeWidth={2}
                  fill="url(#receita)"
                  name="Receita"
                />
                <Area
                  type="monotone"
                  dataKey="despesas"
                  stroke="var(--destructive)"
                  strokeWidth={2}
                  fill="url(#despesas)"
                  name="Despesas"
                />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Estoque por Status</CardTitle>
            <p className="text-xs text-muted-foreground">Veículos ativos, sem arquivados</p>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-center">
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie
                    data={inventoryData}
                    dataKey="value"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={3}
                    stroke="none"
                  >
                    {inventoryData.map((entry) => (
                      <Cell key={entry.key} fill={inventoryColors[entry.key]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "var(--popover)",
                      border: "1px solid var(--border)",
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="grid grid-cols-2 gap-2 mt-3">
              {inventoryData.map((entry) => (
                <div key={entry.key} className="flex items-center gap-2 text-xs">
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ background: inventoryColors[entry.key] }}
                  />
                  <span className="text-muted-foreground">{entry.name}</span>
                  <span className="ml-auto font-medium">{loading ? "..." : entry.value}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <Card className="lg:col-span-3">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Vendas Recentes</CardTitle>
            <Link to="/sales" className="text-xs text-primary hover:underline">
              Ver todas →
            </Link>
          </CardHeader>
          <CardContent className="p-0">
            {loadingSales ? (
              <div className="p-6 text-sm text-muted-foreground">Carregando vendas...</div>
            ) : recentSales.length === 0 ? (
              <div className="p-6 text-sm text-muted-foreground">
                Nenhuma venda concluída registrada ainda.
              </div>
            ) : (
              <div className="divide-y divide-border">
                {recentSales.map((sale) => (
                  <div
                    key={sale.id}
                    className="flex items-center gap-3 px-6 py-3 hover:bg-muted/40 transition-colors cursor-pointer"
                    onClick={() => navigate({ to: "/sales/$id", params: { id: String(sale.id) } })}
                  >
                    <Avatar className="h-9 w-9">
                      <AvatarFallback className="text-xs bg-muted">
                        {initials(sale.customer.person.name)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{sale.customer.person.name}</div>
                      <div className="text-xs text-muted-foreground truncate">
                        {sale.vehicle.brand} {sale.vehicle.model} ·{" "}
                        <span className="plate-chip">{sale.vehicle.plate}</span>
                      </div>
                    </div>
                    <div className="text-right hidden sm:block">
                      <div className="text-sm font-semibold">{brl(sale.total_value)}</div>
                      <div className="text-xs text-muted-foreground">{fmtDate(sale.sale_date)}</div>
                    </div>
                    <StatusBadge kind="sale" value={sale.status} />
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Movimentações Recentes</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-sm text-muted-foreground">Carregando movimentações...</div>
            ) : recentActivity.length === 0 ? (
              <div className="text-sm text-muted-foreground">
                Nenhuma movimentação recente encontrada.
              </div>
            ) : (
              <div className="space-y-4">
                {recentActivity.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      if (item.id.startsWith("sale-")) {
                        const id = item.id.replace("sale-", "");
                        navigate({ to: "/sales/$id", params: { id } });
                        return;
                      }
                      const id = item.id.replace("transaction-", "");
                      navigate({ to: "/financial/transactions/$id", params: { id } });
                    }}
                    className="flex w-full gap-3 text-left"
                  >
                    <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center shrink-0">
                      <item.icon className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm">{item.label}</div>
                      <div className="text-xs text-muted-foreground">{relTime(item.time)}</div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-warning" />
          <CardTitle className="text-base">Alertas Pendentes</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {loading ? (
            <div className="text-sm text-muted-foreground">Carregando alertas...</div>
          ) : alerts.length === 0 ? (
            <div className="text-sm text-muted-foreground">
              Nenhum alerta operacional relevante no momento.
            </div>
          ) : (
            alerts.map((alert, index) => (
              <button
                key={index}
                type="button"
                onClick={() => navigate({ to: alert.href })}
                className="w-full flex items-center gap-3 p-3 rounded-lg border border-border hover:bg-muted/40 hover:border-primary/30 transition-colors text-left cursor-pointer"
              >
                <span
                  className={`h-2 w-2 rounded-full ${alert.type === "danger" ? "bg-destructive" : "bg-warning"}`}
                />
                <span className="text-sm flex-1">{alert.label}</span>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </button>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function PrepCard({
  icon: Icon,
  accent,
  label,
  value,
  to,
}: {
  icon: React.ComponentType<{ className?: string }>;
  accent: string;
  label: string;
  value: string | number;
  to: string;
}) {
  return (
    <Link to={to} className="block">
      <Card className="overflow-hidden hover:border-primary/40 transition-colors cursor-pointer">
        <CardContent className="p-5 flex items-center gap-4">
          <div className={`h-10 w-10 rounded-full flex items-center justify-center ${accent}`}>
            <Icon className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <div className="text-sm text-muted-foreground">{label}</div>
            <div className="text-xl font-display font-semibold tracking-tight truncate">{value}</div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
