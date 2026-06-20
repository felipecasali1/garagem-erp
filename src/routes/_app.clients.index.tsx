import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Eye, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { PageHeader } from "@/shared/components/layout/page-header";
import { Card } from "@/shared/components/ui/card";
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
import { brl, fmtDate, initials } from "@/shared/lib/format";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/components/ui/table";
import { toast } from "sonner";
import {
  customerKeys,
  deleteCustomer,
  listCustomers,
} from "@/modules/customers/services/customers";

export const Route = createFileRoute("/_app/clients/")({
  head: () => ({ meta: [{ title: "Clientes | GaragemERP" }] }),
  component: ClientsPage,
});

function ClientsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: customers = [], isLoading } = useQuery({
    queryKey: customerKeys.all,
    queryFn: listCustomers,
  });

  const deleteMutation = useMutation({
    mutationFn: deleteCustomer,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: customerKeys.all });
      toast.success("Cliente removido");
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Falha ao excluir cliente.");
    },
  });

  return (
    <div className="max-w-[1600px] mx-auto">
      <PageHeader
        title="Clientes"
        description={
          isLoading ? "Carregando clientes..." : `${customers.length} clientes cadastrados`
        }
        action={{ label: "Novo Cliente", to: "/clients/new" }}
      />
      <Card>
        {isLoading ? (
          <div className="p-8 text-sm text-muted-foreground">Carregando clientes...</div>
        ) : customers.length === 0 ? (
          <div className="p-12 text-center space-y-2">
            <h3 className="font-display font-semibold">Nenhum cliente cadastrado</h3>
            <p className="text-sm text-muted-foreground">
              Cadastre o primeiro cliente para começar a usar o módulo.
            </p>
            <Button asChild>
              <Link to="/clients/new">Novo Cliente</Link>
            </Button>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cliente</TableHead>
                <TableHead>CPF/CNPJ</TableHead>
                <TableHead>Telefone</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Total Compras</TableHead>
                <TableHead>Cadastro</TableHead>
                <TableHead>Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {customers.map((c) => (
                <TableRow
                  key={c.id}
                  onClick={() => navigate({ to: "/clients/$id", params: { id: String(c.id) } })}
                  className="cursor-pointer"
                >
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Avatar className="h-8 w-8">
                        <AvatarFallback className="text-xs bg-muted">
                          {initials(c.person.name)}
                        </AvatarFallback>
                      </Avatar>
                      <span className="font-medium">{c.person.name}</span>
                    </div>
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {c.person.cpf ?? c.person.cnpj}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{c.person.phone}</TableCell>
                  <TableCell className="text-muted-foreground">{c.person.email}</TableCell>
                  <TableCell className="text-muted-foreground">{brl(c.total_purchases)}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {fmtDate(c.created_at)}
                  </TableCell>
                  <TableCell onClick={(ev) => ev.stopPropagation()}>
                    <div className="flex gap-1">
                      <Button size="icon" variant="ghost" aria-label="Ver" asChild>
                        <Link to="/clients/$id" params={{ id: String(c.id) }}>
                          <Eye className="h-4 w-4" />
                        </Link>
                      </Button>
                      <Button size="icon" variant="ghost" aria-label="Editar" asChild>
                        <Link to="/clients/edit/$id" params={{ id: String(c.id) }}>
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
                                to: "/clients/$id",
                                params: { id: String(c.id) },
                              })
                            }
                          >
                            <Eye className="h-4 w-4" /> Ver detalhes
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() =>
                              navigate({
                                to: "/clients/edit/$id",
                                params: { id: String(c.id) },
                              })
                            }
                          >
                            <Pencil className="h-4 w-4" /> Editar
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={() => deleteMutation.mutate(c.id)}
                          >
                            <Trash2 className="h-4 w-4" /> Remover
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
    </div>
  );
}
