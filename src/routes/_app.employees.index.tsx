import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Eye, MoreHorizontal, Pencil, Trash2, Power, PowerOff } from "lucide-react";
import { PageHeader } from "@/shared/components/layout/page-header";
import { Card, CardContent } from "@/shared/components/ui/card";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/shared/components/ui/avatar";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/components/ui/table";
import { toast } from "sonner";
import { ConfirmActionDialog } from "@/shared/components/confirm-action-dialog";
import { brl, fmtDate, initials } from "@/shared/lib/format";
import {
  employeeKeys,
  deleteEmployee,
  listEmployees,
  setEmployeeActive,
} from "@/modules/employees/services/employees";
import type { EmployeeRecord } from "@/modules/employees/services/employees";

export const Route = createFileRoute("/_app/employees/")({
  head: () => ({ meta: [{ title: "Funcionários | GaragemERP" }] }),
  component: EmployeesPage,
});

function EmployeesPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);
  const [confirmToggle, setConfirmToggle] = useState<{
    id: number;
    nextActive: boolean;
  } | null>(null);
  const { data: employees = [], isLoading } = useQuery({
    queryKey: employeeKeys.all,
    queryFn: listEmployees,
  });
  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: employeeKeys.all });
    await queryClient.invalidateQueries({ queryKey: employeeKeys.active });
  };
  const toggleMutation = useMutation({
    mutationFn: ({ id, active }: { id: number; active: boolean }) => setEmployeeActive(id, active),
    onSuccess: async () => {
      await invalidate();
      toast.success("Status do funcionário atualizado");
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Falha ao atualizar status.");
    },
  });
  const deleteMutation = useMutation({
    mutationFn: deleteEmployee,
    onSuccess: async () => {
      await invalidate();
      toast.success("Funcionário removido");
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Falha ao excluir funcionário.");
    },
  });

  return (
    <div className="max-w-[1600px] mx-auto">
      <PageHeader
        title="Funcionários"
        description={`${employees.length} colaboradores`}
        action={{ label: "Novo Funcionário", to: "/employees/new" }}
      />

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-sm text-muted-foreground">Carregando funcionários...</div>
          ) : employees.length === 0 ? (
            <div className="p-12 text-center space-y-2">
              <h3 className="font-display font-semibold">Nenhum funcionário cadastrado</h3>
              <p className="text-sm text-muted-foreground">
                Crie o primeiro colaborador para começar a usar o módulo.
              </p>
              <Button asChild>
                <Link to="/employees/new">Novo Funcionário</Link>
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Funcionário</TableHead>
                  <TableHead>Cargo</TableHead>
                  <TableHead>Comissão</TableHead>
                  <TableHead>Contratação</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Usuário</TableHead>
                  <TableHead>Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {employees.map((employee) => (
                  <EmployeeRow
                    key={employee.id}
                    employee={employee}
                    navigate={navigate}
                    onToggleActive={() =>
                      setConfirmToggle({ id: employee.id, nextActive: !employee.active })
                    }
                    onDelete={() => setConfirmDelete(employee.id)}
                  />
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
      <ConfirmActionDialog
        open={confirmDelete != null}
        onOpenChange={(open) => {
          if (!open) setConfirmDelete(null);
        }}
        title="Excluir funcionário?"
        description="Esta ação não pode ser desfeita. O funcionário será removido permanentemente do sistema."
        confirmLabel={deleteMutation.isPending ? "Excluindo..." : "Excluir"}
        confirmDisabled={deleteMutation.isPending || confirmDelete == null}
        onConfirm={() => {
          if (confirmDelete == null) return;
          const id = confirmDelete;
          setConfirmDelete(null);
          deleteMutation.mutate(id);
        }}
      />
      <ConfirmActionDialog
        open={confirmToggle != null}
        onOpenChange={(open) => {
          if (!open) setConfirmToggle(null);
        }}
        title={confirmToggle?.nextActive ? "Ativar funcionário?" : "Desativar funcionário?"}
        description={
          confirmToggle?.nextActive
            ? "O funcionário voltará a aparecer como ativo no sistema."
            : "O funcionário deixará de aparecer como ativo e o acesso interno também será desativado."
        }
        confirmLabel={toggleMutation.isPending ? "Atualizando..." : "Confirmar"}
        confirmDisabled={toggleMutation.isPending || confirmToggle == null}
        onConfirm={() => {
          if (confirmToggle == null) return;
          const next = confirmToggle;
          setConfirmToggle(null);
          toggleMutation.mutate({ id: next.id, active: next.nextActive });
        }}
      />
    </div>
  );
}

function EmployeeRow({
  employee,
  navigate,
  onToggleActive,
  onDelete,
}: {
  employee: EmployeeRecord;
  navigate: ReturnType<typeof useNavigate>;
  onToggleActive: () => void;
  onDelete: () => void;
}) {
  return (
    <TableRow
      onClick={() => navigate({ to: "/employees/$id", params: { id: String(employee.id) } })}
      className="cursor-pointer"
    >
      <TableCell>
        <div className="flex items-center gap-2">
          <Avatar className="h-9 w-9">
            <AvatarFallback className="text-xs bg-primary/10 text-primary">
              {initials(employee.person.name)}
            </AvatarFallback>
          </Avatar>
          <div>
            <div className="font-medium">{employee.person.name}</div>
            <div className="text-xs text-muted-foreground">{employee.person.email}</div>
          </div>
        </div>
      </TableCell>
      <TableCell>{employee.position}</TableCell>
      <TableCell>
        <Badge variant="outline">
          {employee.commission_type === "percentage" ? "Percentual" : "Fixo"}
        </Badge>
      </TableCell>
      <TableCell className="text-muted-foreground text-sm">{fmtDate(employee.hired_at)}</TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          <span
            className={`h-2 w-2 rounded-full ${employee.active ? "bg-success" : "bg-muted-foreground"}`}
          />
          <span className="text-sm">{employee.active ? "Ativo" : "Inativo"}</span>
        </div>
      </TableCell>
      <TableCell>
        {employee.access_role ? (
          <Badge variant="outline">{employee.access_role}</Badge>
        ) : (
          <span className="text-xs text-muted-foreground">Sem acesso vinculado</span>
        )}
      </TableCell>
      <TableCell onClick={(event) => event.stopPropagation()}>
        <div className="flex gap-1">
          <Button size="icon" variant="ghost" aria-label={`Ver ${employee.person.name}`} asChild>
            <Link to="/employees/$id" params={{ id: String(employee.id) }}>
              <Eye className="h-4 w-4" />
            </Link>
          </Button>
          <Button size="icon" variant="ghost" aria-label={`Editar ${employee.person.name}`} asChild>
            <Link to="/employees/edit/$id" params={{ id: String(employee.id) }}>
              <Pencil className="h-4 w-4" />
            </Link>
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="icon" variant="ghost" aria-label="Mais ações">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuLabel>Ações</DropdownMenuLabel>
              <DropdownMenuItem
                onSelect={() =>
                  navigate({ to: "/employees/$id", params: { id: String(employee.id) } })
                }
              >
                <Eye className="h-4 w-4" /> Ver detalhes
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() =>
                  navigate({ to: "/employees/edit/$id", params: { id: String(employee.id) } })
                }
              >
                <Pencil className="h-4 w-4" /> Editar
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={onToggleActive}>
                {employee.active ? <PowerOff className="h-4 w-4" /> : <Power className="h-4 w-4" />}
                {employee.active ? "Desativar" : "Ativar"}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onSelect={onDelete}
              >
                <Trash2 className="h-4 w-4" /> Excluir
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </TableCell>
    </TableRow>
  );
}
