import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Filter,
  Receipt,
  Search,
  Wallet,
} from "lucide-react";
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
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
} from "recharts";
import { transactions } from "@/shared/mock-data";
import { brl, fmtDate } from "@/shared/lib/format";
import { StatusBadge } from "@/shared/components/status-badge";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/financial/bills")({
  head: () => ({ meta: [{ title: "Contas a Pagar | GaragemERP" }] }),
  component: BillsPage,
});

const categoryLabel: Record<string, string> = {
  vehicle_purchase: "Compra de Veículo",
  salary: "Salário",
  commission: "Comissão",
  fixed_cost: "Custo Fixo",
  other: "Outros",
};

function BillsPage() {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [paid, setPaid] = useState<Record<number, boolean>>({});

  const bills = useMemo(
    () =>
      transactions
        .filter((t) => t.type === "expense")
        .map((t) => ({ ...t, status: paid[t.id] ? "paid" : t.status })),
    [paid],
  );

  const filtered = useMemo(() => {
    return bills.filter((t) => {
      if (statusFilter !== "all" && t.status !== statusFilter) return false;
      if (categoryFilter !== "all" && t.category !== categoryFilter) return false;
      if (query && !`${t.description} ${t.related ?? ""}`.toLowerCase().includes(query.toLowerCase()))
        return false;
      return true;
    });
  }, [bills, query, statusFilter, categoryFilter]);

  const totalPending = bills.filter((b) => b.status === "pending").reduce((s, b) => s + b.amount, 0);
  const totalOverdue = bills.filter((b) => b.status === "overdue").reduce((s, b) => s + b.amount, 0);
  const totalPaid = bills.filter((b) => b.status === "paid").reduce((s, b) => s + b.amount, 0);

  const pieData = [
    { name: "A vencer", value: totalPending, color: "var(--warning)" },
    { name: "Vencidas", value: totalOverdue, color: "var(--destructive)" },
    { name: "Pagas", value: totalPaid, color: "var(--success)" },
  ].filter((d) => d.value > 0);

  const markAsPaid = (id: number) => {
    setPaid((s) => ({ ...s, [id]: true }));
    toast.success("Conta marcada como paga");
  };

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto">
      <PageHeader
        title="Contas a Pagar"
        description="Acompanhe vencimentos, status e impacto financeiro"
        action={
          <Button asChild variant="outline">
            <Link to="/financial">
              <Wallet className="h-4 w-4" /> Visão geral
            </Link>
          </Button>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KpiCard label="Vencidas" value={brl(totalOverdue)} accent="text-destructive bg-destructive/10" icon={AlertCircle} sub={`${bills.filter((b) => b.status === "overdue").length} contas`} />
        <KpiCard label="A Vencer" value={brl(totalPending)} accent="text-warning bg-warning/10" icon={Clock} sub={`${bills.filter((b) => b.status === "pending").length} contas`} />
        <KpiCard label="Pagas no período" value={brl(totalPaid)} accent="text-success bg-success/10" icon={CheckCircle2} sub={`${bills.filter((b) => b.status === "paid").length} contas`} />
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
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="md:w-44">
                  <Filter className="h-3.5 w-3.5" />
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos status</SelectItem>
                  <SelectItem value="pending">A vencer</SelectItem>
                  <SelectItem value="overdue">Vencidas</SelectItem>
                  <SelectItem value="paid">Pagas</SelectItem>
                </SelectContent>
              </Select>
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="md:w-48">
                  <SelectValue placeholder="Categoria" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas categorias</SelectItem>
                  {Object.entries(categoryLabel).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
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
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                      <Receipt className="h-8 w-8 mx-auto mb-2 opacity-40" />
                      Nenhuma conta encontrada com esses filtros
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((b) => (
                    <TableRow key={b.id}>
                      <TableCell>
                        <div className="font-medium">{b.description}</div>
                        <div className="text-xs text-muted-foreground">{b.related}</div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{categoryLabel[b.category] ?? b.category}</Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {b.due_date ? fmtDate(b.due_date) : fmtDate(b.transaction_date)}
                      </TableCell>
                      <TableCell>
                        <StatusBadge kind="transaction" value={b.status} />
                      </TableCell>
                      <TableCell className="text-right font-semibold">{brl(b.amount)}</TableCell>
                      <TableCell className="text-right">
                        {b.status !== "paid" ? (
                          <Button size="sm" variant="outline" onClick={() => markAsPaid(b.id)}>
                            <CheckCircle2 className="h-3.5 w-3.5" /> Pagar
                          </Button>
                        ) : (
                          <span className="text-xs text-muted-foreground">Quitada</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <h3 className="font-display font-semibold mb-1">Distribuição</h3>
            <p className="text-xs text-muted-foreground mb-4">Impacto financeiro por status</p>
            {pieData.length > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={pieData} dataKey="value" innerRadius={50} outerRadius={80} paddingAngle={3} stroke="none">
                    {pieData.map((d, i) => (
                      <Cell key={i} fill={d.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "var(--popover)",
                      border: "1px solid var(--border)",
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                    formatter={(v) => brl(Number(v))}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="text-sm text-muted-foreground text-center py-10">Nenhuma conta</div>
            )}
            <div className="space-y-2 mt-4">
              {pieData.map((d) => (
                <div key={d.name} className="flex items-center gap-2 text-sm">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: d.color }} />
                  <span className="text-muted-foreground flex-1">{d.name}</span>
                  <span className="font-medium">{brl(d.value)}</span>
                </div>
              ))}
            </div>

            <div className="border-t border-border pt-4 mt-6">
              <h4 className="text-sm font-medium mb-3">Histórico recente</h4>
              <div className="space-y-2 text-sm">
                {bills
                  .filter((b) => b.status === "paid")
                  .slice(0, 4)
                  .map((b) => (
                    <div key={b.id} className="flex items-center gap-2">
                      <CheckCircle2 className="h-3.5 w-3.5 text-success shrink-0" />
                      <span className="flex-1 truncate text-muted-foreground">{b.description}</span>
                      <span className="text-xs">{brl(b.amount)}</span>
                    </div>
                  ))}
                {bills.filter((b) => b.status === "paid").length === 0 && (
                  <div className="text-xs text-muted-foreground">Nenhum pagamento registrado</div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
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
  icon: typeof Receipt;
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
