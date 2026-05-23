import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import {
  ArrowDownCircle,
  ArrowUpCircle,
  Banknote,
  TrendingUp,
  TrendingDown,
  AlertCircle,
  Plus,
  Minus,
  Home,
  UserCheck,
} from "lucide-react";
import { FinancialActionDialog, type QuickActionKind } from "@/modules/financial/components/quick-actions-dialog";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from "recharts";
import { PageHeader } from "@/shared/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { brl, fmtDate } from "@/shared/lib/format";
import { transactions, monthlySeries } from "@/shared/mock-data";
import { StatusBadge } from "@/shared/components/status-badge";

export const Route = createFileRoute("/_app/financial/")({
  head: () => ({ meta: [{ title: "Financeiro | GaragemERP" }] }),
  component: FinancialPage,
});

const kpis = [
  { label: "Receita do Mês", value: brl(389000), icon: TrendingUp, accent: "text-success bg-success/10" },
  { label: "Despesas do Mês", value: brl(252000), icon: TrendingDown, accent: "text-destructive bg-destructive/10" },
  { label: "Resultado Líquido", value: brl(137000), icon: Banknote, accent: "text-info bg-info/10" },
  { label: "Comissões a Pagar", value: brl(2487), icon: UserCheck, accent: "text-warning bg-warning/10" },
  { label: "Parcelas Vencidas", value: "1", icon: AlertCircle, accent: "text-destructive bg-destructive/10" },
];

const quickActions: { kind: Exclude<QuickActionKind, null>; label: string; icon: typeof Plus; accent: string }[] = [
  { kind: "income", label: "Registrar Receita", icon: Plus, accent: "text-success" },
  { kind: "expense", label: "Registrar Despesa", icon: Minus, accent: "text-destructive" },
  { kind: "fixed_cost", label: "Registrar Custo Fixo", icon: Home, accent: "text-warning" },
  { kind: "salary", label: "Pagar Salário", icon: UserCheck, accent: "text-info" },
];

function FinancialPage() {
  const [action, setAction] = useState<QuickActionKind>(null);
  const recent = [...transactions]
    .sort((a, b) => b.transaction_date.localeCompare(a.transaction_date))
    .slice(0, 8);

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto">
      <PageHeader title="Financeiro" description="Controle de receitas, despesas e fluxo de caixa." />

      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="font-display font-semibold text-sm">Ações Rápidas</h3>
              <p className="text-xs text-muted-foreground">Lance receitas, despesas e pagamentos</p>
            </div>
            <Link to="/financial/bills" className="text-xs text-primary hover:underline">Contas a pagar →</Link>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
            {quickActions.map((a) => (
              <button
                key={a.label}
                onClick={() => setAction(a.kind)}
                className="flex items-center gap-3 p-3 rounded-lg border border-border hover:bg-muted/40 hover:border-primary/30 transition-all text-left cursor-pointer"
              >
                <div className={`h-9 w-9 rounded-full bg-muted flex items-center justify-center ${a.accent}`}>
                  <a.icon className="h-4 w-4" />
                </div>
                <span className="text-sm font-medium">{a.label}</span>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {kpis.map((k) => (
          <Card key={k.label}>
            <CardContent className="p-5">
              <div className="flex items-start justify-between mb-2">
                <p className="text-xs text-muted-foreground">{k.label}</p>
                <div className={`h-8 w-8 rounded-full flex items-center justify-center ${k.accent}`}>
                  <k.icon className="h-4 w-4" />
                </div>
              </div>
              <p className="text-xl font-display font-semibold tracking-tight">{k.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Fluxo de Caixa</CardTitle>
          <p className="text-xs text-muted-foreground">Receita vs Despesa por mês</p>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={monthlySeries} margin={{ top: 5, right: 8, left: -10, bottom: 0 }}>
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
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="receita" fill="var(--success)" radius={[6, 6, 0, 0]} name="Receita" />
              <Bar dataKey="despesas" fill="var(--destructive)" radius={[6, 6, 0, 0]} name="Despesas" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Transações Recentes</CardTitle>
            <Link to="/financial/transactions" className="text-xs text-primary hover:underline">
              Ver todas →
            </Link>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-border">
              {recent.map((t) => (
                <div key={t.id} className="flex items-center gap-3 px-6 py-3">
                  <div
                    className={`h-9 w-9 rounded-full flex items-center justify-center shrink-0 ${t.type === "income" ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"
                      }`}
                  >
                    {t.type === "income" ? (
                      <ArrowUpCircle className="h-4 w-4" />
                    ) : (
                      <ArrowDownCircle className="h-4 w-4" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{t.description}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      {t.related} · {fmtDate(t.transaction_date)}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div
                      className={`font-semibold text-sm ${t.type === "income" ? "text-success" : "text-destructive"
                        }`}
                    >
                      {t.type === "income" ? "+" : "-"} {brl(t.amount)}
                    </div>
                    <div className="mt-1">
                      <StatusBadge kind="transaction" value={t.status} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Ações Rápidas</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {quickActions.map((a) => (
              <button
                key={a.label}
                onClick={() => setAction(a.kind)}
                className="w-full flex items-center gap-3 p-3 rounded-lg border border-border hover:bg-muted/40 hover:border-primary/30 transition-all text-left"
              >
                <div className={`h-9 w-9 rounded-full bg-muted flex items-center justify-center ${a.accent}`}>
                  <a.icon className="h-4 w-4" />
                </div>
                <span className="text-sm font-medium">{a.label}</span>
              </button>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Transações Recentes</CardTitle>
          <Link to="/financial/transactions" className="text-xs text-primary hover:underline">
            Ver todas →
          </Link>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y divide-border">
            {recent.map((t) => (
              <div key={t.id} className="flex items-center gap-3 px-6 py-3">
                <div
                  className={`h-9 w-9 rounded-full flex items-center justify-center shrink-0 ${t.type === "income" ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"}`}
                >
                  {t.type === "income" ? <ArrowUpCircle className="h-4 w-4" /> : <ArrowDownCircle className="h-4 w-4" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{t.description}</div>
                  <div className="text-xs text-muted-foreground truncate">{t.related} · {fmtDate(t.transaction_date)}</div>
                </div>
                <div className="text-right shrink-0">
                  <div className={`font-semibold text-sm ${t.type === "income" ? "text-success" : "text-destructive"}`}>
                    {t.type === "income" ? "+" : "-"} {brl(t.amount)}
                  </div>
                  <div className="mt-1"><StatusBadge kind="transaction" value={t.status} /></div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <FinancialActionDialog kind={action} onOpenChange={setAction} />
    </div>
  );
}
