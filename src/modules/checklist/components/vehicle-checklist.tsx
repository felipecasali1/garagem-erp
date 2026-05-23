import { useMemo, useState } from "react";
import {
  CheckCircle2,
  Circle,
  Clock,
  PauseCircle,
  XCircle,
  Plus,
  Pencil,
  Trash2,
  ChevronDown,
  ChevronUp,
  Filter,
  Wrench,
  CheckCheck,
  CalendarDays,
  User as UserIcon,
  Sparkles,
} from "lucide-react";
import { Card, CardContent } from "@/shared/components/ui/card";
import { Button } from "@/shared/components/ui/button";
import { Badge } from "@/shared/components/ui/badge";
import { Progress } from "@/shared/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/shared/components/ui/alert-dialog";
import { cn } from "@/shared/lib/utils";
import { brl, fmtDate } from "@/shared/lib/format";
import {
  CATEGORY_LABEL,
  PRIORITY_META,
  STATUS_META,
  checklistStore,
  findEmployee,
  summarize,
  useChecklist,
  type ChecklistItem,
  type ChecklistPriority,
  type ChecklistStatus,
} from "@/modules/checklist";
import { ChecklistItemDialog } from "./checklist-item-dialog";
import { toast } from "sonner";

const STATUS_ICON: Record<ChecklistStatus, React.ComponentType<{ className?: string }>> = {
  pending: Circle,
  in_progress: Clock,
  waiting_parts: PauseCircle,
  completed: CheckCircle2,
  cancelled: XCircle,
};

