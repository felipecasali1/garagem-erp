import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  CircleOff,
  Clock,
  Filter,
  Receipt,
  Search,
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
  cancelFinancialTransaction,
  financialTransactionKeys,
  getFinancialTransactionSummary,
  isManualFinancialTransaction,
  listFinancialTransactionsPage,
  listRecentFinancialTransactions,
  markFinancialTransactionPaid,
  type FinancialTransactionWithLinks,
} from "@/modules/financial/services/transactions";
import { ListPagination } from "@/shared/components/list-pagination";
import { DEFAULT_PAGE_SIZE, getPaginationState, normalizePage } from "@/shared/lib/pagination";
import type { TransactionCategory, TransactionStatus } from "@/shared/types/domain";

export const Route = createFileRoute("/_app/financial/bills")({
  head: () => ({ meta: [{ title: "Contas a Pagar | GaragemERP" }] }),
  validateSearch: (search: {
    page?: unknown;
    q?: unknown;
    status?: unknown;
    category?: unknown;
  }): {
    page?: number;
    q?: string;
    status?: TransactionStatus;
    category?: "vehicle_purchase" | "salary" | "commission" | "fixed_cost" | "other";
  } => ({
    page: normalizePage(search.page),
    q: typeof search.q === "string" && search.q.trim() ? search.q.trim() : undefined,
    status: transactionStatuses.includes(search.status as TransactionStatus)
      ? (search.status as TransactionStatus)
      : undefined,
    category: billCategories.includes(search.category as (typeof billCategories)[number])
      ? (search.category as (typeof billCategories)[number])
      : undefined,
  }),
  component: BillsPage,
});

const transactionStatuses: TransactionStatus[] = ["pending", "overdue", "paid", "canceled"];
const billCategories = ["vehicle_purchase", "salary", "commission", "fixed_cost", "other"] as const;

const categoryLabel: Record<string, string> = {
  vehicle_purchase: "Compra de Veículo",
  salary: "Salário",
  commission: "Comissão",
  fixed_cost: "Custo Fixo",
  other: "Outros",
};

function BillsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [confirmPaidId, setConfirmPaidId] = useState<number | null>(null);
  const [confirmCancelId, setConfirmCancelId] = useState<number | null>(null);
  const { page: rawPage, q, status: statusFilter, category: categoryFilter } = Route.useSearch();
  const page = rawPage ?? 1;
  const query = q ?? "";
  const listFilters = {
    page,
    type: "expense" as const,
    search: q,
    status: statusFilter,
    category: categoryFilter as TransactionCategory | undefined,
    order: "dueDate" as const,
  };
  const {
    data: transactionsPage,
    isLoading,
    error,
  } = useQuery({
    queryKey: financialTransactionKeys.list(listFilters),
    queryFn: () => listFinancialTransactionsPage(listFilters),
  });
  const { data: summary, isLoading: isSummaryLoading } = useQuery({
    queryKey: financialTransactionKeys.summary("expense"),
    queryFn: () => getFinancialTransactionSummary("expense"),
  });
  const { data: recentPaid = [] } = useQuery({
    queryKey: financialTransactionKeys.recent("expense"),
    queryFn: () => listRecentFinancialTransactions("expense"),
  });

  const bills = transactionsPage?.data ?? [];
  const total = transactionsPage?.total ?? 0;
  const pageSize = transactionsPage?.pageSize ?? DEFAULT_PAGE_SIZE;
  const { totalPages, displayPage, range } = getPaginationState(page, total, pageSize);
  const hasFilters = Boolean(q || statusFilter || categoryFilter);

  const updateSearch = (next: {
    page: number;
    q?: string;
    status?: TransactionStatus;
    category?: "vehicle_purchase" | "salary" | "commission" | "fixed_cost" | "other";
  }) => {
    void navigate({ to: "/financial/bills", search: () => next });
  };

  useEffect(() => {
    if (!transactionsPage || page <= totalPages) return;
    void navigate({
      to: "/financial/bills",
      replace: true,
      search: () => ({ page: totalPages, q, status: statusFilter, category: categoryFilter }),
    });
  }, [categoryFilter, navigate, page, q, statusFilter, totalPages, transactionsPage]);

  const payMutation = useMutation({
    mutationFn: markFinancialTransactionPaid,
    onSuccess: async (id) => {
      await queryClient.invalidateQueries({ queryKey: financialTransactionKeys.all });
      await queryClient.invalidateQueries({ queryKey: financialTransactionKeys.detail(id) });
      setConfirmPaidId(null);
      toast.success("Conta marcada como paga");
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Falha ao marcar conta como paga.");
    },
  });

  const cancelMutation = useMutation({
    mutationFn: cancelFinancialTransaction,
    onSuccess: async (id) => {
      await queryClient.invalidateQueries({ queryKey: financialTransactionKeys.all });
      await queryClient.invalidateQueries({ queryKey: financialTransactionKeys.detail(id) });
      setConfirmCancelId(null);
      toast.success("Conta cancelada");
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Falha ao cancelar conta.");
    },
  });

  const pieData = [
    { name: "A vencer", value: summary?.pendingAmount ?? 0, color: "var(--warning)" },
    { name: "Vencidas", value: summary?.overdueAmount ?? 0, color: "var(--destructive)" },
    { name: "Pagas", value: summary?.paidAmount ?? 0, color: "var(--success)" },
  ].filter((entry) => entry.value > 0);
  const confirmPaidBill = bills.find((bill) => bill.id === confirmPaidId);
  const confirmCancelBill = bills.find((bill) => bill.id === confirmCancelId);

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto">
      <PageHeader
        title="Contas a Pagar"
        description={
          isLoading
            ? "Carregando contas..."
            : total === 0
              ? "0 contas"
              : `${range.from}–${range.to} de ${total} contas`
        }
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
          value={isSummaryLoading ? "..." : brl(summary?.overdueAmount ?? 0)}
          icon={AlertCircle}
          sub={`${summary?.overdueCount ?? 0} contas`}
        />
        <KpiCard
          label="A Vencer"
          value={isSummaryLoading ? "..." : brl(summary?.pendingAmount ?? 0)}
          icon={Clock}
          sub={`${summary?.pendingCount ?? 0} contas`}
        />
        <KpiCard
          label="Pagas"
          value={isSummaryLoading ? "..." : brl(summary?.paidAmount ?? 0)}
          icon={CheckCircle2}
          sub={`${summary?.paidCount ?? 0} contas`}
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
                  onChange={(event) =>
                    updateSearch({
                      page: 1,
                      q: event.target.value || undefined,
                      status: statusFilter,
                      category: categoryFilter,
                    })
                  }
                />
              </div>
              <Select
                value={statusFilter ?? "all"}
                onValueChange={(value) =>
                  updateSearch({
                    page: 1,
                    q,
                    status: value === "all" ? undefined : (value as TransactionStatus),
                    category: categoryFilter,
                  })
                }
              >
                <SelectTrigger className="md:w-44">
                  <Filter className="h-3.5 w-3.5" />
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos status</SelectItem>
                  <SelectItem value="pending">A vencer</SelectItem>
                  <SelectItem value="overdue">Vencidas</SelectItem>
                  <SelectItem value="paid">Pagas</SelectItem>
                  <SelectItem value="canceled">Canceladas</SelectItem>
                </SelectContent>
              </Select>
              <Select
                value={categoryFilter ?? "all"}
                onValueChange={(value) =>
                  updateSearch({
                    page: 1,
                    q,
                    status: statusFilter,
                    category:
                      value === "all"
                        ? undefined
                        : (value as
                            | "vehicle_purchase"
                            | "salary"
                            | "commission"
                            | "fixed_cost"
                            | "other"),
                  })
                }
              >
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

            <div className="overflow-x-auto">
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
                  ) : bills.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                        <Receipt className="h-8 w-8 mx-auto mb-2 opacity-40" />
                        {hasFilters
                          ? "Nenhuma conta encontrada com esses filtros"
                          : "Nenhuma conta registrada ainda"}
                      </TableCell>
                    </TableRow>
                  ) : (
                    bills.map((bill) => (
                      <BillRow
                        key={bill.id}
                        bill={bill}
                        onMarkPaid={() => setConfirmPaidId(bill.id)}
                        onCancel={() => setConfirmCancelId(bill.id)}
                      />
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
            {!isLoading && !error && total > 0 && (
              <ListPagination
                page={displayPage}
                total={total}
                pageSize={pageSize}
                className="border-t px-0 sm:px-2"
                onPageChange={(nextPage) =>
                  updateSearch({
                    page: nextPage,
                    q,
                    status: statusFilter,
                    category: categoryFilter,
                  })
                }
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <h3 className="font-display font-semibold mb-1">Distribuição</h3>
            <p className="text-xs text-muted-foreground mb-4">Impacto financeiro por status</p>
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
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: entry.color }} />
                  <span className="text-muted-foreground flex-1">{entry.name}</span>
                  <span className="font-medium">{brl(entry.value)}</span>
                </div>
              ))}
            </div>

            <div className="border-t border-border pt-4 mt-6">
              <h4 className="text-sm font-medium mb-3">Pagamentos recentes</h4>
              <div className="space-y-2 text-sm">
                {recentPaid.map((bill) => (
                  <div key={bill.id} className="flex items-center gap-2">
                    <CheckCircle2 className="h-3.5 w-3.5 text-success shrink-0" />
                    <span className="flex-1 truncate text-muted-foreground">
                      {bill.description}
                    </span>
                    <span className="text-xs">{brl(bill.amount)}</span>
                  </div>
                ))}
                {recentPaid.length === 0 && (
                  <div className="text-xs text-muted-foreground">Nenhum pagamento registrado</div>
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
        title="Marcar conta como paga?"
        description={
          confirmPaidBill
            ? `A conta "${confirmPaidBill.description}" será baixada com a data atual.`
            : "A conta será baixada com a data atual."
        }
        confirmLabel={payMutation.isPending ? "Pagando..." : "Marcar como paga"}
        confirmDisabled={payMutation.isPending}
        confirmVariant="default"
        onConfirm={() => {
          if (confirmPaidId != null) payMutation.mutate(confirmPaidId);
        }}
      />

      <ConfirmActionDialog
        open={confirmCancelId != null}
        onOpenChange={(open) => {
          if (!open) setConfirmCancelId(null);
        }}
        title="Cancelar conta?"
        description={
          confirmCancelBill
            ? `A conta "${confirmCancelBill.description}" será preservada no histórico com status cancelado.`
            : "A conta será preservada no histórico com status cancelado."
        }
        confirmLabel={cancelMutation.isPending ? "Cancelando..." : "Cancelar conta"}
        confirmDisabled={cancelMutation.isPending}
        confirmVariant="destructive"
        onConfirm={() => {
          if (confirmCancelId != null) cancelMutation.mutate(confirmCancelId);
        }}
      />
    </div>
  );
}

