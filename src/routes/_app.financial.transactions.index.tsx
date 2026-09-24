import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { ArrowDownCircle, ArrowUpCircle } from "lucide-react";
import { PageHeader } from "@/shared/components/layout/page-header";
import { Card, CardContent } from "@/shared/components/ui/card";
import { StatusBadge } from "@/shared/components/status-badge";
import { brl, fmtDate } from "@/shared/lib/format";
import {
  financialTransactionKeys,
  listFinancialTransactions,
  type FinancialTransactionWithLinks,
} from "@/modules/financial/services/transactions";
import { isFinancialAlertTransaction } from "@/modules/alerts/lib/build-operational-alerts";
import { useOperationalDate } from "@/modules/alerts/hooks/use-operational-date";

export const Route = createFileRoute("/_app/financial/transactions/")({
  head: () => ({ meta: [{ title: "Transações | GaragemERP" }] }),
  validateSearch: (search: { alert?: unknown }): { alert?: "overdue" } => ({
    alert: search.alert === "overdue" ? "overdue" : undefined,
  }),
  component: TransactionsPage,
});

const categoryLabel: Record<string, string> = {
  vehicle_sale: "Venda de Veículo",
  vehicle_purchase: "Compra de Veículo",
  salary: "Salário",
  commission: "Comissão",
  fixed_cost: "Custo Fixo",
  other: "Outros",
};

function TransactionsPage() {
  const { alert: alertFilter } = Route.useSearch();
  const today = useOperationalDate();
  const {
    data: transactions = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: financialTransactionKeys.all,
    queryFn: listFinancialTransactions,
  });

  const visibleTransactions = useMemo(
    () =>
      alertFilter === "overdue"
        ? transactions.filter((transaction) =>
            isFinancialAlertTransaction(transaction, today),
          )
        : transactions,
    [alertFilter, today, transactions],
  );

  const grouped = visibleTransactions.reduce<Record<string, FinancialTransactionWithLinks[]>>((acc, t) => {
    (acc[t.transaction_date] ||= []).push(t);
    return acc;
  }, {});
  const dates = Object.keys(grouped).sort((a, b) => b.localeCompare(a));

  return (
    <div className="max-w-[1400px] mx-auto">
      <PageHeader
        title="Transações"
        description={
          isLoading
            ? "Carregando lançamentos..."
            : `${visibleTransactions.length} lançamentos financeiros${alertFilter === "overdue" ? " vencidos" : ""}`
        }
      />

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 text-sm text-muted-foreground">Carregando transações...</div>
          ) : error ? (
            <div className="p-6 text-sm text-destructive">
              Falha ao carregar transações:{" "}
              {error instanceof Error ? error.message : "erro desconhecido"}
            </div>
          ) : visibleTransactions.length === 0 ? (
            <div className="p-6 text-sm text-muted-foreground">
              {alertFilter === "overdue"
                ? "Nenhuma transação financeira vencida encontrada."
                : "Nenhuma transação financeira registrada ainda."}
            </div>
          ) : (
            <div className="divide-y divide-border">
              {dates.map((date) => (
                <div key={date}>
                  <div className="px-6 py-2 bg-muted/40 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    {fmtDate(date)}
                  </div>
                  {grouped[date].map((t) => (
                    <Link
                      key={t.id}
                      to="/financial/transactions/$id"
                      params={{ id: String(t.id) }}
                      className="flex items-center gap-4 px-6 py-4 hover:bg-muted/30 transition-colors"
                    >
                      <div
                        className={`h-10 w-10 rounded-full flex items-center justify-center shrink-0 ${
                          t.type === "income"
                            ? "bg-success/10 text-success"
                            : "bg-destructive/10 text-destructive"
                        }`}
                      >
                        {t.type === "income" ? (
                          <ArrowUpCircle className="h-5 w-5" />
                        ) : (
                          <ArrowDownCircle className="h-5 w-5" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium">{t.description}</div>
                        <div className="text-xs text-muted-foreground">
                          {categoryLabel[t.category]} {t.related ? `· ${t.related}` : ""}
                        </div>
                      </div>
                      <StatusBadge kind="transaction" value={t.status} />
                      <div
                        className={`text-right font-display font-semibold w-32 ${
                          t.type === "income" ? "text-success" : "text-destructive"
                        }`}
                      >
                        {t.type === "income" ? "+" : "-"} {brl(t.amount)}
                      </div>
                    </Link>
                  ))}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
