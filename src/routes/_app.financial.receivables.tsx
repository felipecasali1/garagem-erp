import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Filter,
  HandCoins,
  Search,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { toast } from "sonner";
import { PageHeader } from "@/shared/components/layout/page-header";
import { Card, CardContent } from "@/shared/components/ui/card";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Badge } from "@/shared/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/components/ui/table";
import { StatusBadge } from "@/shared/components/status-badge";
import { ConfirmActionDialog } from "@/shared/components/confirm-action-dialog";
import { brl, fmtDate } from "@/shared/lib/format";
import {
  financialTransactionKeys,
  listFinancialTransactions,
  markFinancialTransactionPaid,
  type FinancialTransactionWithLinks,
} from "@/modules/financial/services/transactions";

export const Route = createFileRoute("/_app/financial/receivables")({
  head: () => ({ meta: [{ title: "Contas a Receber | GaragemERP" }] }),
  component: ReceivablesPage,
});

const categoryLabel: Record<string, string> = {
  vehicle_sale: "Venda de Veículo",
  other: "Outros",
};

function ReceivablesPage() {
  const queryClient = useQueryClient();
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [confirmPaidId, setConfirmPaidId] = useState<number | null>(null);
  const {
    data: transactions = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: financialTransactionKeys.all,
    queryFn: listFinancialTransactions,
  });

  const receiveMutation = useMutation({
    mutationFn: markFinancialTransactionPaid,
    onSuccess: async (id) => {
      await queryClient.invalidateQueries({ queryKey: financialTransactionKeys.all });
      await queryClient.invalidateQueries({ queryKey: financialTransactionKeys.detail(id) });
      setConfirmPaidId(null);
      toast.success("Conta marcada como recebida");
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Falha ao marcar conta como recebida.");
    },
  });

  const receivables = useMemo(
    () =>
      transactions
        .filter((transaction) => transaction.type === "income")
        .sort((a, b) => {
          const aDate = a.due_date ?? a.transaction_date;
          const bDate = b.due_date ?? b.transaction_date;
          return aDate.localeCompare(bDate);
        }),
    [transactions],
  );

  const filtered = useMemo(() => {
    return receivables.filter((transaction) => {
      if (statusFilter !== "all" && transaction.status !== statusFilter) return false;
      if (categoryFilter !== "all" && transaction.category !== categoryFilter) return false;
      if (
        query &&
        !`${transaction.description} ${transaction.related ?? ""}`
          .toLowerCase()
          .includes(query.toLowerCase())
      ) {
        return false;
      }
      return true;
    });
  }, [categoryFilter, query, receivables, statusFilter]);

  const totalPending = receivables
    .filter((receivable) => receivable.status === "pending")
    .reduce((sum, receivable) => sum + receivable.amount, 0);
  const totalOverdue = receivables
    .filter((receivable) => receivable.status === "overdue")
    .reduce((sum, receivable) => sum + receivable.amount, 0);
  const totalPaid = receivables
    .filter((receivable) => receivable.status === "paid")
    .reduce((sum, receivable) => sum + receivable.amount, 0);

  const pieData = [
    { name: "A receber", value: totalPending, color: "var(--warning)" },
    { name: "Vencidas", value: totalOverdue, color: "var(--destructive)" },
    { name: "Recebidas", value: totalPaid, color: "var(--success)" },
  ].filter((entry) => entry.value > 0);
  const confirmPaidReceivable = receivables.find((receivable) => receivable.id === confirmPaidId);

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto">
      <PageHeader
        title="Contas a Receber"
        description="Acompanhe recebimentos, repasses e receitas pendentes"
        action={
          <Button asChild variant="outline">
            <Link to="/financial">
              <Wallet className="h-4 w-4" /> Visão geral
            </Link>
          </Button>
        }
      />

      {error && (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="p-4 text-sm text-destructive">
            Falha ao carregar contas: {error instanceof Error ? error.message : "erro desconhecido"}
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KpiCard
          label="Vencidas"
          value={isLoading ? "..." : brl(totalOverdue)}
          accent="text-destructive bg-destructive/10"
          icon={AlertCircle}
          sub={`${receivables.filter((receivable) => receivable.status === "overdue").length} contas`}
        />
        <KpiCard
          label="A Receber"
          value={isLoading ? "..." : brl(totalPending)}
          accent="text-warning bg-warning/10"
          icon={Clock}
          sub={`${receivables.filter((receivable) => receivable.status === "pending").length} contas`}
        />
        <KpiCard
          label="Recebidas"
          value={isLoading ? "..." : brl(totalPaid)}
          accent="text-success bg-success/10"
          icon={CheckCircle2}
          sub={`${receivables.filter((receivable) => receivable.status === "paid").length} contas`}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardContent className="p-4 space-y-4">
            <div className="flex flex-col md:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar conta..."
                  className="pl-9"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="md:w-44">
                  <Filter className="h-3.5 w-3.5" />
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos status</SelectItem>
                  <SelectItem value="pending">A receber</SelectItem>
                  <SelectItem value="overdue">Vencidas</SelectItem>
                  <SelectItem value="paid">Recebidas</SelectItem>
                  <SelectItem value="canceled">Canceladas</SelectItem>
                </SelectContent>
              </Select>
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="md:w-48">
                  <SelectValue placeholder="Categoria" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas categorias</SelectItem>
                  {Object.entries(categoryLabel).map(([key, value]) => (
                    <SelectItem key={key} value={key}>
                      {value}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Descrição</TableHead>
                  <TableHead>Categoria</TableHead>
                  <TableHead>Vencimento</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                      Carregando contas...
                    </TableCell>
                  </TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                      <HandCoins className="h-8 w-8 mx-auto mb-2 opacity-40" />
                      Nenhuma conta encontrada com esses filtros
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((receivable) => (
                    <ReceivableRow
                      key={receivable.id}
                      receivable={receivable}
                      onMarkPaid={() => setConfirmPaidId(receivable.id)}
                    />
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <h3 className="font-display font-semibold mb-1">Distribuição</h3>
            <p className="text-xs text-muted-foreground mb-4">Receitas por status</p>
            {pieData.length > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie
                    data={pieData}
                    dataKey="value"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={3}
                    stroke="none"
                  >
                    {pieData.map((entry) => (
                      <Cell key={entry.name} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "var(--popover)",
                      border: "1px solid var(--border)",
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                    formatter={(value) => brl(Number(value))}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="text-sm text-muted-foreground text-center py-10">Nenhuma conta</div>
            )}
            <div className="space-y-2 mt-4">
              {pieData.map((entry) => (
                <div key={entry.name} className="flex items-center gap-2 text-sm">
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ background: entry.color }}
                  />
                  <span className="text-muted-foreground flex-1">{entry.name}</span>
                  <span className="font-medium">{brl(entry.value)}</span>
                </div>
              ))}
            </div>

            <div className="border-t border-border pt-4 mt-6">
              <h4 className="text-sm font-medium mb-3">Recebimentos recentes</h4>
              <div className="space-y-2 text-sm">
                {receivables
                  .filter((receivable) => receivable.status === "paid")
                  .slice(0, 4)
                  .map((receivable) => (
                    <div key={receivable.id} className="flex items-center gap-2">
                      <CheckCircle2 className="h-3.5 w-3.5 text-success shrink-0" />
                      <span className="flex-1 truncate text-muted-foreground">
                        {receivable.description}
                      </span>
                      <span className="text-xs">{brl(receivable.amount)}</span>
                    </div>
                  ))}
                {receivables.filter((receivable) => receivable.status === "paid").length === 0 && (
                  <div className="text-xs text-muted-foreground">Nenhum recebimento registrado</div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <ConfirmActionDialog
        open={confirmPaidId != null}
        onOpenChange={(open) => {
          if (!open) setConfirmPaidId(null);
        }}
        title="Marcar conta como recebida?"
        description={
          confirmPaidReceivable
            ? `A conta "${confirmPaidReceivable.description}" será baixada com a data atual.`
            : "A conta será baixada com a data atual."
        }
        confirmLabel={receiveMutation.isPending ? "Recebendo..." : "Marcar como recebida"}
        confirmDisabled={receiveMutation.isPending}
        confirmVariant="default"
        onConfirm={() => {
          if (confirmPaidId != null) receiveMutation.mutate(confirmPaidId);
        }}
      />
    </div>
  );
}

function ReceivableRow({
  receivable,
  onMarkPaid,
}: {
  receivable: FinancialTransactionWithLinks;
  onMarkPaid: () => void;
}) {
  const canMarkPaid = receivable.status === "pending" || receivable.status === "overdue";

  return (
    <TableRow>
      <TableCell>
        <Link
          to="/financial/transactions/$id"
          params={{ id: String(receivable.id) }}
          className="font-medium hover:text-primary"
        >
          {receivable.description}
        </Link>
        <div className="text-xs text-muted-foreground">{receivable.related ?? "-"}</div>
      </TableCell>
      <TableCell>
        <Badge variant="outline">
          {categoryLabel[receivable.category] ?? receivable.category}
        </Badge>
      </TableCell>
      <TableCell className="text-sm text-muted-foreground">
        {receivable.due_date ? fmtDate(receivable.due_date) : fmtDate(receivable.transaction_date)}
      </TableCell>
      <TableCell>
        <StatusBadge kind="transaction" value={receivable.status} />
      </TableCell>
      <TableCell className="text-right font-semibold">{brl(receivable.amount)}</TableCell>
      <TableCell className="text-right">
        {canMarkPaid ? (
          <Button size="sm" variant="outline" onClick={onMarkPaid}>
            <CheckCircle2 className="h-3.5 w-3.5" /> Receber
          </Button>
        ) : receivable.status === "paid" ? (
          <span className="text-xs text-muted-foreground">Recebida</span>
        ) : (
          <span className="text-xs text-muted-foreground">-</span>
        )}
      </TableCell>
    </TableRow>
  );
}

function KpiCard({
  label,
  value,
  accent,
  icon: Icon,
  sub,
}: {
  label: string;
  value: string;
  accent: string;
  icon: typeof TrendingUp;
  sub: string;
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start justify-between mb-2">
          <p className="text-xs text-muted-foreground">{label}</p>
          <div className={`h-8 w-8 rounded-full flex items-center justify-center ${accent}`}>
            <Icon className="h-4 w-4" />
          </div>
        </div>
        <p className="text-2xl font-display font-semibold tracking-tight">{value}</p>
        <p className="text-xs text-muted-foreground mt-1">{sub}</p>
      </CardContent>
    </Card>
  );
}
