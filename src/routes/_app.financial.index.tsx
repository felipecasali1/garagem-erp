import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import {
  AlertCircle,
  ArrowDownCircle,
  ArrowUpCircle,
  Banknote,
  Home,
  Minus,
  Plus,
  TrendingDown,
  TrendingUp,
  UserCheck,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  FinancialActionDialog,
  type QuickActionKind,
} from "@/modules/financial/components/quick-actions-dialog";
import {
  financialTransactionKeys,
  listFinancialTransactions,
  type FinancialTransactionWithLinks,
} from "@/modules/financial/services/transactions";
import { PageHeader } from "@/shared/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { StatusBadge } from "@/shared/components/status-badge";
import { brl, fmtDate } from "@/shared/lib/format";

export const Route = createFileRoute("/_app/financial/")({
  head: () => ({ meta: [{ title: "Financeiro | GaragemERP" }] }),
  component: FinancialPage,
});

const quickActions: {
  kind: Exclude<QuickActionKind, null>;
  label: string;
  icon: typeof Plus;
  accent: string;
}[] = [
  { kind: "income", label: "Registrar Receita", icon: Plus, accent: "text-success" },
  { kind: "expense", label: "Registrar Despesa", icon: Minus, accent: "text-destructive" },
  { kind: "fixed_cost", label: "Registrar Custo Fixo", icon: Home, accent: "text-warning" },
  { kind: "salary", label: "Pagar Salário", icon: UserCheck, accent: "text-info" },
];

function monthKey(date: string) {
  return date.slice(0, 7);
}

function monthLabel(key: string) {
  const [year, month] = key.split("-").map(Number);
  return new Intl.DateTimeFormat("pt-BR", { month: "short" }).format(
    new Date(year, month - 1, 1),
  );
}

function isCurrentMonth(date: string) {
  const now = new Date();
  const currentKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  return monthKey(date) === currentKey;
}

function buildMonthlySeries(transactions: FinancialTransactionWithLinks[]) {
  const now = new Date();
  const months = Array.from({ length: 6 }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth() - (5 - index), 1);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    return { key, month: monthLabel(key), receita: 0, despesas: 0 };
  });
  const byKey = new Map(months.map((entry) => [entry.key, entry]));

  for (const transaction of transactions) {
    const entry = byKey.get(monthKey(transaction.transaction_date));
    if (!entry || transaction.status === "canceled") continue;
    if (transaction.type === "income") {
      entry.receita += transaction.amount;
    } else {
      entry.despesas += transaction.amount;
    }
  }

  return months;
}

