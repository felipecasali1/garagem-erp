import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  Car,
  TrendingUp,
  TrendingDown,
  DollarSign,
  ArrowUpRight,
  ArrowDownRight,
  ShoppingBag,
  UserPlus,
  Wallet,
  AlertTriangle,
  ChevronRight,
  Wrench,
  CheckCircle2,
  Sparkles,
} from "lucide-react";
import { useChecklist, summarize } from "@/modules/checklist";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  CartesianGrid,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { StatusBadge } from "@/shared/components/status-badge";
import { brl, fmtDate, initials, relTime } from "@/shared/lib/format";
import { sales, vehicles, monthlySeries } from "@/shared/mock-data";
import { Avatar, AvatarFallback } from "@/shared/components/ui/avatar";

export const Route = createFileRoute("/_app/")({
  head: () => ({ meta: [{ title: "Dashboard | GaragemERP" }] }),
  component: Dashboard,
});

const stats = [
  {
    label: "Veículos Disponíveis",
    value: vehicles.filter((v) => v.status === "available").length.toString(),
    delta: "+2",
    deltaType: "up" as const,
    icon: Car,
    accent: "text-info bg-info/10",
  },
  {
    label: "Vendas este mês",
    value: "5",
    sub: brl(626700),
    delta: "+18%",
    deltaType: "up" as const,
    icon: TrendingUp,
    accent: "text-success bg-success/10",
  },
  {
    label: "Receita do Mês",
    value: brl(389000),
    delta: "+12%",
    deltaType: "up" as const,
    icon: DollarSign,
    accent: "text-success bg-success/10",
  },
  {
    label: "Despesas do Mês",
    value: brl(252000),
    delta: "-4%",
    deltaType: "down" as const,
    icon: TrendingDown,
    accent: "text-destructive bg-destructive/10",
  },
];

const inventoryData = (
  ["available", "reserved", "sold", "in_repair"] as const
).map((s) => ({
  name:
    s === "available"
      ? "Disponível"
      : s === "reserved"
        ? "Reservado"
        : s === "sold"
          ? "Vendido"
          : "Em reparo",
  value: vehicles.filter((v) => v.status === s).length,
  key: s,
}));

const inventoryColors: Record<string, string> = {
  available: "var(--success)",
  reserved: "var(--warning)",
  sold: "var(--info)",
  in_repair: "#f97316",
};

const activity = [
  { icon: ShoppingBag, label: "Venda registrada - Jeep Compass", time: "2025-05-05T10:30:00" },
  { icon: Car, label: "Veículo adicionado - BYD Dolphin", time: "2025-05-04T15:12:00" },
  { icon: Wallet, label: "Pagamento recebido - Venda #1024", time: "2025-04-28T09:00:00" },
  { icon: UserPlus, label: "Novo cliente - Beatriz Ramos", time: "2025-01-08T14:00:00" },
];

type AlertItem = { type: "danger" | "warning"; label: string; href: string };
const alerts: AlertItem[] = [
  { type: "danger", label: "1 parcela vencida - Aluguel do pátio", href: "/financial/bills" },
  { type: "warning", label: "1 veículo reservado há 30+ dias", href: "/vehicles" },
  { type: "warning", label: "2 comissões pendentes de pagamento", href: "/financial/bills" },
];

const periods = [
  { key: "7d", label: "7D", count: 7 },
  { key: "30d", label: "30D", count: 30 },
  { key: "3m", label: "3M", count: 3 },
  { key: "6m", label: "6M", count: 6 },
  { key: "1a", label: "1A", count: 12 },
] as const;

