import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowDownCircle,
  ArrowLeft,
  ArrowUpCircle,
  Calendar,
  CheckCircle2,
  Clock,
  Link2,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/shared/components/ui/button";
import { Card, CardContent } from "@/shared/components/ui/card";
import { StatusBadge } from "@/shared/components/status-badge";
import { ConfirmActionDialog } from "@/shared/components/confirm-action-dialog";
import { brl, fmtDate } from "@/shared/lib/format";
import {
  financialTransactionKeys,
  getFinancialTransactionById,
  markFinancialTransactionPaid,
} from "@/modules/financial/services/transactions";

export const Route = createFileRoute("/_app/financial/transactions/$id")({
  head: () => ({ meta: [{ title: "Transação | GaragemERP" }] }),
  component: TransactionDetail,
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
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const transactionId = Number(id);
  const [confirmPaidOpen, setConfirmPaidOpen] = useState(false);
  const {
    data: t,
    isLoading,
    error,
  } = useQuery({
    queryKey: financialTransactionKeys.detail(transactionId),
    queryFn: () => getFinancialTransactionById(transactionId),
    enabled: Number.isFinite(transactionId),
  });

  const markPaidMutation = useMutation({
    mutationFn: markFinancialTransactionPaid,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: financialTransactionKeys.all });
      await queryClient.invalidateQueries({
        queryKey: financialTransactionKeys.detail(transactionId),
      });
      setConfirmPaidOpen(false);
      toast.success("Transação marcada como paga");
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Falha ao marcar transação como paga.");
    },
  });

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto py-16 text-sm text-muted-foreground">
        Carregando transação...
      </div>
    );
  }

  if (error || !t) {
    return (
      <div className="max-w-2xl mx-auto text-center py-20">
        <h2 className="font-display text-xl mb-2">Transação não encontrada</h2>
        <Button onClick={() => navigate({ to: "/financial/transactions" })}>Voltar</Button>
      </div>
    );
  }

  const isIncome = t.type === "income";
  const canMarkPaid = t.status === "pending" || t.status === "overdue";

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/financial/transactions">
            <ArrowLeft className="h-4 w-4" /> Transações
          </Link>
        </Button>
        <h1 className="font-display text-2xl font-semibold tracking-tight flex-1">
          Transação #{t.id}
        </h1>
        <StatusBadge kind="transaction" value={t.status} />
        {canMarkPaid && (
          <Button
            onClick={() => setConfirmPaidOpen(true)}
            disabled={markPaidMutation.isPending}
          >
            <CheckCircle2 className="h-4 w-4" /> Marcar como paga
          </Button>
        )}
      </div>

      <Card>
        <CardContent className="p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center">
            <div
              className={`h-14 w-14 rounded-full flex items-center justify-center ${
                isIncome ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"
              }`}
            >
              {isIncome ? (
                <ArrowUpCircle className="h-7 w-7" />
              ) : (
                <ArrowDownCircle className="h-7 w-7" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">
                {categoryLabel[t.category]}
              </div>
              <div className="font-display font-semibold text-lg">{t.description}</div>
              <div className="text-sm text-muted-foreground">{t.related ?? "-"}</div>
            </div>
            <div
              className={`font-display text-3xl font-semibold ${
                isIncome ? "text-success" : "text-destructive"
              }`}
            >
              {isIncome ? "+" : "-"} {brl(t.amount)}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <InfoCard icon={Calendar} label="Data lançamento" value={fmtDate(t.transaction_date)} />
        <InfoCard icon={Clock} label="Vencimento" value={t.due_date ? fmtDate(t.due_date) : "-"} />
        <InfoCard icon={CheckCircle2} label="Pago em" value={t.paid_at ? fmtDate(t.paid_at) : "-"} />
      </div>

      {(t.sale_id || t.purchase_id || t.employee_id || t.commission_id) && (
        <Card>
          <CardContent className="p-6 space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Link2 className="h-4 w-4" /> Vínculos
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              {t.sale_id && (
                <LinkedRecord label="Venda" to="/sales/$id" id={t.sale_id} />
              )}
              {t.purchase_id && (
                <LinkedRecord label="Compra" to="/purchases/$id" id={t.purchase_id} />
              )}
              {t.employee_id && (
                <LinkedRecord label="Funcionário" to="/employees/$id" id={t.employee_id} />
              )}
              {t.commission_id && <PlainRecord label="Comissão" id={t.commission_id} />}
            </div>
          </CardContent>
        </Card>
      )}

      <ConfirmActionDialog
        open={confirmPaidOpen}
        onOpenChange={setConfirmPaidOpen}
        title="Marcar transação como paga?"
        description="A transação será baixada com a data atual e continuará preservada no histórico financeiro."
        confirmLabel={markPaidMutation.isPending ? "Marcando..." : "Marcar como paga"}
        confirmDisabled={markPaidMutation.isPending}
        confirmVariant="default"
        onConfirm={() => markPaidMutation.mutate(t.id)}
      />
    </div>
  );
}

function InfoCard({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Calendar;
  label: string;
  value: string;
}) {
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

function LinkedRecord({
  label,
  to,
  id,
}: {
  label: string;
  to: "/sales/$id" | "/purchases/$id" | "/employees/$id";
  id: number;
}) {
  return (
    <Button variant="outline" size="sm" asChild>
      <Link to={to} params={{ id: String(id) }}>
        {label} #{id}
      </Link>
    </Button>
  );
}

function PlainRecord({ label, id }: { label: string; id: number }) {
  return (
    <div className="flex h-9 items-center rounded-md border border-border px-3 text-sm">
      {label} #{id}
    </div>
  );
}