function FinancialPage() {
  const [action, setAction] = useState<QuickActionKind>(null);
  const {
    data: transactions = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: financialTransactionKeys.all,
    queryFn: listFinancialTransactions,
  });

  const activeTransactions = transactions.filter((transaction) => transaction.status !== "canceled");
  const currentMonthTransactions = activeTransactions.filter((transaction) =>
    isCurrentMonth(transaction.transaction_date),
  );
  const paidRevenue = currentMonthTransactions
    .filter((transaction) => transaction.type === "income" && transaction.status === "paid")
    .reduce((sum, transaction) => sum + transaction.amount, 0);
  const paidExpenses = currentMonthTransactions
    .filter((transaction) => transaction.type === "expense" && transaction.status === "paid")
    .reduce((sum, transaction) => sum + transaction.amount, 0);
  const pendingReceivables = activeTransactions
    .filter(
      (transaction) =>
        transaction.type === "income" &&
        (transaction.status === "pending" || transaction.status === "overdue"),
    )
    .reduce((sum, transaction) => sum + transaction.amount, 0);
  const pendingPayables = activeTransactions
    .filter(
      (transaction) =>
        transaction.type === "expense" &&
        (transaction.status === "pending" || transaction.status === "overdue"),
    )
    .reduce((sum, transaction) => sum + transaction.amount, 0);
  const kpis = [
    {
      label: "Receita Recebida",
      value: brl(paidRevenue),
      icon: TrendingUp,
      accent: "text-success bg-success/10",
    },
    {
      label: "Despesas Pagas",
      value: brl(paidExpenses),
      icon: TrendingDown,
      accent: "text-destructive bg-destructive/10",
    },
    {
      label: "Resultado do Mês",
      value: brl(paidRevenue - paidExpenses),
      icon: Banknote,
      accent: "text-info bg-info/10",
    },
    {
      label: "A Receber",
      value: brl(pendingReceivables),
      icon: ArrowUpCircle,
      accent: "text-warning bg-warning/10",
    },
    {
      label: "A Pagar",
      value: brl(pendingPayables),
      icon: AlertCircle,
      accent: "text-destructive bg-destructive/10",
    },
  ];
  const monthlySeries = buildMonthlySeries(activeTransactions);
  const recent = [...transactions].slice(0, 8);

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto">
      <PageHeader
        title="Financeiro"
        description="Controle de receitas, despesas e fluxo de caixa."
      />

      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="font-display font-semibold text-sm">Ações Rápidas</h3>
              <p className="text-xs text-muted-foreground">
                Lance receitas, despesas e pagamentos
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Link to="/financial/receivables" className="text-xs text-primary hover:underline">
                Contas a receber
              </Link>
              <Link to="/financial/bills" className="text-xs text-primary hover:underline">
                Contas a pagar
              </Link>
            </div>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
            {quickActions.map((quickAction) => (
              <button
                key={quickAction.label}
                onClick={() => setAction(quickAction.kind)}
                className="flex items-center gap-3 p-3 rounded-lg border border-border hover:bg-muted/40 hover:border-primary/30 transition-all text-left cursor-pointer"
              >
                <div
                  className={`h-9 w-9 rounded-full bg-muted flex items-center justify-center ${quickAction.accent}`}
                >
                  <quickAction.icon className="h-4 w-4" />
                </div>
                <span className="text-sm font-medium">{quickAction.label}</span>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {error && (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="p-4 text-sm text-destructive">
            Falha ao carregar financeiro:{" "}
            {error instanceof Error ? error.message : "erro desconhecido"}
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {kpis.map((kpi) => (
          <Card key={kpi.label}>
            <CardContent className="p-5">
              <div className="flex items-start justify-between mb-2">
                <p className="text-xs text-muted-foreground">{kpi.label}</p>
                <div
                  className={`h-8 w-8 rounded-full flex items-center justify-center ${kpi.accent}`}
                >
                  <kpi.icon className="h-4 w-4" />
                </div>
              </div>
              <p className="text-xl font-display font-semibold tracking-tight">
                {isLoading ? "..." : kpi.value}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Fluxo de Caixa</CardTitle>
          <p className="text-xs text-muted-foreground">Receita vs despesa por mês</p>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={monthlySeries} margin={{ top: 5, right: 8, left: -10, bottom: 0 }}>
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
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="receita" fill="var(--success)" radius={[6, 6, 0, 0]} name="Receita" />
              <Bar
                dataKey="despesas"
                fill="var(--destructive)"
                radius={[6, 6, 0, 0]}
                name="Despesas"
              />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Transações Recentes</CardTitle>
          <Link to="/financial/transactions" className="text-xs text-primary hover:underline">
            Ver todas
          </Link>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 text-sm text-muted-foreground">Carregando transações...</div>
          ) : recent.length === 0 ? (
            <div className="p-6 text-sm text-muted-foreground">
              Nenhuma transação financeira registrada ainda.
            </div>
          ) : (
            <div className="divide-y divide-border">
              {recent.map((transaction) => (
                <Link
                  key={transaction.id}
                  to="/financial/transactions/$id"
                  params={{ id: String(transaction.id) }}
                  className="flex items-center gap-3 px-6 py-3 hover:bg-muted/30 transition-colors"
                >
                  <div
                    className={`h-9 w-9 rounded-full flex items-center justify-center shrink-0 ${
                      transaction.type === "income"
                        ? "bg-success/10 text-success"
                        : "bg-destructive/10 text-destructive"
                    }`}
                  >
                    {transaction.type === "income" ? (
                      <ArrowUpCircle className="h-4 w-4" />
                    ) : (
                      <ArrowDownCircle className="h-4 w-4" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{transaction.description}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      {transaction.related ?? "-"} · {fmtDate(transaction.transaction_date)}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div
                      className={`font-semibold text-sm ${
                        transaction.type === "income" ? "text-success" : "text-destructive"
                      }`}
                    >
                      {transaction.type === "income" ? "+" : "-"} {brl(transaction.amount)}
                    </div>
                    <div className="mt-1">
                      <StatusBadge kind="transaction" value={transaction.status} />
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <FinancialActionDialog kind={action} onOpenChange={setAction} />
    </div>
  );
}