export function VehicleChecklist({ vehicleId }: { vehicleId: number }) {
  const items = useChecklist(vehicleId);
  const [statusFilter, setStatusFilter] = useState<"all" | ChecklistStatus>("all");
  const [priorityFilter, setPriorityFilter] = useState<"all" | ChecklistPriority>("all");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ChecklistItem | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<ChecklistItem | null>(null);

  const summary = useMemo(() => summarize(items), [items]);

  const filtered = useMemo(() => {
    return items
      .filter((i) => statusFilter === "all" || i.status === statusFilter)
      .filter((i) => priorityFilter === "all" || i.priority === priorityFilter)
      .sort((a, b) => {
        const order: ChecklistStatus[] = [
          "in_progress",
          "waiting_parts",
          "pending",
          "completed",
          "cancelled",
        ];
        return order.indexOf(a.status) - order.indexOf(b.status);
      });
  }, [items, statusFilter, priorityFilter]);

  const openNew = () => {
    setEditing(null);
    setDialogOpen(true);
  };
  const openEdit = (item: ChecklistItem) => {
    setEditing(item);
    setDialogOpen(true);
  };

  const setStatus = (item: ChecklistItem, status: ChecklistStatus) => {
    checklistStore.update(item.id, { status });
    toast.success(`Status atualizado para "${STATUS_META[status].label}"`);
  };

  const remove = () => {
    if (!confirmDelete) return;
    checklistStore.remove(confirmDelete.id);
    toast.success("Item removido");
    setConfirmDelete(null);
  };

  return (
    <div className="space-y-4">
      {/* Summary */}
      <Card>
        <CardContent className="p-5 space-y-4">
          <div className="flex flex-col md:flex-row md:items-center gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <Wrench className="h-4 w-4 text-muted-foreground" />
                <h3 className="font-display font-semibold">Preparação do Veículo</h3>
                {summary.readyForSale && (
                  <Badge className="bg-success/15 text-success border-success/30 border" variant="outline">
                    <Sparkles className="h-3 w-3" /> Pronto para venda
                  </Badge>
                )}
                {summary.hasUrgent && (
                  <Badge className="bg-destructive/15 text-destructive border-destructive/30 border" variant="outline">
                    Urgente
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                {summary.completed} de {summary.total - summary.cancelled} tarefas concluídas
              </p>
            </div>
            <div className="flex gap-2 shrink-0">
              <Button size="sm" onClick={openNew}>
                <Plus className="h-4 w-4" /> Novo item
              </Button>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between text-xs mb-1.5">
              <span className="text-muted-foreground">Progresso</span>
              <span className="font-medium">{summary.progress}%</span>
            </div>
            <Progress value={summary.progress} className="h-2" />
          </div>

          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 pt-2 border-t border-border">
            <Stat label="Pendentes" value={String(summary.pending)} accent="text-warning" />
            <Stat label="Em andamento" value={String(summary.inProgress)} accent="text-info" />
            <Stat label="Aguardando peças" value={String(summary.waitingParts)} accent="text-orange-500" />
            <Stat label="Custo estimado" value={brl(summary.estimatedCost)} />
            <Stat label="Custo real" value={brl(summary.actualCost)} accent="text-foreground" />
          </div>
        </CardContent>
      </Card>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <Filter className="h-4 w-4 text-muted-foreground" />
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as "all" | ChecklistStatus)}>
          <SelectTrigger className="h-8 w-[180px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os status</SelectItem>
            {Object.entries(STATUS_META).map(([k, m]) => (
              <SelectItem key={k} value={k}>{m.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={priorityFilter} onValueChange={(v) => setPriorityFilter(v as "all" | ChecklistPriority)}>
          <SelectTrigger className="h-8 w-[180px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as prioridades</SelectItem>
            {Object.entries(PRIORITY_META).map(([k, m]) => (
              <SelectItem key={k} value={k}>{m.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {(statusFilter !== "all" || priorityFilter !== "all") && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setStatusFilter("all");
              setPriorityFilter("all");
            }}
          >
            Limpar
          </Button>
        )}
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center space-y-3">
            <div className="mx-auto h-12 w-12 rounded-full bg-muted flex items-center justify-center">
              <CheckCheck className="h-6 w-6 text-muted-foreground" />
            </div>
            <div>
              <h3 className="font-medium">Nenhum item no checklist</h3>
              <p className="text-sm text-muted-foreground">
                Adicione tarefas de preparação, reparo ou inspeção.
              </p>
            </div>
            <Button onClick={openNew} variant="outline" size="sm">
              <Plus className="h-4 w-4" /> Criar primeiro item
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((item) => {
            const isOpen = !!expanded[item.id];
            const StatusIcon = STATUS_ICON[item.status];
            const status = STATUS_META[item.status];
            const priority = PRIORITY_META[item.priority];
            const employee = findEmployee(item.responsible_employee_id);
            const isOverdue =
              item.due_date &&
              item.status !== "completed" &&
              item.status !== "cancelled" &&
              new Date(item.due_date) < new Date(new Date().toDateString());

            return (
              <Card
                key={item.id}
                className={cn(
                  "transition-colors hover:border-primary/30",
                  item.status === "completed" && "opacity-75",
                )}
              >
                <CardContent className="p-0">
                  <div className="p-4 flex items-start gap-3">
                    <button
                      type="button"
                      onClick={() =>
                        setStatus(
                          item,
                          item.status === "completed" ? "pending" : "completed",
                        )
                      }
                      className="mt-0.5 cursor-pointer"
                      title="Marcar como concluído"
                    >
                      <StatusIcon
                        className={cn(
                          "h-5 w-5",
                          item.status === "completed" ? "text-success" : "text-muted-foreground",
                        )}
                      />
                    </button>

                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={cn("h-1.5 w-1.5 rounded-full", priority.dot)} />
                        <h4
                          className={cn(
                            "font-medium text-sm",
                            item.status === "completed" && "line-through text-muted-foreground",
                          )}
                        >
                          {item.title}
                        </h4>
                        <Badge variant="outline" className={cn("border", status.cls)}>
                          {status.label}
                        </Badge>
                        <Badge variant="outline" className={cn("border", priority.cls)}>
                          {priority.label}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          · {CATEGORY_LABEL[item.category]}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1.5 text-xs text-muted-foreground">
                        {item.due_date && (
                          <span
                            className={cn(
                              "inline-flex items-center gap-1",
                              isOverdue && "text-destructive font-medium",
                            )}
                          >
                            <CalendarDays className="h-3.5 w-3.5" />
                            {fmtDate(item.due_date)}
                            {isOverdue && " (atrasado)"}
                          </span>
                        )}
                        {employee && (
                          <span className="inline-flex items-center gap-1">
                            <UserIcon className="h-3.5 w-3.5" /> {employee.person.name}
                          </span>
                        )}
                        <span>
                          Estimado: <span className="font-medium text-foreground">{brl(item.estimated_cost)}</span>
                        </span>
                        {item.actual_cost > 0 && (
                          <span>
                            Real: <span className="font-medium text-foreground">{brl(item.actual_cost)}</span>
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => setExpanded((s) => ({ ...s, [item.id]: !isOpen }))}
                      >
                        {isOpen ? (
                          <ChevronUp className="h-4 w-4" />
                        ) : (
                          <ChevronDown className="h-4 w-4" />
                        )}
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => openEdit(item)}>
                            <Pencil className="h-3.5 w-3.5" /> Editar
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          {(Object.keys(STATUS_META) as ChecklistStatus[])
                            .filter((s) => s !== item.status)
                            .map((s) => (
                              <DropdownMenuItem key={s} onClick={() => setStatus(item, s)}>
                                Marcar como {STATUS_META[s].label}
                              </DropdownMenuItem>
                            ))}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={() => setConfirmDelete(item)}
                          >
                            <Trash2 className="h-3.5 w-3.5" /> Excluir
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>

                  {isOpen && (
                    <div className="border-t border-border p-4 grid grid-cols-1 md:grid-cols-2 gap-4 bg-muted/20">
                      <DetailField label="Descrição" value={item.description ?? "—"} />
                      <DetailField label="Notas internas" value={item.notes ?? "—"} />
                      <DetailField
                        label="Conclusão"
                        value={item.completion_date ? fmtDate(item.completion_date) : "—"}
                      />
                      <DetailField
                        label="Atualizado em"
                        value={fmtDate(item.updated_at.slice(0, 10))}
                      />
                      <DetailField
                        label="Anexos"
                        value="Nenhum anexo (em breve)"
                      />
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <ChecklistItemDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        vehicleId={vehicleId}
        item={editing}
      />

      <AlertDialog open={!!confirmDelete} onOpenChange={(v) => !v && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir item?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. O item "{confirmDelete?.title}" será removido do checklist.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={remove}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={cn("font-display text-lg font-semibold", accent)}>{value}</div>
    </div>
  );
}

function DetailField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-sm mt-0.5 whitespace-pre-wrap">{value}</div>
    </div>
  );
}
