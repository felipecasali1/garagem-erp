import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { ArrowLeft, ArrowDownCircle, ArrowUpCircle, Calendar, CheckCircle2, Clock } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { Card, CardContent } from "@/shared/components/ui/card";
import { StatusBadge } from "@/shared/components/status-badge";
import { brl, fmtDate } from "@/shared/lib/format";
import { transactions } from "@/shared/mock-data";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/financial/transactions/$id")({
  head: () => ({ meta: [{ title: "Transação | GaragemERP" }] }),
  component: TransactionDetail,
  notFoundComponent: () => (
    <div className="text-center py-16">
      <p className="text-muted-foreground">Transação não encontrada.</p>
      <Button asChild className="mt-4"><Link to="/financial/transactions">Voltar</Link></Button>
    </div>
  ),
  errorComponent: ({ error }) => <div className="p-8 text-destructive">{error.message}</div>,
  loader: ({ params }) => {
    const t = transactions.find((tr) => tr.id === Number(params.id));
    if (!t) throw notFound();
    return { transaction: t };
  },
});

const categoryLabel: Record<string, string> = {
  vehicle_sale: "Venda de Veículo",
  vehicle_purchase: "Compra de Veículo",
  salary: "Salário",
  commission: "Comissão",
  fixed_cost: "Custo Fixo",
  other: "Outros",
};

function TransactionDetail() {
  const { transaction: t } = Route.useLoaderData();
  const isIncome = t.type === "income";

  // Synthetic installments for demo when amount > 50k and pending
  const installments =
    t.status === "pending" && t.amount > 50000
      ? Array.from({ length: 4 }, (_, i) => {
        const amount = t.amount / 4;
        const [y, m, d] = t.transaction_date.split("-").map(Number);
        const dueMonth = m + i;
        const dueDate = `${y + Math.floor((dueMonth - 1) / 12)}-${String(((dueMonth - 1) % 12) + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
        return {
          number: i + 1,
          amount,
          due_date: dueDate,
          status: i === 0 ? ("paid" as const) : ("pending" as const),
        };
      })
      : [];

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/financial/transactions">
            <ArrowLeft className="h-4 w-4" /> Transações
          </Link>
        </Button>
        <h1 className="font-display text-2xl font-semibold tracking-tight flex-1">
          Transação #{t.id}
        </h1>
        <StatusBadge kind="transaction" value={t.status} />
      </div>

      <Card>
        <CardContent className="p-6">
          <div className="flex items-center gap-4">
            <div className={`h-14 w-14 rounded-full flex items-center justify-center ${isIncome ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"}`}>
              {isIncome ? <ArrowUpCircle className="h-7 w-7" /> : <ArrowDownCircle className="h-7 w-7" />}
            </div>
            <div className="flex-1">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">{categoryLabel[t.category]}</div>
              <div className="font-display font-semibold text-lg">{t.description}</div>
              <div className="text-sm text-muted-foreground">{t.related}</div>
            </div>
            <div className={`text-right font-display text-3xl font-semibold ${isIncome ? "text-success" : "text-destructive"}`}>
              {isIncome ? "+" : "-"} {brl(t.amount)}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <InfoCard icon={Calendar} label="Data lançamento" value={fmtDate(t.transaction_date)} />
        <InfoCard icon={Clock} label="Vencimento" value={t.due_date ? fmtDate(t.due_date) : "-"} />
        <InfoCard
          icon={CheckCircle2}
          label="Pago em"
          value={t.status === "paid" ? fmtDate(t.transaction_date) : "-"}
        />
      </div>

      {installments.length > 0 && (
        <Card>
          <CardContent className="p-0">
            <div className="px-6 py-4 border-b border-border">
              <h3 className="font-display font-semibold">Parcelamento</h3>
              <p className="text-xs text-muted-foreground">{installments.length} parcelas</p>
            </div>
            <div className="divide-y divide-border">
              {installments.map((inst) => (
                <div key={inst.number} className="flex items-center gap-4 px-6 py-3">
                  <div className="font-mono text-xs text-muted-foreground w-12">
                    {inst.number}/{installments.length}
                  </div>
                  <div className="flex-1 text-sm">
                    Vence em <span className="font-medium">{fmtDate(inst.due_date)}</span>
                  </div>
                  <div className="font-semibold w-32 text-right">{brl(inst.amount)}</div>
                  <StatusBadge kind="transaction" value={inst.status} />
                  {inst.status === "pending" && (
                    <Button size="sm" variant="outline" onClick={() => toast.success(`Parcela ${inst.number} marcada como paga`)}>
                      Marcar paga
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => toast.info("Exportar em breve")}>Exportar</Button>
        {t.status !== "paid" && (
          <Button onClick={() => toast.success("Transação marcada como paga")}>
            <CheckCircle2 className="h-4 w-4" /> Marcar como paga
          </Button>
        )}
      </div>
    </div>
  );
}

function InfoCard({ icon: Icon, label, value }: { icon: typeof Calendar; label: string; value: string }) {
  return (
    <Card>
      <CardContent className="p-4 flex items-center gap-3">
        <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center text-muted-foreground">
          <Icon className="h-4 w-4" />
        </div>
        <div>
          <div className="text-xs text-muted-foreground">{label}</div>
          <div className="font-medium">{value}</div>
        </div>
      </CardContent>
    </Card>
  );
}