function Dashboard() {
  const navigate = useNavigate();
  const [period, setPeriod] = useState<(typeof periods)[number]["key"]>("6m");
  const recentSales = [...sales].sort((a, b) => b.sale_date.localeCompare(a.sale_date)).slice(0, 5);
  const allChecklist = useChecklist();

  const prep = useMemo(() => {
    const byVehicle = new Map<number, ReturnType<typeof summarize>>();
    for (const v of vehicles) {
      byVehicle.set(v.id, summarize(allChecklist.filter((i) => i.vehicle_id === v.id)));
    }
    const withPending = vehicles.filter((v) => {
      const s = byVehicle.get(v.id)!;
      return s.pending + s.inProgress + s.waitingParts > 0;
    });
    const ready = vehicles.filter((v) => {
      const s = byVehicle.get(v.id)!;
      return s.total > 0 && s.readyForSale && v.status !== "sold";
    });
    const inMaintenance = vehicles.filter(
      (v) => v.status === "in_repair" || (byVehicle.get(v.id)?.inProgress ?? 0) > 0,
    );
    const totalPrepCost = allChecklist.reduce((s, i) => s + (i.actual_cost || 0), 0);
    const urgentCount = vehicles.filter((v) => byVehicle.get(v.id)?.hasUrgent).length;
    return { withPending, ready, inMaintenance, totalPrepCost, urgentCount };
  }, [allChecklist]);


  const chartData = useMemo(() => {
    const p = periods.find((x) => x.key === period)!;
    if (period === "7d" || period === "30d") {
      const last = monthlySeries[monthlySeries.length - 1];
      const days = p.count;
      // Synthesize daily series from monthly aggregate
      return Array.from({ length: days }, (_, i) => {
        const factor = (i + 1) / days;
        const noise = 0.85 + ((i * 37) % 30) / 100;
        return {
          month: `D${i + 1}`,
          receita: Math.round((last.receita / days) * noise * factor + last.receita / days * 0.6),
          despesas: Math.round((last.despesas / days) * noise * factor + last.despesas / days * 0.6),
        };
      });
    }
    return monthlySeries.slice(-p.count);
  }, [period]);

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto">
      <div>
        <h1 className="text-2xl font-display font-semibold tracking-tight">Visão Geral</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Acompanhe o desempenho da sua revenda em tempo real.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {stats.map((s) => (
          <Card key={s.label} className="overflow-hidden">
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">{s.label}</p>
                  <p className="text-2xl font-display font-semibold tracking-tight">{s.value}</p>
                  {s.sub && <p className="text-xs text-muted-foreground">{s.sub}</p>}
                </div>
                <div className={`h-10 w-10 rounded-full flex items-center justify-center ${s.accent}`}>
                  <s.icon className="h-5 w-5" />
                </div>
              </div>
              <div className="flex items-center gap-1 mt-3 text-xs">
                {s.deltaType === "up" ? (
                  <ArrowUpRight className="h-3.5 w-3.5 text-success" />
                ) : (
                  <ArrowDownRight className="h-3.5 w-3.5 text-destructive" />
                )}
                <span className={s.deltaType === "up" ? "text-success" : "text-destructive"}>
                  {s.delta}
                </span>
                <span className="text-muted-foreground">vs mês anterior</span>
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
          value={prep.withPending.length}
          to="/vehicles"
        />
        <PrepCard
          icon={Sparkles}
          accent="text-success bg-success/10"
          label="Prontos para venda"
          value={prep.ready.length}
          to="/vehicles"
        />
        <PrepCard
          icon={CheckCircle2}
          accent="text-info bg-info/10"
          label="Em manutenção/preparação"
          value={prep.inMaintenance.length}
          to="/vehicles"
        />
        <PrepCard
          icon={DollarSign}
          accent="text-orange-500 bg-orange-500/10"
          label="Custos de preparação"
          value={brl(prep.totalPrepCost)}
          to="/vehicles"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <Card className="lg:col-span-3">
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle className="text-base">Receita vs Despesas</CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">Últimos 6 meses</p>
            </div>
            <div className="flex gap-1 p-1 rounded-md bg-muted text-xs">
              {periods.map((p) => (
                <button
                  type="button"
                  key={p.key}
                  onClick={() => setPeriod(p.key)}
                  className={`px-2.5 py-1 rounded cursor-pointer transition-colors ${period === p.key ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                >
                  {p.label}
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
                <XAxis dataKey="month" stroke="var(--muted-foreground)" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="var(--muted-foreground)" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(v) => `${v / 1000}k`} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "var(--popover)",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                  formatter={(v) => brl(Number(v))}
                />
                <Area type="monotone" dataKey="receita" stroke="var(--success)" strokeWidth={2} fill="url(#receita)" name="Receita" />
                <Area type="monotone" dataKey="despesas" stroke="var(--destructive)" strokeWidth={2} fill="url(#despesas)" name="Despesas" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Estoque por Status</CardTitle>
            <p className="text-xs text-muted-foreground">Distribuição atual dos veículos</p>
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
                    {inventoryData.map((d) => (
                      <Cell key={d.key} fill={inventoryColors[d.key]} />
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
              {inventoryData.map((d) => (
                <div key={d.key} className="flex items-center gap-2 text-xs">
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ background: inventoryColors[d.key] }}
                  />
                  <span className="text-muted-foreground">{d.name}</span>
                  <span className="ml-auto font-medium">{d.value}</span>
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
            <div className="divide-y divide-border">
              {recentSales.map((s) => (
                <div key={s.id} className="flex items-center gap-3 px-6 py-3 hover:bg-muted/40 transition-colors cursor-pointer">
                  <Avatar className="h-9 w-9">
                    <AvatarFallback className="text-xs bg-muted">{initials(s.customer.person.name)}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{s.customer.person.name}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      {s.vehicle.brand} {s.vehicle.model} · <span className="plate-chip">{s.vehicle.plate}</span>
                    </div>
                  </div>
                  <div className="text-right hidden sm:block">
                    <div className="text-sm font-semibold">{brl(s.total_value - s.discount)}</div>
                    <div className="text-xs text-muted-foreground">{fmtDate(s.sale_date)}</div>
                  </div>
                  <StatusBadge kind="sale" value={s.status} />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Atividade Recente</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {activity.map((a, i) => (
                <div key={i} className="flex gap-3">
                  <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center shrink-0">
                    <a.icon className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm">{a.label}</div>
                    <div className="text-xs text-muted-foreground">{relTime(a.time)}</div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-warning" />
          <CardTitle className="text-base">Alertas Pendentes</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {alerts.map((a, i) => (
            <button
              key={i}
              type="button"
              onClick={() => navigate({ to: a.href })}
              className="w-full flex items-center gap-3 p-3 rounded-lg border border-border hover:bg-muted/40 hover:border-primary/30 transition-colors text-left cursor-pointer"
            >
              <span
                className={`h-2 w-2 rounded-full ${a.type === "danger" ? "bg-destructive" : "bg-warning"}`}
              />
              <span className="text-sm flex-1">{a.label}</span>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </button>
          ))}
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
            <div className="text-xl font-display font-semibold tracking-tight truncate">
              {value}
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
