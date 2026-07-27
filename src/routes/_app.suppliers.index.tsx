import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Eye, MoreHorizontal, Pencil, Power, PowerOff, Truck } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/shared/components/layout/page-header";
import { Card } from "@/shared/components/ui/card";
import { Button } from "@/shared/components/ui/button";
import { Badge } from "@/shared/components/ui/badge";
import { Avatar, AvatarFallback } from "@/shared/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/components/ui/table";
import { ConfirmActionDialog } from "@/shared/components/confirm-action-dialog";
import { formatDocument, formatPhone } from "@/shared/lib/field-format";
import { fmtDate, initials } from "@/shared/lib/format";
import {
  listSuppliers,
  setSupplierActive,
  supplierKeys,
} from "@/modules/suppliers/services/suppliers";
import { getSupplierTypeLabel } from "@/modules/suppliers/components/supplier-form";

export const Route = createFileRoute("/_app/suppliers/")({
  head: () => ({ meta: [{ title: "Fornecedores | GaragemERP" }] }),
  component: SuppliersPage,
});

function SuppliersPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [confirmStatus, setConfirmStatus] = useState<{
    id: number;
    active: boolean;
  } | null>(null);
  const { data: suppliers = [], isLoading } = useQuery({
    queryKey: supplierKeys.all,
    queryFn: listSuppliers,
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, active }: { id: number; active: boolean }) => setSupplierActive(id, active),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: supplierKeys.all });
      toast.success("Status do fornecedor atualizado");
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Falha ao atualizar fornecedor.");
    },
  });

  return (
    <div className="max-w-[1600px] mx-auto">
      <PageHeader
        title="Fornecedores"
        description={
          isLoading
            ? "Carregando fornecedores..."
            : `${suppliers.length} fornecedores cadastrados`
        }
        action={{ label: "Novo Fornecedor", to: "/suppliers/new" }}
      />
      <Card>
        {isLoading ? (
          <div className="p-8 text-sm text-muted-foreground">Carregando fornecedores...</div>
        ) : suppliers.length === 0 ? (
          <div className="p-12 text-center space-y-2">
            <Truck className="mx-auto h-8 w-8 text-muted-foreground" />
            <h3 className="font-display font-semibold">Nenhum fornecedor cadastrado</h3>
            <p className="text-sm text-muted-foreground">
              Cadastre pessoas ou empresas que vendem veículos para a loja.
            </p>
            <Button asChild>
              <Link to="/suppliers/new">Novo Fornecedor</Link>
            </Button>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fornecedor</TableHead>
                <TableHead>Origem / categoria</TableHead>
                <TableHead>CPF/CNPJ</TableHead>
                <TableHead>Telefone</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Cadastro</TableHead>
                <TableHead>Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {suppliers.map((supplier) => (
                <TableRow
                  key={supplier.id}
                  onClick={() =>
                    navigate({ to: "/suppliers/$id", params: { id: String(supplier.id) } })
                  }
                  className="cursor-pointer"
                >
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Avatar className="h-8 w-8">
                        <AvatarFallback className="text-xs bg-muted">
                          {initials(supplier.person.name)}
                        </AvatarFallback>
                      </Avatar>
                      <span className="font-medium">{supplier.person.name}</span>
                      {!supplier.active && <Badge variant="outline">Arquivado</Badge>}
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {getSupplierTypeLabel(supplier.supplier_type)}
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {formatDocument(
                      supplier.person.cpf ?? supplier.person.cnpj ?? "",
                      supplier.person.type,
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatPhone(supplier.person.phone)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{supplier.person.email}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {fmtDate(supplier.created_at)}
                  </TableCell>
                  <TableCell onClick={(event) => event.stopPropagation()}>
                    <div className="flex gap-1">
                      <Button size="icon" variant="ghost" aria-label="Ver" asChild>
                        <Link to="/suppliers/$id" params={{ id: String(supplier.id) }}>
                          <Eye className="h-4 w-4" />
                        </Link>
                      </Button>
                      <Button size="icon" variant="ghost" aria-label="Editar" asChild>
                        <Link to="/suppliers/edit/$id" params={{ id: String(supplier.id) }}>
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
                            onClick={() =>
                              navigate({
                                to: "/suppliers/$id",
                                params: { id: String(supplier.id) },
                              })
                            }
                          >
                            <Eye className="h-4 w-4" /> Ver detalhes
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() =>
                              navigate({
                                to: "/suppliers/edit/$id",
                                params: { id: String(supplier.id) },
                              })
                            }
                          >
                            <Pencil className="h-4 w-4" /> Editar
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onSelect={() =>
                              setConfirmStatus({ id: supplier.id, active: !supplier.active })
                            }
                          >
                            {supplier.active ? (
                              <PowerOff className="h-4 w-4" />
                            ) : (
                              <Power className="h-4 w-4" />
                            )}
                            {supplier.active ? "Arquivar" : "Reativar"}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
      <ConfirmActionDialog
        open={confirmStatus != null}
        onOpenChange={(open) => {
          if (!open) setConfirmStatus(null);
        }}
        title={confirmStatus?.active ? "Reativar fornecedor?" : "Arquivar fornecedor?"}
        description={
          confirmStatus?.active
            ? "O fornecedor voltará a aparecer como ativo nas compras."
            : "O fornecedor será preservado no histórico, mas deixará de aparecer como ativo em novas compras."
        }
        confirmLabel={statusMutation.isPending ? "Atualizando..." : "Confirmar"}
        confirmDisabled={statusMutation.isPending || confirmStatus == null}
        onConfirm={() => {
          if (confirmStatus == null) return;
          const next = confirmStatus;
          setConfirmStatus(null);
          statusMutation.mutate(next);
        }}
      />
    </div>
  );
}