function BillRow({
  bill,
  onMarkPaid,
  onCancel,
}: {
  bill: FinancialTransactionWithLinks;
  onMarkPaid: () => void;
  onCancel: () => void;
}) {
  const canMarkPaid = bill.status === "pending" || bill.status === "overdue";
  const canCancel = bill.status !== "canceled" && isManualFinancialTransaction(bill);

  return (
    <TableRow>
      <TableCell>
        <Link
          to="/financial/transactions/$id"
          params={{ id: String(bill.id) }}
          className="font-medium hover:text-primary"
        >
          {bill.description}
        </Link>
        <div className="text-xs text-muted-foreground">{bill.related ?? "-"}</div>
      </TableCell>
      <TableCell>
        <Badge variant="outline">{categoryLabel[bill.category] ?? bill.category}</Badge>
      </TableCell>
      <TableCell className="text-sm text-muted-foreground">
        {bill.due_date ? fmtDate(bill.due_date) : fmtDate(bill.transaction_date)}
      </TableCell>
      <TableCell>
        <StatusBadge kind="transaction" value={bill.status} />
      </TableCell>
      <TableCell className="text-right font-semibold">{brl(bill.amount)}</TableCell>
      <TableCell className="text-right">
        <div className="flex justify-end gap-2">
          {canCancel && (
            <Button size="sm" variant="ghost" onClick={onCancel}>
              <CircleOff className="h-3.5 w-3.5" /> Cancelar
            </Button>
          )}
          {canMarkPaid ? (
            <Button size="sm" variant="outline" onClick={onMarkPaid}>
              <CheckCircle2 className="h-3.5 w-3.5" /> Pagar
            </Button>
          ) : bill.status === "paid" ? (
            <span className="text-xs text-muted-foreground">Quitada</span>
          ) : bill.status === "canceled" ? (
            <span className="text-xs text-muted-foreground">Cancelada</span>
          ) : (
            <span className="text-xs text-muted-foreground">-</span>
          )}
        </div>
      </TableCell>
    </TableRow>
  );
}

function KpiCard({
  label,
  value,
  icon: Icon,
  sub,
}: {
  label: string;
  value: string;
  icon: typeof Receipt;
  sub: string;
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start justify-between mb-2">
          <p className="text-xs text-muted-foreground">{label}</p>
          <div className="h-8 w-8 rounded-full flex items-center justify-center bg-muted text-muted-foreground">
            <Icon className="h-4 w-4" />
          </div>
        </div>
        <p className="text-2xl font-display font-semibold tracking-tight">{value}</p>
        <p className="text-xs text-muted-foreground mt-1">{sub}</p>
      </CardContent>
    </Card>
  );
}
