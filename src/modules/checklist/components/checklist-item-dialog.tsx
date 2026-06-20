import { useEffect, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Textarea } from "@/shared/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { DatePicker } from "@/shared/components/ui/date-picker";
import { toast } from "sonner";
import {
  CATEGORY_LABEL,
  checklistKeys,
  createChecklistItem,
  PRIORITY_META,
  STATUS_META,
  type ChecklistCategory,
  type ChecklistItem,
  type ChecklistPriority,
  type ChecklistStatus,
  updateChecklistItem,
} from "@/modules/checklist";
import { employeeKeys, listActiveEmployees } from "@/modules/employees/services/employees";

const schema = z.object({
  title: z.string().trim().min(2, "Título obrigatório").max(120),
  description: z.string().max(500).optional(),
  category: z.enum([
    "mechanical",
    "bodywork",
    "cleaning",
    "tires",
    "oil_change",
    "documentation",
    "electrical",
    "accessories",
    "marketplace",
    "photography",
    "inspection",
    "maintenance",
    "fueling",
    "washing",
    "notes",
  ]),
  status: z.enum(["pending", "in_progress", "waiting_parts", "completed", "cancelled"]),
  priority: z.enum(["low", "medium", "high", "urgent"]),
  estimated_cost: z.coerce.number().min(0),
  actual_cost: z.coerce.number().min(0),
  due_date: z.string().optional(),
  responsible_employee_id: z.string().optional(),
  notes: z.string().max(500).optional(),
});

type FormValues = z.infer<typeof schema>;

export function ChecklistItemDialog({
  open,
  onOpenChange,
  vehicleId,
  item,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  vehicleId: number;
  item?: ChecklistItem | null;
}) {
  const form = useForm<FormValues>({
    resolver: zodResolver(schema) as never,
    defaultValues: {
      title: "",
      description: "",
      category: "mechanical",
      status: "pending",
      priority: "medium",
      estimated_cost: 0,
      actual_cost: 0,
      due_date: undefined,
      responsible_employee_id: undefined,
      notes: "",
    },
  });
  const queryClient = useQueryClient();
  const { data: employees = [] } = useQuery({
    queryKey: employeeKeys.active,
    queryFn: listActiveEmployees,
  });
  const invalidateChecklist = async () => {
    await queryClient.invalidateQueries({ queryKey: checklistKeys.all });
    await queryClient.invalidateQueries({ queryKey: checklistKeys.byVehicle(vehicleId) });
  };
  const createMutation = useMutation({
    mutationFn: createChecklistItem,
    onSuccess: async () => {
      await invalidateChecklist();
      toast.success("Item adicionado ao checklist");
      onOpenChange(false);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Falha ao adicionar item.");
    },
  });
  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Partial<ChecklistItem> }) =>
      updateChecklistItem(id, payload),
    onSuccess: async () => {
      await invalidateChecklist();
      toast.success("Item atualizado");
      onOpenChange(false);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Falha ao atualizar item.");
    },
  });

  useEffect(() => {
    if (open) {
      form.reset({
        title: item?.title ?? "",
        description: item?.description ?? "",
        category: (item?.category ?? "mechanical") as ChecklistCategory,
        status: (item?.status ?? "pending") as ChecklistStatus,
        priority: (item?.priority ?? "medium") as ChecklistPriority,
        estimated_cost: item?.estimated_cost ?? 0,
        actual_cost: item?.actual_cost ?? 0,
        due_date: item?.due_date,
        responsible_employee_id: item?.responsible_employee_id
          ? String(item.responsible_employee_id)
          : undefined,
        notes: item?.notes ?? "",
      });
    }
  }, [open, item, form]);

  const submit = form.handleSubmit((values) => {
    const payload = {
      vehicle_id: vehicleId,
      title: values.title,
      description: values.description || undefined,
      category: values.category,
      status: values.status,
      priority: values.priority,
      estimated_cost: Number(values.estimated_cost) || 0,
      actual_cost: Number(values.actual_cost) || 0,
      due_date: values.due_date || undefined,
      responsible_employee_id: values.responsible_employee_id
        ? Number(values.responsible_employee_id)
        : undefined,
      notes: values.notes || undefined,
      attachments: item?.attachments ?? [],
    };
    if (item) {
      updateMutation.mutate({
        id: item.id,
        payload: {
          ...payload,
          completion_date:
            values.status === "completed"
              ? (item.completion_date ?? new Date().toISOString().slice(0, 10))
              : undefined,
        },
      });
    } else {
      createMutation.mutate({
        ...payload,
        completion_date:
          values.status === "completed" ? new Date().toISOString().slice(0, 10) : undefined,
        attachments: [],
      });
    }
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.stopPropagation();
    void submit(event);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{item ? "Editar item" : "Novo item de checklist"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label>
              Título <span className="text-destructive">*</span>
            </Label>
            <Input placeholder="Ex.: Reparo do alternador" {...form.register("title")} />
            {form.formState.errors.title && (
              <p className="text-xs text-destructive">{form.formState.errors.title.message}</p>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Field label="Categoria">
              <Select
                value={form.watch("category")}
                onValueChange={(v) => form.setValue("category", v as ChecklistCategory)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(CATEGORY_LABEL).map(([k, label]) => (
                    <SelectItem key={k} value={k}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Status">
              <Select
                value={form.watch("status")}
                onValueChange={(v) => form.setValue("status", v as ChecklistStatus)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(STATUS_META).map(([k, m]) => (
                    <SelectItem key={k} value={k}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Prioridade">
              <Select
                value={form.watch("priority")}
                onValueChange={(v) => form.setValue("priority", v as ChecklistPriority)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(PRIORITY_META).map(([k, m]) => (
                    <SelectItem key={k} value={k}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="Custo estimado (R$)">
              <Input type="number" step="0.01" min="0" {...form.register("estimated_cost")} />
            </Field>
            <Field label="Custo real (R$)">
              <Input type="number" step="0.01" min="0" {...form.register("actual_cost")} />
            </Field>
            <Field label="Prazo">
              <DatePicker
                value={form.watch("due_date")}
                onChange={(v) => form.setValue("due_date", v)}
              />
            </Field>
            <Field label="Responsável">
              <Select
                value={form.watch("responsible_employee_id") ?? ""}
                onValueChange={(v) => form.setValue("responsible_employee_id", v || undefined)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecionar funcionário" />
                </SelectTrigger>
                <SelectContent>
                  {employees.length === 0 ? (
                    <SelectItem value="__none__" disabled>
                      Nenhum funcionário ativo disponível
                    </SelectItem>
                  ) : (
                    employees.map((employee) => (
                      <SelectItem key={employee.id} value={String(employee.id)}>
                        {employee.person.name} — {employee.position}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </Field>
          </div>

          <Field label="Descrição">
            <Textarea
              rows={3}
              placeholder="Detalhes da tarefa..."
              {...form.register("description")}
            />
          </Field>

          <Field label="Notas internas">
            <Textarea rows={2} placeholder="Observações internas..." {...form.register("notes")} />
          </Field>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit">{item ? "Salvar alterações" : "Adicionar item"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs uppercase tracking-wide text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
