import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowDownCircle, ArrowUpCircle } from "lucide-react";
import { PageHeader } from "@/shared/components/layout/page-header";
import { Card, CardContent } from "@/shared/components/ui/card";
import { StatusBadge } from "@/shared/components/status-badge";
import { brl, fmtDate } from "@/shared/lib/format";
import { transactions } from "@/shared/mock-data";

export const Route = createFileRoute("/_app/financial/transactions/")({
  head: () => ({ meta: [{ title: "Transações | GaragemERP" }] }),
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
  // group by date
  const grouped = transactions.reduce<Record<string, typeof transactions>>((acc, t) => {
    (acc[t.transaction_date] ||= []).push(t);
    return acc;
  }, {});
  const dates = Object.keys(grouped).sort((a, b) => b.localeCompare(a));

  return (
    <div className="max-w-[1400px] mx-auto">
      <PageHeader title="Transações" description={`${transactions.length} lançamentos`} />

      <Card>
        <CardContent className="p-0">
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
                      className={`h-10 w-10 rounded-full flex items-center justify-center shrink-0 ${t.type === "income" ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"
                        }`}
                    >
                      {t.type === "income" ? <ArrowUpCircle className="h-5 w-5" /> : <ArrowDownCircle className="h-5 w-5" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium">{t.description}</div>
                      <div className="text-xs text-muted-foreground">
                        {categoryLabel[t.category]} · {t.related}
                      </div>
                    </div>
                    <StatusBadge kind="transaction" value={t.status} />
                    <div
                      className={`text-right font-display font-semibold w-32 ${t.type === "income" ? "text-success" : "text-destructive"
                        }`}
                    >
                      {t.type === "income" ? "+" : "-"} {brl(t.amount)}
                    </div>
                  </Link>
                ))}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
